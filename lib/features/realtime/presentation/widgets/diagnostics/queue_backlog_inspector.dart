// lib/features/realtime/presentation/widgets/diagnostics/queue_backlog_inspector.dart
import 'package:flutter/material.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_text_styles.dart';

class QueueBacklogInspector extends StatelessWidget {
  final int projectionRebuildBacklog;
  final int mutationBacklog;

  const QueueBacklogInspector({
    super.key,
    required this.projectionRebuildBacklog,
    required this.mutationBacklog,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surfaceColor = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final borderColor = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final textPrimary = isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary;
    final textSecondary = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;

    final hasBacklog = projectionRebuildBacklog > 0 || mutationBacklog > 0;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: hasBacklog ? AppColors.warning : borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.queue_rounded, color: textPrimary, size: 20),
              const SizedBox(width: 8),
              Text(
                'Queue Backlog',
                style: AppTextStyles.h3.copyWith(color: textPrimary),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _buildMetric('Projection Rebuilds', '$projectionRebuildBacklog', textSecondary, projectionRebuildBacklog > 0 ? AppColors.warning : textPrimary),
              ),
              Expanded(
                child: _buildMetric('Pending Mutations', '$mutationBacklog', textSecondary, mutationBacklog > 0 ? AppColors.warning : textPrimary),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMetric(String label, String value, Color labelColor, Color valueColor) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: AppTextStyles.caption.copyWith(color: labelColor)),
        const SizedBox(height: 2),
        Text(value, style: AppTextStyles.bodyMedium.copyWith(color: valueColor, fontWeight: FontWeight.bold)),
      ],
    );
  }
}
