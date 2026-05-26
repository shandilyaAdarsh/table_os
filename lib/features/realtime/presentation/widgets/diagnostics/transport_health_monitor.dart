// lib/features/realtime/presentation/widgets/diagnostics/transport_health_monitor.dart
import 'package:flutter/material.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_text_styles.dart';
import '../../../../../core/runtime/diagnostics/runtime_diagnostics_snapshot.dart';

class TransportHealthMonitor extends StatelessWidget {
  final TransportHealthSnapshot transport;

  const TransportHealthMonitor({super.key, required this.transport});

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
        border: Border.all(color: borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.router_rounded, color: textPrimary, size: 20),
              const SizedBox(width: 8),
              Text(
                'Transport Health',
                style: AppTextStyles.h3.copyWith(color: textPrimary),
              ),
              const Spacer(),
              _buildStatusBadge(transport.status),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(child: _buildMetric('Sent', '${transport.messagesSent}', textSecondary, textPrimary)),
              Expanded(child: _buildMetric('Received', '${transport.messagesReceived}', textSecondary, textPrimary)),
              Expanded(child: _buildMetric('Latency', '${transport.p50LatencyMs}ms', textSecondary, textPrimary)),
            ],
          ),
          if (transport.isReconnecting) ...[
            const SizedBox(height: 12),
            LinearProgressIndicator(
              value: transport.reconnectAttempts / transport.maxReconnectAttempts,
              backgroundColor: borderColor,
              valueColor: const AlwaysStoppedAnimation<Color>(AppColors.warning),
            ),
            const SizedBox(height: 4),
            Text(
              'Reconnect attempt ${transport.reconnectAttempts} of ${transport.maxReconnectAttempts}',
              style: AppTextStyles.caption.copyWith(color: textSecondary),
            ),
          ]
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

  Widget _buildStatusBadge(TransportHealthStatus status) {
    Color color;
    String label;
    switch (status) {
      case TransportHealthStatus.healthy:
        color = AppColors.success;
        label = 'HEALTHY';
        break;
      case TransportHealthStatus.reconnecting:
        color = AppColors.warning;
        label = 'RECONNECTING';
        break;
      case TransportHealthStatus.replaying:
        color = const Color(0xFF3D8EF0); // Blue
        label = 'REPLAYING';
        break;
      case TransportHealthStatus.degraded:
        color = AppColors.warning;
        label = 'DEGRADED';
        break;
      case TransportHealthStatus.critical:
        color = AppColors.error;
        label = 'CRITICAL';
        break;
      case TransportHealthStatus.disconnected:
        color = AppColors.darkTextSecondary;
        label = 'DISCONNECTED';
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: AppTextStyles.caption.copyWith(color: color, fontWeight: FontWeight.bold),
      ),
    );
  }
}
