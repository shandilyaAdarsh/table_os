// lib/features/waiter_calls/presentation/state/waiter_calls_providers.dart
import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/network_providers.dart';
import '../../domain/entities/waiter_call.dart';
import '../../domain/repositories/waiter_calls_repository.dart';
import '../../data/repositories/waiter_calls_repository_impl.dart';
import '../../data/datasources/remote/waiter_calls_remote_datasource.dart';

final waiterCallsRemoteDatasourceProvider = Provider<WaiterCallsRemoteDatasource>((ref) {
  final dio = ref.watch(dioClientProvider);
  return WaiterCallsRemoteDatasourceImpl(dio);
});

final waiterCallsRepositoryProvider = Provider<WaiterCallsRepository>((ref) {
  final network = ref.watch(networkInfoProvider);
  final offlineQueue = ref.watch(offlineQueueManagerProvider);
  final remote = ref.watch(waiterCallsRemoteDatasourceProvider);
  return WaiterCallsRepositoryImpl(
    networkInfo: network,
    offlineQueue: offlineQueue,
    remote: remote,
    ref: ref,
  );
});

class WaiterCallsListNotifier extends AsyncNotifier<List<WaiterCall>> {
  late final WaiterCallsRepository _repository;
  StreamSubscription<List<WaiterCall>>? _subscription;

  @override
  FutureOr<List<WaiterCall>> build() async {
    _repository = ref.watch(waiterCallsRepositoryProvider);
    
    ref.onDispose(() {
      _subscription?.cancel();
    });

    // Listen to real-time changes
    _subscription = _repository.watchWaiterCalls().listen((calls) {
      state = AsyncData(calls);
    });

    return _repository.getCachedWaiterCalls();
  }

  Future<void> acknowledgeCall(String callId, String waiterId, String waiterName) async {
    // Optimistic update handled inside repository or we can apply it here
    await _repository.submitAcknowledgement(callId, waiterId, waiterName);
  }

  Future<void> resolveCall(String callId) async {
    await _repository.resolveCall(callId);
  }

  Future<void> escalateCall(String callId) async {
    await _repository.escalateCall(callId);
  }

  Future<void> createCall(String tableId, String tableLabel, CallType type, {String? note, bool isVip = false}) async {
    await _repository.createWaiterCall(tableId, tableLabel, type, note: note, isVip: isVip);
  }
}

final waiterCallsListProvider = AsyncNotifierProvider<WaiterCallsListNotifier, List<WaiterCall>>(() {
  return WaiterCallsListNotifier();
});

// Derived provider for active (unresolved) calls, sorted by priority score
final activeWaiterCallsProvider = Provider<List<WaiterCall>>((ref) {
  final callsAsync = ref.watch(waiterCallsListProvider);
  return callsAsync.maybeWhen(
    data: (calls) {
      final active = calls.where((c) => c.status != CallStatus.resolved).toList();
      // Sort by priority score descending
      active.sort((a, b) {
        final scoreA = a.calculatePriorityScore(false);
        final scoreB = b.calculatePriorityScore(false);
        return scoreB.compareTo(scoreA);
      });
      return active;
    },
    orElse: () => [],
  );
});
