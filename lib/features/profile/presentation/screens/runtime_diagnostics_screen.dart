// lib/features/profile/presentation/screens/runtime_diagnostics_screen.dart
//
// RuntimeDiagnosticsScreen — live operational observability surface.
//
// Reads exclusively from operationalHealthProvider (OperationalHealthPublisher).
// NEVER reads from runtime components directly.
// Auto-refreshes every 3 seconds via RuntimeDiagnosticsCoordinator.

import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/runtime/diagnostics/runtime_diagnostics_snapshot.dart';
import '../../../../core/runtime/diagnostics/operational_health_publisher.dart';
import '../../../kitchen/domain/kitchen_runtime_coordinator.dart';

// ━━━━━━━━━━━━━━━━━━━━━━ SCREEN ━━━━━━━━━━━━━━━━━━━━━━

class RuntimeDiagnosticsScreen extends ConsumerStatefulWidget {
  const RuntimeDiagnosticsScreen({super.key});

  @override
  ConsumerState<RuntimeDiagnosticsScreen> createState() =>
      _RuntimeDiagnosticsScreenState();
}

class _RuntimeDiagnosticsScreenState
    extends ConsumerState<RuntimeDiagnosticsScreen> {
  final List<double> _sparkline = List.generate(10, (_) => 20.0);
  final _random = math.Random();

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surfaceColor = isDark ? AppColors.darkSurface : Colors.white;
    final borderColor = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final textPrimary =
        isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary;
    final textSecondary =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final bgColor =
        isDark ? AppColors.darkBackground : AppColors.lightBackground;

    final healthAsync = ref.watch(operationalHealthProvider);

    // Update sparkline when new snapshot arrives
    ref.listen(operationalHealthProvider, (_, next) {
      next.whenData((s) {
        setState(() {
          _sparkline.removeAt(0);
          final ping = s.transport.lastPingMs.toDouble();
          // Normalize ping to 10–70 range for sparkline height
          final h = (ping / 500 * 60 + 10).clamp(10.0, 70.0);
          _sparkline.add(h + (_random.nextDouble() * 6 - 3));
        });
      });
    });

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        title: Text(
          'Runtime Diagnostics',
          style: AppTextStyles.h3
              .copyWith(color: textPrimary, fontWeight: FontWeight.bold),
        ),
        backgroundColor: surfaceColor,
        elevation: 0,
        scrolledUnderElevation: 0,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Divider(height: 1, color: borderColor),
        ),
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, color: textPrimary),
          onPressed: () => context.pop(),
        ),
        actions: [
          healthAsync.whenOrNull(
            data: (s) => IconButton(
              icon: const Icon(Icons.ios_share_rounded),
              tooltip: 'Export',
              onPressed: () => _export(s),
            ),
          ) ?? const SizedBox.shrink(),
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Refresh',
            onPressed: () {
              HapticFeedback.mediumImpact();
              ref.read(operationalHealthProvider.notifier).refresh();
            },
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: healthAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Text('Diagnostics unavailable: $e',
              style: AppTextStyles.bodyMedium.copyWith(color: textSecondary)),
        ),
        data: (snapshot) => _buildBody(
          context, snapshot, surfaceColor, borderColor, textPrimary, textSecondary,
        ),
      ),
    );
  }

  Widget _buildBody(
    BuildContext context,
    RuntimeDiagnosticsSnapshot s,
    Color surfaceColor,
    Color borderColor,
    Color textPrimary,
    Color textSecondary,
  ) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // ── Header ──────────────────────────────────────────────────────────
        _HeaderCard(
          snapshot: s,
          surfaceColor: surfaceColor,
          borderColor: borderColor,
          textPrimary: textPrimary,
          textSecondary: textSecondary,
        ),
        const SizedBox(height: 16),

        // ── Overall Health Banner ────────────────────────────────────────────
        _HealthBanner(health: s.overallHealth),
        const SizedBox(height: 20),

        // ── TRANSPORT HEALTH ─────────────────────────────────────────────────
        _sectionHeader('TRANSPORT HEALTH', textSecondary),
        _DiagnosticsCard(
          surfaceColor: surfaceColor,
          borderColor: borderColor,
          children: [
            _row('Connection', textPrimary,
                trailing: _StatusPill(
                  label: s.transport.status.name.toUpperCase(),
                  color: _transportColor(s.transport.status),
                )),
            _divider(borderColor),
            _row('Reconnect Attempts', textPrimary,
                value:
                    '${s.transport.reconnectAttempts}/${s.transport.maxReconnectAttempts}',
                valueColor: s.transport.reconnectAttempts > 0
                    ? AppColors.warning
                    : AppColors.success),
            _divider(borderColor),
            _row('Messages Received', textPrimary,
                value: '${s.transport.messagesReceived}'),
            _divider(borderColor),
            _row('Messages Sent', textPrimary,
                value: '${s.transport.messagesSent}'),
            if (s.transport.errorMessage != null) ...[
              _divider(borderColor),
              _row('Error', textPrimary,
                  value: s.transport.errorMessage!,
                  valueColor: AppColors.error),
            ],
          ],
        ),
        const SizedBox(height: 20),

        // ── API LATENCY ──────────────────────────────────────────────────────
        _sectionHeader('API LATENCY', textSecondary),
        _DiagnosticsCard(
          surfaceColor: surfaceColor,
          borderColor: borderColor,
          children: [
            _row('P50 Latency', textPrimary,
                value: '${s.transport.p50LatencyMs} ms',
                valueColor: _pingColor(s.transport.p50LatencyMs)),
            _divider(borderColor),
            _row('P95 Latency', textPrimary,
                value: '${s.transport.p95LatencyMs} ms',
                valueColor: _pingColor(s.transport.p95LatencyMs)),
            _divider(borderColor),
            _row('P99 Latency', textPrimary,
                value: '${s.transport.p99LatencyMs} ms',
                valueColor: _pingColor(s.transport.p99LatencyMs)),
            _divider(borderColor),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Live Latency Timeline',
                      style: AppTextStyles.caption
                          .copyWith(color: textSecondary)),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 72,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: _sparkline.map((h) {
                        final c = h > 50
                            ? AppColors.error
                            : h > 30
                                ? AppColors.warning
                                : AppColors.success;
                        return Container(
                          width: 22,
                          height: h,
                          decoration: BoxDecoration(
                            color: c.withValues(alpha: 0.8),
                            borderRadius: BorderRadius.circular(4),
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),

        // ── RUNTIME EPOCH ────────────────────────────────────────────────────
        _sectionHeader('RUNTIME EPOCH', textSecondary),
        _DiagnosticsCard(
          surfaceColor: surfaceColor,
          borderColor: borderColor,
          children: [
            _row('Epoch ID', textPrimary,
                value: s.epoch.epochId == '__none__'
                    ? 'No active epoch'
                    : s.epoch.epochId.substring(0, 8) + '…',
                valueColor: s.epoch.isValid ? textPrimary : AppColors.error),
            _divider(borderColor),
            _row('Branch', textPrimary, value: s.epoch.branchId),
            _divider(borderColor),
            _row('Staff', textPrimary, value: s.epoch.staffId),
            _divider(borderColor),
            _row('Valid', textPrimary,
                trailing: _StatusPill(
                  label: s.epoch.isValid ? 'VALID' : 'INVALID',
                  color: s.epoch.isValid ? AppColors.success : AppColors.error,
                )),
            _divider(borderColor),
            _row('Age', textPrimary, value: s.epoch.epochAge),
          ],
        ),
        const SizedBox(height: 20),

        // ── SEQUENCE VALIDATION ──────────────────────────────────────────────
        _sectionHeader('SEQUENCE VALIDATION', textSecondary),
        _DiagnosticsCard(
          surfaceColor: surfaceColor,
          borderColor: borderColor,
          children: [
            _row('Expected Sequence', textPrimary,
                value: '${s.sequence.expectedSequence}'),
            _divider(borderColor),
            _row('Events Processed', textPrimary,
                value: '${s.sequence.processedEventCount}'),
            _divider(borderColor),
            _row('Duplicates Rejected', textPrimary,
                value: '${s.sequence.duplicatesRejected}',
                valueColor: s.sequence.duplicatesRejected > 0
                    ? AppColors.warning
                    : AppColors.success),
            _divider(borderColor),
            _row('Gaps Detected', textPrimary,
                value: '${s.sequence.gapsDetected}',
                valueColor: s.sequence.gapsDetected > 0
                    ? AppColors.error
                    : AppColors.success),
            _divider(borderColor),
            _row('Stale Rejected', textPrimary,
                value: '${s.sequence.staleEventsRejected}',
                valueColor: s.sequence.staleEventsRejected > 0
                    ? AppColors.warning
                    : AppColors.success),
          ],
        ),
        const SizedBox(height: 20),

        // ── PROJECTION ENGINE ────────────────────────────────────────────────
        _sectionHeader('PROJECTION ENGINE', textSecondary),
        _DiagnosticsCard(
          surfaceColor: surfaceColor,
          borderColor: borderColor,
          children: [
            _row('Registered Projections', textPrimary,
                value: '${s.projections.registeredProjections}'),
            _divider(borderColor),
            _row('Currently Rebuilding', textPrimary,
                value: '${s.projections.currentlyRebuilding}',
                valueColor: s.projections.currentlyRebuilding > 0
                    ? AppColors.warning
                    : AppColors.success),
            _divider(borderColor),
            _row('Stale Projections', textPrimary,
                value: '${s.projections.staleProjections}',
                valueColor: s.projections.staleProjections > 0
                    ? AppColors.warning
                    : AppColors.success),
          ],
        ),
        const SizedBox(height: 20),

        // ── KDS RUNTIME ──────────────────────────────────────────────────────
        _sectionHeader('KDS RUNTIME', textSecondary),
        _DiagnosticsCard(
          surfaceColor: surfaceColor,
          borderColor: borderColor,
          children: [
            _row('Mode', textPrimary,
                trailing: _StatusPill(
                  label: s.kds.mode.name.toUpperCase(),
                  color: _kdsColor(s.kds.mode),
                )),
            _divider(borderColor),
            _row('Active Tickets', textPrimary,
                value: '${s.kds.activeTickets}'),
            _divider(borderColor),
            _row('Total Projections', textPrimary,
                value: '${s.kds.totalProjections}'),
            _divider(borderColor),
            _row('Stale Projections', textPrimary,
                value: '${s.kds.staleProjections}',
                valueColor: s.kds.staleProjections > 0
                    ? AppColors.warning
                    : AppColors.success),
            _divider(borderColor),
            _row('Events Processed', textPrimary,
                value: '${s.kds.processedEventCount}'),
          ],
        ),
        const SizedBox(height: 20),

        // ── PRESENCE GOVERNANCE ──────────────────────────────────────────────
        _sectionHeader('PRESENCE GOVERNANCE', textSecondary),
        _DiagnosticsCard(
          surfaceColor: surfaceColor,
          borderColor: borderColor,
          children: [
            _row('Active Records', textPrimary,
                value: '${s.presence.activePresenceRecords}'),
            _divider(borderColor),
            _row('Active Heartbeats', textPrimary,
                value: '${s.presence.activeHeartbeats}'),
            _divider(borderColor),
            _row('Sweep Active', textPrimary,
                trailing: _StatusPill(
                  label: s.presence.sweepActive ? 'RUNNING' : 'STOPPED',
                  color: s.presence.sweepActive
                      ? AppColors.success
                      : AppColors.warning,
                )),
            _divider(borderColor),
            _row('Heartbeat TTL', textPrimary,
                value: '${s.presence.ttlSeconds}s'),
            _divider(borderColor),
            _row('Recent Invalidations', textPrimary,
                value: '${s.presence.recentInvalidationCount}'),
          ],
        ),
        const SizedBox(height: 20),

        // ── OPTIMISTIC MUTATIONS ─────────────────────────────────────────────
        _sectionHeader('OPTIMISTIC MUTATIONS', textSecondary),
        _DiagnosticsCard(
          surfaceColor: surfaceColor,
          borderColor: borderColor,
          children: [
            _row('Pending', textPrimary,
                value: '${s.mutations.pendingMutations}',
                valueColor: s.mutations.pendingMutations > 0
                    ? AppColors.warning
                    : AppColors.success),
            _divider(borderColor),
            _row('Committed', textPrimary,
                value: '${s.mutations.committedMutations}',
                valueColor: AppColors.success),
            _divider(borderColor),
            _row('Failed', textPrimary,
                value: '${s.mutations.failedMutations}',
                valueColor: s.mutations.failedMutations > 0
                    ? AppColors.error
                    : AppColors.success),
          ],
        ),
        const SizedBox(height: 24),

        // ── Refresh button ───────────────────────────────────────────────────
        ElevatedButton.icon(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14)),
            padding: const EdgeInsets.symmetric(vertical: 16),
            elevation: 0,
          ),
          icon: const Icon(Icons.refresh_rounded),
          label: const Text('Refresh Now',
              style: TextStyle(fontWeight: FontWeight.bold)),
          onPressed: () {
            HapticFeedback.mediumImpact();
            ref.read(operationalHealthProvider.notifier).refresh();
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Diagnostics refreshed'),
              duration: Duration(seconds: 1),
              behavior: SnackBarBehavior.floating,
            ));
          },
        ),
        const SizedBox(height: 8),
        Center(
          child: Text(
            'Auto-refreshing every 3s · Captured: ${_formatTime(s.capturedAt)}',
            style: AppTextStyles.caption.copyWith(color: textSecondary),
          ),
        ),
        const SizedBox(height: 32),
      ],
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  void _export(RuntimeDiagnosticsSnapshot s) {
    HapticFeedback.heavyImpact();
    Clipboard.setData(ClipboardData(text: s.toReport()));
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
      content: Text('Diagnostics report copied to clipboard'),
      behavior: SnackBarBehavior.floating,
    ));
  }

  Color _transportColor(TransportHealthStatus status) {
    switch (status) {
      case TransportHealthStatus.healthy:
        return AppColors.success;
      case TransportHealthStatus.reconnecting:
        return AppColors.warning;
      case TransportHealthStatus.replaying:
        return const Color(0xFF3D8EF0);
      case TransportHealthStatus.degraded:
        return AppColors.warning;
      case TransportHealthStatus.critical:
        return AppColors.error;
      case TransportHealthStatus.disconnected:
        return AppColors.error;
    }
  }

  Color _kdsColor(KitchenRuntimeMode mode) {
    switch (mode) {
      case KitchenRuntimeMode.live:
        return AppColors.success;
      case KitchenRuntimeMode.recovering:
        return const Color(0xFF3D8EF0);
      case KitchenRuntimeMode.degraded:
        return AppColors.error;
    }
  }

  Color _pingColor(int ms) {
    if (ms < 100) return AppColors.success;
    if (ms < 300) return AppColors.warning;
    return AppColors.error;
  }

  String _formatTime(DateTime dt) {
    final h = dt.hour.toString().padLeft(2, '0');
    final m = dt.minute.toString().padLeft(2, '0');
    final s = dt.second.toString().padLeft(2, '0');
    return '$h:$m:$s';
  }

  Widget _sectionHeader(String title, Color color) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w800,
          color: color,
          letterSpacing: 1.2,
        ),
      ),
    );
  }

  Widget _row(String label, Color textPrimary,
      {String? value, Color? valueColor, Widget? trailing}) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: AppTextStyles.bodyMedium
                  .copyWith(color: textPrimary, fontWeight: FontWeight.w500)),
          if (trailing != null)
            trailing
          else if (value != null)
            Text(value,
                style: AppTextStyles.bodyMedium.copyWith(
                  fontWeight: FontWeight.bold,
                  color: valueColor ?? textPrimary,
                )),
        ],
      ),
    );
  }

  Widget _divider(Color color) =>
      Divider(height: 1, indent: 16, color: color);
}

