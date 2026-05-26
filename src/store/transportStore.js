import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const TransportState = {
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  AUTHENTICATING: 'AUTHENTICATING',
  CONNECTED: 'CONNECTED',
  RECONNECTING: 'RECONNECTING',
  DEGRADED: 'DEGRADED',
  FAILED: 'FAILED',
};

export const useTransportStore = create(
  persist(
    (set, get) => ({
      // Connection FSM State
      state: TransportState.DISCONNECTED,
      
      // Connection Metrics
      connectionId: null,
      streamInstanceId: null,

      // Sequencing Governance
      replayCursor: 0,
      serverEpoch: null,
      isSyncing: false,

      // Subscription Registry
      subscriptions: new Map(), // streamType -> Set<callback>

      // Actions
      transitionState: (newState, metadata = {}) => {
        set((prev) => {
          if (prev.state === newState) return prev;
          console.info(`[Transport FSM] ${prev.state} -> ${newState}`, metadata);
          return { state: newState };
        });
      },

      setConnectionIdentity: (identity) => {
        set({
          connectionId: identity.connection_id,
          streamInstanceId: identity.stream_instance_id,
        });
      },

      setSyncing: (status) => set({ isSyncing: status }),

      setReplayCursor: (cursor) => set({ replayCursor: cursor }),

      /**
       * Sequence Validation & Ingestion
       */
      processEventEnvelope: (envelope) => {
        const currentCursor = get().replayCursor;
        const currentEpoch = get().serverEpoch;

        // 1. Epoch Checks
        if (currentEpoch !== null && envelope.server_epoch > currentEpoch) {
          console.warn('[Transport] Server Epoch changed (server restart detected)');
          set({ serverEpoch: envelope.server_epoch, replayCursor: 0 }); // Reset cursor on epoch jump
        } else if (currentEpoch === null) {
          set({ serverEpoch: envelope.server_epoch });
        }

        // 2. Sequence Gap Detection
        const expectedNext = get().replayCursor + 1;
        
        if (envelope.event_sequence > expectedNext) {
          console.error(`[Transport] SEQUENCE GAP DETECTED. Expected: ${expectedNext}, Received: ${envelope.event_sequence}`);
          get().transitionState(TransportState.DEGRADED, { reason: 'SEQUENCE_GAP' });
          // Initiate replay negotiation logic would happen here in the future
          // For now, we still fast-forward the cursor to avoid infinite loops, but we are degraded.
          set({ replayCursor: envelope.event_sequence });
          return;
        }

        if (envelope.event_sequence <= get().replayCursor && envelope.event_sequence !== 0) {
          console.warn(`[Transport] Stale or duplicate sequence rejected: ${envelope.event_sequence}`);
          return; // Ignore stale events silently
        }

        // 3. Accept Event & Update Cursor
        set({ replayCursor: envelope.event_sequence });

        // 4. Dispatch to projection-agnostic registry
        const subs = get().subscriptions.get(envelope.stream_type);
        if (subs) {
          subs.forEach((callback) => {
            try {
              callback(envelope);
            } catch (err) {
              console.error('[Transport] Subscription callback failed', err);
            }
          });
        }
      },

      /**
       * Subscription Registry API
       */
      subscribe: (streamType, callback) => {
        set((state) => {
          const map = new Map(state.subscriptions);
          if (!map.has(streamType)) {
            map.set(streamType, new Set());
          }
          map.get(streamType).add(callback);
          return { subscriptions: map };
        });

        // Unsubscribe function
        return () => {
          set((state) => {
            const map = new Map(state.subscriptions);
            const subs = map.get(streamType);
            if (subs) {
              subs.delete(callback);
              if (subs.size === 0) map.delete(streamType);
            }
            return { subscriptions: map };
          });
        };
      },

      // Cleanup on disconnect
      cleanupTransport: () => {
        set({
          connectionId: null,
          streamInstanceId: null,
        });
      }
    }),
    {
      name: 'tableos-transport-engine',
      version: 1,
      partialize: (state) => ({
        // ONLY persist replay coordinates
        replayCursor: state.replayCursor,
        serverEpoch: state.serverEpoch,
      }),
    }
  )
);
