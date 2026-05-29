# Playbook: Degraded Mode Recovery

**Incident Class:** CHRONIC  
**Escalation Level:** MEDIUM → HIGH  
**Primary Detector:** `TRANSPORT_DIVERGENCE_DETECTED`, `PROJECTION_DRIFT_DETECTED`  
**Scenario Coverage:** ScenarioC, ScenarioJ, ScenarioB

---

## Incident Indicators

- `transportState: DEGRADED` in snapshot
- `isDegraded: true` and `degradedPollingActive: true` on one or more surfaces
- `instability.transportScore` > 50 for an extended period (>5 minutes)
- Polling fallback active (`TRANSPORT_POLLING_FALLBACK` events) for multiple consecutive windows
- Operators reporting slower data refresh rates
- `PROJECTION_DRIFT_DETECTED` firing on domains with `drift_classification: CHRONIC`

---

## Convergence Symptoms

- Stale surface states — data not updating at realtime speeds
- Projection freshness decay: `projectionFreshnessAgeMs` growing on affected surfaces
- `replayLag` increasing: surfaces falling further behind on watermarks
- Mutation latency increasing due to delayed acknowledgement
- `watermarkParity: false` — surfaces diverging slowly over time

---

## Mitigation Steps

### Step 1 — Confirm degraded mode scope
```
GET /api/v1/runtime/observability/snapshot/:tenantId
```
Check:
- `isDegraded: true`
- `convergence.surfaces` — which surfaces are polling vs realtime
- `instability.overallHealth` — expected DEGRADED/UNSTABLE

### Step 2 — Check transport layer root cause
Review `activeAlerts` for transport-related events before `TRANSPORT_DEGRADED` was emitted:
- WiFi instability (many `TRANSPORT_RECONNECT_STARTED` events)
- Supabase Realtime connectivity
- Server-side resource exhaustion

### Step 3 — Attempt transport recovery
If the root cause is resolved (WiFi stabilized, server recovered), surfaces should self-heal.
Monitor for `TRANSPORT_RECONNECT_COMPLETED` events — surfaces will exit degraded mode and re-subscribe to realtime channels.

### Step 4 — Accelerate recovery if surfaces are stuck
If surfaces remain polling for >10 minutes after root cause resolution:
```
DELETE /api/v1/runtime/observability/safety/directive/:directiveId
```
Revoke any active `ENGAGE_DEGRADED_MODE` directive to unblock reconnection.

### Step 5 — Trigger projection refresh on stale surfaces
If `projectionFreshnessAgeMs` is critically high on specific surfaces, a projection rebuild may be needed:
- Monitor for `REPLAY_STARTED` → `PROJECTION_REBUILD_COMPLETED` after transport recovery
- This happens automatically after reconnection — do not trigger manually unless staleness exceeds 30 minutes

---

## Rollback Conditions

- If transport repeatedly degrades within <30 minutes of recovery → environment-level investigation required (network hardware, WiFi AP, server resources)
- If `mutationStalled` spikes during degraded mode → replay backlog may need manual clearance

---

## Replay Inspection Workflow

1. Locate `TRANSPORT_DEGRADED` events in the incident timeline
2. Note timestamps of degraded windows vs recovery events
3. In the Admin replay explorer, check watermark progression during degraded windows for each affected surface
4. Verify that polling-period mutations are correctly replay-confirmed post-recovery

---

## Recovery Validation Checklist

- [ ] `isDegraded: false` restored
- [ ] `degradedPollingActive: false` on all surfaces
- [ ] `transportState: CONNECTED` or `LIVE`
- [ ] `instability.transportScore < 20`
- [ ] `projectionFreshnessAgeMs` returning to normal (<30s)
- [ ] `watermarkParity: true` restored
- [ ] No new `PROJECTION_DRIFT_DETECTED` alerts for 5+ minutes
- [ ] Incident state transitioned to `STABLE` then `RESOLVED`
