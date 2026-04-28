import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase.js';
import { useAuthStore } from '../../../store/authStore.js';

// const TENANT_ID = '...'; // Removed hardcoded ID


// Local ticking timer for elapsed time
const ElapsedTimer = ({ createdAt }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!createdAt) return;
    const start = new Date(createdAt).getTime();

    const updateTime = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    updateTime();

    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return <>{mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}</>;
};

const OrderCard = ({ order, onAction }) => {
  const total = order.total || 0;

  let borderColor = 'border-surface-container-high';
  let btnClasses = 'bg-surface-container text-on-surface';
  let btnIcon = 'schedule';
  let btnText = 'Update Status';
  let nextAction = null;
  let statusText = order.status;

  if (order.status === 'pending') {
    borderColor = 'border-amber-500';
    btnClasses = 'bg-gradient-to-br from-primary to-primary-container text-white';
    btnIcon = 'restaurant';
    btnText = 'Accept Order';
    nextAction = 'cooking';
    statusText = 'Pending';
  } else if (order.status === 'cooking') {
    borderColor = 'border-amber-500';
    btnClasses = 'bg-gradient-to-br from-primary to-primary-container text-white';
    btnIcon = 'restaurant';
    btnText = 'Mark as Ready';
    nextAction = 'ready';
    statusText = 'Cooking';
  } else if (order.status === 'ready') {
    borderColor = 'border-tertiary-container';
    btnClasses = 'bg-[#10b981] text-white';
    btnIcon = 'check_circle';
    btnText = 'Serve Order';
    nextAction = 'served';
    statusText = 'Ready';
  }

  return (
    <div className={`bg-surface-container-lowest rounded-xl shadow-[0_12px_32px_-8px_rgba(20,27,43,0.08)] overflow-hidden flex flex-col border-l-[6px] ${borderColor}`}>
      <div className="p-4 flex flex-col gap-3">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-[0.75rem] font-bold text-on-surface-variant tracking-wider uppercase mb-0.5">Table</div>
            <div className="text-xl font-extrabold tracking-tight">{order.tableNum}</div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1.5 text-on-surface-variant justify-end text-[0.875rem] font-medium tabular-nums">
              <span className="material-symbols-outlined text-[1rem]">schedule</span>
              <ElapsedTimer createdAt={order.createdAt} />
            </div>
            <div className="text-xl font-extrabold text-on-surface tabular-nums mt-0.5">₹{total.toLocaleString('en-IN')}</div>
          </div>
        </div>
        <div className="bg-surface-container-low rounded-lg p-3">
          <ul className="text-on-secondary-fixed-variant text-[0.875rem] space-y-1.5">
            {order.items?.length > 0 ? (
              order.items.map((item, idx) => (
                <li key={idx} className="flex justify-between">
                  <span>{item.qty}x {item.name}</span>
                  {/* Mock status per item based on parent - in a real app this might be item level */}
                  <span className={`${order.status === 'ready' ? 'text-tertiary font-bold uppercase text-[0.7rem]' : 'text-on-surface font-semibold'}`}>
                    {statusText}
                  </span>
                </li>
              ))
            ) : (
              <li className="text-on-surface-variant">No items found</li>
            )}
          </ul>
        </div>
      </div>
      <button 
        onClick={() => onAction(order.id, order.tableNum, nextAction)}
        className={`w-full font-bold py-4 active:scale-[0.98] transition-transform flex items-center justify-center gap-2 ${btnClasses}`}
      >
        <span className="material-symbols-outlined" style={btnIcon === 'check_circle' ? {fontVariationSettings: "'FILL' 1"} : {}}>{btnIcon}</span>
        {btnText}
      </button>
    </div>
  );
};

export default function LiveOrders() {
  const { tenantId: TENANT_ID } = useAuthStore();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('All');

  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(name, qty)')
      .eq('tenant_id', TENANT_ID)
      .not('status', 'in', '("served","cancelled")')
      .order('created_at', { ascending: false });

    if (data) {
      const formatted = data.map(o => ({
        id: o.id,
        tableNum: o.table_num || o.tableNum || '?',
        status: o.status,
        createdAt: o.created_at,
        total: o.total_amount || 0,
        items: o.order_items || []
      }));
      setOrders(formatted);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel('live-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${TENANT_ID}` }, fetchOrders)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const handleAction = async (orderId, tableNum, newStatus) => {
    if (!newStatus) return;
    if (newStatus === 'served') {
      await supabase.from('orders').update({ status: 'served' }).eq('id', orderId);
      await supabase.from('restaurant_tables').update({ status: 'needs_bussing' }).eq('table_num', tableNum).eq('tenant_id', TENANT_ID);
    } else {
      await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
    }
  };

  const counts = {
    All: orders.length,
    Pending: orders.filter(o => o.status === 'pending').length,
    Cooking: orders.filter(o => o.status === 'cooking').length,
    Ready: orders.filter(o => o.status === 'ready').length,
  };

  const filteredOrders = activeTab === 'All' ? orders : orders.filter(o => o.status.toLowerCase() === activeTab.toLowerCase());

  return (
    <div className="flex flex-col min-h-screen text-on-surface font-body pb-[calc(84px+env(safe-area-inset-bottom))]">
      <main className="max-w-[390px] md:max-w-7xl mx-auto w-full">
        {/* Filter Pills Section */}
        <section className="flex gap-2 overflow-x-auto py-4 px-2 no-scrollbar">
          {['All', 'Pending', 'Cooking', 'Ready'].map(tab => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`shrink-0 px-4 py-2 rounded-full font-medium text-[0.75rem] tracking-wide uppercase flex items-center gap-1.5 active:scale-95 duration-150 transition-colors
                  ${isActive ? 'bg-primary-container text-on-primary-container font-semibold' : 'bg-surface-container-highest text-on-surface-variant'}`}
              >
                {tab} <span className={isActive ? 'opacity-70' : 'opacity-50'}>({counts[tab]})</span>
              </button>
            )
          })}
        </section>

        {/* Orders List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 py-2 px-2">
          {loading ? (
             <div className="col-span-full flex justify-center items-center h-40">
               <div className="w-8 h-8 rounded-full border-2 border-primary-container border-t-transparent animate-spin" />
             </div>
          ) : filteredOrders.length === 0 ? (
             <div className="col-span-full text-center py-10 text-on-surface-variant font-mono">
                No active orders in this group.
             </div>
          ) : (
            filteredOrders.map(order => (
              <OrderCard key={order.id} order={order} onAction={handleAction} />
            ))
          )}
        </div>
      </main>
    </div>
  );
}

