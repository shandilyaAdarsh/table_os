// lib/features/kitchen/domain/entities/kitchen_ticket.dart
//
// KitchenTicket — immutable, projection-derived representation of a kitchen order.
//
// RULES:
//   - NEVER constructed from local mutable state.
//   - ALWAYS reconstructed from authoritative runtime projections.
//   - ALL transitions are validated by KitchenRuntimeCoordinator.
//   - Replay-safe: identical inputs always produce identical tickets.

import 'package:equatable/equatable.dart';

// ━━━━━━━━━━━━━━━━━━━━━━ ENUMS ━━━━━━━━━━━━━━━━━━━━━━

/// Authoritative kitchen ticket lifecycle states.
/// Transitions are governed by KitchenRuntimeCoordinator — never set directly.
enum KitchenTicketStatus {
  /// Ticket received by kitchen, not yet acknowledged.
  queued,

  /// At least one item is being actively prepared.
  preparing,

  /// All active items are ready; awaiting runner dispatch.
  ready,

  /// Ticket has been served to the table.
  served,

  /// Ticket was cancelled before completion.
  cancelled,

  /// Ticket was recovered after a reconnect/replay cycle.
  recovered,

  /// Ticket is delayed beyond SLA threshold.
  delayed,

  /// Ticket is partially complete (some items ready, some still preparing).
  partiallyReady,
}

/// Authoritative kitchen item lifecycle states.
enum KitchenItemStatus {
  pending,
  preparing,
  ready,
  served,
  cancelled,
}

// ━━━━━━━━━━━━━━━━━━━━━━ KITCHEN ITEM ━━━━━━━━━━━━━━━━━━━━━━

/// Immutable projection of a single kitchen item within a ticket.
class KitchenItem extends Equatable {
  final String itemId;
  final String name;
  final int quantity;
  final KitchenItemStatus status;
  final String? notes;
  final String? stationId;

  /// Sequence number of the last event that mutated this item.
  final int lastMutationSequence;

  const KitchenItem({
    required this.itemId,
    required this.name,
    required this.quantity,
    required this.status,
    this.notes,
    this.stationId,
    required this.lastMutationSequence,
  });

  bool get isActive => status != KitchenItemStatus.cancelled;
  bool get isComplete =>
      status == KitchenItemStatus.ready || status == KitchenItemStatus.served;

  KitchenItem copyWith({
    KitchenItemStatus? status,
    String? stationId,
    int? lastMutationSequence,
  }) {
    return KitchenItem(
      itemId: itemId,
      name: name,
      quantity: quantity,
      status: status ?? this.status,
      notes: notes,
      stationId: stationId ?? this.stationId,
      lastMutationSequence:
          lastMutationSequence ?? this.lastMutationSequence,
    );
  }

  factory KitchenItem.fromJson(Map<String, dynamic> json, int seq) {
    return KitchenItem(
      itemId: json['itemId'] as String,
      name: json['name'] as String,
      quantity: json['quantity'] as int? ?? 1,
      status: _parseItemStatus(json['status'] as String? ?? 'pending'),
      notes: json['notes'] as String?,
      stationId: json['stationId'] as String?,
      lastMutationSequence: seq,
    );
  }

  static KitchenItemStatus _parseItemStatus(String raw) {
    switch (raw) {
      case 'preparing':
        return KitchenItemStatus.preparing;
      case 'ready':
        return KitchenItemStatus.ready;
      case 'served':
        return KitchenItemStatus.served;
      case 'cancelled':
        return KitchenItemStatus.cancelled;
      default:
        return KitchenItemStatus.pending;
    }
  }

  Map<String, dynamic> toJson() => {
        'itemId': itemId,
        'name': name,
        'quantity': quantity,
        'status': status.name,
        'notes': notes,
        'stationId': stationId,
        'lastMutationSequence': lastMutationSequence,
      };

  @override
  List<Object?> get props =>
      [itemId, name, quantity, status, notes, stationId, lastMutationSequence];
}

// ━━━━━━━━━━━━━━━━━━━━━━ KITCHEN TICKET ━━━━━━━━━━━━━━━━━━━━━━

/// Immutable, projection-derived kitchen ticket.
///
/// This is the ONLY authoritative representation of kitchen state.
/// It is NEVER mutated directly — always reconstructed via
/// KitchenProjectionRebuildEngine from authoritative runtime events.
class KitchenTicket extends Equatable {
  final String ticketId;
  final String orderId;
  final String tableId;
  final String? tableLabel;
  final String branchId;

  final KitchenTicketStatus status;
  final List<KitchenItem> items;

  /// Epoch under which this ticket was last projected.
  final String projectionEpochId;

  /// Sequence number of the last event that produced this projection.
  final int projectionSequence;

  /// Wall-clock time this ticket was first received by the kitchen.
  final DateTime receivedAt;

  /// Wall-clock time this ticket was last projected (rebuilt).
  final DateTime projectedAt;

  /// SLA deadline — tickets past this time are marked [KitchenTicketStatus.delayed].
  final DateTime? slaDeadline;

  /// Whether this ticket was reconstructed via replay recovery.
  final bool isReplayRecovered;

  const KitchenTicket({
    required this.ticketId,
    required this.orderId,
    required this.tableId,
    this.tableLabel,
    required this.branchId,
    required this.status,
    required this.items,
    required this.projectionEpochId,
    required this.projectionSequence,
    required this.receivedAt,
    required this.projectedAt,
    this.slaDeadline,
    this.isReplayRecovered = false,
  });

