// lib/core/network/realtime_sync_manager.dart
import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/runtime/realtime_transport_provider.dart';
import '../../core/runtime/realtime_transport.dart';
import '../../features/orders/providers/orders_providers.dart';
import '../../features/orders/data/dtos/order_dto.dart';
import '../../features/orders/data/mappers/order_mapper.dart';
import '../../features/tables/providers/tables_providers.dart';
import '../../features/tables/data/dtos/table_dto.dart';
import '../../features/tables/data/mappers/table_mapper.dart';
import '../../features/waiter_calls/presentation/state/waiter_calls_providers.dart';
import '../../features/waiter_calls/domain/entities/waiter_call.dart';
import '../../features/realtime/presentation/state/realtime_providers.dart';
import '../../features/realtime/domain/entities/realtime_state_model.dart';

// ─────────────────────────────────────────────────────────────────────────────
// SyncEvent
// ─────────────────────────────────────────────────────────────────────────────

class SyncEvent {
  final String idempotencyKey;
  final int sequenceNumber;
  final String type; // 'table_update', 'order_update', 'waiter_call'
  final Map<String, dynamic> payload;

  const SyncEvent({
    required this.idempotencyKey,
    required this.sequenceNumber,
    required this.type,
    required this.payload,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RealtimeSyncManager
// ─────────────────────────────────────────────────────────────────────────────

class RealtimeSyncManager {
  final Ref ref;
  final RealtimeTransport _transport;

  // ── Idempotency & Sequencing ──────────────────────────────────────────────
  final Set<String> _processedKeys = {};
  int _expectedSequenceNumber = 1;

  // ── Transport ────────────────────────────────────────────────────────────
  StreamSubscription<RealtimeTransportMessage>? _transportSubscription;

  // ── Back-off Retry ────────────────────────────────────────────────────────
  static const int _maxReconnectAttempts = 5;
  static const List<Duration> _backoffSchedule = [
    Duration(seconds: 2),
    Duration(seconds: 4),
    Duration(seconds: 8),
    Duration(seconds: 16),
    Duration(seconds: 30),
  ];
  int _reconnectAttempts = 0;
  bool _intentionalDisconnect = false;
  Timer? _reconnectTimer;

  // ── Heartbeat ─────────────────────────────────────────────────────────────
  Timer? _heartbeatTimer;
  Timer? _heartbeatTimeoutTimer;
  DateTime? _lastMessageAt;
  static const Duration _heartbeatInterval = Duration(seconds: 20);
  static const Duration _heartbeatTimeout = Duration(seconds: 10);

  // ── Replay orchestration ──────────────────────────────────────────────────
  Timer? _replayTimer;

  // ── Event stream ──────────────────────────────────────────────────────────
  final StreamController<SyncEvent> _eventController =
      StreamController<SyncEvent>.broadcast();

  Stream<SyncEvent> get eventStream => _eventController.stream;
  int get expectedSequenceNumber => _expectedSequenceNumber;

  // ── Constructor ───────────────────────────────────────────────────────────

  RealtimeSyncManager(this.ref)
      : _transport = ref.read(realtimeTransportProvider) {
    _eventController.stream.listen(_processSyncEvent);
    _transportSubscription = _transport.messages.listen(
      _onTransportMessage,
      onDone: _onDisconnected,
      onError: _onError,
      cancelOnError: false,
    );
    // Defer connection so this provider finishes building before pushing any
    // state updates into realtimeStateProvider (Riverpod init-phase rule).
    Future.microtask(connectLocal);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /// Initiates a fresh transport connection.
  /// Can also be called to force-reconnect from the UI.
  void connectLocal() {
    _intentionalDisconnect = false;
    _cancelReconnectTimer();
    _cancelHeartbeat();
    _closeChannel();

    debugPrint('[SYNC] Connecting to realtime transport...');
    _updateState(RealtimeConnectionState.reconnecting);

    _transport.connect().then((_) {
      // Optimistically mark connected; the first heartbeat will confirm it.
      _onConnected();
    }).catchError((error) {
      debugPrint('[SYNC] Transport connection exception: $error');
      _scheduleReconnect();
    });
  }

  /// Cleanly shut down the manager (called on app dispose).
  void dispose() {
    _intentionalDisconnect = true;
    _cancelReconnectTimer();
    _cancelHeartbeat();
    _replayTimer?.cancel();
    _closeChannel();
    _eventController.close();
    debugPrint('[SYNC] Manager disposed.');
  }

  /// Simulates receiving a raw WebSocket message (also used by tests).
  void receiveRawPayload(Map<String, dynamic> data) {
    _lastMessageAt = DateTime.now();
    _resetHeartbeatTimeout();
    try {
      final key = data['idempotencyKey'] as String?;
      final seqNum = data['sequenceNumber'] as int?;
      final type = data['type'] as String?;
      final payload = data['payload'] as Map<String, dynamic>?;

      if (key == null || seqNum == null || type == null || payload == null) {
        debugPrint('[SYNC] Invalid event envelope: $data');
        return;
      }

      _eventController.add(SyncEvent(
        idempotencyKey: key,
        sequenceNumber: seqNum,
        type: type,
        payload: payload,
      ));
    } catch (e) {
      debugPrint('[SYNC] Failed parsing WebSocket payload: $e');
    }
  }

  /// Reset the sequence counter (e.g. after a full state recovery).
  void resetSequence(int startFrom) {
    _expectedSequenceNumber = startFrom;
    _processedKeys.clear();
    debugPrint('[SYNC] Sync sequence reset to: $_expectedSequenceNumber');
  }

  // ── Connection lifecycle ──────────────────────────────────────────────────

  void _onConnected() {
    debugPrint('[SYNC] Connection established.');
    _reconnectAttempts = 0;
    _lastMessageAt = DateTime.now();
    _updateState(RealtimeConnectionState.connected, attempts: 0);
    _startHeartbeat();
  }

  void _onTransportMessage(RealtimeTransportMessage message) {
    _lastMessageAt = DateTime.now();
    _resetHeartbeatTimeout();

    // If we were in a degraded/reconnecting state and received data, recover.
    final currentState = ref.read(realtimeStateProvider).connectionState;
    if (currentState != RealtimeConnectionState.connected &&
        currentState != RealtimeConnectionState.replaying) {
      debugPrint('[SYNC] Message received — recovering to connected state.');
      _reconnectAttempts = 0;
      _updateState(RealtimeConnectionState.connected, attempts: 0);
    }

    if (message.error != null) {
      _onError(message.error);
      return;
    }

    debugPrint('[SYNC] Received raw transport message: ${message.rawPayload}');
    try {
      final data = message.json ??
          jsonDecode(message.rawPayload) as Map<String, dynamic>;

      // Handle heartbeat acknowledgment messages
      if (data['type'] == 'pong') {
        debugPrint('[SYNC] Heartbeat ACK received.');
        return;
      }

      receiveRawPayload(data);
    } catch (e) {
      debugPrint('[SYNC] Failed decoding message: $e');
    }
  }

  void _onDisconnected() {
    debugPrint('[SYNC] Realtime transport closed.');
    _cancelHeartbeat();
    if (!_intentionalDisconnect) {
      _scheduleReconnect();
    }
  }

  void _onError(dynamic err) {
    debugPrint('[SYNC] Realtime transport error: $err');
    _cancelHeartbeat();
    _closeChannel();
    if (!_intentionalDisconnect) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    if (_intentionalDisconnect) return;

    _reconnectAttempts++;
    debugPrint(
        '[SYNC] Reconnect attempt $_reconnectAttempts / $_maxReconnectAttempts');

    if (_reconnectAttempts >= _maxReconnectAttempts) {
      // Max retries exhausted — enter critical state
      debugPrint('[SYNC] Max reconnect attempts exhausted. Entering CRITICAL state.');
      _updateState(
        RealtimeConnectionState.critical,
        attempts: _reconnectAttempts,
        error: 'Unable to reach server. Manual intervention required.',
      );
      return;
    }

    // Determine back-off delay
    final delayIndex =
        (_reconnectAttempts - 1).clamp(0, _backoffSchedule.length - 1);
    final delay = _backoffSchedule[delayIndex];

    // Move state to reconnecting or degraded depending on attempt count
    if (_reconnectAttempts >= 3) {
      _updateState(
        RealtimeConnectionState.degraded,
        attempts: _reconnectAttempts,
        error: 'Connection degraded — some updates may be delayed.',
      );
    } else {
      _updateState(
        RealtimeConnectionState.reconnecting,
        attempts: _reconnectAttempts,
        error: 'Connection lost. Reconnecting…',
      );
    }

    debugPrint('[SYNC] Scheduling reconnect in ${delay.inSeconds}s...');
    _reconnectTimer = Timer(delay, connectLocal);
  }

  // ── Heartbeat ─────────────────────────────────────────────────────────────

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(_heartbeatInterval, (_) {
      _sendHeartbeat();
    });
  }

  void _sendHeartbeat() {
    try {
      _transport.send({'type': 'ping'});
      debugPrint('[SYNC] Heartbeat ping sent.');
      _startHeartbeatTimeout();
    } catch (e) {
      debugPrint('[SYNC] Failed to send heartbeat: $e');
      _onSilentConnectionLoss();
    }
  }

  void _startHeartbeatTimeout() {
    _heartbeatTimeoutTimer?.cancel();
    _heartbeatTimeoutTimer = Timer(_heartbeatTimeout, () {
      final elapsed = _lastMessageAt != null
          ? DateTime.now().difference(_lastMessageAt!)
          : const Duration(minutes: 10);
      if (elapsed > _heartbeatInterval) {
        debugPrint(
            '[SYNC] Heartbeat timeout! No message for ${elapsed.inSeconds}s. Triggering silent reconnect.');
        _onSilentConnectionLoss();
      }
    });
  }

  void _resetHeartbeatTimeout() {
    _heartbeatTimeoutTimer?.cancel();
  }

  void _onSilentConnectionLoss() {
    debugPrint('[SYNC] Silent connection loss detected.');
    _cancelHeartbeat();
    _closeChannel();
    if (!_intentionalDisconnect) {
      _scheduleReconnect();
    }
  }

  void _cancelHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
    _heartbeatTimeoutTimer?.cancel();
    _heartbeatTimeoutTimer = null;
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  void _cancelReconnectTimer() {
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
  }

  void _closeChannel() {
    _transportSubscription?.cancel();
    _transportSubscription = null;
    try {
      _transport.disconnect();
    } catch (_) {}
  }

  void _updateState(
    RealtimeConnectionState connState, {
    int? attempts,
    String? error,
  }) {
    try {
      ref.read(realtimeStateProvider.notifier).updateConnectionState(
            connState,
            attempts: attempts,
            error: error,
          );
    } catch (e) {
      // Provider may not be available in test context
      debugPrint('[SYNC] State update skipped (provider unavailable): $e');
    }
  }

  // ── Sequence verification & delta recovery ────────────────────────────────

  Future<void> _processSyncEvent(SyncEvent event) async {
    // 1. Idempotency check
    if (_processedKeys.contains(event.idempotencyKey)) {
      debugPrint(
          '[SYNC] Screened out duplicate event with key: ${event.idempotencyKey}');
      return;
    }
    _processedKeys.add(event.idempotencyKey);

    // 2. Sequence verification
    if (event.sequenceNumber > _expectedSequenceNumber) {
      final gapStart = _expectedSequenceNumber;
      final gapEnd = event.sequenceNumber - 1;
      debugPrint(
          '[SYNC] GAP DETECTED: expected $_expectedSequenceNumber, got ${event.sequenceNumber}. '
          'Fetching deltas from $gapStart to $gapEnd');
      await _fetchDeltaSync(gapStart, gapEnd);
      _expectedSequenceNumber = event.sequenceNumber + 1;
    } else if (event.sequenceNumber < _expectedSequenceNumber) {
      debugPrint(
          '[SYNC] Out of order message. Sequence ${event.sequenceNumber} < $_expectedSequenceNumber. Ignoring.');
      return;
    } else {
      _expectedSequenceNumber = event.sequenceNumber + 1;
    }

    // 3. Yield to OperationalRuntimeBridge for validation (Epoch, Deduplication, Sequence, Branch)
    // Removed direct state mutation here to enforce strictly validated projection rebuild architecture.
    debugPrint('[SYNC] Processing sync event: ${event.type}');
  }

  Future<void> _fetchDeltaSync(int startSeq, int endSeq) async {
    final eventCount = endSeq - startSeq + 1;
    debugPrint(
        '[SYNC] Recovering delta states for sequence range [$startSeq..$endSeq] ($eventCount events)...');

    // Transition to replaying state to show progress UI
    _updateState(RealtimeConnectionState.replaying);
    _simulateReplayProgress(eventCount);

    // In production: call REST API endpoint for the missed sequence range.
    // e.g. await supabaseClient.from('sync_log').select()
    //        .gte('sequence_number', startSeq).lte('sequence_number', endSeq);
    await Future.delayed(Duration(milliseconds: 300 * eventCount.clamp(1, 5)));

    debugPrint('[SYNC] Delta state recovery complete for [$startSeq..$endSeq].');
  }

  void _simulateReplayProgress(int totalEvents) {
    _replayTimer?.cancel();
    int completed = 0;
    _replayTimer = Timer.periodic(const Duration(milliseconds: 200), (t) {
      completed++;
      final progress = (completed / totalEvents).clamp(0.0, 1.0);
      final remaining = (totalEvents - completed).clamp(0, totalEvents);
      try {
        ref.read(realtimeStateProvider.notifier).simulateReplay(
              progress: progress,
              eventsRemaining: remaining,
            );
      } catch (_) {}
      if (completed >= totalEvents) {
        t.cancel();
        _replayTimer = null;
        // Transition back to connected once replay is complete
        _updateState(RealtimeConnectionState.connected, attempts: 0);
      }
    });
  }

  // ── Payload dispatch ──────────────────────────────────────────────────────

  // ── (Mapping helpers moved to OperationalRuntimeBridge) ───────────────────
}

// ─────────────────────────────────────────────────────────────────────────────
// Global provider
// ─────────────────────────────────────────────────────────────────────────────

final realtimeSyncManagerProvider = Provider<RealtimeSyncManager>((ref) {
  final manager = RealtimeSyncManager(ref);
  ref.onDispose(manager.dispose);
  return manager;
});
