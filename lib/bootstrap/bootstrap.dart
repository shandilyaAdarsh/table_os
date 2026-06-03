// lib/bootstrap/bootstrap.dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:talker_flutter/talker_flutter.dart';

import '../core/config/app_config.dart';
import '../core/config/environment.dart';
import '../core/network/secure_storage.dart';
import '../core/network/network_providers.dart';
import '../core/utils/logger.dart';
import '../app/app.dart';
import '../app/observers/provider_observer.dart';

Future<void> bootstrap({
  required Environment environment,
  required String apiBaseUrl,
  required String websocketUrl,
  required bool enableSentry,
  String? supabaseUrl,
  String? supabaseAnonKey,
}) async {
  // Initialize structured logger
  final talker = TalkerFlutter.init(
    settings: TalkerSettings(
      maxHistoryItems: 150,
      useConsoleLogs: true,
    ),
  );

  await runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();

    // Initialize environment configurations
    AppConfig.initialize(
      environment: environment,
      apiBaseUrl: apiBaseUrl,
      websocketUrl: websocketUrl,
      enableSentry: enableSentry,
    );

    // Initialize Hive local persistence layer
    await Hive.initFlutter();
    final apiCacheBox = await Hive.openBox<String>('api_cache');
    final offlineQueueBox = await Hive.openBox<String>('offline_writes');

    // Initialize Supabase instance using SecureTokenStorage (Keychain/Keystore wrapper)
    await Supabase.initialize(
      url: supabaseUrl ?? 'https://placeholder.supabase.co',
      anonKey: supabaseAnonKey ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder',
      authOptions: const FlutterAuthClientOptions(
        localStorage: SecureLocalStorage(),
      ),
    );

    // Auto-login platform session if not already logged in
    final client = Supabase.instance.client;
    // FORCE login as super admin for development/kiosk mode
    try {
      await client.auth.signOut();
      await client.auth.signInWithPassword(
        email: 'admin@tableos.in',
        password: 'Admin@123456',
      );
      talker.info('[Supabase] Platform session established.');
    } catch (e) {
      talker.error('[Supabase] Failed to establish platform session: $e');
    }

    // Hydrate base system preferences
    final sharedPreferences = await SharedPreferences.getInstance();

    // Create provider container
    final container = ProviderScope(
      observers: [
        AppProviderObserver(),
      ],
      overrides: [
        // Expose SharedPreferences globally for dependencies
        sharedPreferencesProvider.overrideWithValue(sharedPreferences),
        // Override Hive boxes and Talker instances
        talkerProvider.overrideWithValue(talker),
        apiCacheBoxProvider.overrideWithValue(apiCacheBox),
        offlineQueueBoxProvider.overrideWithValue(offlineQueueBox),
      ],
      child: const OrderlyyApp(),
    );

    runApp(container);
  }, (error, stack) {
    talker.handle(error, stack, '[Bootstrap Error] Unhandled Exception');
  });
}

// Global provider for shared preferences to inject into other data sources
final sharedPreferencesProvider = Provider<SharedPreferences>((ref) {
  throw UnimplementedError('SharedPreferences has not been initialized inside Bootstrap.');
});
