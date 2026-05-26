// lib/features/realtime/presentation/state/realtime_providers.dart

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/realtime_state_model.dart';
import '../../domain/entities/sync_operation.dart';

// ---------------------------------------------------------------------------
// RealtimeStateNotifier
// ---------------------------------------------------------------------------

class RealtimeStateNotifier extends StateNotifier<RealtimeStateModel> {
  RealtimeStateNotifier()
      : super(
          RealtimeStateModel(
            connectionState: RealtimeConnectionState.connected,
            reconnectAttempts: 0,
            maxReconnectAttempts: 5,
            lastConnectedAt: DateTime.now(),
          ),
        );

  /// General method to update connection state.
  void updateConnectionState(RealtimeConnectionState connState, {String? error, int? attempts}) {
    state = state.copyWith(
      connectionState: connState,
      reconnectAttempts: attempts ?? state.reconnectAttempts,
      errorMessage: error,
      clearErrorMessage: error == null,
      clearDegradedSince: connState != RealtimeConnectionState.degraded,
      clearReplayProgress: connState != RealtimeConnectionState.replaying,
      clearReplayEventsRemaining: connState != RealtimeConnectionState.replaying,
    );
  }

  /// Simulates a sudden disconnect / reconnecting loop.
  void simulateDisconnect() {
    state = state.copyWith(
      connectionState: RealtimeConnectionState.reconnecting,
      reconnectAttempts: state.reconnectAttempts + 1,
      errorMessage: 'Connection lost. Reconnecting…',
      clearReplayProgress: true,
    );
  }

  /// Simulates a successful reconnect.
  void simulateReconnect() {
    state = state.copyWith(
      connectionState: RealtimeConnectionState.connected,
      reconnectAttempts: 0,
      lastConnectedAt: DateTime.now(),
      clearErrorMessage: true,
      clearDegradedSince: true,
      clearReplayProgress: true,
      clearReplayEventsRemaining: true,
    );
  }

  /// Simulates entering a degraded (high-latency / partial) connection state.
  void simulateDegraded() {
    state = state.copyWith(
      connectionState: RealtimeConnectionState.degraded,
      degradedSince: DateTime.now(),
      errorMessage: 'Connection degraded — some updates may be delayed.',
    );
  }

  /// Simulates a critical failure (max retries exhausted).
  void simulateCritical() {
    state = state.copyWith(
      connectionState: RealtimeConnectionState.critical,
      reconnectAttempts: state.maxReconnectAttempts,
      errorMessage: 'Unable to reach server. Manual intervention required.',
    );
  }

  /// Simulates event replay after reconnection.
  void simulateReplay({double progress = 0.0, int eventsRemaining = 24}) {
    state = state.copyWith(
      connectionState: RealtimeConnectionState.replaying,
      replayProgress: progress.clamp(0.0, 1.0),
      replayEventsRemaining: eventsRemaining,
      clearErrorMessage: true,
    );
  }

  /// Advance replay progress (call repeatedly during replay simulation).
  void advanceReplay(double delta) {
    final newProgress = ((state.replayProgress ?? 0.0) + delta).clamp(0.0, 1.0);
    final remaining = ((state.replayEventsRemaining ?? 0) * (1 - newProgress)).round();
    if (newProgress >= 1.0) {
      simulateReconnect();
    } else {
      state = state.copyWith(
        replayProgress: newProgress,
        replayEventsRemaining: remaining,
      );
    }
  }

  /// Increment reconnect attempt counter (used during back-off loops).
  void incrementReconnectAttempt() {
    final newCount = state.reconnectAttempts + 1;
    if (newCount >= state.maxReconnectAttempts) {
      simulateCritical();
    } else {
      state = state.copyWith(reconnectAttempts: newCount);
    }
  }
}

// ---------------------------------------------------------------------------
// SyncQueueNotifier
// ---------------------------------------------------------------------------

class SyncQueueNotifier extends StateNotifier<List<SyncOperation>> {
  SyncQueueNotifier() : super(_buildInitialQueue());

