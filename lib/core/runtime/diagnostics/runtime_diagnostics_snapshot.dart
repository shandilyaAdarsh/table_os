// lib/core/runtime/diagnostics/runtime_diagnostics_snapshot.dart
//
// RuntimeDiagnosticsSnapshot — immutable point-in-time capture of all
// observable runtime state across every layer.
//
// LAYERS COVERED:
//   Transport   — websocket health, reconnect attempts, message throughput
//   Runtime     — epoch state, sequence validation, dedup counters
//   Projection  — rebuild backlog, stale projections, last rebuild times
//   KDS         — kitchen runtime mode, ticket queue depth, recovery state
//   Presence    — heartbeat sweep state, active sessions, invalidation log
//   Mutations   — optimistic queue depth, pending ack count
//   Sync Queue  — pending ops, failed ops, inflight ops
//
// This snapshot is the ONLY data source for the diagnostics UI.
// It is produced by RuntimeDiagnosticsCoordinator and published via
// OperationalHealthPublisher.

import 'package:equatable/equatable.dart';
import '../../../features/kitchen/domain/kitchen_runtime_coordinator.dart';

// ━━━━━━━━━━━━━━━━━━━━━━ TRANSPORT HEALTH ━━━━━━━━━━━━━━━━━━━━━━

enum TransportHealthStatus {
  /// Fully connected, events flowing normally.
  healthy,

  /// Reconnecting — backoff in progress.
  reconnecting,

  /// Replay in progress after reconnect.
  replaying,

  /// Degraded — connected but high latency or partial delivery.
  degraded,

  /// Critical — max retries exhausted, manual intervention required.
  critical,

  /// Disconnected — no active transport.
  disconnected,
}

class TransportHealthSnapshot extends Equatable {
  final TransportHealthStatus status;
  final int reconnectAttempts;
  final int maxReconnectAttempts;
  final int messagesSent;
  final int messagesReceived;
  final int lastPingMs;
  final int p50LatencyMs;
  final int p95LatencyMs;
  final int p99LatencyMs;
  final DateTime? lastConnectedAt;
  final DateTime? degradedSince;
  final String? errorMessage;

  const TransportHealthSnapshot({
    required this.status,
    required this.reconnectAttempts,
    required this.maxReconnectAttempts,
    required this.messagesSent,
    required this.messagesReceived,
    required this.lastPingMs,
    required this.p50LatencyMs,
    required this.p95LatencyMs,
    required this.p99LatencyMs,
    this.lastConnectedAt,
    this.degradedSince,
    this.errorMessage,
  });

  bool get isHealthy => status == TransportHealthStatus.healthy;
  bool get isReplaying => status == TransportHealthStatus.replaying;
  bool get isDegraded => status == TransportHealthStatus.degraded;
  bool get isCritical => status == TransportHealthStatus.critical;
  bool get isReconnecting => status == TransportHealthStatus.reconnecting;

  @override
  List<Object?> get props => [
        status, reconnectAttempts, messagesSent, messagesReceived,
        lastPingMs, p50LatencyMs, p95LatencyMs, p99LatencyMs,
      ];
}

// ━━━━━━━━━━━━━━━━━━━━━━ RUNTIME EPOCH DIAGNOSTICS ━━━━━━━━━━━━━━━━━━━━━━

class EpochDiagnosticsSnapshot extends Equatable {
  final String epochId;
  final String branchId;
  final String staffId;
  final bool isValid;
  final DateTime issuedAt;
  final bool hasActiveEpoch;

  const EpochDiagnosticsSnapshot({
    required this.epochId,
    required this.branchId,
    required this.staffId,
    required this.isValid,
    required this.issuedAt,
    required this.hasActiveEpoch,
  });

  String get epochAge {
    final age = DateTime.now().difference(issuedAt);
    if (age.inHours > 0) return '${age.inHours}h ${age.inMinutes.remainder(60)}m';
    if (age.inMinutes > 0) return '${age.inMinutes}m ${age.inSeconds.remainder(60)}s';
    return '${age.inSeconds}s';
  }

  @override
  List<Object?> get props => [epochId, branchId, staffId, isValid, issuedAt];
}

// ━━━━━━━━━━━━━━━━━━━━━━ SEQUENCE VALIDATION DIAGNOSTICS ━━━━━━━━━━━━━━━━━━━━━━

