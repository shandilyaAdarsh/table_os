// lib/core/runtime/domain/runtime_event.dart
//
// RuntimeEvent — the canonical envelope for every realtime payload that enters
// the system. ALL websocket messages are decoded into this type before any
// further processing. Nothing downstream ever sees raw JSON.

import 'package:equatable/equatable.dart';

/// Supported event types routed through RealtimeEventRouter.
enum RuntimeEventType {
  // Tables
  tableUpdate,
  tableDelete,
  // Orders
  orderUpdate,
  orderDelete,
  // Waiter calls
  waiterCall,
  waiterCallDelete,
  // Kitchen
  kitchenItemUpdate,
  kitchenQueueUpdate,
  // Reservations
  reservationUpdate,
  reservationDelete,
  waitlistUpdate,
  waitlistDelete,
  // Staff presence
  staffPresenceUpdate,
  staffPresenceDelete,
  // Operational alerts
  operationalAlertCreated,
  operationalAlertUpdated,
  operationalAlertDismissed,
  // Floor analytics
  floorAnalyticsDelta,
  // Session / epoch
  authSessionInvalidated,
  epochInvalidated,
  // Fallback
  unknown,
}

class RuntimeEvent extends Equatable {
  /// Globally unique key — used for idempotency deduplication.
  final String idempotencyKey;

  /// Monotonically increasing sequence number per branch channel.
  final int sequenceNumber;

  /// The branch this event belongs to.
  final String branchId;

  /// The epoch this event was issued under.
  final String epochId;

  /// Parsed event type.
  final RuntimeEventType type;

  /// Raw payload — only the router and projection engine may read this.
  final Map<String, dynamic> payload;

  /// Wall-clock time the event was received by the transport layer.
  final DateTime receivedAt;

  const RuntimeEvent({
    required this.idempotencyKey,
    required this.sequenceNumber,
    required this.branchId,
    required this.epochId,
    required this.type,
    required this.payload,
    required this.receivedAt,
  });

  static RuntimeEventType _parseType(String raw) {
    switch (raw) {
      case 'table_update':        return RuntimeEventType.tableUpdate;
      case 'table_delete':        return RuntimeEventType.tableDelete;
      case 'order_update':        return RuntimeEventType.orderUpdate;
      case 'order_delete':        return RuntimeEventType.orderDelete;
      case 'waiter_call':         return RuntimeEventType.waiterCall;
      case 'waiter_call_delete':  return RuntimeEventType.waiterCallDelete;
      case 'kitchen_item_update': return RuntimeEventType.kitchenItemUpdate;
      case 'kitchen_queue_update':return RuntimeEventType.kitchenQueueUpdate;
      case 'reservation_update':  return RuntimeEventType.reservationUpdate;
      case 'reservation_delete':  return RuntimeEventType.reservationDelete;
      case 'waitlist_update':     return RuntimeEventType.waitlistUpdate;
      case 'waitlist_delete':     return RuntimeEventType.waitlistDelete;
      case 'staff_presence_update': return RuntimeEventType.staffPresenceUpdate;
      case 'staff_presence_delete': return RuntimeEventType.staffPresenceDelete;
      case 'operational_alert_created':  return RuntimeEventType.operationalAlertCreated;
      case 'operational_alert_updated':  return RuntimeEventType.operationalAlertUpdated;
      case 'operational_alert_dismissed':return RuntimeEventType.operationalAlertDismissed;
      case 'floor_analytics_delta':      return RuntimeEventType.floorAnalyticsDelta;
      case 'auth_session_invalidated':   return RuntimeEventType.authSessionInvalidated;
      case 'epoch_invalidated':          return RuntimeEventType.epochInvalidated;
      default:                           return RuntimeEventType.unknown;
    }
  }

  /// Decode a raw websocket JSON envelope into a RuntimeEvent.
  /// Returns null if the envelope is malformed.
  static RuntimeEvent? tryParse(
    Map<String, dynamic> json, {
    String fallbackBranchId = '',
    String fallbackEpochId = '',
  }) {
    try {
      final key     = (json['idempotencyKey'] ?? json['event_id']) as String?;
      final seq     = (json['sequenceNumber'] ?? json['event_sequence']) as int?;
      final typeStr = (json['type'] ?? json['event_type']) as String?;
      final payload = json['payload'] as Map<String, dynamic>?;

      if (key == null || seq == null || typeStr == null || payload == null) {
        return null;
      }

      final branch = (json['branchId'] ?? json['branch_id']) as String? ?? fallbackBranchId;
      final epoch = (json['epochId'] ?? json['server_epoch']?.toString() ?? json['epoch_id']) as String? ?? fallbackEpochId;

      return RuntimeEvent(
        idempotencyKey: key,
        sequenceNumber: seq,
        branchId: branch,
        epochId:  epoch,
        type:     _parseType(typeStr),
        payload:  payload,
        receivedAt: DateTime.now(),
      );
    } catch (_) {
      return null;
    }
  }

  @override
  List<Object?> get props =>
      [idempotencyKey, sequenceNumber, branchId, epochId, type];

  @override
  String toString() =>
      'RuntimeEvent(seq: $sequenceNumber, type: $type, branch: $branchId, key: $idempotencyKey)';
}
