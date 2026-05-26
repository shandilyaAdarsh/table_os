// lib/features/manager/domain/entities/operational_alert.dart

enum AlertType {
  slaBreached,
  waiterCall,
  delayedOrder,
  pendingPayment,
}

enum AlertSeverity {
  critical,
  high,
  standard,
  acknowledged,
}

class OperationalAlert {
  final String alertId;
  final AlertType type;
  final AlertSeverity severity;
  final String entityId;
  final String entityLabel; // e.g. 'Table 7', 'Waiter Call - Table 3'
  final DateTime triggeredAt;
  final String? assignedStaffId;
  final String? assignedStaffName;
  final bool isAcknowledged;

  const OperationalAlert({
    required this.alertId,
    required this.type,
    required this.severity,
    required this.entityId,
    required this.entityLabel,
    required this.triggeredAt,
    this.assignedStaffId,
    this.assignedStaffName,
    this.isAcknowledged = false,
  });

  OperationalAlert copyWith({
    String? alertId,
    AlertType? type,
    AlertSeverity? severity,
    String? entityId,
    String? entityLabel,
    DateTime? triggeredAt,
    String? assignedStaffId,
    String? assignedStaffName,
    bool? isAcknowledged,
    bool clearAssignedStaff = false,
  }) {
    return OperationalAlert(
      alertId: alertId ?? this.alertId,
      type: type ?? this.type,
      severity: severity ?? this.severity,
      entityId: entityId ?? this.entityId,
      entityLabel: entityLabel ?? this.entityLabel,
      triggeredAt: triggeredAt ?? this.triggeredAt,
      assignedStaffId: clearAssignedStaff ? null : assignedStaffId ?? this.assignedStaffId,
      assignedStaffName:
          clearAssignedStaff ? null : assignedStaffName ?? this.assignedStaffName,
      isAcknowledged: isAcknowledged ?? this.isAcknowledged,
    );
  }

  factory OperationalAlert.fromJson(Map<String, dynamic> json) {
    return OperationalAlert(
      alertId: json['alertId'] as String,
      type: AlertType.values.firstWhere(
        (e) => e.name == json['type'],
        orElse: () => AlertType.slaBreached,
      ),
      severity: AlertSeverity.values.firstWhere(
        (e) => e.name == json['severity'],
        orElse: () => AlertSeverity.standard,
      ),
      entityId: json['entityId'] as String,
      entityLabel: json['entityLabel'] as String,
      triggeredAt: DateTime.parse(json['triggeredAt'] as String),
      assignedStaffId: json['assignedStaffId'] as String?,
      assignedStaffName: json['assignedStaffName'] as String?,
      isAcknowledged: json['isAcknowledged'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'alertId': alertId,
      'type': type.name,
      'severity': severity.name,
      'entityId': entityId,
      'entityLabel': entityLabel,
      'triggeredAt': triggeredAt.toIso8601String(),
      'assignedStaffId': assignedStaffId,
      'assignedStaffName': assignedStaffName,
      'isAcknowledged': isAcknowledged,
    };
  }

  Duration get elapsed => DateTime.now().difference(triggeredAt);

  String get elapsedLabel {
    final m = elapsed.inMinutes;
    if (m < 1) return '< 1 min ago';
    return '$m min ago';
  }

  /// Human-readable type label.
  String get typeLabel {
    switch (type) {
      case AlertType.slaBreached:
        return 'SLA Breached';
      case AlertType.waiterCall:
        return 'Waiter Call';
      case AlertType.delayedOrder:
        return 'Delayed Order';
      case AlertType.pendingPayment:
        return 'Pending Payment';
    }
  }

  bool get isCritical => severity == AlertSeverity.critical;
  bool get isHigh => severity == AlertSeverity.high;
  bool get isStandard => severity == AlertSeverity.standard;

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is OperationalAlert &&
        other.alertId == alertId &&
        other.type == type &&
        other.severity == severity &&
        other.entityId == entityId &&
        other.entityLabel == entityLabel &&
        other.triggeredAt == triggeredAt &&
        other.assignedStaffId == assignedStaffId &&
        other.assignedStaffName == assignedStaffName &&
        other.isAcknowledged == isAcknowledged;
  }

  @override
  int get hashCode => Object.hash(
        alertId,
        type,
        severity,
        entityId,
        entityLabel,
        triggeredAt,
        assignedStaffId,
        assignedStaffName,
        isAcknowledged,
      );

  @override
  String toString() =>
      'OperationalAlert(id: $alertId, type: $type, severity: $severity, '
      'entity: $entityLabel, elapsed: $elapsedLabel, ack: $isAcknowledged)';
}
