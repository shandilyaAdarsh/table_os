import { useState, useCallback } from 'react';
import { runtime } from '../index';

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg:         '#0D1117',
  surface:    '#161B22',
  border:     '#30363D',
  accent:     '#2EA043',
  warn:       '#E3B341',
  error:      '#F85149',
  text:       '#E6EDF3',
  muted:      '#8B949E',
  pass:       '#1B2F1E',
  fail:       '#2D1B1B',
  passText:   '#3FB950',
  failText:   '#F85149',
  tag:        '#1C2128',
};

// ─── Duration badge ───────────────────────────────────────────────────────────
function DurBadge({ ms }) {
  const color = ms < 100 ? C.passText : ms < 500 ? C.warn : C.error;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color, fontFamily: 'monospace' }}>
      {ms.toFixed(1)}ms
    </span>
  );
}

// ─── Status chip ──────────────────────────────────────────────────────────────
function StatusChip({ passed }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
      padding: '2px 8px', borderRadius: 999,
      background: passed ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)',
      color: passed ? C.passText : C.failText,
    }}>
      {passed ? 'PASS' : 'FAIL'}
    </span>
  );
}

// ─── Invariant row ────────────────────────────────────────────────────────────
function InvariantRow({ inv }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '7px 12px', borderRadius: 6,
      background: inv.passed ? 'rgba(63,185,80,0.04)' : 'rgba(248,81,73,0.06)',
      marginBottom: 4,
    }}>
      <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1, color: inv.passed ? C.passText : C.failText }}>
        {inv.passed ? '✓' : '✗'}
      </span>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 12, color: inv.passed ? C.text : C.failText }}>{inv.description}</span>
        {!inv.passed && (
          <div style={{ fontSize: 10, fontFamily: 'monospace', marginTop: 4, color: C.muted }}>
            <span style={{ color: C.failText }}>got</span> {JSON.stringify(inv.actual)}
            &nbsp;&nbsp;
            <span style={{ color: C.passText }}>want</span> {JSON.stringify(inv.expected)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Test block ───────────────────────────────────────────────────────────────
function TestBlock({ result, index }) {
  const [open, setOpen] = useState(!result.passed);

  return (
    <div style={{
      border: `1px solid ${result.passed ? 'rgba(63,185,80,0.2)' : 'rgba(248,81,73,0.3)'}`,
      borderRadius: 10, overflow: 'hidden', marginBottom: 10,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', background: result.passed ? C.pass : C.fail,
          border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{
          fontSize: 10, fontWeight: 900, color: C.muted,
          fontFamily: 'monospace', flexShrink: 0, minWidth: 20,
        }}>
          T{index + 1}
        </span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.text }}>
          {result.name}
        </span>
        <DurBadge ms={result.durationMs} />
        <StatusChip passed={result.passed} />
        <span style={{ fontSize: 11, color: C.muted, marginLeft: 4 }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div style={{ padding: '12px 16px', background: C.surface }}>
          {/* Invariants */}
          {result.invariants.map((inv, i) => <InvariantRow key={i} inv={inv} />)}

          {/* Error */}
          {result.error && (
            <div style={{
              marginTop: 10, padding: '8px 12px', borderRadius: 6,
              background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.2)',
              fontSize: 11, fontFamily: 'monospace', color: C.failText,
            }}>
              {result.error}
            </div>
          )}

          {/* Telemetry snapshot count */}
          <div style={{ marginTop: 10, fontSize: 10, color: C.muted }}>
            Telemetry events captured: <strong style={{ color: C.text }}>{result.telemetrySnapshot?.length ?? 0}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Telemetry stream panel ───────────────────────────────────────────────────
function TelemetryStream({ report }) {
  const [filter, setFilter] = useState('ALL');
  const [open, setOpen] = useState(false);

  // Flatten all events from all test snapshots
  const allEvents = report.results.flatMap(r => r.telemetrySnapshot || []);

  const domains = ['ALL', ...new Set(allEvents.map(e => e.event_type.split('_')[0]))];
  const filtered = filter === 'ALL' ? allEvents : allEvents.filter(e => e.event_type.startsWith(filter));

  const levelColor = (e) => {
    if (e.event_type.includes('FAIL') || e.event_type.includes('ERROR')) return C.failText;
    if (e.event_type.includes('STALL') || e.event_type.includes('GAP') || e.event_type.includes('DISCONNECT')) return C.warn;
    if (e.event_type.includes('PASS') || e.event_type.includes('CONNECTED') || e.event_type.includes('APPLIED')) return C.passText;
    return C.muted;
  };

  return (
    <div style={{ marginTop: 16, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px', background: C.surface,
          border: 'none', cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '0.1em' }}>
          TELEMETRY STREAM
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 999,
          background: C.tag, color: C.muted,
        }}>{allEvents.length} events</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: C.muted }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ background: C.bg }}>
          {/* Filter bar */}
          <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
            {domains.map(d => (
              <button
                key={d}
                onClick={() => setFilter(d)}
                style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', padding: '3px 10px',
                  borderRadius: 999, border: 'none', cursor: 'pointer',
                  background: filter === d ? C.accent : C.tag,
                  color: filter === d ? '#fff' : C.muted,
                }}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Events */}
          <div style={{ maxHeight: 300, overflowY: 'auto', padding: '8px 0' }}>
            {filtered.slice(-100).map((e, i) => (
              <div
                key={i}
                style={{
                  display: 'grid', gridTemplateColumns: '140px 220px 1fr',
                  gap: 8, padding: '3px 16px', fontSize: 10,
                  fontFamily: 'monospace', borderBottom: `1px solid rgba(48,54,61,0.4)`,
                }}
              >
                <span style={{ color: C.muted }}>{e.timestamp?.slice(11, 23)}</span>
                <span style={{ color: levelColor(e), fontWeight: 700 }}>{e.event_type}</span>
                <span style={{ color: C.muted, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {Object.entries(e)
                    .filter(([k]) => !['timestamp', 'event_type', 'surface'].includes(k))
                    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                    .join('  ')}
                </span>
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', color: C.muted, fontSize: 12 }}>
                No events for this filter
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Summary scoreboard ───────────────────────────────────────────────────────
function Scoreboard({ report }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24,
    }}>
      {[
        { label: 'TOTAL', value: report.totalTests, color: C.text },
        { label: 'PASSED', value: report.passed, color: C.passText },
        { label: 'FAILED', value: report.failed, color: report.failed > 0 ? C.failText : C.muted },
        { label: 'STATUS', value: report.certified ? 'CERTIFIED' : 'NOT CERTIFIED', color: report.certified ? C.passText : C.failText },
      ].map(({ label, value, color }) => (
        <div key={label} style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: '12px 14px',
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', color: C.muted, marginBottom: 6 }}>
            {label}
          </div>
          <div style={{ fontSize: label === 'STATUS' ? 12 : 24, fontWeight: 800, color, fontFamily: 'monospace' }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export default function RuntimeCertificationPanel() {
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const runCertification = useCallback(async () => {
    setRunning(true);
    setReport(null);
    setElapsed(0);

    const startMs = performance.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor(performance.now() - startMs));
    }, 100);

    try {
      const result = await runtime.certify();
      setReport(result);
    } catch (err) {
      console.error('[CertificationPanel] Certification run failed:', err);
    } finally {
      clearInterval(timer);
      setElapsed(Math.floor(performance.now() - startMs));
      setRunning(false);
    }
  }, []);

  return (
    <div style={{
      minHeight: '100vh', background: C.bg, color: C.text,
      fontFamily: 'Manrope, Inter, system-ui, sans-serif',
      padding: '32px 24px',
    }}>
      {/* Header */}
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.15em', color: C.muted, marginBottom: 4 }}>
              ORDERLLI · RUNTIME INFRASTRUCTURE
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>
              Convergence Certification
            </h1>
          </div>

          {/* Run button */}
          <button
            id="certify-run-btn"
            onClick={runCertification}
            disabled={running}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 8, border: 'none', cursor: running ? 'not-allowed' : 'pointer',
              background: running ? C.tag : C.accent,
              color: '#fff', fontSize: 13, fontWeight: 800,
              opacity: running ? 0.7 : 1,
              transition: 'all 0.15s',
            }}
          >
            {running ? (
              <>
                <span style={{
                  width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)',
                  borderTop: '2px solid white', borderRadius: '50%',
                  display: 'inline-block', animation: 'spin 0.7s linear infinite',
                }} />
                {elapsed}ms
              </>
            ) : (
              <>▶ Run Certification</>
            )}
          </button>
        </div>

        {/* Subtitle */}
        <p style={{ fontSize: 12, color: C.muted, margin: '0 0 28px', lineHeight: 1.6 }}>
          8-invariant deterministic storm validation suite &mdash; stale rejection &bull; flood collapse &bull;
          gap detection &bull; rebuild serialization &bull; deduplication &bull; recovery priority &bull;
          watermark monotonicity &bull; replay chain integrity
        </p>

        {/* Idle state */}
        {!report && !running && (
          <div style={{
            border: `1px dashed ${C.border}`, borderRadius: 12,
            padding: '60px 40px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>⚡</div>
            <p style={{ color: C.muted, fontSize: 14, margin: 0 }}>
              Press <strong style={{ color: C.text }}>Run Certification</strong> to execute all convergence invariants
              against the live runtime instance.
            </p>
            <p style={{ color: C.muted, fontSize: 11, marginTop: 8 }}>
              Also runnable from devtools: <code style={{ color: C.accent }}>runtime.certify().then(r =&gt; console.table(r.results))</code>
            </p>
          </div>
        )}

        {/* Running skeleton */}
        {running && (
          <div style={{
            border: `1px solid ${C.border}`, borderRadius: 12,
            padding: '40px', textAlign: 'center',
          }}>
            <div style={{
              width: 40, height: 40, border: `3px solid ${C.border}`,
              borderTop: `3px solid ${C.accent}`, borderRadius: '50%',
              animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
            }} />
            <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
              Injecting failure conditions &bull; verifying invariants&hellip;
            </p>
          </div>
        )}

        {/* Results */}
        {report && (
          <>
            {/* Certification badge */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '16px 20px', borderRadius: 10, marginBottom: 20,
              background: report.certified ? 'rgba(63,185,80,0.08)' : 'rgba(248,81,73,0.08)',
              border: `1px solid ${report.certified ? 'rgba(63,185,80,0.3)' : 'rgba(248,81,73,0.3)'}`,
            }}>
              <span style={{ fontSize: 24 }}>{report.certified ? '✅' : '❌'}</span>
              <div>
                <div style={{
                  fontSize: 13, fontWeight: 800,
                  color: report.certified ? C.passText : C.failText,
                }}>
                  {report.certified ? 'RUNTIME CERTIFIED — Pilot-grade convergence achieved' : 'NOT CERTIFIED — Invariant failures detected'}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                  {report.timestamp} &bull; {report.totalTests} tests &bull; {elapsed}ms total
                </div>
              </div>
            </div>

            <Scoreboard report={report} />

            {/* Test results */}
            {report.results.map((result, i) => (
              <TestBlock key={i} result={result} index={i} />
            ))}

            <TelemetryStream report={report} />
          </>
        )}
      </div>

      {/* Global animation */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
