// lib/core/runtime/branch_isolation_resolver.dart
//
// BranchIsolationResolver — enforces branch-scoped runtime isolation.
// Prevents cross-branch state leakage and ensures branch-safe event routing.

import 'package:flutter/foundation.dart';
import 'domain/runtime_event.dart';

/// Represents a branch-isolated runtime container.
class BranchRuntimeContainer {
  final String branchId;
  final String organizationId;
  final DateTime createdAt;
  final Map<String, dynamic> metadata;

  const BranchRuntimeContainer({
    required this.branchId,
    required this.organizationId,
    required this.createdAt,
    this.metadata = const {},
  });
}

class BranchIsolationResolver {
  String? _activeBranchId;
  final Map<String, BranchRuntimeContainer> _containers = {};

  /// Get the currently active branch ID.
  String? get activeBranchId => _activeBranchId;

  /// Check if a branch is currently active.
  bool get hasBranchActive => _activeBranchId != null;

  /// Activate a branch runtime container.
  void activateBranch({
    required String branchId,
    required String organizationId,
    Map<String, dynamic> metadata = const {},
  }) {
    debugPrint('[BranchIsolationResolver] Activating branch: $branchId');

    _activeBranchId = branchId;

    if (!_containers.containsKey(branchId)) {
      _containers[branchId] = BranchRuntimeContainer(
        branchId: branchId,
        organizationId: organizationId,
        createdAt: DateTime.now(),
        metadata: metadata,
      );
      debugPrint('[BranchIsolationResolver] Created new container for branch: $branchId');
    }
  }

  /// Deactivate the current branch.
  void deactivateBranch() {
    if (_activeBranchId == null) {
      debugPrint('[BranchIsolationResolver] No active branch to deactivate');
      return;
    }

    debugPrint('[BranchIsolationResolver] Deactivating branch: $_activeBranchId');
    _activeBranchId = null;
  }

  /// Validate if an event belongs to the active branch.
  bool isEventBranchValid(RuntimeEvent event) {
    if (_activeBranchId == null) {
      debugPrint('[BranchIsolationResolver] REJECTED: No active branch');
      return false;
    }

    if (event.branchId != _activeBranchId) {
      debugPrint('[BranchIsolationResolver] REJECTED: Event branch ${event.branchId} != active branch $_activeBranchId');
      return false;
    }

    return true;
  }

  /// Validate if a projection key belongs to the active branch.
  bool isProjectionBranchValid(String projectionKey, String branchId) {
    if (_activeBranchId == null) {
      debugPrint('[BranchIsolationResolver] REJECTED: No active branch for projection: $projectionKey');
      return false;
    }

    if (branchId != _activeBranchId) {
      debugPrint('[BranchIsolationResolver] REJECTED: Projection branch $branchId != active branch $_activeBranchId');
      return false;
    }

    return true;
  }

  /// Get the container for a specific branch.
  BranchRuntimeContainer? getContainer(String branchId) {
    return _containers[branchId];
  }

  /// Get the active branch container.
  BranchRuntimeContainer? getActiveContainer() {
    if (_activeBranchId == null) return null;
    return _containers[_activeBranchId];
  }

  /// Remove a branch container (for cleanup).
  void removeContainer(String branchId) {
    _containers.remove(branchId);
    debugPrint('[BranchIsolationResolver] Removed container for branch: $branchId');

    if (_activeBranchId == branchId) {
      _activeBranchId = null;
      debugPrint('[BranchIsolationResolver] Deactivated removed branch');
    }
  }

  /// Reset all branch isolation state.
  void reset() {
    _activeBranchId = null;
    _containers.clear();
    debugPrint('[BranchIsolationResolver] Reset all branch isolation state');
  }

  /// Get statistics for monitoring.
  Map<String, dynamic> getStats() {
    return {
      'activeBranchId': _activeBranchId,
      'containerCount': _containers.length,
      'containers': _containers.keys.toList(),
    };
  }
}