// ━━━━━━━━━━━━━━━━━━━━━━ COMPONENTS ━━━━━━━━━━━━━━━━━━━━━━

class _HeaderCard extends StatelessWidget {
  final RuntimeDiagnosticsSnapshot snapshot;
  final Color surfaceColor;
  final Color borderColor;
  final Color textPrimary;
  final Color textSecondary;

  const _HeaderCard({
    required this.snapshot,
    required this.surfaceColor,
    required this.borderColor,
    required this.textPrimary,
    required this.textSecondary,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _col('App Version', snapshot.appVersion, textPrimary, textSecondary),
          Container(height: 32, width: 1, color: borderColor),
          _col('Device ID', snapshot.deviceId, textPrimary, textSecondary),
          Container(height: 32, width: 1, color: borderColor),
          _col('Environment', 'PROD-STAGE', AppColors.warning, textSecondary),
        ],
      ),
    );
  }

  Widget _col(String label, String value, Color valueColor, Color labelColor) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: AppTextStyles.caption.copyWith(color: labelColor)),
        const SizedBox(height: 4),
        Text(value,
            style: AppTextStyles.bodyMedium
                .copyWith(fontWeight: FontWeight.bold, color: valueColor)),
      ],
    );
  }
}

class _HealthBanner extends StatelessWidget {
  final OverallRuntimeHealth health;

