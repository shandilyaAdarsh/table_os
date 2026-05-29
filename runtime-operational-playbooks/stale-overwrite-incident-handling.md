# Playbook: Stale Overwrite Incident Handling

**Incident Class:** ACUTE  
**Escalation Level:** HIGH → CRITICAL  
**Primary Detector:** `WATERMARK_ROLLBACK_DETECTED`, `PROJECTION_DRIFT_DETECTED`  
**Scenario Coverage:** ScenarioD (OutOfOrderSequence), ScenarioK (ConcurrentConflict)

---

## What is a Stale Overwrite?

A stale overwrite occurs when a surface attempts to write a mutation to a projection state that is **older than the current authoritative state**. This indicates:
- The surface's projection baseline is stale (not yet rebuilt after last watermark)
- A race condition during concurrent operator workflows
- An OCC (Optimistic Concurrency Control) violation — the server has already advanced the sequence

The MutationGateway **must reject** these. If stale writes are being *accepted*, this is a **CRITICAL** incident.

---

## Incident Indicators

- `PROJECTION_STALE_REJECTED` events appearing in telemetry (normal — stale writes are being correctly rejected)
- `staleRejected` counter rising rapidly
- `staleRejectionCount` high on specific surfaces in `convergence.surfaces`
- `MUTATION_OCC_CONFLICT` events for operations that operators believe should have succeeded
- Operators experiencing repeated "conflict" or "retry" UX errors

**Critical alert** (requires immediate escalation):
- Any `STALE_PAYLOAD_REJECTED` event for a **mutation that was already acknowledged** — this means the server accepted a mutation and then rejected a re-delivery, which is normal; however if operators see data loss, escalate immediately

---

## Convergence Symptoms

- Operators making changes that appear to revert after a few seconds
- Table state not stabilizing between concurrent KDS and POS updates
- OCC conflicts accumulating: `mutationStalled` rising on multiple surfaces
- Surfaces with stale watermarks submitting mutations based on an outdated projection baseline

---

## Mitigation Steps

### Step 1 — Confirm stale write pattern
```
GET /api/v1/runtime/observability/snapshot/:tenantId
```
Check:
- `staleRejected` — how many were rejected
- `instability.mutationScore` — should be elevated
- `isStale: true` on affected surfaces

### Step 2 — Identify the lagging surface
Look at `convergence.surfaces` — find surfaces with:
- Low `currentWatermark` relative to `convergence.crossSurface.highestWatermark`
- High `staleRejectionCount`
- `replayLag > 0`

These surfaces are operating on an outdated projection baseline.

### Step 3 — Trigger replay catch-up on stale surfaces
The stale surface must replay to the current watermark before submitting further mutations.

If the surface is not self-triggering a replay (stuck), a projection rebuild should be initiated:
- Monitor for `REPLAY_STARTED` → `PROJECTION_REBUILD_COMPLETED`
- Surface should stop submitting stale mutations after successful rebuild

### Step 4 — Validate MutationGateway rejection is functioning
Check telemetry: every `PROJECTION_STALE_REJECTED` event must come with a corresponding `MUTATION_OCC_CONFLICT` event on the surface. If mutations are being silently accepted and later causing projection corruption → escalate to CRITICAL and stop all mutations.

### Step 5 — Confirm no data loss
After the stale surface has caught up:
- Verify that the acknowledged mutations (those with `MUTATION_ACKNOWLEDGED` events) are reflected in the rebuilt projection
- Verify the rejected stale mutations were correctly discarded and operators were notified via OCC conflict response

---

## Rollback Conditions

- If `MUTATION_ACKNOWLEDGED` events exist for mutations that do NOT appear in the projection after rebuild → data integrity failure; escalate to CRITICAL immediately
- If OCC conflicts are 100% of mutations on a surface for >2 minutes → the surface may have a corrupted watermark; trigger full projection reset

---

## Replay Inspection Workflow

1. In the incident registry, find the incident linked to `WATERMARK_ROLLBACK_DETECTED` or `PROJECTION_STALE_REJECTED`
2. Navigate to `/admin/runtime-observability/replay/:runId`
3. Look at the sequence timeline around the time of stale rejections
4. Find the `MUTATION_OCC_CONFLICT` events — check `metadata` for the conflicting sequence numbers
5. Verify the mutation eventually succeeded on retry after the surface rebuilt its projection

---

## Recovery Validation Checklist

- [ ] `isStale: false` on all surfaces
- [ ] `staleRejected` rate returned to 0
- [ ] `staleRejectionCount` in `convergence.surfaces` stabilized
- [ ] `MUTATION_OCC_CONFLICT` rate dropped to baseline
- [ ] `PROJECTION_STALE_REJECTED` no longer in `activeAlerts`
- [ ] All surfaces at watermark parity (`maxWatermarkDrift <= 5`)
- [ ] Affected operators confirmed data is consistent
- [ ] No data loss confirmed via projection audit
- [ ] Incident transitioned to `RESOLVED`
