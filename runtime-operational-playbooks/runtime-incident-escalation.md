# Playbook: Runtime Incident Escalation

**Purpose:** Define the operational escalation tiers for runtime incidents.  
**Owner:** On-call Runtime Engineer  
**Registry:** `RuntimeIncidentRegistry`

---

## Escalation Tiers

### LOW
- **Criteria:** Isolated event, no convergence impact, self-healing expected
- **Examples:** Single `REPLAY_GAP_DETECTED` that resolves within 2 minutes; occasional `STALE_PAYLOAD_REJECTED` on a lagging surface
- **Response:** Monitor passively. No action required unless trend continues.
- **SLA:** Acknowledge within 30 minutes.

---

### MEDIUM
- **Criteria:** Degraded runtime performance, convergence affected but projections still consistent
- **Examples:** `PROJECTION_DRIFT_DETECTED` (CHRONIC); degraded transport mode lasting >5 minutes; `REPLAY_LAG_DETECTED` not self-resolving
- **Response:** Investigate root cause. Consider issuing a safety directive if trend continues.
- **SLA:** Acknowledge within 10 minutes. Mitigate within 30 minutes.

---

### HIGH
- **Criteria:** Significant operational impact. Multiple surfaces affected. Convergence integrity at risk.
- **Examples:** `TRANSPORT_DIVERGENCE_DETECTED` across 2+ surfaces; `QUEUE_STARVATION_DETECTED`; `WATERMARK_ROLLBACK_DETECTED` on a single domain
- **Response:** Issue safety directive immediately. Notify senior engineer. Begin replay inspection.
- **SLA:** Acknowledge within 5 minutes. Mitigate within 15 minutes.

---

### CRITICAL
- **Criteria:** Active data integrity risk or complete runtime failure. All hands.
- **Examples:** `REPLAY_LOOP_DETECTED`; `WATERMARK_ROLLBACK_DETECTED` on multiple domains; `DUPLICATE_REPLAY_STORM_DETECTED` causing buffer saturation; confirmed stale overwrite accepted by MutationGateway
- **Response:** Immediately issue `ENGAGE_DEGRADED_MODE` or `THROTTLE_REPLAY` to contain damage. Do not revoke until full investigation complete.
- **SLA:** Acknowledge within 2 minutes. Mitigate within 10 minutes. Post-mortem within 24 hours.

> **CRITICAL incidents bypass telemetry sampling.** All events during a CRITICAL incident window must be preserved in full for replay analysis.

---

## Automatic Escalation Rules

The `RuntimeIncidentRegistry` assigns initial `escalation_level` based on:

| Event Type | Initial Level |
|---|---|
| `PROJECTION_DRIFT_DETECTED` | CRITICAL |
| `DUPLICATE_REPLAY_STORM_DETECTED` | CRITICAL |
| `REPLAY_LOOP_DETECTED` | CRITICAL |
| `WATERMARK_ROLLBACK_DETECTED` | HIGH |
| `TRANSPORT_DIVERGENCE_DETECTED` | HIGH |
| `QUEUE_STARVATION_DETECTED` | MEDIUM |
| `REPLAY_LAG_DETECTED` | MEDIUM |
| Severity: CRITICAL (other) | CRITICAL |
| Severity: WARNING (other) | MEDIUM |
| Contains DISCONNECT/FAIL | HIGH |
| Default | LOW |

---

## Incident Merging Policy

To prevent **incident explosion** during storm conditions, the registry automatically merges related incidents:

1. **Replay/Projection issues** are grouped under an active `TRANSPORT_DIVERGENCE_DETECTED` parent (if one exists within 5 minutes on the same tenant)
2. **Duplicate event types** are merged under the oldest active incident of that type

Operators see a hierarchy: `parent_incident_id` → `related_incident_ids[]`

---

## Incident Lifecycle

```
OPEN → ACKNOWLEDGED → MITIGATING → STABLE → RESOLVED → ARCHIVED
                  ↓
           (if deteriorates)
                  ↓
           re-escalate level
```

Every state transition is recorded in `state_transitions[]` with:
- `timestamp`
- `engineer`
- `note`

---

## CRITICAL Incident Required Actions

CRITICAL incidents require **all** of the following before `RESOLVED`:

1. [ ] Safety directive issued with justification and incident reference
2. [ ] Replay evidence attached (`replay_chains` linked in incident)
3. [ ] Convergence checkpoint confirmed (`watermarkParity: true`)
4. [ ] Root cause documented in `resolution_summary`
5. [ ] All affected surfaces confirmed healthy
6. [ ] Post-mortem scheduled (within 24h)

---

## Escalation Contacts

| Level | Notify |
|---|---|
| LOW | On-call engineer (async) |
| MEDIUM | On-call engineer (sync) |
| HIGH | Senior engineer + on-call |
| CRITICAL | Senior engineer + lead + all affected team members |

---

## Relevant Playbooks

- [Reconnect Storm Mitigation](./reconnect-storm-mitigation.md)
- [Replay Corruption Investigation](./replay-corruption-investigation.md)
- [Degraded Mode Recovery](./degraded-mode-recovery.md)
- [Telemetry Flood Containment](./telemetry-flood-containment.md)
- [Projection Rebuild Recovery](./projection-rebuild-recovery.md)
- [Stale Overwrite Incident Handling](./stale-overwrite-incident-handling.md)
