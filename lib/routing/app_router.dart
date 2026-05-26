// lib/routing/app_router.dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../app/observers/routing_observer.dart';
import '../core/theme/app_colors.dart';
import '../features/tables/presentation/screens/table_grid_screen.dart';
import '../features/tables/presentation/screens/table_detail_screen.dart';
import '../features/orders/presentation/screens/order_editor_screen.dart';
import '../features/billing/presentation/screens/billing_payment_screen.dart';
import '../features/kitchen/presentation/screens/kitchen_kds_screen.dart';
import '../features/auth/presentation/state/auth_notifier.dart';
import '../features/auth/presentation/state/auth_state.dart';
import '../features/auth/presentation/screens/splash_screen.dart';
import '../features/auth/presentation/screens/organization_selection_screen.dart';
import '../features/auth/presentation/screens/branch_selection_screen.dart';
import '../features/auth/presentation/screens/staff_login_screen.dart';
import '../features/auth/presentation/screens/shift_start_screen.dart';
import '../features/auth/presentation/screens/session_lock_screen.dart';
import '../features/dashboard/presentation/screens/operational_dashboard_screen.dart';
import '../features/reservations/presentation/screens/reservations_screen.dart';
import '../features/orders/presentation/screens/active_orders_feed_screen.dart';
import '../features/orders/presentation/screens/order_details_screen.dart';
import '../features/orders/presentation/screens/item_level_kitchen_status_screen.dart';
import '../features/tables/presentation/screens/table_split_screen.dart';
import '../features/waiter_calls/presentation/screens/waiter_call_feed_screen.dart';
import '../features/waiter_calls/presentation/screens/waiter_call_details_screen.dart';
import '../features/notifications/presentation/screens/notification_center_screen.dart';
import '../features/kitchen/presentation/screens/ready_orders_feed_screen.dart';
import '../features/kitchen/presentation/screens/delayed_orders_feed_screen.dart';
import '../features/billing/presentation/screens/payment_pending_feed_screen.dart';
import '../features/billing/presentation/screens/receipt_preview_screen.dart';
import '../features/notifications/presentation/state/notifications_provider.dart';
import '../features/waiter_calls/presentation/state/waiter_calls_providers.dart';
// Volume II — Screen imports
import '../features/shift/presentation/screens/shift_dashboard_screen.dart';
import '../features/shift/presentation/screens/shift_close_screen.dart';
import '../features/staff/presentation/screens/staff_presence_screen.dart';
import '../features/realtime/presentation/screens/realtime_status_screen.dart';
import '../features/realtime/presentation/screens/pending_sync_screen.dart';
import '../features/realtime/presentation/screens/operational_recovery_screen.dart';
import '../features/profile/presentation/screens/staff_profile_screen.dart';
import '../features/profile/presentation/screens/device_settings_screen.dart';
import '../features/profile/presentation/screens/runtime_diagnostics_screen.dart';
import '../features/manager/presentation/screens/floor_analytics_screen.dart';
import '../features/manager/presentation/screens/staff_performance_screen.dart';
import '../features/manager/presentation/screens/operational_alerts_screen.dart';
import '../features/realtime/presentation/state/realtime_providers.dart';
import '../features/realtime/domain/entities/realtime_state_model.dart';
import '../core/widgets/realtime_banner.dart';
import '../core/network/realtime_sync_manager.dart';

// Derived provider: count of active (unresolved) waiter calls for badge display
final activeWaiterCallsCountProvider = Provider<int>((ref) {
  final calls = ref.watch(activeWaiterCallsProvider);
  return calls.length;
});



// RouterNotifier acts as a bridge between Riverpod and GoRouter.
// It listens to auth state changes and notifies GoRouter to trigger a redirect.
class RouterNotifier extends ChangeNotifier {
  final Ref _ref;

  RouterNotifier(this._ref) {
    _ref.listen<AuthState>(
      authNotifierProvider,
      (_, next) => notifyListeners(),
    );
    _ref.listen<RealtimeStateModel>(
      realtimeStateProvider,
      (_, next) => notifyListeners(),
    );
  }
}

