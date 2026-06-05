import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRuntimeIdentityStore } from '../../../store/runtimeIdentityStore';
import { useRuntimeAuthStore } from '../../../store/runtimeAuthStore';
import { resolveApiBaseUrl } from '../../../lib/resolveApiBaseUrl';

export function KDSLogin() {
  const navigate = useNavigate();
  const { setBranchId, setStaffId, deviceId } = useRuntimeIdentityStore();
  const { setRuntimeSession } = useRuntimeAuthStore();

  const [mode, setMode] = useState('loading'); // 'welcome', 'deviceRegistration', 'branchSelection', 'employeeId', 'pin'
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Device Registration State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [branches, setBranches] = useState([]);

  // Staff Login State
  const [employeeId, setEmployeeId] = useState('');
  const [pin, setPin] = useState('');
  
  const isRegistered = !!localStorage.getItem('kds_admin_access_token');

  useEffect(() => {
    setMode(isRegistered ? 'employeeId' : 'deviceRegistration');
  }, [isRegistered]);

  const handleDeviceRegistration = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const baseUrl = resolveApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          device_fingerprint: useRuntimeIdentityStore.getState().deviceId,
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || data?.error?.message || 'Registration failed');
      }

      const { access_token, refresh_token, device_session_id } = data.data;

      localStorage.setItem('kds_admin_access_token', access_token);
      if (refresh_token) localStorage.setItem('kds_admin_refresh_token', refresh_token);
      localStorage.setItem('kds_device_session_id', device_session_id);

      const deviceFingerprint = useRuntimeIdentityStore.getState().deviceId;
      const contextResponse = await fetch(`${baseUrl}/api/v1/context/bootstrap`, {
        headers: { 
          Authorization: `Bearer ${access_token}`,
          'X-Device-Fingerprint': deviceFingerprint
        }
      });
      
      const contextData = await contextResponse.json();
      if (!contextResponse.ok) {
        throw new Error(contextData?.message || 'Failed to fetch tenant context');
      }

      const fetchedTenantId = contextData.data.tenant.id;
      const fetchedTenantName = contextData.data.tenant?.name;
      const fetchedBranches = contextData.data.branches || [];

      localStorage.setItem('kds_tenant_id', fetchedTenantId);
      if (fetchedTenantName) localStorage.setItem('kds_tenant_name', fetchedTenantName);
      setBranches(fetchedBranches);
      setMode('branchSelection');
    } catch (err) {
      console.error('KDS Device Registration Error:', err);
      setError(err.message || 'An error occurred during registration');
    } finally {
      setLoading(false);
    }
  };

  const handleBranchSelection = (branchId) => {
    const branch = branches.find(b => b.id === branchId);
    localStorage.setItem('kds_branch_id', branchId);
    if (branch) localStorage.setItem('kds_branch_name', branch.name);
    setMode('employeeId');
  };

  const handleStaffLogin = async () => {
    setError(null);
    setLoading(true);

    try {
      let adminToken = localStorage.getItem('kds_admin_access_token');
      const deviceSessionId = localStorage.getItem('kds_device_session_id');
      const savedTenantId = localStorage.getItem('kds_tenant_id');
      const savedBranchId = localStorage.getItem('kds_branch_id');

      if (!adminToken) throw new Error('Device not registered');

      const baseUrl = resolveApiBaseUrl();
      const deviceFingerprint = useRuntimeIdentityStore.getState().deviceId;

      let staffRes = await fetch(`${baseUrl}/api/v1/tenants/${savedTenantId}/staff`, {
        headers: { 
          Authorization: `Bearer ${adminToken}`,
          'X-Device-Fingerprint': deviceFingerprint
        }
      });
      
      if (staffRes.status === 401) {
        const refreshToken = localStorage.getItem('kds_admin_refresh_token');
        if (!refreshToken) {
          resetRegistration();
          throw new Error('Session expired. Please re-register this device.');
        }
        const refreshReq = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Device-Session-Id': deviceSessionId
          },
          body: JSON.stringify({
            refresh_token: refreshToken,
            device_fingerprint: deviceFingerprint
          })
        });
        const refreshData = await refreshReq.json();
        if (!refreshReq.ok) {
          resetRegistration();
          throw new Error('Session expired. Please re-register this device.');
        }
        
        adminToken = refreshData.data.access_token;
        localStorage.setItem('kds_admin_access_token', adminToken);
        if (refreshData.data.refresh_token) {
          localStorage.setItem('kds_admin_refresh_token', refreshData.data.refresh_token);
        }
        
        staffRes = await fetch(`${baseUrl}/api/v1/tenants/${savedTenantId}/staff`, {
          headers: { 
            Authorization: `Bearer ${adminToken}`,
            'X-Device-Fingerprint': deviceFingerprint
          }
        });
      }

      const staffData = await staffRes.json();
      if (!staffRes.ok) throw new Error('Failed to fetch staff list');

      const staffList = staffData.data || [];
      const matchedStaff = staffList.find(s => 
        (s.employee_id === employeeId || s.id === employeeId) && 
        s.pin === pin
      );

      if (!matchedStaff) {
        setPin(''); // Reset PIN on failure
        throw new Error('Invalid Employee ID or PIN');
      }

      const exchangeRes = await fetch(`${baseUrl}/api/v1/auth/runtime/exchange`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`,
          'X-Device-Session-Id': deviceSessionId,
          'X-Device-Fingerprint': deviceFingerprint
        },
        body: JSON.stringify({ branch_id: savedBranchId })
      });
      const exchangeData = await exchangeRes.json();

      if (!exchangeRes.ok) {
        throw new Error(exchangeData?.message || 'Failed to initialize session');
      }

      const { runtime_token } = exchangeData.data;

      setRuntimeSession(runtime_token, matchedStaff);
      setBranchId(savedBranchId);
      setStaffId(matchedStaff.id);
      localStorage.setItem('kds_staff_name', `${matchedStaff.first_name || ''} ${matchedStaff.last_name || ''}`.trim());
      localStorage.setItem('kds_staff_role', matchedStaff.role || 'Kitchen Staff');
      
      navigate('/kds');
    } catch (err) {
      console.error('KDS Staff Login Error:', err);
      setError(err.message || 'An error occurred during staff login');
    } finally {
      setLoading(false);
    }
  };

  const resetRegistration = () => {
    localStorage.removeItem('kds_admin_access_token');
    localStorage.removeItem('kds_admin_refresh_token');
    localStorage.removeItem('kds_device_session_id');
    localStorage.removeItem('kds_tenant_id');
    localStorage.removeItem('kds_tenant_name');
    localStorage.removeItem('kds_branch_id');
    setMode('deviceRegistration');
  };

  const handleNumpadClick = (num) => {
    if (pin.length < 4) {
      setPin(prev => prev + num);
    }
  };

  const handleNumpadDelete = () => {
    setPin(prev => prev.slice(0, -1));
  };

  useEffect(() => {
    if (pin.length === 4) {
      handleStaffLogin();
    }
  }, [pin]);

  if (mode === 'loading') {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#e31e24] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen w-full flex flex-col lg:flex-row bg-white text-[#191c1d]" 
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      <style>{`
        .kds-glass-card {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(225, 227, 228, 0.7);
            box-shadow: 0 4px 24 rgba(0, 0, 0, 0.03);
        }
      `}</style>

      {/* Left Column: Welcome Showcase */}
      <div className="w-full lg:w-1/2 bg-[#f8f9fa] border-r border-[#edeeef] flex flex-col justify-between p-6 sm:p-10 lg:p-12 min-h-[50vh] lg:min-h-screen">
        {/* Top Branding logo */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-[#e31e24] rounded-lg flex items-center justify-center text-white shadow-sm">
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>point_of_sale</span>
          </div>
          <span className="text-[15px] font-bold tracking-tight text-[#191c1d]">Orderlyy KDS</span>
        </div>

        {/* Title and Mockup showcase */}
        <div className="flex-1 flex flex-col items-center justify-center -mt-8 space-y-8">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-center max-w-xl leading-tight tracking-tight text-[#1a1a1a]">
            Welcome to Orderlyy KDS – <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#e31e24] to-[#ff4b4b]">Your Smart Kitchen Companion</span>
          </h1>
          
          <p className="text-base sm:text-lg text-[#5d5e61] text-center max-w-md font-medium leading-relaxed">
            Cook faster, prep smarter, and deliver exceptional culinary experiences.
          </p>

          <div className="w-full max-w-sm sm:max-w-md mx-auto relative pt-4">
            {/* Subtle glow behind image */}
            <div className="absolute inset-0 bg-[#e31e24]/5 blur-[60px] rounded-full z-0"></div>
            <img 
              src="/mobile-mockup.png" 
              alt="Mobile Mockup" 
              className="w-full h-auto object-contain relative z-10 drop-shadow-2xl transition-transform duration-700 hover:scale-[1.03]"
            />
          </div>
        </div>

        {/* Features list/grid (Compact) */}
        <div className="mt-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 lg:gap-3">
            <div className="kds-glass-card rounded-lg p-2.5 flex flex-col items-center text-center gap-1.5 transition-all duration-300">
              <span className="material-symbols-outlined text-[#e31e24] text-lg">receipt_long</span>
              <span className="text-[11px] font-bold text-[#191c1d]">Tickets</span>
            </div>
            <div className="kds-glass-card rounded-lg p-2.5 flex flex-col items-center text-center gap-1.5 transition-all duration-300">
              <span className="material-symbols-outlined text-[#e31e24] text-lg">alt_route</span>
              <span className="text-[11px] font-bold text-[#191c1d]">Routing</span>
            </div>
            <div className="kds-glass-card rounded-lg p-2.5 flex flex-col items-center text-center gap-1.5 transition-all duration-300">
              <span className="material-symbols-outlined text-[#e31e24] text-lg">timer</span>
              <span className="text-[11px] font-bold text-[#191c1d]">Timers</span>
            </div>
            <div className="kds-glass-card rounded-lg p-2.5 flex flex-col items-center text-center gap-1.5 transition-all duration-300">
              <span className="material-symbols-outlined text-[#e31e24] text-lg">history</span>
              <span className="text-[11px] font-bold text-[#191c1d]">Recalls</span>
            </div>
            <div className="kds-glass-card rounded-lg p-2.5 flex flex-col items-center text-center gap-1.5 transition-all duration-300 col-span-2 sm:col-span-1">
              <span className="material-symbols-outlined text-[#e31e24] text-lg">visibility</span>
              <span className="text-[11px] font-bold text-[#191c1d]">Expedite</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Interactive Gate */}
      <div className="w-full lg:w-1/2 bg-[#e31e24] flex flex-col justify-center items-center p-6 sm:p-10 lg:p-12 min-h-[50vh] lg:min-h-screen relative overflow-hidden">
        {/* Subtle decorative shapes in red background */}
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-[#ba0013]/30 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-[#ffdad6]/10 rounded-full blur-[100px] pointer-events-none" />

        {/* Dynamic Card Container (White Box) */}
        <div className="max-w-[420px] w-full bg-white rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.08)] p-8 sm:p-10 relative z-10">
          
          {/* Card Header (Error and Title) */}
          <div className="text-center mb-8 relative">
            {/* Show Back arrow for PIN mode */}
            {mode === 'pin' && (
              <button 
                onClick={() => { setError(null); setMode('employeeId'); }} 
                className="absolute -left-2 top-0 text-[#8c8d8f] hover:text-[#1a1a1a] hover:bg-gray-100 p-2 rounded-full transition-all"
              >
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
            )}
            
            {mode === 'deviceRegistration' && (
              <div className="flex justify-center mb-5">
                <div className="w-14 h-14 bg-[#f0f2f5] rounded-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#5d5e61] text-[26px]">devices</span>
                </div>
              </div>
            )}
            <h2 className="text-[24px] sm:text-[26px] font-bold text-[#191c1d] tracking-tight">
              {mode === 'deviceRegistration' && 'Admin Device Registration'}
              {mode === 'branchSelection' && 'Select Branch'}
              {mode === 'employeeId' && 'Staff Login'}
              {mode === 'pin' && 'Enter PIN'}
            </h2>
            
            <p className="text-[14px] text-[#5d5e61] mt-2">
              {mode === 'deviceRegistration' && "Register this terminal to your restaurant's kitchen network."}
              {mode === 'branchSelection' && 'Assign this device to a default kitchen branch.'}
              {mode === 'employeeId' && 'Enter your unique staff ID to start shift.'}
              {mode === 'pin' && 'Enter your 4-digit security PIN.'}
            </p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-[#e31e24] p-3.5 rounded-xl text-[13px] font-semibold mt-5 text-center flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[18px]">error</span>
                {error}
              </div>
            )}
          </div>

          {/* Card Body */}
          <div className="mt-2">
            {/* Mode: Device Registration */}
            {mode === 'deviceRegistration' && (
              <form onSubmit={handleDeviceRegistration} className="space-y-4 text-left">
                <div>
                  <label className="block text-[12px] font-bold text-[#191c1d] mb-1.5 ml-1">Admin Email</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#8c8d8f]">
                      <span className="material-symbols-outlined text-[20px]">mail</span>
                    </div>
                    <input 
                      type="email" 
                      required 
                      value={email} 
                      onChange={(e) => setEmail(e.target.value)} 
                      className="w-full bg-white border border-[#e1e3e5] focus:border-[#e31e24] rounded-xl pl-12 pr-4 py-3.5 text-[14px] text-[#191c1d] focus:outline-none transition-colors placeholder-[#a0a1a3]" 
                      placeholder="admin@restaurant.com" 
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-[#191c1d] mb-1.5 ml-1">Password</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#8c8d8f]">
                      <span className="material-symbols-outlined text-[20px]">lock</span>
                    </div>
                    <input 
                      type="password" 
                      required 
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)} 
                      className="w-full bg-white border border-[#e1e3e5] focus:border-[#e31e24] rounded-xl pl-12 pr-4 py-3.5 text-[14px] text-[#191c1d] focus:outline-none transition-colors placeholder-[#a0a1a3] tracking-widest" 
                      placeholder="••••••••" 
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-[#191c1d] mb-1.5 ml-1">Terminal ID</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#8c8d8f]/70">
                      <span className="material-symbols-outlined text-[20px]">tag</span>
                    </div>
                    <input 
                      type="text" 
                      readOnly
                      value={`KDS-TER-${(deviceId || '9042').substring(0, 6).toUpperCase()}`}
                      className="w-full bg-[#f3f4f6] border border-[#e1e3e5] rounded-xl pl-12 pr-4 py-3.5 text-[14px] font-semibold text-[#5d5e61] focus:outline-none cursor-not-allowed select-none" 
                    />
                  </div>
                </div>
                <button 
                  type="submit" 
                  disabled={loading} 
                  className="w-full bg-[#e31e24] hover:bg-[#ba0013] active:bg-[#a00010] disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-colors mt-8 text-[15px] flex items-center justify-center gap-2 shadow-sm"
                >
                  <span className="material-symbols-outlined text-[20px]">person_add</span>
                  {loading ? 'Registering...' : 'Register Device'}
                </button>
                <div className="text-center pt-6">
                  <p className="text-[13px] text-[#5d5e61]">
                    Need help? <a href="#" className="font-bold text-[#e31e24] hover:underline">Contact IT Support</a>
                  </p>
                </div>
              </form>
            )}

            {/* Mode: Branch Selection */}
            {mode === 'branchSelection' && (
              <div className="space-y-3 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar">
                {branches.map(b => (
                  <button 
                    key={b.id} 
                    onClick={() => handleBranchSelection(b.id)} 
                    className="w-full bg-white hover:bg-[#f8f9fa] border border-[#e1e3e5] hover:border-[#e31e24]/40 text-[#191c1d] font-bold py-4 px-5 rounded-xl transition-all flex items-center justify-between group shadow-sm text-[15px]"
                  >
                    <span>{b.name}</span>
                    <span className="material-symbols-outlined text-[#e31e24] transition-transform group-hover:translate-x-1 bg-[#e31e24]/5 p-1 rounded-full">chevron_right</span>
                  </button>
                ))}
                {branches.length === 0 && (
                  <p className="text-[#8c8d8f] text-center py-6 text-[14px]">No branches found for this account.</p>
                )}
              </div>
            )}

            {/* Mode: Employee ID */}
            {mode === 'employeeId' && (
              <form onSubmit={(e) => { e.preventDefault(); setPin(''); setMode('pin'); }} className="space-y-6">
                <div>
                  <label className="block text-[13px] font-bold text-[#191c1d] mb-2 text-center">Employee ID</label>
                  <input 
                    type="text" 
                    required 
                    value={employeeId} 
                    onChange={(e) => setEmployeeId(e.target.value)} 
                    className="w-full bg-white border border-[#e1e3e5] focus:border-[#e31e24] rounded-xl px-4 py-4 text-center text-xl font-bold tracking-wider text-[#191c1d] focus:outline-none transition-colors" 
                    placeholder="Enter Staff ID" 
                    autoFocus 
                  />
                </div>
                <button 
                  type="submit" 
                  className="w-full bg-[#e31e24] hover:bg-[#ba0013] active:bg-[#a00010] text-white font-bold py-4 rounded-xl transition-colors mt-8 text-[15px] shadow-sm"
                >
                  Continue
                </button>
                <div className="text-center mt-8 border-t border-[#f0f2f5] pt-6">
                  <button
                    type="button"
                    onClick={() => { setError(null); resetRegistration(); }}
                    className="text-[13px] font-bold text-[#5d5e61] hover:text-[#e31e24] transition-colors flex items-center justify-center gap-1.5 mx-auto"
                  >
                    <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                    Re-register this device
                  </button>
                </div>
              </form>
            )}

            {/* Mode: PIN */}
            {mode === 'pin' && (
              <div className="space-y-6">
                <div className="flex justify-center gap-4 py-2">
                  {[...Array(4)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${i < pin.length ? 'bg-[#e31e24] scale-110' : 'bg-[#edeeef]'}`} 
                    />
                  ))}
                </div>
                
                {loading && (
                  <p className="text-center text-xs font-semibold text-[#e31e24] animate-pulse">
                    Authenticating PIN...
                  </p>
                )}

                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                    <button 
                      key={num} 
                      onClick={() => handleNumpadClick(num.toString())} 
                      className="bg-[#f8f9fa] hover:bg-[#edeeef] active:scale-95 text-[#191c1d] text-xl font-bold h-12 sm:h-14 rounded-xl transition-all shadow-sm border border-[#edeeef]/60"
                    >
                      {num}
                    </button>
                  ))}
                  <div />
                  <button 
                    onClick={() => handleNumpadClick('0')} 
                    className="bg-[#f8f9fa] hover:bg-[#edeeef] active:scale-95 text-[#191c1d] text-xl font-bold h-12 sm:h-14 rounded-xl transition-all shadow-sm border border-[#edeeef]/60"
                  >
                    0
                  </button>
                  <button 
                    onClick={handleNumpadDelete} 
                    className="bg-[#f8f9fa] hover:bg-[#edeeef] active:scale-95 text-[#5d5e61] flex items-center justify-center h-12 sm:h-14 rounded-xl transition-all shadow-sm border border-[#edeeef]/60"
                  >
                    <span className="material-symbols-outlined text-xl">backspace</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Micro footer under card */}
        <p className="text-[11px] text-white/60 absolute bottom-6 z-10 text-center">
          Orderlyy KDS Terminal • One system for all your kitchen needs.
        </p>
      </div>
    </div>
  );
}
