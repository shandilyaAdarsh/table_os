import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKdsIdentityStore } from '../../../store/kdsIdentityStore.js';
import { clearLeadershipState, clearAllRuntimeState } from '../../../lib/idbStorage.js';

/* ════════════════════════════════════════════════
   KDSSettings — Station Alpha-1 // Protocol Sync
════════════════════════════════════════════════ */

const STATION_PRESETS = ['MAIN', 'GRILL', 'EXPO', 'FRYER', 'SAUTÉ', 'PASTRY', 'BAR'];

const Section = ({ title, subtitle, children }) => (
  <div style={{
    background: '#FFFFFF',
    borderRadius: '16px',
    border: '1px solid #E6E8EA',
    overflow: 'hidden',
    marginBottom: '24px',
  }}>
    <div style={{
      padding: '20px 28px',
      borderBottom: '1px solid #F1F3F5',
      background: '#F8F9FA',
    }}>
      <h3 style={{ fontSize: '13px', fontWeight: 900, color: '#1A1C1E', letterSpacing: '-0.01em', margin: 0 }}>{title}</h3>
      {subtitle && <p style={{ fontSize: '12px', color: '#6C757D', marginTop: '4px', margin: 0, marginTop: '4px' }}>{subtitle}</p>}
    </div>
    <div style={{ padding: '24px 28px' }}>
      {children}
    </div>
  </div>
);

const Field = ({ label, hint, children }) => (
  <div style={{ marginBottom: '24px' }}>
    <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
      {label}
    </label>
    {children}
    {hint && <p style={{ fontSize: '11px', color: '#6C757D', marginTop: '6px' }}>{hint}</p>}
  </div>
);

const Toggle = ({ enabled, onChange }) => (
  <div
    onClick={() => onChange(!enabled)}
    style={{
      width: '44px', height: '24px',
      borderRadius: '9999px',
      background: enabled ? '#E31E24' : '#FECACA',
      position: 'relative',
      cursor: 'pointer',
      transition: 'background 0.2s ease',
      flexShrink: 0,
    }}
  >
    <div style={{
      position: 'absolute',
      top: '3px',
      left: enabled ? '23px' : '3px',
      width: '18px', height: '18px',
      borderRadius: '50%',
      background: '#FFFFFF',
      boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
      transition: 'left 0.2s ease',
    }} />
  </div>
);

const ToggleRow = ({ label, hint, enabled, onChange }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 0',
    borderBottom: '1px solid #F1F3F5',
  }}>
    <div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#1A1C1E' }}>{label}</div>
      {hint && <div style={{ fontSize: '11px', color: '#6C757D', marginTop: '2px' }}>{hint}</div>}
    </div>
    <Toggle enabled={enabled} onChange={onChange} />
  </div>
);

