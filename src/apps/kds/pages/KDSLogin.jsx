import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRuntimeIdentityStore } from '../../../store/runtimeIdentityStore';
import { useRuntimeAuthStore } from '../../../store/runtimeAuthStore';
import { resolveApiBaseUrl } from '../../../lib/resolveApiBaseUrl';

export function KDSLogin() {
  const navigate = useNavigate();
  const { setBranchId, setStaffId } = useRuntimeIdentityStore();
  const { setRuntimeSession } = useRuntimeAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [branchId, setBranchIdInput] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const baseUrl = resolveApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/v1/kds/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          tenantId: tenantId || undefined,
          branchId,
          device_fingerprint: useRuntimeIdentityStore.getState().deviceId,
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || 'Login failed');
      }

      const { runtime_token, user } = data.data;

      setRuntimeSession(runtime_token, user);
      setBranchId(user.branchId);
      setStaffId(user.id);
      
      // Navigate to KDS dashboard on success
      navigate('/kds');
    } catch (err) {
      console.error('KDS Login Error:', err);
      setError(err.message || 'An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-neutral-800 rounded-2xl shadow-xl overflow-hidden border border-neutral-700">
        <div className="p-8 text-center border-b border-neutral-700 bg-neutral-800">
          <h1 className="text-2xl font-bold text-white mb-2">Orderlli KDS</h1>
          <p className="text-neutral-400">Kitchen Display System Login</p>
        </div>

        <form onSubmit={handleLogin} className="p-8 space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-xl text-sm text-center">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                placeholder="staff@restaurant.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                placeholder="••••••••"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-1">Tenant ID (Optional)</label>
              <input
                type="text"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                placeholder="UUID"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-1">Branch ID</label>
              <input
                type="text"
                required
                value={branchId}
                onChange={(e) => setBranchIdInput(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                placeholder="UUID"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-colors mt-6 shadow-lg shadow-amber-500/20"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
