// lib/features/manager/presentation/screens/operational_alerts_screen.dart

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/network/sync_state.dart';

// ─── Models ───────────────────────────────────────────────────────────────────

enum AlertType { slaBreached, waiterCall, delayedOrder, pendingPayment }
enum AlertSeverity { critical, high, standard, acknowledged }

class OpAlert {
  final String id;
  final AlertType type;
  final AlertSeverity severity;
  final String entityLabel;
  final DateTime triggeredAt;
  final String? assignedStaff;

  const OpAlert({
    required this.id,
    required this.type,
    required this.severity,
    required this.entityLabel,
    required this.triggeredAt,
    this.assignedStaff,
  });

  OpAlert copyWith({
    String? id,
    AlertType? type,
    AlertSeverity? severity,
    String? entityLabel,
    DateTime? triggeredAt,
    String? assignedStaff,
    bool clearAssignedStaff = false,
  }) {
    return OpAlert(
      id: id ?? this.id,
      type: type ?? this.type,
      severity: severity ?? this.severity,
      entityLabel: entityLabel ?? this.entityLabel,
      triggeredAt: triggeredAt ?? this.triggeredAt,
      assignedStaff: clearAssignedStaff ? null : (assignedStaff ?? this.assignedStaff),
    );
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

final alertsProvider = StateProvider<List<OpAlert>>((ref) => [
      OpAlert(
        id: 'a1',
        type: AlertType.slaBreached,
        severity: AlertSeverity.critical,
        entityLabel: 'Table 7 — SLA Breach',
        triggeredAt: DateTime.now().subtract(const Duration(minutes: 12)),
        assignedStaff: null,
      ),
      OpAlert(
        id: 'a2',
        type: AlertType.waiterCall,
        severity: AlertSeverity.critical,
        entityLabel: 'Waiter Call — Table 3',
        triggeredAt: DateTime.now().subtract(const Duration(minutes: 4)),
        assignedStaff: null,
      ),
      OpAlert(
        id: 'a3',
        type: AlertType.delayedOrder,
        severity: AlertSeverity.high,
        entityLabel: 'Order #1042 — Table 9',
        triggeredAt: DateTime.now().subtract(const Duration(minutes: 11)),
        assignedStaff: 'Alex J.',
      ),
      OpAlert(
        id: 'a4',
        type: AlertType.slaBreached,
        severity: AlertSeverity.high,
        entityLabel: 'Table 12 — SLA Breach',
        triggeredAt: DateTime.now().subtract(const Duration(minutes: 6)),
        assignedStaff: null,
      ),
      OpAlert(
        id: 'a5',
        type: AlertType.pendingPayment,
        severity: AlertSeverity.standard,
        entityLabel: 'Table 5 — Payment Hold',
        triggeredAt: DateTime.now().subtract(const Duration(minutes: 4)),
        assignedStaff: null,
      ),
      OpAlert(
        id: 'a6',
        type: AlertType.waiterCall,
        severity: AlertSeverity.acknowledged,
        entityLabel: 'Waiter Call — Table 8',
        triggeredAt: DateTime.now().subtract(const Duration(minutes: 18)),
        assignedStaff: 'Maria K.',
      ),
    ]);

final _syncStateProvider = StateProvider<SyncState>((ref) => SyncState.fresh);

// ─── Screen ───────────────────────────────────────────────────────────────────

class OperationalAlertsScreen extends ConsumerStatefulWidget {
  const OperationalAlertsScreen({super.key});

  @override
  ConsumerState<OperationalAlertsScreen> createState() => _OperationalAlertsScreenState();
}


class _OperationalAlertsScreenState extends ConsumerState<OperationalAlertsScreen> {
  String _activeFilter = 'all'; // 'all' | 'sla' | 'call' | 'delayed' | 'payment'
  bool _acknowledgedExpanded = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    // Refresh page timers every 10 seconds for live updates
    _timer = Timer.periodic(const Duration(seconds: 10), (t) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  String _getElapsedLabel(DateTime triggeredAt) {
    final diff = DateTime.now().difference(triggeredAt);
    final m = diff.inMinutes;
    if (m < 1) return '< 1 min ago';
    return '$m min ago';
  }

  Color _getSeverityColor(AlertSeverity severity) {
    switch (severity) {
      case AlertSeverity.critical:
        return AppColors.error;
      case AlertSeverity.high:
        return AppColors.warning;
      case AlertSeverity.standard:
        return Colors.blue;
      case AlertSeverity.acknowledged:
        return Colors.grey;
    }
  }

  IconData _getSeverityIcon(AlertSeverity severity) {
    switch (severity) {
      case AlertSeverity.critical:
      case AlertSeverity.high:
        return Icons.warning_rounded;
      case AlertSeverity.standard:
        return Icons.info_rounded;
      case AlertSeverity.acknowledged:
        return Icons.check_circle_rounded;
    }
  }

  List<OpAlert> _filterAlerts(List<OpAlert> alerts) {
    if (_activeFilter == 'all') return alerts;
    final typeMap = {
      'sla': AlertType.slaBreached,
      'call': AlertType.waiterCall,
      'delayed': AlertType.delayedOrder,
      'payment': AlertType.pendingPayment,
    };
    final targetType = typeMap[_activeFilter];
    return alerts.where((a) => a.type == targetType).toList();
  }

  @override
  Widget build(BuildContext context) {
    final alerts = ref.watch(alertsProvider);
    final syncState = ref.watch(_syncStateProvider);
    
    final filteredAlerts = _filterAlerts(alerts);
    final unacknowledgedCount = alerts.where((a) => a.severity != AlertSeverity.acknowledged).length;

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surfaceColor = isDark ? AppColors.darkSurface : Colors.white;
    final borderColor = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final textPrimary = isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary;
    final textSecondary = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;

    // Grouping by severity
    final criticalAlerts = filteredAlerts.where((a) => a.severity == AlertSeverity.critical).toList();
    final highAlerts = filteredAlerts.where((a) => a.severity == AlertSeverity.high).toList();
    final standardAlerts = filteredAlerts.where((a) => a.severity == AlertSeverity.standard).toList();
    final acknowledgedAlerts = filteredAlerts.where((a) => a.severity == AlertSeverity.acknowledged).toList();

    return Scaffold(
      backgroundColor: isDark ? AppColors.darkBackground : AppColors.lightBackground,
      appBar: AppBar(
        title: Row(
          children: [
            Text(
              'Operational Alerts',
              style: AppTextStyles.h3.copyWith(color: textPrimary, fontWeight: FontWeight.bold),
            ),
            const SizedBox(width: 8),
            if (unacknowledgedCount > 0)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.error,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  '$unacknowledgedCount',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
          ],
        ),
        centerTitle: false,
        backgroundColor: isDark ? AppColors.darkSurface : Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        actions: [
          _buildSyncStateChip(syncState),
          const SizedBox(width: 12),
        ],
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, color: textPrimary),
          onPressed: () => context.pop(),
        ),
      ),
      body: Column(
        children: [
          // ── Filter Chips Row ─────────────────────────────────────────────
          _buildFilterChipsRow(isDark, borderColor),
          
          // ── Alert Cards List ─────────────────────────────────────────────
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (criticalAlerts.isNotEmpty) ...[
                  _buildSectionHeader('CRITICAL ALERTS', AppColors.error),
                  ...criticalAlerts.map((a) => _buildAlertCard(a, surfaceColor, borderColor, textPrimary, textSecondary)),
                  const SizedBox(height: 16),
                ],
                if (highAlerts.isNotEmpty) ...[
                  _buildSectionHeader('HIGH PRIORITY ALERTS', AppColors.warning),
                  ...highAlerts.map((a) => _buildAlertCard(a, surfaceColor, borderColor, textPrimary, textSecondary)),
                  const SizedBox(height: 16),
                ],
                if (standardAlerts.isNotEmpty) ...[
                  _buildSectionHeader('STANDARD ALERTS', Colors.blue),
                  ...standardAlerts.map((a) => _buildAlertCard(a, surfaceColor, borderColor, textPrimary, textSecondary)),
                  const SizedBox(height: 16),
                ],
                if (acknowledgedAlerts.isNotEmpty) ...[
                  _buildAcknowledgedHeader(acknowledgedAlerts.length, textPrimary, textSecondary, surfaceColor, borderColor),
                  if (_acknowledgedExpanded)
                    ...acknowledgedAlerts.map((a) => _buildAlertCard(a, surfaceColor, borderColor, textPrimary, textSecondary)),
                ],
                if (filteredAlerts.isEmpty)
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 64),
                      child: Column(
                        children: [
                          Icon(Icons.notifications_none_rounded, size: 64, color: textSecondary.withValues(alpha: 0.4)),
                          const SizedBox(height: 16),
                          Text(
                            'No operational alerts found',
                            style: AppTextStyles.bodyLarge.copyWith(color: textSecondary, fontWeight: FontWeight.w500),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSyncStateChip(SyncState state) {
    final color = state == SyncState.fresh ? AppColors.success : AppColors.warning;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 4),
          Text(
            state.name.toUpperCase(),
            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.grey),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChipsRow(bool isDark, Color borderColor) {
    final filters = [
      ('all', 'All'),
      ('sla', 'SLA Breach'),
      ('call', 'Waiter Call'),
      ('delayed', 'Delayed'),
      ('payment', 'Payment'),
    ];

    return Container(
      height: 56,
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: borderColor),
        ),
      ),
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        scrollDirection: Axis.horizontal,
        itemCount: filters.length,
        separatorBuilder: (context, index) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final filter = filters[index];
          final isActive = _activeFilter == filter.$1;
          return GestureDetector(
            onTap: () {
              HapticFeedback.selectionClick();
              setState(() {
                _activeFilter = filter.$1;
              });
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                color: isActive ? AppColors.primary : Colors.transparent,
                borderRadius: BorderRadius.circular(100),
                border: Border.all(
                  color: isActive ? AppColors.primary : borderColor,
                ),
              ),
              alignment: Alignment.center,
              child: Text(
                filter.$2,
                style: AppTextStyles.bodySmall.copyWith(
                  color: isActive ? Colors.white : (isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary),
                  fontWeight: isActive ? FontWeight.bold : FontWeight.w500,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildSectionHeader(String title, Color textColor) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10, left: 4),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w800,
          color: textColor,
          letterSpacing: 1.2,
        ),
      ),
    );
  }

  Widget _buildAcknowledgedHeader(
    int count,
    Color textPrimary,
    Color textSecondary,
    Color surfaceColor,
    Color borderColor,
  ) {
    return Container(
      margin: const EdgeInsets.only(top: 8, bottom: 12),
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: borderColor),
      ),
      child: ListTile(
        visualDensity: VisualDensity.compact,
        title: Text(
          'ACKNOWLEDGED ALERTS ($count)',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            color: textSecondary,
            letterSpacing: 1.2,
          ),
        ),
        trailing: Icon(
          _acknowledgedExpanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
          color: textSecondary,
        ),
        onTap: () {
          setState(() {
            _acknowledgedExpanded = !_acknowledgedExpanded;
          });
        },
      ),
    );
  }

  Widget _buildAlertCard(
    OpAlert alert,
    Color surfaceColor,
    Color borderColor,
    Color textPrimary,
    Color textSecondary,
  ) {
    final severityColor = _getSeverityColor(alert.severity);
    final isAcked = alert.severity == AlertSeverity.acknowledged;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Container(
          decoration: BoxDecoration(
            border: Border(
              left: BorderSide(color: severityColor, width: 4),
            ),
          ),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Row 1: Icon + Entity Label
              Row(
                children: [
                  Icon(_getSeverityIcon(alert.severity), color: severityColor, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      alert.entityLabel,
                      style: AppTextStyles.bodyMedium.copyWith(
                        fontWeight: FontWeight.bold,
                        color: isAcked ? textSecondary : textPrimary,
                        decoration: isAcked ? TextDecoration.lineThrough : null,
                      ),
                    ),
                  ),
                  
                  // Triggered elapsed time label
                  Text(
                    _getElapsedLabel(alert.triggeredAt),
                    style: AppTextStyles.caption.copyWith(color: textSecondary),
                  ),
                ],
              ),
              const SizedBox(height: 10),

              // Row 2: Assigned Staff Chip & Actions
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  // Assigned Staff Chip
                  if (alert.assignedStaff != null)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.person_rounded, size: 12, color: AppColors.primary),
                          const SizedBox(width: 4),
                          Text(
                            alert.assignedStaff!,
                            style: AppTextStyles.caption.copyWith(
                              color: AppColors.primary,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    )
                  else
                    Text(
                      'Unassigned',
                      style: AppTextStyles.caption.copyWith(color: textSecondary, fontStyle: FontStyle.italic),
                    ),
                  
                  // Action buttons
                  if (!isAcked)
                    Row(
                      children: [
                        // Assign Button
                        if (alert.assignedStaff == null)
                          TextButton.icon(
                            style: TextButton.styleFrom(
                              foregroundColor: AppColors.primary,
                              padding: const EdgeInsets.symmetric(horizontal: 8),
                              visualDensity: VisualDensity.compact,
                            ),
                            icon: const Icon(Icons.person_add_alt_rounded, size: 16),
                            label: const Text('Assign', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                            onPressed: () {
                              HapticFeedback.lightImpact();
                              _showAssignStaffDialog(context, alert);
                            },
                          ),
                        
                        // Escalate Button (shown only for critical)
                        if (alert.severity == AlertSeverity.critical) ...[
                          const SizedBox(width: 4),
                          TextButton.icon(
                            style: TextButton.styleFrom(
                              foregroundColor: AppColors.error,
                              padding: const EdgeInsets.symmetric(horizontal: 8),
                              visualDensity: VisualDensity.compact,
                            ),
                            icon: const Icon(Icons.campaign_rounded, size: 16),
                            label: const Text('Escalate', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                            onPressed: () {
                              HapticFeedback.mediumImpact();
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text('Alert escalated to branch manager'),
                                  behavior: SnackBarBehavior.floating,
                                  backgroundColor: AppColors.error,
                                ),
                              );
                            },
                          ),
                        ],

                        // Acknowledge Button
                        const SizedBox(width: 4),
                        ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.success,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                            ),
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            visualDensity: VisualDensity.compact,
                            elevation: 0,
                          ),
                          onPressed: () {
                            HapticFeedback.mediumImpact();
                            ref.read(alertsProvider.notifier).update((list) => list.map((a) {
                                  if (a.id == alert.id) {
                                    return a.copyWith(severity: AlertSeverity.acknowledged);
                                  }
                                  return a;
                                }).toList());
                          },
                          child: const Text('Ack', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                        ),
                      ],
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showAssignStaffDialog(BuildContext context, OpAlert alert) {
    final staffList = ['Alex J.', 'Maria K.', 'Priya M.', 'David L.'];
    final isDark = Theme.of(context).brightness == Brightness.dark;

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: isDark ? AppColors.darkSurface : Colors.white,
        title: const Text('Assign Staff Member', style: TextStyle(fontWeight: FontWeight.w800)),
        content: SizedBox(
          width: double.maxFinite,
          child: ListView.builder(
            shrinkWrap: true,
            itemCount: staffList.length,
            itemBuilder: (c, idx) {
              final staff = staffList[idx];
              return ListTile(
                leading: CircleAvatar(
                  backgroundColor: AppColors.primary.withValues(alpha: 0.12),
                  child: Text(
                    staff.substring(0, 1),
                    style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.bold),
                  ),
                ),
                title: Text(staff, style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold)),
                onTap: () {
                  HapticFeedback.mediumImpact();
                  ref.read(alertsProvider.notifier).update((list) => list.map((a) {
                        if (a.id == alert.id) {
                          return a.copyWith(assignedStaff: staff);
                        }
                        return a;
                      }).toList());
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Alert assigned to $staff'),
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                },
              );
            },
          ),
        ),
      ),
    );
  }
}
