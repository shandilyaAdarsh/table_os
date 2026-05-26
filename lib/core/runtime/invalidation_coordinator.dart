// lib/core/runtime/invalidation_coordinator.dart
//
// InvalidationCoordinator — maps runtime events to projection invalidations.
// Determines which projections must be rebuilt when an event arrives.
// Maintains invalidation dependency graph for cascading invalidations.

import 'package:flutter/foundation.dart';
import 'domain/runtime_event.dart';
import 'domain/invalidation_record.dart';

/// Defines which projections are affected by a given event type.
class InvalidationRule {
  final String eventType;
  final Set<String> affectedProjections;
  final bool cascades;

  const InvalidationRule({
    required this.eventType,
    required this.affectedProjections,
    this.cascades = false,
  });
}

class InvalidationCoordinator {
  final Map<String, InvalidationRule> _rules = {};
  final Map<String, Set<String>> _dependencyGraph = {};

  /// Register an invalidation rule for an event type.
  void registerRule(InvalidationRule rule) {
    _rules[rule.eventType] = rule;
    debugPrint('[InvalidationCoordinator] Registered rule: ${rule.eventType} → ${rule.affectedProjections}');
  }

  /// Register projection dependencies (e.g., OrderSummary depends on Orders).
  void registerDependency({
    required String dependent,
    required String dependency,
  }) {
    _dependencyGraph.putIfAbsent(dependency, () => {}).add(dependent);
    debugPrint('[InvalidationCoordinator] Registered dependency: $dependent depends on $dependency');
  }

  /// Compute invalidations for a runtime event.
  List<InvalidationRecord> computeInvalidations(RuntimeEvent event) {
    final eventTypeStr = event.type.toString();
    final rule = _rules[eventTypeStr];
    if (rule == null) {
      debugPrint('[InvalidationCoordinator] No rule for event type: ${event.type}');
      return [];
    }

    final invalidations = <InvalidationRecord>[];
    final processedProjections = <String>{};

    // Direct invalidations from the rule
    for (final projection in rule.affectedProjections) {
      if (!processedProjections.contains(projection)) {
        invalidations.add(InvalidationRecord(
          invalidationId: 'inv_${event.idempotencyKey}_$projection',
          domain: _parseDomain(projection),
          entityIds: const [],
          sourceEventKey: event.idempotencyKey,
          sourceSequenceNumber: event.sequenceNumber,
          createdAt: DateTime.now(),
        ));
        processedProjections.add(projection);

        // Cascade to dependents if enabled
        if (rule.cascades) {
          _cascadeInvalidations(
            projection,
            event,
            invalidations,
            processedProjections,
          );
        }
      }
    }

    debugPrint('[InvalidationCoordinator] Computed ${invalidations.length} invalidations for event ${event.idempotencyKey}');
    return invalidations;
  }

  ProjectionDomain _parseDomain(String projection) {
    switch (projection.toLowerCase()) {
      case 'tables':
        return ProjectionDomain.tables;
      case 'orders':
        return ProjectionDomain.orders;
      case 'waitercalls':
      case 'waiter_calls':
        return ProjectionDomain.waiterCalls;
      case 'reservations':
        return ProjectionDomain.reservations;
      case 'staff':
        return ProjectionDomain.staff;
      case 'alerts':
        return ProjectionDomain.alerts;
      case 'analytics':
        return ProjectionDomain.analytics;
      default:
        return ProjectionDomain.all;
    }
  }

  /// Recursively cascade invalidations through the dependency graph.
  void _cascadeInvalidations(
    String projection,
    RuntimeEvent event,
    List<InvalidationRecord> invalidations,
    Set<String> processedProjections,
  ) {
    final dependents = _dependencyGraph[projection];
    if (dependents == null || dependents.isEmpty) return;

    for (final dependent in dependents) {
      if (!processedProjections.contains(dependent)) {
        invalidations.add(InvalidationRecord(
          invalidationId: 'inv_${event.idempotencyKey}_${dependent}_cascade',
          domain: _parseDomain(dependent),
          entityIds: const [],
          sourceEventKey: event.idempotencyKey,
          sourceSequenceNumber: event.sequenceNumber,
          createdAt: DateTime.now(),
        ));
        processedProjections.add(dependent);

        // Recursively cascade
        _cascadeInvalidations(
          dependent,
          event,
          invalidations,
          processedProjections,
        );
      }
    }
  }

  /// Batch compute invalidations for multiple events.
  List<InvalidationRecord> computeBatchInvalidations(List<RuntimeEvent> events) {
    final allInvalidations = <InvalidationRecord>[];
    final seenProjections = <String>{};

    for (final event in events) {
      final invalidations = computeInvalidations(event);
      for (final inv in invalidations) {
        final projectionKey = inv.domain.toString();
        if (!seenProjections.contains(projectionKey)) {
          allInvalidations.add(inv);
          seenProjections.add(projectionKey);
        }
      }
    }

    debugPrint('[InvalidationCoordinator] Batch computed ${allInvalidations.length} unique invalidations from ${events.length} events');
    return allInvalidations;
  }

  /// Clear all rules and dependencies (for testing or reset).
  void reset() {
    _rules.clear();
    _dependencyGraph.clear();
    debugPrint('[InvalidationCoordinator] Reset all rules and dependencies');
  }
}
