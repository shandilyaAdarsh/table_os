// lib/app/app.dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../routing/app_router.dart';
import '../core/theme/app_theme.dart';
import '../core/network/realtime_sync_manager.dart';
import '../core/runtime/runtime_lifecycle.dart';

class OrderlyyApp extends ConsumerWidget {
  const OrderlyyApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Initialize Realtime Sync Manager to start receiving updates from admin app
    ref.read(realtimeSyncManagerProvider);

    // Initialize Runtime Lifecycle Manager to manage runtime sessions
    ref.read(runtimeLifecycleManagerProvider);

    final router = ref.watch(routerProvider);
    const themeMode = ThemeMode.system;

    return MaterialApp.router(
      title: 'Orderlyy Restaurant Management',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: themeMode,
      builder: (context, child) {
        if (child == null) return const SizedBox.shrink();

        // Get the actual screen size
        final mediaQuery = MediaQuery.of(context);
        final screenSize = mediaQuery.size;

        // Set preferred orientations for mobile devices
        if (screenSize.width < 600) {
          SystemChrome.setPreferredOrientations([
            DeviceOrientation.portraitUp,
            DeviceOrientation.portraitDown,
          ]);
        } else {
          SystemChrome.setPreferredOrientations([
            DeviceOrientation.portraitUp,
            DeviceOrientation.portraitDown,
            DeviceOrientation.landscapeLeft,
            DeviceOrientation.landscapeRight,
          ]);
        }

        // Create responsive MediaQuery that adapts to any screen size
        return MediaQuery(
          data: mediaQuery.copyWith(
            // Ensure text scaling doesn't break the layout
            textScaler: TextScaler.linear(
              mediaQuery.textScaler.scale(1).clamp(0.8, 1.2),
            ),
          ),
          child: Container(
            color: Theme.of(context).scaffoldBackgroundColor,
            child: SafeArea(
              // Respect device safe areas (notches, home indicators, etc.)
              child: child,
            ),
          ),
        );
      },
      routerConfig: router,
    );
  }
}
