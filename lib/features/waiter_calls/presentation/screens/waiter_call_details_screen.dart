// lib/features/waiter_calls/presentation/screens/waiter_call_details_screen.dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/waiter_call.dart';
import '../state/waiter_calls_providers.dart';

class WaiterCallDetailsScreen extends ConsumerStatefulWidget {
  final String callId;

  const WaiterCallDetailsScreen({
    super.key,
    required this.callId,
  });

  @override
  ConsumerState<WaiterCallDetailsScreen> createState() => _WaiterCallDetailsScreenState();
}

class _WaiterCallDetailsScreenState extends ConsumerState<WaiterCallDetailsScreen> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final callsAsync = ref.watch(waiterCallsListProvider);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Call Details', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
      body: callsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
        error: (err, _) => Center(child: Text('Error loading call details: $err')),
        data: (calls) {
          final call = calls.firstWhere(
            (c) => c.id == widget.callId,
            orElse: () => throw Exception('Call not found'),
          );

          final elapsed = DateTime.now().difference(call.timestamp);

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildSlaTimerCard(call, elapsed, theme, isDark),
                const SizedBox(height: 16),
                _buildTableReferenceCard(call, theme, isDark),
                const SizedBox(height: 16),
                _buildNotesCard(call, theme, isDark),
                const SizedBox(height: 24),
                _buildWorkflowActions(context, call, isDark),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildSlaTimerCard(WaiterCall call, Duration elapsed, ThemeData theme, bool isDark) {
    final Color cardBorderColor = call.isUrgent ? AppColors.error : AppColors.success;
    return Card(
      color: isDark ? AppColors.darkSurface : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: cardBorderColor, width: 2),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'SLA Operational Timer',
                  style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.bold),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: cardBorderColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    call.status.name.toUpperCase(),
                    style: TextStyle(color: cardBorderColor, fontWeight: FontWeight.bold, fontSize: 10),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            Center(
              child: Text(
                _formatDuration(elapsed),
                style: theme.textTheme.displayMedium?.copyWith(
                  fontWeight: FontWeight.w900,
                  color: call.isUrgent ? AppColors.error : theme.textTheme.titleLarge?.color,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Time elapsed since guest call request',
              style: theme.textTheme.bodySmall?.copyWith(color: Colors.grey),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTableReferenceCard(WaiterCall call, ThemeData theme, bool isDark) {
    return Card(
      color: isDark ? AppColors.darkSurface : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: AppColors.primary.withValues(alpha: 0.15),
                  child: const Icon(Icons.table_bar_rounded, color: AppColors.primary),
                ),
                const SizedBox(width: 12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Operational Zone',
                      style: theme.textTheme.bodySmall?.copyWith(color: Colors.grey),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      call.tableLabel,
                      style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
              ],
            ),
            TextButton.icon(
              icon: const Icon(Icons.open_in_new_rounded, size: 16),
              label: const Text('View Floor Map'),
              onPressed: () => context.go('/tables'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNotesCard(WaiterCall call, ThemeData theme, bool isDark) {
    return Card(
      color: isDark ? AppColors.darkSurface : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Call Description',
              style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.bold),
            ),
            const Divider(height: 24),
            Text(
              _getCallTypeLabel(call.type).toUpperCase(),
              style: const TextStyle(
                color: AppColors.primary,
                fontWeight: FontWeight.bold,
                fontSize: 12,
                letterSpacing: 1.2,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              call.customerNote ?? 'No specific details provided by the guest.',
              style: theme.textTheme.bodyLarge?.copyWith(
                fontStyle: call.customerNote == null ? FontStyle.italic : null,
                color: call.customerNote == null ? Colors.grey : null,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildWorkflowActions(BuildContext context, WaiterCall call, bool isDark) {
    return Column(
      children: [
        if (call.status == CallStatus.pending || call.status == CallStatus.escalated) ...[
          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
              onPressed: () {
                HapticFeedback.mediumImpact();
                ref.read(waiterCallsListProvider.notifier).acknowledgeCall(call.id, 'waiter_001', 'John Doe');
              },
              child: const Text('Claim and Acknowledge Request', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            ),
          ),
        ] else if (call.status == CallStatus.acknowledged) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.success.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: [
                const Icon(Icons.lock_rounded, color: AppColors.success),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Assigned to ${call.waiterName ?? 'another waiter'}.',
                    style: const TextStyle(color: AppColors.success, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.success,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
              onPressed: () {
                HapticFeedback.lightImpact();
                ref.read(waiterCallsListProvider.notifier).resolveCall(call.id);
                context.pop();
              },
              child: const Text('Complete and Resolve Call', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            ),
          ),
        ],
        const SizedBox(height: 12),
        if (call.status != CallStatus.resolved && call.status != CallStatus.escalated) ...[
          SizedBox(
            width: double.infinity,
            height: 52,
            child: OutlinedButton(
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: AppColors.error),
                foregroundColor: AppColors.error,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
              onPressed: () {
                HapticFeedback.mediumImpact();
                ref.read(waiterCallsListProvider.notifier).escalateCall(call.id);
              },
              child: const Text('Escalate to Manager', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            ),
          ),
        ],
      ],
    );
  }

  String _getCallTypeLabel(CallType type) {
    switch (type) {
      case CallType.service:
        return 'Service Request';
      case CallType.billRequest:
        return 'Bill Request';
      case CallType.assistance:
        return 'Assistance';
      case CallType.issueReport:
        return 'Issue Report';
    }
  }

  String _formatDuration(Duration d) {
    final minutes = d.inMinutes;
    final seconds = d.inSeconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }
}
