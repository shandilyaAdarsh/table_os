import { useState, useEffect, useMemo } from 'react';
import { useOrderStore } from '../../../store/index.js';
import OrderCard from '../components/OrderCard.jsx';
import { Bell, BellOff, Settings, Activity, Sun, Moon, X, Wifi, Printer, Radio, History } from 'lucide-react';

const KDSBoard = () => {
  const orders = useOrderStore(state => state.orders);
  const isLoading = useOrderStore(state => state.isLoading);
  const fetchOrders = useOrderStore(state => state.fetchOrders);
  const subscribeRealtime = useOrderStore(state => state.subscribeRealtime);

  useEffect(() => {
    console.log('[KDSBoard] Mounted. isLoading:', isLoading);
  }, []);

  // States
  const [mobileCol, setMobileCol] = useState('pending');
  const [currentTime, setCurrentTime] = useState('');
  const [isDark, setIsDark] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [orderHistory, setOrderHistory] = useState([]);
  
  const removeOrder = useOrderStore(state => state.removeOrder);

  const handleClear = (order) => {
    setOrderHistory(prev => [{
      ...order,
      clearedAt: new Date().toLocaleTimeString('en-GB'),
      clearedDate: new Date().toLocaleDateString('en-GB'),
    }, ...prev]);
    removeOrder(order.id);
  };

  // Theme Object
  const theme = {
    bg:         isDark ? '#0C0C0C' : '#F5F5F5',
    surface:    isDark ? '#1E1E1E' : '#FFFFFF',
    surface2:   isDark ? '#161616' : '#EEEEEE',
    border:     isDark ? '#2A2A2A' : '#E0E0E0',
    text:       isDark ? '#FFFFFF' : '#111111',
    textMuted:  isDark ? '#6B7280' : '#9CA3AF',
    headerBg:   isDark ? '#111111' : '#FFFFFF',
    divider:    isDark ? '#2A2A2A' : '#E5E7EB',
    colHeader:  isDark ? '#0D0D0D' : '#F0F0F0',
  };

  // Supabase: initial fetch + Realtime subscription
  useEffect(() => {
    console.log('[KDSBoard] Component mounted. FETCHING...');
    if (!fetchOrders) return console.error('fetchOrders MISSING');
    fetchOrders();
    const unsubscribe = subscribeRealtime ? subscribeRealtime() : null;
    return () => unsubscribe && unsubscribe();
  }, [fetchOrders, subscribeRealtime]);



  // Live Clock logic
  useEffect(() => {
    const tick = () => setCurrentTime(new Date().toLocaleTimeString('en-GB'));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // Audio Notification Utility
  const playOrderSound = () => {
    if (isMuted) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.1); // A4
      
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
      console.warn('Audio alert failed', e);
    }
  };

  // Sound Alert Effect
  useEffect(() => {
    const hasNew = orders.some(o => o.isNew);
    if (hasNew) {
      playOrderSound();
    }
  }, [orders.map(o => o.id).join(','), orders.some(o => o.isNew)]);

  // Clean up "new order" flag after 3 seconds
  useEffect(() => {
    orders.forEach(order => {
      if (order.isNew) {
        setTimeout(() => {
          useOrderStore.getState().setOrderNew(order.id);
        }, 3000);
      }
    });
  }, [orders]);

  // Stats Logic - No stations filter anymore, use all orders
  const incomingCount = orders.filter(o => o.status === 'pending').length;
  const cookingCount = orders.filter(o => o.status === 'cooking').length;
  const readyCount = orders.filter(o => o.status === 'ready').length;
  const servedCount = orderHistory.length;

  const renderColumn = (status, title, count) => (
    <div 
      key={status}
      className={mobileCol !== status ? 'hidden md:flex' : 'flex'}
      style={{ 
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        borderRight: `1px solid ${theme.border}`
      }}
    >
      <div 
        className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between shrink-0"
        style={{ background: theme.colHeader, borderBottom: `1px solid ${theme.border}` }}
      >
        <span className="text-xs font-mono font-bold tracking-widest uppercase" style={{ color: theme.textMuted }}>
          {title}
        </span>
        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full" style={{ background: theme.border, color: theme.text }}>
          {count}
        </span>
      </div>

      <div 
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {orders.filter(o => o.status === status).map(order => (
          <OrderCard key={order.id} {...order} isDark={isDark} theme={theme} onClear={handleClear} />
        ))}
        {orders.filter(o => o.status === status).length === 0 && (
          <div style={{ flex: 1, display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'center', border: `2px dashed ${theme.border}`, borderRadius: '16px', opacity: 0.2 }}>
            <span className="uppercase tracking-widest text-xs font-bold font-mono" style={{ color: theme.textMuted }}>
              No {title}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="font-body h-screen w-screen flex items-center justify-center flex-col gap-4 select-none transition-colors duration-300"
           style={{ background: '#111111', color: '#FFFFFF' }}>
        <Activity size={40} className="animate-spin text-amber-500" />
        <div className="flex flex-col items-center gap-1">
          <span className="font-mono text-sm tracking-[0.3em] text-amber-500 uppercase font-black">Syncing Network...</span>
          <span className="font-mono text-[10px] text-zinc-500 uppercase">Station Alpha-1 // TableOS</span>
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="mt-8 px-4 py-2 border border-zinc-800 rounded-lg text-zinc-500 text-[10px] font-mono hover:bg-zinc-900 transition-colors cursor-pointer"
        >
          FORCE REFRESH
        </button>
      </div>
    );
  }

  return (
    <div className="font-body h-screen w-screen flex flex-col overflow-hidden select-none transition-colors duration-300"
         style={{ background: theme.bg, color: theme.text }}>
      
      {/* ━━━ HEADER — FULL REDESIGN ━━━ */}
      <header 
        style={{ background: theme.headerBg, borderBottom: `1px solid ${theme.border}` }}
        className="px-6 py-4 flex items-center justify-between sticky top-0 z-20 shrink-0"
      >
        {/* LEFT */}
        <div className="flex items-center gap-3">
          <Radio size={20} color="#D97706" />
          <div className="flex flex-col">
            <span className="font-mono font-black text-xl text-[#D97706]">TABLEOS</span>
            <span style={{ color: theme.textMuted }} className="text-[10px] font-mono tracking-widest block">
              STATION ALPHA-1
            </span>
          </div>
        </div>

        {/* CENTER */}
        <div className="hidden md:block absolute left-1/2 -translate-x-1/2 pointer-events-none text-center">
          <span style={{ color: theme.text }} className="font-mono font-black text-4xl tracking-wider">
            {currentTime}
          </span>
        </div>

        {/* RIGHT */}
        <div className="flex items-center gap-2">
          {/* Default view wifi/pulse */}
          <div className="hidden md:flex items-center gap-2 mr-4">
            <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse"></div>
            <span className="text-sm font-mono text-green-400">LIVE</span>
          </div>

          <button onClick={() => setIsDark(!isDark)}
            style={{ background: theme.surface2, border: `1px solid ${theme.border}` }}
            className="p-2 rounded-xl transition-all cursor-pointer hover:opacity-80">
            {isDark ? <Sun size={16} color="#D97706" /> : <Moon size={16} color="#6B7280" />}
          </button>

          <button onClick={() => setIsMuted(!isMuted)} 
            style={{ background: theme.surface2, border: `1px solid ${theme.border}` }}
            className="p-2 rounded-xl transition-all cursor-pointer hover:opacity-80">
            {isMuted ? <BellOff size={16} style={{ color: theme.textMuted }} /> : <Bell size={16} style={{ color: theme.textMuted }} />}
          </button>

          {/* Activity Button */}
          <button onClick={() => { setShowActivity(!showActivity); setShowSettings(false); setShowHistory(false); }}
            className="relative p-2 rounded-xl transition-all cursor-pointer hover:opacity-80"
            style={{ background: theme.surface2, border: `1px solid ${theme.border}` }}>
            <Activity size={16} style={{ color: theme.textMuted }} />
            {orders.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-amber-500 text-black text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center font-mono animate-pulse">
                {orders.length}
              </span>
            )}
          </button>

          {/* History Button (before Settings) */}
          <button
            onClick={() => { setShowHistory(!showHistory); setShowActivity(false); setShowSettings(false); }}
            className="relative p-2 rounded-xl transition-all cursor-pointer hover:opacity-80"
            style={{ background: theme.surface2, border: `1px solid ${theme.border}` }}
          >
            <History size={16} style={{ color: theme.textMuted }} />
            {orderHistory.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-blue-500 text-white
                                text-[9px] font-black rounded-full w-4 h-4
                                flex items-center justify-center font-mono">
                {orderHistory.length > 99 ? '99+' : orderHistory.length}
              </span>
            )}
          </button>

          {/* Settings Button */}
          <button onClick={() => { setShowSettings(!showSettings); setShowActivity(false); setShowHistory(false); }}
            style={{ background: theme.surface2, border: `1px solid ${theme.border}` }}
            className="p-2 rounded-xl transition-all cursor-pointer hover:opacity-80">
            <Settings size={16} style={{ color: theme.textMuted }} />
          </button>
        </div>

        {/* HISTORY PANEL */}
        {showHistory && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowHistory(false)}
          >
            <div
              className="w-full max-w-2xl mx-4 rounded-2xl shadow-2xl 
                         flex flex-col max-h-[80vh]"
              style={{ background: theme.surface, border: `1px solid ${theme.border}` }}
              onClick={e => e.stopPropagation()}
            >
              {/* Panel Header */}
              <div className="flex items-center justify-between p-5"
                style={{ borderBottom: `1px solid ${theme.border}` }}>
                <div className="flex items-center gap-3">
                  <History size={18} color="#D97706" />
                  <span className="font-mono font-black text-lg"
                    style={{ color: theme.text }}>
                    Order History
                  </span>
                  <span className="bg-blue-500 text-white text-xs font-mono 
                                   font-bold px-2 py-0.5 rounded-full">
                    {orderHistory.length} orders
                  </span>
                </div>
                <button onClick={() => setShowHistory(false)}>
                  <X size={18} style={{ color: theme.textMuted }} />
                </button>
              </div>

              {/* Panel Body */}
              <div className="overflow-y-auto flex-1 p-4">
                {orderHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <History size={32} style={{ color: theme.textMuted }} />
                    <p className="font-mono text-sm" style={{ color: theme.textMuted }}>
                      No completed orders yet
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {orderHistory.map((order, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl p-4 flex flex-col gap-2"
                        style={{
                          background: theme.surface2,
                          border: `1px solid ${theme.border}`,
                          borderLeft: '4px solid #4ADE80',
                        }}
                      >
                        {/* Order top row */}
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-black text-base"
                              style={{ color: theme.text }}>
                              {order.id}
                            </span>
                            <span className="text-xs font-mono font-bold 
                                             bg-green-900 text-green-400 
                                             px-2 py-0.5 rounded-full">
                              SERVED
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono"
                              style={{ color: theme.textMuted }}>
                              TABLE {order.tableNum}
                            </span>
                            <span className="text-xs font-mono"
                              style={{ color: theme.textMuted }}>
                              {order.clearedAt}
                            </span>
                          </div>
                        </div>

                        {/* Items */}
                        <div className="flex flex-col gap-1">
                          {order.items.map((item, i) => (
                            <div key={i} className="flex gap-2 text-sm">
                              <span style={{ color: theme.textMuted }}
                                    className="font-mono w-6">
                                {item.qty}x
                              </span>
                              <span style={{ color: theme.text }}>
                                {item.name}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 
                                               rounded bg-[#2A2A2A] text-gray-400 
                                               self-center">
                                {item.station}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Note if exists */}
                        {order.note && (
                          <p className="text-xs text-amber-500 italic">
                            📝 {order.note}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Panel Footer */}
              {orderHistory.length > 0 && (
                <div className="p-4 flex justify-between items-center"
                  style={{ borderTop: `1px solid ${theme.border}` }}>
                  <span className="text-xs font-mono" style={{ color: theme.textMuted }}>
                    {orderHistory.length} orders completed today
                  </span>
                  <button
                    onClick={() => setOrderHistory([])}
                    className="text-xs font-mono font-bold px-4 py-2 rounded-xl
                               bg-red-900 text-red-400 hover:bg-red-800 transition-colors cursor-pointer">
                    CLEAR HISTORY
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ACTIVITY PANEL */}
        {showActivity && (
          <div className="absolute top-16 right-4 w-72 rounded-2xl shadow-2xl p-4 transition-all z-50"
            style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
            <div className="flex justify-between items-center mb-3">
              <span className="font-mono font-bold text-sm" style={{ color: theme.text }}>Live Activity</span>
              <button className="cursor-pointer" onClick={() => setShowActivity(false)}>
                <X size={14} style={{ color: theme.textMuted }} />
              </button>
            </div>
            {orders.length === 0 && (
              <p className="text-xs font-mono py-2 text-center" style={{ color: theme.textMuted }}>No active orders</p>
            )}
            {orders.slice(0,5).map(o => (
              <div key={o.id} className="flex justify-between items-center py-2"
                style={{ borderBottom: `1px solid ${theme.border}` }}>
                <span className="font-mono text-xs font-bold text-[#D97706]">
                  {String(o.id).startsWith('#') ? o.id : `#${o.id}`}
                </span>
                <span className="text-xs font-mono" style={{ color: theme.textMuted }}>
                  TBL {o.tableNum}
                </span>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full
                  ${o.status === 'pending' ? 'bg-amber-900 text-amber-400' :
                    o.status === 'cooking' ? 'bg-orange-900 text-orange-400' :
                    'bg-green-900 text-green-400'}`}>
                  {o.status.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* SETTINGS PANEL */}
        {showSettings && (
          <div className="absolute top-16 right-4 w-72 rounded-2xl shadow-2xl p-4 transition-all z-50"
            style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
            
            <div className="flex justify-between items-center mb-4">
              <span className="font-mono font-bold text-sm" style={{ color: theme.text }}>Settings</span>
              <button className="cursor-pointer" onClick={() => setShowSettings(false)}>
                <X size={14} style={{ color: theme.textMuted }} />
              </button>
            </div>

            {/* Sound */}
            <div className="flex justify-between items-center py-3" style={{ borderBottom: `1px solid ${theme.border}` }}>
              <span className="text-xs font-mono" style={{ color: theme.textMuted }}>Sound Alerts</span>
              <button onClick={() => setIsMuted(!isMuted)}
                className={`text-[10px] font-bold px-3 py-1 rounded-full font-mono cursor-pointer transition-colors ${isMuted ? 'bg-red-900 text-red-400' : 'bg-green-900 text-green-400'}`}>
                {isMuted ? 'MUTED' : 'ON'}
              </button>
            </div>

            {/* Theme */}
            <div className="flex justify-between items-center py-3" style={{ borderBottom: `1px solid ${theme.border}` }}>
              <span className="text-xs font-mono" style={{ color: theme.textMuted }}>Theme</span>
              <button onClick={() => setIsDark(!isDark)}
                className="text-[10px] font-bold px-3 py-1 rounded-full font-mono bg-[#2A2A2A] text-gray-400 cursor-pointer transition-colors hover:text-white">
                {isDark ? 'DARK' : 'LIGHT'}
              </button>
            </div>

            {/* WiFi */}
            <div className="flex justify-between items-center py-3" style={{ borderBottom: `1px solid ${theme.border}` }}>
              <div className="flex items-center gap-2">
                <Wifi size={14} className="text-green-400" />
                <span className="text-xs font-mono" style={{ color: theme.textMuted }}>WiFi Signal</span>
              </div>
              <div className="flex items-end gap-0.5 h-4">
                {[2,3,4,5,6].map((h,i) => (
                  <div key={i} className="w-1 bg-green-400 rounded-sm" style={{ height: `${h * 2.5}px`, opacity: i > 3 ? 0.3 : 1 }} />
                ))}
              </div>
            </div>

            {/* Printer */}
            <div className="flex justify-between items-center py-3">
              <div className="flex items-center gap-2">
                <Printer size={14} className="text-green-400" />
                <span className="text-xs font-mono" style={{ color: theme.textMuted }}>Printer</span>
              </div>
              <span className="text-[10px] font-mono font-bold text-green-400 bg-green-900 px-2 py-0.5 rounded-full">
                ONLINE
              </span>
            </div>

            <p className="text-[10px] font-mono text-center mt-3" style={{ color: theme.textMuted }}>
              STATION ALPHA-1 · TableOS KDS v1.0
            </p>
          </div>
        )}
      </header>

      {/* ━━━ STATS BAR ━━━ */}
      <section 
        style={{ background: theme.surface2, borderBottom: `1px solid ${theme.border}` }}
        className="grid grid-cols-4 divide-x shrink-0"
      >
        <div className="flex flex-col items-center justify-center py-3 md:py-4" style={{ borderColor: theme.border }}>
          <span className="text-2xl md:text-4xl font-black font-mono text-[#F5A623]">{incomingCount}</span>
          <span className="text-[9px] md:text-[10px] font-mono tracking-widest uppercase mt-1" style={{ color: theme.textMuted }}>INCOMING</span>
        </div>
        <div className="flex flex-col items-center justify-center py-3 md:py-4" style={{ borderColor: theme.border }}>
          <span className="text-2xl md:text-4xl font-black font-mono text-[#FF8C42]">{cookingCount}</span>
          <span className="text-[9px] md:text-[10px] font-mono tracking-widest uppercase mt-1" style={{ color: theme.textMuted }}>COOKING</span>
        </div>
        <div className="flex flex-col items-center justify-center py-3 md:py-4" style={{ borderColor: theme.border }}>
          <span className="text-2xl md:text-4xl font-black font-mono text-green-400">{readyCount}</span>
          <span className="text-[9px] md:text-[10px] font-mono tracking-widest uppercase mt-1" style={{ color: theme.textMuted }}>READY</span>
        </div>
        <div className="flex flex-col items-center justify-center py-3 md:py-4" style={{ borderColor: theme.border }}>
          <span className="text-2xl md:text-4xl font-black font-mono text-gray-500">{servedCount}</span>
          <span className="text-[9px] md:text-[10px] font-mono tracking-widest uppercase mt-1" style={{ color: theme.textMuted }}>SERVED</span>
        </div>
      </section>

      {/* ━━━ KANBAN BOARD ━━━ */}
      <main className="flex-1 flex flex-col min-h-0 w-full overflow-hidden">
        
        {/* Mobile Column Selector Tabs */}
        <div className="flex border-b md:hidden shrink-0" style={{ borderColor: theme.border, background: theme.surface2 }}>
          {[
            { id: 'pending', label: 'INCOMING' },
            { id: 'cooking', label: 'COOKING' },
            { id: 'ready', label: 'READY' }
          ].map(col => (
            <button
              key={col.id}
              onClick={() => setMobileCol(col.id)}
              className={`flex-1 py-3 text-xs font-mono font-bold text-center transition-colors cursor-pointer ${
                mobileCol === col.id ? 'border-b-2 border-amber-500 text-amber-500' : ''
              }`}
              style={{ color: mobileCol !== col.id ? theme.textMuted : undefined }}
            >
              {col.label}
            </button>
          ))}
        </div>

        {/* Board Container */}
        <div 
          className="flex-1 overflow-hidden"
          style={{ display: 'flex', flexDirection: 'row' }}
        >
          {renderColumn('pending', 'INCOMING', incomingCount)}
          {renderColumn('cooking', 'COOKING', cookingCount)}
          {renderColumn('ready', 'READY', readyCount)}
        </div>
      </main>

      {/* Floating WiFi + Printer Status */}
      <div
        className="hidden md:flex"
        style={{
          position: 'fixed',
          bottom: '16px',
          right: '16px',
          zIndex: 50,
          background: isDark ? '#1E1E1E' : '#FFFFFF',
          border: `1px solid ${theme.border}`,
          borderRadius: '16px',
          padding: '10px 14px',
          alignItems: 'center',
          gap: '16px',
          boxShadow: isDark
            ? '0 4px 20px rgba(0,0,0,0.5)'
            : '0 4px 20px rgba(0,0,0,0.12)',
        }}
      >
        {/* WiFi */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Wifi size={14} color="#4ADE80" />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '14px' }}>
            {[3, 5, 8, 11, 14].map((h, i) => (
              <div
                key={i}
                style={{
                  width: '3px',
                  height: `${h}px`,
                  background: '#4ADE80',
                  borderRadius: '2px',
                }}
              />
            ))}
          </div>
          <span
            style={{
              fontSize: '9px',
              fontFamily: 'monospace',
              fontWeight: 'bold',
              color: theme.textMuted,
              letterSpacing: '0.1em',
            }}
          >
            WIFI
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', background: theme.border }} />

        {/* Printer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Printer size={14} color="#4ADE80" />
          <span
            style={{
              fontSize: '9px',
              fontFamily: 'monospace',
              fontWeight: 'bold',
              color: '#4ADE80',
              letterSpacing: '0.1em',
            }}
          >
            ONLINE
          </span>
        </div>
      </div>

    </div>
  );
};

export default KDSBoard;