final routerNotifierProvider = Provider<RouterNotifier>((ref) {
  return RouterNotifier(ref);
});

final routerProvider = Provider<GoRouter>((ref) {
  final notifier = ref.read(routerNotifierProvider);

  return GoRouter(
    initialLocation: '/splash',
    debugLogDiagnostics: true,
    refreshListenable: notifier,
    observers: [
      AppRoutingObserver(),
    ],
    redirect: (context, state) {
      final authState = ref.read(authNotifierProvider);
      final loc = state.uri.path;

      debugPrint('[ROUTER] redirect evaluation: location=$loc, isLocked=${authState.isLocked}, isShiftStarted=${authState.isShiftStarted}, org=${authState.selectedOrg?.name}, branch=${authState.selectedBranch?.name}');

      // If we are on the splash screen, do NOT redirect. Let it perform its bootloader diagnostics.
      if (loc == '/splash') {
        return null;
      }

      // Check for critical realtime connection failure
      final realtimeState = ref.read(realtimeStateProvider);
      if (realtimeState.connectionState == RealtimeConnectionState.critical) {
        if (loc != '/realtime/recovery') {
          return '/realtime/recovery';
        }
        return null;
      }

      // If we recovered and are still on the recovery screen, go back to main screen
      if (loc == '/realtime/recovery') {
        return '/tables';
      }

      // If locked, staff must go to/stay on session lock screen
      if (authState.isLocked) {
        if (loc != '/lock') {
          return '/lock';
        }
        return null;
      }

      // Ensure locked screen is not bypassed when not locked
      if (loc == '/lock' && !authState.isLocked) {
        return '/tables';
      }

      // Main authentication routing state machine
      if (authState.selectedOrg == null) {
        if (loc != '/org-select') {
          return '/org-select';
        }
        return null;
      }

      if (authState.selectedBranch == null) {
        if (loc != '/branch-select' && loc != '/org-select') {
          return '/branch-select';
        }
        return null;
      }

      if (authState.loggedInStaff == null) {
        if (loc != '/login' && loc != '/branch-select' && loc != '/org-select') {
          return '/login';
        }
        return null;
      }

      if (!authState.isShiftStarted) {
        if (loc != '/shift-start' && loc != '/login' && loc != '/branch-select' && loc != '/org-select') {
          return '/shift-start';
        }
        return null;
      }

      // If logged in, shift started, and not locked, block access to auth configuration screens
      final isAuthScreen = loc == '/org-select' ||
          loc == '/branch-select' ||
          loc == '/login' ||
          loc == '/shift-start';

      if (isAuthScreen) {
        return '/tables';
      }

      // Allow access to the target route
      return null;
    },
    routes: [
      GoRoute(
        path: '/splash',
        name: 'splash',
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: '/org-select',
        name: 'org-select',
        builder: (context, state) => const OrganizationSelectionScreen(),
      ),
      GoRoute(
        path: '/branch-select',
        name: 'branch-select',
        builder: (context, state) => const BranchSelectionScreen(),
      ),
      GoRoute(
        path: '/login',
        name: 'login',
        builder: (context, state) => const StaffLoginScreen(),
      ),
      GoRoute(
        path: '/shift-start',
        name: 'shift-start',
        builder: (context, state) => const ShiftStartScreen(),
      ),
      GoRoute(
        path: '/lock',
        name: 'lock',
        builder: (context, state) => const SessionLockScreen(),
      ),
      ShellRoute(
        builder: (context, state, child) {
          return NavigationShellLayout(child: child);
        },
        routes: [
          GoRoute(
            path: '/tables',
            name: 'tables',
            builder: (context, state) => const TableGridScreen(),
          ),
          GoRoute(
            path: '/reservations',
            name: 'reservations',
            builder: (context, state) => const ReservationsScreen(),
          ),
          GoRoute(
            path: '/orders-feed',
            name: 'orders-feed',
            builder: (context, state) => const ActiveOrdersFeedScreen(),
          ),
          GoRoute(
            path: '/kds',
            name: 'kds',
            builder: (context, state) => const KitchenKdsScreen(),
          ),
          GoRoute(
            path: '/dashboard',
            name: 'dashboard',
            builder: (context, state) => const OperationalDashboardScreen(),
          ),
        ],
      ),
      GoRoute(
        path: '/tables/:id',
        name: 'table-detail',
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return TableDetailScreen(tableId: id);
        },
      ),
      GoRoute(
        path: '/tables/:id/edit',
        name: 'order-editor',
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return OrderEditorScreen(tableId: id);
        },
      ),
      GoRoute(
        path: '/tables/:id/pay',
        name: 'billing-payment',
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return BillingPaymentScreen(tableId: id);
        },
      ),
      GoRoute(
        path: '/orders/:id/details',
        name: 'order-details',
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return OrderDetailsScreen(orderId: id);
        },
      ),
      GoRoute(
        path: '/tables/:id/split',
        name: 'table-split',
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return TableSplitScreen(tableId: id);
        },
      ),
      GoRoute(
        path: '/kitchen/status',
        name: 'kitchen-status',
        builder: (context, state) => const ItemLevelKitchenStatusScreen(),
      ),
      GoRoute(
        path: '/waiter-calls',
        name: 'waiter-calls',
        builder: (context, state) => const WaiterCallFeedScreen(),
      ),
      GoRoute(
        path: '/waiter-calls/:id',
        name: 'waiter-call-details',
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return WaiterCallDetailsScreen(callId: id);
        },
      ),
      GoRoute(
        path: '/notifications',
        name: 'notifications',
        builder: (context, state) => const NotificationCenterScreen(),
      ),
      GoRoute(
        path: '/kitchen/ready',
        name: 'kitchen-ready',
        builder: (context, state) => const ReadyOrdersFeedScreen(),
      ),
      GoRoute(
        path: '/kitchen/delayed',
        name: 'kitchen-delayed',
        builder: (context, state) => const DelayedOrdersFeedScreen(),
      ),
      GoRoute(
        path: '/billing/pending',
        name: 'billing-pending',
        builder: (context, state) => const PaymentPendingFeedScreen(),
      ),
      GoRoute(
        path: '/tables/:id/receipt-preview',
        name: 'receipt-preview',
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return ReceiptPreviewScreen(tableId: id);
        },
      ),
      // ── Volume II Routes ──────────────────────────────────────────────
      GoRoute(path: '/shift/dashboard', name: 'shift-dashboard', builder: (context, state) => const ShiftDashboardScreen()),
      GoRoute(path: '/shift/close', name: 'shift-close', builder: (context, state) => const ShiftCloseScreen()),
      GoRoute(path: '/staff/presence', name: 'staff-presence', builder: (context, state) => const StaffPresenceScreen()),
      GoRoute(path: '/realtime/status', name: 'realtime-status', builder: (context, state) => const RealtimeStatusScreen()),
      GoRoute(path: '/realtime/sync-queue', name: 'sync-queue', builder: (context, state) => const PendingSyncScreen()),
      GoRoute(path: '/realtime/recovery', name: 'operational-recovery', builder: (context, state) => const OperationalRecoveryScreen()),
      GoRoute(path: '/profile', name: 'staff-profile', builder: (context, state) => const StaffProfileScreen()),
      GoRoute(path: '/settings', name: 'device-settings', builder: (context, state) => const DeviceSettingsScreen()),
      GoRoute(path: '/diagnostics', name: 'runtime-diagnostics', builder: (context, state) => const RuntimeDiagnosticsScreen()),
      GoRoute(path: '/manager/analytics', name: 'floor-analytics', builder: (context, state) => const FloorAnalyticsScreen()),
      GoRoute(path: '/manager/staff-performance', name: 'staff-performance', builder: (context, state) => const StaffPerformanceScreen()),
      GoRoute(path: '/manager/alerts', name: 'operational-alerts', builder: (context, state) => const OperationalAlertsScreen()),
    ],
  );
});

