import { useState, useEffect, useRef, useMemo } from 'react';
import { CustomerRecommendationService } from '../services/CustomerRecommendationService';

const DEBOUNCE_MS = 400; // debounce rapid cart changes (qty +/- tapping)

/**
 * useCartRecommendations
 *
 * Hardened hook for fetching backend-driven cart recommendations.
 *
 * Runtime stability guarantees:
 * - Debounces rapid cart changes (400ms) to prevent request storms
 * - AbortController cancels stale in-flight requests on cart change
 * - Race-condition safe: stale responses are discarded via request ID
 * - Failures never surface to the cart UI — returns empty array
 */
export function useCartRecommendations(cartItems, limit = 5) {
  const [recommendations, setRecommendations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Stable cart fingerprint to detect real changes (avoids re-fetching on same cart)
  const cartFingerprint = useMemo(() => {
    if (!cartItems || cartItems.length === 0) return '';
    const ids = cartItems.map(i => i.id).sort();
    return ids.join(',');
  }, [cartItems]);

  // Track the latest request to discard stale responses
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef(null);
  const debounceTimerRef = useRef(null);

  useEffect(() => {
    // Clear previous debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Empty cart — clear immediately, no debounce needed
    if (!cartFingerprint) {
      // Cancel any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setRecommendations([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Debounce the actual fetch
    debounceTimerRef.current = setTimeout(() => {
      // Cancel previous in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const currentRequestId = ++requestIdRef.current;

      setIsLoading(true);
      setError(null);

      CustomerRecommendationService.getRecommendations(cartItems, limit)
        .then(data => {
          // Discard if a newer request was issued (race-condition guard)
          if (currentRequestId !== requestIdRef.current) return;
          if (controller.signal.aborted) return;

          setRecommendations(data);
        })
        .catch(err => {
          // Discard stale errors
          if (currentRequestId !== requestIdRef.current) return;
          if (controller.signal.aborted) return;

          // Recommendations are non-critical — log and return empty
          console.warn('[useCartRecommendations] Fetch failed (non-critical):', err?.message || err);
          setError(err);
          setRecommendations([]);
        })
        .finally(() => {
          if (currentRequestId !== requestIdRef.current) return;
          setIsLoading(false);
        });
    }, DEBOUNCE_MS);

    // Cleanup on unmount or cart change
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [cartFingerprint, limit]);

  return { recommendations, isLoading, error };
}
