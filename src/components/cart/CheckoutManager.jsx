import { useState, useCallback } from 'react';
import { useCartStore } from '../../store/cartStore';
import { submitMutation } from '../../lib/apiClient';

export const CheckoutState = {
  IDLE: 'IDLE',
  VALIDATING_CART: 'VALIDATING_CART',
  SUBMITTING_ORDER: 'SUBMITTING_ORDER',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
};

/**
 * Custom hook to manage the deterministic finite state machine (FSM)
 * for the order checkout transaction.
 */
export function useCheckoutMachine() {
  const [state, setState] = useState(CheckoutState.IDLE);
  const [errorDetails, setErrorDetails] = useState(null);
  
  const { enqueueMutation, updateMutationStatus, serverCart, reconcileServerResponse } = useCartStore();

  const checkout = useCallback(async (tableId, orderNotes) => {
    if (state === CheckoutState.SUBMITTING_ORDER || state === CheckoutState.VALIDATING_CART) {
      console.warn('[CheckoutManager] Ignored concurrent checkout attempt.');
      return;
    }

    setState(CheckoutState.VALIDATING_CART);
    setErrorDetails(null);

    // 1. Pre-flight checks
    if (!serverCart || serverCart.items?.length === 0) {
      setState(CheckoutState.ERROR);
      setErrorDetails({ message: 'Cart is empty.' });
      return;
    }

    // 2. Queue Mutation
    setState(CheckoutState.SUBMITTING_ORDER);
    
    // We enqueue a checkout mutation to generate IDs and sequencing
    const mutation = enqueueMutation('CHECKOUT', {
      cartId: serverCart.id,
      tableId,
      orderNotes
    });

    try {
      const response = await submitMutation('/api/v1/orders/checkout', {
        ...mutation,
        expected_cart_revision: serverCart.version_num,
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Success path
        updateMutationStatus(mutation.mutation_id, 'ACKNOWLEDGED');
        reconcileServerResponse(data.mutation_ack, serverCart); // The cart might be locked now, but the order is created
        setState(CheckoutState.SUCCESS);
        return data.data.order;
      } 
      
      // Handle known runtime conflicts gracefully
      if (response.status === 409) {
        const isStale = data.error?.message?.includes('STALE_RUNTIME_STATE');
        setState(CheckoutState.ERROR);
        setErrorDetails({ 
          message: isStale 
            ? 'The menu has changed (pricing or availability) since you started your order. Please review your cart.' 
            : 'A sync conflict occurred. Please retry.' 
        });
        updateMutationStatus(mutation.mutation_id, 'FAILED_FATAL');
      } else {
        throw new Error(data.error?.message || 'Unknown server error');
      }

    } catch (err) {
      console.error('[CheckoutManager] Submission failed:', err);
      // For network errors, we might leave it as FAILED_RETRYABLE to allow a background sync later,
      // but for checkout, user intervention is usually best.
      updateMutationStatus(mutation.mutation_id, 'FAILED_RETRYABLE');
      setState(CheckoutState.ERROR);
      setErrorDetails({ message: 'Network error. Please try again.' });
    }
  }, [state, serverCart, enqueueMutation, updateMutationStatus, reconcileServerResponse]);

  const reset = useCallback(() => {
    setState(CheckoutState.IDLE);
    setErrorDetails(null);
  }, []);

  return {
    state,
    isIdle: state === CheckoutState.IDLE,
    isValidating: state === CheckoutState.VALIDATING_CART,
    isSubmitting: state === CheckoutState.SUBMITTING_ORDER,
    isSuccess: state === CheckoutState.SUCCESS,
    isError: state === CheckoutState.ERROR,
    errorDetails,
    checkout,
    reset,
  };
}