// NavigationShellLayout is a ConsumerWidget so it can watch live badge counts.
class NavigationShellLayout extends ConsumerWidget {
  final Widget child;

  const NavigationShellLayout({super.key, required this.child});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final location = GoRouterState.of(context).uri.path;

    // Live badge providers
    final unreadNotifCount = ref.watch(unreadNotificationsCountProvider);
    final activeCallCount = ref.watch(activeWaiterCallsCountProvider);
    final realtimeState = ref.watch(realtimeStateProvider);

    int selectedIndex = 0;
    if (location.startsWith('/reservations')) {
      selectedIndex = 1;
    } else if (location.startsWith('/orders-feed')) {
      selectedIndex = 2;
    } else if (location.startsWith('/kds')) {
      selectedIndex = 3;
    } else if (location.startsWith('/dashboard')) {
      selectedIndex = 4;
    }

    RealtimeState mapState(RealtimeConnectionState s) {
      switch (s) {
        case RealtimeConnectionState.connected:
          return RealtimeState.connected;
        case RealtimeConnectionState.reconnecting:
          return RealtimeState.reconnecting;
        case RealtimeConnectionState.replaying:
          return RealtimeState.replaying;
        case RealtimeConnectionState.degraded:
          return RealtimeState.degraded;
        case RealtimeConnectionState.critical:
          return RealtimeState.critical;
      }
    }

