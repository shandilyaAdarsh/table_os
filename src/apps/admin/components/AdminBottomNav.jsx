import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';

const MOBILE_PRIMARY_NAV = [
  { label: 'Dashboard', path: '/admin', icon: 'dashboard', exact: true },
  { label: 'Tables', path: '/admin/tables', icon: 'table_restaurant', exact: false },
  { label: 'Orders', path: '/admin/orders', icon: 'receipt_long', exact: false },
  { label: 'Menu', path: '/admin/menu', icon: 'menu_book', exact: false },
];

const MOBILE_SECONDARY_NAV = [
  { label: 'Analytics', path: '/admin/analytics', icon: 'analytics', exact: false },
  { label: 'QR Manager', path: '/admin/qr', icon: 'qr_code_2', exact: false },
  { label: 'Staff', path: '/admin/staff', icon: 'people', exact: false },
  { label: 'Settings', path: '/admin/settings', icon: 'settings', exact: false },
];

export default function AdminBottomNav() {
  const [showSheet, setShowSheet] = useState(false);
  const location = useLocation();

  const isSecondaryActive = MOBILE_SECONDARY_NAV.some(item => 
    item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path)
  );

  return (
    <>
      <nav className="lg:hidden bg-on-secondary-fixed/80 backdrop-blur-xl fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 py-3 rounded-t-3xl pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.15)]">
        {MOBILE_PRIMARY_NAV.map((item) => {
          return (
            <NavLink
              key={item.label}
              to={item.path}
              end={item.exact}
              className={({ isActive }) => `flex flex-col items-center justify-center transition-colors active:scale-90 duration-150 group relative ${isActive ? 'text-primary-container' : 'text-zinc-400 hover:text-white'}`}
            >
              {({ isActive }) => (
                <>
                  {isActive && <div className="absolute -top-2 w-1 h-1 bg-primary-container rounded-full shadow-[0_0_8px_#d69e2e]" />}
                  <span className="material-symbols-outlined mb-1" style={isActive ? {fontVariationSettings: "'FILL' 1"} : {}}>
                    {item.icon}
                  </span>
                  <span className="font-['Inter'] text-[0.75rem] font-medium tracking-wide uppercase tabular-nums">
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
        
        {/* MORE BUTTON */}
        <button 
          onClick={() => setShowSheet(true)}
          className={`flex flex-col items-center justify-center transition-colors active:scale-90 duration-150 group relative ${isSecondaryActive || showSheet ? 'text-primary-container' : 'text-zinc-400 hover:text-white'}`}
        >
          {isSecondaryActive && !showSheet && <div className="absolute -top-2 w-1 h-1 bg-primary-container rounded-full shadow-[0_0_8px_#d69e2e]" />}
          <span className="material-symbols-outlined mb-1" style={isSecondaryActive || showSheet ? {fontVariationSettings: "'FILL' 1"} : {}}>
            more_horiz
          </span>
          <span className="font-['Inter'] text-[0.75rem] font-medium tracking-wide uppercase tabular-nums">
            More
          </span>
        </button>
      </nav>

      {/* MORE SHEET DRAWER */}
      {showSheet && (
        <div className="lg:hidden fixed inset-0 z-60 flex flex-col justify-end bg-on-surface/40 backdrop-blur-sm transition-opacity" onClick={() => setShowSheet(false)}>
          <div 
            className="rounded-t-3xl w-full pb-[env(safe-area-inset-bottom)] flex flex-col font-body animate-in slide-in-from-bottom bg-surface"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-surface-container-highest">
              <h2 className="text-on-surface font-bold text-lg font-mono">More Options</h2>
              <button onClick={() => setShowSheet(false)} className="text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low p-2 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            {/* Nav List */}
            <div className="flex flex-col p-2">
              {MOBILE_SECONDARY_NAV.map((item) => {
                return (
                  <NavLink
                    key={item.label}
                    to={item.path}
                    end={item.exact}
                    onClick={() => setShowSheet(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-4 w-full p-4 rounded-xl transition-colors ${
                        isActive ? 'bg-surface-container-low text-primary' : 'text-on-surface hover:bg-surface-bright'
                      }`
                    }
                  >
                    <span className="material-symbols-outlined">{item.icon}</span>
                    <span className="text-base font-semibold">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
