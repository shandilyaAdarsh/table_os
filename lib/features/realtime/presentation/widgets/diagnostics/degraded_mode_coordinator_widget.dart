// lib/features/realtime/presentation/widgets/diagnostics/degraded_mode_coordinator_widget.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_text_styles.dart';
import '../../../../../core/runtime/diagnostics/operational_health_publisher.dart';

/// A high-visibility banner that drops down when the runtime is degraded.
class DegradedModeCoordinatorWidget extends ConsumerWidget {
  const DegradedModeCoordinatorWidget({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isDegraded = ref.watch(isRuntimeDegradedProvider);
    final transport = ref.watch(transportHealthProvider);

    if (!isDegraded) return const SizedBox.shrink();

    String message = 'System operating in degraded mode. Reconnecting...';
    if (transport?.isReplaying == true) {
      message = 'Replaying missed events. State may be stale temporarily.';
    } else if (transport?.status.name == 'critical') {
      message = 'CRITICAL: Synchronization failed. Recovery required.';
    } else if (transport?.status.name == 'disconnected') {
      message = 'Offline mode. Operations are queued locally.';
    }

    return Container(
      width: double.infinity,
      color: AppColors.error,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          const Icon(Icons.warning_amber_rounded, color: Colors.white, size: 24),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: AppTextStyles.bodyMedium.copyWith(color: Colors.white, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }
}
