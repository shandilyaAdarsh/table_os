// lib/features/realtime/presentation/widgets/diagnostics/realtime_synchronization_inspector.dart
import 'package:flutter/material.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_text_styles.dart';
import '../../../../../core/runtime/diagnostics/runtime_diagnostics_snapshot.dart';

class RealtimeSynchronizationInspector extends StatelessWidget {
  final SequenceDiagnosticsSnapshot sequence;

  const RealtimeSynchronizationInspector({super.key, required this.sequence});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surfaceColor = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final borderColor = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final textPrimary = isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary;
    final textSecondary = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;

    final hasAnomalies = sequence.duplicatesRejected > 0 || sequence.gapsDetected > 0 || sequence.staleEventsRejected > 0;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: hasAnomalies ? AppColors.warning : borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.sync_alt_rounded, color: textPrimary, size: 20),
              const SizedBox(width: 8),
              Text(
                'Synchronization Validation',
                style: AppTextStyles.h3.copyWith(color: textPrimary),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(child: _buildMetric('Processed', '${sequence.processedEventCount}', textSecondary, textPrimary)),
              Expanded(child: _buildMetric('Gaps', '${sequence.gapsDetected}', textSecondary, sequence.gapsDetected > 0 ? AppColors.error : textPrimary)),
              Expanded(child: _buildMetric('Duplicates', '${sequence.duplicatesRejected}', textSecondary, sequence.duplicatesRejected > 0 ? AppColors.warning : textPrimary)),
              Expanded(child: _buildMetric('Stale', '${sequence.staleEventsRejected}', textSecondary, sequence.staleEventsRejected > 0 ? AppColors.warning : textPrimary)),
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
