import { useTransportStore, TransportState } from '../../store/transportStore';
import { useRuntimeAuthStore } from '../../store/runtimeAuthStore';

// Constants
const HEARTBEAT_TIMEOUT = 35000; // 35 seconds (server pings every 30)
const ACK_INTERVAL = 5000; // 5 seconds
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

export class WebSocketRuntime {
  static instance = null;

  constructor(url) {
    if (WebSocketRuntime.instance) {
      return WebSocketRuntime.instance;
    }
    
    this.url = url;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.ackInterval = null;
    this.intendedDisconnect = false;
    this.isRebuilding = false;
    this.eventBuffer = [];
    this.isDisposed = false; // Lifecycle guard flag

    WebSocketRuntime.instance = this;
  }

  static getInstance(url) {
    if (!WebSocketRuntime.instance) {
      WebSocketRuntime.instance = new WebSocketRuntime(url);
    }
    return WebSocketRuntime.instance;
  }

  connect() {
    if (this.isDisposed) {
      console.warn('[WebSocketRuntime] Cannot connect — runtime is disposed.');
      return;
    }

    const { state, transitionState } = useTransportStore.getState();
    
    if (state === TransportState.CONNECTED || state === TransportState.CONNECTING) {
      return;
    }

    this.intendedDisconnect = false;
    transitionState(
      this.reconnectAttempts > 0 ? TransportState.RECONNECTING : TransportState.CONNECTING
    );

    const { runtimeJwt } = useRuntimeAuthStore.getState();
    const token = runtimeJwt || this._getQrTokenFromUrl();

    if (!token) {
      console.error('[WebSocketRuntime] No auth token available. Connection aborted.');
      transitionState(TransportState.FAILED, { reason: 'NO_AUTH_TOKEN' });
      return;
    }

    transitionState(TransportState.AUTHENTICATING);

    try {
      this.ws = new WebSocket(this.url, [token]);

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
    } catch (err) {
      this.handleError(err);
    }
  }

  disconnect() {
    this.intendedDisconnect = true;
    this._cleanupTimers();
    if (this.ws) {
      this.ws.close(1000, 'Intentional Disconnect');
      this.ws = null;
    }
    useTransportStore.getState().transitionState(TransportState.DISCONNECTED);
    useTransportStore.getState().cleanupTransport();
  }

  // ── Centralized Runtime Disposal ──
  disposeTransport() {
    if (this.isDisposed) return;
    console.warn('[WebSocketRuntime] 🛑 Disposing transport runtime...');
    
    // 1. Mark as disposed immediately to intercept all async callbacks
    this.isDisposed = true;
    
    // 2. Disconnect and release connection resources
    this.disconnect();
    
    // 3. Clear transient state
    this.eventBuffer = [];
    
    // 4. Clear instance reference to prevent memory leaks
    if (WebSocketRuntime.instance === this) {
      WebSocketRuntime.instance = null;
    }
    console.info('[WebSocketRuntime] ✅ Transport disposed.');
  }

  handleOpen() {
    if (this.isDisposed) {
      this.disconnect();
      return;
    }
    
    this.reconnectAttempts = 0;
    this._resetHeartbeat();
    this._startAckLoop();

    useTransportStore.getState().transitionState(TransportState.CONNECTED);
    useTransportStore.getState().setSyncing(true);

    const { replayCursor } = useTransportStore.getState();
    this.send({
      type: 'SYNC',
      last_sequence: replayCursor,
    });
  }

  async handleMessage(event) {
    if (this.isDisposed) return;
    
    this._resetHeartbeat();
    
    try {
      const data = JSON.parse(event.data);

      if (data.connection_id && data.stream_instance_id) {
        useTransportStore.getState().setConnectionIdentity(data);
        return;
      }

      if (data.type === 'SYNC_COMPLETE') {
        this.isRebuilding = true;
        import('../../store/projectionCoordinator').then(({ useProjectionCoordinator }) => {
          import('../../store/mutationCoordinator').then(async ({ useMutationCoordinator }) => {
            if (this.isDisposed) return; // double-check after dynamic import
            
            await useProjectionCoordinator.getState().flushInvalidations();
            
            if (data.last_sequence !== undefined) {
              useTransportStore.getState().setReplayCursor(data.last_sequence);
            }
            
            const buffer = [...this.eventBuffer];
            this.eventBuffer = [];
            this.isRebuilding = false;
            
            for (const bufferedEvent of buffer) {
              if (!this.isDisposed) {
                useTransportStore.getState().processEventEnvelope(bufferedEvent);
              }
            }

            if (!this.isDisposed) {
              useTransportStore.getState().setSyncing(false);
              useMutationCoordinator.getState().drainQueue();
            }
          });
        });
        return;
      }

      if (data.event_sequence !== undefined) {
        if (this.isRebuilding) {
          this.eventBuffer.push(data);
          return;
        }
        useTransportStore.getState().processEventEnvelope(data);
      }
    } catch (err) {
      console.error('[WebSocketRuntime] Failed to parse incoming message', err);
    }
  }

  handleClose(event) {
    if (this.isDisposed) return;
    
    this._cleanupTimers();
    this.ws = null;

    if (this.intendedDisconnect) {
      console.info('[WebSocketRuntime] Intentionally disconnected.');
      return;
    }

    console.warn(`[WebSocketRuntime] Connection closed: Code ${event.code}`);
    this.scheduleReconnect();
  }

  handleError(error) {
    if (this.isDisposed) return;
    console.error('[WebSocketRuntime] Transport Error:', error);
  }

  send(payload) {
    if (this.isDisposed) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  scheduleReconnect() {
    if (this.isDisposed) return;
    
    const { transitionState } = useTransportStore.getState();
    transitionState(TransportState.RECONNECTING);

    const delay = Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY
    );

    this.reconnectAttempts++;
    console.info(`[WebSocketRuntime] Reconnecting in ${delay}ms (Attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      if (!this.isDisposed) {
        this.connect();
      }
    }, delay);
  }

  _startAckLoop() {
    if (this.isDisposed) return;
    
    if (this.ackInterval) clearInterval(this.ackInterval);
    
    this.ackInterval = setInterval(() => {
      if (this.isDisposed) {
        this._cleanupTimers();
        return;
      }
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const { replayCursor } = useTransportStore.getState();
        this.send({
          type: 'ACK',
          last_received_sequence: replayCursor
        });
      }
    }, ACK_INTERVAL);
  }

  _resetHeartbeat() {
    if (this.isDisposed) return;
    
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    
    this.heartbeatTimer = setTimeout(() => {
      if (this.isDisposed) return;
      
      console.warn('[WebSocketRuntime] Heartbeat timeout. Server unresponsive. Reconnecting...');
      if (this.ws) {
        this.ws.close(4000, 'Heartbeat Timeout');
      }
    }, HEARTBEAT_TIMEOUT);
  }

  _cleanupTimers() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    if (this.ackInterval) clearInterval(this.ackInterval);
  }

  _getQrTokenFromUrl() {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get('session_token');
  }
}

// ─── HMR Cleanup Hook ────────────────────────────────────────────────────────
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (WebSocketRuntime.instance) {
      WebSocketRuntime.instance.disposeTransport();
    }
  });
}
