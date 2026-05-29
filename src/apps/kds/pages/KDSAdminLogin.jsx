import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../store/authStore';
import { Lock, Mail, AlertCircle, Loader2 } from 'lucide-react';

export default function KDSAdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const navigate = useNavigate();
  
  const login = useAuthStore((state) => state.login);
  const isLoading = useAuthStore((state) => state.isLoading);
  const globalError = useAuthStore((state) => state.error);
  const user = useAuthStore((state) => state.user);
  const tenantId = useAuthStore((state) => state.tenantId);

  // If already logged in to email/password session within 10 hours, bypass to PIN screen
  useEffect(() => {
    const loginTime = localStorage.getItem('kds_login_timestamp');
    const isSessionValid = loginTime && (Date.now() - Number(loginTime) < 10 * 60 * 60 * 1000);
    
    if (user && tenantId && isSessionValid) {
      navigate('/kds/login');
    }
  }, [user, tenantId, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    if (!email.trim() || !password.trim()) {
      setLocalError('Please fill in all fields.');
      return;
    }

    try {
      await login({ email: email.trim(), password: password.trim() });
      // Set the 10-hour login timestamp
      localStorage.setItem('kds_login_timestamp', String(Date.now()));
      navigate('/kds/login');
    } catch (err) {
      console.error('[KDSAdminLogin] Login failed:', err);
    }
  };

  const displayError = localError || globalError;

  return (
    <div style={{
      minHeight: '100vh',
      width: '100vw',
      background: '#F8F9FA',
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      color: '#1A1C1E',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      userSelect: 'none',
      overflow: 'hidden',
    }}>
      <div style={{
        width: '420px',
        background: '#FFFFFF',
        borderRadius: '24px',
        border: '1px solid #E6E8EA',
        boxShadow: '0 10px 30px rgba(26, 28, 30, 0.04), 0 1px 3px rgba(26, 28, 30, 0.02)',
        padding: '40px 32px',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{
            fontSize: '24px',
            fontWeight: 900,
            letterSpacing: '-0.04em',
            color: '#E31E24',
            margin: '0 0 8px 0',
            lineHeight: 1,
          }}>
            TableOS KDS
          </h1>
          <h2 style={{
            fontSize: '18px',
            fontWeight: 800,
            color: '#1A1C1E',
            margin: '16px 0 6px 0',
          }}>
            Restaurant Account Login
          </h2>
          <p style={{
            fontSize: '13px',
            fontWeight: 500,
            color: '#6C757D',
            margin: 0,
            lineHeight: 1.4,
          }}>
            Log in with your restaurant credentials to set up terminal session
          </p>
        </div>

        {/* Error Alert */}
        {displayError && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: '#FFF0F0',
            border: '1px solid #FECACA',
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '24px',
            color: '#E31E24',
            fontSize: '13px',
            fontWeight: 600,
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{displayError}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Email Field */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 800,
              color: '#6C757D',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '8px',
            }}>
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={18} style={{
                position: 'absolute',
                left: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#6C757D',
              }} />
              <input
                type="email"
                disabled={isLoading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="manager@restaurant.com"
                style={{
                  width: '100%',
                  padding: '14px 16px 14px 44px',
                  borderRadius: '12px',
                  border: '1px solid #E6E8EA',
                  background: '#F8F9FA',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#1A1C1E',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'all 0.2s',
                }}
                className="kds-login-input"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 800,
              color: '#6C757D',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '8px',
            }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{
                position: 'absolute',
                left: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#6C757D',
              }} />
              <input
                type="password"
                disabled={isLoading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '14px 16px 14px 44px',
                  borderRadius: '12px',
                  border: '1px solid #E6E8EA',
                  background: '#F8F9FA',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#1A1C1E',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'all 0.2s',
                }}
                className="kds-login-input"
              />
            </div>
          </div>

          {/* Inline styles for hover / focus inputs */}
          <style>{`
            .kds-login-input:focus {
              background-color: #FFFFFF !important;
              border-color: #E31E24 !important;
              box-shadow: 0 0 0 3px rgba(227, 30, 36, 0.08);
            }
            .kds-login-btn {
              transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .kds-login-btn:hover:not(:disabled) {
              background-color: #C41B20 !important;
              box-shadow: 0 4px 12px rgba(227, 30, 36, 0.15) !important;
            }
            .kds-login-btn:active:not(:disabled) {
              transform: scale(0.98);
            }
          `}</style>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="kds-login-btn"
            style={{
              width: '100%',
              height: '48px',
              borderRadius: '12px',
              background: '#E31E24',
              color: '#FFFFFF',
              fontSize: '15px',
              fontWeight: 700,
              border: 'none',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginTop: '12px',
              outline: 'none',
              boxShadow: '0 2px 4px rgba(227, 30, 36, 0.1)',
            }}
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Logging in...</span>
              </>
            ) : (
              <span>Authorize Terminal</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
