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

    WebSocketRuntime.instance = this;
  }

  static getInstance(url) {
    if (!WebSocketRuntime.instance) {
      WebSocketRuntime.instance = new WebSocketRuntime(url);
    }
    return WebSocketRuntime.instance;
  }

  connect() {
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
      // Pass token via Sec-WebSocket-Protocol (browser translates second arg to this header)
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

  handleOpen() {
    this.reconnectAttempts = 0;
    this._resetHeartbeat();
    this._startAckLoop();

    useTransportStore.getState().transitionState(TransportState.CONNECTED);
    useTransportStore.getState().setSyncing(true);

    // Strict Reconnect Ordering (Step 1 Complete: Websocket Reconnected)
    // Step 2: Request Replay Reconciliation
    const { replayCursor } = useTransportStore.getState();
    this.send({
      type: 'SYNC',
      last_sequence: replayCursor,
    });
    // Note: Queue drain is deferred until SYNC_COMPLETE arrives
  }

  async handleMessage(event) {
    this._resetHeartbeat(); // Any message resets heartbeat
    
    try {
      const data = JSON.parse(event.data);

      if (data.connection_id && data.stream_instance_id) {
        // Connection Identity Ack from server (often sent right after connection)
        useTransportStore.getState().setConnectionIdentity(data);
        return;
      }

      if (data.type === 'SYNC_COMPLETE') {
        this.isRebuilding = true;
        import('../../store/projectionCoordinator').then(({ useProjectionCoordinator }) => {
          import('../../store/mutationCoordinator').then(async ({ useMutationCoordinator }) => {
            // Step 3: Projection Rebuild
            await useProjectionCoordinator.getState().flushInvalidations();
            
            // Step 4: Advance Replay Watermark (handled by sequence ingestion if SYNC_COMPLETE has it)
            if (data.last_sequence !== undefined) {
              useTransportStore.getState().setReplayCursor(data.last_sequence);
            }
            
            // Process buffered events that arrived during rebuild
            const buffer = [...this.eventBuffer];
            this.eventBuffer = [];
            this.isRebuilding = false;
            
            for (const bufferedEvent of buffer) {
              useTransportStore.getState().processEventEnvelope(bufferedEvent);
            }

            useTransportStore.getState().setSyncing(false);
            
            // Step 5: THEN begin queue drain
            useMutationCoordinator.getState().drainQueue();
          });
        });
        return;
      }

      if (data.event_sequence !== undefined) {
        if (this.isRebuilding) {
          // Late Frame Racing: Buffer events that arrive while SYNC_COMPLETE rebuild is in-flight
          this.eventBuffer.push(data);
          console.info(`[WebSocketRuntime] Buffered late frame ${data.event_sequence} during active rebuild`);
          return;
        }
        // Deterministic Event Envelope
        useTransportStore.getState().processEventEnvelope(data);
      }
    } catch (err) {
      console.error('[WebSocketRuntime] Failed to parse incoming message', err);
    }
  }

  handleClose(event) {
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
    console.error('[WebSocketRuntime] Transport Error:', error);
    // WS API doesn't provide rich error objects, the close event usually follows immediately.
  }

  send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  scheduleReconnect() {
    const { transitionState } = useTransportStore.getState();
    transitionState(TransportState.RECONNECTING);

    const delay = Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY
    );

    this.reconnectAttempts++;
    console.info(`[WebSocketRuntime] Reconnecting in ${delay}ms (Attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  _startAckLoop() {
    if (this.ackInterval) clearInterval(this.ackInterval);
    
    this.ackInterval = setInterval(() => {
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
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    
    this.heartbeatTimer = setTimeout(() => {
      console.warn('[WebSocketRuntime] Heartbeat timeout. Server unresponsive. Reconnecting...');
      if (this.ws) {
        // Forcibly close to trigger handleClose and reconnect
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
