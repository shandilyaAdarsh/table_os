// lib/core/runtime/optimistic_mutation_manager.dart
//
// OptimisticMutationManager — centralized governance for optimistic updates.
// Manages mutation queueing, rollback, conflict reconciliation, and rebase on invalidations.

import 'package:flutter/foundation.dart';
import 'domain/optimistic_mutation.dart';

/// Result of applying an optimistic mutation.
class MutationResult {
  final bool success;
  final String? errorMessage;
  final DateTime timestamp;

  const MutationResult({
    required this.success,
    this.errorMessage,
    required this.timestamp,
  });

  factory MutationResult.success() {
    return MutationResult(
      success: true,
      timestamp: DateTime.now(),
    );
  }

  factory MutationResult.failure(String error) {
    return MutationResult(
      success: false,
      errorMessage: error,
      timestamp: DateTime.now(),
    );
  }
}

class OptimisticMutationManager {
  final Map<String, OptimisticMutation> _pendingMutations = {};
  final Map<String, OptimisticMutation> _committedMutations = {};
  final Map<String, OptimisticMutation> _failedMutations = {};

  /// Queue an optimistic mutation.
  void queueMutation(OptimisticMutation mutation) {
    if (_pendingMutations.containsKey(mutation.mutationId)) {
      debugPrint('[OptimisticMutationManager] WARNING: Mutation ${mutation.mutationId} already queued');
      return;
    }

    _pendingMutations[mutation.mutationId] = mutation;
    debugPrint('[OptimisticMutationManager] Queued mutation: ${mutation.mutationId} domain=${mutation.domain}');
  }

  /// Mark a mutation as committed (backend acknowledged).
  void commitMutation(String mutationId) {
    final mutation = _pendingMutations.remove(mutationId);
    if (mutation == null) {
      debugPrint('[OptimisticMutationManager] WARNING: Cannot commit unknown mutation: $mutationId');
      return;
    }

    final committed = mutation.copyWith(status: MutationStatus.confirmed);
    _committedMutations[mutationId] = committed;

    debugPrint('[OptimisticMutationManager] Committed mutation: $mutationId');
  }

  /// Rollback a mutation (backend rejected or conflict detected).
  void rollbackMutation(String mutationId, String reason) {
    final mutation = _pendingMutations.remove(mutationId);
    if (mutation == null) {
      debugPrint('[OptimisticMutationManager] WARNING: Cannot rollback unknown mutation: $mutationId');
      return;
    }

    final failed = mutation.copyWith(
      status: MutationStatus.rejected,
      conflictReason: reason,
    );
    _failedMutations[mutationId] = failed;

    debugPrint('[OptimisticMutationManager] Rolled back mutation: $mutationId reason=$reason');
  }

  /// Rebase pending mutations after an invalidation.
  /// This is called when authoritative state changes and pending mutations need reconciliation.
  void rebasePendingMutations(String domainKey) {
    final affectedMutations = _pendingMutations.values
        .where((m) => m.domain.toString() == domainKey)
        .toList();

    if (affectedMutations.isEmpty) {
      debugPrint('[OptimisticMutationManager] No pending mutations to rebase for domain: $domainKey');
      return;
    }

    debugPrint('[OptimisticMutationManager] Rebasing ${affectedMutations.length} mutations for domain: $domainKey');

    // In a real implementation, this would:
    // 1. Fetch the new authoritative state
    // 2. Re-apply pending mutations on top of the new state
    // 3. Detect conflicts and resolve or rollback
    // For now, we just log the rebase operation
    for (final mutation in affectedMutations) {
      debugPrint('[OptimisticMutationManager] Rebasing mutation: ${mutation.mutationId}');
    }
  }

  /// Get all pending mutations for a domain.
  List<OptimisticMutation> getPendingMutations(String domainKey) {
    return _pendingMutations.values
        .where((m) => m.domain.toString() == domainKey)
        .toList();
  }

  /// Check if there are pending mutations for a domain.
  bool hasPendingMutations(String domainKey) {
    return _pendingMutations.values.any((m) => m.domain.toString() == domainKey);
  }

  /// Clear all committed mutations (for cleanup).
  void clearCommittedMutations() {
    final count = _committedMutations.length;
    _committedMutations.clear();
    debugPrint('[OptimisticMutationManager] Cleared $count committed mutations');
  }

  /// Clear all failed mutations (for cleanup).
  void clearFailedMutations() {
    final count = _failedMutations.length;
    _failedMutations.clear();
    debugPrint('[OptimisticMutationManager] Cleared $count failed mutations');
  }

  /// Get statistics for monitoring.
  Map<String, dynamic> getStats() {
    return {
      'pendingCount': _pendingMutations.length,
      'committedCount': _committedMutations.length,
      'failedCount': _failedMutations.length,
      'pendingMutations': _pendingMutations.values.map((m) => {
        'id': m.mutationId,
        'domain': m.domain.toString(),
        'entity': m.entityId,
        'appliedAt': m.appliedAt.toIso8601String(),
      }).toList(),
    };
  }

  /// Reset manager state (for session end).
  void reset() {
    _pendingMutations.clear();
    _committedMutations.clear();
    _failedMutations.clear();
    debugPrint('[OptimisticMutationManager] Reset manager state');
  }
}
