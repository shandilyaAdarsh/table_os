import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrderStore, useAuthStore } from '../../../store/index.js';
import OrderCard from '../components/OrderCard.jsx';
import { Loader2 } from 'lucide-react';

/* ═══════════════════════════════════════════════════
   KDSBoard — connects to Supabase realtime
═══════════════════════════════════════════════════ */
const KDSBoard = () => {
  const orders            = useOrderStore(s => s.orders);
  const isLoading         = useOrderStore(s => s.isLoading);
  const fetchOrders       = useOrderStore(s => s.fetchOrders);
  const subscribeRealtime = useOrderStore(s => s.subscribeRealtime);
  const tenantId          = useAuthStore(s => s.tenantId);
  const user              = useAuthStore(s => s.user);
  const navigate          = useNavigate();

  const [mobileCol, setMobileCol]         = useState('pending');
  const [currentTime, setCurrentTime]     = useState('');
  const [isMuted, setIsMuted]             = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState('connecting'); // connecting | connected | disconnected
  const prevOrderCount                    = useRef(0);

  /* ── Dev fallback (inline) ─────────────────────── */
  const effectiveTenantId = tenantId || import.meta.env.VITE_TENANT_ID;
  const effectiveUser     = user || (effectiveTenantId ? { name: 'KDS Terminal', role: 'kitchen' } : null);

  /* ── Initial fetch + Realtime subscription ──────── */
  useEffect(() => {
    if (!effectiveTenantId) return;

    setRealtimeStatus('connecting');
    fetchOrders().then(() => setRealtimeStatus('connected'));

    const unsub = subscribeRealtime ? subscribeRealtime() : null;

    // Connection probe — if we can fetch, realtime is healthy
    const probe = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchOrders()
          .then(() => setRealtimeStatus('connected'))
          .catch(() => setRealtimeStatus('disconnected'));
      }
    }, 30_000); // re-probe every 30 s

    return () => {
      unsub && unsub();
      clearInterval(probe);
    };
  }, [tenantId]);

  /* ── Page Visibility API: re-sync when tab regains focus ── */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && effectiveTenantId) {
        setRealtimeStatus('connecting');
        fetchOrders().then(() => setRealtimeStatus('connected'));
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [tenantId]);

  /* ── Live clock ─────────────────────────────────── */
  useEffect(() => {
    const tick = () =>
      setCurrentTime(new Date().toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  /* ── New-order audio alert ──────────────────────── */
  const playOrderSound = () => {
    if (isMuted) return;
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(); osc.stop(ctx.currentTime + 0.5);
    } catch (e) { /* browser blocked audio context */ }
  };

  useEffect(() => {
    const curr = orders.filter(o => o.status === 'pending').length;
    if (curr > prevOrderCount.current) playOrderSound();
    prevOrderCount.current = curr;
  }, [orders.length]);

  /* ── Derived stats ──────────────────────────────── */
  const safeOrders   = Array.isArray(orders) ? orders : [];
  const pendingCount = safeOrders.filter(o => o.status === 'pending').length;
  const cookingCount = safeOrders.filter(o => o.status === 'cooking').length;
  const readyCount   = safeOrders.filter(o => o.status === 'ready').length;
  const totalItems   = safeOrders.reduce((a, o) => a + (o.items?.length || 0), 0);

  /* ── Column definitions ─────────────────────────── */
  const columns = [
    { status: 'pending', title: 'PENDING ORDERS',    count: pendingCount, badgeBg: '#8D4B00', emptyIcon: 'hourglass_empty' },
    { status: 'cooking', title: 'CURRENTLY COOKING', count: cookingCount, badgeBg: '#2D5FA3', emptyIcon: 'whatshot'        },
    { status: 'ready',   title: 'READY TO SERVE',    count: readyCount,   badgeBg: '#006948', emptyIcon: 'check_circle'    },
  ];

  /* ── Realtime dot colour ────────────────────────── */
  const dotColor = {
    connecting:   '#F59E0B',
    connected:    '#00C47D',
    disconnected: '#BA1A1A',
  }[realtimeStatus];

  const dotLabel = {
    connecting:   'Syncing…',
    connected:    'Realtime: Connected',
    disconnected: 'Realtime: Reconnecting',
  }[realtimeStatus];


  /* ── Loading screen ─────────────────────────────── */
  if (isLoading && safeOrders.length === 0) {
    return (
      <div style={{
        height: '100vh', width: '100vw',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '16px', background: '#F2F4F6',
        fontFamily: '"Inter", sans-serif',
      }}>
        <div style={{
          width: '56px', height: '56px',
          background: 'linear-gradient(15deg, #8D4B00, #B15F00)',
          borderRadius: '16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '8px',
        }}>
          <span style={{ fontSize: '22px', fontWeight: 900, color: '#FFF' }}>T</span>
        </div>
        <Loader2 size={28} style={{ color: '#8D4B00', animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#887364' }}>
          Syncing Terminal…
        </span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════ */
  return (
    <div style={{ minHeight: '100vh', background: '#F7F9FB', fontFamily: '"Inter", sans-serif', color: '#191C1E', userSelect: 'none', overflow: 'hidden' }}>

      {/* ━━━ HEADER ━━━ */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        zIndex: 50, height: '64px',
        background: '#FFFFFF',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px',
        boxShadow: '0px 1px 0px #E6E8EA',
      }}>
        {/* Left: logo + status pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '-0.04em', color: '#8D4B00', lineHeight: 1 }}>
            TableOS
          </h1>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { label: `${pendingCount} Pending`, bg: '#FFF4EC', color: '#8D4B00' },
              { label: `${cookingCount} Cooking`, bg: '#EEF3FB', color: '#2D5FA3' },
              { label: `${readyCount} Ready`,     bg: '#E8F6F1', color: '#006948' },
            ].map(({ label, bg, color }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '4px 10px',
                background: bg, color,
                borderRadius: '9999px',
                fontSize: '11px', fontWeight: 700,
              }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: color }} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Right: clock + controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              padding: '2px 8px',
              background: realtimeStatus === 'connected' ? '#E8F6F1' : '#FFF4EC',
              color: realtimeStatus === 'connected' ? '#006948' : '#8D4B00',
              border: `1px solid ${realtimeStatus === 'connected' ? '#B2DFCC' : '#F5D19A'}`,
              borderRadius: '4px',
              fontSize: '10px', fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase',
            }}>
              {realtimeStatus === 'connecting' ? '⟳ SYNC' : 'LIVE'}
            </div>
            <span style={{
              fontFamily: '"Inter", monospace',
              fontVariantNumeric: 'tabular-nums',
              fontSize: '22px', fontWeight: 700,
              letterSpacing: '-0.02em', color: '#191C1E',
            }}>
              {currentTime}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Mute toggle */}
            <span
              className="material-symbols-outlined"
              title={isMuted ? 'Unmute' : 'Mute alerts'}
              onClick={() => setIsMuted(m => !m)}
              style={{ fontSize: '22px', color: isMuted ? '#BA1A1A' : '#887364', cursor: 'pointer' }}
            >
              {isMuted ? 'notifications_off' : 'notifications'}
            </span>

            {/* Manual refresh */}
            <span
              className="material-symbols-outlined"
              title="Refresh orders"
              onClick={() => {
                setRealtimeStatus('connecting');
                fetchOrders().then(() => setRealtimeStatus('connected'));
              }}
              style={{ fontSize: '22px', color: '#887364', cursor: 'pointer' }}
            >
              refresh
            </span>

          </div>
        </div>
      </header>

      {/* ━━━ SIDEBAR ━━━ */}
      <aside style={{
        position: 'fixed', left: 0, top: '64px',
        width: '232px', height: 'calc(100vh - 64px - 32px)',
        background: '#F2F4F6',
        display: 'flex', flexDirection: 'column',
        padding: '24px 16px', gap: '4px',
      }}>
        <div style={{ padding: '0 8px', marginBottom: '28px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#8D4B00', lineHeight: 1, letterSpacing: '-0.02em' }}>
            Main Kitchen
          </h2>
          <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#887364', marginTop: '4px' }}>
            {effectiveUser?.name || 'Station'} · {effectiveUser?.role || 'Kitchen'}
          </p>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {[
            { icon: 'restaurant',  label: 'Live Orders',      active: true  },
            { icon: 'history',     label: 'Order History',    active: false },
            { icon: 'settings',    label: 'Kitchen Settings', active: false },
            { icon: 'inventory_2', label: 'Inventory',        active: false },
          ].map(({ icon, label, active }) => (
            <div
              key={label}
              className="cubic-transition"
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '10px 12px',
                background:   active ? '#FFFFFF' : 'transparent',
                color:        active ? '#8D4B00' : '#554336',
                borderRadius: '8px',
                fontWeight:   active ? 700 : 500,
                fontSize:     '14px',
                cursor:       'pointer',
                boxShadow:    active ? '0 1px 4px rgba(15,23,42,0.06)' : 'none',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>{icon}</span>
              {label}
            </div>
          ))}
        </nav>

        <div style={{ marginTop: 'auto' }}>
          <button
            className="cubic-transition"
            style={{
              width: '100%',
              background: 'linear-gradient(15deg, #8D4B00, #B15F00)',
              color: '#FFFFFF',
              fontWeight: 900, fontSize: '12px',
              textTransform: 'uppercase', letterSpacing: '0.15em',
              padding: '13px 16px',
              borderRadius: '6px',
              border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(141,75,0,0.2)',
            }}
          >
            New Manual Order
          </button>
        </div>
      </aside>

      {/* ━━━ MAIN BOARD ━━━ */}
      <main style={{ marginLeft: '232px', paddingTop: '64px', height: '100vh', display: 'flex', flexDirection: 'column', background: '#F7F9FB' }}>
        <div style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          overflow: 'hidden',
          marginBottom: '32px',
        }}>
          {columns.map(({ status, title, count, badgeBg, emptyIcon }, colIdx) => {
            const colOrders = safeOrders.filter(o => o.status === status);
            const isActive  = mobileCol === status;
            const colBg = colIdx === 1 ? '#F2F4F6' : '#F7F9FB';

            return (
              <section
                key={status}
                className={isActive ? '' : 'hidden-mobile'}
                style={{
                  display:       'flex',
                  flexDirection: 'column',
                  height:        '100%',
                  overflow:      'hidden',
                  background:    colBg,
                  borderRight:   colIdx < 2 ? '1px solid #E6E8EA' : 'none',
                }}
              >
                {/* Column header */}
                <div style={{
                  height: '48px', padding: '0 20px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: colBg,
                  borderBottom: '1px solid #E6E8EA',
                  position: 'sticky', top: 0, zIndex: 10,
                }}>
                  <h3 style={{
                    fontSize: '10px', fontWeight: 900,
                    textTransform: 'uppercase', letterSpacing: '0.2em',
                    color: '#554336',
                  }}>{title}</h3>
                  <span style={{
                    background: badgeBg, color: '#FFFFFF',
                    fontSize: '10px', fontWeight: 700,
                    padding: '2px 8px', borderRadius: '9999px',
                  }}>{count}</span>
                </div>

                {/* Scrollable order list */}
                <div
                  className="hide-scrollbar"
                  style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}
                >
                  {colOrders.length === 0 ? (
                    <div style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      height: '180px',
                      border: '2px dashed #DBC2B0', borderRadius: '12px', opacity: 0.5,
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '32px', color: '#887364', marginBottom: '8px' }}>
                        {emptyIcon}
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#887364', textAlign: 'center' }}>
                        No active<br />{title.toLowerCase()}
                      </span>
                    </div>
                  ) : (
                    colOrders.map(order => <OrderCard key={order.id} order={order} />)
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </main>

      {/* ━━━ FOOTER ━━━ */}
      <footer style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: '32px', zIndex: 50,
        background: '#FFFFFF',
        borderTop: '1px solid #E6E8EA',
        padding: '0 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          {[
            { label: 'AVG TICKET:', value: '—', valueColor: '#8D4B00' },
            { label: 'ITEMS:',      value: String(totalItems) },
            { label: 'SERVERS:',   value: '— ACTIVE' },
          ].map(({ label, value, valueColor }) => (
            <span key={label} style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#887364' }}>
              {label}&nbsp;<span style={{ color: valueColor || '#191C1E' }}>{value}</span>
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: dotColor,
              boxShadow: `0 0 8px ${dotColor}80`,
              transition: 'background 0.4s, box-shadow 0.4s',
              display: 'inline-block',
            }} />
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#887364' }}>
              {dotLabel}
            </span>
          </div>
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#DBC2B0' }}>
            TABLEOS KDS V2.4
          </span>
        </div>
      </footer>

      {/* ━━━ MOBILE BOTTOM NAV ━━━ */}
      <nav className="mobile-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#FFFFFF',
        borderTop: '1px solid #E6E8EA',
        padding: '8px 16px',
        zIndex: 55,
        justifyContent: 'space-around', alignItems: 'center',
      }}>
        {columns.map(({ status, title, emptyIcon }) => {
          const active = mobileCol === status;
          const icons  = { pending: 'pause_circle', cooking: 'local_fire_department', ready: 'check_circle' };
          return (
            <div key={status} onClick={() => setMobileCol(status)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '8px 20px',
              background: active ? '#FFF4EC' : 'transparent',
              color: active ? '#8D4B00' : '#887364',
              borderRadius: '10px', cursor: 'pointer',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>{icons[status]}</span>
              <span style={{ fontSize: '9px', fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: '2px' }}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
            </div>
          );
        })}
      </nav>

    </div>
  );
};

export default KDSBoard;
