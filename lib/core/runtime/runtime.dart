// lib/core/runtime/runtime.dart
//
// Central export file for the distributed runtime system.
// Import this file to access all runtime components.

// ━━━━━━━━━━━━━━━━━━━━━━ DOMAIN MODELS ━━━━━━━━━━━━━━━━━━━━━━
export 'domain/runtime_epoch.dart';
export 'domain/runtime_event.dart';
export 'domain/invalidation_record.dart';
export 'domain/optimistic_mutation.dart';

// ━━━━━━━━━━━━━━━━━━━━━━ CORE MANAGERS ━━━━━━━━━━━━━━━━━━━━━━
export 'runtime_epoch_manager.dart';
export 'sequence_validator.dart';
export 'invalidation_coordinator.dart';
export 'realtime_event_router.dart';
export 'projection_rebuild_engine.dart';
export 'optimistic_mutation_manager.dart';
export 'branch_isolation_resolver.dart';
export 'runtime_session_hydrator.dart';

// ━━━━━━━━━━━━━━━━━━━━━━ ORCHESTRATOR ━━━━━━━━━━━━━━━━━━━━━━
export 'runtime_orchestrator.dart';

// ━━━━━━━━━━━━━━━━━━━━━━ INTEGRATION ━━━━━━━━━━━━━━━━━━━━━━
export 'operational_runtime_bridge.dart';
export 'runtime_lifecycle.dart';
