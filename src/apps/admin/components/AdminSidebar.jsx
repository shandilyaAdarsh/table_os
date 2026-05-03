import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Map as MapIcon, 
  Activity, 
  BarChart3, 
  MenuSquare, 
  QrCode, 
  Users, 
  Settings 
} from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/admin', icon: LayoutDashboard, exact: true },
  { label: 'Table Map', path: '/admin/tables', icon: MapIcon, exact: false },
  { label: 'Live Orders', path: '/admin/orders', icon: Activity, exact: false },
  { label: 'Analytics', path: '/admin/analytics', icon: BarChart3, exact: false },
  { label: 'Menu Management', path: '/admin/menu', icon: MenuSquare, exact: false },
  { label: 'QR Manager', path: '/admin/qr', icon: QrCode, exact: false },
  { label: 'Staff', path: '/admin/staff', icon: Users, exact: false },
  { label: 'Settings', path: '/admin/settings', icon: Settings, exact: false },
];

export default function AdminSidebar() {
  return (
    <div 
      className="hidden lg:flex fixed left-0 top-0 h-full w-[240px] flex-col shrink-0 text-[#141b2b] z-50 selection:bg-[#D69E2E] selection:text-white bg-surface-container-low"
    >
      <div className="flex items-center justify-center h-20 shrink-0 mb-4">
        <span className="font-extrabold text-2xl tracking-tighter text-[#141b2b]">
          TABLEOS
        </span>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto w-full flex flex-col gap-1 px-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.label}
              to={item.path}
              end={item.exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm ${
                  isActive 
                    ? 'bg-[#ffffff] text-[#7d5700] shadow-[0_4px_12px_rgba(20,27,43,0.08)] font-semibold' 
                    : 'text-on-surface-variant hover:bg-white/60 hover:text-[#141b2b]'
                }`
              }
            >
              <Icon size={18} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 text-xs text-on-surface-variant/70 text-center font-mono">
        TableOS Admin v1.0
      </div>
    </div>
  );
}
