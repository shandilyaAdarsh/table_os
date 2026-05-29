import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKdsIdentityStore } from '../../../store/kdsIdentityStore.js';
import { useAuthStore } from '../../../store/authStore.js';
import { ArrowRight, Delete, X, Circle } from 'lucide-react';

export default function KDSLogin() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const navigate = useNavigate();
  const { stationId } = useKdsIdentityStore();
  
  const user = useAuthStore((state) => state.user);
  const tenantId = useAuthStore((state) => state.tenantId);

  // Verify that the email/password session is authenticated and active within 10 hours
  useEffect(() => {
    const loginTime = localStorage.getItem('kds_login_timestamp');
    const isSessionValid = loginTime && (Date.now() - Number(loginTime) < 10 * 60 * 60 * 1000);
    
    if (!user || !tenantId || !isSessionValid) {
      useAuthStore.getState().logout();
      navigate('/kds/admin-login');
      return;
    }

    if (sessionStorage.getItem('kds_authenticated') === 'true') {
      navigate('/kds');
    }
  }, [user, tenantId, navigate]);

  const handleKeyPress = (num) => {
    if (isLocked) return;
    if (pin.length < 4) {
      setError(false);
      setPin((prev) => prev + num);
    }
  };

  const handleClear = () => {
    if (isLocked) return;
    setPin('');
    setError(false);
  };

  const handleBackspace = () => {
    if (isLocked) return;
    setPin((prev) => prev.slice(0, -1));
    setError(false);
  };

  const handleSubmit = () => {
    if (pin.length !== 4 || isLocked) return;

    // Default prototype PIN is 1234
    if (pin === '1234') {
      sessionStorage.setItem('kds_authenticated', 'true');
      navigate('/kds');
    } else {
      setError(true);
      setPin('');
      // Shake animation effect could be triggered here; we'll reset pin on error
      setIsLocked(true);
      setTimeout(() => {
        setIsLocked(false);
      }, 600); // Short lock to prevent rapid spamming and let error render
    }
  };

  // Keyboard support for convenience
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isLocked) return;
      if (e.key >= '0' && e.key <= '9') {
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape' || e.key === 'c' || e.key === 'C') {
        handleClear();
      } else if (e.key === 'Enter') {
        handleSubmit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, isLocked]);

  // Auto-submit when 4 digits are entered
  useEffect(() => {
    if (pin.length === 4) {
      const timer = setTimeout(() => {
        handleSubmit();
      }, 150); // Small delay so the user can see the last dot fill
      return () => clearTimeout(timer);
    }
  }, [pin]);

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
        alignItems: 'center',
        position: 'relative',
      }}>
        {/* Logo / Header */}
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
          textAlign: 'center',
        }}>
          Staff Authorization
        </h2>
        
        <p style={{
          fontSize: '13px',
          fontWeight: 500,
          color: '#6C757D',
          margin: '0 0 32px 0',
          textAlign: 'center',
          lineHeight: 1.4,
        }}>
          Enter your 4-digit PIN (1234) to access system {stationId ? `(${stationId})` : ''}
        </p>

        {/* PIN Indicators */}
        <div style={{
          display: 'flex',
          gap: '16px',
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: '20px',
          height: '24px',
        }}>
          {[0, 1, 2, 3].map((index) => {
            const isActive = pin.length > index;
            return (
              <div
                key={index}
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  border: `2px solid ${error ? '#E31E24' : isActive ? '#E31E24' : '#E6E8EA'}`,
                  background: error ? '#E31E24' : isActive ? '#E31E24' : 'transparent',
                  transform: isActive ? 'scale(1.15)' : 'scale(1)',
                  transition: 'all 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
              />
            );
          })}
        </div>

        {/* Error Message Space */}
        <div style={{
          height: '20px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {error && (
            <p style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#E31E24',
              margin: 0,
              animation: 'shake 0.3s ease-in-out',
            }}>
              Incorrect PIN. Access Denied.
            </p>
          )}
        </div>

        {/* CSS Keyframe Animations Inline */}
        <style>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-6px); }
            75% { transform: translateX(6px); }
          }
          .kds-keypad-btn {
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            border: 1px solid transparent;
          }
          .kds-keypad-btn:hover {
            background-color: #FFF0F0 !important;
            color: #E31E24 !important;
            border-color: #FECACA !important;
          }
          .kds-keypad-btn:active {
            transform: scale(0.92);
            background-color: #FECACA !important;
          }
        `}</style>

        {/* 3x4 Keypad Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
          width: '100%',
          maxWidth: '300px',
        }}>
          {/* Numbers 1-9 */}
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => handleKeyPress(String(num))}
              className="kds-keypad-btn"
              style={{
                height: '68px',
                borderRadius: '16px',
                background: '#F8F9FA',
                border: '1px solid #E6E8EA',
                color: '#1A1C1E',
                fontSize: '22px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                outline: 'none',
              }}
            >
              {num}
            </button>
          ))}

          {/* Clear Button */}
          <button
            onClick={handleClear}
            className="kds-keypad-btn"
            style={{
              height: '68px',
              borderRadius: '16px',
              background: '#FFFFFF',
              border: '1px solid #E6E8EA',
              color: '#6C757D',
              fontSize: '12px',
              fontWeight: 800,
              letterSpacing: '0.05em',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
            }}
          >
            CLEAR
          </button>

          {/* Number 0 */}
          <button
            onClick={() => handleKeyPress('0')}
            className="kds-keypad-btn"
            style={{
              height: '68px',
              borderRadius: '16px',
              background: '#F8F9FA',
              border: '1px solid #E6E8EA',
              color: '#1A1C1E',
              fontSize: '22px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
            }}
          >
            0
          </button>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={pin.length !== 4}
            className="kds-keypad-btn"
            style={{
              height: '68px',
              borderRadius: '16px',
              background: pin.length === 4 ? '#E31E24' : '#F8F9FA',
              border: '1px solid #E6E8EA',
              color: pin.length === 4 ? '#FFFFFF' : '#D8DADC',
              cursor: pin.length === 4 ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
              opacity: pin.length === 4 ? 1 : 0.6,
            }}
          >
            <ArrowRight size={24} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
