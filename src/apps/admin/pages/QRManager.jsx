import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase.js';
import { useAuthStore } from '../../../store/authStore.js';
import { QRCodeCanvas } from 'qrcode.react';

// const TENANT_ID = '...'; 
// const TENANT_SLUG = '...';

export default function QRManager() {
  const { tenantId: TENANT_ID, tenant } = useAuthStore();
  const TENANT_SLUG = tenant?.slug || 'demo';
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTables = async () => {
      const { data, error } = await supabase
        .from('restaurant_tables')
        .select('*')
        .eq('tenant_id', TENANT_ID)
        .order('table_num', { ascending: true });

      if (data) {
        setTables(data);
      }
      setLoading(false);
    };
    fetchTables();
  }, []);

  const handleDownload = (tableNum) => {
    const canvas = document.getElementById(`qr-canvas-${tableNum}`);
    if (canvas) {
      const pngUrl = canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
      let downloadLink = document.createElement("a");
      downloadLink.href = pngUrl;
      downloadLink.download = `TableOS-QR-${tableNum}.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }
  };

  const handlePrintAll = () => {
    window.print();
  };

  const statusMap = {
    'available': { text: 'Active • Public Access', color: 'bg-emerald-500' },
    'occupied': { text: 'Active • Occupied', color: 'bg-blue-500' },
    'needs_bussing': { text: 'Active • Cleaning', color: 'bg-orange-500' },
    'payment_pending': { text: 'Pending • Payment', color: 'bg-red-500' },
  };

  return (
    <div className="h-full relative font-body bg-background text-on-surface">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            padding: 20px;
          }
          .print-card {
            page-break-inside: avoid;
            margin-bottom: 20px;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
      
      <main className="px-5 py-8 max-w-md mx-auto" id="print-area">
        {/* Header Info */}
        <div className="mb-8 flex justify-between items-end no-print">
          <div>
            <p className="text-[0.75rem] font-medium tracking-wide uppercase text-on-surface-variant mb-1">Active Assets</p>
            <h2 className="text-3xl font-extrabold tracking-tight">{tables.length} Tables</h2>
          </div>
          <div className="bg-surface-container-low px-4 py-2 rounded-xl text-right">
            <p className="text-[0.7rem] font-bold text-on-surface-variant uppercase">Last Update</p>
            <p className="text-sm font-medium tabular-nums">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>

        {/* Vertical List of White Card Rows */}
        <div className="space-y-4 pb-32">
          {loading ? (
            <div className="flex justify-center items-center h-40 no-print">
              <div className="w-8 h-8 rounded-full border-2 border-primary-container border-t-transparent animate-spin" />
            </div>
          ) : tables.length === 0 ? (
            <div className="bg-surface-container-lowest shadow-[0_4px_12px_rgba(20,27,43,0.06)] rounded-xl p-10 text-center no-print">
              <p className="text-on-surface-variant font-mono text-sm">No tables mapped.</p>
            </div>
          ) : (
            tables.map(table => {
              const tableNum = table.table_num;
              const qrValue = `https://tableos.app/menu?table=${tableNum}&tenant=${TENANT_SLUG}`;
              const { text, color } = statusMap[table.status] || { text: 'Pending Sync', color: 'bg-amber-500' };

              return (
                <div key={table.id} className="print-card bg-surface-container-lowest p-4 rounded-xl flex items-center gap-4 transition-all hover:bg-white active:scale-[0.98] duration-200 group">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl font-black text-on-surface tabular-nums">
                        {String(tableNum).includes('Table') ? tableNum : `Table ${tableNum}`}
                      </span>
                      <span className="px-2 py-0.5 bg-surface-container-low text-[0.65rem] font-bold rounded-full text-on-surface-variant uppercase tracking-wider">
                        Floor {table.floor || 1}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${color}`}></span>
                      <span className="text-xs font-medium text-on-surface-variant">{text}</span>
                    </div>
                  </div>
                  
                  <div className="w-14 h-14 bg-white p-1 rounded-lg shadow-sm border border-outline-variant/15 flex items-center justify-center">
                    <QRCodeCanvas 
                      id={`qr-canvas-${tableNum}`}
                      value={qrValue}
                      size={46}
                      level="H" 
                      includeMargin={false}
                    />
                  </div>

                  <button 
                    onClick={() => handleDownload(tableNum)}
                    className="no-print w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant hover:bg-primary-container hover:text-on-primary-container transition-colors duration-200"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>download</span>
                  </button>
                  
                  {/* Print text hidden normally, visible in print mode */}
                  <div className="hidden print:block text-center mt-2 w-full text-[10px] text-on-surface-variant font-mono truncate">
                    {qrValue}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* FAB: Print All (Fixed Amber Button) */}
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-full max-w-[calc(100%-2.8rem)] md:max-w-md px-4 z-40 no-print">
          <button 
            onClick={handlePrintAll}
            disabled={tables.length === 0}
            className="w-full py-4 rounded-full shadow-[0_12px_32px_-8px_rgba(125,87,0,0.4)] flex items-center justify-center gap-3 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:shadow-none bg-[linear-gradient(135deg,#7d5700_0%,#d69e2e_100%)]"
          >
            <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1" }}>print</span>
            <span className="text-white font-bold tracking-wide uppercase text-sm">Print All Assets</span>
          </button>
        </div>
      </main>
    </div>
  );
}
