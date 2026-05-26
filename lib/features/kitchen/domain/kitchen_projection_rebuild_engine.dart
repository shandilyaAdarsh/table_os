// lib/features/kitchen/domain/kitchen_projection_rebuild_engine.dart
//
// KitchenProjectionRebuildEngine — deterministic ticket reconstruction.
//
// RULES:
//   - Tickets are NEVER mutated in-place. Each rebuild produces a new immutable projection.
//   - Stale events (seq <= lastProjectionSeq) are silently discarded.
//   - invalidateAll() marks all projections stale before replay recovery.
//   - getOrderedQueue() always returns tickets in deterministic receivedAt order.
//   - No local truth — projections are always derived from authoritative payloads.

import 'package:flutter/foundation.dart';
import 'entities/kitchen_ticket.dart';

// ━━━━━━━━━━━━━━━━━━━━━━ PROJECTION STORE ━━━━━━━━━━━━━━━━━━━━━━

/// Wraps a KitchenTicket with invalidation metadata.
class _TicketProjection {
  final KitchenTicket ticket;
  final bool isStale;
  final DateTime lastProjectedAt;

  const _TicketProjection({
    required this.ticket,
    required this.isStale,
    required this.lastProjectedAt,
  });

  _TicketProjection markStale() => _TicketProjection(
        ticket: ticket,
        isStale: true,
        lastProjectedAt: lastProjectedAt,
      );

  _TicketProjection withTicket(KitchenTicket t) => _TicketProjection(
        ticket: t,
        isStale: false,
        lastProjectedAt: DateTime.now(),
      );
}

// ━━━━━━━━━━━━━━━━━━━━━━ ENGINE ━━━━━━━━━━━━━━━━━━━━━━

class KitchenProjectionRebuildEngine {
  /// ticketId → projection
  final Map<String, _TicketProjection> _projections = {};

  // ━━━━━━━━━━━━━━━━━━━━━━ APPLY EVENTS ━━━━━━━━━━━━━━━━━━━━━━

  /// Apply a kitchenItemUpdate event — rebuilds the affected ticket projection.
  void applyItemUpdate({
    required Map<String, dynamic> payload,
    required String epochId,
    required int sequence,
  }) {
    final ticketId = _resolveTicketId(payload);
    if (ticketId == null) {
      debugPrint('[KitchenProjectionRebuildEngine] applyItemUpdate: missing ticketId');
      return;
    }

    final existing = _projections[ticketId];

    // Stale event guard — discard if this sequence is behind the last projection
    if (existing != null &&
        !existing.isStale &&
        sequence <= existing.ticket.projectionSequence) {
      debugPrint(
          '[KitchenProjectionRebuildEngine] DISCARDED stale item update: '
          'ticket=$ticketId seq=$sequence lastSeq=${existing.ticket.projectionSequence}');
      return;
    }

    final updatedTicket = _rebuildTicketFromItemUpdate(
      existing: existing?.ticket,
      payload: payload,
      epochId: epochId,
      sequence: sequence,
    );

    _projections[ticketId] = _TicketProjection(
      ticket: updatedTicket,
      isStale: false,
      lastProjectedAt: DateTime.now(),
    );

    debugPrint(
        '[KitchenProjectionRebuildEngine] Rebuilt ticket (item update): '
        '$ticketId status=${updatedTicket.status} seq=$sequence');
  }

  /// Apply a kitchenQueueUpdate event — rebuilds the full queue projection.
  void applyQueueUpdate({
    required Map<String, dynamic> payload,
    required String epochId,
    required int sequence,
  }) {
    // Queue update may carry a full list of tickets
    final rawTickets = payload['tickets'] as List<dynamic>?;
    if (rawTickets != null) {
      for (final raw in rawTickets) {
        final ticketJson = raw as Map<String, dynamic>;
        final ticket = KitchenTicket.fromJson(
          ticketJson,
          epochId: epochId,
          sequence: sequence,
        );

        final existing = _projections[ticket.ticketId];
        if (existing != null &&
            !existing.isStale &&
            sequence <= existing.ticket.projectionSequence) {
          continue; // Stale — skip
        }

        _projections[ticket.ticketId] = _TicketProjection(
          ticket: ticket,
          isStale: false,
          lastProjectedAt: DateTime.now(),
        );
      }
      debugPrint(
          '[KitchenProjectionRebuildEngine] Queue update applied: '
          '${rawTickets.length} tickets seq=$sequence');
      return;
    }

    // Single-ticket queue update
    final ticketId = _resolveTicketId(payload);
    if (ticketId == null) return;

    final existing = _projections[ticketId];
    if (existing != null &&
        !existing.isStale &&
        sequence <= existing.ticket.projectionSequence) {
      return;
    }

    final ticket = KitchenTicket.fromJson(
      payload,
      epochId: epochId,
      sequence: sequence,
    );

    _projections[ticketId] = _TicketProjection(
      ticket: ticket,
      isStale: false,
      lastProjectedAt: DateTime.now(),
    );

    debugPrint(
        '[KitchenProjectionRebuildEngine] Queue update applied: '
        'ticket=$ticketId status=${ticket.status} seq=$sequence');
  }

