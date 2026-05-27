# Authoritative Operational Runbooks - Orderlli Distributed Runtime

This document details the standard operating procedures (SOPs) for maintaining, diagnosing, and recovering the multi-surface operational platform.

---

## 1. SOP: Replay Recovery & Sync Failures

### Diagnostics
- Symptoms: A client screen or staff panel is stuck on stale sequences.
- Trigger: Telemetry indicates that the replay lag of a surface exceeds `10,000ms`.

### Recovery Procedure
1. Check live checkpoints:
   ```bash
   curl -H "Authorization: Bearer <TOKEN>" https://<API_URL>/api/v1/runtime/replay-health?branch_id=<BRANCH_ID>
   ```
2. Trigger force checkpoint sync to capture latest global sequence:
   ```bash
   curl -X POST -H "Authorization: Bearer <TOKEN>" https://<API_URL>/api/v1/runtime/projections/rebuild -d "branch_id=<BRANCH_ID>"
   ```

---

## 2. SOP: Reconnect Storm Handling

### Diagnostics
- Symptoms: Large influx of socket closures and re-registrations following network instability.
- Trigger: `RECONNECT_STORM` logged in `runtime_incidents` table.

### Mitigation Steps
1. Scale up operational container replica size (e.g. increase ECS task counts).
2. The `RuntimeConvergenceCoordinator` will automatically apply exponential client backoff pacing limits on surface registration requests.

---

## 3. SOP: Projection Rebuild Recovery

### Diagnostics
- Symptoms: Concurrent workers compete to write the same table projections, throwing constraint violations.

### Mitigation Steps
1. Force lease eviction of stale workers:
   ```bash
   curl -X POST -H "Authorization: Bearer <TOKEN>" https://<API_URL>/api/v1/runtime/deployment/start -d "branch_id=<BRANCH_ID>&deployment_id=<DEP_ID>&version=vX.Y.Z"
   ```
2. Force lock reset by restarting target worker clusters.

---

## 4. SOP: Drift Escalation & Alerts

### Diagnostics
- Symptoms: Convergence degradation score exceeds `30`.

### Recovery Procedure
- If degradation exceeds 30, the `IncidentService` automatically schedules an asynchronous full-branch table projection rebuild.
- If automatic rebuild fails twice, trigger pager duty notifications.

---

## 5. SOP: Deployment Rollback Lifecycle

### Steps
1. Mark the active deployment as failed:
   ```bash
   curl -X POST -H "Authorization: Bearer <TOKEN>" https://<API_URL>/api/v1/runtime/deployment/complete -d "branch_id=<BRANCH_ID>&status=failed"
   ```
2. The coordination service automatically clears active replay fences, allowing the previous generation epoch to resume.
