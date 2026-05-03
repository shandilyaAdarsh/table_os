import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase.js';
import { useAuthStore } from '../../../store/authStore.js';
import KPIRow from '../components/KPIRow.jsx';
import { Link } from 'react-router-dom';

// const TENANT_ID = '...'; // Removed hardcoded ID


const formatElapsed = (createdAt) => {
  const diffInMs = new Date() - new Date(createdAt);
  const totalSeconds = Math.max(0, Math.floor(diffInMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} elapsed`;
};

const formatTotal = (createdAt) => {
  const diffInMs = new Date() - new Date(createdAt);
  const totalSeconds = Math.max(0, Math.floor(diffInMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}m total`;
};

export default function Dashboard() {
  const { tenantId: TENANT_ID } = useAuthStore();
  const [liveOrders, setLiveOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [, setTick] = useState(0);

  useEffect(() => {
    fetchLiveOrders();

    const subscription = supabase
      .channel('dashboard-orders')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'orders',
        filter: `tenant_id=eq.${TENANT_ID}`
      }, () => {
        fetchLiveOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const fetchLiveOrders = async () => {
    setLoadingOrders(true);
    const { data: ordersData } = await supabase
      .from('orders')
      .select(`*, order_items(name, qty, price)`)
      .eq('tenant_id', TENANT_ID)
      .neq('status', 'served')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (ordersData) {
      setLiveOrders(ordersData);
    }
    setLoadingOrders(false);
  };

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const calculateTotal = (items) => {
    if (!items) return 0;
    return items.reduce((sum, item) => sum + (item.price * item.qty), 0);
  };

  const getStatusDisplay = (status) => {
    switch(status) {
      case 'pending': return { label: 'New Order', bg: 'bg-blue-100', text: 'text-blue-700', icon: 'schedule' };
      case 'cooking': return { label: 'Preparing', bg: 'bg-amber-100', text: 'text-amber-700', icon: 'schedule' };
      case 'ready':   return { label: 'Ready', bg: 'bg-emerald-100', text: 'text-emerald-700', icon: 'done_all' };
      default:        return { label: status, bg: 'bg-surface-container-low', text: 'text-on-surface-variant', icon: 'schedule' };
    }
  };

  return (
    <div className="h-full relative font-body text-on-surface pb-32">
      <style>{`
        .active-dot {
            box-shadow: 0 0 0 0 rgba(214, 158, 46, 0.7);
            animation: pulse-dot 2s infinite;
        }
        @keyframes pulse-dot {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(214, 158, 46, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(214, 158, 46, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(214, 158, 46, 0); }
        }
      `}</style>
      
      <main className="max-w-[390px] md:max-w-7xl mx-auto">
        {/* Welcome Section */}
        <section className="mb-8">
          <h2 className="text-2xl font-black text-on-surface tracking-tight">Good morning, Admin 👋</h2>
          <p className="text-sm font-medium text-on-surface-variant/70 uppercase tracking-widest mt-1">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </section>

        {/* KPI Grid */}
        <KPIRow tenantId={TENANT_ID} />

        {/* Live Orders Section */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-amber-500 rounded-full active-dot"></div>
              <h3 className="font-headline font-bold text-lg text-on-surface">Live Orders</h3>
            </div>
            <Link to="/admin/orders" className="text-primary text-sm font-semibold">View All</Link>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {loadingOrders ? (
              <div className="flex justify-center py-10 w-full col-span-full">
                <div className="w-8 h-8 rounded-full border-2 border-primary-container border-t-transparent animate-spin" />
              </div>
            ) : liveOrders.length === 0 ? (
              <div className="col-span-full text-center py-10 text-on-surface-variant">
                No active orders at the moment.
              </div>
            ) : (
              liveOrders.map(order => {
                const total = calculateTotal(order.order_items);
                const itemsStr = order.order_items?.map(i => `${i.name}${i.qty > 1 ? ` (${i.qty})` : ''}`).join(', ') || 'No Items';
                const { label, bg, text, icon } = getStatusDisplay(order.status);
                
                return (
                  <div key={order.id} className="bg-surface-container-lowest p-4 rounded-xl shadow-[0_4px_20px_-4px_rgba(20,27,43,0.04)] flex flex-col gap-3 transition-opacity">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-base">Table {String(order.table_num).padStart(2, '0')}</p>
                        <p className="text-[0.75rem] text-on-surface-variant/70 tabular-nums">Order #{order.id}</p>
                      </div>
                      <span className={`px-3 py-1 ${bg} ${text} text-[0.7rem] font-bold rounded-full uppercase tracking-tighter`}>
                        {label}
                      </span>
                    </div>
                    <div className="text-[0.875rem] text-on-secondary-fixed-variant leading-relaxed line-clamp-2 min-h-11">
                      {itemsStr}
                    </div>
                    <div className="pt-3 flex items-center justify-between border-t border-surface-container-low">
                      <div className="flex items-center gap-1.5 text-on-surface-variant/60">
                        <span className="material-symbols-outlined text-[1rem]">{icon}</span>
                        <span className="text-[0.75rem] font-medium tabular-nums text-on-surface-variant font-mono">
                          {order.status === 'ready' ? formatTotal(order.created_at) : formatElapsed(order.created_at)}
                        </span>
                      </div>
                      <span className="font-bold text-sm tabular-nums">
                         ₹{total.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
