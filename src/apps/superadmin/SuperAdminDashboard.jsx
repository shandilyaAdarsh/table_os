import React from 'react';
import { Link } from 'react-router-dom';

export default function SuperAdminDashboard() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-black text-amber-500 font-mono mb-8">DASHBOARD</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link to="/superadmin/onboard" className="bg-gray-900 p-6 rounded-2xl border border-gray-800 hover:border-amber-500 transition-colors">
          <h2 className="text-xl font-bold mb-2">New Onboarding</h2>
          <p className="text-gray-400 text-sm">Provision a new restaurant tenant.</p>
        </Link>
        <Link to="/superadmin/tenants" className="bg-gray-900 p-6 rounded-2xl border border-gray-800 hover:border-amber-500 transition-colors">
          <h2 className="text-xl font-bold mb-2">Manage Tenants</h2>
          <p className="text-gray-400 text-sm">View and manage existing restaurant networks.</p>
        </Link>
      </div>
    </div>
  );
}
