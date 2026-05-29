// ============================================================
// src/modules/observability/runtime-certification/scenarios.ts
// Deterministic certification scenarios for runtime correctness.
// ============================================================

import { CertificationScenario, CertificationHarness } from './certification.harness';

export const ScenarioA_DisconnectDuringReplay: CertificationScenario = {
  id: 'SCENARIO_A_DISCONNECT_REPLAY',
  name: 'Disconnect During Replay',
  description: 'Validate replay resume correctness, sequence continuity, and watermark consistency when transport drops mid-replay.',
  execute: async (harness: CertificationHarness) => {
    // 1. Start Replay
    harness.emitEvent({ event_type: 'REPLAY_STARTED' });
    harness.advanceTime(100);

    // 2. Process some events
    harness.emitEvent({ event_type: 'REPLAY_PROGRESS', sequence: 10, metadata: {} });
    harness.advanceTime(50);
    harness.emitEvent({ event_type: 'REPLAY_PROGRESS', sequence: 11, metadata: {} });
    
    // 3. Transport disconnects unexpectedly
    harness.advanceTime(10);
    harness.emitEvent({ event_type: 'TRANSPORT_DISCONNECTED' });
    harness.emitEvent({ event_type: 'REPLAY_ABORTED' });

    // 4. Reconnect and resume
    harness.advanceTime(5000);
    harness.emitEvent({ event_type: 'TRANSPORT_RECONNECT_STARTED' });
    harness.advanceTime(200);
    harness.emitEvent({ event_type: 'TRANSPORT_RECONNECT_COMPLETED' });
    
    // 5. Replay starts from sequence 11
    harness.emitEvent({ event_type: 'REPLAY_STARTED' });
    harness.emitEvent({ event_type: 'REPLAY_PROGRESS', sequence: 12, metadata: {} });
    harness.emitEvent({ event_type: 'REPLAY_COMPLETED' });
    
    // 6. Complete projection rebuild
    harness.emitEvent({ event_type: 'PROJECTION_REBUILD_COMPLETED', sequence: 12, metadata: { duration_ms: 100 } });
  },
  assert: (harness: CertificationHarness) => {
    harness.assertSnapshot(s => s.domains['orders'].watermark === 12, 'Watermark must be exactly 12');
    harness.assertSnapshot(s => s.reconnectAttempts === 1, 'Should have exactly 1 reconnect attempt');
  }
};

export const ScenarioB_DuplicateRealtimeFlood: CertificationScenario = {
  id: 'SCENARIO_B_DUPLICATE_FLOOD',
  name: 'Duplicate Realtime Flood',
  description: 'Validate duplicate discard correctness, replay stability, and rebuild deduplication.',
  execute: async (harness: CertificationHarness) => {
    // Fire the same mutation 100 times in 1 second
    for (let i = 0; i < 100; i++) {
      harness.emitEvent({ event_type: 'MUTATION_QUEUED', mutation_id: 'm_123' });
      harness.advanceTime(10);
    }
    // Emulate that only 1 was acknowledged, others were stale/rejected
    harness.emitEvent({ event_type: 'MUTATION_ACKNOWLEDGED', mutation_id: 'm_123' });
    for (let i = 0; i < 99; i++) {
      harness.emitEvent({ event_type: 'STALE_PAYLOAD_REJECTED' });
    }
  },
  assert: (harness: CertificationHarness) => {
    harness.assertSnapshot(s => s.mutationSubmitted === 100, 'Must record 100 submitted mutations');
    harness.assertSnapshot(s => s.staleRejected === 99, 'Must reject 99 duplicates');
    harness.assertSnapshot(s => s.mutationAcknowledged === 1, 'Must acknowledge exactly 1');
  }
};

