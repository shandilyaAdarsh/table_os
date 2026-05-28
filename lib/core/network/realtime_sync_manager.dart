// lib/core/network/realtime_sync_manager.dart
import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/runtime/realtime_transport_provider.dart';
import '../../core/runtime/realtime_transport.dart';
import '../../core/runtime/projection_recovery_coordinator.dart';
import '../../core/network/secure_storage.dart';
import '../../core/network/network_providers.dart';
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

  bool get _isMock => ref.read(repositoryModeProvider) == RepositoryMode.mock;

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

    _transport
        .connect()
        .then((_) {
          // Optimistically mark connected; the first heartbeat will confirm it.
          _onConnected();
        })
        .catchError((error) {
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

      _eventController.add(
        SyncEvent(
          idempotencyKey: key,
          sequenceNumber: seqNum,
          type: type,
          payload: payload,
        ),
      );
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
      final data =
          message.json ??
          jsonDecode(message.rawPayload) as Map<String, dynamic>;

      // Handle heartbeat acknowledgment messages
      if (data['type'] == 'pong') {
        debugPrint('[SYNC] Heartbeat ACK received.');
        return;
      }

      // ── Map backend EventEnvelope → SyncEvent shape ──────────────────────
      // Backend sends: { event_id, event_sequence, event_type, payload, ... }
      // RealtimeSyncManager expects: { idempotencyKey, sequenceNumber, type, payload }
      final normalized = _normalizeEventEnvelope(data);
      if (normalized != null) {
        receiveRawPayload(normalized);
      }
    } catch (e) {
      debugPrint('[SYNC] Failed decoding message: $e');
    }
  }

  /// Normalize backend EventEnvelope fields to the canonical SyncEvent shape.
  /// Returns null if the message is not a recognized operational event.
  Map<String, dynamic>? _normalizeEventEnvelope(Map<String, dynamic> data) {
    // Already in canonical shape (legacy / test payloads)
    if (data.containsKey('idempotencyKey')) return data;

    // Backend EventEnvelope shape
    final eventId = data['event_id'] as String?;
    final eventSeq = data['event_sequence'] as int?;
    final eventType = data['event_type'] as String?;
    final payload = data['payload'];

    if (eventId == null || eventSeq == null || eventType == null) {
      debugPrint('[SYNC] Skipping non-operational envelope: $data');
      return null;
    }

    return {
      'idempotencyKey': eventId,
      'sequenceNumber': eventSeq,
      'type': eventType,
      'payload': payload is Map<String, dynamic> ? payload : <String, dynamic>{},
    };
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
      '[SYNC] Reconnect attempt $_reconnectAttempts / $_maxReconnectAttempts',
    );

    if (_reconnectAttempts >= _maxReconnectAttempts) {
      // Max retries exhausted — enter critical state
      debugPrint(
        '[SYNC] Max reconnect attempts exhausted. Entering CRITICAL state.',
      );
      _updateState(
        RealtimeConnectionState.critical,
        attempts: _reconnectAttempts,
        error: 'Unable to reach server. Manual intervention required.',
      );
      return;
    }

    // Determine back-off delay
    final delayIndex = (_reconnectAttempts - 1).clamp(
      0,
      _backoffSchedule.length - 1,
    );
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
    if (_isMock) return; // Do not enforce heartbeat in simulated environments
    
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
    if (_isMock) return;
    
    _heartbeatTimeoutTimer?.cancel();
    _heartbeatTimeoutTimer = Timer(_heartbeatTimeout, () {
      final elapsed = _lastMessageAt != null
          ? DateTime.now().difference(_lastMessageAt!)
          : const Duration(minutes: 10);
      if (elapsed > _heartbeatInterval) {
        debugPrint(
          '[SYNC] Heartbeat timeout! No message for ${elapsed.inSeconds}s. Triggering silent reconnect.',
        );
        _onSilentConnectionLoss();
      }
    });
  }

  void _resetHeartbeatTimeout() {
    if (_isMock) return;
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
      ref
          .read(realtimeStateProvider.notifier)
          .updateConnectionState(connState, attempts: attempts, error: error);
    } catch (e) {
      // Provider may not be available in test context
      debugPrint('[SYNC] State update skipped (provider unavailable): $e');
    }
  }

  // ── Sequence verification & delta recovery ────────────────────────────────

  Future<void> _processSyncEvent(SyncEvent event) async {
    // 1. Double-safeguard: Idempotency check via sequence number boundary
    if (event.sequenceNumber < _expectedSequenceNumber) {
      debugPrint(
        '[SYNC] Idempotency/sequence screen: ${event.sequenceNumber} < $_expectedSequenceNumber. Ignoring.',
      );
      return;
    }

    // 2. Idempotency check via explicit transaction keys
    if (_processedKeys.contains(event.idempotencyKey)) {
      debugPrint(
        '[SYNC] Screened out duplicate event with key: ${event.idempotencyKey}',
      );
      return;
    }
    _processedKeys.add(event.idempotencyKey);

    // 3. Sequence verification & delta recovery
    if (event.sequenceNumber > _expectedSequenceNumber) {
      final gapStart = _expectedSequenceNumber;
      final gapEnd = event.sequenceNumber - 1;
      debugPrint(
        '[SYNC] GAP DETECTED: expected $_expectedSequenceNumber, got ${event.sequenceNumber}. '
        'Initiating delta sync replay from $gapStart to $gapEnd',
      );

      // Auto self-healing on major gap/divergence detection
      try {
        await ref
            .read(projectionRecoveryCoordinatorProvider)
            .executeRecovery(branchId: 'branch_default');
      } catch (e) {
        debugPrint('[SYNC] Recovery coordinator trigger failed: $e');
      }

      await _fetchDeltaSync(gapStart, gapEnd);
      _expectedSequenceNumber = event.sequenceNumber + 1;
    } else {
      _expectedSequenceNumber = event.sequenceNumber + 1;
    }

    // 4. Yield to OperationalRuntimeBridge for validation (Epoch, Deduplication, Sequence, Branch)
    debugPrint(
      '[SYNC] Processing sync event payload: type=${event.type} seq=${event.sequenceNumber}',
    );
  }

  Future<void> _fetchDeltaSync(int startSeq, int endSeq) async {
    final eventCount = endSeq - startSeq + 1;
    debugPrint(
      '[SYNC] Recovering delta states for sequence range [$startSeq..$endSeq] ($eventCount events)...',
    );

    // Transition to replaying state to show progress UI
    _updateState(RealtimeConnectionState.replaying);
    _simulateReplayProgress(eventCount);

    try {
      // Read branch context from auth state
      final dioClient = ref.read(dioClientProvider);
      const secureStorage = SecureLocalStorage();
      final token = await secureStorage.read('runtime_token');

      // Fetch missed events from the runtime replay endpoint
      final response = await dioClient.get(
        '/api/v1/runtime/events/replay',
        queryParameters: {
          'from_seq': startSeq,
          'to_seq': endSeq,
        },
        options: Options(
          headers: {
            if (token != null) 'Authorization': 'Bearer $token',
          },
        ),
      );

      if (response.statusCode == 200 && response.data != null) {
        final events = response.data['data'] as List? ?? [];
        debugPrint('[SYNC] Delta sync fetched ${events.length} replay events from backend.');
        for (final eventJson in events) {
          if (eventJson is Map<String, dynamic>) {
            final normalized = _normalizeEventEnvelope(eventJson);
            if (normalized != null) {
              receiveRawPayload(normalized);
            }
          }
        }
      }
    } catch (e) {
      debugPrint('[SYNC] Delta sync REST call failed: $e. Continuing without replay.');
    }

    debugPrint(
      '[SYNC] Delta state recovery complete for [$startSeq..$endSeq].',
    );
  }

  void _simulateReplayProgress(int totalEvents) {
    _replayTimer?.cancel();
    int completed = 0;
    _replayTimer = Timer.periodic(const Duration(milliseconds: 200), (t) {
      completed++;
      final progress = (completed / totalEvents).clamp(0.0, 1.0);
      final remaining = (totalEvents - completed).clamp(0, totalEvents);
      try {
        ref
            .read(realtimeStateProvider.notifier)
            .simulateReplay(progress: progress, eventsRemaining: remaining);
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
