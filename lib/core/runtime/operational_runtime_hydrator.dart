// lib/core/runtime/operational_runtime_hydrator.dart

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'deterministic_projection_store.dart';
import '../../features/orders/providers/orders_providers.dart';
import '../../features/tables/providers/tables_providers.dart';
import '../../features/waiter_calls/presentation/state/waiter_calls_providers.dart';

/// Responsible for establishing the initial authoritative state upon login or major reconnect.
class OperationalRuntimeHydrator {
  final DeterministicProjectionStore _store;
  final Ref _ref;

  OperationalRuntimeHydrator(this._store, this._ref);

  /// Fetches the complete snapshot of all operational data and populates the DeterministicProjectionStore.
  Future<void> hydrateInitialState({required String branchId}) async {
    debugPrint('[OperationalRuntimeHydrator] Fetching full authoritative state for branch: $branchId');
    
    // Simulate backend network latency
    await Future.delayed(const Duration(milliseconds: 600));

    try {
      // 1. Fetch from mock backend repositories
      final ordersRepo = _ref.read(ordersRepositoryProvider);
      final tablesRepo = _ref.read(tablesRepositoryProvider);
      final callsRepo = _ref.read(waiterCallsRepositoryProvider);

      final orders = await ordersRepo.fetchActiveOrders();
      final tables = await tablesRepo.fetchTables();
      final calls = await callsRepo.fetchActiveCalls();

      // 2. Seed deterministic projection store
      _store.seedOrders(orders);
      _store.seedTables(tables);
      _store.seedWaiterCalls(calls);

      debugPrint('[OperationalRuntimeHydrator] Successfully hydrated local projection store');
    } catch (e, stack) {
      debugPrint('[OperationalRuntimeHydrator] ERROR hydrating state: $e');
      debugPrint(stack.toString());
      rethrow;
    }
  }
}
