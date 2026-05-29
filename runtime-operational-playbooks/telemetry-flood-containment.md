# Playbook: Telemetry Flood Containment

**Incident Class:** ACUTE  
**Escalation Level:** HIGH → CRITICAL  
**Primary Detector:** `DUPLICATE_REPLAY_STORM_DETECTED`  
**Scenario Coverage:** ScenarioB, ScenarioM (BackpressureCascade)

---

## Incident Indicators

- `droppedEvents` growing rapidly (buffer overflow, `MAX_BUFFER_SIZE` breach)
- `bufferSize` pinned at maximum (1000 events) continuously
- `DUPLICATE_REPLAY_STORM_DETECTED` in `activeAlerts`
- `bufferOverflows` counter rising
- Heap metrics (`heapMetrics.heapUsed`) growing faster than normal
- `TelemetryBroadcaster` queue log warning: "Telemetry queue overflow. Dropping event."
- Supabase Realtime broadcast latency increasing

---

## Convergence Symptoms

- Legitimate telemetry events being silently dropped (operational blindness)
- Divergence detector missing real anomalies because the buffer is saturated with duplicate/noisy events
- `activeAlerts` not refreshing correctly — stale incidents not aging out
- `instability.duplicateScore` > 80

---

## Root Cause Patterns

1. **Reconnect Storm + Replay Flood**: A mass reconnect event triggers simultaneous replay catches from all surfaces, generating thousands of `REPLAY_PROGRESS` events per second
2. **Chaos Certification Leakage**: Certification harness events bleeding into a production tenant namespace
3. **Browser Throttling Unbatch**: A previously throttled browser tab releasing batched events all at once upon focus
4. **Realtime Subscription Duplicate**: Supabase channel subscription doubling up after reconnect

---

## Mitigation Steps

### Step 1 — Confirm flood origin
```
GET /api/v1/runtime/observability/snapshot/:tenantId
```
Check `activeAlerts` for `DUPLICATE_REPLAY_STORM_DETECTED`.
Look at `bufferSize` and `droppedEvents` trend.

Check the `TelemetryRetentionPolicy` sampling rate — was it recently changed?

### Step 2 — Identify the noisy surface
Review `convergence.surfaces` — find which surface has the highest `duplicateSuppressionCount`.

### Step 3 — Issue a realtime throttle directive (if broadcast is flooding Supabase)
```
POST /api/v1/runtime/observability/safety/directive
{
  "directive_type": "THROTTLE_REPLAY",
  "incident_id": "<incident_id>",
  "justification": "Telemetry flood — replay event volume exceeding buffer capacity",
  "ttl_seconds": 120
}
```
This slows replay broadcasting to prevent Supabase channel saturation.

### Step 4 — If root is browser unbatch — force a projection checkpoint
If the flood source is a browser tab releasing batched events, the events are typically catch-up replays. Allow them to drain naturally (no action required beyond monitoring buffer recovery).

### Step 5 — Monitor buffer recovery
Watch `bufferSize` and `droppedEvents` over 2-minute windows. Buffer should drain and stabilize below `MAX_BUFFER_SIZE`.

### Step 6 — Verify divergence detectors are recovered
After flood subsides, check that `activeAlerts` contains only fresh incidents, not stale ones from during the flood window.

---

## Rollback Conditions

- If `THROTTLE_REPLAY` causes `sequenceGaps` to grow for >3 minutes → revoke throttle and allow natural drain
- If heap memory (`heapMetrics.heapUsed`) continues growing after buffer stabilization → investigate retention policy leak

---

## Replay Inspection Workflow

1. Identify the start of the flood in the incident registry (`incident.created_at`)
2. Open replay explorer for the certification run or tenant ID
3. Look for burst density in `REPLAY_PROGRESS` events during the incident window
4. Check for duplicate `correlation_id` events (indicator of subscription doubling)

---

## Recovery Validation Checklist

- [ ] `bufferSize` consistently below `MAX_BUFFER_SIZE`
- [ ] `droppedEvents` rate returned to 0
- [ ] `bufferOverflows` stopped incrementing
- [ ] `instability.duplicateScore < 20`
- [ ] `DUPLICATE_REPLAY_STORM_DETECTED` cleared from `activeAlerts`
- [ ] Heap usage (`heapMetrics.heapUsed`) stable / not growing
- [ ] Supabase broadcast latency returned to normal
- [ ] Incident transitioned to `RESOLVED`
