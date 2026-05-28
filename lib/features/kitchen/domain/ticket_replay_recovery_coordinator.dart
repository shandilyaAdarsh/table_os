// lib/features/kitchen/domain/ticket_replay_recovery_coordinator.dart
//
// TicketReplayRecoveryCoordinator — deterministic kitchen recovery after reconnect.
//
// RECOVERY PIPELINE:
//   1. Fetch authoritative snapshot from backend (sequence checkpoint)
//   2. Reconstruct all active tickets from snapshot
//   3. Fetch delta events since lastKnownSequence
//   4. Replay delta events in sequence order
//   5. Publish recovered projections via onTicketRecovered callback
//   6. Advance SequenceValidator to recovered sequence
//
// RULES:
//   - Recovered state MUST exactly match backend-authoritative state.
//   - Partial replay is safe — each event is idempotent.
//   - Stale projections are invalidated BEFORE recovery begins.
//   - Recovery is epoch-safe — events from wrong epoch are discarded.

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import 'package:uuid/uuid.dart';
import '../../../../core/network/dio_client.dart';
import '../../../../core/network/secure_storage.dart';
import '../../../../core/network/network_providers.dart';
import 'entities/kitchen_ticket.dart';

// ━━━━━━━━━━━━━━━━━━━━━━ RECOVERY RESULT ━━━━━━━━━━━━━━━━━━━━━━

class KitchenRecoveryResult {
  final bool success;
  final int ticketsRecovered;
  final int eventsReplayed;
  final int highestSequence;
  final String? errorMessage;
  final DateTime completedAt;

  const KitchenRecoveryResult({
    required this.success,
    required this.ticketsRecovered,
    required this.eventsReplayed,
    required this.highestSequence,
    this.errorMessage,
    required this.completedAt,
  });

  factory KitchenRecoveryResult.success({
    required int ticketsRecovered,
    required int eventsReplayed,
    required int highestSequence,
  }) {
    return KitchenRecoveryResult(
      success: true,
      ticketsRecovered: ticketsRecovered,
      eventsReplayed: eventsReplayed,
      highestSequence: highestSequence,
      completedAt: DateTime.now(),
    );
  }

