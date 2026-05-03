import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useOrderStore } from '../../../store/index.js';

// Re-export formatTime for any parent that needs it
export const formatTime = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;


/* ─── Status config: "Clinical Artisan" palette ─── */
const getStatusConfig = (status, elapsed) => {
  // Late (over 11 min) — error state
  if (status === 'cooking' && elapsed >= 660) return {
    accentColor:  '#BA1A1A',
    headerBg:     'rgba(186,26,26,0.04)',
    timerColor:   '#BA1A1A',
    timerPulse:   true,
    showLate:     true,
    lateLabel:    `LATE +${Math.floor((elapsed - 660) / 60)}m`,
    outlineColor: 'rgba(186,26,26,0.15)',
  };

  if (status === 'ready') return {
    accentColor:  '#006948',
    headerBg:     'rgba(0,105,72,0.04)',
    timerColor:   '#BA1A1A',
    timerPulse:   false,
    showLate:     elapsed >= 660,
    lateLabel:    'LATE',
    outlineColor: 'rgba(0,105,72,0.15)',
  };

  if (status === 'cooking') return {
    accentColor:  '#2D5FA3',
    headerBg:     'rgba(45,95,163,0.04)',
    timerColor:   '#554336',
    timerPulse:   false,
    showLate:     false,
    lateLabel:    '',
    outlineColor: 'rgba(45,95,163,0.12)',
  };

  // pending (default)
  return {
    accentColor:  '#8D4B00',
    headerBg:     'rgba(141,75,0,0.04)',
    timerColor:   '#554336',
    timerPulse:   false,
    showLate:     false,
    lateLabel:    '',
    outlineColor: 'rgba(219,194,176,0.5)',
  };
};

/* ─── Station chip colour map ─── */
const STATION_COLORS = {
  GRILL: { bg: '#FFF4EC', color: '#8D4B00' },
  FRY:   { bg: '#FEF3C7', color: '#92400E' },
  HOT:   { bg: '#FEE2E2', color: '#991B1B' },
  COLD:  { bg: '#EFF6FF', color: '#1E40AF' },
  BAR:   { bg: '#F5F3FF', color: '#5B21B6' },
};

const chipStyle = (key) => {
  const c = STATION_COLORS[key?.toUpperCase()] || { bg: '#F2F4F6', color: '#554336' };
  return {
    background:   c.bg,
    color:        c.color,
    fontSize:     '9px',
    fontWeight:   900,
    letterSpacing:'0.05em',
    padding:      '2px 6px',
    borderRadius: '9999px',   /* pill */
    textTransform:'uppercase',
    whiteSpace:   'nowrap',
    flexShrink:   0,
  };
};

