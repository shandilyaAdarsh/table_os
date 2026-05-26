import { useMutationCoordinator } from '../../../store/mutationCoordinator.js';
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
  const { enqueueMutation } = useMutationCoordinator();
  
  return {
    markPreparing: async (order) => {
      if (!isValidTransition(order.status?.toUpperCase(), 'PREPARING') && !order.isNew) {
        console.warn(`[KDS] Invalid transition from ${order.status} to PREPARING`);
        // If order.isNew is true, it might be implicit NEW. Adjust as needed.
      }
      
      const { runtimeSessionId, kitchenDeviceId } = useKdsIdentityStore.getState();
      
      return enqueueMutation('KITCHEN_MARK_PREPARING', {
        orderId: order.id,
        runtimeSessionId,
        kitchenDeviceId
      }, 0, `KITCHEN_MARK_PREPARING_${order.id}`); // Idempotency key
    },
    
    markReady: async (order) => {
      if (!isValidTransition(order.status?.toUpperCase(), 'READY')) {
        console.warn(`[KDS] Invalid transition from ${order.status} to READY`);
      }
      
      const { runtimeSessionId, kitchenDeviceId } = useKdsIdentityStore.getState();
      
      return enqueueMutation('KITCHEN_MARK_READY', {
        orderId: order.id,
        runtimeSessionId,
        kitchenDeviceId
      }, 0, `KITCHEN_MARK_READY_${order.id}`); // Idempotency key
    },
    
    bumpOrder: async (order) => {
      // Bumping might just be marking ready in a simple kitchen, 
      // or moving to next station in a multi-station kitchen.
      const { runtimeSessionId, kitchenDeviceId, stationId } = useKdsIdentityStore.getState();
      
      return enqueueMutation('KITCHEN_BUMP_TICKET', {
        orderId: order.id,
        stationId,
        runtimeSessionId,
        kitchenDeviceId
      }, 0, `KITCHEN_BUMP_TICKET_${order.id}_${stationId}`);
    },

    recallTicket: async (order) => {
      const { runtimeSessionId, kitchenDeviceId } = useKdsIdentityStore.getState();
      
      // Recall is generally moving from EXPO_COMPLETE back to READY, or READY back to PREPARING
      return enqueueMutation('KITCHEN_RECALL_TICKET', {
        orderId: order.id,
        runtimeSessionId,
        kitchenDeviceId
      }, 0, `KITCHEN_RECALL_TICKET_${order.id}`);
    }
  };
}
