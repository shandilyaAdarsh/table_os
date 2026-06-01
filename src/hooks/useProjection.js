import { useEffect } from 'react';
import { useProjectionStore, ProjectionStatus } from '../store/projectionStore';
import { useTransportStore } from '../store/transportStore';
import { v4 as uuidv4 } from 'uuid';

export function useProjection({
  projectionId,
  projectionType,
  fetchFn, // Async function that hits REST API to get full state + revision
  reducerFn, // Pure function: (data, payload) => nextData
}) {
  const store = useProjectionStore();
  const transport = useTransportStore();

  const projection = store.projections[projectionId];

  // 1. Initialize
  useEffect(() => {
    if (!store.projections[projectionId]) {
      store.initProjection(projectionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectionId, store.initProjection]);

  // 2. Transport Subscription
  useEffect(() => {
    const unsubscribe = transport.subscribe('PROJECTION_STREAM', (envelope) => {
      // 2a. Filter for this specific projection
      if (envelope.projection_id !== projectionId || envelope.projection_type !== projectionType) {
        return;
      }

      // 2b. Handle Invalidation
      if (envelope.type === 'INVALIDATE' || envelope.reason) { // Invalidation format
        store.applyInvalidation(projectionId, envelope.reason);
        return;
      }

      // 2c. Handle Update (Monotonic pure reduction)
      store.applyProjectionUpdate(projectionId, envelope, reducerFn);
    });

    return () => unsubscribe();
  }, [projectionId, projectionType, reducerFn, transport, store]);

  // 3. Rebuild Orchestrator
  useEffect(() => {
    if (projection && projection.status === ProjectionStatus.STALE) {
      const rebuildGenId = uuidv4();
      
      store.setStatus(projectionId, ProjectionStatus.REBUILDING, rebuildGenId);

      // Async REST rebuild
      fetchFn()
        .then(({ data, revision }) => {
          store.hydrateProjection(projectionId, data, revision, rebuildGenId);
        })
        .catch((err) => {
          console.error('[useProjection] Rebuild failed', err);
          store.setStatus(projectionId, ProjectionStatus.FAILED, rebuildGenId);
        });
    }
  }, [projection, projectionId, fetchFn, store]);

  return {
    data: projection?.data || null,
    status: projection?.status || ProjectionStatus.STALE,
    revision: projection?.revision || 0,
    isReady: projection?.status === ProjectionStatus.HEALTHY,
  };
}
