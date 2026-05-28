// lib/features/kitchen/domain/kitchen_runtime_coordinator.dart
//
// KitchenRuntimeCoordinator — centralized governance for ALL kitchen state.
//
// PIPELINE (enforced, no exceptions):
//   RuntimeEvent (kitchenItemUpdate | kitchenQueueUpdate)
//     → KitchenRuntimeCoordinator.applyEvent()
//       → Sequence gate (reject stale / duplicate)
//         → Epoch gate (reject cross-epoch events)
//           → KitchenProjectionRebuildEngine.rebuild()
//             → Deterministic ticket reconstruction
//               → Reactive projection publication
//
// RULES:
//   - NO direct state mutation from websocket payloads.
//   - NO local kitchen truth ownership.
//   - ALL ticket state derives from authoritative projections.
//   - Offline devices enter readonly degraded mode.
//   - Reconnect triggers full replay recovery.

import 'package:flutter/foundation.dart';
import 'entities/kitchen_ticket.dart';
import 'kitchen_projection_rebuild_engine.dart';
import 'ticket_replay_recovery_coordinator.dart';

// ━━━━━━━━━━━━━━━━━━━━━━ CONVERGENCE RESULT ━━━━━━━━━━━━━━━━━━━━━━

enum KitchenEventOutcome {
  /// Event accepted and projection rebuilt.
  accepted,

  /// Event rejected — stale sequence.
  rejectedStale,

  /// Event rejected — duplicate idempotency key.
  rejectedDuplicate,

  /// Event rejected — epoch mismatch.
  rejectedEpoch,

  /// Event rejected — wrong branch.
  rejectedBranch,

  /// Event queued — device is in offline degraded mode.
  queuedOffline,
}

class KitchenEventResult {
  final KitchenEventOutcome outcome;
  final String? reason;

  const KitchenEventResult(this.outcome, {this.reason});

  bool get isAccepted => outcome == KitchenEventOutcome.accepted;
}

// ━━━━━━━━━━━━━━━━━━━━━━ KITCHEN RUNTIME STATE ━━━━━━━━━━━━━━━━━━━━━━

enum KitchenRuntimeMode {
  /// Normal operation — events accepted and projected.
  live,

  /// Offline degraded — readonly, no mutations accepted.
  degraded,

  /// Recovering — replay in progress, UI shows stale indicator.
  recovering,
}

// ━━━━━━━━━━━━━━━━━━━━━━ COORDINATOR ━━━━━━━━━━━━━━━━━━━━━━

class KitchenRuntimeCoordinator {
  final KitchenProjectionRebuildEngine _rebuildEngine;
  final TicketReplayRecoveryCoordinator _replayCoordinator;

  KitchenRuntimeMode _mode = KitchenRuntimeMode.live;
  String? _activeBranchId;
  String? _activeEpochId;

  /// Per-ticket last-accepted sequence numbers for concurrent mutation safety.
  final Map<String, int> _ticketLastSequence = {};

  /// Processed idempotency keys — deduplication gate.
  final Set<String> _processedKeys = {};

  KitchenRuntimeCoordinator({
    required this._rebuildEngine,
    required this._replayCoordinator,
  });

  // ── Getters ───────────────────────────────────────────────────────────────

  KitchenRuntimeMode get mode => _mode;
  bool get isLive => _mode == KitchenRuntimeMode.live;
  bool get isDegraded => _mode == KitchenRuntimeMode.degraded;
  bool get isRecovering => _mode == KitchenRuntimeMode.recovering;

  // ━━━━━━━━━━━━━━━━━━━━━━ SESSION LIFECYCLE ━━━━━━━━━━━━━━━━━━━━━━

  /// Called by OperationalRuntimeBridge when a session starts.
  void activateSession({required String branchId, required String epochId}) {
    _activeBranchId = branchId;
    _activeEpochId = epochId;
    _mode = KitchenRuntimeMode.live;
    _ticketLastSequence.clear();
    _processedKeys.clear();
    debugPrint(
      '[KitchenRuntimeCoordinator] Session activated: branch=$branchId epoch=$epochId',
    );
  }

