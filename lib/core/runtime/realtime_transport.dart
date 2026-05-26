import 'dart:async';

enum RealtimeTransportStatus { disconnected, connecting, connected, error }

class RealtimeTransportMessage {
  final String rawPayload;
  final Map<String, dynamic>? json;
  final Exception? error;

  RealtimeTransportMessage({
    required this.rawPayload,
    this.json,
    this.error,
  });
}

abstract class RealtimeTransport {
  RealtimeTransportStatus get status;
  Stream<RealtimeTransportMessage> get messages;
  Future<void> connect();
  Future<void> disconnect();
  Future<void> send(Map<String, dynamic> payload);
}
