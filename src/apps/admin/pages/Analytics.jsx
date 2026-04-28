import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase.js';
import { useAuthStore } from '../../../store/authStore.js';
import KPIRow from '../components/KPIRow.jsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

// const TENANT_ID = '...'; // Removed hardcoded ID


// Format Hour, e.g., 17 -> "5 PM"
const formatHour = (hour) => {
  const h = parseInt(hour, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 || 12;
  return `${displayHour} ${ampm}`;
};

const STATION_COLORS = {
  'GRILL': '#d69e2e', // Amber primary
  'HOT': '#7d5700',   // Amber dark
  'BREAD': '#e2dfe1', // Gray
  'FRY': '#f8bc4b',   // Amber light
  'COLD': '#a38c7c',  
  'BAR': '#504535',   
  'UNKNOWN': '#f1f3ff'
};

export default function Analytics() {
  const { tenantId: TENANT_ID } = useAuthStore();
  const [ordersPerHour, setOrdersPerHour] = useState([]);
  const [topDishes, setTopDishes] = useState([]);
  const [stationStats, setStationStats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      // 1. Fetch Orders for Hourly Chart
      const { data: ordersData, error: ordersErr } = await supabase
        .from('orders')
        .select('created_at, status')
        .eq('tenant_id', TENANT_ID)
        .neq('status', 'cancelled');
      
      if (ordersErr) throw ordersErr;

      // Group by hour
      const hourlyCount = {};
      ordersData?.forEach(order => {
        const d = new Date(order.created_at);
        const h = d.getHours();
        hourlyCount[h] = (hourlyCount[h] || 0) + 1;
      });

      const hourlyFormatted = Object.keys(hourlyCount).sort((a,b) => a - b).map(h => ({
        hourLabel: formatHour(h),
        orders: hourlyCount[h]
      }));
      setOrdersPerHour(hourlyFormatted);

      // 2. Fetch Order Items for Dishes and Stations
      const { data: orderItemsData, error: itemsErr } = await supabase
        .from('order_items')
        .select(`
          name, 
          qty, 
          station,
          orders!inner(tenant_id, status)
        `)
        .eq('orders.tenant_id', TENANT_ID)
        .neq('orders.status', 'cancelled');

      if (itemsErr) throw itemsErr;

      // Group Dishes
      const dishCount = {};
      const stationCount = {};

      orderItemsData?.forEach(item => {
        // Top Dishes
        const name = item.name;
        dishCount[name] = (dishCount[name] || 0) + (item.qty || 1);

        // Stations
        const st = item.station?.toUpperCase() || 'UNKNOWN';
        stationCount[st] = (stationCount[st] || 0) + (item.qty || 1);
      });

      // Format Top 5 Dishes
      const dishesFormatted = Object.keys(dishCount)
        .map(name => ({ name, qty: dishCount[name] }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5); 
      setTopDishes(dishesFormatted);

      // Format Station Donut
      const stationsFormatted = Object.keys(stationCount)
        .map(station => ({ name: station, value: stationCount[station] }))
        .sort((a, b) => b.value - a.value);
      setStationStats(stationsFormatted);

    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-surface-container-lowest border border-surface-container px-3 py-2 rounded-lg shadow-[0_12px_32px_-8px_rgba(20,27,43,0.08)]">
          <p className="text-primary font-bold text-xs mb-1">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-on-surface-variant text-sm font-medium">
              <span className="font-bold text-on-surface">{entry.name}:</span> {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const maxDishQty = Math.max(...topDishes.map(d => d.qty), 1);
  const totalStations = stationStats.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="h-full relative font-body text-on-surface pb-32">
      <main className="max-w-[390px] md:max-w-7xl mx-auto">
        <KPIRow tenantId={TENANT_ID} />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-0">
          
          {/* Chart 1: Orders Per Hour */}
          <div className="bg-surface-container-lowest rounded-xl shadow-[0_12px_32px_-8px_rgba(20,27,43,0.08)] overflow-hidden lg:col-span-2">
            <div className="px-5 py-4 flex justify-between items-center bg-surface-container-lowest border-b border-surface-container/30">
              <h3 className="text-[1.1rem] font-bold text-on-surface">Orders Per Hour</h3>
              <span className="material-symbols-outlined text-on-surface-variant">more_vert</span>
            </div>
            <div className="px-5 pb-6 pt-4 h-64">
               {(ordersPerHour.length > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ordersPerHour} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f3ff" vertical={false} />
                    <XAxis 
                      dataKey="hourLabel" 
                      stroke="#dce2f7" 
                      tick={{ fill: '#504535', fontSize: 10, fontFamily: 'monospace' }} 
                      axisLine={false} 
                      tickLine={false} 
                      dy={10}
                    />
                    <YAxis 
                      stroke="#dce2f7" 
                      tick={{ fill: '#504535', fontSize: 10, fontFamily: 'monospace' }} 
                      axisLine={false} 
                      tickLine={false} 
                      allowDecimals={false}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(20,27,43,0.03)' }} />
                    <Bar dataKey="orders" name="Orders" fill="#d69e2e" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-on-surface-variant text-sm font-mono">No hourly data</div>
              )}
            </div>
          </div>

          {/* Chart 2: Top Dishes (HTML Progress Bars exactly like Stitch) */}
          <div className="bg-surface-container-lowest rounded-xl shadow-[0_12px_32px_-8px_rgba(20,27,43,0.08)] overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-container">
              <h3 className="text-[1.1rem] font-bold text-on-surface">Top Dishes</h3>
            </div>
            <div className="px-5 py-6 space-y-5 h-64 overflow-y-auto">
               {(topDishes.length > 0) ? topDishes.map((dish, i) => (
                <div className="space-y-2" key={i}>
                  <div className="flex justify-between text-[0.8rem] font-semibold">
                    <span>{dish.name}</span>
                    <span className="tabular-nums text-on-surface-variant">{dish.qty} Sold</span>
                  </div>
                  <div className="w-full bg-surface-container-low h-2 rounded-full overflow-hidden">
                    <div className="bg-primary-container h-full rounded-full transition-all duration-1000" style={{ width: `${(dish.qty / maxDishQty) * 100}%` }}></div>
                  </div>
                </div>
              )) : (
                <div className="h-full flex items-center justify-center text-on-surface-variant text-sm font-mono">No dish data</div>
              )}
            </div>
          </div>

          {/* Chart 3: By Station */}
          <div className="bg-surface-container-lowest rounded-xl shadow-[0_12px_32px_-8px_rgba(20,27,43,0.08)] overflow-hidden lg:col-span-1">
            <div className="px-5 py-4 border-b border-surface-container">
              <h3 className="text-[1.1rem] font-bold text-on-surface">By Station</h3>
            </div>
            <div className="px-5 py-8 flex flex-col md:flex-row items-center justify-between gap-6 h-64">
               {(stationStats.length > 0) ? (
                <>
                  <div className="relative w-32 h-32 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stationStats}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={60}
                          paddingAngle={2}
                          stroke="none"
                        >
                          {stationStats.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={STATION_COLORS[entry.name] || STATION_COLORS['UNKNOWN']} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[0.6rem] uppercase font-bold text-on-surface-variant">Total</span>
                      <span className="text-lg font-black tabular-nums">{totalStations}</span>
                    </div>
                  </div>
                  
                  <div className="space-y-3 flex-1 overflow-y-auto pr-2">
                    {stationStats.map((stat, i) => (
                      <div className="flex items-center gap-2" key={i}>
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: STATION_COLORS[stat.name] || STATION_COLORS['UNKNOWN'] }}></div>
                        <span className="text-[0.8rem] font-medium text-on-surface-variant truncate">
                          <span className="capitalize">{stat.name.toLowerCase()}</span> 
                          <span className="tabular-nums ml-1">({Math.round((stat.value/totalStations)*100)}%)</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-on-surface-variant text-sm font-mono">No station data</div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
