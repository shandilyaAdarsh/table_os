// lib/features/dashboard/presentation/screens/operational_dashboard_screen.dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../auth/presentation/state/auth_notifier.dart';
import '../../../tables/presentation/state/table_grid_notifier.dart';
import '../../../kitchen/presentation/state/kitchen_runtime_providers.dart';
import '../../../tables/domain/entities/restaurant_table.dart';
import '../../../auth/domain/entities/branch.dart';
import '../../../realtime/presentation/widgets/diagnostics/degraded_mode_coordinator_widget.dart';

class OperationalDashboardScreen extends ConsumerStatefulWidget {
  const OperationalDashboardScreen({super.key});

  @override
  ConsumerState<OperationalDashboardScreen> createState() =>
      _OperationalDashboardScreenState();
}

class _OperationalDashboardScreenState
    extends ConsumerState<OperationalDashboardScreen> {
  final List<String> _simulatedLogs = [];
  late Timer _logTimer;
  final ScrollController _scrollController = ScrollController();

  final List<String> _logTemplates = [
    'ticket.created -> Table T2 | Burger + Soda',
    'table.status_changed -> Table T5 (Available -> Occupied)',
    'ticket.status_changed -> Preparing Table T3',
    'ping -> branch_gateway (45ms latency)',
    'ticket.ready -> Table T4 [Cheeseburger Ready]',
    'waiter.called -> Table T1 Patio',
    r'billing.payment_received -> Table T6 ($64.50)',
    'sync.outbox -> 0 pending transactions',
  ];

  @override
  void initState() {
    super.initState();
    _simulatedLogs.add('Websocket Operational stream connected.');
    _simulatedLogs.add('Reconciliation completed: 0 delta events.');

    // Simulate active WebSocket traffic ticker
    _logTimer = Timer.periodic(const Duration(seconds: 4), (timer) {
      if (!mounted) return;
      final timestamp = DateTime.now()
          .toLocal()
          .toString()
          .split(' ')[1]
          .substring(0, 8);
      final template = _logTemplates[timer.tick % _logTemplates.length];
      setState(() {
        _simulatedLogs.add('[$timestamp] $template');
        if (_simulatedLogs.length > 20) {
          _simulatedLogs.removeAt(0);
        }
      });
      // Scroll to bottom
      Future.delayed(const Duration(milliseconds: 100), () {
        if (_scrollController.hasClients) {
          _scrollController.animateTo(
            _scrollController.position.maxScrollExtent,
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOut,
          );
        }
      });
    });
  }

  @override
  void dispose() {
    _logTimer.cancel();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authNotifierProvider);
    final tablesAsync = ref.watch(tableGridNotifierProvider);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final branch = authState.selectedBranch;
    final staff = authState.loggedInStaff;

    // Operational statistics derived from providers
    int totalTables = 0;
    int occupiedTables = 0;
    int availableTables = 0;
    int alertTables = 0;
    List<RestaurantTable> alertList = [];

    tablesAsync.whenData((state) {
      final tables = state.tables;
      totalTables = tables.length;
      occupiedTables = tables
          .where(
            (t) =>
                t.status == TableStatus.occupied ||
                t.status == TableStatus.reserved,
          )
          .length;
      availableTables = tables
          .where((t) => t.status == TableStatus.available)
          .length;
      alertList = tables
          .where((t) => t.status == TableStatus.needsAttention)
          .toList();
      alertTables = alertList.length;
    });

    final preparingTickets = ref.watch(preparingTicketsProvider);
    final readyTickets = ref.watch(readyTicketsProvider);
    final int preparingCount = preparingTickets.length;
    final int readyCount = readyTickets.length;
    // We don't have completedOrdersCount modeled in the projection yet, so we mock it.
    const int completedOrdersCount = 0;
    // Section load calculations
    Map<String, Map<String, dynamic>> sectionStats = {
      'Patio': {'total': 0, 'occupied': 0, 'range': 'T1-T3'},
      'Main Hall': {'total': 0, 'occupied': 0, 'range': 'T4-T6'},
      'Bar Area': {'total': 0, 'occupied': 0, 'range': 'T7-T8'},
      'Garden': {'total': 0, 'occupied': 0, 'range': 'T9+'},
    };

    tablesAsync.whenData((state) {
      final tables = state.tables;
      for (var table in tables) {
        final idNum = int.tryParse(table.id) ?? 1;
        String section;
        if (idNum <= 3) {
          section = 'Patio';
        } else if (idNum <= 6) {
          section = 'Main Hall';
        } else if (idNum <= 8) {
          section = 'Bar Area';
        } else {
          section = 'Garden';
        }

        sectionStats[section]!['total']++;
        if (table.status != TableStatus.available) {
          sectionStats[section]!['occupied']++;
        }
      }
    });

    // Device lock shortcut
    void triggerLock() {
      ref.read(authNotifierProvider.notifier).lockSession();
      context.go('/lock');
    }

    return Scaffold(
      backgroundColor: isDark
          ? AppColors.darkBackground
          : AppColors.lightBackground,
      appBar: AppBar(
        elevation: 0,
        backgroundColor: isDark
            ? AppColors.darkSurface
            : AppColors.lightSurface,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Dashboard',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            if (branch != null)
              Text(
                branch.name,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: isDark
                      ? AppColors.darkTextSecondary
                      : AppColors.lightTextSecondary,
                ),
              ),
          ],
        ),
        actions: [
          // Connection Status
          _buildConnectionBadge(branch, isDark),
          const SizedBox(width: 8),
          // Lock button
          IconButton(
            tooltip: 'Lock Session',
            icon: Icon(
              Icons.lock_outline_rounded,
              color: isDark
                  ? AppColors.darkTextPrimary
                  : AppColors.lightTextPrimary,
            ),
            onPressed: triggerLock,
          ),
          // Logout button
          IconButton(
            tooltip: 'Logout',
            icon: Icon(
              Icons.logout_rounded,
              color: isDark
                  ? AppColors.darkTextPrimary
                  : AppColors.lightTextPrimary,
            ),
            onPressed: () {
              ref.read(authNotifierProvider.notifier).logout();
              context.go('/org-select');
            },
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // High-visibility runtime diagnostics banner
            const DegradedModeCoordinatorWidget(),

            Expanded(
              child: SingleChildScrollView(
                padding: EdgeInsets.all(AppSpacing.md(context)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Welcome Section
                    if (staff != null) ...[
                      _buildWelcomeSection(context, staff, isDark),
                      SizedBox(height: AppSpacing.lg(context)),
                    ],

                    // Quick Stats Grid
                    _buildQuickStatsGrid(
                      context,
                      totalTables: totalTables,
                      occupiedTables: occupiedTables,
                      availableTables: availableTables,
                      alertTables: alertTables,
                      preparingOrders: preparingCount,
                      readyOrders: readyCount,
                      completedOrders: completedOrdersCount,
                      isDark: isDark,
                    ),

                    SizedBox(height: AppSpacing.lg(context)),

                    // Service Alerts Section
                    if (alertList.isNotEmpty) ...[
                      _buildServiceAlertsSection(
                        context,
                        alertList,
                        ref,
                        isDark,
                      ),
                      SizedBox(height: AppSpacing.lg(context)),
                    ],

                    // Section Occupancy
                    _buildSectionOccupancy(context, sectionStats, isDark),

                    SizedBox(height: AppSpacing.lg(context)),

                    // Kitchen Status
                    _buildKitchenStatus(
                      context,
                      preparing: preparingCount,
                      ready: readyCount,
                      completed: completedOrdersCount,
                      isDark: isDark,
                    ),

                    SizedBox(height: AppSpacing.lg(context)),

                    // Activity Feed
                    _buildActivityFeed(context, isDark),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // Welcome Section
  Widget _buildWelcomeSection(
    BuildContext context,
    dynamic staff,
    bool isDark,
  ) {
    final hour = DateTime.now().hour;
    String greeting = 'Good Morning';
    if (hour >= 12 && hour < 17) {
      greeting = 'Good Afternoon';
    } else if (hour >= 17) {
      greeting = 'Good Evening';
    }

    return Container(
      padding: EdgeInsets.all(AppSpacing.md(context)),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.person_outline_rounded,
              color: AppColors.primary,
              size: 32,
            ),
          ),
          SizedBox(width: AppSpacing.md(context)),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$greeting, ${staff.name}',
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                ),
                Text(
                  '${_getRoleDisplayName(staff.role)} • Active Shift',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: isDark
                        ? AppColors.darkTextSecondary
                        : AppColors.lightTextSecondary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms).slideX(begin: -0.1, end: 0);
  }

  // Helper method to get role display name
  String _getRoleDisplayName(dynamic role) {
    if (role == null) return 'Staff';
    final roleName = role.toString().split('.').last;
    switch (roleName) {
      case 'waiter':
        return 'Waiter';
      case 'runner':
        return 'Runner';
      case 'host':
        return 'Host';
      case 'kdsOperator':
        return 'KDS Operator';
      case 'manager':
        return 'Manager';
      default:
        return roleName.toUpperCase();
    }
  }

  // Quick Stats Grid
  Widget _buildQuickStatsGrid(
    BuildContext context, {
    required int totalTables,
    required int occupiedTables,
    required int availableTables,
    required int alertTables,
    required int preparingOrders,
    required int readyOrders,
    required int completedOrders,
    required bool isDark,
  }) {
    final occupancyRate = totalTables > 0
        ? (occupiedTables / totalTables * 100).toInt()
        : 0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Overview',
          style: Theme.of(
            context,
          ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
        ),
        SizedBox(height: AppSpacing.sm(context)),
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 2,
          crossAxisSpacing: AppSpacing.sm(context),
          mainAxisSpacing: AppSpacing.sm(context),
          childAspectRatio: 1.5,
          children: [
            _buildStatCard(
              context,
              title: 'Tables',
              value: '$occupiedTables/$totalTables',
              subtitle: '$occupancyRate% Occupied',
              icon: Icons.table_restaurant_rounded,
              isDark: isDark,
            ),
            _buildStatCard(
              context,
              title: 'Available',
              value: '$availableTables',
              subtitle: 'Ready to seat',
              icon: Icons.event_seat_rounded,
              isDark: isDark,
            ),
            _buildStatCard(
              context,
              title: 'Kitchen',
              value: '$preparingOrders',
              subtitle: 'Orders preparing',
              icon: Icons.restaurant_rounded,
              isDark: isDark,
            ),
            _buildStatCard(
              context,
              title: 'Ready',
              value: '$readyOrders',
              subtitle: 'Ready to serve',
              icon: Icons.check_circle_outline_rounded,
              isDark: isDark,
              highlight: readyOrders > 0,
            ),
          ],
        ),
      ],
    ).animate().fadeIn(delay: 100.ms, duration: 400.ms);
  }

  Widget _buildStatCard(
    BuildContext context, {
    required String title,
    required String value,
    required String subtitle,
    required IconData icon,
    required bool isDark,
    bool highlight = false,
  }) {
    return Container(
      padding: EdgeInsets.all(AppSpacing.md(context)),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: highlight
              ? AppColors.primary
              : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
          width: highlight ? 2 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                title,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: isDark
                      ? AppColors.darkTextSecondary
                      : AppColors.lightTextSecondary,
                  fontWeight: FontWeight.w500,
                ),
              ),
              Icon(
                icon,
                color: highlight
                    ? AppColors.primary
                    : (isDark
                          ? AppColors.darkTextSecondary
                          : AppColors.lightTextSecondary),
                size: 20,
              ),
            ],
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: highlight ? AppColors.primary : null,
                ),
              ),
              Text(
                subtitle,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: isDark
                      ? AppColors.darkTextSecondary
                      : AppColors.lightTextSecondary,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // Service Alerts Section
  Widget _buildServiceAlertsSection(
    BuildContext context,
    List<RestaurantTable> alertList,
    WidgetRef ref,
    bool isDark,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              'Service Alerts',
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
            ),
            SizedBox(width: AppSpacing.sm(context)),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.error.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                '${alertList.length}',
                style: const TextStyle(
                  color: AppColors.error,
                  fontWeight: FontWeight.bold,
                  fontSize: 12,
                ),
              ),
            ),
          ],
        ),
        SizedBox(height: AppSpacing.sm(context)),
        ...alertList.map(
          (table) => Padding(
            padding: EdgeInsets.only(bottom: AppSpacing.sm(context)),
            child: Container(
              padding: EdgeInsets.all(AppSpacing.md(context)),
              decoration: BoxDecoration(
                color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: AppColors.error.withValues(alpha: 0.3),
                  width: 1.5,
                ),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppColors.error.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(
                      Icons.warning_amber_rounded,
                      color: AppColors.error,
                      size: 24,
                    ),
                  ),
                  SizedBox(width: AppSpacing.md(context)),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Table ${table.label}',
                          style: Theme.of(context).textTheme.titleMedium
                              ?.copyWith(fontWeight: FontWeight.bold),
                        ),
                        Text(
                          'Needs attention • Action required',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                color: isDark
                                    ? AppColors.darkTextSecondary
                                    : AppColors.lightTextSecondary,
                              ),
                        ),
                      ],
                    ),
                  ),
                  TextButton(
                    onPressed: () => context.push('/tables/${table.id}'),
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.error,
                    ),
                    child: const Text('View'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    ).animate().fadeIn(delay: 200.ms, duration: 400.ms);
  }

  // Section Occupancy
  Widget _buildSectionOccupancy(
    BuildContext context,
    Map<String, Map<String, dynamic>> sectionStats,
    bool isDark,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Section Occupancy',
          style: Theme.of(
            context,
          ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
        ),
        SizedBox(height: AppSpacing.sm(context)),
        Container(
          padding: EdgeInsets.all(AppSpacing.md(context)),
          decoration: BoxDecoration(
            color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
            ),
          ),
          child: Column(
            children: sectionStats.entries.map((entry) {
              final section = entry.key;
              final stats = entry.value;
              final total = stats['total'] as int;
              final occupied = stats['occupied'] as int;
              final range = stats['range'] as String;
              final percentage = total > 0 ? occupied / total : 0.0;

              return Padding(
                padding: EdgeInsets.only(bottom: AppSpacing.md(context)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              section,
                              style: Theme.of(context).textTheme.titleSmall
                                  ?.copyWith(fontWeight: FontWeight.bold),
                            ),
                            Text(
                              range,
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(
                                    color: isDark
                                        ? AppColors.darkTextSecondary
                                        : AppColors.lightTextSecondary,
                                  ),
                            ),
                          ],
                        ),
                        Text(
                          '$occupied/$total',
                          style: Theme.of(context).textTheme.titleMedium
                              ?.copyWith(fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                    SizedBox(height: AppSpacing.xs(context)),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: percentage,
                        minHeight: 8,
                        backgroundColor: isDark
                            ? AppColors.darkBorder
                            : AppColors.lightBorder,
                        valueColor: AlwaysStoppedAnimation<Color>(
                          percentage > 0.8
                              ? AppColors.error
                              : percentage > 0.5
                              ? AppColors.warning
                              : AppColors.success,
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
        ),
      ],
    ).animate().fadeIn(delay: 300.ms, duration: 400.ms);
  }

  // Kitchen Status
  Widget _buildKitchenStatus(
    BuildContext context, {
    required int preparing,
    required int ready,
    required int completed,
    required bool isDark,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Kitchen Status',
          style: Theme.of(
            context,
          ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
        ),
        SizedBox(height: AppSpacing.sm(context)),
        Container(
          padding: EdgeInsets.all(AppSpacing.md(context)),
          decoration: BoxDecoration(
            color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: _buildKitchenStatusItem(
                  context,
                  icon: Icons.schedule_rounded,
                  label: 'Preparing',
                  value: '$preparing',
                  color: AppColors.warning,
                  isDark: isDark,
                ),
              ),
              Container(
                width: 1,
                height: 40,
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
              ),
              Expanded(
                child: _buildKitchenStatusItem(
                  context,
                  icon: Icons.check_circle_rounded,
                  label: 'Ready',
                  value: '$ready',
                  color: AppColors.success,
                  isDark: isDark,
                ),
              ),
              Container(
                width: 1,
                height: 40,
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
              ),
              Expanded(
                child: _buildKitchenStatusItem(
                  context,
                  icon: Icons.done_all_rounded,
                  label: 'Completed',
                  value: '$completed',
                  color: isDark
                      ? AppColors.darkTextSecondary
                      : AppColors.lightTextSecondary,
                  isDark: isDark,
                ),
              ),
            ],
          ),
        ),
      ],
    ).animate().fadeIn(delay: 400.ms, duration: 400.ms);
  }

  Widget _buildKitchenStatusItem(
    BuildContext context, {
    required IconData icon,
    required String label,
    required String value,
    required Color color,
    required bool isDark,
  }) {
    return Column(
      children: [
        Icon(icon, color: color, size: 28),
        SizedBox(height: AppSpacing.xs(context)),
        Text(
          value,
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
        Text(
          label,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: isDark
                ? AppColors.darkTextSecondary
                : AppColors.lightTextSecondary,
          ),
        ),
      ],
    );
  }

  // Activity Feed
  Widget _buildActivityFeed(BuildContext context, bool isDark) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Recent Activity',
          style: Theme.of(
            context,
          ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
        ),
        SizedBox(height: AppSpacing.sm(context)),
        Container(
          constraints: const BoxConstraints(maxHeight: 300),
          padding: EdgeInsets.all(AppSpacing.md(context)),
          decoration: BoxDecoration(
            color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
            ),
          ),
          child: ListView.separated(
            shrinkWrap: true,
            controller: _scrollController,
            itemCount: _simulatedLogs.length,
            separatorBuilder: (context, index) => Divider(
              height: AppSpacing.sm(context),
              color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
            ),
            itemBuilder: (context, index) {
              final log = _simulatedLogs[index];
              IconData icon = Icons.info_outline_rounded;
              Color iconColor = isDark
                  ? AppColors.darkTextSecondary
                  : AppColors.lightTextSecondary;

              if (log.contains('ready')) {
                icon = Icons.check_circle_outline_rounded;
                iconColor = AppColors.success;
              } else if (log.contains('error') || log.contains('outage')) {
                icon = Icons.error_outline_rounded;
                iconColor = AppColors.error;
              } else if (log.contains('payment')) {
                icon = Icons.payment_rounded;
                iconColor = AppColors.primary;
              }

              return Row(
                children: [
                  Icon(icon, color: iconColor, size: 16),
                  SizedBox(width: AppSpacing.sm(context)),
                  Expanded(
                    child: Text(
                      log,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: isDark
                            ? AppColors.darkTextPrimary
                            : AppColors.lightTextPrimary,
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ],
    ).animate().fadeIn(delay: 500.ms, duration: 400.ms);
  }

  // Connection Badge
  Widget _buildConnectionBadge(dynamic branch, bool isDark) {
    final status = branch?.status;
    Color color = AppColors.success;
    String label = 'Connected';
    IconData icon = Icons.cloud_done_rounded;

    if (status == null) {
      color = AppColors.error;
      label = 'Offline';
      icon = Icons.cloud_off_rounded;
    } else if (status == BranchStatus.busy) {
      color = AppColors.warning;
      label = 'Syncing';
      icon = Icons.cloud_sync_rounded;
    } else if (status == BranchStatus.outage) {
      color = AppColors.error;
      label = 'Offline';
      icon = Icons.cloud_off_rounded;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 16),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