/* ══════════════════════════════════════════════════
   OrderCard
══════════════════════════════════════════════════ */
const OrderCard = ({ order, isHistory = false, setConfirmModal }) => {
  const { id, tableNum, items, status, createdAt } = order;
  const acceptPartialOrder = useOrderStore(s => s.acceptPartialOrder);
  const updateOrderStatus  = useOrderStore(s => s.updateOrderStatus);
  const toggleOrderItem    = useOrderStore(s => s.toggleOrderItem);
  const rejectOrder        = useOrderStore(s => s.rejectOrder);

  // Default: all items are selected (kitchen accepts the full order unless they deselect)
  const [selectedItems, setSelectedItems]     = useState(() => items.map(i => i.id));
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [localElapsed, setLocalElapsed]       = useState(0);

  // Keep selectedItems in sync if items prop changes (e.g. realtime update)
  useEffect(() => {
    setSelectedItems(items.map(i => i.id));
  }, [id]);

  useEffect(() => {
    if (isHistory) return;
    const calc = () => {
      if (!createdAt) return;
      setLocalElapsed(Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
    };
    calc();
    const iv = setInterval(calc, 1000);
    return () => clearInterval(iv);
  }, [createdAt, isHistory]);

  const cfg = getStatusConfig(status, localElapsed);

  const toggleSelection = (itemId) =>
    setSelectedItems(prev =>
      prev.includes(itemId) ? prev.filter(x => x !== itemId) : [...prev, itemId]
    );

  const handleAction = async () => {
    if (isActionLoading || isHistory) return;
    setIsActionLoading(true);
    try {
      if (status === 'pending') {
        // acceptPartialOrder: moves to cooking + marks unselected items as rejected
        await acceptPartialOrder(id, selectedItems);
      } else if (status === 'cooking') {
        await updateOrderStatus(id, 'ready');
      } else if (status === 'ready') {
        await updateOrderStatus(id, 'served');
      }
    } catch (err) {
      console.error('[KDS] Action error:', err);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (isActionLoading || isHistory) return;
    
    setConfirmModal({
      title: 'Cancel Order',
      message: 'Are you sure you want to cancel this entire order? This action cannot be undone.',
      onConfirm: async () => {
        setIsActionLoading(true);
        try {
          await rejectOrder(id);
        } catch (err) {
          console.error('[KDS] Cancel error:', err);
        } finally {
          setIsActionLoading(false);
        }
      }
    });
  };

  /* ─── CARD SHELL ─── */
  return (
    <div
      className="order-card"
      style={{
        background:   '#FFFFFF',                     /* surface-container-lowest */
        borderRadius: '8px',
        overflow:     'hidden',
        display:      'flex',
        flexDirection:'column',
        /* Ghost border — 15 % opacity as per spec */
        outline:      `1px solid ${cfg.outlineColor}`,
        /* Ambient shadow — marble-countertop diffuse */
        boxShadow:    '0px 12px 32px rgba(15,23,42,0.06)',
        /* left accent stripe — 4 px, no full border */
        borderLeft:   `4px solid ${cfg.accentColor}`,
        transition:   'transform 0.2s cubic-bezier(0.2,0,0,1)',
      }}
    >
      {/* ── CARD HEADER ── */}
      <div style={{
        padding:        '14px 16px',
        background:     cfg.headerBg,
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'flex-start',
        borderBottom:   '1px solid rgba(219,194,176,0.3)',
        flexShrink:     0,
      }}>
        <div>
          {/* Customer Name */}
          <div style={{
            fontSize:      '12px',
            fontWeight:    800,
            color:         '#8D4B00',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom:  '6px',
            display:       'flex',
            alignItems:    'center',
            gap:           '4px'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>person</span>
            {order.customerName || 'GUEST'}
          </div>

          {/* Table number — "The Pulse" display */}
          <h4 style={{
            fontSize:      '26px',
            fontWeight:    900,
            letterSpacing: '-0.04em',
            lineHeight:    1,
            color:         '#191C1E',
          }}>
            Table {tableNum?.toString().replace(/^T/, '')}
          </h4>
          
          {/* Order ID — label metadata */}
          <p style={{
            fontSize:      '9px',
            fontWeight:    700,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color:         '#887364',
            marginTop:     '4px',
          }}>
            #{id.slice(0, 8)}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          {!isHistory ? (
            <>
              <span style={{
                fontFamily:         '"Inter", monospace',
                fontVariantNumeric: 'tabular-nums',
                fontSize:           '20px',
                fontWeight:         700,
                letterSpacing:      '-0.02em',
                lineHeight:         1,
                color:              cfg.timerColor,
                animation:          cfg.timerPulse ? 'pulse 1s ease-in-out infinite' : 'none',
              }}>
                {formatTime(localElapsed)}
              </span>
              {cfg.showLate && (
                <span style={{
                  fontSize:      '9px',
                  fontWeight:    900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.15em',
                  color:         '#BA1A1A',
                }}>
                  {cfg.lateLabel}
                </span>
              )}
            </>
          ) : (
            <div style={{ 
              fontSize: '10px', 
              fontWeight: 700, 
              color: '#887364',
              textAlign: 'right',
              lineHeight: 1.4
            }}>
              <div>{new Date(order.createdAt).toLocaleDateString()}</div>
              <div>{new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── ITEMS LIST ── */}
      <div style={{ 
        padding: '16px', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '14px', 
        flex: 1, 
        overflowY: 'auto' 
      }}>
        {items.map((item, idx) => {
          const isPending  = status === 'pending';
          const isSelected = selectedItems.includes(item.id);
          const isRejected = item.isRejected;
          
          // Once accepted (cooking/ready/served), accepted items are ALWAYS ticked and can't be unticked
          const isItemDone = (!isPending && !isRejected) ? true : item.done;
          
          const isAllergy  = item.note?.toLowerCase().includes('allergy');

          /* dim unselected pending items, rejected items, done cooking items */
          const rowOpacity = (isPending && !isSelected) ? 0.35
                           : isRejected ? 0.4
                           : (isItemDone && status === 'cooking') ? 0.6
                           : 1;

          return (
            <div
              key={item.id || idx}
              onClick={() => {
                if (isPending) toggleSelection(item.id);
                else if (status === 'cooking' && !isRejected && !isItemDone) {
                  // If we wanted to allow ticking in cooking, we could.
                  // But user said "should always be marked tick ... and cant be unticked"
                  // So we effectively disable interaction here.
                }
              }}
              style={{
                display:    'flex',
                alignItems: 'flex-start',
                gap:        '12px',
                padding:    '4px 8px',
                margin:     '0 -8px',
                borderRadius: '6px',
                background: isSelected ? 'rgba(141, 75, 0, 0.05)' : 'transparent',
                opacity:    rowOpacity,
                cursor:     'pointer',
                transition: 'all 0.2s cubic-bezier(0.2,0,0,1)',
              }}
            >
              {/* check icon */}
              {isRejected ? (
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '20px', color: '#BA1A1A', flexShrink: 0 }}
                >
                  cancel
                </span>
              ) : isItemDone ? (
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: '20px',
                    color:    status === 'cooking' ? '#2D5FA3' : '#006948',
                    flexShrink: 0,
                    fontVariationSettings: "'FILL' 1",
                  }}
                >
                  check_circle
                </span>
              ) : (isPending && isSelected) ? (
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: '20px',
                    color:    '#8D4B00',
                    flexShrink: 0,
                    fontVariationSettings: "'FILL' 1",
                  }}
                >
                  check_circle
                </span>
              ) : (
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '20px', color: '#DBC2B0', flexShrink: 0 }}
                >
                  radio_button_unchecked
                </span>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
                  {/* Dish name — "The Hero" title scale */}
                  <span style={{
                    fontSize:       '14px',
                    fontWeight:     700,
                    letterSpacing:  '-0.01em',
                    lineHeight:     1.3,
                    color:          isItemDone && status !== 'cooking' ? '#887364' : '#191C1E',
                    textDecoration: isItemDone && status === 'cooking' ? 'line-through' : 'none',
                    transition:     'color 0.2s cubic-bezier(0.2,0,0,1)',
                  }}>
                    {item.qty > 1 && (
                      <span style={{ color: isRejected ? '#BA1A1A' : '#8D4B00', marginRight: '4px' }}>{item.qty}×</span>
                    )}
                    <span style={{ textDecoration: isRejected ? 'line-through' : 'none' }}>
                      {item.name}
                    </span>
                    {isRejected && (
                      <span style={{ 
                        fontSize: '9px', fontWeight: 900, color: '#BA1A1A', 
                        marginLeft: '8px', padding: '2px 6px', background: '#FEF2F2',
                        borderRadius: '4px', textTransform: 'uppercase'
                      }}>
                        Cancelled
                      </span>
                    )}
                  </span>
                  {/* station chip removed */}
                </div>

                {/* Modifications — "The Specs" body */}
                {item.note && !isAllergy && (
                  <p style={{ fontSize: '11px', color: '#887364', fontStyle: 'italic', marginTop: '4px' }}>
                    • {item.note}
                  </p>
                )}

                {/* Allergy — danger */}
                {isAllergy && (
                  <p style={{
                    fontSize:      '10px',
                    fontWeight:    900,
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    color:         '#BA1A1A',
                    marginTop:     '6px',
                  }}>
                    {item.note}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── ACTIONS ── */}
      {!isHistory && (
        <div style={{
          padding:    '8px',
          background: '#F2F4F6',
          borderTop:  '1px solid rgba(219,194,176,0.3)',
          flexShrink: 0,
        }}>

        {/* PENDING → CANCEL + ACCEPT */}
        {status === 'pending' && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={(e) => { e.stopPropagation(); handleCancel(); }}
              disabled={isActionLoading}
              className="cubic-transition"
              style={{
                flex: 1,
                background: '#FFFFFF',
                color: '#BA1A1A',
                fontWeight: 900,
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                padding: '13px 8px',
                borderRadius: '6px',
                border: '1px solid rgba(186,26,26,0.3)',
                cursor: 'pointer',
                opacity: isActionLoading ? 0.6 : 1,
              }}
            >
              CANCEL
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleAction(); }}
              disabled={isActionLoading || selectedItems.length === 0}
              className="cubic-transition"
              style={{
                flex: 2,
                background: selectedItems.length > 0
                  ? 'linear-gradient(15deg, #8D4B00, #B15F00)'
                  : '#E6E8EA',
                color: selectedItems.length > 0 ? '#FFFFFF' : '#887364',
                fontWeight: 900,
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
                padding: '13px',
                borderRadius: '6px',
                border: 'none',
                cursor: selectedItems.length > 0 ? 'pointer' : 'not-allowed',
                opacity: isActionLoading ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isActionLoading
                ? <Loader2 size={14} className="animate-spin" />
                : 'Accept Order'}
            </button>
          </div>
        )}

        {/* COOKING → BUMP + MARK READY */}
        {status === 'cooking' && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={(e) => { e.stopPropagation(); handleCancel(); }}
              disabled={isActionLoading}
              className="cubic-transition"
              style={{
                flex:        1,
                background:  '#FFFFFF',
                color:       '#BA1A1A',
                fontWeight:  900,
                fontSize:    '10px',
                textTransform:'uppercase',
                letterSpacing:'0.12em',
                padding:     '13px 8px',
                borderRadius:'6px',
                border:      '1px solid rgba(186,26,26,0.3)',
                cursor:      'pointer',
              }}
            >
              CANCEL
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleAction(); }}
              disabled={isActionLoading}
              className="cubic-transition"
              style={{
                flex:        2,
                background:  'linear-gradient(15deg, #006948, #00855D)',
                color:       '#FFFFFF',
                fontWeight:  900,
                fontSize:    '10px',
                textTransform:'uppercase',
                letterSpacing:'0.12em',
                padding:     '13px 8px',
                borderRadius:'6px',
                border:      'none',
                cursor:      'pointer',
                opacity:     isActionLoading ? 0.6 : 1,
                display:     'flex',
                alignItems:  'center',
                justifyContent: 'center',
              }}
            >
              {isActionLoading ? <Loader2 size={14} className="animate-spin" /> : 'MARK READY'}
            </button>
          </div>
        )}

        {/* READY → CLEAR / SERVED */}
        {status === 'ready' && (
          <button
            onClick={(e) => { e.stopPropagation(); handleAction(); }}
            disabled={isActionLoading}
            className="cubic-transition"
            style={{
              width:        '100%',
              background:   'linear-gradient(15deg, #006948, #00855D)',
              color:        '#FFFFFF',
              fontWeight:   900,
              fontSize:     '11px',
              textTransform:'uppercase',
              letterSpacing:'0.12em',
              padding:      '13px',
              borderRadius: '6px',
              border:       'none',
              cursor:       'pointer',
              opacity:      isActionLoading ? 0.6 : 1,
              display:      'flex',
              alignItems:   'center',
              justifyContent:'center',
              gap:          '8px',
            }}
          >
            {isActionLoading
              ? <Loader2 size={14} className="animate-spin" />
              : <>
                  CLEAR / SERVED
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}>check</span>
                </>
            }
          </button>
        )}
      </div>
      )}
    </div>
  );
};

export default OrderCard;
