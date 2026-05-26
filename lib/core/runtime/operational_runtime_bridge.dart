// lib/core/runtime/operational_runtime_bridge.dart
//
// OperationalRuntimeBridge — the ONLY gateway connecting RealtimeSyncManager
// to RuntimeOrchestrator.
//
// ALL realtime events MUST flow through this bridge:
//   WebSocket → RealtimeSyncManager → OperationalRuntimeBridge
//     → RuntimeOrchestrator (epoch + dedup + sequence validation)
//       → EventDispatch (applyRemote* on correct repository/notifier)
//         → InvalidationCoordinator → ProjectionRebuildEngine
//
// Kitchen events additionally flow through:
//   → KitchenRuntimeCoordinator → KitchenProjectionRebuildEngine
//     → KitchenTicketProjectionNotifier (reactive UI layer)
//
// Presence events additionally flow through:
//   → PresenceGovernanceRuntime → PresenceHeartbeatManager
//     → PresenceProjectionNotifier (reactive UI layer)
//
// NO feature module may consume websocket payloads directly.
// NO direct state mutation from realtime payloads.

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'domain/runtime_event.dart';
import 'operational_runtime_hydrator.dart';
import 'runtime_orchestrator.dart';
import 'deterministic_projection_store.dart';
import 'mutation_acknowledgement_manager.dart';
import 'replay_recovery_coordinator.dart';
import 'invalidation_coordinator.dart';
import 'projection_rebuild_engine.dart';
import '../network/realtime_sync_manager.dart';
import '../../features/auth/presentation/state/auth_notifier.dart';
import '../../features/manager/presentation/state/manager_providers.dart';
import '../../features/reservations/presentation/state/reservations_notifier.dart';
import '../../features/realtime/presentation/state/realtime_providers.dart';

import '../../features/orders/providers/orders_providers.dart';
import '../../features/tables/providers/tables_providers.dart';
import '../../features/waiter_calls/presentation/state/waiter_calls_providers.dart';
// KDS runtime
import '../../features/kitchen/presentation/state/kitchen_runtime_providers.dart';
// Presence governance
import '../../features/staff/presentation/state/staff_presence_governance_providers.dart';

// ━━━━━━━━━━━━━━━━━━━━━━ BRIDGE ━━━━━━━━━━━━━━━━━━━━━━

class OperationalRuntimeBridge {
  final RuntimeOrchestrator _orchestrator;
  final RealtimeSyncManager _syncManager;
  final DeterministicProjectionStore _store;
  final Ref _ref;

  OperationalRuntimeBridge({
    required RuntimeOrchestrator orchestrator,
    required RealtimeSyncManager syncManager,
    required DeterministicProjectionStore store,
    required Ref ref,
  })  : _orchestrator = orchestrator,
        _syncManager = syncManager,
        _store = store,
        _ref = ref {
    _initialize();
  }

