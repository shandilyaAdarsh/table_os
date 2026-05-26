// lib/features/realtime/presentation/widgets/diagnostics/mutation_acknowledgement_monitor.dart
import 'package:flutter/material.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_text_styles.dart';
import '../../../../../core/runtime/diagnostics/runtime_diagnostics_snapshot.dart';

class MutationAcknowledgementMonitor extends StatelessWidget {
  final MutationDiagnosticsSnapshot mutations;

  const MutationAcknowledgementMonitor({super.key, required this.mutations});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surfaceColor = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final borderColor = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final textPrimary = isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary;
    final textSecondary = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: mutations.pendingMutations > 0 ? AppColors.warning : borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.outbox_rounded, color: textPrimary, size: 20),
              const SizedBox(width: 8),
              Text(
                'Mutation Acknowledgement',
                style: AppTextStyles.h3.copyWith(color: textPrimary),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(child: _buildMetric('Pending', '${mutations.pendingMutations}', textSecondary, mutations.pendingMutations > 0 ? AppColors.warning : textPrimary)),
              Expanded(child: _buildMetric('Committed', '${mutations.committedMutations}', textSecondary, textPrimary)),
              Expanded(child: _buildMetric('Failed', '${mutations.failedMutations}', textSecondary, mutations.failedMutations > 0 ? AppColors.error : textPrimary)),
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
