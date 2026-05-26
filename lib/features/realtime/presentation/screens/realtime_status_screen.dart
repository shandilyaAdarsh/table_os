// lib/features/realtime/presentation/screens/realtime_status_screen.dart

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';

import '../state/realtime_providers.dart';
import '../../../../core/network/realtime_sync_manager.dart';
import '../../../../core/runtime/diagnostics/operational_health_publisher.dart';

// Diagnostic Widgets
import '../widgets/diagnostics/transport_health_monitor.dart';
import '../widgets/diagnostics/replay_recovery_monitor.dart';
import '../widgets/diagnostics/projection_rebuild_monitor.dart';
import '../widgets/diagnostics/mutation_acknowledgement_monitor.dart';
import '../widgets/diagnostics/queue_backlog_inspector.dart';
import '../widgets/diagnostics/runtime_epoch_diagnostics.dart';
import '../widgets/diagnostics/realtime_synchronization_inspector.dart';



class RealtimeStatusScreen extends ConsumerWidget {
  const RealtimeStatusScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final healthState = ref.watch(operationalHealthProvider);

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surfaceColor =
        isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final borderColor =
        isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final textPrimary =
        isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary;
    final textSecondary =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;

    return Scaffold(
      backgroundColor:
          isDark ? AppColors.darkBackground : AppColors.lightBackground,
      appBar: AppBar(
        title: Text(
          'Runtime Diagnostics',
          style: AppTextStyles.h3.copyWith(color: textPrimary),
        ),
        centerTitle: false,
        backgroundColor:
            isDark ? AppColors.darkSurface : AppColors.lightSurface,
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
          IconButton(
            icon: Icon(Icons.refresh_rounded, color: textPrimary),
            onPressed: () {
              HapticFeedback.selectionClick();
              ref.read(operationalHealthProvider.notifier).refresh();
            },
          )
        ],
      ),
      body: healthState.when(
        data: (snapshot) {
          final isReplaying = snapshot.transport.isReplaying;
          final replayProgress = isReplaying ? 0.65 : 1.0; // In a real scenario, this would come from the snapshot or KDS

          return ListView(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
            children: [
              // ── Overall Status ──────────────────────────────────────────────
              _StatusCard(
                snapshot: snapshot,
                surfaceColor: surfaceColor,
                borderColor: borderColor,
                textPrimary: textPrimary,
                textSecondary: textSecondary,
              ),

              const SizedBox(height: 24),

              // ── Transport & Epoch ───────────────────────────────────────────
              TransportHealthMonitor(transport: snapshot.transport),
              const SizedBox(height: 16),
              RuntimeEpochDiagnostics(epoch: snapshot.epoch),

              const SizedBox(height: 16),

              // ── Replay & Synchronization ──────────────────────────────────────
              if (isReplaying) ...[
                ReplayRecoveryMonitor(
                  isReplaying: isReplaying,
                  progress: replayProgress,
                ),
                const SizedBox(height: 16),
              ],
              RealtimeSynchronizationInspector(sequence: snapshot.sequence),

              const SizedBox(height: 24),

              // ── Projections & Queues ────────────────────────────────────────
              _SectionHeader(
                title: 'State Hydration & Backlogs',
                textPrimary: textPrimary,
              ),
              const SizedBox(height: 12),
              ProjectionRebuildMonitor(projections: snapshot.projections),
              const SizedBox(height: 16),
              MutationAcknowledgementMonitor(mutations: snapshot.mutations),
              const SizedBox(height: 16),
              QueueBacklogInspector(
                projectionRebuildBacklog: snapshot.projections.currentlyRebuilding,
                mutationBacklog: snapshot.mutations.pendingMutations,
              ),

              const SizedBox(height: 32),

              // ── Quick Actions ────────────────────────────────────────────────
              _SectionHeader(
                title: 'Runtime Controls',
                textPrimary: textPrimary,
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _ActionButton(
                      label: 'Force Reconnect',
                      icon: Icons.refresh_rounded,
                      color: AppColors.primary,
                      onPressed: () {
                        HapticFeedback.mediumImpact();
                        ref.read(realtimeSyncManagerProvider).connectLocal();
                        ref.read(realtimeStateProvider.notifier).simulateReconnect();
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _ActionButton(
                      label: 'Invalidate Epoch',
                      icon: Icons.block_rounded,
                      color: AppColors.error,
                      onPressed: () {
                        HapticFeedback.heavyImpact();
                        // Real implementation would call epochManager.invalidateEpoch()
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Epoch invalidated (Simulated)')),
                        );
                      },
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 32),

              // ── Simulation Panel ─────────────────────────────────────────────
              _SimulationPanel(
                surfaceColor: surfaceColor,
                borderColor: borderColor,
                textPrimary: textPrimary,
                textSecondary: textSecondary,
              ),

              const SizedBox(height: 32),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, s) => Center(child: Text('Error loading diagnostics: $e', style: TextStyle(color: AppColors.error))),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Status Card
// ---------------------------------------------------------------------------

class _StatusCard extends StatelessWidget {
  final dynamic snapshot; // RuntimeDiagnosticsSnapshot
  final Color surfaceColor;
  final Color borderColor;
  final Color textPrimary;
  final Color textSecondary;

  const _StatusCard({
    required this.snapshot,
    required this.surfaceColor,
    required this.borderColor,
    required this.textPrimary,
    required this.textSecondary,
  });

  _StatusConfig get config {
    final status = snapshot.overallHealth.name;
    switch (status) {
      case 'healthy':
        return const _StatusConfig(
          icon: Icons.check_circle_rounded,
          label: 'Fully Operational',
          color: AppColors.success,
          subtitle: 'All runtime systems nominal. Real-time updates active.',
          showSpinner: false,
        );
      case 'degraded':
        return const _StatusConfig(
          icon: Icons.warning_rounded,
          label: 'Degraded Mode',
          color: AppColors.warning,
          subtitle: 'System operating with reduced capabilities. Queuing locally.',
          showSpinner: false,
        );
      case 'critical':
        return const _StatusConfig(
          icon: Icons.dangerous_rounded,
          label: 'Critical Failure',
          color: AppColors.error,
          subtitle: 'Runtime synchronization failed. Manual intervention needed.',
          showSpinner: false,
        );
      default:
        return const _StatusConfig(
          icon: Icons.help_outline_rounded,
          label: 'Unknown',
          color: AppColors.darkTextSecondary,
          subtitle: 'Overall health unknown.',
          showSpinner: false,
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final cfg = config;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: cfg.color.withValues(alpha: 0.4), width: 1.5),
        boxShadow: [
          BoxShadow(
            color: cfg.color.withValues(alpha: 0.08),
            blurRadius: 24,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        children: [
          if (cfg.showSpinner)
            SizedBox(
              width: 64,
              height: 64,
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(cfg.color),
                strokeWidth: 3.5,
              ),
            )
          else
            Icon(cfg.icon, color: cfg.color, size: 64),
          const SizedBox(height: 16),
          Text(
            cfg.label,
            style: AppTextStyles.h2.copyWith(
              color: cfg.color,
              fontWeight: FontWeight.w800,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            cfg.subtitle,
            style: AppTextStyles.bodyMedium.copyWith(color: textSecondary),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            decoration: BoxDecoration(
              color: cfg.color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(100),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: cfg.color,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  snapshot.overallHealth.name.toUpperCase(),
                  style: AppTextStyles.caption.copyWith(
                    color: cfg.color,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.2,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusConfig {
  final IconData icon;
  final String label;
  final Color color;
  final String subtitle;
  final bool showSpinner;

  const _StatusConfig({
    required this.icon,
    required this.label,
    required this.color,
    required this.subtitle,
    required this.showSpinner,
  });
}



// ---------------------------------------------------------------------------
// Action Button
// ---------------------------------------------------------------------------

class _ActionButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onPressed;

  const _ActionButton({
    required this.label,
    required this.icon,
    required this.color,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 56,
      child: ElevatedButton.icon(
        onPressed: onPressed,
        icon: Icon(icon, size: 20),
        label: Text(
          label,
          style: AppTextStyles.button.copyWith(fontSize: 13),
        ),
        style: ElevatedButton.styleFrom(
          backgroundColor: color,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 12),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Section Header
// ---------------------------------------------------------------------------

class _SectionHeader extends StatelessWidget {
  final String title;
  final Color textPrimary;

  const _SectionHeader({required this.title, required this.textPrimary});

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: AppTextStyles.h3.copyWith(
        color: textPrimary,
        fontWeight: FontWeight.w700,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Simulation Panel
// ---------------------------------------------------------------------------

class _SimulationPanel extends ConsumerWidget {
  final Color surfaceColor;
  final Color borderColor;
  final Color textPrimary;
  final Color textSecondary;

  const _SimulationPanel({
    required this.surfaceColor,
    required this.borderColor,
    required this.textPrimary,
    required this.textSecondary,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final states = [
      ('connected', AppColors.success, Icons.check_circle_rounded),
      ('reconnecting', const Color(0xFFF59E0B), Icons.sync_rounded),
      ('replaying', const Color(0xFF3D8EF0), Icons.history_rounded),
      ('degraded', AppColors.warning, Icons.warning_rounded),
      ('critical', AppColors.error, Icons.dangerous_rounded),
    ];

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
              Icon(Icons.science_rounded,
                  color: textSecondary, size: 18),
              const SizedBox(width: 8),
              Text(
                'Simulate State',
                style: AppTextStyles.bodyMedium.copyWith(
                  color: textSecondary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: states.map((s) {
              final (label, color, icon) = s;
              final current =
                  ref.watch(realtimeStateProvider).connectionState.name;
              final isActive = current == label;
              return GestureDetector(
                onTap: () {
                  HapticFeedback.selectionClick();
                  final notifier = ref.read(realtimeStateProvider.notifier);
                  switch (label) {
                    case 'connected':
                      notifier.simulateReconnect();
                      break;
                    case 'reconnecting':
                      notifier.simulateDisconnect();
                      break;
                    case 'replaying':
                      notifier.simulateReplay();
                      break;
                    case 'degraded':
                      notifier.simulateDegraded();
                      break;
                    case 'critical':
                      notifier.simulateCritical();
                      break;
                  }
                },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: isActive
                        ? color.withOpacity(0.18)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(100),
                    border: Border.all(
                      color: isActive
                          ? color
                          : borderColor,
                      width: isActive ? 1.5 : 1,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(icon,
                          color: isActive ? color : textSecondary,
                          size: 16),
                      const SizedBox(width: 6),
                      Text(
                        label,
                        style: AppTextStyles.bodySmall.copyWith(
                          color: isActive ? color : textSecondary,
                          fontWeight: isActive
                              ? FontWeight.w700
                              : FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}
