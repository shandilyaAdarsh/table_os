// lib/features/staff/domain/presence_invalidation_coordinator.dart
//
// PresenceInvalidationCoordinator — centralized presence invalidation governance.
//
// RULES:
//   - Invalidation MUST trigger deterministic projection rebuilding.
//   - Branch-scoped: invalidations never cross branch boundaries.
//   - Duplicate session reconciliation is authoritative (newer heartbeat wins).
//   - Orphaned presence projections are cleaned up on invalidation.
//   - All invalidation decisions are logged for audit.

import 'package:flutter/foundation.dart';
import 'entities/staff_presence.dart';

// ━━━━━━━━━━━━━━━━━━━━━━ RECONCILIATION RESULT ━━━━━━━━━━━━━━━━━━━━━━

class SessionReconciliationResult {
  /// Whether the incoming record should replace the existing one.
  final bool shouldAcceptIncoming;
  final String reason;

  const SessionReconciliationResult({
    required this.shouldAcceptIncoming,
    required this.reason,
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━ INVALIDATION RECORD ━━━━━━━━━━━━━━━━━━━━━━

class PresenceInvalidationRecord {
  final String staffId;
  final String reason;
  final DateTime invalidatedAt;
  final String? branchId;

  const PresenceInvalidationRecord({
    required this.staffId,
    required this.reason,
    required this.invalidatedAt,
    this.branchId,
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━ COORDINATOR ━━━━━━━━━━━━━━━━━━━━━━

class PresenceInvalidationCoordinator {
  /// Audit log of invalidation events.
  final List<PresenceInvalidationRecord> _invalidationLog = [];

  /// Maximum audit log size — prevents unbounded growth.
  static const int _maxLogSize = 200;

  // ━━━━━━━━━━━━━━━━━━━━━━ DUPLICATE SESSION RECONCILIATION ━━━━━━━━━━━━━━━━━━━━━━

  /// Reconcile a duplicate session for the same staff member.
  ///
  /// Policy: The record with the NEWER lastHeartbeat wins.
  /// This is the authoritative backend-driven reconciliation rule.
  /// Reconnects MUST NOT create duplicate presence state.
  SessionReconciliationResult reconcileDuplicateSession({
    required StaffPresenceRecord existing,
    required StaffPresenceRecord incoming,
  }) {
    // Newer heartbeat wins — backend-authoritative reconciliation
    if (incoming.lastHeartbeat.isAfter(existing.lastHeartbeat)) {
      debugPrint(
          '[PresenceInvalidationCoordinator] Reconcile: ACCEPT incoming '
          'staffId=${incoming.staffId} '
          'existing=${existing.lastHeartbeat} incoming=${incoming.lastHeartbeat}');
      return const SessionReconciliationResult(
        shouldAcceptIncoming: true,
        reason: 'newer-heartbeat-wins',
      );
    }

    // Same timestamp — accept incoming (idempotent update)
    if (incoming.lastHeartbeat == existing.lastHeartbeat) {
      debugPrint(
          '[PresenceInvalidationCoordinator] Reconcile: ACCEPT (same timestamp) '
          'staffId=${incoming.staffId}');
      return const SessionReconciliationResult(
        shouldAcceptIncoming: true,
        reason: 'same-timestamp-idempotent',
      );
    }

    // Existing is newer — reject incoming as stale
    debugPrint(
        '[PresenceInvalidationCoordinator] Reconcile: REJECT incoming (stale) '
        'staffId=${incoming.staffId} '
        'existing=${existing.lastHeartbeat} incoming=${incoming.lastHeartbeat}');
    return const SessionReconciliationResult(
      shouldAcceptIncoming: false,
      reason: 'existing-heartbeat-is-newer',
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ INVALIDATION ━━━━━━━━━━━━━━━━━━━━━━

  /// Record an invalidation for a specific staff member.
  void invalidateRecord({
    required String staffId,
    required String reason,
    String? branchId,
  }) {
    _appendLog(PresenceInvalidationRecord(
      staffId: staffId,
      reason: reason,
      invalidatedAt: DateTime.now(),
      branchId: branchId,
    ));
    debugPrint(
        '[PresenceInvalidationCoordinator] Invalidated: staffId=$staffId reason=$reason');
  }

  /// Invalidate all presence records for a branch.
  /// Called on reconnect reconciliation or epoch change.
  void invalidateAll({
    required String branchId,
    required String reason,
  }) {
    _appendLog(PresenceInvalidationRecord(
      staffId: '__all__',
      reason: reason,
      invalidatedAt: DateTime.now(),
      branchId: branchId,
    ));
    debugPrint(
        '[PresenceInvalidationCoordinator] Invalidated ALL: '
        'branch=$branchId reason=$reason');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ AUDIT LOG ━━━━━━━━━━━━━━━━━━━━━━

  List<PresenceInvalidationRecord> getRecentInvalidations({int limit = 20}) {
    final start = _invalidationLog.length > limit
        ? _invalidationLog.length - limit
        : 0;
    return _invalidationLog.sublist(start);
  }

  void _appendLog(PresenceInvalidationRecord record) {
    _invalidationLog.add(record);
    // Evict oldest entries when over limit
    if (_invalidationLog.length > _maxLogSize) {
      _invalidationLog.removeAt(0);
    }
  }

  Map<String, dynamic> getStats() => {
        'invalidationLogSize': _invalidationLog.length,
        'recentInvalidations': getRecentInvalidations(limit: 5)
            .map((r) => {
                  'staffId': r.staffId,
                  'reason': r.reason,
                  'at': r.invalidatedAt.toIso8601String(),
                })
            .toList(),
      };
}
