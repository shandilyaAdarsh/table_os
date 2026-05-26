import 'dart:async';
import 'dart:convert';
import '../realtime_transport.dart';

class MockRealtimeTransport implements RealtimeTransport {
  final StreamController<RealtimeTransportMessage> _messageController = StreamController<RealtimeTransportMessage>.broadcast();
  RealtimeTransportStatus _status = RealtimeTransportStatus.disconnected;

  @override
  RealtimeTransportStatus get status => _status;

  @override
  Stream<RealtimeTransportMessage> get messages => _messageController.stream;

  @override
  Future<void> connect() async {
    if (_status == RealtimeTransportStatus.connected) {
      return;
    }
    _status = RealtimeTransportStatus.connecting;
    await Future<void>.delayed(const Duration(milliseconds: 120));
    _status = RealtimeTransportStatus.connected;
  }

  @override
  Future<void> disconnect() async {
    _status = RealtimeTransportStatus.disconnected;
  }

  @override
  Future<void> send(Map<String, dynamic> payload) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    if (payload['type'] == 'ping') {
      _messageController.add(RealtimeTransportMessage(
        rawPayload: jsonEncode({'type': 'pong'}),
        json: {'type': 'pong'},
      ));
    }
  }

  Future<void> simulateRemoteEvent(Map<String, dynamic> envelope) async {
    if (_status != RealtimeTransportStatus.connected) {
      return;
    }

    final raw = jsonEncode(envelope);
    _messageController.add(RealtimeTransportMessage(
      rawPayload: raw,
      json: envelope,
    ));
  }
}