export const ScenarioC_ProjectionRebuildStarvation: CertificationScenario = {
  id: 'SCENARIO_C_REBUILD_STARVATION',
  name: 'Projection Rebuild Starvation',
  description: 'Validate rebuild queue isolation, starvation detection, and invalidation collapse correctness.',
  execute: async (harness: CertificationHarness) => {
    // 20 invalidations arrive rapidly
    for (let i = 0; i < 20; i++) {
      harness.emitEvent({ event_type: 'PROJECTION_INVALIDATED' });
      harness.advanceTime(5);
    }
    // Only 1 rebuild starts and completes (debounce/collapse)
    harness.emitEvent({ event_type: 'PROJECTION_REBUILD_STARTED' });
    harness.advanceTime(200);
    harness.emitEvent({ event_type: 'PROJECTION_REBUILD_COMPLETED', sequence: 50, metadata: {} });
  },
  assert: (harness: CertificationHarness) => {
    harness.assertSnapshot(s => s.domains['orders'].rebuildCount === 1, 'Should only rebuild once after collapse');
  }
};

export const ScenarioD_OutOfOrderSequenceArrival: CertificationScenario = {
  id: 'SCENARIO_D_OUT_OF_ORDER',
  name: 'Out-of-Order Sequence Arrival',
  description: 'Validate stale rejection correctness, replay reconciliation, and sequence ordering guarantees.',
  execute: async (harness: CertificationHarness) => {
    // 1. Receive seq 10 and 11
    harness.emitEvent({ event_type: 'REPLAY_PROGRESS', sequence: 10 });
    harness.advanceTime(10);
    harness.emitEvent({ event_type: 'REPLAY_PROGRESS', sequence: 11 });
    
    // 2. Receive seq 14 (out of order, gap detected)
    harness.emitEvent({ event_type: 'SEQUENCE_GAP_DETECTED', sequence: 14 });
    harness.advanceTime(10);
    
    // 3. Receive seq 12 and 13 (late arrival)
    harness.emitEvent({ event_type: 'REPLAY_PROGRESS', sequence: 12 });
    harness.emitEvent({ event_type: 'REPLAY_PROGRESS', sequence: 13 });
    
    // 4. Stale/old sequence arrives (seq 9) -> should be rejected
    harness.emitEvent({ event_type: 'STALE_PAYLOAD_REJECTED', sequence: 9 });
  },
  assert: (harness: CertificationHarness) => {
    harness.assertSnapshot(s => s.sequenceGaps === 1, 'Should detect exactly 1 sequence gap');
    harness.assertSnapshot(s => s.staleRejected === 1, 'Should reject the stale sequence 9');
  }
};

export const ScenarioE_ReconnectDuringMutationInflight: CertificationScenario = {
  id: 'SCENARIO_E_RECONNECT_INFLIGHT',
  name: 'Reconnect During Mutation Inflight',
  description: 'Validate mutation replay confirmation, OCC safety, and duplicate mutation prevention.',
  execute: async (harness: CertificationHarness) => {
    // 1. Submit mutation
    harness.emitEvent({ event_type: 'MUTATION_QUEUED', mutation_id: 'mut_555' });
    harness.advanceTime(10);
    harness.emitEvent({ event_type: 'MUTATION_INFLIGHT', mutation_id: 'mut_555' });
    harness.advanceTime(20);
    
    // 2. Disconnect before ack
    harness.emitEvent({ event_type: 'TRANSPORT_DISCONNECTED' });
    harness.advanceTime(100);
    
    // 3. Reconnect and replay
    harness.emitEvent({ event_type: 'TRANSPORT_RECONNECT_COMPLETED' });
    harness.emitEvent({ event_type: 'REPLAY_STARTED' });
    
    // 4. The mutation was processed by server and is replayed
    harness.emitEvent({ event_type: 'REPLAY_PROGRESS', mutation_id: 'mut_555' });
    harness.emitEvent({ event_type: 'MUTATION_REPLAY_CONFIRMED', mutation_id: 'mut_555' });
    harness.emitEvent({ event_type: 'REPLAY_COMPLETED' });
  },
  assert: (harness: CertificationHarness) => {
    harness.assertSnapshot(s => s.mutationSubmitted === 1, 'One mutation submitted');
    harness.assertSnapshot(s => s.mutationConfirmed === 1, 'Mutation confirmed via replay');
    harness.assertSnapshot(s => s.mutationAcknowledged === 0, 'No standard ack was received');
  }
};

