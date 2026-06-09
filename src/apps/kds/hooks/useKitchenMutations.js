import { submitMutation } from '../../../lib/apiClient.js';
import { useKdsIdentityStore } from '../../../store/kdsIdentityStore.js';

// State machine validation
const VALID_TRANSITIONS = {
  'NEW': ['PREPARING', 'REJECTED'],
  'PREPARING': ['READY'],
  'READY': ['EXPO_COMPLETE'],
  'EXPO_COMPLETE': ['SERVED'],
  // No transition from SERVED, CLOSED, etc.
};

function isValidTransition(currentStatus, targetStatus) {
  const allowed = VALID_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(targetStatus) : false;
}

export function useKitchenMutations() {
  // The kitchen projection uses ticketId/orderId, not order.id
  const resolveId = (order) => order.ticketId || order.orderId || order.id || '';

  return {
    markPreparing: async (order) => {
      if (!isValidTransition(order.status?.toUpperCase(), 'PREPARING') && !order.isNew) {
        console.warn(`[KDS] Invalid transition from ${order.status} to PREPARING`);
      }
      
      const { runtimeSessionId, kitchenDeviceId } = useKdsIdentityStore.getState();
      const id = resolveId(order);
      
      console.log('[KDS] markPreparing called with:', {
        orderId: id,
        orderStatus: order.status,
        runtimeSessionId,
        kitchenDeviceId
      });
      
      return submitMutation('/api/v1/mutations', {
        mutation_id: `KITCHEN_MARK_PREPARING_${id}_${Date.now()}`,
        idempotency_key: `KITCHEN_MARK_PREPARING_${id}`,
        payload: {
          type: 'KITCHEN_MARK_PREPARING',
          orderId: id,
          runtimeSessionId,
          kitchenDeviceId
        }
      });
    },
    
    markReady: async (order) => {
      if (!isValidTransition(order.status?.toUpperCase(), 'READY')) {
        console.warn(`[KDS] Invalid transition from ${order.status} to READY`);
      }
      
      const { runtimeSessionId, kitchenDeviceId } = useKdsIdentityStore.getState();
      const id = resolveId(order);
      
      return submitMutation('/api/v1/mutations', {
        mutation_id: `KITCHEN_MARK_READY_${id}_${Date.now()}`,
        idempotency_key: `KITCHEN_MARK_READY_${id}`,
        payload: {
          type: 'KITCHEN_MARK_READY',
          orderId: id,
          runtimeSessionId,
          kitchenDeviceId
        }
      });
    },
    
    bumpOrder: async (order) => {
      const { runtimeSessionId, kitchenDeviceId, stationId } = useKdsIdentityStore.getState();
      const id = resolveId(order);
      
      return submitMutation('/api/v1/mutations', {
        mutation_id: `KITCHEN_BUMP_TICKET_${id}_${stationId}_${Date.now()}`,
        idempotency_key: `KITCHEN_BUMP_TICKET_${id}_${stationId}`,
        payload: {
          type: 'KITCHEN_BUMP_TICKET',
          orderId: id,
          stationId,
          runtimeSessionId,
          kitchenDeviceId
        }
      });
    },

    recallTicket: async (order) => {
      const { runtimeSessionId, kitchenDeviceId } = useKdsIdentityStore.getState();
      const id = resolveId(order);
      
      return submitMutation('/api/v1/mutations', {
        mutation_id: `KITCHEN_RECALL_TICKET_${id}_${Date.now()}`,
        idempotency_key: `KITCHEN_RECALL_TICKET_${id}`,
        payload: {
          type: 'KITCHEN_RECALL_TICKET',
          orderId: id,
          runtimeSessionId,
          kitchenDeviceId
        }
      });
    },
  };
}
