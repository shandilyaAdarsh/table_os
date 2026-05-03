import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase, TENANT_ID } from '../../../lib/supabase.js';
import { useOrderStore } from '../../../store/index.js';

export const formatTime = (s) => 
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const getBadgeConfig = (elapsed) => {
  if (elapsed < 180) return { label: 'FRESH', class: 'bg-green-900 text-green-400', color: '#4edea3' };
  if (elapsed < 420) return { label: 'WARNING', class: 'bg-amber-900 text-amber-400', color: '#F5A623' };
  if (elapsed < 660) return { label: 'HOT', class: 'bg-orange-900 text-orange-400', color: '#ea580c' };
  return { label: 'FIRE 🔥', class: 'bg-red-900 text-red-400', color: '#ef4444' };
};

const OrderCard = ({ id, tableId, tableNum, items, createdAt, status, note, allergen: topLevelAllergen, isDark, theme, onClear, isNew }) => {
  const [isActionLoading, setIsActionLoading] = useState(false);
  const toggleOrderItem = useOrderStore(state => state.toggleOrderItem);
  const removeOrder = useOrderStore(state => state.removeOrder);
  
  const [localElapsed, setLocalElapsed] = useState(() => {
    if (!createdAt) return 0;
    const start = new Date(createdAt).getTime();
    return Math.floor((Date.now() - start) / 1000);
  });

  // Per-card local timer tick
  useEffect(() => {
    const timerId = setInterval(() => {
      setLocalElapsed(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timerId);
  }, []);

  // Sync if createdAt changes (e.g. Supabase refresh)
  useEffect(() => {
    if (createdAt) {
      const start = new Date(createdAt).getTime();
      setLocalElapsed(Math.floor((Date.now() - start) / 1000));
    }
  }, [createdAt]);

  const allergen = topLevelAllergen || items.find(i => i.allergen)?.allergen;
  const badge = getBadgeConfig(localElapsed);

  // Border color style
  const borderColor = status === 'ready' ? '#4ade80' : badge.color;

  const handleAction = async () => {
    if (isActionLoading) return;
    setIsActionLoading(true);

    try {
      if (status === 'pending') {
        // ACCEPT → Cooking & clear is_new flag
        await supabase
          .from('orders')
          .update({ status: 'cooking', is_new: false })
          .eq('id', id)
          .eq('tenant_id', TENANT_ID);
      } 
      else if (status === 'cooking') {
        // MARK READY
        await supabase
          .from('orders')
          .update({ status: 'ready' })
          .eq('id', id)
          .eq('tenant_id', TENANT_ID);
      } 
      else if (status === 'ready') {
        // CLEAR / SERVED
        // 1. Update table status (Kitchen-side business logic)
        if (tableId) {
          await supabase
            .from('restaurant_tables')
            .update({ status: 'needs_bussing' })
            .eq('id', tableId)
            .eq('tenant_id', TENANT_ID);
        }

        // 2. Call store to update order status to 'served' and handle local state
        await removeOrder(id);

        if (onClear) {
          onClear({ id, tableNum, items, createdAt, status, note, allergen: topLevelAllergen });
        }
      }
    } catch (error) {
      console.error('[KDS] handleAction error:', error);
    } finally {
      setIsActionLoading(false);
    }
  };

  const getButtonConfig = () => {
    const baseClass = "text-white text-xs font-bold font-mono px-5 py-2 rounded-full cursor-pointer transition-colors duration-150";
    switch (status) {
      case 'pending':
        return { label: 'ACCEPT', className: `bg-blue-600 hover:bg-blue-500 ${baseClass}` };
      case 'cooking':
        return { label: 'MARK READY', className: `bg-emerald-600 hover:bg-emerald-500 ${baseClass}` };
      case 'ready':
        return { label: 'CLEAR', className: `bg-[#2A2A2A] hover:bg-[#3A3A3A] text-gray-400 ${baseClass}`.replace('text-white', '') };
      default:
        return { label: 'ACTION', className: `bg-zinc-700 ${baseClass}` };
    }
  };

  const button = getButtonConfig();

  const cardBackground = isDark
    ? (status === 'ready' ? '#0A1F0A' : status === 'cooking' ? '#191400' : '#1E1E1E')
    : (status === 'ready' ? '#F0FFF4' : status === 'cooking' ? '#FFFBEB' : '#FFFFFF');

  const cardShadow = isDark 
    ? '0 4px 20px rgba(0,0,0,0.4)' 
    : '0 2px 12px rgba(0,0,0,0.08)';

  // Combine pulse animations: long-running (red/slow) vs new (amber/fast)
  const isDanger = localElapsed >= 660;
  const pulseClass = isDanger ? 'animate-pulse' : (isNew ? 'ring-4 ring-amber-500/50 animate-pulse' : '');

  return (
    <div 
      className={pulseClass}
      style={{ 
        width: '100%',
        boxSizing: 'border-box',
        flexShrink: 0,
        borderRadius: '16px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        borderLeft: `5px solid ${borderColor}`,
        background: cardBackground,
        boxShadow: cardShadow,
        transition: 'all 0.3s ease'
      }}
    >
      {/* TOP ROW */}
      <div className="flex justify-between items-start">
        <div className="flex flex-col">
          <span className="font-mono font-black text-lg" style={{ color: theme.text }}>
            {String(id).startsWith('#') ? id : `#${id}`}
          </span>
          {isNew && (
            <span className="text-[10px] font-black text-amber-500 font-mono animate-bounce mt-1">NEW ORDER</span>
          )}
        </div>
        
        <div className="flex flex-col items-end gap-1">
          <span 
            className={`font-mono font-black text-2xl ${isDanger ? 'text-red-500 animate-pulse' : 'text-[#F5A623]'}`}
          >
            {formatTime(localElapsed)}
          </span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.class}`}>
            {badge.label}
          </span>
        </div>
      </div>

      {/* ALLERGEN BANNER */}
      {allergen && (
        <div className="w-full bg-red-950 border border-red-800 rounded-lg px-3 py-2 text-red-400 text-xs font-bold font-mono">
          ⚠️ {allergen}
        </div>
      )}

      {/* ITEMS LIST */}
      <div className="flex flex-col gap-2">
        {items.map((item, idx) => (
          <div 
            key={item.id || idx} 
            onClick={() => toggleOrderItem(id, item.id, !item.done)}
            className="flex items-start gap-2 text-sm cursor-pointer group"
          >
            <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
              item.done ? 'bg-green-600 border-green-600' : 'border-zinc-700 hover:border-zinc-500'
            }`}>
              {item.done && <span className="text-[10px] text-white">✓</span>}
            </div>
            <span className="font-mono w-6 shrink-0" style={{ color: theme.textMuted }}>
              {item.qty}x
            </span>
            <span 
              className={`font-medium transition-all ${item.done ? 'line-through opacity-40' : 'group-hover:translate-x-1'}`} 
              style={{ color: item.done ? theme.textMuted : theme.text }}
            >
              {item.name}
            </span>
          </div>
        ))}
      </div>

      {/* NOTE */}
      {note && (
        <div className="text-amber-500 text-xs italic">
          📝 {note}
        </div>
      )}

      {/* BOTTOM ROW */}
      <div 
        className="flex justify-between items-center"
        style={{ marginTop: '8px', paddingRight: '4px' }}
      >
        <span className="text-xs font-mono tracking-widest uppercase" style={{ color: theme.textMuted }}>
          TABLE {tableNum}
        </span>
        <button 
          onClick={handleAction}
          disabled={isActionLoading}
          className={`${button.className} shrink-0 flex items-center justify-center gap-2 min-w-[100px]`}
        >
          {isActionLoading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span>WAITING...</span>
            </>
          ) : (
            button.label
          )}
        </button>
      </div>
    </div>
  );
};

export default OrderCard;
