// lib/features/waiter_calls/data/repositories/waiter_calls_repository_impl.dart
import 'dart:async';
import 'dart:math';
import '../../../../core/network/network_info.dart';
import '../../../../core/network/offline_queue.dart';
import '../../domain/entities/waiter_call.dart';
import '../../domain/repositories/waiter_calls_repository.dart';

class WaiterCallsRepositoryImpl implements WaiterCallsRepository {
  final NetworkInfo networkInfo;
  final OfflineQueueManager offlineQueue;
  
  final List<WaiterCall> _inMemoryCalls = [];
  final StreamController<List<WaiterCall>> _streamController = StreamController<List<WaiterCall>>.broadcast();

  WaiterCallsRepositoryImpl({
    required this.networkInfo,
    required this.offlineQueue,
  }) {
    // Populate mock initial data for high priority flows
    _populateInitialData();

    // Register offline handlers
    offlineQueue.registerHandler('acknowledgeCall', (payload) async {
      final callId = payload['callId'] as String;
      final waiterId = payload['waiterId'] as String;
      final waiterName = payload['waiterName'] as String;
      
      // Simulate remote API call delay
      await Future.delayed(const Duration(milliseconds: 300));
      _updateCallInMemory(callId, status: CallStatus.acknowledged, waiterId: waiterId, waiterName: waiterName);
    });

    offlineQueue.registerHandler('resolveCall', (payload) async {
      final callId = payload['callId'] as String;
      
      await Future.delayed(const Duration(milliseconds: 300));
      _updateCallInMemory(callId, status: CallStatus.resolved);
    });

    offlineQueue.registerHandler('escalateCall', (payload) async {
      final callId = payload['callId'] as String;
      
      await Future.delayed(const Duration(milliseconds: 300));
      _updateCallInMemory(callId, status: CallStatus.escalated);
    });

    offlineQueue.registerHandler('createWaiterCall', (payload) async {
      final id = payload['id'] as String;
      final tableId = payload['tableId'] as String;
      final tableLabel = payload['tableLabel'] as String;
      final typeName = payload['type'] as String;
      final customerNote = payload['customerNote'] as String?;
      final timestamp = DateTime.parse(payload['timestamp'] as String);
      final isVip = payload['isVip'] as bool;

      await Future.delayed(const Duration(milliseconds: 300));
      final callType = CallType.values.firstWhere((e) => e.name == typeName);
      final newCall = WaiterCall(
        id: id,
        tableId: tableId,
        tableLabel: tableLabel,
        type: callType,
        status: CallStatus.pending,
        customerNote: customerNote,
        timestamp: timestamp,
        isVip: isVip,
      );
      _inMemoryCalls.add(newCall);
      _emit();
    });
  }

  void _populateInitialData() {
    final now = DateTime.now();
    _inMemoryCalls.addAll([
      WaiterCall(
        id: 'call_1',
        tableId: '5',
        tableLabel: 'Table 5',
        type: CallType.issueReport,
        status: CallStatus.pending,
        customerNote: 'Spilled water on table, needs napkins.',
        timestamp: now.subtract(const Duration(seconds: 45)),
      ),
      WaiterCall(
        id: 'call_2',
        tableId: '12',
        tableLabel: 'Table 12',
        type: CallType.billRequest,
        status: CallStatus.pending,
        customerNote: 'Payment by Mastercard.',
        timestamp: now.subtract(const Duration(seconds: 135)),
        isVip: true,
      ),
      WaiterCall(
        id: 'call_3',
        tableId: '3',
        tableLabel: 'Table 3',
        type: CallType.service,
        status: CallStatus.acknowledged,
        customerNote: 'Extra ketchup and salt.',
        timestamp: now.subtract(const Duration(minutes: 5)),
        waiterId: 'waiter_001',
        waiterName: 'John Doe',
      ),
      WaiterCall(
        id: 'call_4',
        tableId: '8',
        tableLabel: 'Table 8',
        type: CallType.assistance,
        status: CallStatus.resolved,
        customerNote: 'Ready to order',
        timestamp: now.subtract(const Duration(minutes: 15)),
        waiterId: 'waiter_001',
        waiterName: 'John Doe',
      ),
    ]);
    _emit();
  }

