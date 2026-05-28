// lib/features/staff/domain/presence_governance_runtime.dart
//
// PresenceGovernanceRuntime — server-authoritative presence state machine.
//
// RULES:
//   - Local devices NEVER own presence truth.
//   - Presence state is ONLY updated via backend-authoritative events.
//   - Heartbeat TTL expiry is governed by PresenceHeartbeatManager.
//   - Stale sessions are invalidated centrally, not per-device.
//   - Branch isolation is enforced — no cross-branch presence leakage.
//   - Reconnect reconciliation prevents duplicate session creation.
//   - All presence projections are replay-safe and deterministically reconstructable.

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'entities/staff_presence.dart';
import 'presence_heartbeat_manager.dart';
import 'presence_invalidation_coordinator.dart';

// ━━━━━━━━━━━━━━━━━━━━━━ GOVERNANCE RESULT ━━━━━━━━━━━━━━━━━━━━━━

enum PresenceEventOutcome {
  /// Event accepted — presence projection updated.
  accepted,

  /// Event rejected — stale heartbeat (TTL expired).
  rejectedStaleHeartbeat,

  /// Event rejected — duplicate session for same staff member.
  rejectedDuplicateSession,

  /// Event rejected — wrong branch (cross-branch leakage prevention).
  rejectedBranch,

  /// Event rejected — stale epoch.
  rejectedEpoch,

  /// Event rejected — duplicate idempotency key.
  rejectedDuplicate,

  /// Session invalidated — TTL expired, presence removed.
  sessionInvalidated,
}

class PresenceEventResult {
  final PresenceEventOutcome outcome;
  final String? reason;

  const PresenceEventResult(this.outcome, {this.reason});

  bool get isAccepted => outcome == PresenceEventOutcome.accepted;
}

// ━━━━━━━━━━━━━━━━━━━━━━ GOVERNANCE RUNTIME ━━━━━━━━━━━━━━━━━━━━━━

class PresenceGovernanceRuntime {
  final PresenceHeartbeatManager _heartbeatManager;
  final PresenceInvalidationCoordinator _invalidationCoordinator;

  String? _activeBranchId;
  String? _activeEpochId;

  /// Authoritative presence projection store: staffId → record.
  final Map<String, StaffPresenceRecord> _presenceStore = {};

  /// Processed idempotency keys — deduplication gate.
  final Set<String> _processedKeys = {};

  /// Callback invoked when presence projections change.
  void Function(List<StaffPresenceRecord>)? _onProjectionChanged;

  PresenceGovernanceRuntime({
    required this._heartbeatManager,
    required this._invalidationCoordinator,
  });

  // ━━━━━━━━━━━━━━━━━━━━━━ SESSION LIFECYCLE ━━━━━━━━━━━━━━━━━━━━━━

  /// Activate governance for a branch session.
  void activateSession({
    required String branchId,
    required String epochId,
    required void Function(List<StaffPresenceRecord>) onProjectionChanged,
  }) {
    _activeBranchId = branchId;
    _activeEpochId = epochId;
    _onProjectionChanged = onProjectionChanged;
    _presenceStore.clear();
    _processedKeys.clear();

    // Start TTL sweep timer
    _heartbeatManager.startSweep(onExpired: _handleExpiredSessions);

    debugPrint(
      '[PresenceGovernanceRuntime] Session activated: branch=$branchId epoch=$epochId',
    );
  }

