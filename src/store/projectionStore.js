import { create } from 'zustand';

export const ProjectionStatus = {
  HEALTHY: 'HEALTHY',
  STALE: 'STALE',
  REBUILDING: 'REBUILDING',
  INVALIDATED: 'INVALIDATED',
  DEGRADED: 'DEGRADED',
  FAILED: 'FAILED',
};

export const useProjectionStore = create((set, get) => ({
  // projections: { [projection_id]: { revision, data, status, rebuild_generation_id } }
  projections: {},

  initProjection: (projectionId) => {
    set((state) => {
      if (state.projections[projectionId]) return state;
      return {
        projections: {
          ...state.projections,
          [projectionId]: {
            revision: 0,
            data: null,
            status: ProjectionStatus.STALE,
            rebuild_generation_id: null,
          }
        }
      };
    });
  },

  setStatus: (projectionId, status, rebuildGenId = null) => {
    set((state) => {
      const proj = state.projections[projectionId];
      if (!proj) return state;
      return {
        projections: {
          ...state.projections,
          [projectionId]: {
            ...proj,
            status,
            rebuild_generation_id: rebuildGenId || proj.rebuild_generation_id
          }
        }
      };
    });
  },

  hydrateProjection: (projectionId, data, revision, rebuildGenId) => {
    set((state) => {
      const proj = state.projections[projectionId];
      if (!proj) return state;

      // Prevent race conditions where an older rebuild returns after a newer one
      if (proj.rebuild_generation_id && proj.rebuild_generation_id !== rebuildGenId) {
        console.warn(`[Projection] Ignored stale rebuild hydrate for ${projectionId}`);
        return state;
      }

      return {
        projections: {
          ...state.projections,
          [projectionId]: {
            ...proj,
            data,
            revision,
            status: ProjectionStatus.HEALTHY,
          }
        }
      };
    });
  },

  /**
   * PURE REDUCER
   * Strict Monotonicity: Ignores stale revisions.
   */
  applyProjectionUpdate: (projectionId, envelope, reducerFn) => {
    set((state) => {
      const proj = state.projections[projectionId];
      if (!proj) return state;

      if (proj.status === ProjectionStatus.STALE || proj.status === ProjectionStatus.REBUILDING) {
        // Can't apply incremental updates to a stale/rebuilding state
        return state;
      }

      if (envelope.projection_revision <= proj.revision) {
        console.warn(`[Projection] Rejected stale update for ${projectionId}. Current: ${proj.revision}, Envelope: ${envelope.projection_revision}`);
        return state;
      }

      // Check gap
      if (envelope.projection_revision > proj.revision + 1 && envelope.source_revision > proj.revision) {
         // Gap detected in projection revisions
         console.error(`[Projection] Revision gap for ${projectionId}. Expected: ${proj.revision + 1}, Got: ${envelope.projection_revision}`);
         return {
           projections: {
             ...state.projections,
             [projectionId]: {
               ...proj,
               status: ProjectionStatus.STALE,
             }
           }
         };
      }

      // Pure reduction
      try {
        const nextData = reducerFn(proj.data, envelope.payload);
        return {
          projections: {
            ...state.projections,
            [projectionId]: {
              ...proj,
              data: nextData,
              revision: envelope.projection_revision,
            }
          }
        };
      } catch (err) {
        console.error(`[Projection] Reducer failed for ${projectionId}`, err);
        return {
          projections: {
            ...state.projections,
            [projectionId]: {
              ...proj,
              status: ProjectionStatus.DEGRADED,
            }
          }
        };
      }
    });
  },

  applyInvalidation: (projectionId, reason) => {
    console.warn(`[Projection] Invalidation received for ${projectionId}. Reason: ${reason}`);
    set((state) => {
      const proj = state.projections[projectionId];
      if (!proj) return state;
      return {
        projections: {
          ...state.projections,
          [projectionId]: {
            ...proj,
            status: ProjectionStatus.STALE,
          }
        }
      };
    });
  },
}));
