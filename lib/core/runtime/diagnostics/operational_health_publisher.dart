// lib/core/runtime/diagnostics/operational_health_publisher.dart
//
// OperationalHealthPublisher — Riverpod reactive layer for runtime diagnostics.
//
// This is the ONLY provider the diagnostics UI reads from.
// It receives snapshots from RuntimeDiagnosticsCoordinator and exposes
// them as AsyncValue<RuntimeDiagnosticsSnapshot>.
//
// RULES:
//   - UI NEVER reads from RuntimeDiagnosticsCoordinator directly.
//   - UI ONLY reads from operationalHealthProvider (or derived providers).
//   - This notifier is updated by the coordinator's onSnapshot callback.
//   - All derived providers are computed from the snapshot — no extra state.

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'runtime_diagnostics_snapshot.dart';
import 'runtime_diagnostics_coordinator.dart';
import '../../../features/kitchen/domain/kitchen_runtime_coordinator.dart';

// ━━━━━━━━━━━━━━━━━━━━━━ NOTIFIER ━━━━━━━━━━━━━━━━━━━━━━

class OperationalHealthNotifier
    extends AsyncNotifier<RuntimeDiagnosticsSnapshot> {
  @override
  Future<RuntimeDiagnosticsSnapshot> build() async {
    // Start the coordinator and wire its output to this notifier
    final coordinator = ref.watch(runtimeDiagnosticsCoordinatorProvider);

    coordinator.start(
      onSnapshot: (snapshot) {
        state = AsyncValue.data(snapshot);
      },
    );

    // Return loading until first snapshot arrives
    return Future.value(coordinator.lastSnapshot ??
        await Future.delayed(
          const Duration(milliseconds: 100),
          () => coordinator.lastSnapshot,
        ).then((s) => s ?? _emptySnapshot()));
  }

  /// Force an immediate snapshot capture.
  void refresh() {
    final coordinator = ref.read(runtimeDiagnosticsCoordinatorProvider);
    coordinator.stop();
    coordinator.start(
      onSnapshot: (snapshot) {
        state = AsyncValue.data(snapshot);
        debugPrint('[OperationalHealthNotifier] Snapshot refreshed');
      },
    );
  }

  RuntimeDiagnosticsSnapshot _emptySnapshot() {
    final now = DateTime.now();
    return RuntimeDiagnosticsSnapshot(
      transport: const TransportHealthSnapshot(
        status: TransportHealthStatus.disconnected,
        reconnectAttempts: 0,
        maxReconnectAttempts: 5,
        messagesSent: 0,
        messagesReceived: 0,
        lastPingMs: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
      ),
      epoch: EpochDiagnosticsSnapshot(
        epochId: '__none__',
        branchId: '__none__',
        staffId: '__none__',
        isValid: false,
        issuedAt: now,
        hasActiveEpoch: false,
      ),
      sequence: const SequenceDiagnosticsSnapshot(
        expectedSequence: 0,
        processedEventCount: 0,
        duplicatesRejected: 0,
        gapsDetected: 0,
        staleEventsRejected: 0,
        branchId: '__none__',
      ),
      projections: const ProjectionDiagnosticsSnapshot(
        registeredProjections: 0,
        currentlyRebuilding: 0,
        staleProjections: 0,
        lastRebuildTimes: {},
      ),
      kds: const KdsDiagnosticsSnapshot(
        mode: KitchenRuntimeMode.degraded,
        activeTickets: 0,
        totalProjections: 0,
        staleProjections: 0,
        trackedTickets: 0,
        processedEventCount: 0,
      ),
      presence: const PresenceDiagnosticsSnapshot(
        activePresenceRecords: 0,
        activeHeartbeats: 0,
        sweepActive: false,
        ttlSeconds: 300,
        recentInvalidationCount: 0,
        processedEventCount: 0,
      ),
      mutations: const MutationDiagnosticsSnapshot(
        pendingMutations: 0,
        committedMutations: 0,
        failedMutations: 0,
      ),
      overallHealth: OverallRuntimeHealth.degraded,
      capturedAt: now,
      appVersion: '2.1.0+42',
      deviceId: 'staff-runtime-01',
    );
  }
}

/// The primary operational health provider.
/// All diagnostics UI reads from this.
final operationalHealthProvider =
    AsyncNotifierProvider<OperationalHealthNotifier, RuntimeDiagnosticsSnapshot>(
  OperationalHealthNotifier.new,
);

// ━━━━━━━━━━━━━━━━━━━━━━ DERIVED PROVIDERS ━━━━━━━━━━━━━━━━━━━━━━

/// Overall runtime health status.
final overallRuntimeHealthProvider = Provider<OverallRuntimeHealth>((ref) {
  return ref.watch(operationalHealthProvider).maybeWhen(
        data: (s) => s.overallHealth,
        orElse: () => OverallRuntimeHealth.degraded,
      );
});

/// Transport health snapshot.
final transportHealthProvider = Provider<TransportHealthSnapshot?>((ref) {
  return ref.watch(operationalHealthProvider).maybeWhen(
        data: (s) => s.transport,
        orElse: () => null,
      );
});

/// KDS runtime mode.
final kdsRuntimeHealthProvider = Provider<KdsDiagnosticsSnapshot?>((ref) {
  return ref.watch(operationalHealthProvider).maybeWhen(
        data: (s) => s.kds,
        orElse: () => null,
      );
});

/// Presence governance snapshot.
final presenceHealthProvider = Provider<PresenceDiagnosticsSnapshot?>((ref) {
  return ref.watch(operationalHealthProvider).maybeWhen(
        data: (s) => s.presence,
        orElse: () => null,
      );
});

/// Mutation backlog snapshot.
final mutationHealthProvider = Provider<MutationDiagnosticsSnapshot?>((ref) {
  return ref.watch(operationalHealthProvider).maybeWhen(
        data: (s) => s.mutations,
        orElse: () => null,
      );
});

/// True when any runtime layer is in a degraded or critical state.
final isRuntimeDegradedProvider = Provider<bool>((ref) {
  final health = ref.watch(overallRuntimeHealthProvider);
  return health == OverallRuntimeHealth.degraded ||
      health == OverallRuntimeHealth.critical;
});

/// True when a reconnect is in progress.
final isReconnectingProvider = Provider<bool>((ref) {
  return ref.watch(transportHealthProvider)?.isReconnecting ?? false;
});

/// True when replay recovery is active.
final isReplayingProvider = Provider<bool>((ref) {
  return ref.watch(transportHealthProvider)?.isReplaying ?? false;
});

/// True when KDS is in degraded or recovering mode.
final isKdsDegradedProvider = Provider<bool>((ref) {
  final kds = ref.watch(kdsRuntimeHealthProvider);
  return kds?.isDegraded == true || kds?.isRecovering == true;
});

/// Pending mutation count — for backlog badge.
final pendingMutationCountProvider = Provider<int>((ref) {
  return ref.watch(mutationHealthProvider)?.pendingMutations ?? 0;
});
