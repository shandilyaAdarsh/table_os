import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../network/secure_storage.dart';
import 'realtime_transport.dart';

class WebSocketRealtimeTransport implements RealtimeTransport {
  final Uri url;
  WebSocketChannel? _channel;
  StreamSubscription? _subscription;
  RealtimeTransportStatus _status = RealtimeTransportStatus.disconnected;
  final StreamController<RealtimeTransportMessage> _messageController =
      StreamController<RealtimeTransportMessage>.broadcast();

  // Tracks the last successfully delivered sequence so we can SYNC on reconnect.
  int _lastDeliveredSequence = 0;

  WebSocketRealtimeTransport(this.url);

  @override
  RealtimeTransportStatus get status => _status;

  @override
  Stream<RealtimeTransportMessage> get messages => _messageController.stream;

  @override
  Future<void> connect() async {
    if (_status == RealtimeTransportStatus.connecting ||
        _status == RealtimeTransportStatus.connected) {
      return;
    }

    _status = RealtimeTransportStatus.connecting;
    try {
      // Read the runtime JWT for the Sec-WebSocket-Protocol auth handshake.
      // The backend's WebSocketManager.handleUpgrade() extracts and verifies this.
      const secureStorage = SecureLocalStorage();
      final runtimeToken = await secureStorage.read('runtime_token');

      final headers = <String, dynamic>{};
      if (runtimeToken != null && runtimeToken.isNotEmpty) {
        // Format: "<token>" — the backend splits on ',' and picks the last part.
        headers['Sec-WebSocket-Protocol'] = runtimeToken;
      }

      _channel = WebSocketChannel.connect(
        url,
        protocols: runtimeToken != null ? [runtimeToken] : null,
      );

      _subscription = _channel!.stream.listen(
        _onRawMessage,
        onError: _onRawError,
        onDone: _onDone,
        cancelOnError: false,
      );

      _status = RealtimeTransportStatus.connected;

      // Send SYNC frame so backend can replay any missed events since our last
      // known sequence. The backend logs this for delta-replay bookkeeping.
      _sendSyncFrame();
    } catch (error, stackTrace) {
      _status = RealtimeTransportStatus.error;
      _messageController.add(RealtimeTransportMessage(
        rawPayload: '',
        error: Exception('WebSocket connect failed: $error'),
      ));
      if (kDebugMode) {
        debugPrint('[Transport] WebSocket connection failed: $error');
        debugPrint('$stackTrace');
      }
    }
  }

  @override
  Future<void> disconnect() async {
    await _subscription?.cancel();
    _subscription = null;
    try {
      await _channel?.sink.close();
    } catch (_) {}
    _channel = null;
    _status = RealtimeTransportStatus.disconnected;
  }

  @override
  Future<void> send(Map<String, dynamic> payload) async {
    if (_status != RealtimeTransportStatus.connected || _channel == null) {
      throw StateError('Realtime transport is not connected.');
    }

    final encoded = jsonEncode(payload);
    _channel!.sink.add(encoded);
  }

  // ── Private transport helpers ─────────────────────────────────────────────

  /// Send SYNC negotiation frame immediately after connecting.
  /// Tells the backend where we left off so it can replay missed events.
  void _sendSyncFrame() {
    try {
      final frame = jsonEncode({
        'type': 'SYNC',
        'last_sequence': _lastDeliveredSequence,
      });
      _channel?.sink.add(frame);
      if (kDebugMode) {
        debugPrint('[Transport] SYNC frame sent (last_seq=$_lastDeliveredSequence)');
      }
    } catch (e) {
      debugPrint('[Transport] Failed to send SYNC frame: $e');
    }
  }

  /// Send ACK frame to confirm delivery of an event sequence.
  void _sendAck(int lastReceivedSequence) {
    try {
      if (_status != RealtimeTransportStatus.connected || _channel == null) return;
      _channel!.sink.add(
        jsonEncode({'type': 'ACK', 'last_received_sequence': lastReceivedSequence}),
      );
      _lastDeliveredSequence = lastReceivedSequence;
    } catch (e) {
      debugPrint('[Transport] Failed to send ACK frame: $e');
    }
  }

  void _onRawMessage(dynamic rawMessage) {
    final payload = _normalizePayload(rawMessage);
    if (payload == null) return;

    try {
      final jsonPayload = jsonDecode(payload) as Map<String, dynamic>;

      // Acknowledge delivery to the backend for observability.
      // We use event_sequence from the EventEnvelope.
      final seq = jsonPayload['event_sequence'] as int?;
      if (seq != null) {
        _sendAck(seq);
      }

      _messageController.add(RealtimeTransportMessage(
        rawPayload: payload,
        json: jsonPayload,
      ));
    } catch (error) {
      _messageController.add(RealtimeTransportMessage(
        rawPayload: payload,
        error: Exception('Failed to decode transport message: $error'),
      ));
    }
  }

  void _onRawError(dynamic error, StackTrace? stackTrace) {
    _status = RealtimeTransportStatus.error;
    _messageController.add(RealtimeTransportMessage(
      rawPayload: '',
      error: Exception('WebSocket transport error: $error'),
    ));
    if (kDebugMode) {
      debugPrint('[Transport] WebSocket error: $error');
      debugPrint('$stackTrace');
    }
  }

  void _onDone() {
    _status = RealtimeTransportStatus.disconnected;
    // Do NOT add an error message on a clean close — the SyncManager's onDone
    // callback will handle reconnect scheduling via _onDisconnected.
    _messageController.add(RealtimeTransportMessage(
      rawPayload: '',
      error: null,
    ));
  }

  String? _normalizePayload(dynamic rawMessage) {
    if (rawMessage is String) {
      return rawMessage;
    }
    if (rawMessage is List<int>) {
      return utf8.decode(rawMessage);
    }
    return rawMessage?.toString();
  }
}