  static List<SyncOperation> _buildInitialQueue() {
    final now = DateTime.now();
    return [
      SyncOperation(
        operationId: 'op-001',
        type: SyncOperationType.acknowledgeCall,
        status: SyncOperationStatus.queued,
        entityId: 'table-07',
        entityLabel: 'Table 7',
        queuedAt: now.subtract(const Duration(seconds: 45)),
        retryCount: 0,
        maxRetries: 3,
      ),
      SyncOperation(
        operationId: 'op-002',
        type: SyncOperationType.saveOrder,
        status: SyncOperationStatus.retrying,
        entityId: 'order-1042',
        entityLabel: 'Order #1042',
        queuedAt: now.subtract(const Duration(minutes: 2)),
        retryCount: 1,
        maxRetries: 3,
        nextRetryAt: now.add(const Duration(seconds: 30)),
        errorMessage: 'Network timeout — retrying in 30s.',
      ),
      SyncOperation(
        operationId: 'op-003',
        type: SyncOperationType.updateTableStatus,
        status: SyncOperationStatus.failed,
        entityId: 'table-12',
        entityLabel: 'Table 12',
        queuedAt: now.subtract(const Duration(minutes: 5)),
        retryCount: 3,
        maxRetries: 3,
        errorMessage: 'Max retries exceeded. Conflict detected on server.',
      ),
    ];
  }

  /// Add a new operation to the queue.
  void addOperation(SyncOperation operation) {
    state = [...state, operation];
  }

  /// Retry a failed / conflict operation by id.
  void retryOperation(String operationId) {
    state = state.map((op) {
      if (op.operationId != operationId) return op;
      if (!op.canRetry && op.retryCount >= op.maxRetries) return op;
      return op.copyWith(
        status: SyncOperationStatus.retrying,
        retryCount: op.retryCount + 1,
        nextRetryAt: DateTime.now().add(const Duration(seconds: 15)),
        clearErrorMessage: true,
      );
    }).toList();
  }

  /// Discard an operation permanently.
  void discardOperation(String operationId) {
    state = state.map((op) {
      if (op.operationId != operationId) return op;
      return op.copyWith(status: SyncOperationStatus.discarded);
    }).toList();
  }

  /// Mark an operation as successfully synced.
  void markSuccess(String operationId) {
    state = state.map((op) {
      if (op.operationId != operationId) return op;
      return op.copyWith(
        status: SyncOperationStatus.success,
        clearNextRetryAt: true,
        clearErrorMessage: true,
      );
    }).toList();
  }

  /// Mark an operation as in-flight.
  void markInflight(String operationId) {
    state = state.map((op) {
      if (op.operationId != operationId) return op;
      return op.copyWith(status: SyncOperationStatus.inflight);
    }).toList();
  }

  /// Remove all discarded and succeeded operations from the queue.
  void pruneCompleted() {
    state = state
        .where((op) =>
            op.status != SyncOperationStatus.success &&
            op.status != SyncOperationStatus.discarded)
        .toList();
  }
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

/// Realtime connection state provider.
final realtimeStateProvider =
    StateNotifierProvider<RealtimeStateNotifier, RealtimeStateModel>(
  (ref) => RealtimeStateNotifier(),
);

/// Sync queue provider.
final syncQueueProvider =
    StateNotifierProvider<SyncQueueNotifier, List<SyncOperation>>(
  (ref) => SyncQueueNotifier(),
);

/// Number of operations not yet synced (queued + retrying + inflight + failed + conflict).
final pendingOpsCountProvider = Provider<int>((ref) {
  final queue = ref.watch(syncQueueProvider);
  const pendingStatuses = {
    SyncOperationStatus.queued,
    SyncOperationStatus.retrying,
    SyncOperationStatus.inflight,
    SyncOperationStatus.failed,
    SyncOperationStatus.conflict,
  };
  return queue.where((op) => pendingStatuses.contains(op.status)).length;
});

/// Number of operations in a terminal failed or conflict state.
final failedOpsCountProvider = Provider<int>((ref) {
  final queue = ref.watch(syncQueueProvider);
  return queue
      .where((op) =>
          op.status == SyncOperationStatus.failed ||
          op.status == SyncOperationStatus.conflict)
      .length;
});
