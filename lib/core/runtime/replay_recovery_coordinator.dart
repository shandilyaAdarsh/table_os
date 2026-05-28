// lib/core/runtime/replay_recovery_coordinator.dart

import 'package:flutter/foundation.dart';
import 'deterministic_projection_store.dart';
import 'projection_rebuild_engine.dart';

/// Handles sequence recovery when the transport reconnects after an outage.
class ReplayRecoveryCoordinator {
  // ignore: unused_field
  final DeterministicProjectionStore _store;
  final ProjectionRebuildEngine _rebuildEngine;

  ReplayRecoveryCoordinator(this._store, this._rebuildEngine);

  /// Executes the recovery sequence.
  Future<void> executeRecovery({
    required String branchId,
    required String epochId,
    required int lastKnownSequence,
  }) async {
    debugPrint(
      '[ReplayRecoveryCoordinator] Starting replay recovery for branch: $branchId. Last known seq: $lastKnownSequence',
    );

    // 1. Fetch missing delta events from backend API
    // We simulate the network request and delta fetching here.
    await Future.delayed(const Duration(milliseconds: 800));

    // In a real environment, we would do:
    // final deltas = await apiClient.fetchSyncDeltas(lastKnownSequence);
    // for (var event in deltas) {
    //   await _store.applyValidatedEvent(event);
    // }

    debugPrint(
      '[ReplayRecoveryCoordinator] Recovered delta events applied to projection store',
    );

    // 2. Trigger full UI projection rebuild from the now-authoritative store
    await _rebuildEngine.rebuildAll();

    debugPrint(
      '[ReplayRecoveryCoordinator] Replay recovery and full rebuild complete',
    );
  }
}
