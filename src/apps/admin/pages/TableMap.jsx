import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase.js';
import { useAuthStore } from '../../../store/authStore.js';

// const TENANT_ID = '...'; // Removed hardcoded ID

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
};

const formatElapsed = (createdAt) => {
  const diffInMs = new Date() - new Date(createdAt);
  const totalSeconds = Math.max(0, Math.floor(diffInMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export default function TableMap() {
  const { tenantId: TENANT_ID } = useAuthStore();
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [activeFloor, setActiveFloor] = useState(1);
  const [, setTick] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      const { data: tablesData } = await supabase
        .from('restaurant_tables')
        .select('*')
        .eq('tenant_id', TENANT_ID)
        .order('table_num', { ascending: true });
        
      if (tablesData) setTables(tablesData);

      const { data: ordersData } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('tenant_id', TENANT_ID)
        .not('status', 'in', '("served","cancelled")');
        
      if (ordersData) setOrders(ordersData);
    };

    fetchData();

    const tableSub = supabase
      .channel('tables_realtime')
      .on('postgres_changes', { 
        event: '*', schema: 'public', table: 'restaurant_tables', filter: `tenant_id=eq.${TENANT_ID}` 
      }, () => {
        supabase
          .from('restaurant_tables')
          .select('*')
          .eq('tenant_id', TENANT_ID)
          .order('table_num', { ascending: true })
          .then(({ data }) => setTables(data || []));
      })
      .subscribe();

    const orderSub = supabase
      .channel('orders_realtime')
      .on('postgres_changes', { 
        event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${TENANT_ID}` 
      }, () => {
        supabase
          .from('orders')
          .select('*, order_items(*)')
          .eq('tenant_id', TENANT_ID)
          .not('status', 'in', '("served","cancelled")')
          .then(({ data }) => setOrders(data || []));
      })
      .subscribe();

    const interval = setInterval(() => setTick(t => t + 1), 1000);

    return () => {
      supabase.removeChannel(tableSub);
      supabase.removeChannel(orderSub);
      clearInterval(interval);
    };
  }, []);

  const floors = [...new Set(tables.map(t => t.floor || 1))].sort();
  if (floors.length > 0 && !floors.includes(activeFloor)) {
      setActiveFloor(floors[0]);
  }

  const activeTables = tables.filter(t => (t.floor || 1) === activeFloor);

  const getStatusColor = (status) => {
    switch (status) {
      case 'vacant': return 'bg-[#10b981]'; // status-vacant
      case 'occupied': return 'bg-[#d69e2e]'; // status-occupied
      case 'needs_bussing': return 'bg-[#ef4444]'; // status-bussing
      case 'payment_pending': return 'bg-[#0961a2]'; // reusing tertiary
      default: return 'bg-surface-variant';
    }
  };

  const getTextColor = (status) => {
    switch (status) {
      case 'vacant': return 'text-[#10b981]';
      case 'occupied': return 'text-[#d69e2e]';
      case 'needs_bussing': return 'text-[#ef4444]';
      case 'payment_pending': return 'text-[#0961a2]';
      default: return 'text-on-surface-variant';
    }
  };

  const stats = {
    vacant: tables.filter(t => t.status === 'vacant').length,
    occupied: tables.filter(t => t.status === 'occupied').length,
    bussing: tables.filter(t => t.status === 'needs_bussing').length,
  };

  const selectedOrder = selectedTable 
    ? orders.find(o => o.table_id === selectedTable.id) 
    : null;

  return (
    <div className="flex flex-col min-h-screen text-on-surface font-body pb-[calc(84px+env(safe-area-inset-bottom))]">
      <main className="max-w-[390px] md:max-w-7xl mx-auto w-full px-6 pt-6 space-y-8">
        
        {/* Floor Filter (Pill Style) */}
        <section className="flex gap-2 overflow-x-auto no-scrollbar">
          {floors.map(floor => (
            <button
              key={floor}
              onClick={() => setActiveFloor(floor)}
              className={`px-6 py-2 rounded-full font-semibold text-sm transition-all active:scale-95 ${activeFloor === floor ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-highest text-on-surface-variant font-medium hover:bg-surface-container-high'}`}
            >
              Floor {floor}
            </button>
          ))}
          {floors.length === 0 && (
             <span className="text-sm text-on-surface-variant">No Tables Configured</span>
          )}
        </section>

        {/* Stats Overview */}
        <section className="grid grid-cols-2 gap-3 max-w-sm">
          <div className="bg-surface-container-lowest p-4 rounded-xl flex flex-col justify-between h-28 shadow-[0_4px_12px_rgba(20,27,43,0.04)]">
             <span className="font-label text-[0.75rem] font-medium tracking-wide uppercase text-on-surface-variant">Available</span>
             <span className={`text-3xl font-bold tracking-tight tabular-nums ${getTextColor('vacant')}`}>{stats.vacant.toString().padStart(2, '0')}</span>
          </div>
          <div className="space-y-3">
             <div className="bg-surface-container-lowest p-3 rounded-xl flex justify-between items-center shadow-[0_4px_12px_rgba(20,27,43,0.04)]">
                <span className="font-label text-[0.7rem] font-medium uppercase text-on-surface-variant">Occupied</span>
                <span className={`font-bold tabular-nums ${getTextColor('occupied')}`}>{stats.occupied.toString().padStart(2, '0')}</span>
             </div>
             <div className="bg-surface-container-lowest p-3 rounded-xl flex justify-between items-center shadow-[0_4px_12px_rgba(20,27,43,0.04)]">
                <span className="font-label text-[0.7rem] font-medium uppercase text-on-surface-variant">Bussing</span>
                <span className={`font-bold tabular-nums ${getTextColor('needs_bussing')}`}>{stats.bussing.toString().padStart(2, '0')}</span>
             </div>
          </div>
        </section>

        {/* Table Grid */}
        <section className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4 pb-8">
           {activeTables.map(table => (
              <div 
                key={table.id}
                onClick={() => table.status === 'occupied' ? setSelectedTable(table) : null}
                className={`bg-surface-container-lowest aspect-square rounded-xl flex flex-col items-center justify-center relative shadow-[0_4px_12px_rgba(20,27,43,0.04)] duration-150 ${table.status === 'occupied' ? 'cursor-pointer active:scale-95' : 'opacity-90'}`}
              >
                  <span className="text-xl font-black text-on-surface">{table.table_num || '??'}</span>
                  <span className="font-label text-[0.65rem] font-medium text-on-surface-variant uppercase tracking-widest mt-1">
                     {table.capacity} Cap
                  </span>
                  <div className={`absolute bottom-0 left-0 right-0 h-1 rounded-b-xl ${getStatusColor(table.status)}`}></div>
              </div>
           ))}
        </section>

      </main>

      {/* Side Drawer Overlay for Occupied Tables */}
      {selectedTable && (
        <>
          <div 
            className="fixed inset-0 bg-on-surface/40 backdrop-blur-sm z-40 rounded-xl transition-opacity"
            onClick={() => setSelectedTable(null)}
          />
          
          <div className="fixed md:absolute bottom-0 left-0 right-0 md:top-0 md:bottom-0 md:left-auto md:right-0 w-full md:w-[420px] h-[80%] md:h-auto bg-surface-container-lowest border-t md:border-t-0 md:border-l border-surface-container-low rounded-t-3xl md:rounded-none shadow-[-10px_0_40px_rgba(20,27,43,0.08)] z-50 flex flex-col transform transition-transform duration-300 pb-[env(safe-area-inset-bottom)]">
            <div className="md:hidden w-full flex justify-center pt-4 pb-2" onClick={() => setSelectedTable(null)}>
              <div className="w-12 h-1.5 bg-surface-container-high rounded-full" />
            </div>

            <div className="px-6 py-4 md:py-6 border-b border-surface-container-low flex justify-between items-center bg-surface-bright md:rounded-none rounded-t-none">
              <div>
                <h2 className="text-2xl font-black font-mono text-primary">
                  Table {selectedTable.table_num || '??'}
                </h2>
                <span className="text-xs text-on-surface-variant uppercase tracking-widest font-bold">Occupied Details</span>
              </div>
              <button 
                onClick={() => setSelectedTable(null)}
                className="p-2 rounded-full bg-surface-container-highest text-on-surface-variant active:scale-95 transition-transform"
              >
                <span className="material-symbols-outlined text-[1.25rem]">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 md:p-8">
              {!selectedOrder ? (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-50">
                  <span className="material-symbols-outlined text-[3rem] text-on-surface-variant">receipt_long</span>
                  <p className="text-sm font-mono text-on-surface-variant">
                    Table marked as occupied,<br/>but no active orders were found.
                  </p>
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Status & Elapsed */}
                  <div className="flex justify-between items-center bg-surface-container-low p-5 rounded-2xl shadow-[0_4px_12px_rgba(20,27,43,0.02)]">
                    <div>
                      <span className="text-[0.65rem] text-on-surface-variant uppercase tracking-widest font-bold block mb-1">Status</span>
                      <span className="px-3 py-1 bg-primary-container text-on-primary-container rounded-full text-xs font-bold uppercase tracking-widest">
                        {selectedOrder.status}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[0.65rem] text-on-surface-variant uppercase tracking-widest font-bold block mb-1">Elapsed</span>
                      <div className="flex items-center justify-end gap-1.5 text-on-surface font-mono font-bold tabular-nums">
                        <span className="material-symbols-outlined text-[1rem] text-on-surface-variant">schedule</span>
                        {formatElapsed(selectedOrder.created_at)}
                      </div>
                    </div>
                  </div>

                  {/* Items List */}
                  <div>
                    <h3 className="text-xs text-on-surface-variant uppercase tracking-widest font-bold mb-4 border-b border-surface-container-high pb-2">
                      Order Items
                    </h3>
                    <ul className="space-y-3">
                      {(selectedOrder.order_items || []).map(item => (
                        <li key={item.id} className="flex justify-between items-start text-sm">
                          <div className="flex gap-3">
                            <span className="font-mono font-bold text-primary tabular-nums">{item.qty}x</span>
                            <span className="text-on-surface font-medium">{item.name}</span>
                          </div>
                        </li>
                      ))}
                      {(!selectedOrder.order_items || selectedOrder.order_items.length === 0) && (
                        <li className="text-sm text-on-surface-variant italic">No items attached.</li>
                      )}
                    </ul>
                  </div>

                  {/* Total */}
                  <div className="pt-6 border-t border-surface-container-high flex justify-between items-end mt-auto">
                    <span className="text-sm text-on-surface-variant uppercase tracking-widest font-bold">Total Amount</span>
                    <span className="text-3xl font-mono font-black text-on-surface tabular-nums">
                      {formatCurrency(selectedOrder.total_amount || 0)}
                    </span>
                  </div>

                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