  // ── Derived state ──────────────────────────────────────────────────────────

  List<KitchenItem> get activeItems =>
      items.where((i) => i.isActive).toList();

  bool get allItemsReady =>
      activeItems.isNotEmpty && activeItems.every((i) => i.isComplete);

  bool get anyItemPreparing =>
      activeItems.any((i) => i.status == KitchenItemStatus.preparing);

  bool get isDelayed =>
      slaDeadline != null && DateTime.now().isAfter(slaDeadline!);

  bool get isTerminal =>
      status == KitchenTicketStatus.served ||
      status == KitchenTicketStatus.cancelled;

  int get pendingItemCount =>
      activeItems.where((i) => i.status == KitchenItemStatus.pending).length;

  int get readyItemCount =>
      activeItems.where((i) => i.isComplete).length;

  // ── Projection rebuild ─────────────────────────────────────────────────────

  /// Derive the authoritative ticket status from item states.
  /// This is the ONLY way ticket status is computed — never set directly.
  KitchenTicketStatus deriveStatus() {
    if (activeItems.isEmpty) return KitchenTicketStatus.cancelled;
    if (allItemsReady) return KitchenTicketStatus.ready;
    if (anyItemPreparing) {
      final someReady =
          activeItems.any((i) => i.status == KitchenItemStatus.ready);
      return someReady
          ? KitchenTicketStatus.partiallyReady
          : KitchenTicketStatus.preparing;
    }
    if (isDelayed) return KitchenTicketStatus.delayed;
    return KitchenTicketStatus.queued;
  }

  KitchenTicket copyWith({
    KitchenTicketStatus? status,
    List<KitchenItem>? items,
    String? projectionEpochId,
    int? projectionSequence,
    DateTime? projectedAt,
    DateTime? slaDeadline,
    bool? isReplayRecovered,
  }) {
    return KitchenTicket(
      ticketId: ticketId,
      orderId: orderId,
      tableId: tableId,
      tableLabel: tableLabel,
      branchId: branchId,
      status: status ?? this.status,
      items: items ?? this.items,
      projectionEpochId: projectionEpochId ?? this.projectionEpochId,
      projectionSequence: projectionSequence ?? this.projectionSequence,
      receivedAt: receivedAt,
      projectedAt: projectedAt ?? this.projectedAt,
      slaDeadline: slaDeadline ?? this.slaDeadline,
      isReplayRecovered: isReplayRecovered ?? this.isReplayRecovered,
    );
  }

  factory KitchenTicket.fromJson(
    Map<String, dynamic> json, {
    required String epochId,
    required int sequence,
  }) {
    final rawItems = json['items'] as List<dynamic>? ?? [];
    final items = rawItems
        .map((i) => KitchenItem.fromJson(i as Map<String, dynamic>, sequence))
        .toList();

    return KitchenTicket(
      ticketId: json['ticketId'] as String? ?? json['orderId'] as String,
      orderId: json['orderId'] as String,
      tableId: json['tableId'] as String,
      tableLabel: json['tableLabel'] as String?,
      branchId: json['branchId'] as String,
      status: _parseStatus(json['status'] as String? ?? 'queued'),
      items: items,
      projectionEpochId: epochId,
      projectionSequence: sequence,
      receivedAt: json['receivedAt'] != null
          ? DateTime.parse(json['receivedAt'] as String)
          : DateTime.now(),
      projectedAt: DateTime.now(),
      slaDeadline: json['slaDeadline'] != null
          ? DateTime.parse(json['slaDeadline'] as String)
          : null,
      isReplayRecovered: json['isReplayRecovered'] as bool? ?? false,
    );
  }

  static KitchenTicketStatus _parseStatus(String raw) {
    switch (raw) {
      case 'preparing':
        return KitchenTicketStatus.preparing;
      case 'ready':
        return KitchenTicketStatus.ready;
      case 'served':
        return KitchenTicketStatus.served;
      case 'cancelled':
        return KitchenTicketStatus.cancelled;
      case 'recovered':
        return KitchenTicketStatus.recovered;
      case 'delayed':
        return KitchenTicketStatus.delayed;
      case 'partiallyReady':
        return KitchenTicketStatus.partiallyReady;
      default:
        return KitchenTicketStatus.queued;
    }
  }

  Map<String, dynamic> toJson() => {
        'ticketId': ticketId,
        'orderId': orderId,
        'tableId': tableId,
        'tableLabel': tableLabel,
        'branchId': branchId,
        'status': status.name,
        'items': items.map((i) => i.toJson()).toList(),
        'projectionEpochId': projectionEpochId,
        'projectionSequence': projectionSequence,
        'receivedAt': receivedAt.toIso8601String(),
        'projectedAt': projectedAt.toIso8601String(),
        'slaDeadline': slaDeadline?.toIso8601String(),
        'isReplayRecovered': isReplayRecovered,
      };

  @override
  List<Object?> get props => [
        ticketId,
        orderId,
        tableId,
        branchId,
        status,
        items,
        projectionEpochId,
        projectionSequence,
      ];

  @override
  String toString() =>
      'KitchenTicket(id: $ticketId, order: $orderId, table: $tableId, '
      'status: $status, items: ${items.length}, seq: $projectionSequence)';
}
