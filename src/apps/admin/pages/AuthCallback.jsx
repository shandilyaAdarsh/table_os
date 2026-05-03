import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase.js';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth event:', event);
      if (event === 'SIGNED_IN' && session) {
        // Redirect to admin dashboard
        navigate('/admin');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1A365D] text-white">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-4 border-[#D69E2E] border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-lg font-medium animate-pulse font-mono uppercase tracking-widest">
          Authenticating...
        </p>
      </div>
    </div>
  );
}