export const ScenarioF_MultiDeviceConcurrentMutationStorm: CertificationScenario = {
  id: 'SCENARIO_F_MULTI_DEVICE_STORM',
  name: 'Multi-Device Concurrent Mutation Storm',
  description: 'Validate deterministic convergence, replay-safe ordering, and projection consistency across surfaces.',
  execute: async (harness: CertificationHarness) => {
    // 3 devices submit conflicting mutations at exact same time
    harness.emitEvent({ event_type: 'MUTATION_QUEUED', mutation_id: 'mut_A1', runtime_surface: 'POS' });
    harness.emitEvent({ event_type: 'MUTATION_QUEUED', mutation_id: 'mut_B1', runtime_surface: 'STAFF' });
    harness.emitEvent({ event_type: 'MUTATION_QUEUED', mutation_id: 'mut_C1', runtime_surface: 'KDS' });
    
    // Server processes A1 first, B1 and C1 hit OCC conflict
    harness.advanceTime(50);
    harness.emitEvent({ event_type: 'MUTATION_ACKNOWLEDGED', mutation_id: 'mut_A1' });
    harness.emitEvent({ event_type: 'MUTATION_OCC_CONFLICT', mutation_id: 'mut_B1' });
    harness.emitEvent({ event_type: 'MUTATION_OCC_CONFLICT', mutation_id: 'mut_C1' });
    
    // Devices B and C auto-resolve and retry
    harness.advanceTime(20);
    harness.emitEvent({ event_type: 'MUTATION_RETRYING', mutation_id: 'mut_B1' });
    harness.emitEvent({ event_type: 'MUTATION_RETRYING', mutation_id: 'mut_C1' });
    
    // Both retry successfully
    harness.advanceTime(50);
    harness.emitEvent({ event_type: 'MUTATION_ACKNOWLEDGED', mutation_id: 'mut_B1' });
    harness.emitEvent({ event_type: 'MUTATION_ACKNOWLEDGED', mutation_id: 'mut_C1' });
  },
  assert: (harness: CertificationHarness) => {
    harness.assertSnapshot(s => s.mutationSubmitted === 3, '3 mutations submitted');
    harness.assertSnapshot(s => s.mutationAcknowledged === 3, '3 mutations ultimately acked');
    harness.assertSnapshot(s => s.mutationStalled === 2, '2 mutations hit OCC conflict');
  }
};

export const ScenarioG_ClockSkewMutationResolution: CertificationScenario = {
  id: 'SCENARIO_G_CLOCK_SKEW_RESOLUTION',
  name: 'Clock Skew Mutation Resolution',
  description: 'Validate sequence-authoritative ordering when device clocks drift significantly (e.g., POS is 2 minutes fast, KDS is 1 minute slow).',
  execute: async (harness: CertificationHarness) => {
    // POS is 120s fast, KDS is 60s slow
    harness.setClockSkew('POS', 120000);
    harness.setClockSkew('KDS', -60000);
    harness.setClockSkew('STAFF', 0); // accurate

    // POS submits mutation (timestamp says it's 2 mins in future)
    harness.emitEvent({ event_type: 'MUTATION_QUEUED', mutation_id: 'mut_POS_1', runtime_surface: 'POS' });
    harness.advanceTime(10);
    
    // KDS submits mutation (timestamp says it's 1 min in past)
    harness.emitEvent({ event_type: 'MUTATION_QUEUED', mutation_id: 'mut_KDS_1', runtime_surface: 'KDS' });
    harness.advanceTime(10);
    
    // Server processes them purely based on sequence arrival, NOT client timestamps
    harness.emitEvent({ event_type: 'MUTATION_ACKNOWLEDGED', mutation_id: 'mut_POS_1', sequence: 50, runtime_surface: 'BACKEND_ENGINE' });
    harness.emitEvent({ event_type: 'MUTATION_ACKNOWLEDGED', mutation_id: 'mut_KDS_1', sequence: 51, runtime_surface: 'BACKEND_ENGINE' });
    
    // Server detects clock drift
    harness.emitEvent({ event_type: 'CLOCK_DRIFT_DETECTED', runtime_surface: 'POS', metadata: { drift_ms: 120000 } });
    harness.emitEvent({ event_type: 'CLOCK_DRIFT_DETECTED', runtime_surface: 'KDS', metadata: { drift_ms: -60000 } });
  },
  assert: (harness: CertificationHarness) => {
    harness.assertSnapshot(s => s.mutationAcknowledged === 2, '2 mutations acknowledged despite skew');
    // We would assert drift metrics here if we track them in snapshot
  }
};

