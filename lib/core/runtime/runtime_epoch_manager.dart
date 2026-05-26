// lib/core/runtime/runtime_epoch_manager.dart
//
// RuntimeEpochManager — manages the lifecycle of runtime epochs.
// Issues new epochs on session start, invalidates on session end or backend signal.
// Rejects events carrying stale epochs.

import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import 'domain/runtime_epoch.dart';

class RuntimeEpochManager {
  RuntimeEpoch _currentEpoch = RuntimeEpoch.none;
  final _uuid = const Uuid();

  RuntimeEpoch get currentEpoch => _currentEpoch;

  bool get hasActiveEpoch => !_currentEpoch.isNone && _currentEpoch.isValid;

  /// Issue a new epoch when a session starts (org + branch + staff + shift).
  RuntimeEpoch issueEpoch({
    required String branchId,
    required String staffId,
  }) {
    final epochId = _uuid.v4();
    _currentEpoch = RuntimeEpoch(
      epochId: epochId,
      branchId: branchId,
      staffId: staffId,
      issuedAt: DateTime.now(),
      isValid: true,
    );

    debugPrint('[RuntimeEpochManager] Issued new epoch: $epochId for branch=$branchId staff=$staffId');
    return _currentEpoch;
  }

  /// Invalidate the current epoch (session end, logout, backend signal).
  void invalidateCurrentEpoch() {
    if (_currentEpoch.isNone) return;

    debugPrint('[RuntimeEpochManager] Invalidating epoch: ${_currentEpoch.epochId}');
    _currentEpoch = _currentEpoch.invalidate();
  }

  /// Reset to no epoch (pre-auth state).
  void reset() {
    debugPrint('[RuntimeEpochManager] Reset to no epoch');
    _currentEpoch = RuntimeEpoch.none;
  }

  /// Validate if an event's epoch matches the current active epoch.
  bool isEventEpochValid(String eventEpochId) {
    if (!hasActiveEpoch) {
      debugPrint('[RuntimeEpochManager] No active epoch — rejecting event with epoch=$eventEpochId');
      return false;
    }

    if (eventEpochId != _currentEpoch.epochId) {
      debugPrint('[RuntimeEpochManager] Epoch mismatch: current=${_currentEpoch.epochId} event=$eventEpochId — rejecting');
      return false;
    }

    return true;
  }
}
