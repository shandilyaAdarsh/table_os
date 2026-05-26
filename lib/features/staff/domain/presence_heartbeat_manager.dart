// lib/features/staff/domain/presence_heartbeat_manager.dart
//
// PresenceHeartbeatManager — centralized heartbeat TTL governance.
//
// RULES:
//   - Backend infrastructure determines authoritative presence validity.
//   - Local devices NEVER infer online/offline status independently.
//   - TTL expiry is computed against backend-provided lastHeartbeat timestamps.
//   - Sweep timer runs centrally — not per-device.
//   - Delayed heartbeat tolerance prevents false expiry on slow networks.
//   - Reconnect-aware: TTL sweep is paused during offline/recovery mode.

import 'dart:async';
import 'package:flutter/foundation.dart';

// ━━━━━━━━━━━━━━━━━━━━━━ HEARTBEAT RECORD ━━━━━━━━━━━━━━━━━━━━━━

class _HeartbeatRecord {
  final String staffId;
  final DateTime lastHeartbeat;
  final DateTime registeredAt;

  const _HeartbeatRecord({
    required this.staffId,
    required this.lastHeartbeat,
    required this.registeredAt,
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━ MANAGER ━━━━━━━━━━━━━━━━━━━━━━

class PresenceHeartbeatManager {
  /// How long without a heartbeat before a session is considered expired.
  /// Default: 5 minutes (backend SLA).
  final Duration ttl;

  /// Tolerance window for delayed heartbeats on slow networks.
  /// Events within this window are NOT considered expired.
  final Duration delayedHeartbeatTolerance;

  /// How often the sweep timer runs.
  final Duration sweepInterval;

  final Map<String, _HeartbeatRecord> _heartbeats = {};
  Timer? _sweepTimer;
  void Function(List<String> expiredStaffIds)? _onExpired;
  bool _sweepActive = false;

  PresenceHeartbeatManager({
    this.ttl = const Duration(minutes: 5),
    this.delayedHeartbeatTolerance = const Duration(seconds: 30),
    this.sweepInterval = const Duration(seconds: 30),
  });

  // ━━━━━━━━━━━━━━━━━━━━━━ SWEEP LIFECYCLE ━━━━━━━━━━━━━━━━━━━━━━

  /// Start the centralized TTL sweep timer.
  void startSweep({
    required void Function(List<String> expiredStaffIds) onExpired,
  }) {
    if (_sweepActive) return;

    _onExpired = onExpired;
    _sweepActive = true;
    _sweepTimer = Timer.periodic(sweepInterval, (_) => _runSweep());
    debugPrint(
        '[PresenceHeartbeatManager] Sweep started: '
        'ttl=${ttl.inSeconds}s interval=${sweepInterval.inSeconds}s');
  }

  /// Stop the sweep timer (called on session end or offline mode).
  void stopSweep() {
    _sweepTimer?.cancel();
    _sweepTimer = null;
    _sweepActive = false;
    debugPrint('[PresenceHeartbeatManager] Sweep stopped');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ HEARTBEAT REGISTRATION ━━━━━━━━━━━━━━━━━━━━━━

  /// Register or update a heartbeat for a staff member.
  void registerHeartbeat({
    required String staffId,
    required DateTime lastHeartbeat,
  }) {
    _heartbeats[staffId] = _HeartbeatRecord(
      staffId: staffId,
      lastHeartbeat: lastHeartbeat,
      registeredAt: DateTime.now(),
    );
  }

  /// Remove a heartbeat record (on presence delete or invalidation).
  void removeHeartbeat(String staffId) {
    _heartbeats.remove(staffId);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ TTL VALIDATION ━━━━━━━━━━━━━━━━━━━━━━

  /// Check if a heartbeat timestamp is expired.
  ///
  /// Applies delayed heartbeat tolerance to prevent false expiry
  /// on slow networks or brief connectivity interruptions.
  bool isHeartbeatExpired(DateTime lastHeartbeat) {
    final age = DateTime.now().difference(lastHeartbeat);
    // Apply tolerance: only expire if age exceeds TTL + tolerance window
    return age > (ttl + delayedHeartbeatTolerance);
  }

  /// Check if a specific staff member's session is expired.
  bool isSessionExpired(String staffId) {
    final record = _heartbeats[staffId];
    if (record == null) return true;
    return isHeartbeatExpired(record.lastHeartbeat);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ SWEEP EXECUTION ━━━━━━━━━━━━━━━━━━━━━━

  void _runSweep() {
    final expired = <String>[];

    for (final entry in _heartbeats.entries) {
      if (isHeartbeatExpired(entry.value.lastHeartbeat)) {
        expired.add(entry.key);
        debugPrint(
            '[PresenceHeartbeatManager] TTL expired: staffId=${entry.key} '
            'lastHeartbeat=${entry.value.lastHeartbeat}');
      }
    }

    if (expired.isNotEmpty) {
      // Remove expired records
      for (final staffId in expired) {
        _heartbeats.remove(staffId);
      }
      _onExpired?.call(expired);
      debugPrint(
          '[PresenceHeartbeatManager] Sweep complete: ${expired.length} expired');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ STATS ━━━━━━━━━━━━━━━━━━━━━━

  Map<String, dynamic> getStats() => {
        'activeHeartbeats': _heartbeats.length,
        'sweepActive': _sweepActive,
        'ttlSeconds': ttl.inSeconds,
        'toleranceSeconds': delayedHeartbeatTolerance.inSeconds,
        'sweepIntervalSeconds': sweepInterval.inSeconds,
      };

  void dispose() {
    stopSweep();
    _heartbeats.clear();
  }
}
