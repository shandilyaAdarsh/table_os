// lib/core/runtime/domain/runtime_epoch.dart
//
// RuntimeEpoch — immutable value object that identifies a unique runtime session.
// Every session (org + branch + staff + shift) gets a new epoch ID.
// Events carrying a stale epoch are rejected before they reach any projection.

import 'package:equatable/equatable.dart';

class RuntimeEpoch extends Equatable {
  final String epochId;
  final String branchId;
  final String staffId;
  final DateTime issuedAt;
  final bool isValid;

  const RuntimeEpoch({
    required this.epochId,
    required this.branchId,
    required this.staffId,
    required this.issuedAt,
    this.isValid = true,
  });

  /// Null-object sentinel — used before a real epoch is established.
  static final RuntimeEpoch none = RuntimeEpoch(
    epochId: '__none__',
    branchId: '__none__',
    staffId: '__none__',
    issuedAt: DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
    isValid: false,
  );

  bool get isNone => epochId == '__none__';

  RuntimeEpoch invalidate() => RuntimeEpoch(
        epochId: epochId,
        branchId: branchId,
        staffId: staffId,
        issuedAt: issuedAt,
        isValid: false,
      );

  @override
  List<Object?> get props => [epochId, branchId, staffId, issuedAt, isValid];

  @override
  String toString() =>
      'RuntimeEpoch(id: $epochId, branch: $branchId, staff: $staffId, valid: $isValid)';
}