class SequenceDiagnosticsSnapshot extends Equatable {
  final int expectedSequence;
  final int processedEventCount;
  final int duplicatesRejected;
  final int gapsDetected;
  final int staleEventsRejected;
  final String branchId;

  const SequenceDiagnosticsSnapshot({
    required this.expectedSequence,
    required this.processedEventCount,
    required this.duplicatesRejected,
    required this.gapsDetected,
    required this.staleEventsRejected,
    required this.branchId,
  });

  @override
  List<Object?> get props => [
        expectedSequence, processedEventCount, duplicatesRejected,
        gapsDetected, staleEventsRejected, branchId,
      ];
}

// ━━━━━━━━━━━━━━━━━━━━━━ PROJECTION DIAGNOSTICS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class ProjectionDiagnosticsSnapshot extends Equatable {
  final int registeredProjections;
  final int currentlyRebuilding;
  final int staleProjections;
  final Map<String, DateTime> lastRebuildTimes;

  const ProjectionDiagnosticsSnapshot({
    required this.registeredProjections,
    required this.currentlyRebuilding,
    required this.staleProjections,
    required this.lastRebuildTimes,
  });

  bool get hasBacklog => currentlyRebuilding > 0;
  bool get hasStale => staleProjections > 0;

  @override
  List<Object?> get props => [
        registeredProjections, currentlyRebuilding, staleProjections,
      ];
}

// ━━━━━━━━━━━━━━━━━━━━━━ KDS DIAGNOSTICS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class KdsDiagnosticsSnapshot extends Equatable {
  final KitchenRuntimeMode mode;
  final int activeTickets;
  final int totalProjections;
  final int staleProjections;
  final int trackedTickets;
  final int processedEventCount;
  final String? activeBranchId;
  final String? activeEpochId;

  const KdsDiagnosticsSnapshot({
    required this.mode,
    required this.activeTickets,
    required this.totalProjections,
    required this.staleProjections,
    required this.trackedTickets,
    required this.processedEventCount,
    this.activeBranchId,
    this.activeEpochId,
  });

  bool get isLive => mode == KitchenRuntimeMode.live;
  bool get isDegraded => mode == KitchenRuntimeMode.degraded;
  bool get isRecovering => mode == KitchenRuntimeMode.recovering;

  @override
  List<Object?> get props => [
        mode, activeTickets, totalProjections, staleProjections,
        trackedTickets, processedEventCount,
      ];
}

// ━━━━━━━━━━━━━━━━━━━━━━ PRESENCE DIAGNOSTICS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class PresenceDiagnosticsSnapshot extends Equatable {
  final int activePresenceRecords;
  final int activeHeartbeats;
  final bool sweepActive;
  final int ttlSeconds;
  final int recentInvalidationCount;
  final int processedEventCount;

  const PresenceDiagnosticsSnapshot({
    required this.activePresenceRecords,
    required this.activeHeartbeats,
    required this.sweepActive,
    required this.ttlSeconds,
    required this.recentInvalidationCount,
    required this.processedEventCount,
  });

  @override
  List<Object?> get props => [
        activePresenceRecords, activeHeartbeats, sweepActive,
        ttlSeconds, recentInvalidationCount,
      ];
}

// ━━━━━━━━━━━━━━━━━━━━━━ MUTATION DIAGNOSTICS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class MutationDiagnosticsSnapshot extends Equatable {
  final int pendingMutations;
  final int committedMutations;
  final int failedMutations;

  const MutationDiagnosticsSnapshot({
    required this.pendingMutations,
    required this.committedMutations,
    required this.failedMutations,
  });

  bool get hasBacklog => pendingMutations > 0;
  bool get hasFailures => failedMutations > 0;

  @override
  List<Object?> get props => [pendingMutations, committedMutations, failedMutations];
}

// ━━━━━━━━━━━━━━━━━━━━━━ OVERALL HEALTH ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

enum OverallRuntimeHealth {
  /// All systems nominal.
  healthy,

  /// Minor issues — some degradation but operational.
  warning,

  /// Significant issues — operator attention required.
  degraded,

  /// Critical failure — immediate intervention required.
  critical,
}

