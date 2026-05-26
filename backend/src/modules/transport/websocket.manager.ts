import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import crypto from 'crypto';
import { logger } from '../../shared/utils/logger';
import { RuntimeAuthService } from '../auth/services/runtime-auth.service';
import { validateSessionToken } from '../tables/qr/qr.service';
import { logTransportAudit } from './transport-audit.repository';
import type { ConnectionIdentity, EventEnvelope } from './transport.contracts';

// ============================================================
// Deterministic Transport Governance (Single Node)
// ============================================================

export class WebSocketManager {
  private static instance: WebSocketManager;
  private wss: WebSocketServer;
  
  // Connection Registry: branch_id -> Set<WebSocket>
  private branchChannels: Map<string, Set<WebSocket>> = new Map();
  
  // Deterministic Sequencing: branch_id -> current_sequence
  private branchSequencers: Map<string, number> = new Map();
  
  // Server Epoch: Determines sequence reset boundaries
  private serverEpoch: number = Date.now();
  
  // Heartbeat interval handle
  private heartbeatInterval!: NodeJS.Timeout;

  private constructor() {
    this.wss = new WebSocketServer({ noServer: true });
    this.setupHeartbeat();
  }

  public static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  /**
   * Main entry point from the HTTP server upgrade hook.
   * Handles strict authentication and transport identity generation.
   */
  public async handleUpgrade(req: IncomingMessage, socket: any, head: Buffer): Promise<void> {
    try {
      // 1. Authenticate via Protocol Header
      const protocolHeader = req.headers['sec-websocket-protocol'];
      if (!protocolHeader) {
        throw new Error('Missing Sec-WebSocket-Protocol');
      }

      // Format is usually "token" or "Bearer, token"
      const parts = protocolHeader.split(',').map(p => p.trim());
      const token = parts[parts.length - 1]; // Pick the actual token

      let identity: Partial<ConnectionIdentity> = {};

      try {
        // Try Runtime JWT first (Staff)
        const payload = RuntimeAuthService.verifyRuntimeSession(token);
        identity = {
          tenant_id: payload.tenant_id,
          branch_id: payload.branch_id,
          session_id: payload.session_id,
          user_id: payload.sub,
        };
      } catch (err) {
        // Fallback to QR Session (Customer)
        const qrSession = await validateSessionToken(token);
        identity = {
          tenant_id: qrSession.tenant_id,
          branch_id: qrSession.branch_id,
          session_id: qrSession.id,
        };
      }

      // 2. Generate Transport Identity
      const connectionId = crypto.randomUUID();
      const streamInstanceId = crypto.randomUUID();
      
      const fullIdentity: ConnectionIdentity = {
        connection_id: connectionId,
        stream_instance_id: streamInstanceId,
        tenant_id: identity.tenant_id!,
        branch_id: identity.branch_id!,
        session_id: identity.session_id,
        user_id: identity.user_id,
        connected_at: new Date().toISOString(),
      };

      // 3. Upgrade Connection
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        // The subprotocol accepted MUST be returned exactly as provided by the client,
        // but passing it here completes the handshake. We just echo the token back.
        this.wss.emit('connection', ws, req, fullIdentity);
      });

    } catch (err: any) {
      logger.warn({ err: err.message }, '[Transport] Unauthorized upgrade attempt');
      void logTransportAudit({
        connection_id: 'unknown',
        stream_instance_id: 'unknown',
        event_type: 'AUTH_FAIL',
        reason: err.message
      });
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  }

  /**
   * Initializes the WebSocket connection lifecycle.
   */
  public initializeConnection(ws: WebSocket, identity: ConnectionIdentity): void {
    // 1. Attach identity & heartbeat state
    (ws as any).identity = identity;
    (ws as any).isAlive = true;

    // 2. Register to Branch Channel
    if (!this.branchChannels.has(identity.branch_id)) {
      this.branchChannels.set(identity.branch_id, new Set());
      this.branchSequencers.set(identity.branch_id, 0); // Initialize sequencer
    }
    this.branchChannels.get(identity.branch_id)!.add(ws);

    // 3. Log Audit
    void logTransportAudit({
      ...identity,
      event_type: 'CONNECT'
    });

    // 4. Frame Listeners
    ws.on('pong', () => {
      (ws as any).isAlive = true;
    });

    ws.on('message', (data: Buffer) => {
      this.handleClientFrame(ws, identity, data);
    });

    ws.on('close', () => {
      this.branchChannels.get(identity.branch_id)?.delete(ws);
      void logTransportAudit({
        ...identity,
        event_type: 'DISCONNECT'
      });
    });
  }

  /**
   * Handles incoming client frames (SYNC, ACK).
   */
  private handleClientFrame(_ws: WebSocket, identity: ConnectionIdentity, data: Buffer): void {
    try {
      const frame = JSON.parse(data.toString());
      
      if (frame.type === 'SYNC') {
        const lastSeq = frame.last_sequence || 0;
        logger.info({ identity, lastSeq }, '[Transport] Client SYNC negotiated');
        // Currently we do not implement the full replay engine, but we log it.
      } else if (frame.type === 'ACK') {
        // Acknowledge delivery logic (optional, for observability)
      } else {
        logger.warn({ identity, frame }, '[Transport] Unknown frame received');
      }
    } catch (err) {
      logger.error({ err, identity }, '[Transport] Malformed frame received');
    }
  }

  /**
   * Deterministic Broadcast to a specific branch.
   * Automatically assigns monotonic sequence numbers and server epoch.
   */
  public broadcastToBranch(
    branchId: string,
    eventSource: EventEnvelope['event_source'],
    streamType: string,
    eventType: string,
    payload: any
  ): void {
    const channel = this.branchChannels.get(branchId);
    if (!channel || channel.size === 0) return; // No active listeners

    // Monotonic Sequencing
    const currentSeq = this.branchSequencers.get(branchId) || 0;
    const nextSeq = currentSeq + 1;
    this.branchSequencers.set(branchId, nextSeq);

    // Envelope Assembly
    let sampleWs: any = Array.from(channel)[0];
    const tenantId = sampleWs.identity.tenant_id;

    const envelope: EventEnvelope = {
      event_id: crypto.randomUUID(),
      event_sequence: nextSeq,
      server_epoch: this.serverEpoch,
      event_source: eventSource,
      tenant_id: tenantId,
      branch_id: branchId,
      stream_type: streamType,
      event_type: eventType,
      occurred_at: new Date().toISOString(),
      payload,
      replay_cursor: nextSeq.toString(),
    };

    const rawMsg = JSON.stringify(envelope);

    channel.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(rawMsg);
      }
    });
  }

  /**
   * Heartbeat reaping mechanism.
   * Runs every 30 seconds to clean up dead connections.
   */
  private setupHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.branchChannels.forEach((clients, _branchId) => {
        clients.forEach((ws: any) => {
          if (ws.isAlive === false) {
            void logTransportAudit({
              ...ws.identity,
              event_type: 'STALE_HEARTBEAT'
            });
            return ws.terminate();
          }

          ws.isAlive = false;
          ws.ping();
        });
      });
    }, 30000);
  }

  /**
   * Graceful shutdown logic.
   */
  public async shutdown(): Promise<void> {
    clearInterval(this.heartbeatInterval);
    this.branchChannels.forEach((clients) => {
      clients.forEach((ws) => {
        // 1012 = Service Restart
        ws.close(1012, 'Server Restart');
      });
    });
    this.branchChannels.clear();
  }
}
