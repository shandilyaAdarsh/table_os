'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Plan = 'starter' | 'pro' | 'enterprise'

const planLabels: Record<Plan, string> = {
  starter: 'Starter Tier',
  pro: 'Professional Tier',
  enterprise: 'Enterprise Tier',
}

interface FormData {
  restaurantName: string
  phone: string
  tables: string
  location: string
  openTime: string
  closeTime: string
  plan: Plan
  ownerName: string
  ownerEmail: string
  pin: string
  billingCycle: 'demo' | 'monthly' | 'yearly'
}

const defaultForm: FormData = {
  restaurantName: '',
  phone: '',
  tables: '',
  location: '',
  openTime: '',
  closeTime: '',
  plan: 'pro',
  ownerName: '',
  ownerEmail: '',
  pin: '',
  billingCycle: 'monthly',
}

interface SuccessData {
  tenantName: string
  adminEmail: string
  devCredentials?: {
    email: string
    password?: string
  }
}

export default function OnboardPage() {
  const router = useRouter()
  const [formData, setFormData] = useState<FormData>(defaultForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [showSuccess, setShowSuccess] = useState(false)
  const [successData, setSuccessData] = useState<SuccessData | null>(null)
  const [emailDeliveryFailed, setEmailDeliveryFailed] = useState(false)

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(f => ({ ...f, [field]: e.target.value }))
    setFieldErrors(fe => ({ ...fe, [field]: '' }))
    setSubmitError('')
  }

  const setPlan = (plan: Plan) => {
    setFormData(f => ({ ...f, plan }))
  }

  const validate = (): boolean => {
    const errors: Partial<Record<keyof FormData, string>> = {}
    if (!formData.restaurantName.trim()) errors.restaurantName = 'Required'
    if (!formData.location.trim()) errors.location = 'Required'
    if (!formData.phone.trim()) errors.phone = 'Required'
    if (!formData.ownerName.trim()) errors.ownerName = 'Required'
    if (!formData.ownerEmail.trim()) errors.ownerEmail = 'Required'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.ownerEmail)) errors.ownerEmail = 'Invalid format'
    if (!formData.pin.trim()) errors.pin = 'Required'
    if (!/^\d{4}$/.test(formData.pin)) errors.pin = 'Must be 4 digits'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async () => {
    setSubmitError('')
    setEmailDeliveryFailed(false)
    if (!validate()) {
      setSubmitError('System validation failed. Verify highlighted parameters.')
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        restaurantName: formData.restaurantName,
        location: formData.location,
        phone: formData.phone,
        tables: parseInt(formData.tables) || 15,
        plan: formData.plan,
        ownerName: formData.ownerName,
        ownerEmail: formData.ownerEmail,
        pin: formData.pin,
        billingCycle: formData.billingCycle,
      }

      const response = await fetch('/api/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (!response.ok) {
        setSubmitError(result?.error || 'Node deployment failed.')
        return
      }

      if (result.success) {
        setSuccessData({
          tenantName: formData.restaurantName,
          adminEmail: formData.ownerEmail,
          devCredentials: result.dev_credentials,
        })
        if (result.email_sent === false) {
          setEmailDeliveryFailed(true)
        }
        setShowSuccess(true)
      } else {
        setSubmitError(result.error || 'Node deployment failed.')
      }
    } catch (err) {
      setSubmitError('Uplink error. System unreachable.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputCls = (field: keyof FormData) => `
    w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl px-4 py-4 text-sm text-[#F5F5F5] 
    focus:outline-none focus:border-[#C0272D]/50 focus:ring-1 focus:ring-[#C0272D]/30 transition-all placeholder:text-[#333] placeholder:uppercase placeholder:tracking-widest
    ${fieldErrors[field] ? 'border-[#C0272D] shadow-[0_0_10px_rgba(192,39,45,0.1)]' : ''}
  `

  return (
    <div className="p-8 max-w-[1440px] w-full mx-auto space-y-12 pb-24 bg-[#131313] min-h-screen">
      
      {/* Header Section */}
      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tighter text-[#F5F5F5]">Infrastructure Provisioning</h1>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-[#C0272D] rounded-full" />
            <p className="text-[10px] font-bold text-[#555555] uppercase tracking-[0.2em]">Deploying new restaurant node to global cluster</p>
          </div>
        </div>
        <button
          onClick={() => router.back()}
          className="text-[#555] hover:text-[#F5F5F5] flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          Abort Operation
        </button>
      </div>

      <div className="grid grid-cols-12 gap-12">
        {/* Main Content */}
        <div className="col-span-12 lg:col-span-8 space-y-10">
          
          {/* Section 1: Core Specs */}
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-10 space-y-8 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-[#C0272D] opacity-40" />
            
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#C0272D1A] flex items-center justify-center text-[#C0272D] border border-[#C0272D33]">
                <span className="material-symbols-outlined text-lg">hub</span>
              </div>
              <h2 className="text-lg font-black uppercase tracking-widest text-[#F5F5F5]">Node Core Specifications</h2>
            </div>

            <div className="grid grid-cols-2 gap-8">
              <div className="col-span-2">
                <label className="block text-[9px] font-black uppercase tracking-[0.2em] text-[#555] mb-3">Public Node Identity (Restaurant Name)</label>
                <input 
                  className={inputCls('restaurantName')}
                  placeholder="e.g. OMNI DINING KITCHEN" 
                  value={formData.restaurantName}
                  onChange={set('restaurantName')}
                />
                {fieldErrors.restaurantName && <p className="text-[9px] font-bold text-[#C0272D] mt-2 uppercase tracking-widest">{fieldErrors.restaurantName}</p>}
              </div>
              
              <div className="col-span-1">
                <label className="block text-[9px] font-black uppercase tracking-[0.2em] text-[#555] mb-3">Communication Uplink (Phone)</label>
                <input 
                  className={`${inputCls('phone')} font-mono`}
                  placeholder="+91 000 000 0000" 
                  value={formData.phone}
                  onChange={set('phone')}
                />
                {fieldErrors.phone && <p className="text-[9px] font-bold text-[#C0272D] mt-2 uppercase tracking-widest">{fieldErrors.phone}</p>}
              </div>

              <div className="col-span-1">
                <label className="block text-[9px] font-black uppercase tracking-[0.2em] text-[#555] mb-3">Sub-Unit Count (Tables)</label>
                <input 
                  className={`${inputCls('tables')} font-mono`}
                  placeholder="24" 
                  type="number"
                  value={formData.tables}
                  onChange={set('tables')}
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[9px] font-black uppercase tracking-[0.2em] text-[#555] mb-3">Geospatial Coordinates (Address)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-[#333] text-lg">location_on</span>
                  <input 
                    className={`${inputCls('location')} pl-12`}
                    placeholder="Enter physical deployment address..." 
                    value={formData.location}
                    onChange={set('location')}
                  />
                </div>
                {fieldErrors.location && <p className="text-[9px] font-bold text-[#C0272D] mt-2 uppercase tracking-widest">{fieldErrors.location}</p>}
              </div>

              <div className="col-span-2">
                <label className="block text-[9px] font-black uppercase tracking-[0.2em] text-[#555] mb-3">Operational Window</label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-4 p-4 bg-[#0D0D0D] border border-[#2A2A2A] rounded-xl">
                    <span className="text-[9px] font-black text-[#333] uppercase">Startup</span>
                    <input className="bg-transparent border-none p-0 text-sm font-mono text-[#F5F5F5] focus:ring-0 w-full text-right" type="time" value={formData.openTime} onChange={set('openTime')} />
                  </div>
                  <div className="flex items-center gap-4 p-4 bg-[#0D0D0D] border border-[#2A2A2A] rounded-xl">
                    <span className="text-[9px] font-black text-[#333] uppercase">Shutdown</span>
                    <input className="bg-transparent border-none p-0 text-sm font-mono text-[#F5F5F5] focus:ring-0 w-full text-right" type="time" value={formData.closeTime} onChange={set('closeTime')} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Plan Selection */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#C0272D1A] flex items-center justify-center text-[#C0272D] border border-[#C0272D33]">
                  <span className="material-symbols-outlined text-lg">layers</span>
                </div>
                <h2 className="text-lg font-black uppercase tracking-widest text-[#F5F5F5]">Allocation Tier</h2>
              </div>

              <div className="flex bg-[#0D0D0D] rounded-xl p-1 border border-[#2A2A2A]">
                {(['demo', 'monthly', 'yearly'] as const).map((cycle) => (
                  <button
                    key={cycle}
                    onClick={() => setFormData(f => ({ ...f, billingCycle: cycle }))}
                    className={`px-5 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                      formData.billingCycle === cycle 
                        ? 'bg-[#C0272D] text-white shadow-[0_0_15px_rgba(192,39,45,0.2)]' 
                        : 'text-[#555] hover:text-[#888]'
                    }`}
                  >
                    {cycle}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
              {(['starter', 'pro', 'enterprise'] as Plan[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlan(p)}
                  className={`p-8 rounded-2xl border transition-all text-left relative overflow-hidden group ${
                    formData.plan === p 
                      ? 'bg-[#1A1A1A] border-[#C0272D] shadow-[0_0_30px_rgba(192,39,45,0.1)]' 
                      : 'bg-[#0D0D0D] border-[#2A2A2A] hover:border-[#C0272D]/40'
                  }`}
                >
                  {p === 'pro' && (
                    <div className="absolute top-0 right-0 bg-[#C0272D] text-white text-[8px] font-black uppercase px-3 py-1 tracking-widest rounded-bl-xl">Recommended</div>
                  )}
                  <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${formData.plan === p ? 'text-[#C0272D]' : 'text-[#333]'}`}>{p}</p>
                  <p className="font-mono text-2xl font-black text-[#F5F5F5] mb-6">
                    {formData.billingCycle === 'demo' ? '₹0' : p === 'starter' ? '₹2,999' : p === 'pro' ? '₹5,999' : '₹11,999'}
                    <span className="text-[10px] font-bold text-[#333] ml-1">/MO</span>
                  </p>
                  <ul className="space-y-3 opacity-60">
                    <li className="flex items-center gap-2 text-[10px] font-bold text-[#F5F5F5] uppercase tracking-tighter">
                      <span className="material-symbols-outlined text-[14px] text-[#C0272D]">check</span>
                      {p === 'starter' ? '15 Nodes' : p === 'pro' ? 'Unlimited Nodes' : 'Global Cluster'}
                    </li>
                    <li className="flex items-center gap-2 text-[10px] font-bold text-[#F5F5F5] uppercase tracking-tighter">
                      <span className="material-symbols-outlined text-[14px] text-[#C0272D]">check</span>
                      {p === 'starter' ? 'Standard Analytics' : 'Real-time Telemetry'}
                    </li>
                  </ul>
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Authority Account */}
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-10 space-y-8 relative overflow-hidden">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#C0272D1A] flex items-center justify-center text-[#C0272D] border border-[#C0272D33]">
                <span className="material-symbols-outlined text-lg">admin_panel_settings</span>
              </div>
              <h2 className="text-lg font-black uppercase tracking-widest text-[#F5F5F5]">Authority Credentials</h2>
            </div>

            <div className="grid grid-cols-2 gap-8">
              <div className="col-span-1">
                <label className="block text-[9px] font-black uppercase tracking-[0.2em] text-[#555] mb-3">Primary Overseer (Full Name)</label>
                <input className={inputCls('ownerName')} placeholder="e.g. COMMANDER SHEPARD" value={formData.ownerName} onChange={set('ownerName')} />
                {fieldErrors.ownerName && <p className="text-[9px] font-bold text-[#C0272D] mt-2 uppercase tracking-widest">{fieldErrors.ownerName}</p>}
              </div>
              <div className="col-span-1">
                <label className="block text-[9px] font-black uppercase tracking-[0.2em] text-[#555] mb-3">Communication Channel (Email)</label>
                <input className={inputCls('ownerEmail')} placeholder="overseer@node.com" value={formData.ownerEmail} onChange={set('ownerEmail')} />
                {fieldErrors.ownerEmail && <p className="text-[9px] font-bold text-[#C0272D] mt-2 uppercase tracking-widest">{fieldErrors.ownerEmail}</p>}
              </div>
              <div className="col-span-1">
                <label className="block text-[9px] font-black uppercase tracking-[0.2em] text-[#555] mb-3">Secure Access PIN (4 Digits)</label>
                <input
                  className={`${inputCls('pin')} font-mono tracking-[1em] text-center text-lg`}
                  placeholder="••••"
                  type="password"
                  maxLength={4}
                  value={formData.pin}
                  onChange={set('pin')}
                />
                {fieldErrors.pin && <p className="text-[9px] font-bold text-[#C0272D] mt-2 uppercase tracking-widest">{fieldErrors.pin}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Summary */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="bg-[#0D0D0D] border-2 border-[#C0272D] rounded-2xl p-8 sticky top-8 shadow-[0_0_50px_rgba(192,39,45,0.15)] overflow-hidden">
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-[#C0272D] opacity-10 rounded-full blur-3xl" />
            
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#C0272D] mb-8 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-[#C0272D] rounded-full animate-pulse" />
              Manifest Preview
            </h3>

            <div className="space-y-8 mb-10">
              <div className="space-y-1">
                <p className="text-[9px] font-black text-[#333] uppercase tracking-widest">Provisioning Entity</p>
                <p className="text-lg font-black text-[#F5F5F5] tracking-tight">{formData.restaurantName || 'PENDING_IDENTITY'}</p>
                <p className="text-[9px] font-mono text-[#555] uppercase">{formData.location || 'ORBITAL_STATION'}</p>
              </div>

              <div className="space-y-1">
                <p className="text-[9px] font-black text-[#333] uppercase tracking-widest">Selected Tier</p>
                <div className="flex items-center gap-3">
                  <p className="text-lg font-black text-[#F5F5F5] uppercase tracking-tight">{formData.plan}</p>
                  <span className="px-2 py-0.5 rounded-sm bg-[#1A1A1A] border border-[#2A2A2A] text-[8px] font-black text-[#555] uppercase tracking-widest">{formData.billingCycle}</span>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[9px] font-black text-[#333] uppercase tracking-widest">Uplink Recipient</p>
                <p className="text-xs font-bold text-[#F5F5F5] truncate">{formData.ownerEmail || 'PENDING_COMMS'}</p>
              </div>
            </div>

            <div className="space-y-4 pt-8 border-t border-[#2A2A2A]/50">
              {submitError && (
                <div className="p-4 bg-[#C0272D1A] border border-[#C0272D33] rounded-xl flex gap-3">
                  <span className="material-symbols-outlined text-[#C0272D] text-lg">report</span>
                  <p className="text-[9px] font-black text-[#C0272D] uppercase tracking-widest leading-relaxed">{submitError}</p>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full bg-[#C0272D] hover:bg-[#A31D23] disabled:opacity-40 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 shadow-[0_10px_20px_rgba(192,39,45,0.2)] flex items-center justify-center gap-3"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-lg">rocket_launch</span>
                    Authorize Deployment
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Success Overlay */}
      {showSuccess && successData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/90 backdrop-blur-xl">
          <div className="max-w-md w-full bg-[#1A1A1A] border border-[#C0272D]/50 rounded-3xl p-12 text-center space-y-8 relative overflow-hidden shadow-[0_0_100px_rgba(192,39,45,0.2)]">
            <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)]" />
            
            <div className="w-24 h-24 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto shadow-[0_0_40px_rgba(16,185,129,0.1)]">
              <span className="material-symbols-outlined text-5xl text-emerald-500">verified</span>
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-black tracking-tighter text-[#F5F5F5]">Deployment Successful</h2>
              <p className="text-[10px] font-black text-[#555] uppercase tracking-[0.2em]">Node {successData.tenantName} is now live</p>
            </div>

            {successData.devCredentials && (
              <div className="bg-[#0D0D0D] border border-[#C0272D33] rounded-2xl p-6 text-left space-y-4">
                <div className="flex items-center gap-2 text-[#C0272D]">
                  <span className="material-symbols-outlined text-lg">emergency</span>
                  <p className="text-[9px] font-black uppercase tracking-widest">Manual Provisioning Required</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-[8px] font-black text-[#333] uppercase tracking-widest mb-1">Identity</p>
                    <p className="font-mono text-xs text-[#F5F5F5] break-all bg-[#1A1A1A] p-2 rounded border border-[#2A2A2A]">{successData.devCredentials.email}</p>
                  </div>
                  <div>
                    <p className="text-[8px] font-black text-[#333] uppercase tracking-widest mb-1">Access Token</p>
                    <p className="font-mono text-xs text-[#C0272D] font-black tracking-widest bg-[#1A1A1A] p-2 rounded border border-[#2A2A2A]">{successData.devCredentials.password}</p>
                  </div>
                </div>
                <p className="text-[8px] text-[#333] italic leading-tight uppercase tracking-widest">One-time visibility. Capture immediately.</p>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={() => router.push('/dashboard')}
                className="w-full bg-[#F5F5F5] hover:bg-white text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95"
              >
                Return to Hub
              </button>
              <button
                onClick={() => {
                  setShowSuccess(false)
                  setFormData(defaultForm)
                }}
                className="w-full text-[#555] hover:text-[#F5F5F5] text-[10px] font-black uppercase tracking-widest transition-colors"
              >
                Provision Another Node
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
