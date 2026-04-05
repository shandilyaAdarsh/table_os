import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAdminStore } from '../../../store/index.js';

export default function AdminHeader() {
  const staff = useAdminStore((state) => state.staff);
  const logout = useAdminStore((state) => state.logout);
  const location = useLocation();

  const getPageTitle = (path) => {
    switch (path) {
      case '/admin/tables': return { title: 'Table Map', icon: 'grid_view' };
      case '/admin/orders': return { title: 'Live Orders', icon: 'receipt_long' };
      case '/admin/analytics': return { title: 'Analytics', icon: 'analytics' };
      case '/admin/menu': return { title: 'Menu Management', icon: 'menu_book' };
      case '/admin/qr': return { title: 'QR Manager', icon: 'qr_code_2' };
      case '/admin/staff': return { title: 'Staff', icon: 'people' };
      case '/admin':
      default:
        return { title: 'Dashboard', icon: 'dashboard' };
    }
  };

  const current = getPageTitle(location.pathname);

  return (
    <header className="bg-white/80 backdrop-blur-xl docked full-width top-0 pt-[env(safe-area-inset-top)] shadow-[0_12px_32px_-8px_rgba(20,27,43,0.08)] sticky z-50">
      <div className="flex justify-between items-center w-full px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary">{current.icon}</span>
          <h1 className="font-['Inter'] font-bold text-[1.375rem] tracking-tight tabular-nums text-on-background">
            {current.title}
          </h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col text-right">
            <span className="text-sm font-semibold text-on-surface">{staff?.name || 'Admin'}</span>
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest font-mono">
              {staff?.role || 'Owner'}
            </span>
          </div>
          <button 
            onClick={logout}
            title="Logout"
            className="text-primary font-bold hover:opacity-80 transition-opacity active:scale-95 duration-200"
          >
            <span className="material-symbols-outlined">logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
