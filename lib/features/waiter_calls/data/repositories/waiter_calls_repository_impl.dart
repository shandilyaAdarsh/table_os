import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';
import '../../../../core/network/network_info.dart';
import '../../../../core/network/offline_queue.dart';
import '../../../auth/presentation/state/auth_notifier.dart';
import '../../../tables/providers/tables_providers.dart';
import '../../domain/entities/waiter_call.dart';
import '../../domain/repositories/waiter_calls_repository.dart';
import '../datasources/remote/waiter_calls_remote_datasource.dart';

class WaiterCallsRepositoryImpl implements WaiterCallsRepository {
  final NetworkInfo networkInfo;
  final OfflineQueueManager offlineQueue;
  final WaiterCallsRemoteDatasource remote;
  final ProviderRef ref;
  
  final List<WaiterCall> _inMemoryCalls = [];
  final StreamController<List<WaiterCall>> _streamController = StreamController<List<WaiterCall>>.broadcast();

  WaiterCallsRepositoryImpl({
    required this.networkInfo,
    required this.offlineQueue,
    required this.remote,
    required this.ref,
  }) {
    // Register offline handlers
    offlineQueue.registerHandler('acknowledgeCall', (payload) async {
      final callId = payload['callId'] as String;
      final versionNum = payload['versionNum'] as int? ?? 1;
      await remote.transitionStatus(callId, {
        'status': 'acknowledged',
        'version_num': versionNum,
      });
    });

    offlineQueue.registerHandler('resolveCall', (payload) async {
      final callId = payload['callId'] as String;
      final versionNum = payload['versionNum'] as int? ?? 1;
      await remote.transitionStatus(callId, {
        'status': 'resolved',
        'version_num': versionNum,
      });
    });

    offlineQueue.registerHandler('createWaiterCallDirect', (payload) async {
      await Supabase.instance.client.from('waiter_calls').insert(payload);
    });
  }

  Future<String> _resolveTableLabel(String tableId) async {
    try {
      final tables = await ref.read(tablesRepositoryProvider).getTables();
      final table = tables.firstWhere((t) => t.id == tableId);
      return table.label;
    } catch (_) {}
    return 'Table $tableId';
  }

  Future<WaiterCall> _mapToDomain(Map<String, dynamic> json) async {
    final id = json['id'] as String;
    final tableId = json['table_id'] as String;
    final tableLabel = await _resolveTableLabel(tableId);
    
    final rawType = json['type'] as String? ?? 'service';
    CallType type = CallType.service;
    if (rawType == 'bill') {
      type = CallType.billRequest;
    } else if (rawType == 'other') {
      type = CallType.assistance;
    }
    
    final rawStatus = json['status'] as String? ?? 'pending';
    CallStatus status = CallStatus.pending;
    if (rawStatus == 'acknowledged') {
      status = CallStatus.acknowledged;
    } else if (rawStatus == 'resolved') {
      status = CallStatus.resolved;
    } else if (rawStatus == 'escalated') {
      status = CallStatus.escalated;
    }
    
    final customerNote = json['notes'] as String?;
    final timestamp = DateTime.parse(json['created_at'] as String? ?? DateTime.now().toIso8601String());
    final waiterId = json['acknowledged_by'] as String?;
    
    return WaiterCall(
      id: id,
      tableId: tableId,
      tableLabel: tableLabel,
      type: type,
      status: status,
      customerNote: customerNote,
      timestamp: timestamp,
      waiterId: waiterId,
      waiterName: waiterId != null ? 'John Doe' : null,
      isVip: json['is_vip'] as bool? ?? false,
    );
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
    _updateCallInMemory(callId, status: CallStatus.acknowledged, waiterId: waiterId, waiterName: waiterName);

    final isConnected = await networkInfo.isConnected;
    int versionNum = 1;

    if (isConnected) {
      try {
        final response = await Supabase.instance.client
            .from('waiter_calls')
            .select('version_num')
            .eq('id', callId)
            .maybeSingle();
        versionNum = response?['version_num'] as int? ?? 1;

        final result = await remote.transitionStatus(callId, {
          'status': 'acknowledged',
          'version_num': versionNum,
        });

        final updated = await _mapToDomain(result);
        final idx = _inMemoryCalls.indexWhere((c) => c.id == callId);
        if (idx != -1) {
          _inMemoryCalls[idx] = updated;
          _emit();
        }
      } catch (e) {
        debugPrint('[WaiterCallsRepositoryImpl] submitAcknowledgement online failed, queueing: $e');
        await offlineQueue.queueWrite(action: 'acknowledgeCall', payload: {
          'callId': callId,
          'waiterId': waiterId,
          'waiterName': waiterName,
          'versionNum': versionNum,
        });
      }
    } else {
      await offlineQueue.queueWrite(action: 'acknowledgeCall', payload: {
        'callId': callId,
        'waiterId': waiterId,
        'waiterName': waiterName,
        'versionNum': 1,
      });
    }
  }

