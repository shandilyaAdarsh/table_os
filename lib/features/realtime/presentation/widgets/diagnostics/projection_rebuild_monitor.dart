// lib/features/realtime/presentation/widgets/diagnostics/projection_rebuild_monitor.dart
import 'package:flutter/material.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_text_styles.dart';
import '../../../../../core/runtime/diagnostics/runtime_diagnostics_snapshot.dart';

class ProjectionRebuildMonitor extends StatelessWidget {
  final ProjectionDiagnosticsSnapshot projections;

  const ProjectionRebuildMonitor({super.key, required this.projections});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surfaceColor = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final borderColor = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final textPrimary = isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary;
    final textSecondary = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;

    final isRebuilding = projections.currentlyRebuilding > 0;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isRebuilding ? AppColors.warning : borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.layers_rounded, color: textPrimary, size: 20),
              const SizedBox(width: 8),
              Text(
                'Projection Hydration',
                style: AppTextStyles.h3.copyWith(color: textPrimary),
              ),
              const Spacer(),
              if (isRebuilding)
                const SizedBox(
                  width: 12,
                  height: 12,
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.warning),
                )
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(child: _buildMetric('Registered', '${projections.registeredProjections}', textSecondary, textPrimary)),
              Expanded(child: _buildMetric('Rebuilding', '${projections.currentlyRebuilding}', textSecondary, isRebuilding ? AppColors.warning : textPrimary)),
              Expanded(child: _buildMetric('Stale', '${projections.staleProjections}', textSecondary, projections.staleProjections > 0 ? AppColors.error : textPrimary)),
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
