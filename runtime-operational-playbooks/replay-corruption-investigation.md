# Playbook: Replay Corruption Investigation

**Incident Class:** ACUTE  
**Escalation Level:** CRITICAL  
**Primary Detector:** `WATERMARK_ROLLBACK_DETECTED`, `REPLAY_LOOP_DETECTED`  
**Scenario Coverage:** ScenarioA, ScenarioD, ScenarioH

---

## Incident Indicators

- `WATERMARK_ROLLBACK_DETECTED` alert in `activeAlerts` (watermark going backwards)
- `REPLAY_LOOP_DETECTED` — 3+ `REPLAY_STARTED` events in a 60s rolling window for the same domain
- `domains[<domain>].gapCount` rising continuously
- `sequenceGaps` not resolving after replay completion
- `PROJECTION_REBUILD_FAILED` following a `REPLAY_COMPLETED` event
- Mutations begin receiving `MUTATION_OCC_CONFLICT` for operations that should have succeeded

---

## Convergence Symptoms

- Projection state inconsistent between surfaces — visible as `maxWatermarkDrift` growing
- Surfaces reporting different data state for the same aggregate
- `staleRejected` counter growing even for fresh client payloads
- Replay amplification: server replaying the same window repeatedly without converging

---

## Mitigation Steps

### Step 1 — Freeze further mutations on affected domain
Issue a `THROTTLE_REPLAY` directive to pause new replay cycles while investigating:
```
POST /api/v1/runtime/observability/safety/directive
{
  "directive_type": "THROTTLE_REPLAY",
  "incident_id": "<incident_id>",
  "justification": "Investigating watermark rollback on orders domain"
}
```
This does **not** block existing inflight mutations — only queues further replay triggers.

### Step 2 — Identify the corrupted window
```
GET /api/v1/runtime/observability/incidents/:incidentId
```
Look at:
- `replay_chains[]` — these are the replay chain IDs involved
- `last_event_timestamp` vs `created_at` — how long the corruption window lasted

Navigate to:
```
/admin/runtime-observability/replay/:runId
```
Inspect the sequence timeline for the affected `domain`.

### Step 3 — Retrieve the correlation tree
```
GET /api/v1/runtime/observability/graph/children/:correlationId
```
Or via the Admin panel:
```
/admin/runtime-observability/replay/:runId/tree/:correlationId
```
Trace `REPLAY_STARTED` → `REPLAY_GAP_DETECTED` → `PROJECTION_REBUILD_FAILED` causality chain.

### Step 4 — Force a fresh projection rebuild
If the domain is confirmed corrupt, trigger a full projection rebuild from the backend console or via a signed engineering action. This must be coordinated with senior engineering.

### Step 5 — Monitor rebuild to completion
Watch for:
- `PROJECTION_REBUILD_STARTED` → `PROJECTION_REBUILD_COMPLETED` event
- Watermark advancing past the corrupted point
- `gapCount` dropping to zero on the affected domain

---

## Rollback Conditions

- If `THROTTLE_REPLAY` causes >5min of mutation queue pressure (`mutationStalled` rising)
- → Release throttle immediately and allow natural replay retry
- If rebuild fails repeatedly → escalate to CRITICAL and consider operational rollback

---

## Replay Inspection Workflow

1. Find the incident in `RuntimeIncidentRegistry` via `/api/v1/runtime/observability/incidents`
2. Check `linked_certification_runs` for any certification evidence
3. Open the `HistoricalReplayExplorerScreen` (`/admin/runtime-observability/replay/:runId`)
4. Look for sequence progression anomalies (backward jumps, long gaps, repeated starts)
5. Cross-reference `correlation_tree` for the watermark-rollback event

---

## Recovery Validation Checklist

- [ ] `WATERMARK_ROLLBACK_DETECTED` no longer firing in `activeAlerts`
- [ ] `REPLAY_LOOP_DETECTED` cleared
- [ ] `domains[<domain>].gapCount === 0`
- [ ] Watermark advancing monotonically (no more rollbacks)
- [ ] `PROJECTION_REBUILD_COMPLETED` successfully emitted after corrective rebuild
- [ ] Incident `drift_classification` confirmed `ACUTE` and not recurring
- [ ] All surfaces converged (`watermarkParity: true`)
- [ ] Incident transitioned to `RESOLVED`
