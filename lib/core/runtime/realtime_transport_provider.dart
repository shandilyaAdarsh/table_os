import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../config/app_config.dart';
import '../config/environment.dart';
import 'mock/mock_realtime_transport.dart';
import 'realtime_transport.dart';
import 'websocket_realtime_transport.dart';

enum RepositoryMode { mock, live }

final repositoryModeProvider = Provider<RepositoryMode>((ref) {
  final env = AppConfig.instance.environment;
  return env == Environment.prod ? RepositoryMode.live : RepositoryMode.mock;
});

final realtimeTransportProvider = Provider<RealtimeTransport>((ref) {
  final mode = ref.watch(repositoryModeProvider);
  if (mode == RepositoryMode.mock) {
    return MockRealtimeTransport();
  }

  final uri = Uri.parse(AppConfig.instance.websocketUrl);
  return WebSocketRealtimeTransport(uri);
});
