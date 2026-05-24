'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'

interface TelemetryMetrics {
  outbox_processing_lag_seconds: number
  unresolved_dlq_count: number
  active_connections: number
  average_latency_ms: number
  event_throughput: number
  reconnect_storm_risk: 'HIGH' | 'LOW'
  db_tenants_count: number
  db_orders_count: number
  global_max_sequence: number
  global_drift_severity: 'P0' | 'P1' | 'P2' | 'P3'
}

interface EventRecord {
  id: string
  event_type: string
  sequence_number: number
  payload: Record<string, unknown>
  metadata: {
    correlation_id: string
    timestamp: string
    actor_id: string
    actor_role: string
  }
  is_real_data?: boolean
}

interface DlqRecord {
  id: string
  outbox_event_id: string
  sequence_number: number
  event_type: string
  payload: Record<string, unknown>
  retry_count: number
  failure_reason: string
  failure_stacktrace: string
  quarantined_at: string
}

interface DeviceRecord {
  device_id: string
  device_type: string
  display_name: string
  last_heartbeat: string
  connection_uptime_seconds: number
  reconnect_count: number
  latency_ms: number
  degraded_mode_active: boolean
  current_sequence: number
  subscribed_topics: string[]
}

interface SreLog {
  id: string
  timestamp: string
  actor: string
  action: string
  details: string
}

interface IncidentRecord {
  id: string
  timestamp: string
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  message: string
}

interface SequenceGap {
  start: number
  end: number
  status: 'missing' | 'replaying'
}

