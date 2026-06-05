/**
 * RuntimeObservabilityPanel
 *
 * Infrastructure-grade runtime convergence control surface.
 * DEV / QA / INTERNAL_PILOT only — never ships to production.
 *
 * Consumes RuntimeObservabilityLayer exclusively.
 * Read-only. Zero runtime mutations.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { runtime } from '../index';

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  bg:       '#0D1117',
  surface:  '#161B22',
  raised:   '#1C2128',
  border:   '#30363D',
  text:     '#E6EDF3',
  muted:    '#8B949E',
  dim:      '#484F58',
  green:    '#3FB950',
  yellow:   '#E3B341',
  red:      '#F85149',
  blue:     '#58A6FF',
  purple:   '#D2A8FF',
  mono:     '"SF Mono", "Fira Code", "Consolas", monospace',
  sans:     '"Manrope", "Inter", system-ui, sans-serif',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function num(v) {
  return v === 0 ? <span style={{ color: T.dim }}>0</span> : <span style={{ color: T.text }}>{v}</span>;
}

function ms(v) {
  if (!v) return <span style={{ color: T.dim }}>—</span>;
  const color = v < 100 ? T.green : v < 500 ? T.yellow : T.red;
  return <span style={{ color, fontFamily: T.mono }}>{v.toFixed(1)}ms</span>;
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, badge, badgeColor, children }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div style={{
      border: `1px solid ${T.border}`, borderRadius: 8,
      overflow: 'hidden', marginBottom: 8,
    }}>
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 12px', background: T.surface,
          border: 'none', cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', color: T.muted }}>
          {title}
        </span>
        {badge !== undefined && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999,
            background: 'rgba(255,255,255,0.06)',
            color: badgeColor ?? T.muted,
          }}>{badge}</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: T.dim }}>
          {collapsed ? '▶' : '▼'}
        </span>
      </button>
      {!collapsed && (
        <div style={{ padding: '10px 12px', background: T.bg }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── KV row ───────────────────────────────────────────────────────────────────
function KV({ label, value, valueColor }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      padding: '3px 0', borderBottom: `1px solid rgba(48,54,61,0.4)`,
    }}>
      <span style={{ fontSize: 11, color: T.muted, fontFamily: T.mono }}>{label}</span>
      <span style={{ fontSize: 11, color: valueColor ?? T.text, fontFamily: T.mono, fontWeight: 600 }}>
        {value}
      </span>
    </div>
  );
}

// ─── Transport state badge ────────────────────────────────────────────────────
function StateBadge({ state }) {
  const cfg = {
    LIVE:         { color: T.green,  bg: 'rgba(63,185,80,0.12)' },
    SYNCING:      { color: T.blue,   bg: 'rgba(88,166,255,0.12)' },
    CONNECTED:    { color: T.green,  bg: 'rgba(63,185,80,0.12)' },
    RECONNECTING: { color: T.yellow, bg: 'rgba(227,179,65,0.12)' },
    RECOVERING:   { color: T.yellow, bg: 'rgba(227,179,65,0.12)' },
    DEGRADED:     { color: T.red,    bg: 'rgba(248,81,73,0.12)' },
    SUSPENDED:    { color: T.dim,    bg: 'rgba(255,255,255,0.05)' },
    FAILED:       { color: T.red,    bg: 'rgba(248,81,73,0.2)' },
    BOOTSTRAPPING:{ color: T.muted,  bg: 'rgba(255,255,255,0.05)' },
  }[state] ?? { color: T.muted, bg: 'rgba(255,255,255,0.05)' };

  return (
    <span style={{
      fontSize: 11, fontWeight: 800, fontFamily: T.mono, letterSpacing: '0.08em',
      padding: '3px 10px', borderRadius: 999,
      background: cfg.bg, color: cfg.color,
    }}>{state}</span>
  );
}

// ─── Domain watermark table ───────────────────────────────────────────────────
function WatermarkTable({ snapshot }) {
  const DOMAINS = ['orders', 'tables', 'kds', 'analytics', 'system'];
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: T.mono }}>
      <thead>
        <tr>
          {['DOMAIN', 'WATERMARK', 'REBUILDS', 'CANCELLED', 'STALE', 'GAPS', 'AVG REBUILD'].map(h => (
            <th key={h} style={{
              padding: '4px 8px', textAlign: 'left', fontSize: 9,
              color: T.dim, fontWeight: 800, letterSpacing: '0.1em',
              borderBottom: `1px solid ${T.border}`,
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {DOMAINS.map(domain => {
          const d = snapshot.domains[domain] ?? {};
          const hasGap = d.gapCount > 0;
          const isStalled = d.watermark === 0 && d.rebuildCount === 0;
          return (
            <tr key={domain} style={{ borderBottom: `1px solid rgba(48,54,61,0.3)` }}>
              <td style={{ padding: '4px 8px', color: T.text, fontWeight: 700 }}>{domain}</td>
              <td style={{ padding: '4px 8px', color: d.watermark > 0 ? T.green : T.dim }}>
                {d.watermark ?? 0}
              </td>
              <td style={{ padding: '4px 8px', color: d.rebuildCount > 0 ? T.text : T.dim }}>
                {d.rebuildCount ?? 0}
              </td>
              <td style={{ padding: '4px 8px', color: d.cancelledCount > 0 ? T.yellow : T.dim }}>
                {d.cancelledCount ?? 0}
              </td>
              <td style={{ padding: '4px 8px', color: d.staleCount > 0 ? T.yellow : T.dim }}>
                {d.staleCount ?? 0}
              </td>
              <td style={{ padding: '4px 8px', color: hasGap ? T.red : T.dim }}>
                {d.gapCount ?? 0}
              </td>
              <td style={{ padding: '4px 8px', color: d.avgDurationMs > 0 ? T.blue : T.dim }}>
                {d.avgDurationMs > 0 ? `${d.avgDurationMs.toFixed(1)}ms` : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Mutation lifecycle meter ─────────────────────────────────────────────────
function MutationMeter({ snapshot }) {
  const submitted = snapshot.mutationSubmitted;
  if (submitted === 0) {
    return <div style={{ color: T.dim, fontSize: 11, fontFamily: T.mono }}>no mutations in buffer</div>;
  }
  const rows = [
    { label: 'submitted',    value: submitted,                     color: T.text },
    { label: 'acknowledged', value: snapshot.mutationAcknowledged, color: T.blue },
    { label: 'confirmed',    value: snapshot.mutationConfirmed,    color: T.green },
    { label: 'stalled',      value: snapshot.mutationStalled,      color: T.yellow },
    { label: 'failed',       value: snapshot.mutationFailed,       color: T.red },
    { label: 'rejected',     value: snapshot.mutationRejected,     color: T.red },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {rows.map(({ label, value, color }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 90, fontSize: 10, color: T.muted, fontFamily: T.mono, textAlign: 'right',
          }}>{label}</span>
          <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              width: `${Math.min(100, (value / submitted) * 100)}%`,
              background: color, opacity: 0.8,
              transition: 'width 0.3s ease',
            }} />
          </div>
          <span style={{ width: 30, fontSize: 10, color, fontFamily: T.mono, textAlign: 'right' }}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Timeline feed ────────────────────────────────────────────────────────────
const TIMELINE_LEVEL = {
  TRANSPORT:   T.blue,
  PROJECTION:  T.purple,
  MUTATION:    T.yellow,
  REPLAY:      T.red,
  REALTIME:    T.green,
  BUFFER:      T.dim,
};

const EVENT_ICONS = {
  TRANSPORT_CONNECTED:              '⬆',
  TRANSPORT_DISCONNECTED:           '⬇',
  TRANSPORT_RECONNECT_STARTED:      '↻',
  TRANSPORT_RECONNECT_SUCCEEDED:    '✓',
  TRANSPORT_RECONNECT_FAILED:       '✗',
  TRANSPORT_DEGRADED_POLLING_ENABLED:  '⚠',
  TRANSPORT_DEGRADED_POLLING_DISABLED: '✓',
  TRANSPORT_STATE_TRANSITION:       '→',
  PROJECTION_REBUILD_STARTED:       '⟳',
  PROJECTION_REBUILD_CANCELLED:     '×',
  PROJECTION_REBUILD_APPLIED:       '✓',
  PROJECTION_REBUILD_STALE_IGNORED: '⊘',
  PROJECTION_REBUILD_FAILED:        '✗',
  MUTATION_SUBMITTED:               '→',
  MUTATION_ACKNOWLEDGED:            '✓',
  MUTATION_CONFIRMED:               '✓✓',
  MUTATION_STALLED:                 '⚠',
  MUTATION_FAILED:                  '✗',
  MUTATION_REJECTED:                '⊘',
  REPLAY_GAP_DETECTED:              '△',
  REPLAY_RECOVERY_STARTED:          '↺',
  REPLAY_RECOVERY_COMPLETED:        '✓',
  REPLAY_RECOVERY_FAILED:           '✗',
  REALTIME_STALE_REJECTED:          '⊘',
  REALTIME_DEBOUNCE_COLLAPSE:       '⊕',
  REALTIME_INVALIDATION_EMITTED:    '◉',
  REALTIME_WATERMARK_UPDATED:       '▶',
  REALTIME_SEQUENCE_GAP:            '△',
  BUFFER_OVERFLOW:                  '⚡',
};

function TimelineFeed({ events, filter }) {
  const endRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events, autoScroll]);

  const domain = filter.domain === 'ALL' ? null : filter.domain;
  const type = filter.type === 'ALL' ? null : filter.type;

  const filtered = events.filter(e => {
    if (domain && e.domain !== domain) return false;
    if (type && !e.event_type.startsWith(type)) return false;
    return true;
  }).slice(-200);

  return (
    <div>
      <div
        style={{ height: 320, overflowY: 'auto', fontFamily: T.mono, fontSize: 10 }}
        onScroll={ev => {
          const el = ev.currentTarget;
          setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
        }}
      >
        {filtered.map((e, i) => {
          const prefix = e.event_type.split('_')[0];
          const color = TIMELINE_LEVEL[prefix] ?? T.muted;
          const icon = EVENT_ICONS[e.event_type] ?? '·';
          const meta = Object.entries(e)
            .filter(([k]) => !['timestamp', 'event_type', 'surface'].includes(k))
            .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
            .join('  ');

          return (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: '80px 14px 200px 1fr',
              gap: 6,
              padding: '2px 4px',
              borderBottom: '1px solid rgba(48,54,61,0.25)',
              alignItems: 'baseline',
            }}>
              <span style={{ color: T.dim }}>{e.timestamp?.slice(11, 23)}</span>
              <span style={{ color, textAlign: 'center' }}>{icon}</span>
              <span style={{ color, fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {e.event_type}
              </span>
              <span style={{ color: T.muted, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {meta}
              </span>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: T.dim }}>
            no events match filter
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 6, paddingTop: 6, borderTop: `1px solid ${T.border}`,
      }}>
        <span style={{ fontSize: 9, color: T.dim, fontFamily: T.mono }}>
          showing {filtered.length} of {events.length} events
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={e => setAutoScroll(e.target.checked)}
            style={{ accentColor: T.green }}
          />
          <span style={{ fontSize: 9, color: T.muted }}>auto-scroll</span>
        </label>
      </div>
    </div>
  );
}

// ─── Certification sub-panel ──────────────────────────────────────────────────
function CertificationBlock() {
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    try {
      const r = await runtime.certify();
      setReport(r);
    } finally {
      setRunning(false);
    }
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <button
          onClick={run}
          disabled={running}
          style={{
            padding: '5px 14px', fontSize: 11, fontWeight: 700, fontFamily: T.mono,
            background: running ? T.raised : 'rgba(63,185,80,0.15)',
            color: running ? T.muted : T.green,
            border: `1px solid ${running ? T.border : 'rgba(63,185,80,0.3)'}`,
            borderRadius: 6, cursor: running ? 'not-allowed' : 'pointer',
          }}
        >
          {running ? '⟳ running…' : '▶ runtime.certify()'}
        </button>
        {report && (
          <span style={{
            fontSize: 10, fontWeight: 800, fontFamily: T.mono,
            color: report.certified ? T.green : T.red,
          }}>
            {report.certified ? '✓ CERTIFIED' : '✗ NOT CERTIFIED'}
            {' '}
            {report.passed}/{report.totalTests} passed
          </span>
        )}
      </div>

      {report && report.results.map((r, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'baseline', gap: 8,
          padding: '3px 0', borderBottom: `1px solid rgba(48,54,61,0.3)`,
          fontSize: 11, fontFamily: T.mono,
        }}>
          <span style={{ color: r.passed ? T.green : T.red, width: 12, flexShrink: 0 }}>
            {r.passed ? '✓' : '✗'}
          </span>
          <span style={{ color: r.passed ? T.text : T.red, flex: 1 }}>{r.name}</span>
          <span style={{ color: T.dim }}>{r.durationMs.toFixed(1)}ms</span>
          <span style={{ color: T.muted }}>
            {r.invariants.filter(v => v.passed).length}/{r.invariants.length}
          </span>
        </div>
      ))}

      {report && !report.certified && (
        <div style={{ marginTop: 10 }}>
          {report.results.filter(r => !r.passed).map((r, ri) => (
            <div key={ri} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: T.red, fontWeight: 700, fontFamily: T.mono, marginBottom: 4 }}>
                ✗ {r.name}
              </div>
              {r.invariants.filter(v => !v.passed).map((inv, ii) => (
                <div key={ii} style={{
                  padding: '3px 10px', fontSize: 10, fontFamily: T.mono,
                  background: 'rgba(248,81,73,0.06)', borderRadius: 4, marginBottom: 3,
                  color: T.red,
                }}>
                  {inv.description}
                  {inv.actual !== undefined && (
                    <span style={{ color: T.muted }}> · got {JSON.stringify(inv.actual)}, want {JSON.stringify(inv.expected)}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Top status bar ───────────────────────────────────────────────────────────
function StatusBar({ snapshot, refreshMs }) {
  const indicators = [
    { label: 'TRANSPORT',  value: snapshot.transportState,    node: <StateBadge state={snapshot.transportState} /> },
    { label: 'POLLING',    value: snapshot.degradedPollingActive, node: (
      <span style={{ color: snapshot.degradedPollingActive ? T.yellow : T.dim, fontFamily: T.mono, fontSize: 11 }}>
        {snapshot.degradedPollingActive ? '⚠ ACTIVE' : 'off'}
      </span>
    )},
    { label: 'RECONNECTS', value: snapshot.reconnectAttempts, node: (
      <span style={{ fontFamily: T.mono, fontSize: 11, color: snapshot.reconnectAttempts > 0 ? T.yellow : T.dim }}>
        {snapshot.reconnectAttempts}
      </span>
    )},
    { label: 'GAPS',       value: snapshot.sequenceGaps, node: (
      <span style={{ fontFamily: T.mono, fontSize: 11, color: snapshot.sequenceGaps > 0 ? T.red : T.dim }}>
        {snapshot.sequenceGaps}
      </span>
    )},
    { label: 'STALE',      value: snapshot.staleRejected, node: (
      <span style={{ fontFamily: T.mono, fontSize: 11, color: snapshot.staleRejected > 0 ? T.yellow : T.dim }}>
        {snapshot.staleRejected}
      </span>
    )},
    { label: 'MUTATIONS',  value: snapshot.mutationStalled, node: (
      <span style={{ fontFamily: T.mono, fontSize: 11, color: snapshot.mutationStalled > 0 ? T.yellow : T.dim }}>
        {snapshot.mutationStalled > 0 ? `⚠ ${snapshot.mutationStalled} stalled` : 'ok'}
      </span>
    )},
    { label: 'BUFFER',     value: snapshot.bufferSize, node: (
      <span style={{ fontFamily: T.mono, fontSize: 11, color: snapshot.droppedEvents > 0 ? T.red : T.muted }}>
        {snapshot.bufferSize}/500
        {snapshot.droppedEvents > 0 && <span style={{ color: T.red }}> ⚡{snapshot.droppedEvents} dropped</span>}
      </span>
    )},
  ];

  return (
    <div style={{
      display: 'flex', gap: 0, flexWrap: 'wrap',
      border: `1px solid ${T.border}`, borderRadius: 8,
      overflow: 'hidden', marginBottom: 10,
    }}>
      {indicators.map(({ label, node }, i) => (
        <div key={label} style={{
          flex: '1 1 120px', padding: '8px 12px',
          borderRight: i < indicators.length - 1 ? `1px solid ${T.border}` : 'none',
          background: T.surface,
        }}>
          <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.15em', color: T.dim, marginBottom: 4 }}>
            {label}
          </div>
          {node}
        </div>
      ))}
      <div style={{
        padding: '8px 12px', background: T.surface, display: 'flex', alignItems: 'flex-end',
      }}>
        <span style={{ fontSize: 9, color: T.dim, fontFamily: T.mono }}>
          ↻ {refreshMs}ms
        </span>
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
const DOMAIN_FILTERS = ['ALL', 'orders', 'tables', 'kds', 'analytics', 'system'];
const TYPE_FILTERS   = ['ALL', 'TRANSPORT', 'PROJECTION', 'MUTATION', 'REPLAY', 'REALTIME', 'BUFFER'];
const REFRESH_OPTIONS = [500, 1000, 2000, 5000];

export default function RuntimeObservabilityPanel() {
  const [snapshot, setSnapshot] = useState(() => runtime.observability.getRuntimeSnapshot());
  const [events, setEvents] = useState(() => runtime.observability.getEventBuffer());
  const [refreshMs, setRefreshMs] = useState(1000);
  const [timelineFilter, setTimelineFilter] = useState({ domain: 'ALL', type: 'ALL' });

  // Polling the observability layer — read-only
  useEffect(() => {
    const id = setInterval(() => {
      setSnapshot(runtime.observability.getRuntimeSnapshot());
      setEvents(runtime.observability.getEventBuffer());
    }, refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);

  return (
    <div style={{
      minHeight: '100vh',
      background: T.bg,
      color: T.text,
      fontFamily: T.sans,
      padding: '14px 16px',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.2em', color: T.dim }}>
              ORDERLYY · RUNTIME INFRASTRUCTURE
            </div>
            <h1 style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 900, color: T.text, letterSpacing: '-0.02em' }}>
              Observability Panel
            </h1>
          </div>

          {/* DEV-ONLY badge */}
          <span style={{
            fontSize: 9, fontWeight: 900, letterSpacing: '0.15em',
            padding: '3px 10px', borderRadius: 999,
            background: 'rgba(227,179,65,0.12)', color: T.yellow,
            border: '1px solid rgba(227,179,65,0.3)',
          }}>
            DEV ONLY
          </span>

          {/* Refresh rate */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: T.dim }}>↻</span>
            {REFRESH_OPTIONS.map(r => (
              <button
                key={r}
                onClick={() => setRefreshMs(r)}
                style={{
                  fontSize: 9, padding: '2px 8px', borderRadius: 4, border: 'none',
                  cursor: 'pointer', fontFamily: T.mono, fontWeight: 700,
                  background: refreshMs === r ? T.raised : 'transparent',
                  color: refreshMs === r ? T.text : T.dim,
                }}
              >
                {r}ms
              </button>
            ))}
          </div>
        </div>

        {/* ── Status Bar ─────────────────────────────────────────────────────── */}
        <StatusBar snapshot={snapshot} refreshMs={refreshMs} />

        {/* ── Two-column layout ───────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>

          {/* LEFT COLUMN */}
          <div>
            {/* Transport */}
            <Section title="TRANSPORT DIAGNOSTICS" badge={snapshot.transportState} badgeColor={
              snapshot.isDegraded ? T.red : snapshot.isRecovering ? T.yellow : snapshot.isRealtimeConnected ? T.green : T.muted
            }>
              <KV label="state"               value={snapshot.transportState} valueColor={
                snapshot.isDegraded ? T.red : snapshot.isRecovering ? T.yellow : T.green
              } />
              <KV label="connection_id"       value={snapshot.lastConnectionId?.slice(-8) ?? '—'} valueColor={T.dim} />
              <KV label="reconnect_attempts"  value={snapshot.reconnectAttempts} valueColor={snapshot.reconnectAttempts > 0 ? T.yellow : T.dim} />
              <KV label="reconnect_failures"  value={snapshot.reconnectFailures} valueColor={snapshot.reconnectFailures > 0 ? T.red : T.dim} />
              <KV label="degraded_polling"    value={snapshot.degradedPollingActive ? 'ACTIVE' : 'off'} valueColor={snapshot.degradedPollingActive ? T.yellow : T.dim} />
            </Section>

            {/* Realtime */}
            <Section title="REALTIME DIAGNOSTICS"
              badge={snapshot.staleRejected + snapshot.sequenceGaps}
              badgeColor={snapshot.sequenceGaps > 0 ? T.red : snapshot.staleRejected > 0 ? T.yellow : T.dim}
            >
              <KV label="stale_rejected"       value={snapshot.staleRejected}        valueColor={snapshot.staleRejected > 0 ? T.yellow : T.dim} />
              <KV label="debounce_collapses"   value={snapshot.debounceCollapses}     valueColor={snapshot.debounceCollapses > 0 ? T.blue : T.dim} />
              <KV label="invalidations_emitted"value={snapshot.invalidationsEmitted}  valueColor={T.text} />
              <KV label="sequence_gaps"        value={snapshot.sequenceGaps}          valueColor={snapshot.sequenceGaps > 0 ? T.red : T.dim} />
              <KV label="malformed_events"     value={snapshot.malformedEvents}       valueColor={snapshot.malformedEvents > 0 ? T.red : T.dim} />
            </Section>

            {/* Mutations */}
            <Section title="MUTATION DIAGNOSTICS"
              badge={`${snapshot.mutationSubmitted}→${snapshot.mutationConfirmed}`}
              badgeColor={snapshot.mutationStalled > 0 ? T.yellow : snapshot.mutationFailed > 0 ? T.red : T.dim}
            >
              <MutationMeter snapshot={snapshot} />
            </Section>

            {/* Buffer health */}
            <Section title="BUFFER HEALTH"
              badge={snapshot.droppedEvents > 0 ? `${snapshot.droppedEvents} dropped` : 'ok'}
              badgeColor={snapshot.droppedEvents > 0 ? T.red : T.green}
            >
              <KV label="buffer_size"   value={`${snapshot.bufferSize} / 500`} valueColor={snapshot.bufferSize > 400 ? T.yellow : T.text} />
              <KV label="dropped_total" value={snapshot.droppedEvents}  valueColor={snapshot.droppedEvents > 0 ? T.red : T.dim} />
              <KV label="overflow_count"value={snapshot.bufferOverflows} valueColor={snapshot.bufferOverflows > 0 ? T.red : T.dim} />
            </Section>
          </div>

          {/* RIGHT COLUMN */}
          <div>
            {/* Domain watermarks */}
            <Section title="DOMAIN WATERMARKS & PROJECTION STATE" badge="5 domains">
              <WatermarkTable snapshot={snapshot} />
            </Section>

            {/* Certification */}
            <Section title="CONVERGENCE CERTIFICATION" badge="8 invariants">
              <CertificationBlock />
            </Section>
          </div>
        </div>

        {/* ── Timeline ──────────────────────────────────────────────────────── */}
        <div style={{
          border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden', marginTop: 8,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            padding: '7px 12px', background: T.surface, borderBottom: `1px solid ${T.border}`,
          }}>
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', color: T.muted }}>
              RUNTIME TIMELINE
            </span>

            {/* Domain filter */}
            <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
              {DOMAIN_FILTERS.map(d => (
                <button key={d} onClick={() => setTimelineFilter(f => ({ ...f, domain: d }))} style={{
                  fontSize: 9, padding: '2px 8px', borderRadius: 999, border: 'none', cursor: 'pointer',
                  fontWeight: 700, fontFamily: T.mono,
                  background: timelineFilter.domain === d ? 'rgba(63,185,80,0.2)' : 'transparent',
                  color: timelineFilter.domain === d ? T.green : T.dim,
                }}>{d}</button>
              ))}
            </div>

            <div style={{ width: 1, height: 12, background: T.border }} />

            {/* Type filter */}
            <div style={{ display: 'flex', gap: 4 }}>
              {TYPE_FILTERS.map(t => {
                const color = { TRANSPORT: T.blue, PROJECTION: T.purple, MUTATION: T.yellow, REPLAY: T.red, REALTIME: T.green, BUFFER: T.dim }[t] ?? T.muted;
                return (
                  <button key={t} onClick={() => setTimelineFilter(f => ({ ...f, type: t }))} style={{
                    fontSize: 9, padding: '2px 8px', borderRadius: 999, border: 'none', cursor: 'pointer',
                    fontWeight: 700, fontFamily: T.mono,
                    background: timelineFilter.type === t ? `${color}22` : 'transparent',
                    color: timelineFilter.type === t ? color : T.dim,
                  }}>{t}</button>
                );
              })}
            </div>

            <span style={{ marginLeft: 'auto', fontSize: 9, color: T.dim, fontFamily: T.mono }}>
              {events.length} events in buffer
            </span>
          </div>

          <div style={{ padding: '8px 12px', background: T.bg }}>
            <TimelineFeed events={events} filter={timelineFilter} />
          </div>
        </div>
      </div>

      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #30363D; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #484F58; }
      `}</style>
    </div>
  );
}