  void _initialize() {
    debugPrint('[OperationalRuntimeBridge] Initializing bridge...');

    // Subscribe to SyncManager event stream
    _syncManager.eventStream.listen(_handleSyncEvent);

    // Register invalidation rules for all operational domains
    _registerInvalidationRules();

    // Register projection rebuilders for all operational domains
    _registerProjectionRebuilders();

    // Register post-validation event dispatch callback
    _orchestrator.registerDispatchCallback(_dispatchValidatedEvent);

    debugPrint('[OperationalRuntimeBridge] Bridge initialized');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ SESSION LIFECYCLE ━━━━━━━━━━━━━━━━━━━━━━

  /// Called by RuntimeLifecycleManager when a session starts.
  /// Activates KDS runtime and presence governance for the branch.
  void activateSession({
    required String branchId,
    required String epochId,
  }) {
    // Activate KDS runtime coordinator
    _ref.read(kitchenRuntimeCoordinatorProvider).activateSession(
          branchId: branchId,
          epochId: epochId,
        );

    // Activate presence governance runtime
    _ref.read(presenceGovernanceRuntimeProvider).activateSession(
          branchId: branchId,
          epochId: epochId,
          onProjectionChanged: (records) {
            _ref
                .read(presenceProjectionProvider.notifier)
                .applyProjectionUpdate(records);
          },
        );

    // Hydrate projection store from backend
    _ref.read(operationalRuntimeHydratorProvider).hydrateInitialState(branchId: branchId).then((_) {
      debugPrint('[OperationalRuntimeBridge] Initial hydration complete. Triggering full UI projection rebuild.');
      _orchestrator.rebuildEngine.triggerFullRebuild();
    });

    debugPrint(
        '[OperationalRuntimeBridge] Session activated: branch=$branchId epoch=$epochId');
  }

  /// Called by RuntimeLifecycleManager when a session ends.
  void deactivateSession() {
    // Deactivate KDS runtime
    _ref.read(kitchenRuntimeCoordinatorProvider).deactivateSession();
    _ref.read(kitchenTicketProjectionProvider.notifier).clearProjection();

    // Deactivate presence governance
    _ref.read(presenceGovernanceRuntimeProvider).deactivateSession();
    _ref.read(presenceProjectionProvider.notifier).clearProjection();

    debugPrint('[OperationalRuntimeBridge] Session deactivated');
  }

  /// Called by RealtimeSyncManager when transport disconnects.
  void enterDegradedMode() {
    _ref.read(kitchenRuntimeCoordinatorProvider).enterDegradedMode();
    debugPrint('[OperationalRuntimeBridge] Entered degraded mode');
  }

  /// Called when transport reconnects — triggers recovery for all domains.
  Future<void> exitDegradedMode({
    required String branchId,
    required String epochId,
    required int lastKnownSequence,
  }) async {
    debugPrint('[OperationalRuntimeBridge] Exiting degraded mode — starting recovery');

    // Show recovery state in UI
    _ref.read(kitchenTicketProjectionProvider.notifier).enterRecoveryState();
    _ref.read(presenceProjectionProvider.notifier).enterReconciliationState();

    // KDS recovery
    await _ref.read(kitchenRuntimeCoordinatorProvider).exitDegradedMode(
          branchId: branchId,
          epochId: epochId,
          lastKnownSequence: lastKnownSequence,
        );

    // Publish recovered kitchen projections
    final recoveredQueue =
        _ref.read(kitchenRuntimeCoordinatorProvider).getOrderedQueue();
    _ref
        .read(kitchenTicketProjectionProvider.notifier)
        .applyProjectionUpdate(recoveredQueue);

    // Presence reconciliation
    await _ref.read(presenceGovernanceRuntimeProvider).executeReconnectReconciliation(
          branchId: branchId,
          epochId: epochId,
        );

    debugPrint('[OperationalRuntimeBridge] Recovery complete');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ EVENT INGESTION ━━━━━━━━━━━━━━━━━━━━━━

  /// Convert SyncEvent to RuntimeEvent and route through orchestrator.
  Future<void> _handleSyncEvent(SyncEvent syncEvent) async {
    debugPrint(
        '[OperationalRuntimeBridge] Received sync event: ${syncEvent.type}');

    final runtimeEvent = RuntimeEvent(
      idempotencyKey: syncEvent.idempotencyKey,
      sequenceNumber: syncEvent.sequenceNumber,
      branchId: _getCurrentBranchId(),
      epochId: _getCurrentEpochId(),
      type: _mapEventType(syncEvent.type),
      payload: syncEvent.payload,
      receivedAt: DateTime.now(),
    );

    // Route through centralized validation pipeline
    await _orchestrator.routeEvent(runtimeEvent);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ POST-VALIDATION DISPATCH ━━━━━━━━━━━━━━━━━━━━━━

  /// Called by RealtimeEventRouter after an event passes ALL validation.
  /// Dispatches the payload to the correct repository/notifier.
  /// This is the ONLY place where feature state is updated from realtime events.
  Future<void> _dispatchValidatedEvent(RuntimeEvent event) async {
    debugPrint(
        '[OperationalRuntimeBridge] Dispatching validated event: ${event.type}');

    final payload = event.payload;

    switch (event.type) {
      // ── Reservations ──────────────────────────────────────────────────────
      case RuntimeEventType.reservationUpdate:
        await _ref
            .read(reservationsRepositoryProvider)
            .applyRemoteReservationUpdate(payload);
        break;

      case RuntimeEventType.reservationDelete:
        final id = payload['id'] as String?;
        if (id != null) {
          await _ref
              .read(reservationsRepositoryProvider)
              .applyRemoteReservationDelete(id);
        }
        break;

      // ── Stream-based Domains ──────────────────────────────────────────────
      // They now strictly flow through the DeterministicProjectionStore.
      // Rebuild engine will pick up the invalidations and notify the UI.
      case RuntimeEventType.orderUpdate:
      case RuntimeEventType.orderDelete:
      case RuntimeEventType.tableUpdate:
      case RuntimeEventType.tableDelete:
      case RuntimeEventType.waiterCall:
      case RuntimeEventType.waiterCallDelete:
      case RuntimeEventType.reservationUpdate:
      case RuntimeEventType.reservationDelete:
      case RuntimeEventType.waitlistUpdate:
      case RuntimeEventType.waitlistDelete:
      case RuntimeEventType.staffPresenceUpdate:
      case RuntimeEventType.staffPresenceDelete:
        await _store.applyValidatedEvent(event);
        break;

      case RuntimeEventType.unknown:
      default:
        debugPrint(
            '[OperationalRuntimeBridge] WARNING: Unknown event type ${event.type}');
        break;
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ KDS DISPATCH ━━━━━━━━━━━━━━━━━━━━━━

  /// Route a validated kitchen event through KitchenRuntimeCoordinator.
  /// After coordinator accepts the event, publish updated projection to UI.
  void _dispatchKitchenEvent(RuntimeEvent event, {required bool isItemUpdate}) {
    final coordinator = _ref.read(kitchenRuntimeCoordinatorProvider);

    final result = coordinator.applyEvent(
      idempotencyKey: event.idempotencyKey,
      sequenceNumber: event.sequenceNumber,
      branchId: event.branchId,
      epochId: event.epochId,
      payload: event.payload,
      isItemUpdate: isItemUpdate,
    );

    if (result.isAccepted) {
      // Publish updated projection to reactive UI layer
      final updatedQueue = coordinator.getOrderedQueue();
      _ref
          .read(kitchenTicketProjectionProvider.notifier)
          .applyProjectionUpdate(updatedQueue);

      debugPrint(
          '[OperationalRuntimeBridge] KDS projection updated: '
          '${updatedQueue.length} tickets');
    } else {
      debugPrint(
          '[OperationalRuntimeBridge] KDS event rejected: '
          '${result.outcome} reason=${result.reason}');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ PRESENCE DISPATCH ━━━━━━━━━━━━━━━━━━━━━━

  /// Route a validated presence update through PresenceGovernanceRuntime.
  void _dispatchPresenceUpdate(RuntimeEvent event) {
    final governance = _ref.read(presenceGovernanceRuntimeProvider);

    final result = governance.applyPresenceUpdate(
      idempotencyKey: event.idempotencyKey,
      branchId: event.branchId,
      epochId: event.epochId,
      payload: event.payload,
    );

    if (!result.isAccepted) {
      debugPrint(
          '[OperationalRuntimeBridge] Presence update rejected: '
          '${result.outcome} reason=${result.reason}');
    }
    // Projection publication is handled by PresenceGovernanceRuntime
    // via the onProjectionChanged callback registered in activateSession().
  }

  /// Route a validated presence delete through PresenceGovernanceRuntime.
  void _dispatchPresenceDelete(RuntimeEvent event) {
    final staffId = event.payload['staffId'] as String?;
    if (staffId == null) {
      debugPrint(
          '[OperationalRuntimeBridge] Presence delete: missing staffId');
      return;
    }

    final governance = _ref.read(presenceGovernanceRuntimeProvider);

    final result = governance.applyPresenceDelete(
      idempotencyKey: event.idempotencyKey,
      branchId: event.branchId,
      epochId: event.epochId,
      staffId: staffId,
    );

    if (!result.isAccepted) {
      debugPrint(
          '[OperationalRuntimeBridge] Presence delete rejected: '
          '${result.outcome} reason=${result.reason}');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ EVENT TYPE MAPPING ━━━━━━━━━━━━━━━━━━━━━━

  RuntimeEventType _mapEventType(String syncEventType) {
    switch (syncEventType) {
      case 'table_update':                return RuntimeEventType.tableUpdate;
      case 'table_delete':                return RuntimeEventType.tableDelete;
      case 'order_update':                return RuntimeEventType.orderUpdate;
      case 'order_delete':                return RuntimeEventType.orderDelete;
      case 'waiter_call':                 return RuntimeEventType.waiterCall;
      case 'waiter_call_delete':          return RuntimeEventType.waiterCallDelete;
      case 'kitchen_item_update':         return RuntimeEventType.kitchenItemUpdate;
      case 'kitchen_queue_update':        return RuntimeEventType.kitchenQueueUpdate;
      case 'reservation_update':          return RuntimeEventType.reservationUpdate;
      case 'reservation_delete':          return RuntimeEventType.reservationDelete;
      case 'waitlist_update':             return RuntimeEventType.waitlistUpdate;
      case 'waitlist_delete':             return RuntimeEventType.waitlistDelete;
      case 'staff_presence_update':       return RuntimeEventType.staffPresenceUpdate;
      case 'staff_presence_delete':       return RuntimeEventType.staffPresenceDelete;
      case 'operational_alert_created':   return RuntimeEventType.operationalAlertCreated;
      case 'operational_alert_updated':   return RuntimeEventType.operationalAlertUpdated;
      case 'operational_alert_dismissed': return RuntimeEventType.operationalAlertDismissed;
      case 'floor_analytics_delta':       return RuntimeEventType.floorAnalyticsDelta;
      default:                            return RuntimeEventType.unknown;
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ HELPERS ━━━━━━━━━━━━━━━━━━━━━━

  String _getCurrentBranchId() {
    final authState = _ref.read(authNotifierProvider);
    return authState.selectedBranch?.id ?? 'branch_default';
  }

  String _getCurrentEpochId() {
    return _orchestrator.epochManager.currentEpoch.epochId;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ INVALIDATION RULES ━━━━━━━━━━━━━━━━━━━━━━

  void _registerInvalidationRules() {
    // Orders domain
    _orchestrator.registerInvalidationRule(const InvalidationRule(
      eventType: 'RuntimeEventType.orderUpdate',
      affectedProjections: {'orders'},
      cascades: true,
    ));
    _orchestrator.registerInvalidationRule(const InvalidationRule(
      eventType: 'RuntimeEventType.orderDelete',
      affectedProjections: {'orders'},
      cascades: true,
    ));

    // Tables domain
    _orchestrator.registerInvalidationRule(const InvalidationRule(
      eventType: 'RuntimeEventType.tableUpdate',
      affectedProjections: {'tables'},
    ));
    _orchestrator.registerInvalidationRule(const InvalidationRule(
      eventType: 'RuntimeEventType.tableDelete',
      affectedProjections: {'tables'},
    ));

    // Waiter calls domain
    _orchestrator.registerInvalidationRule(const InvalidationRule(
      eventType: 'RuntimeEventType.waiterCall',
      affectedProjections: {'waiterCalls'},
    ));
    _orchestrator.registerInvalidationRule(const InvalidationRule(
      eventType: 'RuntimeEventType.waiterCallDelete',
      affectedProjections: {'waiterCalls'},
    ));

    // Kitchen domain — also invalidates orders (cascades)
    _orchestrator.registerInvalidationRule(const InvalidationRule(
      eventType: 'RuntimeEventType.kitchenItemUpdate',
      affectedProjections: {'orders'},
      cascades: true,
    ));
    _orchestrator.registerInvalidationRule(const InvalidationRule(
      eventType: 'RuntimeEventType.kitchenQueueUpdate',
      affectedProjections: {'orders'},
      cascades: true,
    ));

    // Reservations domain
    _orchestrator.registerInvalidationRule(const InvalidationRule(
      eventType: 'RuntimeEventType.reservationUpdate',
      affectedProjections: {'reservations'},
    ));
    _orchestrator.registerInvalidationRule(const InvalidationRule(
      eventType: 'RuntimeEventType.reservationDelete',
      affectedProjections: {'reservations'},
    ));
    _orchestrator.registerInvalidationRule(const InvalidationRule(
      eventType: 'RuntimeEventType.waitlistUpdate',
      affectedProjections: {'reservations'},
    ));
    _orchestrator.registerInvalidationRule(const InvalidationRule(
      eventType: 'RuntimeEventType.waitlistDelete',
      affectedProjections: {'reservations'},
    ));

    // Staff presence domain
    _orchestrator.registerInvalidationRule(const InvalidationRule(
      eventType: 'RuntimeEventType.staffPresenceUpdate',
      affectedProjections: {'staff'},
    ));
    _orchestrator.registerInvalidationRule(const InvalidationRule(
      eventType: 'RuntimeEventType.staffPresenceDelete',
      affectedProjections: {'staff'},
    ));

    // Operational alerts domain
    _orchestrator.registerInvalidationRule(const InvalidationRule(
      eventType: 'RuntimeEventType.operationalAlertCreated',
      affectedProjections: {'alerts'},
    ));
    _orchestrator.registerInvalidationRule(const InvalidationRule(
      eventType: 'RuntimeEventType.operationalAlertUpdated',
      affectedProjections: {'alerts'},
    ));
    _orchestrator.registerInvalidationRule(const InvalidationRule(
      eventType: 'RuntimeEventType.operationalAlertDismissed',
      affectedProjections: {'alerts'},
    ));

    // Floor analytics domain
    _orchestrator.registerInvalidationRule(const InvalidationRule(
      eventType: 'RuntimeEventType.floorAnalyticsDelta',
      affectedProjections: {'analytics'},
    ));

    debugPrint(
        '[OperationalRuntimeBridge] Registered invalidation rules for all operational domains');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ PROJECTION REBUILDERS ━━━━━━━━━━━━━━━━━━━━━━

  void _registerProjectionRebuilders() {
    _orchestrator.registerProjection(ProjectionRegistration(
      projectionKey: 'ProjectionDomain.orders',
      rebuilder: _rebuildOrdersProjection,
      priority: 10,
    ));
    _orchestrator.registerProjection(ProjectionRegistration(
      projectionKey: 'ProjectionDomain.tables',
      rebuilder: _rebuildTablesProjection,
      priority: 10,
    ));
    _orchestrator.registerProjection(ProjectionRegistration(
      projectionKey: 'ProjectionDomain.waiterCalls',
      rebuilder: _rebuildWaiterCallsProjection,
      priority: 10,
    ));
    _orchestrator.registerProjection(ProjectionRegistration(
      projectionKey: 'ProjectionDomain.reservations',
      rebuilder: _rebuildReservationsProjection,
      priority: 10,
    ));
    _orchestrator.registerProjection(ProjectionRegistration(
      projectionKey: 'ProjectionDomain.staff',
      rebuilder: _rebuildStaffProjection,
      priority: 10,
    ));
    _orchestrator.registerProjection(ProjectionRegistration(
      projectionKey: 'ProjectionDomain.alerts',
      rebuilder: _rebuildAlertsProjection,
      priority: 10,
    ));
    _orchestrator.registerProjection(ProjectionRegistration(
      projectionKey: 'ProjectionDomain.analytics',
      rebuilder: _rebuildAnalyticsProjection,
      priority: 10,
    ));

    debugPrint(
        '[OperationalRuntimeBridge] Registered projection rebuilders for all domains');
  }

  // Full-resync rebuilders (called on reconnect / epoch change / invalidation)
  Future<void> _rebuildOrdersProjection() async {
    debugPrint('[OperationalRuntimeBridge] Full rebuild: orders');
    final orders = _store.getAuthoritativeOrders();
    final repo = _ref.read(ordersRepositoryProvider);
    await repo.syncOrders(orders); // Implement in OrdersRepository
  }

  Future<void> _rebuildTablesProjection() async {
    debugPrint('[OperationalRuntimeBridge] Full rebuild: tables');
    final tables = _store.getAuthoritativeTables();
    final repo = _ref.read(tablesRepositoryProvider);
    await repo.syncTables(tables); // Implement in TablesRepository
  }

  Future<void> _rebuildWaiterCallsProjection() async {
    debugPrint('[OperationalRuntimeBridge] Full rebuild: waiterCalls');
    final calls = _store.getAuthoritativeWaiterCalls();
    final repo = _ref.read(waiterCallsRepositoryProvider);
    await repo.syncWaiterCalls(calls); // Implement in WaiterCallsRepository
  }

  Future<void> _rebuildReservationsProjection() async {
    debugPrint('[OperationalRuntimeBridge] Full rebuild: reservations');
  }

  Future<void> _rebuildStaffProjection() async {
    debugPrint('[OperationalRuntimeBridge] Full rebuild: staff');
  }

  Future<void> _rebuildAlertsProjection() async {
    debugPrint('[OperationalRuntimeBridge] Full rebuild: alerts');
  }

  Future<void> _rebuildAnalyticsProjection() async {
    debugPrint('[OperationalRuntimeBridge] Full rebuild: analytics');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━ PROVIDERS ━━━━━━━━━━━━━━━━━━━━━━

/// Provider for the runtime orchestrator (keepAlive — lives for app lifetime).
final runtimeOrchestratorProvider = Provider<RuntimeOrchestrator>((ref) {
  return RuntimeOrchestrator();
});

final deterministicProjectionStoreProvider = Provider<DeterministicProjectionStore>((ref) {
  return DeterministicProjectionStore();
});

final mutationAcknowledgementManagerProvider = Provider<MutationAcknowledgementManager>((ref) {
  final store = ref.watch(deterministicProjectionStoreProvider);
  return MutationAcknowledgementManager(store);
});

final replayRecoveryCoordinatorProvider = Provider<ReplayRecoveryCoordinator>((ref) {
  final store = ref.watch(deterministicProjectionStoreProvider);
  final orchestrator = ref.watch(runtimeOrchestratorProvider);
  return ReplayRecoveryCoordinator(store, orchestrator.rebuildEngine);
});

/// Provider for the operational runtime bridge.
final operationalRuntimeBridgeProvider = Provider<OperationalRuntimeBridge>((ref) {
  final orchestrator = ref.watch(runtimeOrchestratorProvider);
  final syncManager = ref.watch(realtimeSyncManagerProvider);
  final store = ref.watch(deterministicProjectionStoreProvider);

  return OperationalRuntimeBridge(
    orchestrator: orchestrator,
    syncManager: syncManager,
    store: store,
    ref: ref,
  );
});

final operationalRuntimeHydratorProvider = Provider<OperationalRuntimeHydrator>((ref) {
  final store = ref.watch(deterministicProjectionStoreProvider);
  return OperationalRuntimeHydrator(store, ref);
});