export default function DiagnosticsPage() {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'telemetry' | 'stream' | 'dlq' | 'websocket'>('telemetry')

  // Telemetry data from API
  const [metrics, setMetrics] = useState<TelemetryMetrics | null>(null)
  const [eventStream, setEventStream] = useState<EventRecord[]>([])
  const [dlqItems, setDlqItems] = useState<DlqRecord[]>([])
  const [devices, setDevices] = useState<DeviceRecord[]>([])
  const [incidents, setIncidents] = useState<IncidentRecord[]>([])
  const [auditLogs, setAuditLogs] = useState<SreLog[]>([])
  const [sequenceGaps, setSequenceGaps] = useState<SequenceGap[]>([])
  
  const [loading, setLoading] = useState(true)
  const [requeuingId, setRequeuingId] = useState<string | null>(null)
  const [solvingStorm, setSolvingStorm] = useState(false)
  const [clearingAll, setClearingAll] = useState(false)
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null)
  const [expandedDlqId, setExpandedDlqId] = useState<string | null>(null)

  // Interactive sequence block selection
  const [selectedBlock, setSelectedBlock] = useState<{ seq: number; status: string; state: 'ok' | 'gap' | 'loop' } | null>(null)

  // Filter states for live stream
  const [typeFilter, setTypeFilter] = useState('')
  const [correlationFilter, setCorrelationFilter] = useState('')

  // Throughput chart history array (stores past 12 counts)
  const [throughputHistory, setThroughputHistory] = useState<number[]>([45, 52, 60, 48, 55, 62, 50, 44, 58, 65, 84, 88])

  // Fetch diagnostics bundle from route
  const fetchDiagnostics = useCallback((showLoading = false) => {
    if (showLoading) setLoading(true)
    fetch('/api/diagnostics')
      .then(res => res.json())
      .then(res => {
        if (res.success && res.data) {
          setMetrics(res.data.metrics)
          setEventStream(res.data.eventStream)
          setDlqItems(res.data.dlqItems)
          setDevices(res.data.devices)
          setIncidents(res.data.incidents)
          setAuditLogs(res.data.auditLogs)
          setSequenceGaps(res.data.sequenceGaps || [])

          // Update chart history
          setThroughputHistory(prev => {
            const next = [...prev.slice(1), res.data.metrics.event_throughput]
            return next
          })
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Poll for realtime updates
  useEffect(() => {
    fetchDiagnostics(true)
    const interval = setInterval(() => fetchDiagnostics(false), 2000)
    return () => clearInterval(interval)
  }, [fetchDiagnostics])

  // Inject Anomaly Helpers
  const injectAnomaly = async (type: string) => {
    try {
      const res = await fetch('/api/diagnostics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: type })
      })
      const data = await res.json()
      if (data.success) {
        fetchDiagnostics(false)
      }
    } catch (e) {
      console.error(e)
    }
  }

  // Recovery Pipeline triggers
  const handleRequeue = async (dlqId: string) => {
    setRequeuingId(dlqId)
    try {
      const res = await fetch('/api/diagnostics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'requeue_dlq', dlqId })
      })
      const data = await res.json()
      if (data.success) {
        setExpandedDlqId(null)
        setSelectedBlock(null)
        fetchDiagnostics(false)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setRequeuingId(null)
    }
  }

  const handleResolveStorm = async () => {
    setSolvingStorm(true)
    try {
      const res = await fetch('/api/diagnostics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve_ws_storm' })
      })
      const data = await res.json()
      if (data.success) {
        fetchDiagnostics(false)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSolvingStorm(false)
    }
  }

  const handleResyncProjections = async () => {
    setSolvingStorm(true)
    try {
      const res = await fetch('/api/diagnostics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resync_projections' })
      })
      const data = await res.json()
      if (data.success) {
        setSelectedBlock(null)
        fetchDiagnostics(false)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSolvingStorm(false)
    }
  }

  const handleClearAll = async () => {
    setClearingAll(true)
    try {
      const res = await fetch('/api/diagnostics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_all_incidents' })
      })
      const data = await res.json()
      if (data.success) {
        setSelectedBlock(null)
        fetchDiagnostics(false)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setClearingAll(false)
    }
  }

  // Live Stream Filtering
  const filteredEvents = eventStream.filter(e => {
    const typeMatch = e.event_type.toLowerCase().includes(typeFilter.toLowerCase())
    const corrMatch = e.metadata.correlation_id.toLowerCase().includes(correlationFilter.toLowerCase())
    return typeMatch && corrMatch
  })

  // Format Helper: uptime format
  const formatUptime = (sec: number) => {
    const hrs = Math.floor(sec / 3600)
    const mins = Math.floor((sec % 3600) / 60)
    return `${hrs}h ${mins}m`
  }

  // Throughput chart helpers
  const svgW = 400
  const svgH = 80
  const maxTh = Math.max(...throughputHistory, 1)
  const pts = throughputHistory.map((val, i) => ({
    x: (i / (throughputHistory.length - 1)) * svgW,
    y: svgH - (val / maxTh) * (svgH - 12) - 4
  }))
  const pathD = pts.length > 1
    ? `M${pts[0].x},${pts[0].y} ` + pts.slice(1).map(p => `L${p.x},${p.y}`).join(' ')
    : ''
  const areaD = pts.length > 1
    ? `M${pts[0].x},${svgH} L${pts[0].x},${pts[0].y} ` + pts.slice(1).map(p => `L${p.x},${p.y}`).join(' ') + ` L${pts[pts.length - 1].x},${svgH} Z`
    : ''

  // Sequence block click handler
  const handleBlockClick = (block: { seq: number; status: string; state: 'ok' | 'gap' | 'loop' }) => {
    setSelectedBlock(selectedBlock?.seq === block.seq ? null : block)
  }

  return (
    <div className="px-8 py-8 pb-16 bg-[#131313] min-h-screen text-[#F5F5F5] font-sans selection:bg-[#C0272D]/30 selection:text-white">
      
      {/* ─── TITLE & ANOMALY INJECTORS ─────────────────────────────────────── */}
      <header className="mb-6 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[#C0272D] text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
              terminal
            </span>
            <h1 className="text-3xl font-black tracking-tighter">OPERATIONAL CONTROL PLANE</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-[#555555] uppercase tracking-[0.2em]">Distributed Observability & Recovery Engine</span>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
            <span className="text-[9px] font-mono text-[#444] px-1.5 py-0.5 bg-[#1C1B1B] rounded border border-[#2A2A2A]">branch: main</span>
          </div>
        </div>

        {/* SRE Anomaly Injectors Console Panel */}
        <div className="bg-[#1C1B1B] border border-[#2A2A2A] p-4 rounded-xl flex flex-wrap items-center gap-3 max-w-full">
          <div className="flex items-center gap-2 text-[#C0272D] mr-2">
            <span className="material-symbols-outlined text-sm font-black animate-pulse">crisis_alert</span>
            <span className="text-[9px] font-black uppercase tracking-widest">SRE DRIFT INJECTORS:</span>
          </div>
          
          <button
            onClick={() => injectAnomaly('inject_sequence_gap')}
            className="px-3 py-1.5 bg-[#C0272D]/10 hover:bg-[#C0272D]/20 border border-[#C0272D]/30 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all"
          >
            💥 Sequence Gap
          </button>
          
          <button
            onClick={() => injectAnomaly('inject_stale_projection')}
            className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all"
          >
            🔄 Lag Projections
          </button>

          <button
            onClick={() => injectAnomaly('inject_websocket_divergence')}
            className="px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all"
          >
            🌪️ WS Divergence
          </button>

          <button
            onClick={() => injectAnomaly('inject_replay_failure')}
            className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/35 border border-red-500/40 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all text-red-300 animate-pulse"
          >
            🔥 Replay Failure (P0)
          </button>

          <button
            onClick={handleClearAll}
            disabled={clearingAll}
            className="px-3 py-1.5 bg-[#0D0D0D] hover:bg-[#131313] border border-[#2A2A2A] hover:border-[#C0272D] text-[9px] font-black uppercase tracking-widest rounded-lg transition-all disabled:opacity-50"
          >
            {clearingAll ? 'Clearing...' : '🧹 Clear All'}
          </button>
        </div>
      </header>

      {/* ─── PHASE 1.6 GLOBAL CONVERGENCE DRIFT ALERTS BANNER ──────────────── */}
      {metrics && metrics.global_drift_severity !== 'P3' && (
        <div className={`mb-6 p-5 rounded-xl border relative overflow-hidden transition-all duration-500 ${
          metrics.global_drift_severity === 'P0' 
            ? 'bg-[#C0272D]/10 border-[#C0272D]/50 shadow-[0_0_35px_rgba(192,39,45,0.15)] text-[#ffb4ab]' 
            : metrics.global_drift_severity === 'P1'
            ? 'bg-amber-500/10 border-amber-500/40 shadow-[0_0_25px_rgba(245,158,11,0.08)] text-amber-300 animate-pulse-slow'
            : 'bg-yellow-500/5 border-yellow-500/30 text-yellow-200'
        }`}>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex gap-3.5">
              <span className="material-symbols-outlined text-2xl shrink-0 mt-0.5 animate-bounce text-[#C0272D]" style={{ fontVariationSettings: "'FILL' 1" }}>
                {metrics.global_drift_severity === 'P0' ? 'error' : 'warning'}
              </span>
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider font-mono">
                  {metrics.global_drift_severity === 'P0' 
                    ? '🔥 P0 — CRITICAL FINANCIAL DRIFT & REPLAY LOOP DETECTED' 
                    : metrics.global_drift_severity === 'P1'
                    ? '⚡ P1 — HIGH CONVERGENCE DRIFT DETECTED'
                    : '⚠️ P2 — MODERATE OPERATIONAL DRIFT'}
                </h4>
                <p className="text-[11px] font-medium leading-relaxed mt-1 opacity-90">
                  {metrics.global_drift_severity === 'P0' 
                    ? 'Financial loop lock: Transaction sequence #847 blocked due to database serialization rollback conflict during replay. Potential double-settlement risk!'
                    : metrics.global_drift_severity === 'P1'
                    ? 'WebSocket subscriber divergence & projection sequence desynchronization active. KDS screens and waiter terminals display lagging read-models.'
                    : 'Propagation timing delay elevated on outbox event queues. Event-throughput lags normal performance SLAs.'}
                </p>
                
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[9px] font-mono font-bold uppercase opacity-75">
                  <span>Escalation Target: <span className="underline decoration-red-500 font-black">{metrics.global_drift_severity === 'P0' ? 'L3 PLATFORM CORE ON-CALL (PAGED)' : metrics.global_drift_severity === 'P1' ? 'LEVEL-2 SYSTEMS ARCHITECT' : 'STANDARD ALERTS LOG'}</span></span>
                  <span>Recovery Protocol: <span className="underline decoration-amber-500">{metrics.global_drift_severity === 'P0' ? 'REPLAY SNAPSHOT SYNC' : metrics.global_drift_severity === 'P1' ? 'PROJECTION CATCH-UP' : 'PARTITION FLUSH'}</span></span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2 whitespace-nowrap shrink-0 self-end md:self-center">
              {metrics.global_drift_severity === 'P0' && dlqItems.length > 0 && (
                <button
                  onClick={() => handleRequeue(dlqItems[0].id)}
                  disabled={requeuingId !== null}
                  className="px-3 py-1.5 bg-[#C0272D] text-white hover:bg-red-700 text-[9px] font-black uppercase tracking-widest rounded-lg border border-[#C0272D] transition-all shadow-[0_0_12px_rgba(192,39,45,0.4)]"
                >
                  {requeuingId ? 'Replaying...' : '⚡ Replay & Force Converge'}
                </button>
              )}
              
              {metrics.global_drift_severity === 'P1' && (
                <>
                  <button
                    onClick={handleResyncProjections}
                    disabled={solvingStorm}
                    className="px-3 py-1.5 bg-amber-500 text-black hover:bg-amber-400 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all disabled:opacity-50"
                  >
                    {solvingStorm ? 'Resynching...' : '🔄 Resync Projections'}
                  </button>
                  <button
                    onClick={handleResolveStorm}
                    disabled={solvingStorm}
                    className="px-3 py-1.5 bg-[#0D0D0D] hover:bg-[#131313] border border-[#2A2A2A] text-[9px] font-black uppercase tracking-widest rounded-lg text-amber-400 hover:border-amber-500/40 disabled:opacity-50"
                  >
                    {solvingStorm ? 'Balancing...' : '🌪️ Balance WebSockets'}
                  </button>
                </>
              )}

              <button
                onClick={handleClearAll}
                className="px-3 py-1.5 bg-[#0D0D0D] hover:bg-[#131313] border border-[#2A2A2A] text-[9px] font-black uppercase tracking-widest rounded-lg transition-all text-[#777]"
              >
                Reset Incidents
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── METRIC CARDS GRID ──────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        
        {/* Outbox Lag */}
        <div className={`p-6 rounded-[14px] bg-[#1C1B1B] border transition-all duration-500 relative overflow-hidden ${metrics && metrics.outbox_processing_lag_seconds > 1.0 ? 'border-[#C0272D]/60 shadow-[0_0_30px_rgba(192,39,45,0.05)]' : 'border-[#2A2A2A]'}`}>
          <p className="text-[10px] font-black text-[#555555] uppercase tracking-[0.2em] mb-4">Outbox Lag Delay</p>
          <div className="flex items-end gap-2.5">
            <h2 className={`text-4xl font-black font-mono leading-none tracking-tighter ${metrics && metrics.outbox_processing_lag_seconds > 1.0 ? 'text-[#ffb4ab]' : 'text-[#F5F5F5]'}`}>
              {loading ? '—' : `${metrics?.outbox_processing_lag_seconds.toFixed(2)}s`}
            </h2>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider mb-0.5 ${metrics && metrics.outbox_processing_lag_seconds > 1.0 ? 'bg-[#C0272D]/20 text-[#ffb3ae] animate-pulse' : 'bg-[#2A2A2A] text-[#555]'}`}>
              {metrics && metrics.outbox_processing_lag_seconds > 1.0 ? 'STUCK' : 'HEALTHY'}
            </span>
          </div>
          <p className="text-[8px] font-bold text-[#333] mt-3 uppercase tracking-widest">Append-only queue delay</p>
        </div>

        {/* DLQ Quarantined */}
        <div className={`p-6 rounded-[14px] bg-[#1C1B1B] border transition-all duration-500 relative overflow-hidden ${metrics && metrics.unresolved_dlq_count > 0 ? 'border-[#C0272D]/60 shadow-[0_0_30px_rgba(192,39,45,0.08)]' : 'border-[#2A2A2A]'}`}>
          <p className="text-[10px] font-black text-[#555555] uppercase tracking-[0.2em] mb-4">DLQ Quarantined</p>
          <div className="flex items-end gap-2.5">
            <h2 className={`text-4xl font-black font-mono leading-none tracking-tighter ${metrics && metrics.unresolved_dlq_count > 0 ? 'text-[#ffb4ab]' : 'text-[#F5F5F5]'}`}>
              {loading ? '—' : metrics?.unresolved_dlq_count}
            </h2>
            {metrics && metrics.unresolved_dlq_count > 0 && (
              <span className="w-2.5 h-2.5 bg-[#C0272D] rounded-full animate-ping shadow-[0_0_10px_#C0272D] mb-2" />
            )}
          </div>
          <p className="text-[8px] font-bold text-[#333] mt-3 uppercase tracking-widest">Failed retry operations</p>
        </div>

        {/* Active WS Connections */}
        <div className={`p-6 rounded-[14px] bg-[#1C1B1B] border transition-all duration-500 relative overflow-hidden ${metrics && metrics.reconnect_storm_risk === 'HIGH' ? 'border-amber-500/50' : 'border-[#2A2A2A]'}`}>
          <p className="text-[10px] font-black text-[#555555] uppercase tracking-[0.2em] mb-4">Active Sockets</p>
          <div className="flex items-end gap-2.5">
            <h2 className="text-4xl font-black font-mono leading-none tracking-tighter text-[#F5F5F5]">
              {loading ? '—' : metrics?.active_connections}
            </h2>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider mb-0.5 ${metrics && metrics.reconnect_storm_risk === 'HIGH' ? 'bg-amber-500/10 text-amber-400 animate-pulse' : 'bg-emerald-500/10 text-emerald-400'}`}>
              {metrics?.reconnect_storm_risk === 'HIGH' ? 'STORM' : 'BALANCED'}
            </span>
          </div>
          <p className="text-[8px] font-bold text-[#333] mt-3 uppercase tracking-widest">Device nodes connected</p>
        </div>

        {/* WS Network Latency */}
        <div className={`p-6 rounded-[14px] bg-[#1C1B1B] border transition-all duration-500 relative overflow-hidden ${metrics && metrics.average_latency_ms > 100 ? 'border-amber-500/50' : 'border-[#2A2A2A]'}`}>
          <p className="text-[10px] font-black text-[#555555] uppercase tracking-[0.2em] mb-4">Connection Latency</p>
          <div className="flex items-end gap-2.5">
            <h2 className={`text-4xl font-black font-mono leading-none tracking-tighter ${metrics && metrics.average_latency_ms > 100 ? 'text-amber-400 animate-pulse' : 'text-[#F5F5F5]'}`}>
              {loading ? '—' : `${metrics?.average_latency_ms}ms`}
            </h2>
            <span className="text-[8px] font-bold text-[#333] mb-1.5 uppercase tracking-widest">Heartbeat echo</span>
          </div>
          <p className="text-[8px] font-bold text-[#333] mt-3 uppercase tracking-widest">Global proxy loop average</p>
        </div>
      </section>

      {/* ─── CORE NAVIGATION TABS ─────────────────────────────────────────── */}
      <nav className="flex border-b border-[#2A2A2A] mb-6 gap-1.5">
        {([
          { key: 'telemetry', label: 'Vitals & Telemetry', icon: 'monitoring', alertCount: 0 },
          { key: 'stream', label: 'Event Stream', icon: 'timeline', alertCount: sequenceGaps.length },
          { key: 'dlq', label: 'Outbox & DLQ', icon: 'rule_folder', alertCount: metrics?.unresolved_dlq_count ?? 0 },
          { key: 'websocket', label: 'WS Connections', icon: 'wifi_tethering', alertCount: metrics?.reconnect_storm_risk === 'HIGH' ? 1 : 0 }
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2.5 px-6 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all cursor-pointer relative ${activeTab === tab.key ? 'text-[#F5F5F5] border-[#C0272D] bg-[#1C1B1B]/40' : 'text-[#555] border-transparent hover:text-[#F5F5F5] hover:bg-[#131313]'}`}
          >
            <span className="material-symbols-outlined text-sm">{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.alertCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#C0272D] text-white text-[8px] font-bold shadow-[0_0_8px_rgba(192,39,45,0.4)]">
                {tab.alertCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* ─── TAB VIEWPORTS ────────────────────────────────────────────────── */}
      <section className="min-h-[400px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-8 h-8 rounded-full border-2 border-[#2A2A2A] border-t-[#C0272D] animate-spin" />
            <p className="text-[10px] font-black text-[#555] uppercase tracking-widest">Accessing core pipeline telemetry...</p>
          </div>
        ) : (
          <>
            {/* ─── 1. VITALS & TELEMETRY TAB ─── */}
            {activeTab === 'telemetry' && (
              <div className="space-y-6">
                
                {/* 1.6 INTERACTIVE SEQUENCE GAP HEATMAP */}
                {(() => {
                  const maxSeq = metrics?.global_max_sequence || 846
                  const blocksCount = 20
                  const blocks = []

                  for (let i = blocksCount - 1; i >= 0; i--) {
                    const seq = maxSeq - i
                    const hasDlq = dlqItems.some(item => item.sequence_number === seq)
                    const isGap = sequenceGaps.some(g => seq >= g.start && seq <= g.end)
                    
                    let blockColor = 'bg-[#1C1B1B] border-[#2A2A2A] text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/5'
                    let statusLabel = 'OK'
                    let state: 'ok' | 'gap' | 'loop' = 'ok'
                    
                    if (hasDlq) {
                      blockColor = 'bg-red-500/10 border-red-500/60 text-red-400 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.1)] hover:bg-red-500/20'
                      statusLabel = 'LOOP'
                      state = 'loop'
                    } else if (isGap) {
                      blockColor = 'bg-amber-500/5 border-dashed border-amber-500/50 text-amber-400 animate-pulse-slow hover:bg-amber-500/10'
                      statusLabel = 'GAP'
                      state = 'gap'
                    }

                    blocks.push({ seq, color: blockColor, status: statusLabel, state })
                  }

                  return (
                    <div className="bg-[#1C1B1B] border border-[#2A2A2A] rounded-xl p-6">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 pb-3 border-b border-[#2A2A2A]">
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-widest text-[#F5F5F5]">SEQUENCE DRIFT PARITY HEATMAP</h4>
                          <p className="text-[9px] font-bold text-[#555] uppercase mt-1">Write-Ahead Log (WAL) event sequence convergence analyzer</p>
                        </div>
                        <div className="flex flex-wrap gap-4 text-[9px] font-mono font-bold uppercase text-[#555]">
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-500/10 border border-emerald-500/40" /> Converged</span>
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-amber-500/5 border border-dashed border-amber-500/40 animate-pulse" /> Sequence Gap</span>
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-red-500/10 border border-red-500/40 animate-pulse" /> Replay Loop Lock</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-10 gap-3">
                        {blocks.map((block) => (
                          <div
                            key={block.seq}
                            onClick={() => handleBlockClick(block)}
                            className={`p-3.5 rounded-xl border flex flex-col justify-between items-center h-16 cursor-pointer transform hover:scale-105 active:scale-95 transition-all ${block.color}`}
                          >
                            <span className="text-[9px] font-mono font-bold">#{block.seq}</span>
                            <span className="text-[8px] font-black tracking-widest uppercase">{block.status}</span>
                          </div>
                        ))}
                      </div>

                      {/* Selected block details overlay */}
                      {selectedBlock && (
                        <div className="mt-5 p-4 bg-[#0D0D0D] border border-[#2A2A2A] rounded-lg text-xs font-mono space-y-2.5 animate-fade-in relative">
                          <button onClick={() => setSelectedBlock(null)} className="absolute top-2.5 right-3 text-[#555] hover:text-[#F5F5F5] text-lg font-bold">&times;</button>
                          
                          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider border-b border-[#2A2A2A] pb-1.5">
                            <span className={selectedBlock.state === 'ok' ? 'text-emerald-400' : selectedBlock.state === 'gap' ? 'text-amber-400' : 'text-red-400'}>
                              WAL SEQUENCE AUDIT -- BLOCK #{selectedBlock.seq}
                            </span>
                            <span className="px-2 py-0.5 bg-[#1C1B1B] text-[#555] rounded text-[8px]">STATUS: {selectedBlock.status}</span>
                          </div>

                          {selectedBlock.state === 'ok' && (
                            <p className="text-[#888] leading-relaxed text-[11px]">
                              Parity verified. Event sequence #{selectedBlock.seq} committed successfully. All downstream projections fanned out and synchronized.
                            </p>
                          )}
                          
                          {selectedBlock.state === 'gap' && (
                            <div className="space-y-2 text-[#a8a8a8]">
                              <p className="leading-relaxed text-[11px] text-amber-200">
                                ⚠️ Sequence Gap: Sequence #{selectedBlock.seq} skipped outbox transmission due to simulation event skips. Analytical and kitchen projections are currently stale.
                              </p>
                              <div className="flex gap-4 text-[9px] font-bold uppercase pt-1 items-center">
                                <span className="text-[#555]">SRE Recommendation: Run WAL catch-up replay</span>
                                <button
                                  onClick={handleResyncProjections}
                                  className="px-2.5 py-1 bg-amber-500 text-black hover:bg-amber-400 font-bold uppercase rounded text-[8px] transition-all"
                                >
                                  🔄 Replay Range
                                </button>
                              </div>
                            </div>
                          )}

                          {selectedBlock.state === 'loop' && (
                            <div className="space-y-2 text-[#a8a8a8]">
                              <p className="leading-relaxed text-[11px] text-red-200">
                                🔥 Replay Loop Lock: Event #{selectedBlock.seq} quarantined in Dead-Letter Queue. Optimistic Concurrency Control serialization error occurred during active database retry. Safeguards engaged.
                              </p>
                              <div className="flex gap-4 text-[9px] font-bold uppercase pt-1 items-center">
                                <span className="text-[#555]">SRE Protocol: Force snapshot replay and requeue</span>
                                {dlqItems.length > 0 && (
                                  <button
                                    onClick={() => handleRequeue(dlqItems[0].id)}
                                    className="px-2.5 py-1 bg-[#C0272D] text-white hover:bg-red-700 font-bold uppercase rounded text-[8px] transition-all shadow-[0_0_10px_rgba(192,39,45,0.3)] animate-pulse"
                                  >
                                    ⚡ Requeue DLQ
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Event throughput real-time graph & Waterfall trace chart */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Realtime Event Throughput */}
                  <div className="lg:col-span-2 p-6 rounded-[14px] bg-[#1C1B1B] border border-[#2A2A2A] flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h3 className="text-sm font-black tracking-tight uppercase">Operational Event Throughput</h3>
                        <p className="text-[9px] font-bold text-[#555] uppercase tracking-wider mt-1">Events fanned out / sec over active socket streams</p>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-sm font-black text-emerald-400">
                        <span>{metrics?.event_throughput} e/s</span>
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                      </div>
                    </div>

                    {/* SVG mini chart */}
                    <div className="w-full h-[150px] relative py-4 bg-[#0D0D0D]/60 rounded-xl border border-[#2A2A2A]/40 overflow-hidden flex items-center justify-center">
                      <svg className="w-full h-full" viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="flowGrad" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#C0272D" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#C0272D" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path d={areaD} fill="url(#flowGrad)" />
                        <path d={pathD} fill="none" stroke="#C0272D" strokeWidth="2.5" strokeLinecap="round" />
                      </svg>
                    </div>
                  </div>

                  {/* SRE Terminal Console Logs */}
                  <div className="p-6 rounded-[14px] bg-[#0D0D0D] border border-[#2A2A2A] flex flex-col justify-between h-[256px]">
                    <div className="flex justify-between items-center mb-4 border-b border-[#2A2A2A] pb-3 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#C0272D] flex items-center justify-center">
                          <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                        </span>
                        <span className="text-[9px] font-black uppercase tracking-widest text-[#F5F5F5]">SRE COMPLIANCE CONSOLE LOGS</span>
                      </div>
                      <span className="text-[8px] font-mono text-[#444]">LEVEL_4_AUDIT</span>
                    </div>
                    
                    {/* Console logs list */}
                    <div className="flex-1 overflow-y-auto space-y-3 font-mono text-[9px] pr-2 scrollbar-thin">
                      {auditLogs.map(log => (
                        <div key={log.id} className="space-y-1">
                          <div className="flex justify-between text-[#555] font-bold">
                            <span className={log.action.includes('CHAOS') || log.action.includes('SUSPICIOUS') ? 'text-red-400' : 'text-[#888]'}>
                              [{log.actor}] {log.action}
                            </span>
                            <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <p className="text-[#a8a8a8] leading-relaxed pl-2 border-l border-[#C0272D]/30">{log.details}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 1.6 ACTIVE CONVERGENCE INCIDENTS FEED */}
                <div className="bg-[#1C1B1B] border border-[#2A2A2A] rounded-xl p-6">
                  <div className="flex justify-between items-center mb-4 pb-3 border-b border-[#2A2A2A]">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#C0272D] text-sm font-black animate-pulse">campaign</span>
                      <h4 className="text-xs font-black uppercase tracking-widest text-[#F5F5F5]">ACTIVE CONVERGENCE INCIDENTS ({incidents.length})</h4>
                    </div>
                    <span className="text-[8px] font-mono text-[#555] uppercase">Realtime Diagnostics Engine</span>
                  </div>
                  {incidents.length === 0 ? (
                    <div className="flex items-center gap-2 py-4 px-4 bg-[#0D0D0D] border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-mono">
                      <span className="material-symbols-outlined text-sm">check_circle</span>
                      <span>0 ACTIVE DRIFT INCIDENTS DETECTED -- ALL CHANNELS FULLY CONVERGED</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {incidents.map(inc => (
                        <div key={inc.id} className={`p-4 rounded-xl border font-mono text-[11px] flex items-start gap-3 transition-all ${
                          inc.severity === 'CRITICAL' 
                            ? 'bg-red-500/5 border-red-500/30 text-red-300' 
                            : inc.severity === 'WARNING'
                            ? 'bg-amber-500/5 border-amber-500/20 text-amber-300'
                            : 'bg-sky-500/5 border-sky-500/20 text-sky-300'
                        }`}>
                          <span className="material-symbols-outlined text-sm mt-0.5 shrink-0">
                            {inc.severity === 'CRITICAL' ? 'error' : inc.severity === 'WARNING' ? 'warning' : 'info'}
                          </span>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 font-bold">
                              <span className="uppercase text-[9px] px-1.5 py-0.2 bg-black/40 rounded border border-[#2A2A2A]">{inc.severity}</span>
                              <span className="text-[#555] text-[9px]">{new Date(inc.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <p className="leading-relaxed">{inc.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 1.6 DISTRIBUTED CORRELATION TRACE GRAPH (TIMING WATERFALL) */}
                <div className="bg-[#1C1B1B] border border-[#2A2A2A] rounded-xl p-6">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-widest text-[#F5F5F5]">DISTRIBUTED CORRELATION PROPAGATION CASCADE</h4>
                    <p className="text-[9px] font-bold text-[#555] uppercase mt-1">End-to-end timing cascade tracing from client interaction down to outbox dispatch & broadcast</p>
                  </div>

                  <div className="mt-6 space-y-3.5 max-w-full font-mono text-[10px]">
                    {[
                      { step: 'QR Customer Scan', time: '0ms', lag: 0, width: 'w-[10%]', color: 'bg-emerald-500' },
                      { step: 'Cart Item Insertion', time: '+18ms', lag: 0, width: 'w-[25%]', color: 'bg-emerald-500' },
                      { step: 'OCC Serializable Match Check', time: '+45ms', lag: 0, width: 'w-[45%]', color: 'bg-emerald-500' },
                      { step: 'Supabase Transaction Log Commit', time: '+68ms', lag: 0, width: 'w-[60%]', color: 'bg-emerald-500' },
                      { 
                        step: 'Append-Only Outbox Dispatch', 
                        time: metrics && metrics.outbox_processing_lag_seconds > 1.0 ? `+${(metrics.outbox_processing_lag_seconds * 1000).toFixed(0)}ms` : '+85ms', 
                        lag: metrics && metrics.outbox_processing_lag_seconds > 1.0 ? 1 : 0, 
                        width: metrics && metrics.outbox_processing_lag_seconds > 1.0 ? 'w-[85%]' : 'w-[75%]', 
                        color: metrics && metrics.outbox_processing_lag_seconds > 1.0 ? 'bg-red-500' : 'bg-emerald-500' 
                      },
                      { 
                        step: 'WebSocket Channel Fanout Broadcast', 
                        time: metrics && metrics.average_latency_ms > 100 ? `+${(metrics.average_latency_ms + 100).toFixed(0)}ms` : '+110ms', 
                        lag: metrics && metrics.average_latency_ms > 100 ? 1 : 0, 
                        width: metrics && metrics.average_latency_ms > 100 ? 'w-[100%]' : 'w-[90%]', 
                        color: metrics && metrics.average_latency_ms > 100 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500' 
                      }
                    ].map((row, idx) => (
                      <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#2A2A2A]/20 pb-2 gap-2">
                        <span className="w-64 font-bold text-[#888]">{row.step}</span>
                        <div className="flex-1 bg-[#0D0D0D] rounded h-3 overflow-hidden border border-[#2A2A2A]/40 mx-0 sm:mx-4 relative flex items-center">
                          <div className={`h-full ${row.width} ${row.color} rounded transition-all duration-1000`} />
                        </div>
                        <span className={`w-16 text-right font-black ${row.lag ? 'text-red-400 font-mono animate-pulse' : 'text-emerald-400'}`}>{row.time}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}

            {/* ─── 2. EVENT STREAM TAB ─── */}
            {activeTab === 'stream' && (
              <div className="space-y-6">
                
                {/* Search inputs */}
                <div className="p-4 bg-[#1C1B1B] border border-[#2A2A2A] rounded-xl flex flex-wrap gap-4 items-center">
                  <div className="flex items-center gap-2 text-[#555]">
                    <span className="material-symbols-outlined text-sm">search</span>
                    <span className="text-[9px] font-black uppercase tracking-widest">FILTERS:</span>
                  </div>
                  <input
                    type="text"
                    placeholder="Filter Event Type..."
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                    className="px-3 py-1.5 bg-[#0D0D0D] border border-[#2A2A2A] rounded-lg text-xs font-mono text-[#F5F5F5] placeholder-[#333] focus:border-[#C0272D]/50 focus:outline-none min-w-[200px]"
                  />
                  <input
                    type="text"
                    placeholder="Filter Correlation ID..."
                    value={correlationFilter}
                    onChange={e => setCorrelationFilter(e.target.value)}
                    className="px-3 py-1.5 bg-[#0D0D0D] border border-[#2A2A2A] rounded-lg text-xs font-mono text-[#F5F5F5] placeholder-[#333] focus:border-[#C0272D]/50 focus:outline-none min-w-[200px]"
                  />
                  {(typeFilter || correlationFilter) && (
                    <button
                      onClick={() => { setTypeFilter(''); setCorrelationFilter('') }}
                      className="text-[9px] font-bold uppercase text-[#C0272D] hover:underline"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>

                {/* Main Events list */}
                <div className="bg-[#1C1B1B] border border-[#2A2A2A] rounded-[14px] overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#0D0D0D]/60 border-b border-[#2A2A2A]">
                          <th className="px-6 py-4 text-[9px] font-black text-[#555] uppercase tracking-widest">Sequence</th>
                          <th className="px-6 py-4 text-[9px] font-black text-[#555] uppercase tracking-widest">Type</th>
                          <th className="px-6 py-4 text-[9px] font-black text-[#555] uppercase tracking-widest">Correlation ID</th>
                          <th className="px-6 py-4 text-[9px] font-black text-[#555] uppercase tracking-widest">Actor</th>
                          <th className="px-6 py-4 text-[9px] font-black text-[#555] uppercase tracking-widest">Timestamp</th>
                          <th className="px-6 py-4 text-right text-[9px] font-black text-[#555] uppercase tracking-widest">Payload</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2A2A2A]/40">
                        {filteredEvents.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-6 py-10 text-[10px] text-center text-[#555] uppercase font-bold tracking-widest">No matching events streamed</td>
                          </tr>
                        ) : (
                          <>
                            {filteredEvents.map((evt, idx) => {
                              const isExpanded = expandedEventId === evt.id
                              
                              // Check if there is a gap BEFORE this event (chronologically, meaning its sequence is higher than the next one + 1)
                              const nextEvt = filteredEvents[idx + 1]
                              const hasGapAfterThis = nextEvt && (evt.sequence_number - nextEvt.sequence_number > 1)

                              return (
                                <Fragment key={evt.id}>
                                  <tr className="hover:bg-[#1C1B1B]/60 transition-colors">
                                    <td className="px-6 py-4.5 font-mono text-xs text-emerald-400 font-bold">
                                      <div className="flex items-center gap-2">
                                        <span>#{evt.sequence_number}</span>
                                        {evt.is_real_data && (
                                          <span className="text-[7px] font-bold px-1 py-0.2 bg-[#C0272D]/10 text-[#C0272D] rounded uppercase tracking-widest">Live</span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-6 py-4.5">
                                      <span className="text-xs font-black text-[#F5F5F5]">{evt.event_type}</span>
                                    </td>
                                    <td className="px-6 py-4.5 font-mono text-[11px] text-[#555]">{evt.metadata.correlation_id}</td>
                                    <td className="px-6 py-4.5 font-mono text-[11px]">
                                      <span className="text-[#a8a8a8]">{evt.metadata.actor_id}</span>
                                      <span className="ml-2 px-1.5 py-0.5 bg-[#2A2A2A] text-[#555] rounded text-[8px] font-bold uppercase">{evt.metadata.actor_role}</span>
                                    </td>
                                    <td className="px-6 py-4.5 font-mono text-[10px] text-[#555]">
                                      {new Date(evt.metadata.timestamp).toLocaleTimeString()}
                                    </td>
                                    <td className="px-6 py-4.5 text-right">
                                      <button
                                        onClick={() => setExpandedEventId(isExpanded ? null : evt.id)}
                                        className="px-2.5 py-1 bg-[#0D0D0D] hover:bg-[#131313] border border-[#2A2A2A] rounded-lg text-[9px] font-black uppercase tracking-wider text-[#555] hover:text-[#F5F5F5] transition-all"
                                      >
                                        {isExpanded ? 'Hide' : 'Inspect'}
                                      </button>
                                    </td>
                                  </tr>
                                  {hasGapAfterThis && (
                                    <tr className="bg-amber-500/5 border-y border-dashed border-amber-500/20">
                                      <td colSpan={6} className="px-6 py-2.5 text-[9px] font-mono font-bold text-amber-400">
                                        ⚠️ SEQUENCE GAP DETECTED BETWEEN EVENT #{evt.sequence_number} AND EVENT #{nextEvt.sequence_number}
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              )
                            })}
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Expandable inspect JSON drawer */}
                {expandedEventId && (() => {
                  const target = eventStream.find(e => e.id === expandedEventId)
                  if (!target) return null
                  return (
                    <div className="p-6 bg-[#0D0D0D] border border-[#2A2A2A] rounded-xl font-mono text-xs space-y-4 animate-fade-in relative">
                      <div className="flex justify-between items-center border-b border-[#2A2A2A] pb-3 shrink-0">
                        <span className="text-[10px] font-bold text-[#C0272D] uppercase tracking-widest">Payload Inspector -- {target.event_type} (seq: #{target.sequence_number})</span>
                        <button onClick={() => setExpandedEventId(null)} className="text-[#555] hover:text-[#F5F5F5]">&times; Close</button>
                      </div>
                      <pre className="p-4 bg-[#131313] rounded-lg border border-[#2A2A2A] text-emerald-400 overflow-x-auto select-all max-h-[300px] scrollbar-thin">
                        {JSON.stringify({ payload: target.payload, metadata: target.metadata }, null, 2)}
                      </pre>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* ─── 3. OUTBOX & DLQ TAB ─── */}
            {activeTab === 'dlq' && (
              <div className="space-y-6">
                
                {/* Backlog stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-5 bg-[#1C1B1B] border border-[#2A2A2A] rounded-xl flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <span className="material-symbols-outlined text-xl">check_circle</span>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-[#555] uppercase tracking-wider">Queue Worker Status</p>
                      <h4 className="text-sm font-black text-[#F5F5F5] uppercase mt-0.5 font-mono">ONLINE · SUPERVISOR ACTIVE</h4>
                    </div>
                  </div>
                  
                  <div className="p-5 bg-[#1C1B1B] border border-[#2A2A2A] rounded-xl flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                      <span className="material-symbols-outlined text-xl">pending_actions</span>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-[#555] uppercase tracking-wider">Pending Batch Outbox</p>
                      <h4 className="text-sm font-black text-[#F5F5F5] font-mono mt-0.5">0 events</h4>
                    </div>
                  </div>

                  <div className={`p-5 border rounded-xl flex items-center gap-4 transition-colors ${dlqItems.length > 0 ? 'bg-[#C0272D]/10 border-[#C0272D]/30' : 'bg-[#1C1B1B] border-[#2A2A2A]'}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${dlqItems.length > 0 ? 'bg-[#C0272D]/20 text-[#ffb4ab]' : 'bg-[#2A2A2A] text-[#555]'}`}>
                      <span className="material-symbols-outlined text-xl">gavel</span>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-[#555] uppercase tracking-wider">Quarantined DLQ Count</p>
                      <h4 className={`text-sm font-black mt-0.5 ${dlqItems.length > 0 ? 'text-[#ffb4ab] animate-pulse' : 'text-[#F5F5F5]'}`}>{dlqItems.length} items</h4>
                    </div>
                  </div>
                </div>

                {/* DLQ table */}
                <div className="bg-[#1C1B1B] border border-[#2A2A2A] rounded-[14px] overflow-hidden">
                  <div className="px-6 py-4 border-b border-[#2A2A2A] bg-[#0D0D0D]/60 flex items-center gap-2">
                    <span className="material-symbols-outlined text-xs text-[#C0272D]" style={{ fontVariationSettings: "'FILL' 1" }}>gavel</span>
                    <h3 className="text-xs font-black uppercase tracking-widest text-[#F5F5F5]">DEAD-LETTER QUARANTINE LEDGER</h3>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#0D0D0D]/20 border-b border-[#2A2A2A]">
                          <th className="px-6 py-4 text-[9px] font-black text-[#555] uppercase tracking-widest">Sequence</th>
                          <th className="px-6 py-4 text-[9px] font-black text-[#555] uppercase tracking-widest">Event Type</th>
                          <th className="px-6 py-4 text-[9px] font-black text-[#555] uppercase tracking-widest">Failure Reason</th>
                          <th className="px-6 py-4 text-[9px] font-black text-[#555] uppercase tracking-widest">Age</th>
                          <th className="px-6 py-4 text-right text-[9px] font-black text-[#555] uppercase tracking-widest">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2A2A2A]/40">
                        {dlqItems.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-6 py-10 text-[10px] text-center text-[#555] uppercase font-bold tracking-widest">No quarantined dead-letters found</td>
                          </tr>
                        ) : (
                          dlqItems.map(item => {
                            const isExpanded = expandedDlqId === item.id
                            const ageSec = Math.round((Date.now() - new Date(item.quarantined_at).getTime()) / 1000)
                            const ageFormatted = ageSec < 60 ? `${ageSec}s ago` : `${Math.floor(ageSec / 60)}m ago`

                            return (
                              <tr key={item.id} className="hover:bg-[#1C1B1B]/60 transition-colors">
                                <td className="px-6 py-4.5 font-mono text-xs text-red-400 font-bold">#{item.sequence_number}</td>
                                <td className="px-6 py-4.5">
                                  <div className="flex flex-col">
                                    <span className="text-xs font-black text-[#F5F5F5]">{item.event_type}</span>
                                    <span className="text-[9px] font-mono text-[#555] uppercase mt-0.5">ID: {item.outbox_event_id}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4.5 max-w-[400px]">
                                  <p className="text-xs text-[#a8a8a8] truncate" title={item.failure_reason}>{item.failure_reason}</p>
                                </td>
                                <td className="px-6 py-4.5 font-mono text-[10px] text-[#555]">{ageFormatted}</td>
                                <td className="px-6 py-4.5 text-right space-x-2">
                                  <button
                                    onClick={() => setExpandedDlqId(isExpanded ? null : item.id)}
                                    className="px-2.5 py-1.5 bg-[#0D0D0D] hover:bg-[#131313] border border-[#2A2A2A] rounded-lg text-[9px] font-black uppercase tracking-wider text-[#555] hover:text-[#F5F5F5] transition-all"
                                  >
                                    Inspect Stack
                                  </button>
                                  <button
                                    onClick={() => handleRequeue(item.id)}
                                    disabled={requeuingId !== null}
                                    className="px-2.5 py-1.5 bg-[#C0272D]/15 hover:bg-[#C0272D] border border-[#C0272D]/30 hover:border-[#C0272D] text-[9px] font-black uppercase tracking-wider text-[#ffb3ae] hover:text-white rounded-lg transition-all"
                                  >
                                    {requeuingId === item.id ? 'Requeuing...' : 'Requeue'}
                                  </button>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Inspect DLQ Stack trace */}
                {expandedDlqId && (() => {
                  const target = dlqItems.find(item => item.id === expandedDlqId)
                  if (!target) return null
                  return (
                    <div className="p-6 bg-[#0D0D0D] border border-[#2A2A2A] rounded-xl font-mono text-xs space-y-4 animate-fade-in">
                      <div className="flex justify-between items-center border-b border-[#2A2A2A] pb-3">
                        <span className="text-[10px] font-bold text-[#C0272D] uppercase tracking-widest">Dead Letter Stacktrace -- {target.event_type}</span>
                        <button onClick={() => setExpandedDlqId(null)} className="text-[#555] hover:text-[#F5F5F5]">&times; Close</button>
                      </div>
                      
                      <div className="space-y-1.5">
                        <span className="text-[9px] font-bold text-[#555] uppercase tracking-widest block">Failure Log:</span>
                        <div className="p-3 bg-[#131313] rounded-lg border border-[#2A2A2A] text-red-400">
                          {target.failure_reason}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <span className="text-[9px] font-bold text-[#555] uppercase tracking-widest block">Execution Stacktrace:</span>
                        <pre className="p-4 bg-[#131313] rounded-lg border border-[#2A2A2A] text-[#a8a8a8] overflow-x-auto scrollbar-thin leading-relaxed">
                          {target.failure_stacktrace}
                        </pre>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* ─── 4. WS CONNECTIONS TAB ─── */}
            {activeTab === 'websocket' && (
              <div className="space-y-6">
                
                {/* 1.6 WEBSOCKET TOPOLOGY MONITOR HEADER */}
                <div className="p-5 bg-[#1C1B1B] border border-[#2A2A2A] rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    <div>
                      <span className="text-xs font-black uppercase text-[#F5F5F5]">PROXY CONNECTOR NODE 02 ACTIVE</span>
                      <p className="text-[8px] font-bold text-[#555] uppercase tracking-widest mt-0.5">Distributed connection buffer cluster</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-6 text-[10px] font-mono font-bold text-[#555] uppercase">
                    <span>Reconnection Buffer: <span className="text-emerald-400 font-bold">100% HEALTHY</span></span>
                    <span>Proxy Latency: <span className="text-[#F5F5F5]">{metrics?.average_latency_ms}ms</span></span>
                    <span>Drift Level: <span className={metrics?.global_drift_severity !== 'P3' ? 'text-amber-400 font-black' : 'text-emerald-400 font-bold'}>{metrics?.global_drift_severity}</span></span>
                  </div>
                </div>

                {/* Active devices grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {devices.map(dev => {
                    const isLatencyHigh = dev.latency_ms > 100
                    const latencyColor = isLatencyHigh ? 'text-amber-500' : 'text-emerald-400'
                    const latencyBg = isLatencyHigh ? 'bg-amber-500/10' : 'bg-emerald-500/10'
                    
                    // 1.6 PROJECTION FRESHNESS LAG & PERCENTAGE BAR
                    const maxSeq = metrics?.global_max_sequence || 846
                    const devLag = maxSeq - dev.current_sequence
                    const isLagged = devLag > 0
                    
                    // Calculate sync percentage safely
                    const syncPct = Math.max(0, Math.min(100, Math.round(((dev.current_sequence - 840) / Math.max(1, maxSeq - 840)) * 100)))

                    return (
                      <div key={dev.device_id} className={`p-6 rounded-[14px] bg-[#1C1B1B] border flex flex-col justify-between h-[256px] relative group hover:border-[#C0272D]/30 transition-all ${dev.degraded_mode_active ? 'border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.03)]' : 'border-[#2A2A2A]'}`}>
                        
                        {/* Dev title */}
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[8px] font-bold text-[#555] uppercase tracking-widest">{dev.device_type}</span>
                            <h4 className="text-sm font-black text-[#F5F5F5] font-mono mt-0.5 tracking-tight">{dev.display_name}</h4>
                            <span className="text-[8px] font-mono text-[#444] block mt-0.5">{dev.device_id}</span>
                          </div>
                          
                          <div className={`w-6 h-6 rounded-lg ${latencyBg} flex items-center justify-center shrink-0`}>
                            <span className={`material-symbols-outlined text-[14px] ${latencyColor}`}>
                              {dev.device_type === 'CASHIER_TABLET' ? 'tablet' : dev.device_type === 'KDS_SCREEN' ? 'kitchen' : 'phone_android'}
                            </span>
                          </div>
                        </div>

                        {/* Projection Freshness Meter */}
                        <div className="space-y-1.5 my-3.5">
                          <div className="flex justify-between text-[9px] font-bold uppercase">
                            <span className="text-[#555]">PROJECTION FRESHNESS</span>
                            <span className={isLagged ? 'text-amber-400 animate-pulse' : 'text-emerald-400'}>
                              {isLagged ? `STALE (LAG: ${devLag} STEPS)` : 'CONVERGED (100%)'}
                            </span>
                          </div>
                          <div className="bg-[#0D0D0D] rounded h-2 overflow-hidden border border-[#2A2A2A]/40 flex items-center">
                            <div 
                              className={`h-full ${isLagged ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'} rounded transition-all duration-1000`} 
                              style={{ width: `${syncPct}%` }}
                            />
                          </div>
                        </div>

                        {/* Connection statistics */}
                        <div className="space-y-2.5 mb-4 font-mono text-[10px]">
                          <div className="flex justify-between">
                            <span className="text-[#555] font-black uppercase">Socket Latency</span>
                            <span className={`font-bold ${latencyColor}`}>{dev.latency_ms}ms</span>
                          </div>

                          <div className="flex justify-between">
                            <span className="text-[#555] font-black uppercase">Device Sequence</span>
                            <span className="text-emerald-400 font-bold">#{dev.current_sequence}</span>
                          </div>

                          <div className="flex justify-between">
                            <span className="text-[#555] font-black uppercase">Connection Uptime</span>
                            <span className="text-[#a8a8a8]">{formatUptime(dev.connection_uptime_seconds)}</span>
                          </div>
                        </div>

                        {/* Subscribed channels info */}
                        <div className="border-t border-[#2A2A2A]/40 pt-2.5 flex justify-between items-center text-[9px]">
                          <span className="text-[#333] font-bold uppercase truncate max-w-[150px]" title={dev.subscribed_topics[0] || 'No active subscription topics!'}>
                            {dev.subscribed_topics[0] || 'SUBSCRIPTIONS_LOST'}
                          </span>
                          
                          {dev.degraded_mode_active ? (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-500 font-bold uppercase tracking-wider animate-pulse text-[8px]">
                              Storm ({dev.reconnect_count})
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-emerald-400 font-bold uppercase tracking-wider text-[8px]">
                              <span className="w-1 h-1 bg-emerald-500 rounded-full shadow-[0_0_5px_#10B981]" /> Connected
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
