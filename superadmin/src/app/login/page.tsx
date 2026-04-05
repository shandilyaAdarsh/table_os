'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'password' | 'enroll' | 'totp'>('password')
  const [qrCode, setQrCode] = useState('')
  const [enrollFactorId, setEnrollFactorId] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [factorId, setFactorId] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)

  const isLocked = lockedUntil && Date.now() < lockedUntil

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()

    // Rate limiting check
    if (isLocked) {
      const remaining = Math.ceil((lockedUntil! - Date.now()) / 60000)
      setError(`Too many attempts. Try again in ${remaining} minute(s).`)
      return
    }

    setLoading(true)
    setError('')

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        const newAttempts = attempts + 1
        setAttempts(newAttempts)
        if (newAttempts >= 5) {
          setLockedUntil(Date.now() + 5 * 60 * 1000)
          setError('Too many failed attempts. Locked for 5 minutes.')
        } else {
          setError(`Invalid credentials. ${5 - newAttempts} attempt(s) remaining.`)
        }
        return
      }

      // Check if MFA is required (AAL2 needed)
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

      if (aalData?.nextLevel === 'aal2' && aalData?.nextLevel !== aalData?.currentLevel) {
        // MFA enrolled — go to verify
        const { data: factorsData } = await supabase.auth.mfa.listFactors()
        const totpFactor = factorsData?.totp?.[0]
        if (!totpFactor) {
          setError('MFA factor not found. Contact administrator.')
          return
        }
        const { data: challengeData, error: challengeError } =
          await supabase.auth.mfa.challenge({ factorId: totpFactor.id })
        if (challengeError) {
          setError(challengeError.message)
          return
        }
        setFactorId(totpFactor.id)
        setChallengeId(challengeData.id)
        setAttempts(0)
        setStep('totp')
        return
      }

      // No MFA enrolled yet — start enrollment
      const { data: enrollData, error: enrollError } =
        await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'TableOS', friendlyName: 'TableOS Admin' })
      if (enrollError) {
        setError(enrollError.message)
        return
      }
      setQrCode(enrollData.totp.qr_code)
      setEnrollFactorId(enrollData.id)
      setAttempts(0)
      setStep('enroll')

    } catch (err) {
      setError('An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const handleTotpVerify = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isLocked) {
      const remaining = Math.ceil((lockedUntil! - Date.now()) / 60000)
      setError(`Too many attempts. Try again in ${remaining} minute(s).`)
      return
    }

    setLoading(true)
    setError('')

    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: totpCode,
      })

      if (error) {
        const newAttempts = attempts + 1
        setAttempts(newAttempts)
        if (newAttempts >= 5) {
          setLockedUntil(Date.now() + 5 * 60 * 1000)
          setError('Too many attempts. Locked for 5 minutes.')
        } else {
          setError(`Invalid code. ${5 - newAttempts} attempt(s) remaining.`)
        }
        setTotpCode('')
        return
      }

      await checkRoleAndRedirect()

    } catch (err) {
      setError('Verification failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleEnrollVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: enrollFactorId })
      if (challengeError) {
        setError(challengeError.message)
        return
      }
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enrollFactorId,
        challengeId: challengeData.id,
        code: totpCode,
      })
      if (verifyError) {
        setError('Invalid code. Make sure you scanned the QR code and try again.')
        setTotpCode('')
        return
      }
      await checkRoleAndRedirect()
    } catch (err) {
      setError('Enrollment failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const checkRoleAndRedirect = async () => {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setError('Session error. Please try again.')
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || profile.role !== 'superadmin') {
      await supabase.auth.signOut()
      setError('Access denied. This portal is restricted to SuperAdmins only.')
      setStep('password')
      return
    }

    router.push('/dashboard')
  }

  return (
    <main className="flex w-full h-screen overflow-hidden">
      {/* Subtle red glow */}
      <div className="fixed inset-0 red-glow pointer-events-none" />

      {/* LEFT: Editorial Branding (60%) */}
      <section className="hidden lg:flex lg:w-3/5 flex-col justify-between p-20 relative z-10">
        <div>
          {/* Editorial Typography */}
          <div className="space-y-0">
            <h1 className="text-[96px] font-extrabold leading-[0.9] tracking-tighter text-[#F5F5F5] block">
              Platform
            </h1>
            <h1 className="text-[96px] font-extrabold leading-[0.9] tracking-tighter text-[#F5F5F5] block">
              Control
            </h1>
            <h1 className="text-[96px] font-extrabold leading-[0.9] tracking-tighter text-[#C0272D] block">
              Center
            </h1>
          </div>
        </div>

        {/* Bottom footer metadata */}
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 bg-[#C0272D] rounded-full animate-pulse" />
          <p className="text-[11px] font-medium text-[#555555] uppercase tracking-[0.2em]">
            TableOS SuperAdmin · Restricted Access
          </p>
        </div>
      </section>

      {/* RIGHT: Login Terminal (40%) */}
      <section className="w-full lg:w-2/5 flex flex-col justify-center items-center px-8 lg:px-20 relative bg-[#131313]/40 backdrop-blur-sm">
        <div className="w-full max-w-md">
          {/* Login Card */}
          <div className="bg-[#141414] border border-[#2A2A2A] p-8 rounded-[12px] relative overflow-hidden">
            {/* Red top border accent */}
            <div className="absolute top-0 left-0 w-full h-[2px] bg-[#C0272D]" />

            {/* Header */}
            <div className="flex flex-col items-start mb-10">
              <div className="w-10 h-10 bg-[#C0272D] rounded-full flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(192,39,45,0.2)]">
                <span className="font-bold text-white text-sm tracking-tighter">TS</span>
              </div>
              <h2 className="text-2xl font-bold text-[#F5F5F5] tracking-tight">Welcome back</h2>
              <p className="text-xs font-semibold text-[#C0272D]/80 uppercase tracking-widest mt-1">
                Superadmin access only
              </p>
            </div>

            {step === 'password' ? (
              <form className="space-y-5" onSubmit={handleLogin}>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[#555555] uppercase tracking-widest block ml-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    placeholder="admin@tableos.io"
                    className="w-full h-[44px] bg-[#0E0E0E] border border-[#2A2A2A] rounded-[12px] px-4 text-sm text-[#F5F5F5] placeholder:text-[#333333] focus:outline-none focus:ring-1 focus:ring-[#C0272D]/50 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[#555555] uppercase tracking-widest block ml-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder="••••••••••••"
                    className="w-full h-[44px] bg-[#0E0E0E] border border-[#2A2A2A] rounded-[12px] px-4 text-sm text-[#F5F5F5] placeholder:text-[#333333] focus:outline-none focus:ring-1 focus:ring-[#C0272D]/50 transition-all"
                  />
                </div>

                {error && (
                  <p className="text-xs text-[#C0272D] font-medium">{error}</p>
                )}

                <div className="pt-2 space-y-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-[44px] bg-[#C0272D] hover:bg-[#A31D23] text-white font-bold text-sm rounded-[12px] transition-all active:scale-[0.98] shadow-[0_0_20px_rgba(192,39,45,0.2)] disabled:opacity-60"
                  >
                    {loading ? 'Authenticating...' : 'Access Terminal'}
                  </button>
                  <p className="text-[11px] text-center text-[#888888]">
                    Forgot password? Contact system administrator
                  </p>
                </div>
              </form>
            ) : step === 'enroll' ? (
              <form className="space-y-5" onSubmit={handleEnrollVerify}>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-[#C0272D]/10 border border-[#C0272D]/30 rounded-lg flex items-center justify-center">
                      <span className="text-[#C0272D] text-sm">📱</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#F5F5F5]">Set Up 2FA</p>
                      <p className="text-xs text-[#555555]">Scan with Google Authenticator</p>
                    </div>
                  </div>
                  <div className="flex justify-center bg-white rounded-xl p-3">
                    <img src={qrCode} alt="Scan this QR code" className="w-40 h-40" />
                  </div>
                  <p className="text-[10px] text-[#555555] text-center">
                    Scan the QR code above, then enter the 6-digit code shown in the app
                  </p>
                  <div>
                    <label className="text-[10px] font-bold text-[#555555] uppercase tracking-widest block ml-1 mb-1">
                      Authenticator Code
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={totpCode}
                      onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000"
                      autoFocus
                      className="w-full h-[44px] bg-[#0E0E0E] border border-[#2A2A2A] rounded-[12px] px-4 text-sm text-[#F5F5F5] placeholder:text-[#333333] focus:outline-none focus:ring-1 focus:ring-[#C0272D]/50 transition-all font-mono tracking-[0.5em] text-center"
                    />
                  </div>
                </div>
                {error && (
                  <p className="text-xs text-[#C0272D] font-medium">{error}</p>
                )}
                <div className="pt-2 space-y-3">
                  <button
                    type="submit"
                    disabled={loading || totpCode.length !== 6}
                    className="w-full h-[44px] bg-[#C0272D] hover:bg-[#A31D23] text-white font-bold text-sm rounded-[12px] transition-all active:scale-[0.98] shadow-[0_0_20px_rgba(192,39,45,0.2)] disabled:opacity-60"
                  >
                    {loading ? 'Activating...' : 'Activate 2FA & Enter'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setStep('password'); setError(''); setTotpCode(''); setQrCode('') }}
                    className="w-full text-[11px] text-center text-[#555555] hover:text-[#888888] transition-colors"
                  >
                    ← Back to login
                  </button>
                </div>
              </form>
            ) : (
              <form className="space-y-5" onSubmit={handleTotpVerify}>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-8 h-8 bg-[#C0272D]/10 border border-[#C0272D]/30 rounded-lg flex items-center justify-center">
                      <span className="text-[#C0272D] text-sm">🔐</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#F5F5F5]">
                        Two-Factor Authentication
                      </p>
                      <p className="text-xs text-[#555555]">
                        Open Google Authenticator and enter the code
                      </p>
                    </div>
                  </div>
                  <label className="text-[10px] font-bold text-[#555555] uppercase tracking-widest block ml-1">
                    Authenticator Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={totpCode}
                    onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    autoFocus
                    className="w-full h-[44px] bg-[#0E0E0E] border border-[#2A2A2A] rounded-[12px] px-4 text-sm text-[#F5F5F5] placeholder:text-[#333333] focus:outline-none focus:ring-1 focus:ring-[#C0272D]/50 transition-all font-mono tracking-[0.5em] text-center"
                  />
                </div>

                {error && (
                  <p className="text-xs text-[#C0272D] font-medium">{error}</p>
                )}

                <div className="pt-2 space-y-3">
                  <button
                    type="submit"
                    disabled={loading || totpCode.length !== 6}
                    className="w-full h-[44px] bg-[#C0272D] hover:bg-[#A31D23] text-white font-bold text-sm rounded-[12px] transition-all active:scale-[0.98] shadow-[0_0_20px_rgba(192,39,45,0.2)] disabled:opacity-60"
                  >
                    {loading ? 'Verifying...' : 'Verify & Enter'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setStep('password'); setError(''); setTotpCode('') }}
                    className="w-full text-[11px] text-center text-[#555555] hover:text-[#888888] transition-colors"
                  >
                    ← Back to login
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Footer */}
          <div className="mt-8 text-center space-y-1">
            <div className="flex justify-center gap-4 pt-4">
              <a href="#" className="text-[10px] font-semibold text-[#333333] hover:text-[#C0272D] transition-colors uppercase tracking-widest">Privacy</a>
              <a href="#" className="text-[10px] font-semibold text-[#333333] hover:text-[#C0272D] transition-colors uppercase tracking-widest">Terms</a>
              <a href="#" className="text-[10px] font-semibold text-[#333333] hover:text-[#C0272D] transition-colors uppercase tracking-widest">System Status</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
