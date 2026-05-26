// lib/features/manager/presentation/state/manager_providers.dart

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/floor_analytics.dart';
import '../../domain/entities/operational_alert.dart';

// ---------------------------------------------------------------------------
// FloorAnalyticsNotifier
// ---------------------------------------------------------------------------

class FloorAnalyticsNotifier extends AsyncNotifier<FloorAnalyticsSnapshot> {
  @override
  Future<FloorAnalyticsSnapshot> build() async {
    // Simulate a brief async fetch (replace with real repository call).
    await Future<void>.delayed(const Duration(milliseconds: 120));
    return FloorAnalyticsSnapshot(
      activeTables: 14,
      totalTables: 20,
      occupancyRate: 0.70,
      avgTicketTimeMinutes: 18.0,
      delayedTableCount: 3,
      slaComplianceRate: 0.87,
      pendingPaymentCount: 2,
      kitchenBacklogCount: 4,
      lastAggregatedAt: DateTime.now(),
    );
  }

  /// Manually refresh the analytics snapshot.
  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => build());
  }

  /// Apply a partial update (e.g. from a realtime event delta).
  void applyDelta({
    int? activeTables,
    int? delayedTableCount,
    int? pendingPaymentCount,
    int? kitchenBacklogCount,
    double? slaComplianceRate,
  }) {
    final current = state.valueOrNull;
    if (current == null) return;

    final updated = current.copyWith(
      activeTables: activeTables,
      delayedTableCount: delayedTableCount,
      pendingPaymentCount: pendingPaymentCount,
      kitchenBacklogCount: kitchenBacklogCount,
      slaComplianceRate: slaComplianceRate,
      occupancyRate: activeTables != null
          ? (activeTables / current.totalTables).clamp(0.0, 1.0)
          : null,
      lastAggregatedAt: DateTime.now(),
    );
    state = AsyncValue.data(updated);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ RUNTIME INTEGRATION ━━━━━━━━━━━━━━━━━━━━━━

  /// Apply remote analytics delta from backend (called by runtime bridge).
  /// NEVER call this directly from UI code.
  Future<void> applyRemoteAnalyticsDelta(Map<String, dynamic> payload) async {
    debugPrint('[FloorAnalyticsNotifier] Applying remote analytics delta');

    try {
      final snapshot = FloorAnalyticsSnapshot.fromJson(payload);
      state = AsyncValue.data(snapshot);
      debugPrint('[FloorAnalyticsNotifier] Applied analytics delta');
    } catch (e) {
      debugPrint('[FloorAnalyticsNotifier] ERROR applying analytics delta: $e');
    }
  }
}

// ---------------------------------------------------------------------------
// OperationalAlertsNotifier
// ---------------------------------------------------------------------------

class OperationalAlertsNotifier extends StateNotifier<List<OperationalAlert>> {
  OperationalAlertsNotifier() : super(_buildInitialAlerts());

  static List<OperationalAlert> _buildInitialAlerts() {
    final now = DateTime.now();
    return [
      // --- Critical ---
      OperationalAlert(
        alertId: 'alert-001',
        type: AlertType.slaBreached,
        severity: AlertSeverity.critical,
        entityId: 'table-05',
        entityLabel: 'Table 5',
        triggeredAt: now.subtract(const Duration(minutes: 12)),
      ),
      OperationalAlert(
        alertId: 'alert-002',
        type: AlertType.waiterCall,
        severity: AlertSeverity.critical,
        entityId: 'table-09',
        entityLabel: 'Waiter Call — Table 9',
        triggeredAt: now.subtract(const Duration(minutes: 4)),
      ),
      // --- High ---
      OperationalAlert(
        alertId: 'alert-003',
        type: AlertType.delayedOrder,
        severity: AlertSeverity.high,
        entityId: 'order-1038',
        entityLabel: 'Order #1038 — Table 3',
        triggeredAt: now.subtract(const Duration(minutes: 11)),
        assignedStaffId: 'staff-02',
        assignedStaffName: 'Ravi Kumar',
      ),
      OperationalAlert(
        alertId: 'alert-004',
        type: AlertType.slaBreached,
        severity: AlertSeverity.high,
        entityId: 'table-11',
        entityLabel: 'Table 11',
        triggeredAt: now.subtract(const Duration(minutes: 6)),
      ),
      // --- Standard ---
      OperationalAlert(
        alertId: 'alert-005',
        type: AlertType.pendingPayment,
        severity: AlertSeverity.standard,
        entityId: 'table-02',
        entityLabel: 'Table 2 — Payment Pending',
        triggeredAt: now.subtract(const Duration(minutes: 4)),
        assignedStaffId: 'staff-05',
        assignedStaffName: 'Priya Sharma',
      ),
      // --- Acknowledged ---
      OperationalAlert(
        alertId: 'alert-006',
        type: AlertType.waiterCall,
        severity: AlertSeverity.acknowledged,
        entityId: 'table-07',
        entityLabel: 'Waiter Call — Table 7',
        triggeredAt: now.subtract(const Duration(minutes: 8)),
        isAcknowledged: true,
        assignedStaffId: 'staff-01',
        assignedStaffName: 'Aarav Mehta',
      ),
    ];
  }

