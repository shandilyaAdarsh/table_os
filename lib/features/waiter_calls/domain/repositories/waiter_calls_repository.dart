// lib/features/waiter_calls/domain/repositories/waiter_calls_repository.dart
import '../entities/waiter_call.dart';

abstract class WaiterCallsRepository {
  Future<List<WaiterCall>> getCachedWaiterCalls();
  Stream<List<WaiterCall>> watchWaiterCalls();
  Future<void> submitAcknowledgement(String callId, String waiterId, String waiterName);
  Future<void> resolveCall(String callId);
  Future<void> escalateCall(String callId);
  Future<void> createWaiterCall(String tableId, String tableLabel, CallType type, {String? note, bool isVip});

  Future<void> applyRemoteCallUpdate(WaiterCall call);
  Future<void> applyRemoteCallDelete(String callId);

  // New sync methods for deterministic projection
  Future<void> syncWaiterCalls(List<WaiterCall> calls);
  Future<List<WaiterCall>> fetchActiveCalls();
}
