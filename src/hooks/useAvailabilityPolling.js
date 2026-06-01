// src/hooks/useAvailabilityPolling.js
import { useEffect, useRef } from 'react';
import { AvailabilityRepository } from '../lib/repositories/availability.repository';
import { useAvailabilityStore } from '../store/availabilityStore';

export function useAvailabilityPolling({ tenantSlug, tenantId, branchId, intervalMs = 15000 }) {
  const setOverlayData = useAvailabilityStore(state => state.setOverlayData);
  const setStale = useAvailabilityStore(state => state.setStale);
  const timeoutRef = useRef(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    
    // Safety check - we need these to poll
    if ((!tenantSlug && !tenantId) || !branchId) return;

    const poll = async () => {
      try {
        const data = await AvailabilityRepository.fetchAvailabilityOverlay({ tenantSlug, tenantId, branchId });
        if (isMounted.current) {
          setOverlayData(data);
        }
      } catch (err) {
        if (isMounted.current) {
          console.error('[Availability Polling] Failed to fetch:', err);
          setStale(err.message);
        }
      } finally {
        if (isMounted.current) {
          // Schedule the next poll ONLY after this one completes (prevents overlapping)
          timeoutRef.current = setTimeout(poll, intervalMs);
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