    return Scaffold(
      // Persistent top-bar with live notification bell
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(48),
        child: _buildTopActionBar(context, unreadNotifCount, activeCallCount),
      ),
      body: Stack(
        children: [
          child,
          RealtimeBanner(
            state: mapState(realtimeState.connectionState),
            reconnectAttempt: realtimeState.reconnectAttempts,
            onRetry: () {
              ref.read(realtimeSyncManagerProvider).connectLocal();
            },
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: selectedIndex,
        indicatorColor: AppColors.primary.withValues(alpha: 0.15),
        destinations: [
          // Floor Map with live waiter-call badge
          NavigationDestination(
            icon: activeCallCount > 0
                ? Badge(
                    label: Text('$activeCallCount'),
                    backgroundColor: AppColors.error,
                    child: const Icon(Icons.table_restaurant_rounded),
                  )
                : const Icon(Icons.table_restaurant_rounded),
            selectedIcon: const Icon(Icons.table_restaurant_rounded, color: AppColors.primary),
            label: 'Floor Map',
          ),
          const NavigationDestination(
            icon: Icon(Icons.book_online_rounded),
            selectedIcon: Icon(Icons.book_online_rounded, color: AppColors.primary),
            label: 'Reservations',
          ),
          const NavigationDestination(
            icon: Icon(Icons.receipt_long_rounded),
            selectedIcon: Icon(Icons.receipt_long_rounded, color: AppColors.primary),
            label: 'Active Orders',
          ),
          const NavigationDestination(
            icon: Icon(Icons.restaurant_rounded),
            selectedIcon: Icon(Icons.restaurant_rounded, color: AppColors.primary),
            label: 'Kitchen KDS',
          ),
          const NavigationDestination(
            icon: Icon(Icons.dashboard_rounded),
            selectedIcon: Icon(Icons.dashboard_rounded, color: AppColors.primary),
            label: 'Dashboard',
          ),
        ],
        onDestinationSelected: (index) {
          switch (index) {
            case 0:
              context.go('/tables');
              break;
            case 1:
              context.go('/reservations');
              break;
            case 2:
              context.go('/orders-feed');
              break;
            case 3:
              context.go('/kds');
              break;
            case 4:
              context.go('/dashboard');
              break;
          }
        },
      ),
    );
  }

