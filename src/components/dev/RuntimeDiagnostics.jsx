import React, { useState, useEffect } from 'react';
import { useConnectivityStore } from '../../store/connectivityStore';
import { useRuntimeIdentityStore } from '../../store/runtimeIdentityStore';
import { useMutationCoordinator } from '../../store/mutationCoordinator';
import { useProjectionCoordinator } from '../../store/projectionCoordinator';
import { useLeadershipStore } from '../../store/leadershipStore';
import { useTransportStore, TransportState } from '../../store/transportStore';
import { WebSocketRuntime } from '../../lib/transport/WebSocketRuntime';
import {
  clearLeadershipState,
  clearAllRuntimeState,
  inspectRuntimeState,
} from '../../lib/idbStorage';

const IS_DEV = import.meta.env.DEV ?? true;

export default function RuntimeDiagnostics() {
  const [isOpen, setIsOpen] = useState(false);
  const [idbSnapshot, setIdbSnapshot] = useState(null);
  const [resetting, setResetting] = useState(false);

  // ── Store subscriptions ───────────────────────────────────────────────────
  const { isOnline, lastHeartbeat, lastSuccessfulPing } = useConnectivityStore();
  const { deviceId, terminalId, branchId, runtimeSessionId } = useRuntimeIdentityStore();
  const { queue, isDraining } = useMutationCoordinator();
  const { lastAppliedSequence, isReplaying, isFetchingSnapshot, pendingInvalidations } = useProjectionCoordinator();
  
  const {
    isLeader, isAttemptingLock, lockName, leaderHeartbeatAge, lastHeartbeatAt,
    leaderRuntimeEpoch, runtimeEpoch, hmrReplacementCount, activeIntervals, activeListeners, isDisposed: isLeadershipDisposed,
    forceLeadershipRecovery, disposeLeadership, releaseLeadership, restartRuntime
  } = useLeadershipStore();
  
  const { state: wsState, replayCursor, connectionId, serverEpoch, isSyncing } = useTransportStore();

  // ── Structured console snapshot on open ──────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const snapshot = {
      connectivity: { isOnline, lastHeartbeat, lastSuccessfulPing },
      identity: { deviceId, terminalId, branchId, runtimeSessionId },
      leadership: { isLeader, lockName, runtimeEpoch, leaderRuntimeEpoch, activeIntervals, activeListeners, isLeadershipDisposed },
      transport: { wsState, replayCursor, connectionId, serverEpoch, isSyncing },
      mutations: { queueLength: queue.length, isDraining },
      projections: { lastAppliedSequence, isReplaying, isFetchingSnapshot },
    };
    console.group('[RuntimeDiagnostics] 📊 Full Runtime Snapshot');
    console.table(snapshot.connectivity);
    console.table(snapshot.identity);
    console.table(snapshot.leadership);
    console.table(snapshot.transport);
    console.table(snapshot.mutations);
    console.table(snapshot.projections);
    console.groupEnd();
  }, [isOpen]);

  const handleInspectIDB = async () => {
    const snap = await inspectRuntimeState();
    setIdbSnapshot(snap);
  };

  const handleClearLease = async () => {
    setResetting(true);
    await clearLeadershipState();
    setResetting(false);
    alert('KDS leadership lease cleared. Reloading...');
    window.location.reload();
  };

  const handleFullReset = async () => {
    if (!confirm('⚠️ This will clear ALL runtime state (identity, projections, leadership). Mutation queue is preserved. Continue?')) return;
    setResetting(true);
    await clearAllRuntimeState();
    setResetting(false);
    alert('Runtime state cleared. Reloading...');
    window.location.reload();
  };
  
  const handleForceDispose = () => {
    console.warn('[Diagnostics] Executing forceful manual runtime disposal.');
    disposeLeadership();
    if (WebSocketRuntime.instance) {
      WebSocketRuntime.instance.disposeTransport();
    }
  };
  
  const handleSimulateCrash = () => {
    console.warn('[Diagnostics] Simulating crash (dropping websocket and clearing memory without lock release).');
    if (WebSocketRuntime.instance && WebSocketRuntime.instance.ws) {
      // Abrupt closure without lifecycle release
      WebSocketRuntime.instance.ws.close();
    }
    useTransportStore.setState({ state: TransportState.DISCONNECTED });
  };

  const wsColor = {
    [TransportState.CONNECTED]:    '#4ade80',
    [TransportState.CONNECTING]:   '#fbbf24',
    [TransportState.RECONNECTING]: '#fbbf24',
    [TransportState.DEGRADED]:     '#f87171',
    [TransportState.FAILED]:       '#ef4444',
    [TransportState.DISCONNECTED]: '#94a3b8',
    [TransportState.AUTHENTICATING]: '#a78bfa',
  }[wsState] ?? '#94a3b8';

  if (!isOpen) {
    return (
      <button
        id="runtime-diagnostics-toggle"
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed', bottom: '8px', right: '8px',
          background: 'rgba(15,23,42,0.85)', color: '#4ade80',
          fontSize: '10px', fontFamily: 'monospace', fontWeight: 700,
          padding: '4px 10px', borderRadius: '4px', border: 'none',
          cursor: 'pointer', zIndex: 9998,
          letterSpacing: '0.1em', opacity: 0.6,
        }}
        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
      >
        DIAG
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 0, right: 0,
      width: '420px', maxHeight: '95vh',
      overflowY: 'auto',
      background: '#0f172a', color: '#94a3b8',
      fontFamily: 'monospace', fontSize: '11px',
      padding: '12px 14px', zIndex: 9998,
      borderTop: '1px solid #1e293b', borderLeft: '1px solid #1e293b',
      borderTopLeftRadius: '8px',
      boxShadow: '-4px 0 25px rgba(0,0,0,0.5)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #1e293b', paddingBottom: '8px' }}>
        <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: '12px' }}>⬡ Runtime Diagnostics</span>
        <button
          onClick={() => setIsOpen(false)}
          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}
        >✕</button>
      </div>

      {/* Connectivity */}
      <DiagSection title="Connectivity">
        <Row label="Status" value={isOnline ? 'ONLINE' : 'OFFLINE'} color={isOnline ? '#4ade80' : '#ef4444'} />
        <Row label="Last Heartbeat" value={new Date(lastHeartbeat).toLocaleTimeString()} />
      </DiagSection>

      {/* Transport / WebSocket */}
      <DiagSection title="Transport (WebSocket)">
        <Row label="WS State" value={wsState} color={wsColor} />
        <Row label="Replay Cursor" value={replayCursor} />
        <Row label="Server Epoch" value={serverEpoch ?? 'null'} />
        <Row label="Connection ID" value={connectionId ? connectionId.slice(0, 12) + '…' : 'none'} />
        <Row label="Syncing" value={isSyncing ? 'Yes' : 'No'} color={isSyncing ? '#fbbf24' : undefined} />
      </DiagSection>

      {/* Leadership */}
      <DiagSection title="KDS Leadership">
        <Row label="Role" value={isLeader ? 'LEADER ✅' : isAttemptingLock ? 'Queued…' : 'STANDBY'} color={isLeader ? '#4ade80' : '#fbbf24'} />
        <Row label="Lock Name" value={lockName ?? 'none'} />
        <Row label="Heartbeat Age" value={leaderHeartbeatAge > 0 ? `${(leaderHeartbeatAge / 1000).toFixed(1)}s` : '—'} color={leaderHeartbeatAge > 6000 ? '#ef4444' : undefined} />
        <Row label="Leader Epoch" value={leaderRuntimeEpoch ? leaderRuntimeEpoch.split('-')[0] : '—'} color="#a78bfa" />
        <Row label="Own Epoch" value={runtimeEpoch ? runtimeEpoch.split('-')[0] : '—'} />
        <Row label="Disposed Flag" value={isLeadershipDisposed ? 'TRUE' : 'FALSE'} color={isLeadershipDisposed ? '#ef4444' : '#4ade80'} />
        <Row label="Active Intervals" value={activeIntervals} color={activeIntervals > 1 ? '#ef4444' : undefined} />
        <Row label="Active Listeners" value={activeListeners} color={activeListeners > 1 ? '#ef4444' : undefined} />
        <Row label="HMR Replacements" value={hmrReplacementCount} />
      </DiagSection>

      {/* Identity */}
      <DiagSection title="Runtime Identity">
        <Row label="Device ID" value={deviceId ? deviceId.slice(0, 10) + '…' : '—'} />
        <Row label="Terminal ID" value={terminalId || 'Not set'} />
        <Row label="Session ID" value={runtimeSessionId ? runtimeSessionId.slice(0, 10) + '…' : '—'} />
      </DiagSection>

      {/* Mutation Queue */}
      <DiagSection title="Mutation Queue">
        <Row label="Draining" value={isDraining ? 'Yes' : 'No'} color={isDraining ? '#fbbf24' : undefined} />
        <Row label="Queue Size" value={queue.length} color={queue.length > 0 ? '#fbbf24' : undefined} />
      </DiagSection>

      {/* Projection Coordinator */}
      <DiagSection title="Projection Coordinator">
        <Row label="Last Sequence" value={lastAppliedSequence} />
        <Row label="Pending Invalids" value={Array.from(pendingInvalidations || []).join(', ') || 'None'} />
      </DiagSection>

      {/* Dev Actions */}
      {IS_DEV && (
        <DiagSection title="Dev Tools">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <button onClick={handleForceDispose} style={btnStyle('#9333ea', '#faf5ff')}>
              🛑 Force Runtime Dispose
            </button>
            <button onClick={handleSimulateCrash} style={btnStyle('#dc2626', '#fef2f2')}>
              💥 Simulate Crash
            </button>
            <button onClick={() => releaseLeadership()} style={btnStyle('#eab308', '#fefce8')}>
              🔓 Release Leadership
            </button>
            <button onClick={() => restartRuntime()} style={btnStyle('#2563eb', '#eff6ff')}>
              🔄 Restart Runtime
            </button>
            <button onClick={handleClearLease} disabled={resetting} style={btnStyle('#ea580c', '#fff7ed')}>
              🗑 Clear KDS Lease
            </button>
            <button onClick={handleFullReset} disabled={resetting} style={btnStyle('#7f1d1d', '#fef2f2')}>
              ⚡ Full Reset IDB
            </button>
            <button onClick={handleInspectIDB} style={btnStyle('#059669', '#ecfdf5')} className="col-span-2">
              🔍 Inspect IDB State
            </button>
          </div>
          {idbSnapshot && (
            <pre style={{ marginTop: '8px', fontSize: '9px', color: '#64748b', maxHeight: '120px', overflow: 'auto', whiteSpace: 'pre-wrap', background: '#020617', padding: '6px', borderRadius: '4px' }}>
              {JSON.stringify(idbSnapshot, null, 2)}
            </pre>
          )}
        </DiagSection>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DiagSection({ title, children }) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ color: '#38bdf8', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px', borderBottom: '1px solid #1e293b', paddingBottom: '2px' }}>
        {title}
      </div>
      <div style={{ paddingLeft: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
      <span style={{ opacity: 0.6, flexShrink: 0 }}>{label}:</span>
      <span style={{ color: color ?? '#e2e8f0', textAlign: 'right', wordBreak: 'break-all' }}>{String(value)}</span>
    </div>
  );
}

function btnStyle(color, bg) {
  return {
    padding: '6px 8px', borderRadius: '4px',
    border: `1px solid ${color}`,
    background: 'transparent', color: color,
    fontSize: '9px', fontWeight: 700, cursor: 'pointer',
    textAlign: 'center', letterSpacing: '0.05em',
  };
}