  /// Acknowledge an alert by id. Moves severity to acknowledged.
  void acknowledgeAlert(String alertId) {
    state = state.map((alert) {
      if (alert.alertId != alertId) return alert;
      return alert.copyWith(
        severity: AlertSeverity.acknowledged,
        isAcknowledged: true,
      );
    }).toList();
  }

  /// Dismiss (remove) an alert permanently.
  void dismissAlert(String alertId) {
    state = state.where((alert) => alert.alertId != alertId).toList();
  }

  /// Add a new incoming alert (e.g. from realtime event).
  void addAlert(OperationalAlert alert) {
    state = [alert, ...state];
  }

  /// Assign a staff member to an alert.
  void assignStaff(String alertId, String staffId, String staffName) {
    state = state.map((alert) {
      if (alert.alertId != alertId) return alert;
      return alert.copyWith(
        assignedStaffId: staffId,
        assignedStaffName: staffName,
      );
    }).toList();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ RUNTIME INTEGRATION ━━━━━━━━━━━━━━━━━━━━━━

  /// Apply remote alert update from backend (called by runtime bridge).
  /// NEVER call this directly from UI code.
  Future<void> applyRemoteAlertUpdate(Map<String, dynamic> payload) async {
    debugPrint('[OperationalAlertsNotifier] Applying remote alert update');

    try {
      final alert = OperationalAlert.fromJson(payload);
      final idx = state.indexWhere((a) => a.alertId == alert.alertId);

      if (idx != -1) {
        final next = List<OperationalAlert>.from(state);
        next[idx] = alert;
        state = next;
      } else {
        state = [alert, ...state];
      }

      debugPrint('[OperationalAlertsNotifier] Applied alert update: ${alert.alertId}');
    } catch (e) {
      debugPrint('[OperationalAlertsNotifier] ERROR applying alert update: $e');
    }
  }

  /// Apply remote alert dismissal from backend (called by runtime bridge).
  /// NEVER call this directly from UI code.
  Future<void> applyRemoteAlertDismissed(String alertId) async {
    debugPrint('[OperationalAlertsNotifier] Applying remote alert dismissal: $alertId');
    state = state.where((a) => a.alertId != alertId).toList();
    debugPrint('[OperationalAlertsNotifier] Dismissed alert: $alertId');
  }
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

/// Floor analytics async provider.
final floorAnalyticsProvider =
    AsyncNotifierProvider<FloorAnalyticsNotifier, FloorAnalyticsSnapshot>(
  FloorAnalyticsNotifier.new,
);

/// Operational alerts state provider.
final operationalAlertsProvider =
    StateNotifierProvider<OperationalAlertsNotifier, List<OperationalAlert>>(
  (ref) => OperationalAlertsNotifier(),
);

/// Only alerts with critical severity.
final criticalAlertsProvider = Provider<List<OperationalAlert>>((ref) {
  final alerts = ref.watch(operationalAlertsProvider);
  return alerts.where((a) => a.severity == AlertSeverity.critical).toList();
});

/// Total count of non-acknowledged alerts.
final totalAlertCountProvider = Provider<int>((ref) {
  final alerts = ref.watch(operationalAlertsProvider);
  return alerts.where((a) => !a.isAcknowledged).length;
});