  Widget _buildTopActionBar(
    BuildContext context,
    int unreadNotifCount,
    int activeCallCount,
  ) {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).appBarTheme.backgroundColor ??
            Theme.of(context).scaffoldBackgroundColor,
        border: Border(
          bottom: BorderSide(
            color: Theme.of(context).brightness == Brightness.dark
                ? AppColors.darkBorder
                : AppColors.lightBorder,
            width: 0.5,
          ),
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            // Quick-Access Sheet – Waiter Calls, Kitchen, Billing shortcuts
            IconButton(
              icon: activeCallCount > 0
                  ? Badge(
                      label: Text('$activeCallCount'),
                      backgroundColor: AppColors.error,
                      child: const Icon(Icons.support_agent_rounded),
                    )
                  : const Icon(Icons.support_agent_rounded),
              tooltip: 'Waiter Calls',
              onPressed: () => context.push('/waiter-calls'),
            ),
            // More operational shortcuts via bottom sheet
            IconButton(
              icon: const Icon(Icons.grid_view_rounded),
              tooltip: 'Quick Access',
              onPressed: () => _showQuickAccessSheet(context),
            ),
            // Notification center with unread badge
            IconButton(
              icon: unreadNotifCount > 0
                  ? Badge(
                      label: Text('$unreadNotifCount'),
                      backgroundColor: AppColors.error,
                      child: const Icon(Icons.notifications_rounded),
                    )
                  : const Icon(Icons.notifications_outlined),
              tooltip: 'Notifications',
              onPressed: () => context.push('/notifications'),
            ),
            const SizedBox(width: 4),
          ],
        ),
      ),
    );
  }

  void _showQuickAccessSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.only(left: 4, bottom: 16),
                  child: Text(
                    'Quick Access',
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.w900),
                  ),
                ),
                Row(
                  children: [
                    Expanded(
                      child: _QuickAccessTile(
                        icon: Icons.support_agent_rounded,
                        label: 'Waiter Calls',
                        color: AppColors.primary,
                        onTap: () {
                          Navigator.pop(context);
                          context.push('/waiter-calls');
                        },
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _QuickAccessTile(
                        icon: Icons.delivery_dining_rounded,
                        label: 'Kitchen Ready',
                        color: AppColors.success,
                        onTap: () {
                          Navigator.pop(context);
                          context.push('/kitchen/ready');
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: _QuickAccessTile(
                        icon: Icons.timer_off_rounded,
                        label: 'Delayed Tickets',
                        color: AppColors.error,
                        onTap: () {
                          Navigator.pop(context);
                          context.push('/kitchen/delayed');
                        },
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _QuickAccessTile(
                        icon: Icons.account_balance_wallet_rounded,
                        label: 'Pending Bills',
                        color: AppColors.secondary,
                        onTap: () {
                          Navigator.pop(context);
                          context.push('/billing/pending');
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: _QuickAccessTile(
                        icon: Icons.schedule_rounded,
                        label: 'My Shift',
                        color: AppColors.primary,
                        onTap: () {
                          Navigator.pop(context);
                          context.push('/shift/dashboard');
                        },
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _QuickAccessTile(
                        icon: Icons.groups_rounded,
                        label: 'Staff Presence',
                        color: AppColors.success,
                        onTap: () {
                          Navigator.pop(context);
                          context.push('/staff/presence');
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: _QuickAccessTile(
                        icon: Icons.crisis_alert_rounded,
                        label: 'Alerts',
                        color: AppColors.error,
                        onTap: () {
                          Navigator.pop(context);
                          context.push('/manager/alerts');
                        },
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _QuickAccessTile(
                        icon: Icons.person_rounded,
                        label: 'My Profile',
                        color: AppColors.secondary,
                        onTap: () {
                          Navigator.pop(context);
                          context.push('/profile');
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _QuickAccessTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _QuickAccessTile({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.25)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: 28),
            const SizedBox(height: 8),
            Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: color,
                fontWeight: FontWeight.bold,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