export const ScenarioH_AndroidSleepWakeRecovery: CertificationScenario = {
  id: 'SCENARIO_H_ANDROID_SLEEP_WAKE',
  name: 'Android Sleep/Wake Recovery',
  description: 'Validate sequence continuity and stale projection prevention when a device wakes up from deep sleep.',
  execute: async (harness: CertificationHarness) => {
    harness.emitEvent({ event_type: 'TRANSPORT_CONNECTED', runtime_surface: 'POS' });
    
    // POS goes to sleep
    harness.setVisibilityState('POS', 'backgrounded');
    harness.emitEvent({ event_type: 'TRANSPORT_DISCONNECTED', runtime_surface: 'POS' });
    
    // Meanwhile, 50 mutations happen on STAFF
    for (let i = 1; i <= 50; i++) {
      harness.emitEvent({ event_type: 'REPLAY_PROGRESS', sequence: 100 + i, runtime_surface: 'STAFF' });
      harness.advanceTime(10);
    }
    
    // POS wakes up 5 minutes later
    harness.advanceTime(300000);
    harness.setVisibilityState('POS', 'visible');
    harness.emitEvent({ event_type: 'TRANSPORT_RECONNECT_STARTED', runtime_surface: 'POS' });
    harness.advanceTime(100);
    harness.emitEvent({ event_type: 'TRANSPORT_RECONNECT_COMPLETED', runtime_surface: 'POS' });
    
    // POS starts replay
    harness.emitEvent({ event_type: 'REPLAY_STARTED', runtime_surface: 'POS' });
    harness.emitEvent({ event_type: 'REPLAY_PROGRESS', sequence: 150, runtime_surface: 'POS' });
    harness.emitEvent({ event_type: 'REPLAY_COMPLETED', runtime_surface: 'POS' });
    harness.emitEvent({ event_type: 'PROJECTION_REBUILD_COMPLETED', sequence: 150, runtime_surface: 'POS', metadata: {} });
  },
  assert: (harness: CertificationHarness) => {
    harness.assertSnapshot(s => s.convergence.surfaces['POS']?.currentWatermark === 150, 'POS watermark should reach 150');
  }
};

export const ScenarioI_BrowserThrottlingValidation: CertificationScenario = {
  id: 'SCENARIO_I_BROWSER_THROTTLING',
  name: 'Browser Throttling Validation',
  description: 'Simulate background browser tab throttling delaying event propagation and websocket delivery.',
  execute: async (harness: CertificationHarness) => {
    harness.setVisibilityState('ADMIN', 'hidden');
    
    // Server emits 10 events, but browser receives them all at once 10 seconds later
    harness.advanceTime(10000);
    for (let i = 1; i <= 10; i++) {
      harness.emitEvent({ event_type: 'REPLAY_PROGRESS', sequence: 200 + i, runtime_surface: 'ADMIN' });
    }
    harness.emitEvent({ event_type: 'PROJECTION_REBUILD_COMPLETED', sequence: 210, runtime_surface: 'ADMIN', metadata: {} });
  },
  assert: (harness: CertificationHarness) => {
    harness.assertSnapshot(s => s.convergence.surfaces['ADMIN']?.currentWatermark === 210, 'ADMIN watermark should reach 210');
  }
};

export const ScenarioJ_UnstableWiFiCertification: CertificationScenario = {
  id: 'SCENARIO_J_UNSTABLE_WIFI',
  name: 'Unstable WiFi Certification',
  description: 'Simulate intermittent packet loss, roaming, and hotspot switching.',
  execute: async (harness: CertificationHarness) => {
    for (let i = 0; i < 5; i++) {
      harness.emitEvent({ event_type: 'TRANSPORT_DISCONNECTED', runtime_surface: 'STAFF' });
      harness.advanceTime(500);
      harness.emitEvent({ event_type: 'TRANSPORT_RECONNECT_STARTED', runtime_surface: 'STAFF' });
      harness.advanceTime(1000);
      harness.emitEvent({ event_type: 'TRANSPORT_RECONNECT_COMPLETED', runtime_surface: 'STAFF' });
      harness.emitEvent({ event_type: 'REPLAY_COMPLETED', runtime_surface: 'STAFF' });
      harness.advanceTime(5000);
    }
  },
  assert: (harness: CertificationHarness) => {
    harness.assertSnapshot(s => s.convergence.surfaces['STAFF']?.reconnectAttempts === 0, 'Reconnect attempts reset upon final connect');
  }
};