  /// Directly apply a fully-constructed projection (used by replay recovery).
  void applyProjection(KitchenTicket ticket) {
    _projections[ticket.ticketId] = _TicketProjection(
      ticket: ticket,
      isStale: false,
      lastProjectedAt: DateTime.now(),
    );
    debugPrint(
        '[KitchenProjectionRebuildEngine] Applied projection: '
        '${ticket.ticketId} seq=${ticket.projectionSequence}');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ INVALIDATION ━━━━━━━━━━━━━━━━━━━━━━

  /// Mark all projections stale — called before replay recovery.
  void invalidateAll({required String reason}) {
    for (final key in _projections.keys) {
      _projections[key] = _projections[key]!.markStale();
    }
    debugPrint(
        '[KitchenProjectionRebuildEngine] Invalidated all projections: reason=$reason');
  }

  /// Mark a specific ticket projection stale.
  void invalidateTicket(String ticketId, {required String reason}) {
    final existing = _projections[ticketId];
    if (existing != null) {
      _projections[ticketId] = existing.markStale();
      debugPrint(
          '[KitchenProjectionRebuildEngine] Invalidated ticket: $ticketId reason=$reason');
    }
  }

  /// Clear all projections (session end).
  void clearAll() {
    _projections.clear();
    debugPrint('[KitchenProjectionRebuildEngine] Cleared all projections');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ QUERY ━━━━━━━━━━━━━━━━━━━━━━

  KitchenTicket? getTicket(String ticketId) {
    final proj = _projections[ticketId];
    if (proj == null || proj.isStale) return null;
    return proj.ticket;
  }

  /// Returns all non-stale, non-terminal tickets.
  List<KitchenTicket> getActiveQueue() {
    return _projections.values
        .where((p) => !p.isStale && !p.ticket.isTerminal)
        .map((p) => p.ticket)
        .toList();
  }

  /// Returns all non-stale tickets sorted deterministically by receivedAt.
  List<KitchenTicket> getOrderedQueue() {
    final tickets = _projections.values
        .where((p) => !p.isStale)
        .map((p) => p.ticket)
        .toList();

    // Deterministic ordering: receivedAt ASC, then ticketId for tie-breaking
    tickets.sort((a, b) {
      final cmp = a.receivedAt.compareTo(b.receivedAt);
      return cmp != 0 ? cmp : a.ticketId.compareTo(b.ticketId);
    });

    return tickets;
  }

  Map<String, dynamic> getStats() => {
        'totalProjections': _projections.length,
        'staleProjections':
            _projections.values.where((p) => p.isStale).length,
        'activeTickets': getActiveQueue().length,
      };

  // ━━━━━━━━━━━━━━━━━━━━━━ INTERNAL REBUILD ━━━━━━━━━━━━━━━━━━━━━━

  /// Reconstruct a ticket from an item-level update payload.
  /// If no existing ticket, creates a new one from the payload.
  KitchenTicket _rebuildTicketFromItemUpdate({
    required KitchenTicket? existing,
    required Map<String, dynamic> payload,
    required String epochId,
    required int sequence,
  }) {
    if (existing == null) {
      // First event for this ticket — construct from payload
      return KitchenTicket.fromJson(
        payload,
        epochId: epochId,
        sequence: sequence,
      );
    }

    // Apply item-level delta to existing ticket
    final itemId = payload['itemId'] as String?;
    if (itemId == null) {
      // No specific item — treat as full ticket update
      return KitchenTicket.fromJson(
        payload,
        epochId: epochId,
        sequence: sequence,
      );
    }

    final updatedItem = KitchenItem.fromJson(
      payload['item'] as Map<String, dynamic>? ?? payload,
      sequence,
    );

    final updatedItems = existing.items.map((item) {
      return item.itemId == itemId ? updatedItem : item;
    }).toList();

    // If item didn't exist, append it
    if (!existing.items.any((i) => i.itemId == itemId)) {
      updatedItems.add(updatedItem);
    }

    final rebuilt = existing.copyWith(
      items: updatedItems,
      projectionEpochId: epochId,
      projectionSequence: sequence,
      projectedAt: DateTime.now(),
    );

    // Derive authoritative status from item states
    return rebuilt.copyWith(status: rebuilt.deriveStatus());
  }

  String? _resolveTicketId(Map<String, dynamic> payload) {
    return payload['ticketId'] as String? ?? payload['orderId'] as String?;
  }
}
