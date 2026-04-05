import React, { useState, useEffect } from 'react';
import { fetchKPIMetrics } from '../utils/metrics.js';
import { supabase } from '../../../lib/supabase.js';

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
};

export default function KPIRow({ tenantId }) {
  const [metrics, setMetrics] = useState({
    revenue: 0,
    activeTables: 0,
    activeOrders: 0,
    avgOrderValue: 0
  });
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  const loadMetrics = async () => {
    setLoadingMetrics(true);
    const data = await fetchKPIMetrics(tenantId);
    if (data) {
      setMetrics(data);
    }
    setLoadingMetrics(false);
  };

  useEffect(() => {
    loadMetrics();
    const subOrd = supabase.channel('kpi_orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` }, loadMetrics)
      .subscribe();
      
    const subTab = supabase.channel('kpi_tables')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables', filter: `tenant_id=eq.${tenantId}` }, loadMetrics)
      .subscribe();

    return () => {
      supabase.removeChannel(subOrd);
      supabase.removeChannel(subTab);
    };
  }, [tenantId]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
      {/* Today's Revenue */}
      <div className="bg-surface-container-lowest p-4 rounded-xl shadow-[0_4px_20px_-4px_rgba(20,27,43,0.04)] border-l-4 border-primary-container flex flex-col justify-between min-h-[110px]">
        <span className="text-[0.75rem] font-medium text-on-surface-variant uppercase tracking-wider">Today's Revenue</span>
        <div className="mt-2">
          {loadingMetrics ? (
            <div className="h-7 w-20 bg-surface-container-low rounded animate-pulse" />
          ) : (
            <span className="text-[1.375rem] font-bold tabular-nums">{formatCurrency(metrics.revenue)}</span>
          )}
          <div className="flex items-center gap-1 text-[0.7rem] text-emerald-600 font-semibold mt-1">
            <span className="material-symbols-outlined text-sm" style={{fontVariationSettings: "'FILL' 1"}}>trending_up</span>
            <span>Live Data</span>
          </div>
        </div>
      </div>

      {/* Active Tables */}
      <div className="bg-surface-container-lowest p-4 rounded-xl shadow-[0_4px_20px_-4px_rgba(20,27,43,0.04)] border-l-4 border-primary-container flex flex-col justify-between min-h-[110px]">
        <span className="text-[0.75rem] font-medium text-on-surface-variant uppercase tracking-wider">Active Tables</span>
        <div className="mt-2">
          {loadingMetrics ? (
            <div className="h-7 w-16 bg-surface-container-low rounded animate-pulse" />
          ) : (
             <span className="text-[1.375rem] font-bold tabular-nums">{metrics.activeTables} <span className="text-on-surface-variant/40 font-medium">/ occ.</span></span>
          )}
          <div className="h-1.5 w-full bg-surface-container-low rounded-full mt-3 overflow-hidden">
            <div className="h-full bg-primary-container w-[33%] rounded-full transition-all duration-500"></div>
          </div>
        </div>
      </div>

      {/* Active Orders */}
      <div className="bg-surface-container-lowest p-4 rounded-xl shadow-[0_4px_20px_-4px_rgba(20,27,43,0.04)] border-l-4 border-primary-container flex flex-col justify-between min-h-[110px]">
        <span className="text-[0.75rem] font-medium text-on-surface-variant uppercase tracking-wider">Active Orders</span>
        <div className="mt-2">
          {loadingMetrics ? (
            <div className="h-7 w-12 bg-surface-container-low rounded animate-pulse" />
          ) : (
            <span className="text-[1.375rem] font-bold tabular-nums">{metrics.activeOrders}</span>
          )}
          <p className="text-[0.7rem] text-on-surface-variant/60 font-medium mt-1">Kitchen processing</p>
        </div>
      </div>

      {/* Avg Order */}
      <div className="bg-surface-container-lowest p-4 rounded-xl shadow-[0_4px_20px_-4px_rgba(20,27,43,0.04)] border-l-4 border-primary-container flex flex-col justify-between min-h-[110px]">
        <span className="text-[0.75rem] font-medium text-on-surface-variant uppercase tracking-wider">Avg Order</span>
        <div className="mt-2">
          {loadingMetrics ? (
            <div className="h-7 w-20 bg-surface-container-low rounded animate-pulse" />
          ) : (
             <span className="text-[1.375rem] font-bold tabular-nums">{formatCurrency(metrics.avgOrderValue)}</span>
          )}
          <p className="text-[0.7rem] text-on-surface-variant/60 font-medium mt-1">Per customer</p>
        </div>
      </div>
    </div>
  );
}
