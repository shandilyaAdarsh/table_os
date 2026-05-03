import React from 'react';
// import KDSLogin from '../kds/pages/KDSLogin.jsx'; // Deleted

export const StaffLogin = () => (
  <div className="flex items-center justify-center min-h-screen bg-black text-white font-mono">
    <div className="text-center p-8 border border-zinc-800 rounded-lg">
      <h2 className="text-amber-500 mb-2">STAFF LOGIN</h2>
      <p className="text-zinc-500 text-sm">Authentication currently offline for development</p>
      <button 
        onClick={() => window.location.href = '/staff/tables'}
        className="mt-6 px-4 py-2 bg-amber-600 text-white rounded font-bold"
      >
        BYPASS TO FLOOR VIEW
      </button>
    </div>
  </div>
);
export const StaffTables = () => <div className="p-10 font-mono">Staff Floor View (Waiter)</div>;
export const StaffTableDetail = () => <div className="p-10 font-mono">Staff Table Detail (Order Entry)</div>;
