// lib/features/manager/domain/entities/floor_analytics.dart

class FloorAnalyticsSnapshot {
  final int activeTables;
  final int totalTables;
  final double occupancyRate; // 0.0–1.0
  final double avgTicketTimeMinutes;
  final int delayedTableCount;
  final double slaComplianceRate; // 0.0–1.0
  final int pendingPaymentCount;
  final int kitchenBacklogCount; // orders preparing > 15 min
  final DateTime lastAggregatedAt;

  const FloorAnalyticsSnapshot({
    required this.activeTables,
    required this.totalTables,
    required this.occupancyRate,
    required this.avgTicketTimeMinutes,
    required this.delayedTableCount,
    required this.slaComplianceRate,
    required this.pendingPaymentCount,
    required this.kitchenBacklogCount,
    required this.lastAggregatedAt,
  });

  FloorAnalyticsSnapshot copyWith({
    int? activeTables,
    int? totalTables,
    double? occupancyRate,
    double? avgTicketTimeMinutes,
    int? delayedTableCount,
    double? slaComplianceRate,
    int? pendingPaymentCount,
    int? kitchenBacklogCount,
    DateTime? lastAggregatedAt,
  }) {
    return FloorAnalyticsSnapshot(
      activeTables: activeTables ?? this.activeTables,
      totalTables: totalTables ?? this.totalTables,
      occupancyRate: occupancyRate ?? this.occupancyRate,
      avgTicketTimeMinutes: avgTicketTimeMinutes ?? this.avgTicketTimeMinutes,
      delayedTableCount: delayedTableCount ?? this.delayedTableCount,
      slaComplianceRate: slaComplianceRate ?? this.slaComplianceRate,
      pendingPaymentCount: pendingPaymentCount ?? this.pendingPaymentCount,
      kitchenBacklogCount: kitchenBacklogCount ?? this.kitchenBacklogCount,
      lastAggregatedAt: lastAggregatedAt ?? this.lastAggregatedAt,
    );
  }

  factory FloorAnalyticsSnapshot.fromJson(Map<String, dynamic> json) {
    final activeTables = json['activeTables'] as int? ?? 0;
    final totalTables = json['totalTables'] as int? ?? 1;
    return FloorAnalyticsSnapshot(
      activeTables: activeTables,
      totalTables: totalTables,
      occupancyRate: (json['occupancyRate'] as num?)?.toDouble() ??
          (activeTables / totalTables).clamp(0.0, 1.0),
      avgTicketTimeMinutes:
          (json['avgTicketTimeMinutes'] as num?)?.toDouble() ?? 0.0,
      delayedTableCount: json['delayedTableCount'] as int? ?? 0,
      slaComplianceRate:
          (json['slaComplianceRate'] as num?)?.toDouble() ?? 1.0,
      pendingPaymentCount: json['pendingPaymentCount'] as int? ?? 0,
      kitchenBacklogCount: json['kitchenBacklogCount'] as int? ?? 0,
      lastAggregatedAt: json['lastAggregatedAt'] != null
          ? DateTime.parse(json['lastAggregatedAt'] as String)
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'activeTables': activeTables,
      'totalTables': totalTables,
      'occupancyRate': occupancyRate,
      'avgTicketTimeMinutes': avgTicketTimeMinutes,
      'delayedTableCount': delayedTableCount,
      'slaComplianceRate': slaComplianceRate,
      'pendingPaymentCount': pendingPaymentCount,
      'kitchenBacklogCount': kitchenBacklogCount,
      'lastAggregatedAt': lastAggregatedAt.toIso8601String(),
    };
  }

  /// Occupancy percentage clamped and rounded for display.
  int get occupancyPercent => (occupancyRate * 100).round().clamp(0, 100);

  /// SLA compliance percentage clamped and rounded for display.
  int get slaPercent => (slaComplianceRate * 100).round().clamp(0, 100);

  /// True when occupancy is critically high (≥ 90%).
  bool get isAtCapacity => occupancyRate >= 0.90;

  /// True when SLA compliance is below the warning threshold (< 80%).
  bool get isSlaWarning => slaComplianceRate < 0.80;

  /// True when SLA compliance is below the critical threshold (< 60%).
  bool get isSlaCritical => slaComplianceRate < 0.60;

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is FloorAnalyticsSnapshot &&
        other.activeTables == activeTables &&
        other.totalTables == totalTables &&
        other.occupancyRate == occupancyRate &&
        other.avgTicketTimeMinutes == avgTicketTimeMinutes &&
        other.delayedTableCount == delayedTableCount &&
        other.slaComplianceRate == slaComplianceRate &&
        other.pendingPaymentCount == pendingPaymentCount &&
        other.kitchenBacklogCount == kitchenBacklogCount &&
        other.lastAggregatedAt == lastAggregatedAt;
  }

  @override
  int get hashCode => Object.hash(
        activeTables,
        totalTables,
        occupancyRate,
        avgTicketTimeMinutes,
        delayedTableCount,
        slaComplianceRate,
        pendingPaymentCount,
        kitchenBacklogCount,
        lastAggregatedAt,
      );

  @override
  String toString() =>
      'FloorAnalyticsSnapshot(active: $activeTables/$totalTables, '
      'occupancy: $occupancyPercent%, SLA: $slaPercent%, '
      'delayed: $delayedTableCount, backlog: $kitchenBacklogCount)';
}
