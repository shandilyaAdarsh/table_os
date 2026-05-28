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
    // Disabled polling temporarily for debugging lag issues
  }, [tenantSlug, branchId, intervalMs, setOverlayData, setStale]);
}