// ━━━━━━━━━━━━━━━━━━━━━━ FULL SNAPSHOT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/// Complete point-in-time diagnostics snapshot.
/// Produced by RuntimeDiagnosticsCoordinator every [refreshInterval].
class RuntimeDiagnosticsSnapshot extends Equatable {
  final TransportHealthSnapshot transport;
  final EpochDiagnosticsSnapshot epoch;
  final SequenceDiagnosticsSnapshot sequence;
  final ProjectionDiagnosticsSnapshot projections;
  final KdsDiagnosticsSnapshot kds;
  final PresenceDiagnosticsSnapshot presence;
  final MutationDiagnosticsSnapshot mutations;
  final OverallRuntimeHealth overallHealth;
  final DateTime capturedAt;
  final String appVersion;
  final String deviceId;

  const RuntimeDiagnosticsSnapshot({
    required this.transport,
    required this.epoch,
    required this.sequence,
    required this.projections,
    required this.kds,
    required this.presence,
    required this.mutations,
    required this.overallHealth,
    required this.capturedAt,
    required this.appVersion,
    required this.deviceId,
  });

  /// Derive overall health from component states.
  static OverallRuntimeHealth deriveHealth({
    required TransportHealthSnapshot transport,
    required KdsDiagnosticsSnapshot kds,
    required MutationDiagnosticsSnapshot mutations,
    required ProjectionDiagnosticsSnapshot projections,
  }) {
    if (transport.isCritical) return OverallRuntimeHealth.critical;
    if (transport.isDegraded || kds.isDegraded || kds.isRecovering) {
      return OverallRuntimeHealth.degraded;
    }
    if (transport.isReconnecting || mutations.hasFailures ||
        projections.hasStale || projections.hasBacklog) {
      return OverallRuntimeHealth.warning;
    }
    return OverallRuntimeHealth.healthy;
  }

  /// Export as plain-text report for clipboard sharing.
  String toReport() {
    return '''
STAFF APP RUNTIME DIAGNOSTICS REPORT
=====================================
Captured: ${capturedAt.toIso8601String()}
App Version: $appVersion
Device ID: $deviceId
Overall Health: ${overallHealth.name.toUpperCase()}

TRANSPORT HEALTH
  Status: ${transport.status.name}
  Reconnect Attempts: ${transport.reconnectAttempts}/${transport.maxReconnectAttempts}
  Messages Sent: ${transport.messagesSent}
  Messages Received: ${transport.messagesReceived}
  Last Ping: ${transport.lastPingMs}ms
  P50/P95/P99: ${transport.p50LatencyMs}/${transport.p95LatencyMs}/${transport.p99LatencyMs}ms
  ${transport.errorMessage != null ? 'Error: ${transport.errorMessage}' : ''}

RUNTIME EPOCH
  Epoch ID: ${epoch.epochId}
  Branch: ${epoch.branchId}
  Staff: ${epoch.staffId}
  Valid: ${epoch.isValid}
  Age: ${epoch.epochAge}

SEQUENCE VALIDATION
  Branch: ${sequence.branchId}
  Expected Sequence: ${sequence.expectedSequence}
  Processed Events: ${sequence.processedEventCount}
  Duplicates Rejected: ${sequence.duplicatesRejected}
  Gaps Detected: ${sequence.gapsDetected}
  Stale Rejected: ${sequence.staleEventsRejected}

PROJECTION ENGINE
  Registered: ${projections.registeredProjections}
  Currently Rebuilding: ${projections.currentlyRebuilding}
  Stale Projections: ${projections.staleProjections}

KDS RUNTIME
  Mode: ${kds.mode.name}
  Active Tickets: ${kds.activeTickets}
  Total Projections: ${kds.totalProjections}
  Stale Projections: ${kds.staleProjections}
  Processed Events: ${kds.processedEventCount}

PRESENCE GOVERNANCE
  Active Records: ${presence.activePresenceRecords}
  Active Heartbeats: ${presence.activeHeartbeats}
  Sweep Active: ${presence.sweepActive}
  TTL: ${presence.ttlSeconds}s
  Recent Invalidations: ${presence.recentInvalidationCount}

OPTIMISTIC MUTATIONS
  Pending: ${mutations.pendingMutations}
  Committed: ${mutations.committedMutations}
  Failed: ${mutations.failedMutations}
''';
  }

  @override
  List<Object?> get props => [
        transport, epoch, sequence, projections, kds, presence,
        mutations, overallHealth, capturedAt,
      ];
}
