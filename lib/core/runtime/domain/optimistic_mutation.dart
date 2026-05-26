// lib/core/runtime/domain/optimistic_mutation.dart
//
// OptimisticMutation — represents a locally-applied mutation that has not yet
// been confirmed by the backend. The OptimisticMutationManager tracks these
// and rolls them back if the backend rejects or supersedes them.

import 'package:equatable/equatable.dart';

enum MutationStatus {
  pending,   // Applied locally, awaiting backend confirmation
  confirmed, // Backend confirmed — safe to discard
  rejected,  // Backend rejected — must roll back
  superseded, // A newer backend event overwrote this — discard without rollback
}

enum MutationDomain { table, order, waiterCall }

class OptimisticMutation extends Equatable {
  final String mutationId;
  final MutationDomain domain;
  final String entityId;
  final MutationStatus status;

  /// The state BEFORE the mutation — used for rollback.
  final Map<String, dynamic> previousSnapshot;

  /// The state AFTER the mutation — what was applied locally.
  final Map<String, dynamic> optimisticSnapshot;

  final DateTime appliedAt;
  final String? conflictReason;

  const OptimisticMutation({
    required this.mutationId,
    required this.domain,
    required this.entityId,
    required this.status,
    required this.previousSnapshot,
    required this.optimisticSnapshot,
    required this.appliedAt,
    this.conflictReason,
  });

  OptimisticMutation copyWith({
    MutationStatus? status,
    String? conflictReason,
  }) {
    return OptimisticMutation(
      mutationId: mutationId,
      domain: domain,
      entityId: entityId,
      status: status ?? this.status,
      previousSnapshot: previousSnapshot,
      optimisticSnapshot: optimisticSnapshot,
      appliedAt: appliedAt,
      conflictReason: conflictReason ?? this.conflictReason,
    );
  }

  bool get isPending => status == MutationStatus.pending;
  bool get needsRollback => status == MutationStatus.rejected;

  @override
  List<Object?> get props => [mutationId, domain, entityId, status];

  @override
  String toString() =>
      'OptimisticMutation(id: $mutationId, domain: $domain, entity: $entityId, status: $status)';
}
