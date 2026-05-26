// lib/core/runtime/domain/invalidation_record.dart
//
// InvalidationRecord — describes which projection(s) must be rebuilt
// as a result of a RuntimeEvent. The InvalidationCoordinator produces
// these; the ProjectionRebuildEngine consumes them.

import 'package:equatable/equatable.dart';

/// Which projection store is being invalidated.
enum ProjectionDomain {
  tables,
  orders,
  waiterCalls,
  reservations,
  staff,
  alerts,
  analytics,
  all,
}

class InvalidationRecord extends Equatable {
  final String invalidationId;
  final ProjectionDomain domain;

  /// Specific entity IDs to invalidate. Empty = invalidate entire domain.
  final List<String> entityIds;

  /// The event that triggered this invalidation.
  final String sourceEventKey;
  final int sourceSequenceNumber;

  final DateTime createdAt;

  const InvalidationRecord({
    required this.invalidationId,
    required this.domain,
    required this.entityIds,
    required this.sourceEventKey,
    required this.sourceSequenceNumber,
    required this.createdAt,
  });

  bool get isFullDomainInvalidation => entityIds.isEmpty;

  @override
  List<Object?> get props => [invalidationId, domain, entityIds, sourceEventKey];

  @override
  String toString() =>
      'InvalidationRecord(domain: $domain, entities: $entityIds, seq: $sourceSequenceNumber)';
}