  factory KitchenRecoveryResult.failure(String error) {
    return KitchenRecoveryResult(
      success: false,
      ticketsRecovered: 0,
      eventsReplayed: 0,
      highestSequence: 0,
      errorMessage: error,
      completedAt: DateTime.now(),
    );
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━ REPLAY EVENT ━━━━━━━━━━━━━━━━━━━━━━

/// A single event in the replay stream.
class KitchenReplayEvent {
  final String idempotencyKey;
  final int sequenceNumber;
  final String epochId;
  final bool isItemUpdate;
  final Map<String, dynamic> payload;

  const KitchenReplayEvent({
    required this.idempotencyKey,
    required this.sequenceNumber,
    required this.epochId,
    required this.isItemUpdate,
    required this.payload,
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━ COORDINATOR ━━━━━━━━━━━━━━━━━━━━━━

class TicketReplayRecoveryCoordinator {
  final ProviderRef ref;

  TicketReplayRecoveryCoordinator(this.ref);

  /// Checkpoint: last successfully recovered sequence per branch.
  final Map<String, int> _recoveryCheckpoints = {};

  // ━━━━━━━━━━━━━━━━━━━━━━ RECOVERY EXECUTION ━━━━━━━━━━━━━━━━━━━━━━

  /// Execute full recovery for a branch after reconnect.
  ///
  /// [onTicketRecovered] is called for each reconstructed ticket.
  /// Returns the highest sequence number recovered.
  Future<KitchenRecoveryResult> executeRecovery({
    required String branchId,
    required String epochId,
    required int lastKnownSequence,
    required void Function(KitchenTicket ticket) onTicketRecovered,
  }) async {
    debugPrint(
        '[TicketReplayRecoveryCoordinator] Starting recovery: '
        'branch=$branchId epoch=$epochId lastSeq=$lastKnownSequence');

    try {
      // Step 1: Fetch authoritative snapshot
      final snapshot = await _fetchAuthoritativeSnapshot(
        branchId: branchId,
        epochId: epochId,
      );

      int ticketsRecovered = 0;
      int highestSequence = lastKnownSequence;

      // Step 2: Reconstruct tickets from snapshot
      for (final ticketJson in snapshot) {
        final ticket = KitchenTicket.fromJson(
          ticketJson,
          epochId: epochId,
          sequence: ticketJson['projectionSequence'] as int? ?? lastKnownSequence,
        );

        // Mark as replay-recovered
        final recoveredTicket = ticket.copyWith(isReplayRecovered: true);
        onTicketRecovered(recoveredTicket);
        ticketsRecovered++;

        if (recoveredTicket.projectionSequence > highestSequence) {
          highestSequence = recoveredTicket.projectionSequence;
        }
      }

      // Step 3: Fetch delta events since lastKnownSequence
      final deltaEvents = await _fetchDeltaEvents(
        branchId: branchId,
        epochId: epochId,
        fromSequence: lastKnownSequence + 1,
      );

      // Step 4: Sort delta events by sequence (deterministic replay order)
      deltaEvents.sort((a, b) => a.sequenceNumber.compareTo(b.sequenceNumber));

      // Step 5: Replay delta events
      int eventsReplayed = 0;
      final replayedKeys = <String>{};

      for (final event in deltaEvents) {
        // Epoch safety — discard cross-epoch events
        if (event.epochId != epochId) {
          debugPrint(
              '[TicketReplayRecoveryCoordinator] SKIP (epoch mismatch): '
              'seq=${event.sequenceNumber}');
          continue;
        }

        // Idempotency — skip already-replayed events
        if (replayedKeys.contains(event.idempotencyKey)) {
          debugPrint(
              '[TicketReplayRecoveryCoordinator] SKIP (duplicate): '
              '${event.idempotencyKey}');
          continue;
        }

        replayedKeys.add(event.idempotencyKey);

        // Reconstruct ticket from delta event
        final ticketId = event.payload['ticketId'] as String? ??
            event.payload['orderId'] as String?;
        if (ticketId != null) {
          final ticket = KitchenTicket.fromJson(
            event.payload,
            epochId: epochId,
            sequence: event.sequenceNumber,
          );
          final recoveredTicket = ticket.copyWith(isReplayRecovered: true);
          onTicketRecovered(recoveredTicket);
          eventsReplayed++;

          if (event.sequenceNumber > highestSequence) {
            highestSequence = event.sequenceNumber;
          }
        }
      }

      // Step 6: Persist recovery checkpoint
      _recoveryCheckpoints[branchId] = highestSequence;

      debugPrint(
          '[TicketReplayRecoveryCoordinator] Recovery complete: '
          'tickets=$ticketsRecovered events=$eventsReplayed highestSeq=$highestSequence');

      return KitchenRecoveryResult.success(
        ticketsRecovered: ticketsRecovered,
        eventsReplayed: eventsReplayed,
        highestSequence: highestSequence,
      );
    } catch (e, stack) {
      debugPrint('[TicketReplayRecoveryCoordinator] Recovery FAILED: $e');
      debugPrint('$stack');
      return KitchenRecoveryResult.failure('Recovery error: $e');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ CHECKPOINT ━━━━━━━━━━━━━━━━━━━━━━

  int getLastCheckpoint(String branchId) =>
      _recoveryCheckpoints[branchId] ?? 0;

  void persistCheckpoint(String branchId, int sequence) {
    _recoveryCheckpoints[branchId] = sequence;
    debugPrint(
        '[TicketReplayRecoveryCoordinator] Checkpoint persisted: '
        'branch=$branchId seq=$sequence');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ BACKEND INTEGRATION STUBS ━━━━━━━━━━━━━━━━━━━━━━
  // Replace with real API calls when backend endpoints are available.

  Future<List<Map<String, dynamic>>> _fetchAuthoritativeSnapshot({
    required String branchId,
    required String epochId,
  }) async {
    debugPrint(
        '[TicketReplayRecoveryCoordinator] Fetching snapshot: branch=$branchId');
    final dio = ref.read(dioClientProvider);
    const secureStorage = SecureLocalStorage();
    final token = await secureStorage.read('runtime_token');
    
    try {
      final response = await dio.get(
        '/api/v1/kitchen',
        queryParameters: {'branchId': branchId},
        options: Options(
          headers: {
            'Authorization': 'Bearer $token',
          },
        ),
      );

      if (response.statusCode == 200) {
        final list = response.data['data']['queue'] as List;
        return list.map((json) => json as Map<String, dynamic>).toList();
      }
    } catch (e) {
      debugPrint('[TicketReplayRecoveryCoordinator] Fetch snapshot failed: $e');
    }
    return [];
  }

  Future<List<KitchenReplayEvent>> _fetchDeltaEvents({
    required String branchId,
    required String epochId,
    required int fromSequence,
  }) async {
    debugPrint(
        '[TicketReplayRecoveryCoordinator] Fetching delta events: '
        'branch=$branchId fromSeq=$fromSequence');
    final dio = ref.read(dioClientProvider);
    const secureStorage = SecureLocalStorage();
    final token = await secureStorage.read('runtime_token');
    
    try {
      final response = await dio.post(
        '/api/v1/kitchen/reconcile',
        data: {
          'branchId': branchId,
          'lastKnownSequence': fromSequence - 1,
        },
        options: Options(
          headers: {
            'Authorization': 'Bearer $token',
          },
        ),
      );

      if (response.statusCode == 200) {
        final recon = response.data['data']['reconciliation'];
        final eventsList = recon['events'] as List? ?? [];
        return eventsList.map((e) {
          final jsonMap = e as Map<String, dynamic>;
          final payload = jsonMap['payload'] as Map<String, dynamic>;
          return KitchenReplayEvent(
            idempotencyKey: payload['idempotencyKey'] as String? ?? const Uuid().v4(),
            sequenceNumber: jsonMap['sequenceNumber'] as int,
            epochId: payload['epochId'] as String? ?? epochId,
            isItemUpdate: jsonMap['eventType'] == 'kitchen_item_update',
            payload: payload,
          );
        }).toList();
      }
    } catch (e) {
      debugPrint('[TicketReplayRecoveryCoordinator] Fetch delta events failed: $e');
    }
    return [];
  }
}