  @override
  Future<void> resolveCall(String callId) async {
    _updateCallInMemory(callId, status: CallStatus.resolved);

    final isConnected = await networkInfo.isConnected;
    int versionNum = 1;

    if (isConnected) {
      try {
        final response = await Supabase.instance.client
            .from('waiter_calls')
            .select('version_num')
            .eq('id', callId)
            .maybeSingle();
        versionNum = response?['version_num'] as int? ?? 1;

        final result = await remote.transitionStatus(callId, {
          'status': 'resolved',
          'version_num': versionNum,
        });

        final updated = await _mapToDomain(result);
        _inMemoryCalls.removeWhere((c) => c.id == callId);
        _inMemoryCalls.add(updated);
        _emit();
      } catch (e) {
        debugPrint('[WaiterCallsRepositoryImpl] resolveCall online failed, queueing: $e');
        await offlineQueue.queueWrite(action: 'resolveCall', payload: {
          'callId': callId,
          'versionNum': versionNum,
        });
      }
    } else {
      await offlineQueue.queueWrite(action: 'resolveCall', payload: {
        'callId': callId,
        'versionNum': 1,
      });
    }
  }

  @override
  Future<void> escalateCall(String callId) async {
    _updateCallInMemory(callId, status: CallStatus.escalated);
    
    // escalate call in this context resolves it to escalated in memory
    // escalations don't have separate REST endpoints, so we just acknowledge it or keep status as escalated
  }

  @override
  Future<void> createWaiterCall(String tableId, String tableLabel, CallType type, {String? note, bool isVip = false}) async {
    final authState = ref.read(authNotifierProvider);
    final branchId = authState.selectedBranch?.id ?? '00000000-0000-0000-0000-000000000000';
    final tenantId = authState.selectedOrg?.id ?? '00000000-0000-0000-0000-000000000000';
    final callId = const Uuid().v4();
    final timestamp = DateTime.now();

    final optimisticCall = WaiterCall(
      id: callId,
      tableId: tableId,
      tableLabel: tableLabel,
      type: type,
      status: CallStatus.pending,
      customerNote: note,
      timestamp: timestamp,
      isVip: isVip,
    );

    _inMemoryCalls.add(optimisticCall);
    _emit();

    final payload = <String, dynamic>{
      'id': callId,
      'tenant_id': tenantId,
      'branch_id': branchId,
      'table_id': tableId,
      'type': type == CallType.billRequest ? 'bill' : (type == CallType.assistance ? 'other' : 'service'),
      'notes': note,
      'status': 'pending',
      'is_vip': isVip,
      'created_at': timestamp.toIso8601String(),
    };

    final isConnected = await networkInfo.isConnected;
    if (isConnected) {
      try {
        final response = await Supabase.instance.client.from('waiter_calls').insert(payload).select().single();
        final created = await _mapToDomain(response);
        final idx = _inMemoryCalls.indexWhere((c) => c.id == callId);
        if (idx != -1) {
          _inMemoryCalls[idx] = created;
          _emit();
        }
      } catch (e) {
        debugPrint('[WaiterCallsRepositoryImpl] createWaiterCall online failed, queueing: $e');
        await offlineQueue.queueWrite(action: 'createWaiterCallDirect', payload: payload);
      }
    } else {
      await offlineQueue.queueWrite(action: 'createWaiterCallDirect', payload: payload);
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
    final authState = ref.read(authNotifierProvider);
    final branchId = authState.selectedBranch?.id;
    if (branchId == null) return [];

    final isConnected = await networkInfo.isConnected;
    if (isConnected) {
      try {
        final list = await remote.fetchActiveCalls(branchId);
        final List<WaiterCall> fetchedCalls = [];
        for (final row in list) {
          final call = await _mapToDomain(row);
          fetchedCalls.add(call);
        }

        _inMemoryCalls.clear();
        _inMemoryCalls.addAll(fetchedCalls);
        _emit();
        return fetchedCalls;
      } catch (e) {
        debugPrint('[WaiterCallsRepositoryImpl] fetchActiveCalls failed: $e');
      }
    }

    return _inMemoryCalls.where((c) => c.status != CallStatus.resolved).toList();
  }
}
