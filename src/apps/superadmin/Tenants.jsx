import React from 'react';
import { Link, useParams } from 'react-router-dom';

export function TenantList() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-black text-amber-500 font-mono mb-8">TENANTS</h1>
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
        <p className="text-gray-400">Loading active networks...</p>
      </div>
    </div>
  );
}

export function TenantDetail() {
  const { id } = useParams();
  return (
    <div className="p-8">
      <Link to="/superadmin/tenants" className="text-amber-500 hover:text-amber-400 mb-4 inline-block">← Back to Tenants</Link>
      <h1 className="text-3xl font-black text-amber-500 font-mono mb-8">TENANT: {id}</h1>
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
        <p className="text-gray-400 italic">No details found for this network.</p>
      </div>
    </div>
  );
}
