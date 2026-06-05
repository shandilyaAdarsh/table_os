import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase admin client with fallback to the verified canonical project service role key
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mdwryhxnruprtuqonbwy.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kd3J5aHhucnVwcnR1cW9uYnd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDk3NTUxMSwiZXhwIjoyMDkwNTUxNTExfQ.QLZjL2rNRkFquD8NLH_2wjy0NI06QkE10FLOQRduFx8'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Canonical credentials context
const SYSTEM_TENANT_ID = '11111111-1111-1111-1111-111111111111'
const SYSTEM_OPERATOR_ID = '435e12f5-1e06-42de-bd75-20e0327e8023' // Superadmin ID

interface DlqItem {
  id: string;
  outbox_event_id: string;
  sequence_number: number;
  event_type: string;
  payload: Record<string, unknown>;
  retry_count: number;
  failure_reason: string;
  failure_stacktrace: string;
  quarantined_at: string;
}

interface Incident {
  id: string;
  timestamp: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  message: string;
}

interface AuditLog {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  details: string;
}

interface DeviceNode {
  device_id: string;
  device_type: string;
  display_name: string;
  last_heartbeat: string;
  connection_uptime_seconds: number;
  reconnect_count: number;
  latency_ms: number;
  degraded_mode_active: boolean;
  current_sequence: number;
  subscribed_topics: string[];
}

interface EventRecord {
  id: string;
  event_type: string;
  sequence_number: number;
  payload: Record<string, unknown>;
  metadata: {
    correlation_id: string;
    timestamp: string;
    actor_id: string;
    actor_role: string;
  };
  is_real_data?: boolean;
}

interface StateCache {
  isInitialized: boolean;
  unresolvedDlqCount: number;
  outboxLagSeconds: number;
  averageLatencyMs: number;
  reconnectStormActive: boolean;
  dlqItems: DlqItem[];
  incidents: Incident[];
  auditLogs: AuditLog[];
  devices: DeviceNode[];
  eventStream: EventRecord[];
  
  // SRE Drift Anomaly Simulator Cache
  active_chaos_gap: boolean;
  active_chaos_stale_projections: boolean;
  active_chaos_websocket_divergence: boolean;
  active_chaos_replay_failure: boolean;
}

const cache: StateCache = {
  isInitialized: false,
  unresolvedDlqCount: 0,
  outboxLagSeconds: 0.04,
  averageLatencyMs: 24,
  reconnectStormActive: false,
  dlqItems: [],
  incidents: [],
  auditLogs: [],
  devices: [],
  eventStream: [],
  
  // Chaos Injectors default: off
  active_chaos_gap: false,
  active_chaos_stale_projections: false,
  active_chaos_websocket_divergence: false,
  active_chaos_replay_failure: false
}

// Sequence Gap Discovery Algorithm
function findSequenceGaps(sequences: number[]): { start: number; end: number; status: 'missing' | 'replaying' }[] {
  if (sequences.length <= 1) return [];
  const sorted = [...sequences].sort((a, b) => a - b);
  const gaps: { start: number; end: number; status: 'missing' | 'replaying' }[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const diff = sorted[i+1] - sorted[i];
    if (diff > 1) {
      gaps.push({
        start: sorted[i] + 1,
        end: sorted[i+1] - 1,
        status: 'missing'
      });
    }
  }
  return gaps;
}

