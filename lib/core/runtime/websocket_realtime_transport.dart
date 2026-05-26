import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'realtime_transport.dart';

class WebSocketRealtimeTransport implements RealtimeTransport {
  final Uri url;
  WebSocketChannel? _channel;
  StreamSubscription? _subscription;
  RealtimeTransportStatus _status = RealtimeTransportStatus.disconnected;
  final StreamController<RealtimeTransportMessage> _messageController = StreamController<RealtimeTransportMessage>.broadcast();

  WebSocketRealtimeTransport(this.url);

  @override
  RealtimeTransportStatus get status => _status;

  @override
  Stream<RealtimeTransportMessage> get messages => _messageController.stream;

  @override
  Future<void> connect() async {
    if (_status == RealtimeTransportStatus.connecting || _status == RealtimeTransportStatus.connected) {
      return;
    }

    _status = RealtimeTransportStatus.connecting;
    try {
      _channel = WebSocketChannel.connect(url);
      _subscription = _channel!.stream.listen(
        _onRawMessage,
        onError: _onRawError,
        onDone: _onDone,
        cancelOnError: false,
      );
      _status = RealtimeTransportStatus.connected;
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

  void _onRawMessage(dynamic rawMessage) {
    final payload = _normalizePayload(rawMessage);
    if (payload == null) {
      return;
    }

    try {
      final jsonPayload = jsonDecode(payload) as Map<String, dynamic>;
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
    _messageController.add(RealtimeTransportMessage(
      rawPayload: '',
      error: Exception('WebSocket closed by remote peer.'),
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
