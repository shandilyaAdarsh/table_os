// lib/core/runtime/runtime_orchestrator.dart
//
// RuntimeOrchestrator — top-level coordinator for the entire runtime system.
// Wires together all runtime components and provides a unified API.

import 'package:flutter/foundation.dart';
import 'domain/runtime_event.dart';
import 'domain/invalidation_record.dart';
import 'domain/optimistic_mutation.dart';
import 'runtime_epoch_manager.dart';
import 'sequence_validator.dart';
import 'invalidation_coordinator.dart';
import 'realtime_event_router.dart';
import 'projection_rebuild_engine.dart';
import 'optimistic_mutation_manager.dart';
import 'branch_isolation_resolver.dart';

/// Central orchestrator for the distributed runtime system.
class RuntimeOrchestrator {
  late final RuntimeEpochManager _epochManager;
  late final SequenceValidator _sequenceValidator;
  late final InvalidationCoordinator _invalidationCoordinator;
  late final RealtimeEventRouter _eventRouter;
  late final ProjectionRebuildEngine _rebuildEngine;
  late final OptimisticMutationManager _mutationManager;
  late final BranchIsolationResolver _branchIsolationResolver;

  bool _initialized = false;

  RuntimeOrchestrator() {
    _initialize();
  }

  void _initialize() {
    debugPrint('[RuntimeOrchestrator] Initializing runtime system...');

    _epochManager = RuntimeEpochManager();
    _sequenceValidator = SequenceValidator();
    _invalidationCoordinator = InvalidationCoordinator();
    _mutationManager = OptimisticMutationManager();
    _rebuildEngine = ProjectionRebuildEngine();
    _branchIsolationResolver = BranchIsolationResolver();

    _eventRouter = RealtimeEventRouter(
      epochManager: _epochManager,
      sequenceValidator: _sequenceValidator,
      invalidationCoordinator: _invalidationCoordinator,
      branchIsolationResolver: _branchIsolationResolver,
    );

    // Wire up projection rebuild callback
    _eventRouter.registerRebuildCallback(_handleProjectionRebuilds);

    _initialized = true;
    debugPrint('[RuntimeOrchestrator] Runtime system initialized');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ PUBLIC API ━━━━━━━━━━━━━━━━━━━━━━

  /// Start a new runtime session (called after authentication).
  void startSession({
    required String branchId,
    required String staffId,
  }) {
    debugPrint('[RuntimeOrchestrator] Starting session: branch=$branchId staff=$staffId');
    _epochManager.issueEpoch(branchId: branchId, staffId: staffId);
    _branchIsolationResolver.activateBranch(
      branchId: branchId,
      organizationId: 'unknown', // To be updated if org ID is passed
    );
  }

  /// End the current runtime session.
  void endSession() {
    debugPrint('[RuntimeOrchestrator] Ending session');
    _epochManager.invalidateCurrentEpoch();
    _branchIsolationResolver.deactivateBranch();
    _eventRouter.reset();
    _mutationManager.reset();
  }

  /// Route a realtime event through the system.
  Future<void> routeEvent(RuntimeEvent event) async {
    if (!_initialized) {
      debugPrint('[RuntimeOrchestrator] ERROR: Runtime not initialized');
      return;
    }
    await _eventRouter.routeEvent(event);
  }

  /// Route multiple events in batch.
  Future<void> routeBatch(List<RuntimeEvent> events) async {
    if (!_initialized) {
      debugPrint('[RuntimeOrchestrator] ERROR: Runtime not initialized');
      return;
    }
    await _eventRouter.routeBatch(events);
  }

  /// Register an invalidation rule.
  void registerInvalidationRule(InvalidationRule rule) {
    _invalidationCoordinator.registerRule(rule);
  }

  /// Register a post-validation event dispatch callback.
  /// Called after an event passes all validation — dispatches payload to
  /// the correct repository/notifier for deterministic state reconstruction.
  void registerDispatchCallback(EventDispatchCallback callback) {
    _eventRouter.registerDispatchCallback(callback);
  }

  /// Register a projection dependency.
  void registerProjectionDependency({
    required String dependent,
    required String dependency,
  }) {
    _invalidationCoordinator.registerDependency(
      dependent: dependent,
      dependency: dependency,
    );
  }

  /// Register a projection with its rebuild logic.
  void registerProjection(ProjectionRegistration registration) {
    _rebuildEngine.registerProjection(registration);
  }

  /// Queue an optimistic mutation.
  void queueOptimisticMutation(OptimisticMutation mutation) {
    _mutationManager.queueMutation(mutation);
  }

  /// Get pending mutations for a domain.
  List<OptimisticMutation> getPendingMutations(String domain) {
    return _mutationManager.getPendingMutations(domain);
  }

  /// Commit an optimistic mutation (backend acknowledged).
  void commitMutation(String mutationId) {
    _mutationManager.commitMutation(mutationId);
  }

  /// Rollback an optimistic mutation (backend rejected).
  void rollbackMutation(String mutationId, String reason) {
    _mutationManager.rollbackMutation(mutationId, reason);
  }

  /// Force rebuild all projections (for full resync).
  Future<void> rebuildAllProjections() async {
    await _rebuildEngine.rebuildAll();
  }

  /// Get comprehensive runtime statistics.
  Map<String, dynamic> getStats() {
    return {
      'initialized': _initialized,
      'epoch': {
        'hasActive': _epochManager.hasActiveEpoch,
        'epochId': _epochManager.currentEpoch.epochId,
        'branchId': _epochManager.currentEpoch.branchId,
        'staffId': _epochManager.currentEpoch.staffId,
      },
      'router': _eventRouter.getStats(),
      'mutations': _mutationManager.getStats(),
      'projections': _rebuildEngine.getStats(),
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ INTERNAL HANDLERS ━━━━━━━━━━━━━━━━━━━━━━

  void _handleProjectionRebuilds(List<InvalidationRecord> invalidations) {
    debugPrint('[RuntimeOrchestrator] Handling ${invalidations.length} projection rebuilds');

    // Rebase any pending optimistic mutations for affected projections
    for (final invalidation in invalidations) {
      final domainKey = invalidation.domain.toString();
      if (_mutationManager.hasPendingMutations(domainKey)) {
        _mutationManager.rebasePendingMutations(domainKey);
      }
    }

    // Trigger projection rebuilds
    _rebuildEngine.rebuildProjections(invalidations);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━ GETTERS ━━━━━━━━━━━━━━━━━━━━━━

  RuntimeEpochManager get epochManager => _epochManager;
  SequenceValidator get sequenceValidator => _sequenceValidator;
  InvalidationCoordinator get invalidationCoordinator => _invalidationCoordinator;
  RealtimeEventRouter get eventRouter => _eventRouter;
  ProjectionRebuildEngine get rebuildEngine => _rebuildEngine;
  OptimisticMutationManager get mutationManager => _mutationManager;
  BranchIsolationResolver get branchIsolationResolver => _branchIsolationResolver;
}