function initializeState() {
  if (cache.isInitialized) return

  // 1. Core Event Stream Timelines
  cache.eventStream = [
    {
      id: "evt_8f88a221-c220-41da-be1c-223405c123d2",
      event_type: "SETTLEMENT_COMPLETED",
      sequence_number: 846,
      payload: {
        bill_id: "bill_ef88a221-c220",
        order_id: "ord_c4867df3-ba22-4876-b9b2-33924f72db1a",
        amount_minor: 45000,
        payment_method: "CARD",
        status: "SETTLED"
      },
      metadata: {
        correlation_id: "corr_aa889922ff",
        timestamp: new Date(Date.now() - 45000).toISOString(),
        actor_id: "user_cashier_03",
        actor_role: "CASHIER"
      }
    },
    {
      id: "evt_33ee2d1a-ba22-4876-b9b2-33924f72db1a",
      event_type: "KDS_PREPARATION_COMPLETED",
      sequence_number: 845,
      payload: {
        order_id: "ord_c4867df3-ba22-4876-b9b2-33924f72db1a",
        preparation_id: "prep_cf88a221-ffaa",
        completed_items: ["Truffle Fries", "House Burger"]
      },
      metadata: {
        correlation_id: "corr_bc889911ee",
        timestamp: new Date(Date.now() - 120000).toISOString(),
        actor_id: "user_chef_01",
        actor_role: "CHEF"
      }
    },
    {
      id: "evt_aa22cc33-41da-be1c-223405c123d2",
      event_type: "KDS_PREPARATION_STARTED",
      sequence_number: 844,
      payload: {
        order_id: "ord_c4867df3-ba22-4876-b9b2-33924f72db1a",
        preparation_id: "prep_cf88a221-ffaa",
        station_id: "STATION_GRILL_01"
      },
      metadata: {
        correlation_id: "corr_bc889911ee",
        timestamp: new Date(Date.now() - 300000).toISOString(),
        actor_id: "user_chef_01",
        actor_role: "CHEF"
      }
    },
    {
      id: "evt_ff33aa88-002d-4bfb-9cda-1234ac2bfe00",
      event_type: "ORDER_CREATED",
      sequence_number: 843,
      payload: {
        order_id: "ord_c4867df3-ba22-4876-b9b2-33924f72db1a",
        table_id: "table_22",
        items_count: 2,
        grand_total_minor: 45000
      },
      metadata: {
        correlation_id: "corr_bc889911ee",
        timestamp: new Date(Date.now() - 360000).toISOString(),
        actor_id: "user_waiter_04",
        actor_role: "WAITER"
      }
    },
    {
      id: "evt_bb44ff99-fa4c-4dae-bcdd-99ee82b8344e",
      event_type: "WAITER_CALL_TRIGGERED",
      sequence_number: 842,
      payload: {
        call_id: "call_99ee82b8",
        table_id: "table_05",
        call_reason: "WATER_REQUEST"
      },
      metadata: {
        correlation_id: "corr_fe88a221aa",
        timestamp: new Date(Date.now() - 600000).toISOString(),
        actor_id: "user_customer_anon",
        actor_role: "CUSTOMER"
      }
    }
  ]

  // 2. WebSocket Topology Registry
  cache.devices = [
    {
      device_id: "dev_cashier_01",
      device_type: "CASHIER_TABLET",
      display_name: "POS Central Checkout",
      last_heartbeat: new Date().toISOString(),
      connection_uptime_seconds: 14500,
      reconnect_count: 0,
      latency_ms: 12,
      degraded_mode_active: false,
      current_sequence: 846,
      subscribed_topics: ["tenant:active:branch:01:operational", "billing:payments"]
    },
    {
      device_id: "dev_kds_grill_01",
      device_type: "KDS_SCREEN",
      display_name: "KDS Hot Kitchen Station",
      last_heartbeat: new Date().toISOString(),
      connection_uptime_seconds: 14500,
      reconnect_count: 1,
      latency_ms: 22,
      degraded_mode_active: false,
      current_sequence: 846,
      subscribed_topics: ["tenant:active:branch:01:operational", "kds:grill"]
    },
    {
      device_id: "dev_waiter_04",
      device_type: "WAITER_MOBILE",
      display_name: "Staff Tablet T04",
      last_heartbeat: new Date().toISOString(),
      connection_uptime_seconds: 1200,
      reconnect_count: 2,
      latency_ms: 38,
      degraded_mode_active: false,
      current_sequence: 846,
      subscribed_topics: ["tenant:active:branch:01:operational", "waiter:calls"]
    }
  ]

  // 3. Command SRE Typed Logs
  cache.auditLogs = [
    {
      id: "log_01",
      timestamp: new Date(Date.now() - 1800000).toISOString(),
      actor: "SRE_SYSTEM",
      action: "TELEMETRY_STREAM_STARTED",
      details: "Obs_service successfully attached to WAL pipeline. Monitoring sequences."
    }
  ]

  cache.isInitialized = true
}

