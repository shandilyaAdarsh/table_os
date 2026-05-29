# Playbook: Projection Rebuild Recovery

**Incident Class:** CHRONIC  
**Escalation Level:** MEDIUM → HIGH  
**Primary Detector:** `PROJECTION_DRIFT_DETECTED`, `REPLAY_LAG_DETECTED`  
**Scenario Coverage:** ScenarioC (ProjectionRebuildStarvation), ScenarioL (LongRunning)

---

## Incident Indicators

- `PROJECTION_DRIFT_DETECTED` with `drift_classification: CHRONIC` in `activeAlerts`
- `REPLAY_LAG_DETECTED` — surfaces not triggering replays despite unresolved sequence gaps
- `domains[<domain>].rebuildCount` not incrementing for an extended period despite `gapCount > 0`
- `domains[<domain>].cancelledCount` growing (rebuilds being aborted)
- `projectionFreshnessAgeMs` exceeding 60 seconds on live surfaces
- `rebuildQueuePressure` rising on affected surfaces in `convergence.surfaces`

---

## Convergence Symptoms

- Operators seeing stale data (e.g., old order status, previous table layout)
- UI state not reflecting recent mutations that have been acknowledged
- Surfaces reading from outdated projection snapshots
- OCC false-positives: mutations being rejected as stale because projection baseline is old
- `isStale: true` on multiple surfaces in `convergence.surfaces`

---

## Root Cause Patterns

1. **Rebuild Starvation**: A high-priority domain (e.g., orders) continuously preempts a lower-priority domain (e.g., analytics), leaving it permanently unbuilt
2. **Memory Pressure**: Heap usage is elevated, causing GC pauses that abort in-progress rebuilds
3. **Replay Source Unavailability**: The event store cannot serve the replay window (e.g., Supabase query timeout)
4. **Projection Cache Poisoning**: Corrupted cached projection base is causing all incremental rebuilds to fail

---

## Mitigation Steps

### Step 1 — Identify the stale domain
```
GET /api/v1/runtime/observability/snapshot/:tenantId
```
Look at `domains` object — find the domain with:
- High `cancelledCount`
- Low or stagnant `watermark`
- `gapCount > 0`

### Step 2 — Check heap stability
Look at `heapMetrics.heapUsed`. If heap is >80% of `heapTotal`, GC pressure may be aborting rebuilds.
→ If heap is the issue, first address memory pressure (see: Telemetry Flood Containment playbook or Long Session Memory playbook)

### Step 3 — Force projection refresh on the affected domain
If the domain is clearly stale and self-healing has not occurred within 5 minutes, trigger a controlled projection rebuild.

This must be done via a signed engineering action — do NOT bypass the replay pipeline:
1. Invalidate the cached projection base for the affected aggregate
2. Queue a fresh `PROJECTION_INVALIDATED` event
3. Confirm `PROJECTION_REBUILD_STARTED` is emitted

### Step 4 — Unblock the rebuild queue
If `cancelledCount` is very high, a rebuild cycle may be stuck:
- Issue a `THROTTLE_REPLAY` directive on lower-priority domains to free rebuild worker capacity
- Allow the stale domain to drain its rebuild queue

### Step 5 — Monitor rebuild progress
Watch for:
- `PROJECTION_REBUILD_STARTED` → `PROJECTION_REBUILD_COMPLETED` sequence
- `cancelledCount` stopping to increment
- `gapCount` returning to 0
- `isStale: false` on previously stale surfaces

---

## Rollback Conditions

- If forced rebuild triggers additional `PROJECTION_REBUILD_FAILED` events → rebuild is repeatedly failing for the same reason; investigate database/query layer
- If `THROTTLE_REPLAY` on low-priority domains causes those domains to fall excessively behind → revoke throttle and accept rebuild delay

---

## Replay Inspection Workflow

1. Get the incident from registry, note `replay_chains`
2. In the replay explorer, filter timeline to the affected domain
3. Look for long gaps between `PROJECTION_REBUILD_STARTED` and `PROJECTION_REBUILD_COMPLETED`
4. Check for repeated `PROJECTION_REBUILD_FAILED` events — look at `metadata` for failure reason
5. Cross-reference with `heapMetrics` snapshots during the failure window

---

## Recovery Validation Checklist

- [ ] `PROJECTION_DRIFT_DETECTED` cleared from `activeAlerts`
- [ ] `REPLAY_LAG_DETECTED` cleared
- [ ] `domains[<domain>].gapCount === 0`
- [ ] `domains[<domain>].cancelledCount` stable (not growing)
- [ ] `projectionFreshnessAgeMs < 30s` on all surfaces
- [ ] `isStale: false` on all affected surfaces
- [ ] `watermarkParity: true` restored
- [ ] No `PROJECTION_REBUILD_FAILED` events in past 5 minutes
- [ ] Incident transitioned to `RESOLVED`
