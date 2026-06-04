// src/hooks/useAvailabilityPolling.js
import { useEffect, useRef } from 'react';
import { AvailabilityRepository } from '../lib/repositories/availability.repository';
import { useAvailabilityStore } from '../store/availabilityStore';

export function useAvailabilityPolling({ tenantSlug, tenantId, branchId, intervalMs = 15000 }) {
  const setOverlayData = useAvailabilityStore(state => state.setOverlayData);
  const setStale = useAvailabilityStore(state => state.setStale);
  const timeoutRef = useRef(null);
  const isMounted = useRef(true);
  const retryCount = useRef(0);
  const MAX_RETRIES = 5;

  useEffect(() => {
    isMounted.current = true;
    retryCount.current = 0;
    
    // Safety check - we need these to poll
    if ((!tenantSlug && !tenantId) || !branchId) return;

    const poll = async () => {
      // If offline, don't poll
      if (!navigator.onLine) {
        if (isMounted.current) {
           timeoutRef.current = setTimeout(poll, 10000); // Wait 10s then try again
        }
        return;
      }

      try {
        const data = await AvailabilityRepository.fetchAvailabilityOverlay({ tenantSlug, tenantId, branchId });
        if (isMounted.current) {
          setOverlayData(data);
          retryCount.current = 0; // reset on success
        }
      } catch (err) {
        if (isMounted.current) {
          console.error('[Availability Polling] Failed to fetch:', err);
          setStale(err.message);
          retryCount.current += 1;
        }
      } finally {
        if (isMounted.current) {
          if (retryCount.current >= MAX_RETRIES) {
             console.warn('[Availability Polling] Max retries reached. Suspending polling.');
             // Stop polling
             return;
          }
          // Exponential backoff
          const backoff = Math.min(intervalMs * Math.pow(2, retryCount.current), 60000);
          timeoutRef.current = setTimeout(poll, backoff);
        }
      }
    };

    // Kick off initial fetch immediately
    poll();

    return () => {
      isMounted.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [tenantSlug, tenantId, branchId, intervalMs, setOverlayData, setStale]);
}
