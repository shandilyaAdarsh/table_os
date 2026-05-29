# Playbook: Reconnect Storm Mitigation

**Incident Class:** ACUTE  
**Escalation Level:** HIGH → CRITICAL  
**Primary Detector:** `TRANSPORT_DIVERGENCE_DETECTED`  
**Scenario Coverage:** ScenarioJ, ScenarioH, ScenarioE

---

## Incident Indicators

- `reconnectAttempts` rising faster than `reconnectFailures` (rapid reconnect-storm loop)
- `TRANSPORT_RECONNECT_STARTED` emitting >3x in a 30s rolling window per surface
- `instability.transportScore` > 80
- Multiple surfaces reporting `transportDegradationState: DEGRADED | DISCONNECTED` simultaneously
- `divergenceIncidentCount` spiking sharply in `convergence.crossSurface`
- Heap growth accelerating (check `heapMetrics.heapUsed` delta over time)

---

## Convergence Symptoms

- Watermark drift increasing across surfaces (`maxWatermarkDrift` in `CrossSurfaceMetrics`)
- Stale surface watermarks — `isStale: true` on disconnected surfaces
- Replay catch-up storms when surfaces reconnect, amplifying server load
- Backend incident registry accumulating multiple unmerged `TRANSPORT_DIVERGENCE_DETECTED` incidents

---

## Mitigation Steps

### Step 1 — Confirm the blast radius
Check the runtime observability snapshot:
```
GET /api/v1/runtime/observability/snapshot/:tenantId
```
Look at:
- `instability.overallHealth` — should be CRITICAL/UNSTABLE
- `convergence.surfaces` — identify disconnected surfaces
- `activeAlerts` — look for `TRANSPORT_DIVERGENCE_DETECTED` entries

### Step 2 — Issue a CONTAIN_RECONNECTS directive
Via the Operational Safety Panel or REST:
```
POST /api/v1/runtime/observability/safety/directive
{
  "directive_type": "CONTAIN_RECONNECTS",
  "incident_id": "<incident_id>",
  "justification": "<reason>",
  "ttl_seconds": 300
}
```
This throttles the transport layer's reconnection cadence.

### Step 3 — Enable Degraded Mode if surfaces are unrecoverable
```
POST /api/v1/runtime/observability/safety/directive
{
  "directive_type": "ENGAGE_DEGRADED_MODE",
  "ttl_seconds": 600
}
```
Surfaces fall back to polling. Mutations remain queued safely via MutationGateway.

### Step 4 — Monitor replay catch-up
Once surfaces reconnect, check:
- `REPLAY_STARTED` → `REPLAY_COMPLETED` sequences in telemetry
- `sequenceGaps` in snapshot should trend to zero
- `watermarkParity: true` restored in `CrossSurfaceMetrics`

### Step 5 — Revoke directive after stabilization
```
DELETE /api/v1/runtime/observability/safety/directive/:directiveId
```

---

## Rollback Conditions

- If degraded-mode polling causes >10min of projection staleness
- If `MUTATION_OCC_CONFLICT` begins spiking (delayed replay causing stale conflicts)
- → Revoke `CONTAIN_RECONNECTS` and allow full transport recovery

---

## Replay Inspection Workflow

1. Get the incident ID from the registry
2. Navigate to `/admin/runtime-observability/replay/:runId` in the Admin panel
3. Examine sequence gaps during the reconnect window
4. Check `REPLAY_GAP_DETECTED` events for affected surfaces

---

## Recovery Validation Checklist

- [ ] All surfaces `transportDegradationState: HEALTHY`
- [ ] `watermarkParity: true` in `CrossSurfaceMetrics`
- [ ] `maxWatermarkDrift <= 5`
- [ ] No active `TRANSPORT_DIVERGENCE_DETECTED` alerts
- [ ] `reconnectAttempts` stable / not growing
- [ ] `heapMetrics.heapUsed` returned to baseline
- [ ] Incident state transitioned to `RESOLVED`
