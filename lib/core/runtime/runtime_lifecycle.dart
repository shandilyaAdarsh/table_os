// lib/core/runtime/runtime_lifecycle.dart
//
// RuntimeLifecycle — manages runtime session lifecycle tied to authentication.
// Starts runtime session when staff logs in and starts shift.
// Ends runtime session when staff logs out or ends shift.
//
// On session start:
//   1. RuntimeOrchestrator.startSession() — issues epoch, resets sequence
//   2. OperationalRuntimeBridge.activateSession() — activates KDS + presence governance
//
// On session end:
//   1. OperationalRuntimeBridge.deactivateSession() — clears KDS + presence state
//   2. RuntimeOrchestrator.endSession() — invalidates epoch, resets router

import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'operational_runtime_bridge.dart';
import '../network/realtime_sync_manager.dart';
import '../../features/auth/presentation/state/auth_notifier.dart';
import '../../features/auth/presentation/state/auth_state.dart';
import 'diagnostics/operational_health_publisher.dart';

/// Manages runtime session lifecycle based on auth state.
class RuntimeLifecycleManager {
  final Ref _ref;
  bool _sessionActive = false;

  RuntimeLifecycleManager(this._ref) {
    _initialize();
  }

  void _initialize() {
    debugPrint('[RuntimeLifecycleManager] Initializing runtime lifecycle manager');

    // Initialize the operational runtime bridge after the current frame to avoid
    // provider initialization order issues during ProviderScope construction.
    SchedulerBinding.instance.addPostFrameCallback((_) {
      _ref.read(operationalRuntimeBridgeProvider);
      debugPrint('[RuntimeLifecycleManager] Operational runtime bridge initialized');
    });

    // Listen to auth state changes
    _ref.listen<AuthState>(
      authNotifierProvider,
      (previous, next) {
        _handleAuthStateChange(previous, next);
      },
    );
  }

  void _handleAuthStateChange(AuthState? previous, AuthState next) {
    final orchestrator = _ref.read(runtimeOrchestratorProvider);

    // ── Start session when shift starts ───────────────────────────────────
    if (!_sessionActive &&
        next.isShiftStarted &&
        next.loggedInStaff != null &&
        next.selectedBranch != null) {
      debugPrint('[RuntimeLifecycleManager] Starting runtime session');

      // 1. Issue epoch and start orchestrator session
      orchestrator.startSession(
        branchId: next.selectedBranch!.id,
        staffId: next.loggedInStaff!.id,
      );

      // 2. Sync SequenceValidator starting point with transport layer's
      //    current expected sequence to avoid false gap detection on session start.
      final syncManager = _ref.read(realtimeSyncManagerProvider);
      orchestrator.sequenceValidator.resetBranch(
        next.selectedBranch!.id,
        startFrom: syncManager.expectedSequenceNumber,
      );

      // 3. Activate KDS runtime + presence governance via bridge
      _ref.read(operationalRuntimeBridgeProvider).activateSession(
            branchId: next.selectedBranch!.id,
            epochId: orchestrator.epochManager.currentEpoch.epochId,
          );

      _sessionActive = true;
      debugPrint(
          '[RuntimeLifecycleManager] Session started: '
          'branch=${next.selectedBranch!.id} '
          'epoch=${orchestrator.epochManager.currentEpoch.epochId}');
    }

    // ── End session when shift ends or logout ─────────────────────────────
    if (_sessionActive &&
        (!next.isShiftStarted || next.loggedInStaff == null)) {
      debugPrint('[RuntimeLifecycleManager] Ending runtime session');

      // 1. Deactivate KDS + presence governance via bridge
      _ref.read(operationalRuntimeBridgeProvider).deactivateSession();

      // 2. End orchestrator session (invalidates epoch, resets router)
      orchestrator.endSession();

      _sessionActive = false;
      debugPrint('[RuntimeLifecycleManager] Session ended');
    }
  }

  void dispose() {
    if (_sessionActive) {
      _ref.read(operationalRuntimeBridgeProvider).deactivateSession();
      _ref.read(runtimeOrchestratorProvider).endSession();
      _sessionActive = false;
    }
  }
}

/// Provider for runtime lifecycle manager.
final runtimeLifecycleManagerProvider = Provider<RuntimeLifecycleManager>((ref) {
  final manager = RuntimeLifecycleManager(ref);
  ref.onDispose(() => manager.dispose());
  return manager;
});