export default function KDSSettings() {
  const navigate = useNavigate();
  const { stationId, branchId, kitchenDeviceId, setStationId, setBranchId, clearIdentity } = useKdsIdentityStore();

  // Local state for fields
  const [localStation, setLocalStation] = useState(stationId || '');
  const [localBranch, setLocalBranch]   = useState(branchId || '');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [autoRefresh, setAutoRefresh]   = useState(true);
  const [compactCards, setCompactCards] = useState(false);
  const [showTimers, setShowTimers]     = useState(true);
  const [saved, setSaved]               = useState(false);
  const [resetting, setResetting]       = useState(false);

  const handleSave = () => {
    if (localStation.trim()) setStationId(localStation.trim().toUpperCase());
    if (localBranch.trim())  setBranchId(localBranch.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleFullReset = async () => {
    if (!window.confirm('This will clear all KDS state including leadership lock and identity. Continue?')) return;
    setResetting(true);
    await clearAllRuntimeState();
    await clearLeadershipState();
    clearIdentity();
    setTimeout(() => window.location.reload(), 500);
  };

  const isDirty = localStation !== (stationId || '') || localBranch !== (branchId || '');

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F8F9FA',
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      color: '#1A1C1E',
    }}>

      {/* ── Header ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: '#FFFFFF',
        borderBottom: '1px solid #E6E8EA',
        padding: '0 40px',
        height: '64px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate('/kds')}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px',
              background: '#F1F3F5',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px', fontWeight: 700,
              color: '#6C757D',
              cursor: 'pointer',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
            KDS Board
          </button>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 900, color: '#1A1C1E', margin: 0, lineHeight: 1 }}>
              KDS Configuration
            </h1>
            <p style={{ fontSize: '11px', color: '#6C757D', margin: 0, fontFamily: 'monospace', marginTop: '2px' }}>
              Station {stationId || 'Unassigned'} // Protocol Sync Settings
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!isDirty && !saved}
          style={{
            padding: '10px 24px',
            background: saved ? '#006948' : isDirty ? '#E31E24' : '#FECACA',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '10px',
            fontSize: '13px', fontWeight: 800,
            cursor: isDirty ? 'pointer' : 'default',
            transition: 'all 0.2s ease',
            display: 'flex', alignItems: 'center', gap: '8px',
            letterSpacing: '0.02em',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>
            {saved ? 'check_circle' : 'save'}
          </span>
          {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </header>

      {/* ── Body ── */}
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '40px 24px' }}>

        {/* Station Identity */}
        <Section title="Station Identity" subtitle="Defines this terminal's role in the kitchen network">
          <Field label="Station ID" hint="Used to route orders to specific kitchen stations. Must be unique per terminal.">
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
              {STATION_PRESETS.map(p => (
                <button
                  key={p}
                  onClick={() => setLocalStation(p)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${localStation === p ? '#E31E24' : '#E6E8EA'}`,
                    background: localStation === p ? '#FFF0F0' : '#F8F9FA',
                    color: localStation === p ? '#E31E24' : '#6C757D',
                    fontSize: '11px', fontWeight: 800,
                    cursor: 'pointer',
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={localStation}
              onChange={e => setLocalStation(e.target.value.toUpperCase())}
              placeholder="e.g. GRILL, EXPO, MAIN"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1.5px solid #E6E8EA',
                fontSize: '14px', fontWeight: 700,
                color: '#1A1C1E',
                fontFamily: 'monospace',
                background: '#F8F9FA',
                outline: 'none',
              }}
            />
          </Field>

          <Field label="Branch ID" hint="The branch this KDS terminal is assigned to. Filters which orders appear.">
            <input
              type="text"
              value={localBranch}
              onChange={e => setLocalBranch(e.target.value)}
              placeholder="Branch UUID"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1.5px solid #E6E8EA',
                fontSize: '13px',
                color: '#1A1C1E',
                fontFamily: 'monospace',
                background: '#F8F9FA',
                outline: 'none',
              }}
            />
          </Field>

          {/* Device info */}
          <div style={{
            padding: '14px 16px',
            background: '#F1F3F5',
            borderRadius: '10px',
            display: 'flex', gap: '32px',
          }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Device ID</div>
              <div style={{ fontSize: '12px', fontFamily: 'monospace', color: '#6C757D', marginTop: '2px' }}>
                {kitchenDeviceId?.slice(0, 18)}…
              </div>
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Current Station</div>
              <div style={{ fontSize: '12px', fontFamily: 'monospace', color: '#E31E24', fontWeight: 700, marginTop: '2px' }}>
                {stationId || 'Not Set'}
              </div>
            </div>
          </div>
        </Section>

        {/* Audio Settings */}
        <Section title="Audio & Alerts" subtitle="Control how this terminal notifies kitchen staff">
          <ToggleRow
            label="Order Alert Sound"
            hint="Play a sound chime when a new order arrives"
            enabled={audioEnabled}
            onChange={setAudioEnabled}
          />
          <ToggleRow
            label="Auto-Refresh Orders"
            hint="Automatically re-sync on tab focus and visibility change"
            enabled={autoRefresh}
            onChange={setAutoRefresh}
          />
        </Section>

        {/* Display Settings */}
        <Section title="Display Preferences" subtitle="Customise how orders are rendered on this screen">
          <ToggleRow
            label="Compact Order Cards"
            hint="Show condensed cards to fit more orders on screen"
            enabled={compactCards}
            onChange={setCompactCards}
          />
          <ToggleRow
            label="Show Order Timers"
            hint="Display elapsed time since order was placed"
            enabled={showTimers}
            onChange={setShowTimers}
          />
        </Section>

        {/* Danger Zone */}
        <Section title="Danger Zone" subtitle="Irreversible actions that affect this terminal's runtime state">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px',
              border: '1px solid #FECACA',
              borderRadius: '10px',
              background: '#FFFBF5',
            }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#E31E24' }}>Clear Leadership Lock</div>
                <div style={{ fontSize: '11px', color: '#6C757D', marginTop: '2px' }}>
                  Releases the multi-tab leadership lease for this station
                </div>
              </div>
              <button
                onClick={async () => {
                  await clearLeadershipState();
                  window.location.reload();
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid #FECACA',
                  background: '#FFFFFF',
                  color: '#E31E24',
                  fontSize: '11px', fontWeight: 800,
                  cursor: 'pointer',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  whiteSpace: 'nowrap',
                }}
              >
                Release Lock
              </button>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px',
              border: '1px solid #FECACA',
              borderRadius: '10px',
              background: '#FFF5F5',
            }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#DC2626' }}>Full Terminal Reset</div>
                <div style={{ fontSize: '11px', color: '#6C757D', marginTop: '2px' }}>
                  Clears all runtime state, identity and IDB data — reloads terminal
                </div>
              </div>
              <button
                onClick={handleFullReset}
                disabled={resetting}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid #FECACA',
                  background: resetting ? '#F87171' : '#DC2626',
                  color: '#FFFFFF',
                  fontSize: '11px', fontWeight: 800,
                  cursor: resetting ? 'wait' : 'pointer',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  whiteSpace: 'nowrap',
                }}
              >
                {resetting ? 'Resetting…' : 'Reset Terminal'}
              </button>
            </div>
          </div>
        </Section>

      </div>
    </div>
  );
}
