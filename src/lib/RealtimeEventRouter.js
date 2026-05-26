import { supabase } from './supabase';
import { useConnectivityStore } from '../store/connectivityStore';
import { useProjectionCoordinator } from '../store/projectionCoordinator';
import { useRuntimeIdentityStore } from '../store/runtimeIdentityStore';

class RealtimeEventRouter {
  constructor() {
    this.channel = null;
    this.eventBuffer = [];
    this.heartbeatTimer = null;
  }

  start(tenantId, branchId) {
    if (!supabase) {
      console.warn('[RealtimeEventRouter] Supabase client not initialized.');
      return;
    }

    if (this.channel) {
      this.stop();
    }

    const topic = `tenant:${tenantId}:branch:${branchId}:operational`;
    console.log(`[RealtimeEventRouter] Subscribing to ${topic}`);

    this.channel = supabase.channel(topic);

    this.channel
      .on('broadcast', { event: '*' }, (payload) => {
        this.handleIncomingEvent(payload.payload); // Supabase nests payload
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          useConnectivityStore.getState().setOnline(true);
          this.startHeartbeat();
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          useConnectivityStore.getState().setOnline(false);
          this.stopHeartbeat();
        }
      });
  }

  stop() {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.stopHeartbeat();
    this.eventBuffer = [];
  }

  handleIncomingEvent(eventPayload) {
    const pc = useProjectionCoordinator.getState();
    const seq = eventPayload.metadata?.sequence_number;

    if (!seq) return;

    // Record heartbeat
    useConnectivityStore.getState().recordHeartbeat();

    if (pc.isReplaying) {
      // Buffer events while replaying to prevent race conditions
      console.log(`[RealtimeEventRouter] Buffering event sequence ${seq} during replay`);
      this.eventBuffer.push(eventPayload);
      return;
    }

    if (seq > pc.lastAppliedSequence + 1) {
      // Gap detected!
      console.warn(`[RealtimeEventRouter] Sequence gap detected. Expected ${pc.lastAppliedSequence + 1}, got ${seq}. Triggering replay.`);
      
      this.eventBuffer.push(eventPayload); // Buffer the current one
      
      const branchId = useRuntimeIdentityStore.getState().branchId;
      pc.startReplay(branchId).then(() => {
        this.flushBuffer();
      });
      return;
    }

    // Normal execution
    pc.applyEvent(eventPayload);
  }

  flushBuffer() {
    const pc = useProjectionCoordinator.getState();
    // Sort buffer by sequence
    this.eventBuffer.sort((a, b) => a.metadata.sequence_number - b.metadata.sequence_number);
    
    for (const ev of this.eventBuffer) {
      pc.applyEvent(ev);
    }
    
    this.eventBuffer = [];
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      const last = useConnectivityStore.getState().lastHeartbeat;
      // If we haven't seen an event or explicit ping in 30 seconds, we might be disconnected structurally
      if (Date.now() - last > 30000) {
        useConnectivityStore.getState().setOnline(false);
      }
    }, 15000);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

export const realtimeEventRouter = new RealtimeEventRouter();