  void _updateCallInMemory(
    String callId, {
    required CallStatus status,
    String? waiterId,
    String? waiterName,
  }) {
    final index = _inMemoryCalls.indexWhere((c) => c.id == callId);
    if (index != -1) {
      final original = _inMemoryCalls[index];
      _inMemoryCalls[index] = original.copyWith(
        status: status,
        waiterId: waiterId ?? original.waiterId,
        waiterName: waiterName ?? original.waiterName,
      );
      _emit();
    }
  }

  void _emit() {
    _streamController.add(List.unmodifiable(_inMemoryCalls));
  }

  @override
  Future<List<WaiterCall>> getCachedWaiterCalls() async {
    return List.unmodifiable(_inMemoryCalls);
  }

  @override
  Stream<List<WaiterCall>> watchWaiterCalls() {
    return _streamController.stream;
  }

  @override
  Future<void> submitAcknowledgement(String callId, String waiterId, String waiterName) async {
    // Apply optimistic updates locally
    _updateCallInMemory(callId, status: CallStatus.acknowledged, waiterId: waiterId, waiterName: waiterName);

    final payload = <String, dynamic>{
      'callId': callId,
      'waiterId': waiterId,
      'waiterName': waiterName,
    };

    if (await networkInfo.isConnected) {
      try {
        // Mock remote call
        await Future.delayed(const Duration(milliseconds: 200));
      } catch (_) {
        await offlineQueue.queueWrite(action: 'acknowledgeCall', payload: payload);
      }
    } else {
      await offlineQueue.queueWrite(action: 'acknowledgeCall', payload: payload);
    }
  }

  @override
  Future<void> resolveCall(String callId) async {
    _updateCallInMemory(callId, status: CallStatus.resolved);

    final payload = <String, dynamic>{'callId': callId};

    if (await networkInfo.isConnected) {
      try {
        await Future.delayed(const Duration(milliseconds: 200));
      } catch (_) {
        await offlineQueue.queueWrite(action: 'resolveCall', payload: payload);
      }
    } else {
      await offlineQueue.queueWrite(action: 'resolveCall', payload: payload);
    }
  }

  @override
  Future<void> escalateCall(String callId) async {
    _updateCallInMemory(callId, status: CallStatus.escalated);

    final payload = <String, dynamic>{'callId': callId};

    if (await networkInfo.isConnected) {
      try {
        await Future.delayed(const Duration(milliseconds: 200));
      } catch (_) {
        await offlineQueue.queueWrite(action: 'escalateCall', payload: payload);
      }
    } else {
      await offlineQueue.queueWrite(action: 'escalateCall', payload: payload);
    }
  }

  @override
  Future<void> createWaiterCall(String tableId, String tableLabel, CallType type, {String? note, bool isVip = false}) async {
    final id = 'call_${Random().nextInt(100000)}';
    final timestamp = DateTime.now();
    final call = WaiterCall(
      id: id,
      tableId: tableId,
      tableLabel: tableLabel,
      type: type,
      status: CallStatus.pending,
      customerNote: note,
      timestamp: timestamp,
      isVip: isVip,
    );

    _inMemoryCalls.add(call);
    _emit();

    final payload = <String, dynamic>{
      'id': id,
      'tableId': tableId,
      'tableLabel': tableLabel,
      'type': type.name,
      'customerNote': note,
      'timestamp': timestamp.toIso8601String(),
      'isVip': isVip,
    };

    if (await networkInfo.isConnected) {
      try {
        await Future.delayed(const Duration(milliseconds: 200));
      } catch (_) {
        await offlineQueue.queueWrite(action: 'createWaiterCall', payload: payload);
      }
    } else {
      await offlineQueue.queueWrite(action: 'createWaiterCall', payload: payload);
    }
  }

  @override
  Future<void> applyRemoteCallUpdate(WaiterCall call) async {
    final idx = _inMemoryCalls.indexWhere((c) => c.id == call.id);
    if (idx != -1) {
      _inMemoryCalls[idx] = call;
    } else {
      _inMemoryCalls.add(call);
    }
    _emit();
  }

  @override
  Future<void> applyRemoteCallDelete(String callId) async {
    _inMemoryCalls.removeWhere((c) => c.id == callId);
    _emit();
  }

  @override
  Future<void> syncWaiterCalls(List<WaiterCall> calls) async {
    _inMemoryCalls.clear();
    _inMemoryCalls.addAll(calls);
    _emit();
  }

  @override
  Future<List<WaiterCall>> fetchActiveCalls() async {
    return _inMemoryCalls.where((c) => c.status != CallStatus.resolved).toList();
  }
}
