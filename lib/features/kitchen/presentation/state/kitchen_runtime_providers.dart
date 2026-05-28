// lib/features/kitchen/presentation/state/kitchen_runtime_providers.dart
//
// Kitchen runtime Riverpod providers.
//
// WIRING:
//   KitchenRuntimeCoordinator (singleton, keepAlive)
//     ├── KitchenProjectionRebuildEngine
//     └── TicketReplayRecoveryCoordinator
//
// KitchenTicketProjectionNotifier — reactive projection layer.
//   Receives projection updates from KitchenRuntimeCoordinator
//   and exposes them as AsyncValue<List<KitchenTicket>>.
//
// RULES:
//   - UI NEVER reads from KitchenRuntimeCoordinator directly.
//   - UI ONLY reads from KitchenTicketProjectionNotifier.
//   - All mutations flow through OperationalRuntimeBridge.
//   - Offline degraded mode is surfaced via KitchenRuntimeModeProvider.

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/kitchen_ticket.dart';
import '../../domain/kitchen_runtime_coordinator.dart';
import '../../domain/kitchen_projection_rebuild_engine.dart';
import '../../domain/ticket_replay_recovery_coordinator.dart';

// ━━━━━━━━━━━━━━━━━━━━━━ CORE RUNTIME PROVIDERS ━━━━━━━━━━━━━━━━━━━━━━

/// Singleton rebuild engine — lives for app lifetime.
final kitchenProjectionRebuildEngineProvider =
    Provider<KitchenProjectionRebuildEngine>((ref) {
  return KitchenProjectionRebuildEngine();
});

/// Singleton replay recovery coordinator.
final ticketReplayRecoveryCoordinatorProvider =
    Provider<TicketReplayRecoveryCoordinator>((ref) {
  return TicketReplayRecoveryCoordinator(ref);
});

/// Singleton KitchenRuntimeCoordinator — the ONLY gateway for kitchen events.
final kitchenRuntimeCoordinatorProvider =
    Provider<KitchenRuntimeCoordinator>((ref) {
  final rebuildEngine = ref.watch(kitchenProjectionRebuildEngineProvider);
  final replayCoordinator =
      ref.watch(ticketReplayRecoveryCoordinatorProvider);

  return KitchenRuntimeCoordinator(
    rebuildEngine: rebuildEngine,
    replayCoordinator: replayCoordinator,
  );
});

// ━━━━━━━━━━━━━━━━━━━━━━ PROJECTION NOTIFIER ━━━━━━━━━━━━━━━━━━━━━━

/// Reactive kitchen ticket projection.
///
/// This is the ONLY provider UI widgets should watch for kitchen state.
/// State is updated exclusively by KitchenRuntimeCoordinator via
/// [KitchenTicketProjectionNotifier.applyProjectionUpdate].
class KitchenTicketProjectionNotifier
    extends AsyncNotifier<List<KitchenTicket>> {
  @override
  Future<List<KitchenTicket>> build() async {
    // Initial state — empty queue until first projection arrives
    return const [];
  }

  /// Called by OperationalRuntimeBridge after a kitchen event is processed.
  /// NEVER call this directly from UI code.
  void applyProjectionUpdate(List<KitchenTicket> tickets) {
    state = AsyncValue.data(tickets);
    debugPrint(
        '[KitchenTicketProjectionNotifier] Projection updated: ${tickets.length} tickets');
  }

  /// Called on session end or offline degradation.
  void clearProjection() {
    state = const AsyncValue.data([]);
    debugPrint('[KitchenTicketProjectionNotifier] Projection cleared');
  }

  /// Called during recovery — shows loading state.
  void enterRecoveryState() {
    state = const AsyncValue.loading();
    debugPrint('[KitchenTicketProjectionNotifier] Entered recovery state');
  }
}

final kitchenTicketProjectionProvider =
    AsyncNotifierProvider<KitchenTicketProjectionNotifier, List<KitchenTicket>>(
  KitchenTicketProjectionNotifier.new,
);

// ━━━━━━━━━━━━━━━━━━━━━━ DERIVED PROVIDERS ━━━━━━━━━━━━━━━━━━━━━━

/// Current kitchen runtime mode (live / degraded / recovering).
final kitchenRuntimeModeProvider = Provider<KitchenRuntimeMode>((ref) {
  return ref.watch(kitchenRuntimeCoordinatorProvider).mode;
});

/// Active (non-terminal) tickets sorted by receivedAt.
final activeKitchenQueueProvider = Provider<List<KitchenTicket>>((ref) {
  return ref.watch(kitchenTicketProjectionProvider).maybeWhen(
        data: (tickets) =>
            tickets.where((t) => !t.isTerminal).toList()
              ..sort((a, b) => a.receivedAt.compareTo(b.receivedAt)),
        orElse: () => const [],
      );
});

/// Tickets in [KitchenTicketStatus.queued] state.
final queuedTicketsProvider = Provider<List<KitchenTicket>>((ref) {
  return ref.watch(activeKitchenQueueProvider)
      .where((t) => t.status == KitchenTicketStatus.queued)
      .toList();
});

/// Tickets in [KitchenTicketStatus.preparing] or [KitchenTicketStatus.partiallyReady].
final preparingTicketsProvider = Provider<List<KitchenTicket>>((ref) {
  return ref.watch(activeKitchenQueueProvider).where((t) =>
      t.status == KitchenTicketStatus.preparing ||
      t.status == KitchenTicketStatus.partiallyReady).toList();
});

/// Tickets in [KitchenTicketStatus.ready] state.
final readyTicketsProvider = Provider<List<KitchenTicket>>((ref) {
  return ref.watch(activeKitchenQueueProvider)
      .where((t) => t.status == KitchenTicketStatus.ready)
      .toList();
});

/// Tickets past their SLA deadline.
final delayedTicketsProvider = Provider<List<KitchenTicket>>((ref) {
  return ref.watch(activeKitchenQueueProvider)
      .where((t) => t.isDelayed)
      .toList();
});

/// Tickets recovered via replay (shown with recovery indicator in UI).
final replayRecoveredTicketsProvider = Provider<List<KitchenTicket>>((ref) {
  return ref.watch(activeKitchenQueueProvider)
      .where((t) => t.isReplayRecovered)
      .toList();
});