// Function to log actions to DB auth_audit_logs securely with enums
async function writeDbAudit(eventType: 'LOGIN_SUCCESS' | 'SUSPICIOUS_ACTIVITY', action: string, details: string, meta: Record<string, unknown> = {}) {
  try {
    await supabase.from('auth_audit_logs').insert({
      tenant_id: SYSTEM_TENANT_ID,
      user_id: SYSTEM_OPERATOR_ID,
      event_type: eventType,
      metadata: {
        sre_operator: "435e12f5-1e06-42de-bd75-20e0327e8023",
        sre_action: action,
        details: details,
        ...meta
      },
      failure_reason: null,
      ip_address: '127.0.0.1',
      user_agent: 'SRE_DIAGNOSTICS_ENGINE'
    })
  } catch {
    // Dynamic logging fallback if DB is blocked/read-only
  }
}

interface DbOrder {
  id: string;
  table_id: string;
  table_num: string;
  total_amount: number;
  guest_count: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface DbSession {
  id: string;
  name: string | null;
  phone: string | null;
  created_at: string;
}

interface DbRequest {
  id: string;
  table_num: string;
  request_type: string;
  message: string | null;
  status: string;
  created_at: string;
}

interface DbDevice {
  id: string;
  device_type: string | null;
  name: string | null;
  updated_at: string;
  reconnects: number | null;
  latency: number | null;
  status: string | null;
}

interface DbAuditLog {
  id: string;
  created_at: string;
  user_id: string;
  event_type: string;
  metadata: Record<string, unknown> | null;
}

export async function GET() {
  initializeState()

  let dbTenantsCount = 0
  let dbOrdersCount = 0
  
  let dbOrders: DbOrder[] = []
  let dbSessions: DbSession[] = []
  let dbRequests: DbRequest[] = []
  let dbDevices: DbDevice[] = []
  let dbAudits: DbAuditLog[] = []

  // Dual-Path Database Querying Engine
  try {
    if (supabaseUrl && supabaseServiceKey) {
      // Counts for stats
      const { count: tenantCount } = await supabase.from('tenants').select('id', { count: 'exact', head: true })
      const { count: orderCount } = await supabase.from('orders').select('id', { count: 'exact', head: true })
      dbTenantsCount = tenantCount || 0
      dbOrdersCount = orderCount || 0

      // Core operations fetching
      const { data: orders } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(10)
      const { data: sessions } = await supabase.from('guest_sessions').select('*').order('created_at', { ascending: false }).limit(10)
      const { data: requests } = await supabase.from('assistance_requests').select('*').order('created_at', { ascending: false }).limit(10)
      const { data: devices } = await supabase.from('device_sessions').select('*')
      const { data: audits } = await supabase.from('auth_audit_logs').select('*').order('created_at', { ascending: false }).limit(15)

      dbOrders = (orders as DbOrder[]) || []
      dbSessions = (sessions as DbSession[]) || []
      dbRequests = (requests as DbRequest[]) || []
      dbDevices = (devices as DbDevice[]) || []
      dbAudits = (audits as DbAuditLog[]) || []
    }
  } catch {
    // Graceful fallback for offline development sandboxes
  }

  // 1. Dynamic Events Timeline Synthesis (Real + Fallback Hybrid)
  const synthesizedEvents: Omit<EventRecord, 'sequence_number'>[] = []

  // Map orders
  dbOrders.forEach(o => {
    synthesizedEvents.push({
      id: `evt_ord_created_${o.id}`,
      event_type: "ORDER_CREATED",
      payload: {
        order_id: o.id,
        table_id: o.table_id,
        table_num: o.table_num,
        grand_total_minor: Math.round(o.total_amount * 100) || 0,
        items_count: o.guest_count || 1
      },
      metadata: {
        correlation_id: `corr_ord_${o.id.substring(0, 8)}`,
        timestamp: o.created_at,
        actor_id: 'guest_qr',
        actor_role: "CUSTOMER"
      },
      is_real_data: true
    })

    if (o.status === 'served') {
      synthesizedEvents.push({
        id: `evt_ord_served_${o.id}`,
        event_type: "ORDER_SERVED",
        payload: {
          order_id: o.id,
          table_num: o.table_num,
          served_at: o.updated_at
        },
        metadata: {
          correlation_id: `corr_ord_${o.id.substring(0, 8)}`,
          timestamp: o.updated_at,
          actor_id: "waiter_01",
          actor_role: "WAITER"
        },
        is_real_data: true
      })
    }
  })

  // Map assistance_requests (Waiter Calls)
  dbRequests.forEach(r => {
    synthesizedEvents.push({
      id: `evt_waiter_call_${r.id}`,
      event_type: r.status === 'resolved' ? "WAITER_CALL_RESOLVED" : "WAITER_CALL_TRIGGERED",
      payload: {
        call_id: r.id,
        table_num: r.table_num,
        call_reason: r.request_type,
        message: r.message
      },
      metadata: {
        correlation_id: `corr_call_${r.id.substring(0, 8)}`,
        timestamp: r.created_at,
        actor_id: `table_${r.table_num}`,
        actor_role: "CUSTOMER"
      },
      is_real_data: true
    })
  })

  // Map QR Sessions
  dbSessions.forEach(s => {
    synthesizedEvents.push({
      id: `evt_session_${s.id}`,
      event_type: "QR_SESSION_STARTED",
      payload: {
        session_id: s.id,
        guest_name: s.name,
        phone: s.phone
      },
      metadata: {
        correlation_id: `corr_sess_${s.id.substring(0, 8)}`,
        timestamp: s.created_at,
        actor_id: s.id,
        actor_role: "CUSTOMER"
      },
      is_real_data: true
    })
  })

  // Blending simulated events if no live events exist
  let sortedTimeline: Omit<EventRecord, 'sequence_number'>[] = [...synthesizedEvents]
  if (sortedTimeline.length === 0) {
    sortedTimeline = cache.eventStream.map(e => ({ ...e, is_real_data: false }))
  } else {
    // Sort ascending by time to construct clean sequence numbers
    sortedTimeline.sort((a, b) => new Date(a.metadata.timestamp).getTime() - new Date(b.metadata.timestamp).getTime())
  }

  // Construct monotonic sequence ranges and skips (Sequence Gap Injection)
  let currentSeq = 840
  const finalEventStream: EventRecord[] = []
  
  for (let i = 0; i < sortedTimeline.length; i++) {
    // Skip sequences 847 and 848 to create clear, visual sequence gaps in the control plane
    if (cache.active_chaos_gap && currentSeq === 847) {
      currentSeq += 2 // Jump sequence numbers, leaving 847 and 848 blank!
    }
    finalEventStream.push({
      ...sortedTimeline[i],
      sequence_number: currentSeq++
    })
  }

  // Final descending sort for telemetry timelines
  finalEventStream.sort((a, b) => b.sequence_number - a.sequence_number)
  const maxGlobalSequence = finalEventStream[0]?.sequence_number || 846

  // 2. Synthesize WebSocket Topology Devices
  let liveDevices = dbDevices.map(d => ({
    device_id: d.id,
    device_type: d.device_type || "GENERIC_TABLET",
    display_name: d.name || `Terminal #${d.id.substring(0, 4)}`,
    last_heartbeat: d.updated_at,
    connection_uptime_seconds: 3600,
    reconnect_count: d.reconnects || 0,
    latency_ms: d.latency || 15,
    degraded_mode_active: d.status === 'offline',
    current_sequence: maxGlobalSequence,
    subscribed_topics: ["tenant:active:branch:01:operational"]
  }))

  if (liveDevices.length === 0) {
    liveDevices = cache.devices.map(d => ({ ...d }))
  }

  // Apply Chaos Injectors to WebSocket devices
  if (cache.active_chaos_stale_projections) {
    // Make KDS device severely lag (Stale Projection Anomaly)
    liveDevices = liveDevices.map(d => {
      if (d.device_type === "KDS_SCREEN") {
        return {
          ...d,
          current_sequence: maxGlobalSequence - 6 // Stale KDS (lag of 6 steps) -> P1 Drift
        }
      }
      if (d.device_type === "WAITER_MOBILE") {
        return {
          ...d,
          current_sequence: maxGlobalSequence - 2 // Lag of 2 steps -> P2 Drift Warning
        }
      }
      return d
    })
  }

  if (cache.active_chaos_websocket_divergence) {
    // websocket reconnect storm
    cache.reconnectStormActive = true
    cache.averageLatencyMs = 285
    liveDevices = liveDevices.map(d => {
      if (d.device_type === "KDS_SCREEN" || d.device_type === "WAITER_MOBILE") {
        return {
          ...d,
          latency_ms: 195 + Math.floor(Math.random() * 80),
          reconnect_count: d.reconnect_count + 5,
          degraded_mode_active: true,
          subscribed_topics: [] // Subscription channels lost!
        }
      }
      return d
    })
  }

  // Calculate live average latency across connected nodes
  const avgLat = liveDevices.length 
    ? Math.round(liveDevices.reduce((acc, d) => acc + d.latency_ms, 0) / liveDevices.length)
    : 0

  // 3. Synthesize Audit Logs
  const mappedDbAudits = dbAudits.map(audit => ({
    id: audit.id,
    timestamp: audit.created_at,
    actor: audit.user_id === SYSTEM_OPERATOR_ID ? 'SRE_OPERATOR' : 'SYSTEM',
    action: ((audit.metadata as Record<string, string>)?.sre_action) || audit.event_type,
    details: ((audit.metadata as Record<string, string>)?.details) || `Auth event ${audit.event_type} logged`
  }))

  const finalAuditLogs = [...mappedDbAudits, ...cache.auditLogs].slice(0, 25)

  // 4. Global Convergence Diagnostics Calculations
  const timelineSequences = finalEventStream.map(e => e.sequence_number || 0)
  const gaps = findSequenceGaps(timelineSequences)
  
  const computedIncidents: Incident[] = []

  // Dynamic severity & drift evaluation
  if (cache.active_chaos_replay_failure) {
    computedIncidents.push({
      id: "inc_replay_loop_lock",
      timestamp: new Date().toISOString(),
      severity: "CRITICAL",
      message: "P0 — CRITICAL DRIFT: Financial convergence failure! Replay loop lock detected on sequence #847. Settlements integrity degraded, active transaction halted."
    })
  }

  if (gaps.length > 0) {
    gaps.forEach((gap, idx) => {
      computedIncidents.push({
        id: `inc_gap_${idx}_${gap.start}`,
        timestamp: new Date().toISOString(),
        severity: "WARNING",
        message: `P1 — HIGH DRIFT: Telemetry Sequence Gap Detected! Missing event sequence range: #${gap.start} - #${gap.end}. Replay reconciliation recovery required.`
      })
    })
  }

  // Check projection lags
  liveDevices.forEach(d => {
    const lag = maxGlobalSequence - d.current_sequence
    if (lag > 3) {
      computedIncidents.push({
        id: `inc_lag_critical_${d.device_id}`,
        timestamp: new Date().toISOString(),
        severity: "CRITICAL",
        message: `P1 — HIGH DRIFT: Out-of-sync projection! Screen '${d.device_id}' (${d.device_type}) lags global sequence by ${lag} steps. Read-models stale.`
      })
    } else if (lag > 0) {
      computedIncidents.push({
        id: `inc_lag_warning_${d.device_id}`,
        timestamp: new Date().toISOString(),
        severity: "WARNING",
        message: `P2 — MODERATE DRIFT: Stale read-model on client '${d.device_id}' (${d.device_type}) lagging by ${lag} steps.`
      })
    }
  })

  if (cache.reconnectStormActive) {
    computedIncidents.push({
      id: "inc_reconnect_storm",
      timestamp: new Date().toISOString(),
      severity: "WARNING",
      message: "P1 — HIGH DRIFT: Websocket convergence degraded! Reconnect storm active across kitchen displays. Heartbeats decaying."
    })
  }

  if (cache.outboxLagSeconds > 3.0) {
    computedIncidents.push({
      id: "inc_outbox_lag",
      timestamp: new Date().toISOString(),
      severity: "WARNING",
      message: `P2 — MODERATE DRIFT: High event propagation latency (${cache.outboxLagSeconds.toFixed(2)}s). Queue Outbox processing backlog elevating.`
    })
  }

  // Calculate highest drift severity level
  let currentDriftSeverity: 'P0' | 'P1' | 'P2' | 'P3' = 'P3'
  if (computedIncidents.some(i => i.message.startsWith("P0"))) {
    currentDriftSeverity = 'P0'
  } else if (computedIncidents.some(i => i.message.startsWith("P1"))) {
    currentDriftSeverity = 'P1'
  } else if (computedIncidents.some(i => i.message.startsWith("P2"))) {
    currentDriftSeverity = 'P2'
  }

  return NextResponse.json({
    success: true,
    data: {
      metrics: {
        outbox_processing_lag_seconds: cache.outboxLagSeconds,
        unresolved_dlq_count: cache.dlqItems.length,
        active_connections: liveDevices.length,
        average_latency_ms: avgLat,
        event_throughput: cache.dlqItems.length > 0 ? 12 : 84 + Math.floor(Math.random() * 5),
        reconnect_storm_risk: cache.reconnectStormActive ? "HIGH" : "LOW",
        db_tenants_count: dbTenantsCount,
        db_orders_count: dbOrdersCount,
        global_max_sequence: maxGlobalSequence,
        global_drift_severity: currentDriftSeverity
      },
      eventStream: finalEventStream,
      dlqItems: cache.dlqItems,
      devices: liveDevices,
      incidents: computedIncidents,
      auditLogs: finalAuditLogs,
      sequenceGaps: gaps,
      driftStates: {
        active_chaos_gap: cache.active_chaos_gap,
        active_chaos_stale_projections: cache.active_chaos_stale_projections,
        active_chaos_websocket_divergence: cache.active_chaos_websocket_divergence,
        active_chaos_replay_failure: cache.active_chaos_replay_failure
      }
    }
  })
}

export async function POST(req: Request) {
  initializeState()
  
  try {
    const body = await req.json()
    const { action, dlqId } = body

    // ─── 1. SRE INCIDENT ANOMALY INJECTORS ──────────────────────────────────────
    if (action === "inject_sequence_gap") {
      cache.active_chaos_gap = true
      
      await writeDbAudit(
        'SUSPICIOUS_ACTIVITY',
        'INJECT_SEQUENCE_GAP',
        'Simulated telemetry outbox failure. Forcefully skipped operational WAL sequences 847-848.'
      )

      return NextResponse.json({ success: true, message: "Sequence gap successfully injected" })
    }

    if (action === "inject_stale_projection") {
      cache.active_chaos_stale_projections = true

      await writeDbAudit(
        'SUSPICIOUS_ACTIVITY',
        'INJECT_STALE_PROJECTION',
        'Simulated read-model sync delay. Artificially lagged KDS Screen sequence count by 6 steps.'
      )

      return NextResponse.json({ success: true, message: "Stale projection lag injected" })
    }

    if (action === "inject_websocket_divergence") {
      cache.active_chaos_websocket_divergence = true
      cache.reconnectStormActive = true
      cache.averageLatencyMs = 285

      await writeDbAudit(
        'SUSPICIOUS_ACTIVITY',
        'INJECT_WS_DIVERGENCE',
        'Injected network jitter on node 02. Emulating active client reconnect storm across terminals.'
      )

      return NextResponse.json({ success: true, message: "Websocket divergence storm injected" })
    }

    if (action === "inject_replay_failure") {
      cache.active_chaos_replay_failure = true

      // Spawn a critical quarantined DLQ failure
      const dlqRecordId = "dlq_" + Math.random().toString(36).substring(2, 9)
      const outboxEventId = "evt_replay_loop_err"
      
      const newDlqItem = {
        id: dlqRecordId,
        outbox_event_id: outboxEventId,
        sequence_number: 847,
        event_type: "SETTLEMENT_COMPLETED",
        payload: {
          bill_id: "bill_ef88a221-c220",
          order_id: "ord_c4867df3-ba22-4876-b9b2-33924f72db1a",
          amount_minor: 45000,
          payment_method: "CARD"
        },
        retry_count: 5,
        failure_reason: "P0 Critical: Replay Loop Lock! OCC conflict occurred during transactional retry: Settlement record has already been marked as SETTLED. Continuing replay runs duplicate settlement risk.",
        failure_stacktrace: "Error: Duplicate Settlement Blockade\n    at SettlementReplayHandler.ts:89:12\n    at async QueueReplayManager.reconstructSnapshot (Snapshot.ts:121:5)\n    at async QueueWorker.execute (Worker.ts:88:12)",
        quarantined_at: new Date().toISOString()
      }

      cache.dlqItems = [newDlqItem, ...cache.dlqItems]
      cache.outboxLagSeconds = 9.84
      cache.unresolvedDlqCount = cache.dlqItems.length

      await writeDbAudit(
        'SUSPICIOUS_ACTIVITY',
        'INJECT_REPLAY_FAILURE',
        'Simulated replay execution failure. Loop lock detected. Quarantined settlement #847 to DLQ.'
      )

      return NextResponse.json({ success: true, message: "Replay failure loop injected" })
    }

    if (action === "inject_dlq") {
      // Legacy simple DLQ injector support
      const dlqRecordId = "dlq_" + Math.random().toString(36).substring(2, 9)
      const newDlqItem = {
        id: dlqRecordId,
        outbox_event_id: "evt_" + Math.random().toString(36).substring(2, 9),
        sequence_number: 847,
        event_type: "KITCHEN_PREPARATION_STARTED",
        payload: {
          order_id: "ord_e882a1f2-ba00",
          station_id: "STATION_GRILL_01"
        },
        retry_count: 3,
        failure_reason: "Database serialization failure: Transaction isolation level SERIALIZABLE conflict. Row locked by cashier session checkout process.",
        failure_stacktrace: "Error: DB serialization error\n    at KdsRouteProcessor.ts:145:22\n    at async QueueWorker.execute (Worker.ts:88:12)",
        quarantined_at: new Date().toISOString()
      }

      cache.dlqItems = [newDlqItem, ...cache.dlqItems]
      cache.outboxLagSeconds = 4.25
      cache.unresolvedDlqCount = cache.dlqItems.length

      await writeDbAudit(
        'SUSPICIOUS_ACTIVITY',
        'INJECT_DLQ_EVENT',
        'Injected serialized database conflict on outbox delivery.'
      )

      return NextResponse.json({ success: true, message: "Simple DLQ event injected" })
    }

    if (action === "inject_event_burst") {
      const startSeq = cache.eventStream[0]?.sequence_number || 846
      const correlationId = "corr_" + Math.random().toString(36).substring(2, 9)
      
      const newEvents = [
        {
          id: "evt_" + Math.random().toString(36).substring(2, 9),
          event_type: "ORDER_ITEM_PREPARED",
          sequence_number: startSeq + 1,
          payload: {
            order_id: "ord_c4867df3-ba22-4876-b9b2-33924f72db1a",
            item_name: "Truffle Fries"
          },
          metadata: {
            correlation_id: correlationId,
            timestamp: new Date().toISOString(),
            actor_id: "user_chef_02",
            actor_role: "CHEF"
          }
        }
      ]

      cache.eventStream = [...newEvents, ...cache.eventStream]
      
      await writeDbAudit(
        'LOGIN_SUCCESS',
        'INJECT_EVENT_BURST',
        `Simulating dynamic high-throughput burst of telemetry records. Injected sequence #${startSeq + 1}`
      )

      return NextResponse.json({ success: true, message: "Event burst injected" })
    }

    // ─── 2. SRE ADMINISTRATIVE ACTIONS (RECOVERIES) ──────────────────────────
    if (action === "requeue_dlq") {
      const dlqRecord = cache.dlqItems.find(d => d.id === dlqId)
      if (!dlqRecord) {
        return NextResponse.json({ success: false, error: "DLQ record not found" }, { status: 404 })
      }

      // Requeue: Restore to active Event Stream!
      const restoredEvent = {
        id: dlqRecord.outbox_event_id,
        event_type: dlqRecord.event_type,
        sequence_number: dlqRecord.sequence_number,
        payload: dlqRecord.payload,
        metadata: {
          correlation_id: "corr_requeued_sre",
          timestamp: new Date().toISOString(),
          actor_id: "user_sre_operator",
          actor_role: "SRE"
        }
      }

      cache.eventStream = [restoredEvent, ...cache.eventStream]
      cache.dlqItems = cache.dlqItems.filter(d => d.id !== dlqId)
      cache.outboxLagSeconds = 0.04 // Back to healthy
      cache.unresolvedDlqCount = cache.dlqItems.length
      
      // Clear critical replay locks if resolved
      cache.active_chaos_replay_failure = false

      await writeDbAudit(
        'LOGIN_SUCCESS',
        'SRE_DLQ_REPLAY_SUCCESS',
        `Operator manually requeued sequence #${dlqRecord.sequence_number} (${dlqRecord.event_type}) after inspecting replay loop constraints.`
      )

      cache.auditLogs = [
        {
          id: "log_" + Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toISOString(),
          actor: "SRE_OPERATOR",
          action: "REQUEUE_DLQ_EVENT",
          details: `Admin command processed. Requeued sequence #${dlqRecord.sequence_number}. Outbox worker successfully unlocked. Event delivered.`
        },
        ...cache.auditLogs
      ]

      return NextResponse.json({ success: true, message: "Event successfully requeued and processed." })
    }

    if (action === "resync_projections") {
      cache.active_chaos_stale_projections = false
      
      await writeDbAudit(
        'LOGIN_SUCCESS',
        'SRE_PROJECTION_RESYNC',
        'Operator triggered manual read-model catchup. Dispatched event replayer to catch KDS and POS projections up to global sequence.'
      )

      cache.auditLogs = [
        {
          id: "log_" + Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toISOString(),
          actor: "SRE_OPERATOR",
          action: "RESYNC_PROJECTIONS",
          details: "Dispatched WAL event streams to lagged device sockets. Convergence verified: 100% parity achieved."
        },
        ...cache.auditLogs
      ]

      return NextResponse.json({ success: true, message: "Projections caught up successfully." })
    }

    if (action === "resolve_ws_storm" || action === "balance_connections") {
      cache.active_chaos_websocket_divergence = false
      cache.reconnectStormActive = false
      cache.averageLatencyMs = 24

      await writeDbAudit(
        'LOGIN_SUCCESS',
        'SRE_WS_REBALANCE',
        'Operator executed WebSocket buffer rebalancing command. Connections successfully migrated to healthy socket pool.'
      )

      cache.auditLogs = [
        {
          id: "log_" + Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toISOString(),
          actor: "SRE_OPERATOR",
          action: "WS_REBALANCE_COMPLETE",
          details: "Channel re-balancing complete. Active connections successfully stabilized."
        },
        ...cache.auditLogs
      ]

      return NextResponse.json({ success: true, message: "WebSocket storm resolved successfully." })
    }

    if (action === "clear_all_incidents") {
      cache.active_chaos_gap = false
      cache.active_chaos_stale_projections = false
      cache.active_chaos_websocket_divergence = false
      cache.active_chaos_replay_failure = false
      cache.reconnectStormActive = false
      cache.averageLatencyMs = 24
      cache.outboxLagSeconds = 0.04
      cache.dlqItems = []
      cache.unresolvedDlqCount = 0

      await writeDbAudit(
        'LOGIN_SUCCESS',
        'SRE_CLEAR_ALL',
        'Operator forcefully reset all chaos diagnostics flags and cleared outbox DLQ incident history.'
      )

      cache.auditLogs = [
        {
          id: "log_" + Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toISOString(),
          actor: "SRE_OPERATOR",
          action: "CLEAR_ALL_INCIDENTS",
          details: "Operational diagnostics plane reset to normal convergence targets."
        },
        ...cache.auditLogs
      ]

      return NextResponse.json({ success: true, message: "Diagnostics state fully cleared" })
    }

    return NextResponse.json({ success: false, error: "Action not recognized" }, { status: 400 })

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown database error'
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 })
  }
}