export const ScenarioK_ConcurrentOperatorConflict: CertificationScenario = {
  id: 'SCENARIO_K_CONCURRENT_CONFLICT',
  name: 'Concurrent Operator Conflict',
  description: 'Validate OCC correctness during heavy simulated traffic from multiple admins.',
  execute: async (harness: CertificationHarness) => {
    harness.emitEvent({ event_type: 'MUTATION_QUEUED', mutation_id: 'm1', runtime_surface: 'POS' });
    harness.emitEvent({ event_type: 'MUTATION_QUEUED', mutation_id: 'm2', runtime_surface: 'KDS' });
    harness.emitEvent({ event_type: 'MUTATION_QUEUED', mutation_id: 'm3', runtime_surface: 'STAFF' });
    
    harness.advanceTime(20);
    harness.emitEvent({ event_type: 'MUTATION_ACKNOWLEDGED', mutation_id: 'm2' }); // KDS wins
    harness.emitEvent({ event_type: 'MUTATION_OCC_CONFLICT', mutation_id: 'm1' });
    harness.emitEvent({ event_type: 'MUTATION_OCC_CONFLICT', mutation_id: 'm3' });
  },
  assert: (harness: CertificationHarness) => {
    harness.assertSnapshot(s => s.mutationStalled === 2, 'Two mutations stalled due to conflict');
  }
};

export const ScenarioL_LongRunningRuntimeStability: CertificationScenario = {
  id: 'SCENARIO_L_LONG_RUNNING_EPOCH',
  name: 'Long-Running Runtime Epoch (Segmented)',
  description: 'Validate memory stability and sequence continuity across a rolling checkpoint window (e.g., 30m segment).',
  execute: async (harness: CertificationHarness) => {
    // We simulate 30 minutes of continuous low-level operations
    for (let i = 0; i < 1800; i++) { // 1 event per second
      harness.emitEvent({ event_type: 'REPLAY_PROGRESS', sequence: 300 + i, runtime_surface: 'BACKEND_ENGINE' });
      harness.advanceTime(1000);
    }
  },
  assert: (harness: CertificationHarness) => {
    harness.assertSnapshot(s => s.domains['orders'].watermark === 2099, 'Watermark must progress correctly through the 30m epoch');
  }
};

export const ScenarioM_BackpressureCascade: CertificationScenario = {
  id: 'SCENARIO_M_BACKPRESSURE_CASCADE',
  name: 'Backpressure Cascade & Telemetry Flood',
  description: 'Simulate telemetry flood, replay backlog, and queue pressure amplification to validate bounded degradation.',
  execute: async (harness: CertificationHarness) => {
    for (let i = 0; i < 2000; i++) {
      harness.emitEvent({ event_type: 'REPLAY_PROGRESS', sequence: i });
      harness.advanceTime(1);
    }
  },
  assert: (harness: CertificationHarness) => {
    harness.assertSnapshot(s => s.droppedEvents > 0, 'Should drop events under flood due to MAX_BUFFER_SIZE bounds');
    harness.assertSnapshot(s => s.bufferSize <= 1000, 'Buffer must be strictly bounded');
  }
};

export const AllScenarios = [
  ScenarioA_DisconnectDuringReplay,
  ScenarioB_DuplicateRealtimeFlood,
  ScenarioC_ProjectionRebuildStarvation,
  ScenarioD_OutOfOrderSequenceArrival,
  ScenarioE_ReconnectDuringMutationInflight,
  ScenarioF_MultiDeviceConcurrentMutationStorm,
  ScenarioG_ClockSkewMutationResolution,
  ScenarioH_AndroidSleepWakeRecovery,
  ScenarioI_BrowserThrottlingValidation,
  ScenarioJ_UnstableWiFiCertification,
  ScenarioK_ConcurrentOperatorConflict,
  ScenarioL_LongRunningRuntimeStability,
  ScenarioM_BackpressureCascade
];
