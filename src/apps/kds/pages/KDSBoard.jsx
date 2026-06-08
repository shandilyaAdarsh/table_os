import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrderStore, useAuthStore } from '../../../store/index.js';
import { useKitchenOrdersProjection } from '../../../store/projections/kitchenOrdersProjection.js';
import { useKitchenMetricsProjection } from '../../../store/projections/kitchenMetricsProjection.js';
import { useMutationCoordinator } from '../../../store/mutationCoordinator.js';
import { useKdsIdentityStore } from '../../../store/kdsIdentityStore.js';
import { useRuntimeIdentityStore } from '../../../store/runtimeIdentityStore.js';
import { useRuntimeAuthStore } from '../../../store/runtimeAuthStore.js';
import { clearAllRuntimeState } from '../../../lib/idbStorage.js';
import OrderCard from '../components/OrderCard.jsx';
import { Loader2 } from 'lucide-react';
import { runtime } from '../../../runtime/index.js';

/* ═══════════════════════════════════════════════════
   KDSBoard — connects to Supabase realtime
═══════════════════════════════════════════════════ */
const KDSBoard = () => {
  // New Runtime Projections
  const rawOrders = useKitchenOrdersProjection(s => s.orders);
  const rebuildOrders = useKitchenOrdersProjection(s => s.rebuild);
  const getOptimisticOrders = useKitchenOrdersProjection(s => s.getOptimisticOrders);
  const isOrdersLoading = useKitchenOrdersProjection(s => s.isRebuilding);

  const metrics = useKitchenMetricsProjection(s => s.metrics);
  const rebuildMetrics = useKitchenMetricsProjection(s => s.rebuild);

  // Mutation Pipeline for Optimistic UI
  const { queue } = useMutationCoordinator();
  const liveOrders = getOptimisticOrders(queue);

  // Identity
  const { stationId, runtimeSessionId } = useKdsIdentityStore();
  const { branchId } = useRuntimeIdentityStore();
  
  // Leadership Election removed as per user request

  // Legacy (History only)
  const historyOrders     = useOrderStore(s => s.historyOrders);
  const fetchHistory      = useOrderStore(s => s.fetchHistory);
  const isLoading         = useOrderStore(s => s.isLoading) || isOrdersLoading;
  
  const tenantId          = useAuthStore(s => s.tenantId);
  const user              = useAuthStore(s => s.user);
  const { clearRuntime }  = useRuntimeAuthStore();
  const navigate          = useNavigate();
  
  const staffName = localStorage.getItem('kds_staff_name') || 'Kitchen Staff';
  const staffRole = localStorage.getItem('kds_staff_role') || 'staff';
  const branchName = localStorage.getItem('kds_branch_name') || 'Restaurant Branch';
  const tenantName = localStorage.getItem('kds_tenant_name') || 'Restaurant Info';

  const handleLogout = () => {
    clearRuntime();
    localStorage.removeItem('kds_staff_name');
    localStorage.removeItem('kds_staff_role');
    navigate('/kds/login');
  };

  const [mobileCol, setMobileCol]         = useState('pending');
  const [currentTime, setCurrentTime]     = useState('');
  const [isMuted, setIsMuted]             = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState('connecting'); // connecting | connected | disconnected
  const [activeTab, setActiveTab]         = useState('Live Orders'); // 'Live Orders' | 'Order History'
  const [confirmModal, setConfirmModal]   = useState(null); // { title, message, onConfirm }
  const [historySearch, setHistorySearch] = useState('');
  const [historySort, setHistorySort]     = useState('newest'); // newest | oldest
  const [historyFilter, setHistoryFilter] = useState('day'); // day | week | month | all
  const prevOrderCount                    = useRef(0);

  /* ── Dev fallback (inline) ─────────────────────── */
  const effectiveTenantId = tenantId || import.meta.env.VITE_TENANT_ID;
  const effectiveUser     = user || (effectiveTenantId ? { name: 'KDS Terminal', role: 'kitchen' } : null);

  /* ── Initial fetch + Realtime subscription ──────── */
  /* ── Initial fetch ──────── */
  useEffect(() => {
    if (!effectiveTenantId || !branchId) return;
    
    // Initialize MutationGateway for replay isolation
    runtime.mutation.initializeSession(runtimeSessionId || 'kds_session_default', 'kds_board');

    // Attempt lock acquisition on mount or station change removed

    if (activeTab === 'Live Orders') {
      if (liveOrders.length === 0) setRealtimeStatus('connecting');
      Promise.all([
        rebuildOrders(branchId, stationId),
        rebuildMetrics(branchId, stationId)
      ]).then(() => setRealtimeStatus('connected'));
    } else {
      if (historyOrders.length === 0) setRealtimeStatus('connecting');
      fetchHistory().then(() => setRealtimeStatus('connected'));
    }

    // No probe needed, ProjectionCoordinator + WebSocketRuntime handles lifecycle
    
  }, [tenantId, branchId, stationId, activeTab, rebuildOrders, rebuildMetrics, fetchHistory]);

  /* ── Realtime subscription is now handled globally by WebSocketRuntime ── */

  /* ── Page Visibility API: re-sync when tab regains focus ── */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && effectiveTenantId && branchId) {
        if (activeTab === 'Live Orders') {
          rebuildOrders(branchId, stationId);
          rebuildMetrics(branchId, stationId);
        } else {
          fetchHistory();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [tenantId, activeTab]);

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
    const curr = liveOrders.filter(o => o.status === 'pending').length;
    if (curr > prevOrderCount.current) playOrderSound();
    prevOrderCount.current = curr;
  }, [liveOrders.length]);

  /* ── Derived stats ──────────────────────────────── */
  const pendingCount = liveOrders.filter(o => o.status === 'pending').length;
  const preparingCount = liveOrders.filter(o => o.status === 'preparing' || o.status === 'accepted').length;
  const readyCount   = liveOrders.filter(o => o.status === 'ready').length;

  /* ── Column definitions ─────────────────────────── */
  const columns = [
    { status: ['pending'], title: 'PENDING ORDERS',    count: pendingCount, badgeBg: '#E31E24', emptyIcon: 'hourglass_empty' },
    { status: ['accepted', 'preparing'], title: 'CURRENTLY COOKING', count: preparingCount, badgeBg: '#2D5FA3', emptyIcon: 'whatshot'        },
    { status: ['ready'],   title: 'READY TO SERVE',    count: readyCount,   badgeBg: '#006948', emptyIcon: 'check_circle'    },
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
  if (isLoading && liveOrders.length === 0 && historyOrders.length === 0) {
    return (
      <div style={{
        height: '100vh', width: '100vw',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '16px', background: '#F8F9FA',
        fontFamily: '"Plus Jakarta Sans", sans-serif',
      }}>
        <div style={{
          width: '56px', height: '56px',
          background: 'linear-gradient(15deg, #E31E24, #B91C1C)',
          borderRadius: '16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '8px',
        }}>
          <span style={{ fontSize: '22px', fontWeight: 900, color: '#FFF' }}>T</span>
        </div>
        <Loader2 size={28} style={{ color: '#E31E24', animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#6C757D' }}>
          Syncing Terminal…
        </span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════ */
  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA', fontFamily: '"Plus Jakarta Sans", sans-serif', color: '#1A1C1E', userSelect: 'none', overflow: 'hidden' }}>

      {/* MULTI-TAB LEADERSHIP OVERLAY REMOVED */}

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
          <h1 style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '-0.04em', color: '#E31E24', lineHeight: 1 }}>
            Orderlyy
          </h1>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '6px 14px',
            background: '#FEE2E2', color: '#E31E24',
            borderRadius: '12px',
            border: '1px solid #FCA5A5',
            boxShadow: '0 1px 2px rgba(141,75,0,0.05)'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>analytics</span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.8, lineHeight: 1 }}>Orders Today</span>
              <span style={{ fontSize: '16px', fontWeight: 900, lineHeight: 1.1 }}>{metrics.totalOrdersToday || 0}</span>
            </div>
          </div>
        </div>

        {/* Right: clock + controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              padding: '2px 8px',
              background: realtimeStatus === 'connected' ? '#E8F6F1' : '#FEE2E2',
              color: realtimeStatus === 'connected' ? '#006948' : '#E31E24',
              border: `1px solid ${realtimeStatus === 'connected' ? '#B2DFCC' : '#FCA5A5'}`,
              borderRadius: '4px',
              fontSize: '10px', fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase',
            }}>
              {realtimeStatus === 'connecting' ? '⟳ SYNC' : 'LIVE'}
            </div>
            <span style={{
              fontFamily: '"Plus Jakarta Sans", monospace',
              fontVariantNumeric: 'tabular-nums',
              fontSize: '22px', fontWeight: 700,
              letterSpacing: '-0.02em', color: '#1A1C1E',
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
              style={{ fontSize: '22px', color: isMuted ? '#BA1A1A' : '#6C757D', cursor: 'pointer' }}
            >
              {isMuted ? 'notifications_off' : 'notifications'}
            </span>

            {/* Manual refresh */}
            <span
              className="material-symbols-outlined"
              title="Refresh orders"
              onClick={() => {
                setRealtimeStatus('connecting');
                if (activeTab === 'Live Orders') {
                  Promise.all([
                    rebuildOrders(branchId, stationId),
                    rebuildMetrics(branchId, stationId)
                  ]).then(() => setRealtimeStatus('connected'));
                } else {
                  fetchHistory(historyFilter).then(() => setRealtimeStatus('connected'));
                }
              }}
              style={{ fontSize: '22px', color: '#6C757D', cursor: 'pointer' }}
            >
              refresh
            </span>

          </div>
        </div>
      </header>

      {/* ━━━ SIDEBAR ━━━ */}
      <aside style={{
        position: 'fixed', left: 0, top: '64px',
        width: '232px', height: 'calc(100vh - 64px)',
        background: '#F8F9FA',
        display: 'flex', flexDirection: 'column',
        padding: '24px 16px', gap: '4px',
      }}>
        <div style={{ padding: '0 8px', marginBottom: '28px' }}>
          <p style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#6C757D', margin: '0 0 4px 0' }}>{tenantName}</p>
          <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#E31E24', lineHeight: 1.2, letterSpacing: '-0.02em', margin: 0 }}>
            {branchName}
          </h2>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {[
            { icon: 'restaurant',  label: 'Live Orders'   },
            { icon: 'history',     label: 'Order History' },
          ].map(({ icon, label }) => {
            const active = activeTab === label;
            return (
              <div
                key={label}
                onClick={() => setActiveTab(label)}
                className="cubic-transition"
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 12px',
                  background:   active ? '#FFFFFF' : 'transparent',
                  color:        active ? '#E31E24' : '#6C757D',
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
            );
          })}
        </nav>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ padding: '12px', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E6E8EA' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#FEE2E2', color: '#E31E24', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                {staffName.charAt(0).toUpperCase()}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#1A1C1E', margin: 0, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{staffName}</p>
                <p style={{ fontSize: '11px', color: '#6C757D', margin: 0, textTransform: 'capitalize' }}>{staffRole.replace(/_/g, ' ')}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              style={{
                width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #FCA5A5',
                background: '#FFF5F5', color: '#E31E24', fontSize: '12px', fontWeight: 600,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>logout</span>
              Log Out
            </button>
          </div>
        </div>
      </aside>

      {/* ━━━ MAIN BOARD ━━━ */}
      <main style={{ marginLeft: '232px', marginTop: '64px', height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', background: '#F8F9FA', overflow: 'hidden' }}>
        {activeTab === 'Live Orders' ? (
          <div style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            overflow: 'hidden',
            marginBottom: '0px',
            minHeight: 0,
          }}>
            {columns.map(({ status, title, count, badgeBg, emptyIcon }, colIdx) => {
              const colOrders = liveOrders.filter(o => status.includes(o.status));
              const isActive  = mobileCol === status[0];
              const colBg = colIdx === 1 ? '#F8F9FA' : '#F8F9FA';

              return (
                <section
                  key={status[0]}
                  className={isActive ? '' : 'hidden-mobile'}
                  style={{
                    display:       'flex',
                    flexDirection: 'column',
                    height:        '100%',
                    minHeight:     0,
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
                      color: '#6C757D',
                    }}>{title}</h3>
                    <span style={{
                      background: badgeBg, color: '#FFFFFF',
                      fontSize: '10px', fontWeight: 700,
                      padding: '2px 8px', borderRadius: '9999px',
                    }}>{count}</span>
                  </div>

                  {/* Scrollable order list */}
                  <div
                    style={{ flex: '1 1 0', overflowY: 'auto', overflowX: 'hidden', padding: '16px', paddingBottom: '32px', display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0 }}
                  >
                    {colOrders.length === 0 ? (
                      <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        height: '180px',
                        border: '2px dashed #DBC2B0', borderRadius: '12px', opacity: 0.5,
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '32px', color: '#6C757D', marginBottom: '8px' }}>
                          {emptyIcon}
                        </span>
                        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6C757D', textAlign: 'center' }}>
                          No active<br />{title.toLowerCase()}
                        </span>
                      </div>
                    ) : (
                      colOrders.map(order => <OrderCard key={order.ticketId || order.id} order={order} setConfirmModal={setConfirmModal} />)
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          /* ━━━ HISTORY VIEW ━━━ */
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{
              padding: '16px 32px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: '1px solid #E6E8EA',
              background: '#FFFFFF',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                <h3 style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#6C757D' }}>
                  Order History
                </h3>
                {/* Search / Filter */}
                <div style={{ position: 'relative' }}>
                  <span className="material-symbols-outlined" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', color: '#6C757D' }}>
                    search
                  </span>
                  <input
                    type="text"
                    placeholder="Search Table #..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    style={{
                      padding: '8px 12px 8px 38px',
                      borderRadius: '8px',
                      border: '1px solid #E6E8EA',
                      fontSize: '13px',
                      background: '#F8F9FA',
                      width: '200px',
                    }}
                  />
                </div>
              </div>

              {/* Filters & Sort */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                {/* Date Filters */}
                <div style={{ 
                  display: 'flex', 
                  background: '#F8F9FA', 
                  padding: '4px', 
                  borderRadius: '10px',
                  gap: '2px'
                }}>
                  {['day', 'week', 'month', 'all'].map(f => (
                    <button
                      key={f}
                      onClick={() => {
                        setHistoryFilter(f);
                        fetchHistory(f);
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '7px',
                        border: 'none',
                        fontSize: '11px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        cursor: 'pointer',
                        background: historyFilter === f ? '#FFFFFF' : 'transparent',
                        color: historyFilter === f ? '#E31E24' : '#6C757D',
                        boxShadow: historyFilter === f ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#6C757D', textTransform: 'uppercase' }}>Sort:</span>
                  <select
                    value={historySort}
                    onChange={(e) => setHistorySort(e.target.value)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: '1px solid #E6E8EA',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#6C757D',
                      background: '#FFFFFF'
                    }}
                  >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                  </select>
                </div>
              </div>
            </div>

            <div
              className="hide-scrollbar"
              style={{
                flex: 1, overflowY: 'auto', padding: '32px',
                display: 'flex', flexDirection: 'column', gap: '40px'
              }}
            >
              {(() => {
                let filtered = historyOrders.filter(o => 
                  o.tableNum?.toString().includes(historySearch) || 
                  o.customerName?.toLowerCase().includes(historySearch.toLowerCase()) ||
                  o.items?.some(it => it.name.toLowerCase().includes(historySearch.toLowerCase()))
                );
                
                if (historySort === 'newest') {
                  filtered = [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                } else {
                  filtered = [...filtered].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                }

                if (filtered.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '64px', color: '#6C757D' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '48px', opacity: 0.3, marginBottom: '16px' }}>
                        inventory_2
                      </span>
                      <p style={{ fontWeight: 600 }}>No historical orders found matching your criteria.</p>
                    </div>
                  );
                }

                // Group by day
                const groups = filtered.reduce((acc, order) => {
                  const date = new Date(order.createdAt);
                  const today = new Date();
                  const yesterday = new Date();
                  yesterday.setDate(today.getDate() - 1);

                  let dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
                  if (date.toDateString() === today.toDateString()) dateStr = 'Today';
                  else if (date.toDateString() === yesterday.toDateString()) dateStr = 'Yesterday';

                  if (!acc[dateStr]) acc[dateStr] = [];
                  acc[dateStr].push(order);
                  return acc;
                }, {});

                return Object.entries(groups).map(([date, orders]) => (
                  <div key={date} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <h4 style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#6C757D', whiteSpace: 'nowrap' }}>
                        {date}
                      </h4>
                      <div style={{ height: '1px', flex: 1, background: '#E6E8EA' }} />
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#6C757D', background: '#F8F9FA', padding: '2px 8px', borderRadius: '9999px' }}>
                        {orders.length} Orders
                      </span>
                    </div>
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', 
                      gap: '24px' 
                    }}>
                      {orders.map(order => (
                        <OrderCard 
                          key={order.ticketId || order.id}
                          order={order} 
                          isHistory={true} 
                          setConfirmModal={setConfirmModal}
                        />
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}
      </main>

      {/* ━━━ MOBILE BOTTOM NAV ━━━ */}
      <nav className="mobile-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#FFFFFF',
        borderTop: '1px solid #E6E8EA',
        padding: '8px 16px',
        zIndex: 55,
        display: 'flex',
        justifyContent: 'space-around', alignItems: 'center',
      }}>
        {columns.map(({ status, title, emptyIcon }) => {
          const active = mobileCol === status[0];
          const icons  = { pending: 'pause_circle', accepted: 'local_fire_department', preparing: 'local_fire_department', ready: 'check_circle' };
          return (
            <div key={status[0]} onClick={() => setMobileCol(status[0])} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '8px 20px',
              background: active ? '#FEE2E2' : 'transparent',
              color: active ? '#E31E24' : '#6C757D',
              borderRadius: '10px', cursor: 'pointer',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>{icons[status[0]]}</span>
              <span style={{ fontSize: '9px', fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: '2px' }}>
                {status[0].charAt(0).toUpperCase() + status[0].slice(1)}
              </span>
            </div>
          );
        })}
      </nav>
      
      {/* ━━━ CUSTOM CONFIRM MODAL ━━━ */}
      {confirmModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            background: '#FFFFFF', borderRadius: '12px', width: '90%', maxWidth: '400px',
            padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
            textAlign: 'center',
          }}>
            <div style={{
              width: '48px', height: '48px', background: '#FEF2F2', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
            }}>
              <span className="material-symbols-outlined" style={{ color: '#DC2626', fontSize: '24px' }}>warning</span>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '8px', color: '#111827' }}>
              {confirmModal.title}
            </h3>
            <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '24px', lineHeight: 1.5 }}>
              {confirmModal.message}
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setConfirmModal(null)}
                style={{
                  flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #E5E7EB',
                  background: '#FFFFFF', color: '#374151', fontWeight: 600, fontSize: '14px', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
                style={{
                  flex: 1, padding: '12px', borderRadius: '8px', border: 'none',
                  background: '#DC2626', color: '#FFFFFF', fontWeight: 600, fontSize: '14px', cursor: 'pointer',
                }}
              >
                Yes, Cancel Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KDSBoard;