  /// Called on session end / logout.
  void deactivateSession() {
    _activeBranchId = null;
    _activeEpochId = null;
    _mode = KitchenRuntimeMode.degraded;
    _ticketLastSequence.clear();
    _processedKeys.clear();
    _rebuildEngine.clearAll();
    debugPrint('[KitchenRuntimeCoordinator] Session deactivated');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ OFFLINE DEGRADATION ━━━━━━━━━━━━━━━━━━━━━━

  /// Called by RealtimeSyncManager when transport disconnects.
  void enterDegradedMode() {
    if (_mode == KitchenRuntimeMode.degraded) return;
    _mode = KitchenRuntimeMode.degraded;
    debugPrint(
      '[KitchenRuntimeCoordinator] Entered DEGRADED mode — kitchen is readonly',
    );
  }

  /// Called when transport reconnects — triggers replay recovery.
  Future<void> exitDegradedMode({
    required String branchId,
    required String epochId,
    required int lastKnownSequence,
  }) async {
    debugPrint(
      '[KitchenRuntimeCoordinator] Exiting degraded mode — starting recovery',
    );
    _mode = KitchenRuntimeMode.recovering;

    // Invalidate all stale projections before recovery
    _rebuildEngine.invalidateAll(reason: 'reconnect-recovery');

    // Execute replay recovery
    await _replayCoordinator.executeRecovery(
      branchId: branchId,
      epochId: epochId,
      lastKnownSequence: lastKnownSequence,
      onTicketRecovered: (ticket) {
        _rebuildEngine.applyProjection(ticket);
        debugPrint(
          '[KitchenRuntimeCoordinator] Recovered ticket: ${ticket.ticketId}',
        );
      },
    );

    _activeBranchId = branchId;
    _activeEpochId = epochId;
    _mode = KitchenRuntimeMode.live;
    debugPrint(
      '[KitchenRuntimeCoordinator] Recovery complete — back to LIVE mode',
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ EVENT PIPELINE ━━━━━━━━━━━━━━━━━━━━━━

  /// Apply a validated kitchen event from the runtime pipeline.
  ///
  /// Called ONLY by OperationalRuntimeBridge._dispatchValidatedEvent().
  /// The event has already passed epoch + sequence + dedup validation
  /// in RealtimeEventRouter. This method enforces kitchen-specific
  /// convergence rules on top.
  KitchenEventResult applyEvent({
    required String idempotencyKey,
    required int sequenceNumber,
    required String branchId,
    required String epochId,
    required Map<String, dynamic> payload,
    required bool
    isItemUpdate, // true=kitchenItemUpdate, false=kitchenQueueUpdate
  }) {
    // ── Gate 1: Offline degraded — reject mutations ────────────────────────
    if (_mode == KitchenRuntimeMode.degraded) {
      debugPrint(
        '[KitchenRuntimeCoordinator] QUEUED (offline): $idempotencyKey',
      );
      return const KitchenEventResult(
        KitchenEventOutcome.queuedOffline,
        reason: 'device-offline',
      );
    }

    // ── Gate 2: Branch isolation ───────────────────────────────────────────
    if (_activeBranchId != null && branchId != _activeBranchId) {
      debugPrint(
        '[KitchenRuntimeCoordinator] REJECTED (branch): $idempotencyKey '
        'event=$branchId active=$_activeBranchId',
      );
      return const KitchenEventResult(
        KitchenEventOutcome.rejectedBranch,
        reason: 'cross-branch-event',
      );
    }

    // ── Gate 3: Epoch validation ───────────────────────────────────────────
    if (_activeEpochId != null && epochId != _activeEpochId) {
      debugPrint(
        '[KitchenRuntimeCoordinator] REJECTED (epoch): $idempotencyKey '
        'event=$epochId active=$_activeEpochId',
      );
      return const KitchenEventResult(
        KitchenEventOutcome.rejectedEpoch,
        reason: 'stale-epoch',
      );
    }

    // ── Gate 4: Idempotency deduplication ─────────────────────────────────
    if (_processedKeys.contains(idempotencyKey)) {
      debugPrint(
        '[KitchenRuntimeCoordinator] REJECTED (duplicate): $idempotencyKey',
      );
      return const KitchenEventResult(KitchenEventOutcome.rejectedDuplicate);
    }

    // ── Gate 5: Per-ticket concurrent mutation safety ─────────────────────
    final ticketId =
        payload['ticketId'] as String? ?? payload['orderId'] as String? ?? '';
    if (ticketId.isNotEmpty) {
      final lastSeq = _ticketLastSequence[ticketId] ?? 0;
      if (sequenceNumber <= lastSeq) {
        debugPrint(
          '[KitchenRuntimeCoordinator] REJECTED (stale): ticket=$ticketId '
          'seq=$sequenceNumber lastAccepted=$lastSeq',
        );
        return const KitchenEventResult(
          KitchenEventOutcome.rejectedStale,
          reason: 'stale-sequence-for-ticket',
        );
      }
    }

    // ── Accept: record key and advance per-ticket sequence ─────────────────
    _processedKeys.add(idempotencyKey);
    if (ticketId.isNotEmpty) {
      _ticketLastSequence[ticketId] = sequenceNumber;
    }

    // ── Rebuild projection ─────────────────────────────────────────────────
    if (isItemUpdate) {
      _rebuildEngine.applyItemUpdate(
        payload: payload,
        epochId: epochId,
        sequence: sequenceNumber,
      );
    } else {
      _rebuildEngine.applyQueueUpdate(
        payload: payload,
        epochId: epochId,
        sequence: sequenceNumber,
      );
    }

    debugPrint(
      '[KitchenRuntimeCoordinator] ACCEPTED: $idempotencyKey seq=$sequenceNumber',
    );
    return const KitchenEventResult(KitchenEventOutcome.accepted);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ QUERY ━━━━━━━━━━━━━━━━━━━━━━

  /// Get the current authoritative ticket projection for a ticket ID.
  KitchenTicket? getTicket(String ticketId) =>
      _rebuildEngine.getTicket(ticketId);

  /// Get all active (non-terminal) tickets for the active branch.
  List<KitchenTicket> getActiveQueue() => _rebuildEngine.getActiveQueue();

  /// Get all tickets sorted by received time (deterministic ordering).
  List<KitchenTicket> getOrderedQueue() => _rebuildEngine.getOrderedQueue();

  // ━━━━━━━━━━━━━━━━━━━━━━ STATS ━━━━━━━━━━━━━━━━━━━━━━

  Map<String, dynamic> getStats() => {
    'mode': _mode.name,
    'activeBranchId': _activeBranchId,
    'activeEpochId': _activeEpochId,
    'processedEventCount': _processedKeys.length,
    'trackedTickets': _ticketLastSequence.length,
    'projectionStats': _rebuildEngine.getStats(),
  };
}