  const _HealthBanner({required this.health});

  @override
  Widget build(BuildContext context) {
    final (label, subtitle, color, icon) = switch (health) {
      OverallRuntimeHealth.healthy => (
          'All Systems Operational',
          'Runtime is healthy. All layers nominal.',
          AppColors.success,
          Icons.check_circle_rounded,
        ),
      OverallRuntimeHealth.warning => (
          'Minor Issues Detected',
          'Some degradation present. Monitor closely.',
          AppColors.warning,
          Icons.warning_rounded,
        ),
      OverallRuntimeHealth.degraded => (
          'Runtime Degraded',
          'Significant issues. Operator attention required.',
          const Color(0xFFF59E0B),
          Icons.error_rounded,
        ),
      OverallRuntimeHealth.critical => (
          'Critical Failure',
          'Immediate intervention required.',
          AppColors.error,
          Icons.dangerous_rounded,
        ),
    };

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.35), width: 1.5),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 32),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: AppTextStyles.bodyMedium.copyWith(
                        color: color, fontWeight: FontWeight.w800)),
                const SizedBox(height: 2),
                Text(subtitle,
                    style: AppTextStyles.bodySmall
                        .copyWith(color: color.withValues(alpha: 0.8))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DiagnosticsCard extends StatelessWidget {
  final Color surfaceColor;
  final Color borderColor;
  final List<Widget> children;

  const _DiagnosticsCard({
    required this.surfaceColor,
    required this.borderColor,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor),
      ),
      child: Column(children: children),
    );
  }
}

class _StatusPill extends StatelessWidget {
  final String label;
  final Color color;

  const _StatusPill({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(100),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.bold,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}
