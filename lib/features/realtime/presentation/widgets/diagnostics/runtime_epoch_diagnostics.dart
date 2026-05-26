// lib/features/realtime/presentation/widgets/diagnostics/runtime_epoch_diagnostics.dart
import 'package:flutter/material.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_text_styles.dart';
import '../../../../../core/runtime/diagnostics/runtime_diagnostics_snapshot.dart';

class RuntimeEpochDiagnostics extends StatelessWidget {
  final EpochDiagnosticsSnapshot epoch;

  const RuntimeEpochDiagnostics({super.key, required this.epoch});

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
        border: Border.all(color: !epoch.isValid ? AppColors.error : borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.av_timer_rounded, color: textPrimary, size: 20),
              const SizedBox(width: 8),
              Text(
                'Runtime Epoch',
                style: AppTextStyles.h3.copyWith(color: textPrimary),
              ),
              const Spacer(),
              _buildStatusBadge(epoch.isValid),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(child: _buildMetric('Epoch ID', _truncate(epoch.epochId), textSecondary, textPrimary)),
              Expanded(child: _buildMetric('Branch ID', _truncate(epoch.branchId), textSecondary, textPrimary)),
              Expanded(child: _buildMetric('Age', _formatAge(epoch.issuedAt), textSecondary, textPrimary)),
            ],
          ),
        ],
      ),
    );
  }

  String _truncate(String val) {
    if (val.length > 8 && val != '__none__') {
      return '${val.substring(0, 8)}...';
    }
    return val;
  }

  String _formatAge(DateTime issuedAt) {
    final age = DateTime.now().difference(issuedAt);
    if (age.inHours > 0) {
      return '${age.inHours}h ${age.inMinutes.remainder(60)}m';
    }
    if (age.inMinutes > 0) {
      return '${age.inMinutes}m ${age.inSeconds.remainder(60)}s';
    }
    return '${age.inSeconds}s';
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

  Widget _buildStatusBadge(bool isValid) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: (isValid ? AppColors.success : AppColors.error).withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        isValid ? 'VALID' : 'STALE',
        style: AppTextStyles.caption.copyWith(
          color: isValid ? AppColors.success : AppColors.error,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }
}
