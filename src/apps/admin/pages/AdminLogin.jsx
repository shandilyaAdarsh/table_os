// src/apps/admin/AdminLogin.jsx
import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../../store/authStore'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const { login, isLoading, error } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  // Redirect to original destination after login, or default dashboard
  const from = location.state?.from?.pathname ?? '/admin'

  const handleSubmit = async () => {
    if (!email.trim()) return
    if (!password.trim()) return

    try {
      const result = await login({ email, password })
      if (result.success) {
        navigate(from, { replace: true })
      }
    } catch {
      // Error state is already set in auth store for UI display.
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      {/* Background subtle pattern */}
      <div className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, #D69E2E 1px, transparent 0)`,
          backgroundSize: '32px 32px'
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-400 mb-4">
            <span className="text-2xl font-black text-gray-900">T</span>
          </div>
          <h1 className="text-white text-2xl font-bold tracking-tight">TableOS Admin</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to your restaurant dashboard</p>
        </div>

        {/* Card */}
        <div className="bg-gray-900 rounded-3xl p-6 shadow-2xl border border-gray-800">

          {/* Email Field */}
          <div className="mb-6">
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="owner@yourrestaurant.com"
              className="w-full bg-gray-800 text-white placeholder-gray-600 px-4 py-3 rounded-xl border border-gray-700 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20 transition-all text-sm"
              autoComplete="email"
              autoFocus
            />
          </div>

          {/* Password Field */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="Enter your password"
                className="w-full bg-gray-800 text-white placeholder-gray-600 px-4 py-3 pr-24 rounded-xl border border-gray-700 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20 transition-all text-sm"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-200"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-900/40 border border-red-700/50 rounded-xl">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading || !email.trim() || !password.trim()}
            className="w-full h-12 rounded-xl bg-amber-400 text-gray-900 font-semibold hover:bg-amber-300 disabled:bg-gray-700 disabled:text-gray-500 transition-all"
          >
            {isLoading ? (
              <span className="inline-block w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
            ) : 'Sign In'}
          </button>

          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="w-full mt-4 text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            {showPassword ? 'Hide password' : 'Show password'}
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-700 text-xs mt-6">
          Forgot your PIN? Contact{' '}
          <span className="text-amber-600">support@tableos.in</span>
        </p>
      </div>
    </div>
  )
}
