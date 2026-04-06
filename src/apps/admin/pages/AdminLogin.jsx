import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, TENANT_ID } from '../../../lib/supabase.js';
import { useAdminStore } from '../../../store/index.js';
import { Delete } from 'lucide-react';

export default function AdminLogin() {
  const [pin, setPin] = useState('');
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const login = useAdminStore(state => state.login);
  const navigate = useNavigate();

  useEffect(() => {
    if (pin.length === 4) {
      handleLogin();
    }
  }, [pin]);

  const handleLogin = async () => {
    setIsLoading(true);
    setIsError(false);
    
    try {
      // Query staff table
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('pin', pin)
        .eq('tenant_id', '11111111-1111-1111-1111-111111111111')
        .eq('is_active', true)
        .in('role', ['owner', 'manager'])
        .single();

      if (error || !data) {
        throw new Error('Invalid PIN or unauthorized role');
      }

      // Success
      login(data);
      navigate('/admin');
    } catch (err) {
      console.error('Login error:', err);
      setIsError(true);
      setPin(''); // Clear PIN
      // Remove shake class after animation completes
      setTimeout(() => setIsError(false), 500);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNumberClick = (num) => {
    if (pin.length < 4 && !isLoading) {
      setPin(prev => prev + num);
      setIsError(false);
    }
  };

  const handleBackspace = () => {
    if (!isLoading) {
      setPin(prev => prev.slice(0, -1));
      setIsError(false);
    }
  };

  const renderDots = () => {
    return (
      <div className="flex justify-center gap-4 mb-8">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className={`w-4 h-4 rounded-full border-2 transition-all ${
              index < pin.length 
                ? 'bg-[#D69E2E] border-[#D69E2E]' 
                : 'bg-transparent border-gray-400'
            }`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1A365D] selection:bg-[#D69E2E] selection:text-white font-body">
      <div 
        className={`bg-white p-10 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col items-center ${isError ? 'animate-shake' : ''}`}
      >
        <div className="mb-2 text-[#D69E2E] font-black tracking-widest text-xl">
          TABLEOS
        </div>
        <h1 className="text-2xl font-bold text-[#1A365D] mb-8">Admin Login</h1>

        {renderDots()}

        {isError && (
          <p className="text-red-500 text-sm font-semibold mb-4 animate-pulse">
            Invalid PIN. Try again.
          </p>
        )}
        
        {isLoading && !isError && (
          <p className="text-[#D69E2E] text-sm font-semibold mb-4 animate-pulse">
            Verifying...
          </p>
        )}
        
        {/* Numpad */}
        <div className="grid grid-cols-3 gap-4 w-full px-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => handleNumberClick(num.toString())}
              disabled={isLoading}
              className="h-16 rounded-xl bg-gray-50 text-2xl font-medium text-[#1A365D] border border-gray-200 hover:bg-gray-100 hover:border-[#D69E2E] active:bg-gray-200 transition-all cursor-pointer disabled:opacity-50"
            >
              {num}
            </button>
          ))}
          {/* Empty bottom-left cell */}
          <div />
          
          <button
            onClick={() => handleNumberClick('0')}
            disabled={isLoading}
            className="h-16 rounded-xl bg-gray-50 text-2xl font-medium text-[#1A365D] border border-gray-200 hover:bg-gray-100 hover:border-[#D69E2E] active:bg-gray-200 transition-all cursor-pointer disabled:opacity-50"
          >
            0
          </button>
          
          <button
            onClick={handleBackspace}
            disabled={isLoading || pin.length === 0}
            className="h-16 rounded-xl bg-gray-100 text-[#1A365D] flex items-center justify-center border border-gray-200 hover:bg-gray-200 hover:border-red-400 active:bg-gray-300 transition-all cursor-pointer disabled:opacity-50"
            aria-label="Backspace"
          >
            <Delete size={24} />
          </button>
        </div>
      </div>
      
      {/* Tailwind Shake Animation Definition inside index.css will be needed or inline style. Let's add it to index.css */}
    </div>
  );
}
