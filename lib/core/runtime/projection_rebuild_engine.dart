// lib/core/runtime/projection_rebuild_engine.dart
//
// ProjectionRebuildEngine — deterministic projection reconstruction.
// Rebuilds projections from authoritative runtime state when invalidations occur.
// Ensures replay-safe, dependency-aware, and deterministic rebuilding.

import 'package:flutter/foundation.dart';
import 'domain/invalidation_record.dart';

/// Callback type for projection rebuilders.
typedef ProjectionRebuilder = Future<void> Function();

/// Represents a registered projection with its rebuild logic.
class ProjectionRegistration {
  final String projectionKey;
  final ProjectionRebuilder rebuilder;
  final Set<String> dependencies;
  final int priority;

  ProjectionRegistration({
    required this.projectionKey,
    required this.rebuilder,
    this.dependencies = const {},
    this.priority = 0,
  });
}

class ProjectionRebuildEngine {
  final Map<String, ProjectionRegistration> _registrations = {};
  final Set<String> _rebuildingProjections = {};
  final Map<String, DateTime> _lastRebuildTimes = {};

  /// Register a projection with its rebuild logic.
  void registerProjection(ProjectionRegistration registration) {
    _registrations[registration.projectionKey] = registration;
    debugPrint('[ProjectionRebuildEngine] Registered projection: ${registration.projectionKey}');
  }

  /// Unregister a projection.
  void unregisterProjection(String projectionKey) {
    _registrations.remove(projectionKey);
    _rebuildingProjections.remove(projectionKey);
    _lastRebuildTimes.remove(projectionKey);
    debugPrint('[ProjectionRebuildEngine] Unregistered projection: $projectionKey');
  }

  /// Trigger a full rebuild of all registered projections.
  Future<void> triggerFullRebuild() async {
    debugPrint('[ProjectionRebuildEngine] Triggering FULL rebuild of all projections');
    final allKeys = _registrations.keys.toSet();
    final rebuildOrder = _resolveRebuildOrder(allKeys);
    
    for (final projectionKey in rebuildOrder) {
      await _rebuildProjection(projectionKey);
    }
  }

  /// Rebuild projections based on invalidation records.
  Future<void> rebuildProjections(List<InvalidationRecord> invalidations) async {
    if (invalidations.isEmpty) return;

    debugPrint('[ProjectionRebuildEngine] Starting rebuild for ${invalidations.length} invalidations');

    // Extract unique projection keys (domain names)
    final projectionKeys = invalidations.map((inv) => inv.domain.toString()).toSet();

    // Resolve dependencies and determine rebuild order
    final rebuildOrder = _resolveRebuildOrder(projectionKeys);

    debugPrint('[ProjectionRebuildEngine] Rebuild order: $rebuildOrder');

    // Execute rebuilds in order
    for (final projectionKey in rebuildOrder) {
      await _rebuildProjection(projectionKey);
    }

    debugPrint('[ProjectionRebuildEngine] Completed rebuild for ${rebuildOrder.length} projections');
  }

  /// Rebuild a single projection.
  Future<void> _rebuildProjection(String projectionKey) async {
    final registration = _registrations[projectionKey];
    if (registration == null) {
      debugPrint('[ProjectionRebuildEngine] WARNING: No registration for projection: $projectionKey');
      return;
    }

    // Prevent concurrent rebuilds of the same projection
    if (_rebuildingProjections.contains(projectionKey)) {
      debugPrint('[ProjectionRebuildEngine] SKIP: Projection $projectionKey is already rebuilding');
      return;
    }

    _rebuildingProjections.add(projectionKey);

    try {
      final startTime = DateTime.now();
      debugPrint('[ProjectionRebuildEngine] Rebuilding projection: $projectionKey');

      await registration.rebuilder();

      final duration = DateTime.now().difference(startTime);
      _lastRebuildTimes[projectionKey] = DateTime.now();

      debugPrint('[ProjectionRebuildEngine] Rebuilt projection: $projectionKey in ${duration.inMilliseconds}ms');
    } catch (e, stackTrace) {
      debugPrint('[ProjectionRebuildEngine] ERROR rebuilding projection $projectionKey: $e');
      debugPrint('Stack trace: $stackTrace');
    } finally {
      _rebuildingProjections.remove(projectionKey);
    }
  }

  /// Resolve the correct rebuild order based on dependencies.
  List<String> _resolveRebuildOrder(Set<String> projectionKeys) {
    final order = <String>[];
    final visited = <String>{};
    final visiting = <String>{};

    void visit(String key) {
      if (visited.contains(key)) return;
      if (visiting.contains(key)) {
        debugPrint('[ProjectionRebuildEngine] WARNING: Circular dependency detected for $key');
        return;
      }

      visiting.add(key);

      final registration = _registrations[key];
      if (registration != null) {
        // Visit dependencies first
        for (final dep in registration.dependencies) {
          if (projectionKeys.contains(dep) || _registrations.containsKey(dep)) {
            visit(dep);
          }
        }
      }

      visiting.remove(key);
      visited.add(key);
      order.add(key);
    }

    // Sort by priority first, then visit
    final sortedKeys = projectionKeys.toList()
      ..sort((a, b) {
        final priorityA = _registrations[a]?.priority ?? 0;
        final priorityB = _registrations[b]?.priority ?? 0;
        return priorityB.compareTo(priorityA); // Higher priority first
      });

    for (final key in sortedKeys) {
      visit(key);
    }

    return order;
  }

  /// Force rebuild all registered projections (for full resync).
  Future<void> rebuildAll() async {
    debugPrint('[ProjectionRebuildEngine] Force rebuilding all projections');
    final allKeys = _registrations.keys.toSet();
    final rebuildOrder = _resolveRebuildOrder(allKeys);

    for (final key in rebuildOrder) {
      await _rebuildProjection(key);
    }

    debugPrint('[ProjectionRebuildEngine] Completed full rebuild');
  }

  /// Get rebuild statistics.
  Map<String, dynamic> getStats() {
    return {
      'registeredProjections': _registrations.length,
      'currentlyRebuilding': _rebuildingProjections.length,
      'lastRebuildTimes': _lastRebuildTimes,
    };
  }

  /// Reset engine state.
  void reset() {
    _registrations.clear();
    _rebuildingProjections.clear();
    _lastRebuildTimes.clear();
    debugPrint('[ProjectionRebuildEngine] Reset engine state');
  }
}
