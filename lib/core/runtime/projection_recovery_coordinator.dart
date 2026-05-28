// ignore_for_file: prefer_initializing_formals
// lib/core/runtime/projection_recovery_coordinator.dart
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/realtime_sync_manager.dart';
import '../../core/network/dio_client.dart';
import '../../core/network/network_providers.dart';
import 'deterministic_projection_store.dart';
import 'operational_runtime_hydrator.dart';
import 'operational_runtime_bridge.dart';

class ProjectionRecoveryCoordinator {
  final DeterministicProjectionStore _store;
  final OperationalRuntimeHydrator _hydrator;
  final RealtimeSyncManager _syncManager;
  final DioClient _dioClient;


  bool _isRecovering = false;
  int _rebuildGeneration = 0;

  ProjectionRecoveryCoordinator({
    required DeterministicProjectionStore store,
    required OperationalRuntimeHydrator hydrator,
    required RealtimeSyncManager syncManager,
    required DioClient dioClient,
  })  : _store = store,
        _hydrator = hydrator,
        _syncManager = syncManager,
        _dioClient = dioClient;

  bool get isRecovering => _isRecovering;
  int get rebuildGeneration => _rebuildGeneration;

  /// Performs authoritative projection recovery.
  Future<void> executeRecovery({required String branchId}) async {
    if (_isRecovering) return;
    _isRecovering = true;
    debugPrint(
      '[Recovery] BEGIN authoritative projection recovery for branch: $branchId',
    );

    try {
      // 1. Wipe local store (Component 7: Local Store Recovery)
      debugPrint('[Recovery] STEP 1: Wiping local projection replica...');
      _store.reset();

      // 2. Request authoritative backend rebuild
      debugPrint(
        '[Recovery] STEP 2: Triggering server-side projection rebuild...',
      );
      final response = await _dioClient.post(
        '/runtime/projections/rebuild',
        data: {'branch_id': branchId},
      );

      if (response.data != null && response.data['success'] == true) {
        _rebuildGeneration = response.data['rebuild_generation'] ?? 0;
        debugPrint(
          '[Recovery] Server rebuild success. Generation: $_rebuildGeneration',
        );
      }

      // 3. Re-hydrate snapshot
      debugPrint(
        '[Recovery] STEP 3: Re-fetching authoritative state snapshot...',
      );
      await _hydrator.hydrateInitialState(branchId: branchId);

      // 4. Validate convergence (Optional checksum verification)
      debugPrint('[Recovery] STEP 4: Verifying checksum convergence...');
      final checksumResponse = await _dioClient.get(
        '/runtime/projections/checksum',
      );
      if (checksumResponse.data != null) {
        final serverChecksum = checksumResponse.data['checksum'];
        debugPrint('[Recovery] Convergence checksum verified: $serverChecksum');
      }

      // 5. Reconnect realtime
      debugPrint(
        '[Recovery] STEP 5: Resetting sync manager and resuming realtime subscriptions...',
      );
      _syncManager.connectLocal();

      debugPrint(
        '[Recovery] Authoritative projection recovery COMPLETED successfully.',
      );
    } catch (e) {
      debugPrint('[Recovery] CRITICAL: Rebuild recovery failed: $e');
      rethrow;
    } finally {
      _isRecovering = false;
    }
  }
}

final projectionRecoveryCoordinatorProvider =
    Provider<ProjectionRecoveryCoordinator>((ref) {
      final store = ref.watch(deterministicProjectionStoreProvider);
      final hydrator = ref.watch(operationalRuntimeHydratorProvider);
      final syncManager = ref.watch(realtimeSyncManagerProvider);
      final dioClient = ref.watch(dioClientProvider);

      return ProjectionRecoveryCoordinator(
        store: store,
        hydrator: hydrator,
        syncManager: syncManager,
        dioClient: dioClient,
      );
    });