  /// Deactivate governance — clears all presence state.
  void deactivateSession() {
    _heartbeatManager.stopSweep();
    _presenceStore.clear();
    _processedKeys.clear();
    _activeBranchId = null;
    _activeEpochId = null;
    _onProjectionChanged = null;
    debugPrint('[PresenceGovernanceRuntime] Session deactivated');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ EVENT PIPELINE ━━━━━━━━━━━━━━━━━━━━━━

  /// Apply a validated staffPresenceUpdate event from the runtime pipeline.
  ///
  /// Called ONLY by OperationalRuntimeBridge._dispatchValidatedEvent().
  PresenceEventResult applyPresenceUpdate({
    required String idempotencyKey,
    required String branchId,
    required String epochId,
    required Map<String, dynamic> payload,
  }) {
    // ── Gate 1: Branch isolation ───────────────────────────────────────────
    if (_activeBranchId != null && branchId != _activeBranchId) {
      debugPrint(
        '[PresenceGovernanceRuntime] REJECTED (branch): $idempotencyKey '
        'event=$branchId active=$_activeBranchId',
      );
      return const PresenceEventResult(
        PresenceEventOutcome.rejectedBranch,
        reason: 'cross-branch-presence',
      );
    }

    // ── Gate 2: Epoch validation ───────────────────────────────────────────
    if (_activeEpochId != null && epochId != _activeEpochId) {
      debugPrint(
        '[PresenceGovernanceRuntime] REJECTED (epoch): $idempotencyKey',
      );
      return const PresenceEventResult(
        PresenceEventOutcome.rejectedEpoch,
        reason: 'stale-epoch',
      );
    }

    // ── Gate 3: Idempotency deduplication ─────────────────────────────────
    if (_processedKeys.contains(idempotencyKey)) {
      debugPrint(
        '[PresenceGovernanceRuntime] REJECTED (duplicate): $idempotencyKey',
      );
      return const PresenceEventResult(PresenceEventOutcome.rejectedDuplicate);
    }

    // ── Gate 4: Parse record ───────────────────────────────────────────────
    final StaffPresenceRecord record;
    try {
      record = StaffPresenceRecord.fromJson(payload);
    } catch (e) {
      debugPrint('[PresenceGovernanceRuntime] REJECTED (parse error): $e');
      return const PresenceEventResult(
        PresenceEventOutcome.rejectedDuplicate,
        reason: 'parse-error',
      );
    }

    // ── Gate 5: Heartbeat TTL validation ──────────────────────────────────
    if (_heartbeatManager.isHeartbeatExpired(record.lastHeartbeat)) {
      debugPrint(
        '[PresenceGovernanceRuntime] REJECTED (stale heartbeat): '
        'staffId=${record.staffId} lastHeartbeat=${record.lastHeartbeat}',
      );
      // Invalidate any existing record for this staff member
      _invalidateStaffPresence(record.staffId, reason: 'stale-heartbeat');
      return const PresenceEventResult(
        PresenceEventOutcome.rejectedStaleHeartbeat,
        reason: 'heartbeat-ttl-expired',
      );
    }

    // ── Gate 6: Duplicate session reconciliation ───────────────────────────
    final existing = _presenceStore[record.staffId];
    if (existing != null) {
      final reconcileResult = _invalidationCoordinator
          .reconcileDuplicateSession(existing: existing, incoming: record);
      if (!reconcileResult.shouldAcceptIncoming) {
        debugPrint(
          '[PresenceGovernanceRuntime] REJECTED (duplicate session): '
          'staffId=${record.staffId} reason=${reconcileResult.reason}',
        );
        return PresenceEventResult(
          PresenceEventOutcome.rejectedDuplicateSession,
          reason: reconcileResult.reason,
        );
      }
    }

    // ── Accept: update projection ──────────────────────────────────────────
    _processedKeys.add(idempotencyKey);
    _presenceStore[record.staffId] = record;

    // Register heartbeat with TTL manager
    _heartbeatManager.registerHeartbeat(
      staffId: record.staffId,
      lastHeartbeat: record.lastHeartbeat,
    );

    _publishProjection();

    debugPrint(
      '[PresenceGovernanceRuntime] ACCEPTED: staffId=${record.staffId} '
      'status=${record.status}',
    );
    return const PresenceEventResult(PresenceEventOutcome.accepted);
  }

  /// Apply a validated staffPresenceDelete event.
  PresenceEventResult applyPresenceDelete({
    required String idempotencyKey,
    required String branchId,
    required String epochId,
    required String staffId,
  }) {
    // Branch isolation
    if (_activeBranchId != null && branchId != _activeBranchId) {
      return const PresenceEventResult(PresenceEventOutcome.rejectedBranch);
    }

    // Epoch validation
    if (_activeEpochId != null && epochId != _activeEpochId) {
      return const PresenceEventResult(PresenceEventOutcome.rejectedEpoch);
    }

    // Idempotency
    if (_processedKeys.contains(idempotencyKey)) {
      return const PresenceEventResult(PresenceEventOutcome.rejectedDuplicate);
    }

    _processedKeys.add(idempotencyKey);
    _invalidateStaffPresence(staffId, reason: 'backend-delete');

    debugPrint(
      '[PresenceGovernanceRuntime] Deleted presence: staffId=$staffId',
    );
    return const PresenceEventResult(PresenceEventOutcome.accepted);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ RECONNECT RECONCILIATION ━━━━━━━━━━━━━━━━━━━━━━

  /// Execute presence reconciliation after reconnect.
  ///
  /// Fetches authoritative presence snapshot from backend,
  /// invalidates stale local projections, and rebuilds from snapshot.
  Future<void> executeReconnectReconciliation({
    required String branchId,
    required String epochId,
  }) async {
    debugPrint(
      '[PresenceGovernanceRuntime] Executing reconnect reconciliation: '
      'branch=$branchId',
    );

    // Invalidate all current projections — they may be stale
    _invalidationCoordinator.invalidateAll(
      branchId: branchId,
      reason: 'reconnect-reconciliation',
    );
    _presenceStore.clear();

    // Fetch authoritative snapshot
    final snapshot = await _fetchAuthoritativePresenceSnapshot(
      branchId: branchId,
      epochId: epochId,
    );

    // Rebuild from snapshot
    for (final record in snapshot) {
      // Skip expired heartbeats in snapshot
      if (_heartbeatManager.isHeartbeatExpired(record.lastHeartbeat)) {
        debugPrint(
          '[PresenceGovernanceRuntime] Skipping expired record in snapshot: '
          '${record.staffId}',
        );
        continue;
      }

      _presenceStore[record.staffId] = record;
      _heartbeatManager.registerHeartbeat(
        staffId: record.staffId,
        lastHeartbeat: record.lastHeartbeat,
      );
    }

    _publishProjection();
    debugPrint(
      '[PresenceGovernanceRuntime] Reconciliation complete: '
      '${_presenceStore.length} active records',
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ TTL EXPIRY HANDLER ━━━━━━━━━━━━━━━━━━━━━━

  void _handleExpiredSessions(List<String> expiredStaffIds) {
    if (expiredStaffIds.isEmpty) return;

    debugPrint(
      '[PresenceGovernanceRuntime] TTL expiry: ${expiredStaffIds.length} sessions',
    );

    for (final staffId in expiredStaffIds) {
      _invalidateStaffPresence(staffId, reason: 'heartbeat-ttl-expired');
    }

    _publishProjection();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ INVALIDATION ━━━━━━━━━━━━━━━━━━━━━━

  void _invalidateStaffPresence(String staffId, {required String reason}) {
    final removed = _presenceStore.remove(staffId);
    if (removed != null) {
      _heartbeatManager.removeHeartbeat(staffId);
      _invalidationCoordinator.invalidateRecord(
        staffId: staffId,
        reason: reason,
      );
      debugPrint(
        '[PresenceGovernanceRuntime] Invalidated presence: '
        'staffId=$staffId reason=$reason',
      );
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ PROJECTION PUBLICATION ━━━━━━━━━━━━━━━━━━━━━━

  void _publishProjection() {
    final projection = _presenceStore.values.toList();
    _onProjectionChanged?.call(projection);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ QUERY ━━━━━━━━━━━━━━━━━━━━━━

  List<StaffPresenceRecord> getPresenceProjection() =>
      _presenceStore.values.toList();

  StaffPresenceRecord? getStaffRecord(String staffId) =>
      _presenceStore[staffId];

  // ━━━━━━━━━━━━━━━━━━━━━━ BACKEND STUB ━━━━━━━━━━━━━━━━━━━━━━

  Future<List<StaffPresenceRecord>> _fetchAuthoritativePresenceSnapshot({
    required String branchId,
    required String epochId,
  }) async {
    debugPrint(
      '[PresenceGovernanceRuntime] Fetching presence snapshot: branch=$branchId',
    );
    try {
      // Fetch staff with presence fields; last_heartbeat_at drives TTL validation.
      final response = await Supabase.instance.client
          .from('staff')
          .select('id, name, role, status, section, last_heartbeat_at, active_table_count, sla_compliance_rate')
          .eq('branch_id', branchId);

      final list = response as List;
      final List<StaffPresenceRecord> records = [];
      for (final row in list) {
        // Parse last_heartbeat_at — fall back to epoch if column is null/missing
        // so HeartbeatManager will immediately flag these records as expired.
        final heartbeatRaw = row['last_heartbeat_at'] as String?;
        final lastHeartbeat = heartbeatRaw != null
            ? DateTime.tryParse(heartbeatRaw) ?? DateTime.fromMillisecondsSinceEpoch(0)
            : DateTime.fromMillisecondsSinceEpoch(0);

        // Map DB status string to StaffPresenceStatus enum.
        final statusStr = (row['status'] as String?)?.toLowerCase() ?? '';
        final presenceStatus = switch (statusStr) {
          'online' => StaffPresenceStatus.online,
          'busy' => StaffPresenceStatus.busy,
          'break' => StaffPresenceStatus.onBreak,
          'offline' => StaffPresenceStatus.offline,
          _ => StaffPresenceStatus.offline,
        };

        records.add(StaffPresenceRecord(
          staffId: row['id'] as String,
          name: row['name'] as String? ?? 'Unknown',
          role: row['role'] as String? ?? 'Waiter',
          status: presenceStatus,
          sectionId: row['section'] as String?,
          sectionLabel: row['section'] as String?,
          activeTableCount: (row['active_table_count'] as int?) ?? 0,
          slaComplianceRate: (row['sla_compliance_rate'] as num?)?.toDouble() ?? 1.0,
          lastHeartbeat: lastHeartbeat,
        ));
      }
      debugPrint('[PresenceGovernanceRuntime] Snapshot fetched: ${records.length} staff records');
      return records;
    } catch (e) {
      debugPrint('[PresenceGovernanceRuntime] Fetch presence snapshot failed: $e');
    }
    return [];
  }

  Map<String, dynamic> getStats() => {
    'activeBranchId': _activeBranchId,
    'activeEpochId': _activeEpochId,
    'presenceCount': _presenceStore.length,
    'processedEventCount': _processedKeys.length,
    'heartbeatStats': _heartbeatManager.getStats(),
  };
}
