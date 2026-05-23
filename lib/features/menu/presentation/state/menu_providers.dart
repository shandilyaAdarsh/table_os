// lib/features/menu/presentation/state/menu_providers.dart
import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:talker_flutter/talker_flutter.dart';

import '../../../../core/network/network_providers.dart';
import '../../../../core/network/sync_state.dart';
import '../../../../core/utils/logger.dart';
import '../../../auth/presentation/state/auth_notifier.dart';
import '../../../orders/domain/entities/menu_product.dart' as orders_entities;
import '../../data/repositories/menu_repository_impl.dart';
import '../../domain/entities/menu_snapshot.dart';
import '../../domain/repositories/menu_repository.dart';

final menuRepositoryProvider = Provider<MenuRepository>((ref) {
  final dioClient = ref.watch(dioClientProvider);
  final cacheBox = ref.watch(apiCacheBoxProvider);
  final networkInfo = ref.watch(networkInfoProvider);
  final talker = ref.watch(talkerProvider);
  return MenuRepositoryImpl(
    dioClient: dioClient,
    apiCacheBox: cacheBox,
    networkInfo: networkInfo,
    talker: talker,
  );
});

class MenuSnapshotNotifier extends StateNotifier<AsyncValue<MenuSnapshot>> {
  final MenuRepository _repository;
  final Ref _ref;
  final Talker _talker;
  bool _isOfflineCache = false;

  MenuSnapshotNotifier(this._repository, this._ref, this._talker) : super(const AsyncValue.loading()) {
    // Automatically load when initialized
    loadMenu();
  }

  bool get isOfflineCache => _isOfflineCache;

  Future<void> loadMenu({bool forceRefresh = false}) async {
    state = const AsyncValue.loading();
    await _fetch(forceRefresh: forceRefresh);
  }

  Future<void> refresh() async {
    if (state.isLoading) return;
    await _fetch(forceRefresh: true);
  }

  Future<void> _fetch({bool forceRefresh = false}) async {
    try {
      final authState = _ref.read(authNotifierProvider);
      final branchId = authState.selectedBranch?.id ?? 'mock_branch';
      final isConnected = await _ref.read(networkInfoProvider).isConnected;

      final snapshot = await _repository.getMenuSnapshot(
        branchId: branchId,
        forceRefresh: forceRefresh,
      );

      _isOfflineCache = !isConnected;
      state = AsyncValue.data(snapshot);
    } catch (e, stack) {
      _talker.error('[MenuNotifier] Failed to load menu: $e');
      state = AsyncValue.error(e, stack);
    }
  }

  void updateAvailability(Map<String, bool> availabilityMap) {
    state.whenData((snapshot) {
      final updatedItems = snapshot.items.map((item) {
        if (availabilityMap.containsKey(item.id)) {
          return item.copyWith(isAvailable: availabilityMap[item.id]!);
        }
        return item;
      }).toList();

      state = AsyncValue.data(
        MenuSnapshot(
          categories: snapshot.categories,
          items: updatedItems,
          modifierGroups: snapshot.modifierGroups,
          taxConfig: snapshot.taxConfig,
        ),
      );
    });
  }
}

final menuSnapshotNotifierProvider = StateNotifierProvider<MenuSnapshotNotifier, AsyncValue<MenuSnapshot>>((ref) {
  final repository = ref.watch(menuRepositoryProvider);
  final talker = ref.watch(talkerProvider);
  return MenuSnapshotNotifier(repository, ref, talker);
});

/// Exposes the menu products mapped to the legacy domains for UI compatibility
final publicMenuProductsProvider = Provider<List<orders_entities.MenuProduct>>((ref) {
  final menuSnapshotAsync = ref.watch(menuSnapshotNotifierProvider);
  return menuSnapshotAsync.maybeWhen(
    data: (snapshot) => snapshot.toMenuProducts(),
    orElse: () => const [],
  );
});

/// Exposes the menu cache's sync state (fresh, stale, degraded)
final menuStalenessProvider = Provider<SyncState>((ref) {
  final notifierState = ref.watch(menuSnapshotNotifierProvider.notifier);

  // We check if notifier loaded cache while offline
  if (notifierState.isOfflineCache) {
    return SyncState.degraded; // offline mode
  }
  
  return SyncState.fresh;
});

/// Availability polling provider that triggers background polling when active
final menuAvailabilityPollingProvider = Provider.autoDispose<void>((ref) {
  final repository = ref.watch(menuRepositoryProvider);
  final notifier = ref.watch(menuSnapshotNotifierProvider.notifier);
  final talker = ref.watch(talkerProvider);
  
  final authState = ref.watch(authNotifierProvider);
  final branchId = authState.selectedBranch?.id ?? 'mock_branch';

  talker.info('[MenuPolling] Availability polling initialized for branch $branchId.');

  final timer = Timer.periodic(const Duration(seconds: 10), (_) async {
    talker.info('[MenuPolling] Polling lightweight availability map...');
    final availability = await repository.getItemAvailability(branchId: branchId);
    if (availability.isNotEmpty) {
      notifier.updateAvailability(availability);
    }
  });

  ref.onDispose(() {
    timer.cancel();
    talker.info('[MenuPolling] Availability polling stopped.');
  });
});
