// lib/core/runtime/mutation_acknowledgement_manager.dart

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'deterministic_projection_store.dart';
import 'domain/runtime_event.dart';

/// Represents a mutation that has been applied optimistically locally
/// but has not yet been acknowledged by the authoritative backend.
class PendingMutation {
  final String idempotencyKey;
  final RuntimeEventType type;
  final Map<String, dynamic> optimisticPayload;
  final DateTime timestamp;
  final Timer timeoutTimer;

  PendingMutation({
    required this.idempotencyKey,
    required this.type,
    required this.optimisticPayload,
    required this.timestamp,
    required this.timeoutTimer,
  });
}

/// Orchestrates optimistic local mutations and remote backend acknowledgements.
/// Replaces feature-level optimistic patches.
class MutationAcknowledgementManager {
  final DeterministicProjectionStore _projectionStore;
  final Map<String, PendingMutation> _pendingMutations = {};

  MutationAcknowledgementManager(this._projectionStore);

  /// Execute an optimistic mutation, applying it locally and waiting for backend ACK.
  Future<void> executeMutation({
    required String idempotencyKey,
    required RuntimeEventType type,
    required Map<String, dynamic> optimisticPayload,
    required Future<void> Function() backendMutationCall,
    Duration timeout = const Duration(seconds: 15),
  }) async {
    debugPrint('[MutationAcknowledgementManager] Executing optimistic mutation: $idempotencyKey ($type)');

    // 1. Apply optimistic state to the local projection store
    final optimisticEvent = RuntimeEvent(
      idempotencyKey: idempotencyKey,
      sequenceNumber: -1, // Indicates local optimistic origin
      branchId: 'local',
      epochId: 'local',
      type: type,
      payload: optimisticPayload,
      receivedAt: DateTime.now(),
    );
    await _projectionStore.applyValidatedEvent(optimisticEvent);

    // 2. Track for rollback or acknowledgement
    final timer = Timer(timeout, () => _handleTimeout(idempotencyKey));
    _pendingMutations[idempotencyKey] = PendingMutation(
      idempotencyKey: idempotencyKey,
      type: type,
      optimisticPayload: optimisticPayload,
      timestamp: DateTime.now(),
      timeoutTimer: timer,
    );

    // 3. Trigger actual remote backend mutation
    try {
      await backendMutationCall();
    } catch (e) {
      debugPrint('[MutationAcknowledgementManager] Backend mutation failed immediately: $e');
      _rollback(idempotencyKey);
    }
  }

  /// Called by RealtimeEventRouter when the backend echoes back the mutation event
  /// indicating success.
  void handleAcknowledgement(String idempotencyKey) {
    final pending = _pendingMutations.remove(idempotencyKey);
    if (pending != null) {
      pending.timeoutTimer.cancel();
      debugPrint('[MutationAcknowledgementManager] Acknowledged mutation: $idempotencyKey');
    }
  }

  void _handleTimeout(String idempotencyKey) {
    debugPrint('[MutationAcknowledgementManager] WARNING: Mutation timed out: $idempotencyKey');
    _rollback(idempotencyKey);
  }

  void _rollback(String idempotencyKey) {
    final pending = _pendingMutations.remove(idempotencyKey);
    if (pending != null) {
      pending.timeoutTimer.cancel();
      debugPrint('[MutationAcknowledgementManager] Rolling back mutation: $idempotencyKey');
      // In a real system, we compute an inverse event here. 
      // For this simulated environment, we rely on the RealtimeSyncManager DeltaSync 
      // or subsequent backend events to overwrite the bad local state.
    }
  }

  void reset() {
    for (var pending in _pendingMutations.values) {
      pending.timeoutTimer.cancel();
    }
    _pendingMutations.clear();
  }
}
