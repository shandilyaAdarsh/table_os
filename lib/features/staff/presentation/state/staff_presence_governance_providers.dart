// lib/features/staff/presentation/state/staff_presence_governance_providers.dart
//
// Staff presence governance Riverpod providers.
//
// WIRING:
//   PresenceGovernanceRuntime (singleton, keepAlive)
//     ├── PresenceHeartbeatManager  — TTL sweep
//     └── PresenceInvalidationCoordinator — stale session cleanup
//
// PresenceProjectionNotifier — reactive projection layer.
//   Receives projection updates from PresenceGovernanceRuntime
//   and exposes them as AsyncValue<List<StaffPresenceRecord>>.
//
// RULES:
//   - UI NEVER reads from PresenceGovernanceRuntime directly.
//   - UI ONLY reads from PresenceProjectionNotifier (or derived providers).
//   - All presence mutations flow through OperationalRuntimeBridge.
//   - Local devices NEVER infer online/offline status independently.
//   - Presence state is ONLY authoritative when sourced from backend events.

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/staff_presence.dart';
import '../../domain/presence_governance_runtime.dart';
import '../../domain/presence_heartbeat_manager.dart';
import '../../domain/presence_invalidation_coordinator.dart';

// ━━━━━━━━━━━━━━━━━━━━━━ CORE GOVERNANCE PROVIDERS ━━━━━━━━━━━━━━━━━━━━━━

/// Singleton heartbeat manager — lives for app lifetime.
final presenceHeartbeatManagerProvider =
    Provider<PresenceHeartbeatManager>((ref) {
  final manager = PresenceHeartbeatManager(
    ttl: const Duration(minutes: 5),
    delayedHeartbeatTolerance: const Duration(seconds: 30),
    sweepInterval: const Duration(seconds: 30),
  );
  ref.onDispose(manager.dispose);
  return manager;
});

/// Singleton invalidation coordinator.
final presenceInvalidationCoordinatorProvider =
    Provider<PresenceInvalidationCoordinator>((ref) {
  return PresenceInvalidationCoordinator();
});

/// Singleton PresenceGovernanceRuntime — the ONLY gateway for presence events.
final presenceGovernanceRuntimeProvider =
    Provider<PresenceGovernanceRuntime>((ref) {
  final heartbeatManager = ref.watch(presenceHeartbeatManagerProvider);
  final invalidationCoordinator =
      ref.watch(presenceInvalidationCoordinatorProvider);

  return PresenceGovernanceRuntime(
    heartbeatManager: heartbeatManager,
    invalidationCoordinator: invalidationCoordinator,
  );
});

// ━━━━━━━━━━━━━━━━━━━━━━ PROJECTION NOTIFIER ━━━━━━━━━━━━━━━━━━━━━━

/// Reactive staff presence projection.
///
/// This is the ONLY provider UI widgets should watch for presence state.
/// State is updated exclusively by PresenceGovernanceRuntime via
/// [PresenceProjectionNotifier.applyProjectionUpdate].
///
/// Replaces the mock-data [StaffPresenceNotifier] for production use.
class PresenceProjectionNotifier
    extends AsyncNotifier<List<StaffPresenceRecord>> {
  @override
  Future<List<StaffPresenceRecord>> build() async {
    // Initial state — empty until first authoritative projection arrives
    return const [];
  }

  /// Called by PresenceGovernanceRuntime when projection changes.
  /// NEVER call this directly from UI code.
  void applyProjectionUpdate(List<StaffPresenceRecord> records) {
    state = AsyncValue.data(List.unmodifiable(records));
    debugPrint(
        '[PresenceProjectionNotifier] Projection updated: ${records.length} records');
  }

  /// Called on session end.
  void clearProjection() {
    state = const AsyncValue.data([]);
    debugPrint('[PresenceProjectionNotifier] Projection cleared');
  }

  /// Called during reconnect reconciliation — shows loading state.
  void enterReconciliationState() {
    state = const AsyncValue.loading();
    debugPrint('[PresenceProjectionNotifier] Entered reconciliation state');
  }
}

/// The authoritative presence projection provider.
/// UI widgets watch this — never the governance runtime directly.
final presenceProjectionProvider =
    AsyncNotifierProvider<PresenceProjectionNotifier, List<StaffPresenceRecord>>(
  PresenceProjectionNotifier.new,
);

// ━━━━━━━━━━━━━━━━━━━━━━ DERIVED PROVIDERS ━━━━━━━━━━━━━━━━━━━━━━

/// Staff members who are currently online or busy (backend-authoritative).
final governedOnlineStaffProvider = Provider<List<StaffPresenceRecord>>((ref) {
  return ref.watch(presenceProjectionProvider).maybeWhen(
        data: (list) => list.where((r) => r.isOnline).toList(),
        orElse: () => const [],
      );
});

/// Staff members whose activeTableCount exceeds 5 (overloaded).
final governedOverloadedStaffProvider =
    Provider<List<StaffPresenceRecord>>((ref) {
  return ref.watch(presenceProjectionProvider).maybeWhen(
        data: (list) => list.where((r) => r.isOverloaded).toList(),
        orElse: () => const [],
      );
});

/// Branch load percentage across online staff (0.0–1.0).
final governedBranchLoadProvider = Provider<double>((ref) {
  const capacityPerStaff = 6;
  return ref.watch(presenceProjectionProvider).maybeWhen(
        data: (list) {
          final online = list.where((r) => r.isOnline).toList();
          if (online.isEmpty) return 0.0;
          final totalTables =
              online.fold<int>(0, (sum, r) => sum + r.activeTableCount);
          final totalCapacity = online.length * capacityPerStaff;
          return (totalTables / totalCapacity).clamp(0.0, 1.0);
        },
        orElse: () => 0.0,
      );
});

/// Staff members grouped by section.
final staffBySectionProvider =
    Provider<Map<String, List<StaffPresenceRecord>>>((ref) {
  return ref.watch(presenceProjectionProvider).maybeWhen(
        data: (list) {
          final grouped = <String, List<StaffPresenceRecord>>{};
          for (final record in list) {
            final section = record.sectionLabel ?? 'Unassigned';
            grouped.putIfAbsent(section, () => []).add(record);
          }
          return grouped;
        },
        orElse: () => const {},
      );
});
