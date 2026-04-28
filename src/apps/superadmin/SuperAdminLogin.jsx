import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function SuperAdminLogin() {
  const navigate = useNavigate();
  
  const handleLogin = (e) => {
    e.preventDefault();
    // For now, simple mock login
    navigate('/superadmin');
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl w-full max-w-sm">
        <h1 className="text-2xl font-black text-amber-500 mb-6 font-mono text-center">SUPERADMIN</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <input 
            type="password" 
            placeholder="Security Key" 
            className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500"
          />
          <button className="w-full bg-amber-500 text-black font-bold py-3 rounded-xl hover:bg-amber-400 transition-colors">
            ACCESS TERMINAL
          </button>
        </form>
      </div>
    </div>
  );
}
