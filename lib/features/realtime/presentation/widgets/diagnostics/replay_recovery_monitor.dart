// lib/features/realtime/presentation/widgets/diagnostics/replay_recovery_monitor.dart
import 'package:flutter/material.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_text_styles.dart';

class ReplayRecoveryMonitor extends StatelessWidget {
  final bool isReplaying;
  final double progress; // 0.0 to 1.0

  const ReplayRecoveryMonitor({
    super.key,
    required this.isReplaying,
    required this.progress,
  });

  @override
  Widget build(BuildContext context) {
    if (!isReplaying) return const SizedBox.shrink();

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surfaceColor = isDark
        ? AppColors.darkSurface
        : AppColors.lightSurface;
    final borderColor = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final textPrimary = isDark
        ? AppColors.darkTextPrimary
        : AppColors.lightTextPrimary;
    final textSecondary = isDark
        ? AppColors.darkTextSecondary
        : AppColors.lightTextSecondary;
    const replayColor = Color(0xFF3D8EF0);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: replayColor.withValues(alpha: 0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.history_rounded, color: replayColor, size: 20),
              const SizedBox(width: 8),
              Text(
                'Replay Recovery Active',
                style: AppTextStyles.h3.copyWith(color: replayColor),
              ),
              const Spacer(),
              const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation<Color>(replayColor),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 8,
              backgroundColor: borderColor,
              valueColor: const AlwaysStoppedAnimation<Color>(replayColor),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Hydrating deterministic state...',
                style: AppTextStyles.caption.copyWith(color: textSecondary),
              ),
              Text(
                '${(progress * 100).toStringAsFixed(0)}%',
                style: AppTextStyles.caption.copyWith(
                  color: textPrimary,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
