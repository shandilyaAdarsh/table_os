'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Plan = 'starter' | 'pro' | 'enterprise'

const planLabels: Record<Plan, string> = {
  starter: 'Starter Tier',
  pro: 'Professional Tier',
  enterprise: 'Enterprise Tier',
}
const planMRR: Record<Plan, string> = {
  starter: '₹2,999',
  pro: '₹5,999',
  enterprise: '₹11,999',
}
const planPriceDisplay: Record<Plan, string> = {
  starter: '₹2,999',
  pro: '₹5,999',
  enterprise: '₹11,999',
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
    if (!formData.restaurantName.trim()) errors.restaurantName = 'Restaurant name is required'
    if (!formData.location.trim()) errors.location = 'Location is required'
    if (!formData.phone.trim()) errors.phone = 'Phone number is required'
    if (!formData.ownerName.trim()) errors.ownerName = 'Owner name is required'
    if (!formData.ownerEmail.trim()) errors.ownerEmail = 'Owner email is required'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.ownerEmail)) errors.ownerEmail = 'Invalid email address'
    if (!formData.pin.trim()) errors.pin = 'PIN is required'
    if (!/^\d{4}$/.test(formData.pin)) errors.pin = 'PIN must be exactly 4 digits'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async () => {
    setSubmitError('')
    setEmailDeliveryFailed(false)
    if (!validate()) {
      setSubmitError('Please fix the errors above before continuing.')
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

      let result: any
      try {
        result = await response.json()
      } catch {
        setSubmitError('Unexpected server response. Please try again.')
        return
      }

      if (!response.ok) {
        setSubmitError(result?.error || 'Failed to create tenant.')
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
        setSubmitError(result.error || 'Failed to create tenant.')
      }
    } catch (err) {
      setSubmitError('Network error. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputCls = (field: keyof FormData) => `
    w-full bg-[#1c1b1b] border-2 rounded-lg px-4 py-3 text-sm text-[#e5e2e1] 
    focus:outline-none transition-all placeholder:text-[#333333]
    ${fieldErrors[field] ? 'border-[#C0272D]/50 focus:border-[#C0272D]' : 'border-[#2A2A2A] focus:border-[#C0272D]/50'}
  `

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-12 pb-24">
      {/* ── Header ── */}
      <div className="flex justify-between items-end border-b border-[#2A2A2A] pb-8">
        <div>
          <h2 className="text-3xl font-black text-[#e5e2e1] tracking-tight">Onboard New Restaurant</h2>
          <p className="text-[#555555] text-sm font-mono mt-1 uppercase tracking-widest">Global Instance Provisioning — v4.2</p>
        </div>
        <div className="flex bg-[#131212] rounded-lg p-1 border border-[#2A2A2A]">
          <div className="px-3 py-1 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#C0272D] animate-pulse" />
            <span className="text-[10px] font-bold text-[#e5e2e1] uppercase tracking-widest">Active Session</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-12">
        {/* Left Column — Form */}
        <div className="col-span-12 lg:col-span-8 space-y-10">

          {/* Step 1: Restaurant Info */}
          <section className="bg-surface-container border border-[#2A2A2A] rounded-xl p-8 transition-all hover:border-[#353534]">
            <div className="flex items-center gap-3 mb-8">
              <span className="material-symbols-outlined text-[#C0272D]" data-icon="restaurant">restaurant</span>
              <h3 className="text-xl font-bold text-on-surface">Restaurant Information</h3>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="col-span-2">
                <label className="block text-[10px] uppercase tracking-widest text-[#555555] mb-2 font-bold">Trading Name</label>
                <input 
                  className="w-full bg-surface-container-lowest border border-[#2A2A2A] rounded-lg px-4 py-3 text-on-surface focus:ring-0 focus:border-[#C0272D] transition-colors" 
                  placeholder="e.g. The Silver Spoon" 
                  type="text"
                  value={formData.restaurantName}
                  onChange={set('restaurantName')}
                />
                {fieldErrors.restaurantName && <p className="text-xs text-[#C0272D] mt-1">{fieldErrors.restaurantName}</p>}
              </div>
              <div className="col-span-1">
                <label className="block text-[10px] uppercase tracking-widest text-[#555555] mb-2 font-bold">Phone Number</label>
                <input 
                  className="w-full bg-surface-container-lowest border border-[#2A2A2A] rounded-lg px-4 py-3 font-mono text-on-surface focus:ring-0 focus:border-[#C0272D]" 
                  placeholder="+1 (555) 000-0000" 
                  type="tel"
                  value={formData.phone}
                  onChange={set('phone')}
                />
                {fieldErrors.phone && <p className="text-xs text-[#C0272D] mt-1">{fieldErrors.phone}</p>}
              </div>
              <div className="col-span-1">
                <label className="block text-[10px] uppercase tracking-widest text-[#555555] mb-2 font-bold">Total Tables</label>
                <input 
                  className="w-full bg-surface-container-lowest border border-[#2A2A2A] rounded-lg px-4 py-3 font-mono text-on-surface focus:ring-0 focus:border-[#C0272D]" 
                  placeholder="24" 
                  type="number"
                  value={formData.tables}
                  onChange={set('tables')}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] uppercase tracking-widest text-[#555555] mb-2 font-bold">Physical Location</label>
                <div className="relative">
                  <input 
                    className="w-full bg-surface-container-lowest border border-[#2A2A2A] rounded-lg px-4 py-3 pl-11 text-on-surface focus:ring-0 focus:border-[#C0272D]" 
                    placeholder="Search address..." 
                    type="text"
                    value={formData.location}
                    onChange={set('location')}
                  />
                  <span className="material-symbols-outlined absolute left-3 top-3 text-[#555555]" data-icon="location_on">location_on</span>
                </div>
                {fieldErrors.location && <p className="text-xs text-[#C0272D] mt-1">{fieldErrors.location}</p>}
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] uppercase tracking-widest text-[#555555] mb-2 font-bold">Operating Hours</label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-surface-container-lowest border border-[#2A2A2A] rounded-lg">
                    <span className="text-[10px] text-[#555555] font-mono">OPEN</span>
                    <input 
                      className="bg-transparent border-none p-0 text-sm font-mono text-on-surface focus:ring-0" 
                      type="time"
                      value={formData.openTime}
                      onChange={set('openTime')}
                    />
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-surface-container-lowest border border-[#2A2A2A] rounded-lg">
                    <span className="text-[10px] text-[#555555] font-mono">CLOSE</span>
                    <input 
                      className="bg-transparent border-none p-0 text-sm font-mono text-on-surface focus:ring-0" 
                      type="time"
                      value={formData.closeTime}
                      onChange={set('closeTime')}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Step 2: Select Subscription Plan */}
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[#C0272D]" data-icon="layers">layers</span>
                <h3 className="text-xl font-bold text-on-surface">Select Subscription Plan</h3>
              </div>
              
              {/* Billing Cycle Toggle */}
              <div className="flex bg-[#131212] rounded-full p-1 border border-[#2A2A2A]">
                {(['demo', 'monthly', 'yearly'] as const).map((cycle) => (
                  <button
                    key={cycle}
                    onClick={() => setFormData(f => ({ ...f, billingCycle: cycle }))}
                    className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
                      formData.billingCycle === cycle 
                        ? 'bg-[#C0272D] text-white shadow-lg shadow-[#C0272D]/20' 
                        : 'text-[#555555] hover:text-[#888]'
                    }`}
                  >
                    {cycle === 'demo' ? 'Demo' : cycle === 'monthly' ? 'Monthly' : 'Yearly'}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {/* Starter */}
              <div className={`bg-surface-container border rounded-xl p-6 flex flex-col justify-between transition-all relative ${formData.plan === 'starter' ? 'border-[#C0272D]' : 'border-[#2A2A2A] hover:border-[#353534]'}`}>
                {formData.billingCycle === 'yearly' && (
                  <div className="absolute -top-2 -right-2 bg-green-500/10 border border-green-500/20 text-green-500 text-[8px] font-black uppercase px-2 py-1 rounded-sm z-10">Save 2 Months</div>
                )}
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-wider text-[#555555] mb-4">Starter</h4>
                  <div className="font-mono text-2xl font-bold mb-1 text-on-surface">
                    {formData.billingCycle === 'demo' ? '₹0' : formData.billingCycle === 'monthly' ? '₹2,999' : '₹29,990'}
                    <span className="text-sm font-normal text-[#555555]">
                      {formData.billingCycle === 'demo' ? '/trial' : formData.billingCycle === 'monthly' ? '/mo' : '/yr'}
                    </span>
                  </div>
                  {formData.billingCycle === 'demo' && <p className="text-[10px] text-primary-container font-black uppercase mb-6 tracking-tighter">7-day free trial</p>}
                  {formData.billingCycle !== 'demo' && <div className="h-4 mb-6" />}

                  <ul className="space-y-4 mb-8">
                    <li className="flex items-center gap-2 text-xs text-[#E5E2E1]">
                      <span className="material-symbols-outlined text-[16px] text-green-500" data-icon="check_circle">check_circle</span>
                      Up to 15 Tables
                    </li>
                    <li className="flex items-center gap-2 text-xs text-[#E5E2E1]">
                      <span className="material-symbols-outlined text-[16px] text-green-500" data-icon="check_circle">check_circle</span>
                      QR Menu Lite
                    </li>
                  </ul>
                </div>
                <button 
                  onClick={() => setPlan('starter')}
                  className={`w-full py-2 rounded-lg text-xs font-bold transition-all ${formData.plan === 'starter' ? 'bg-[#C0272D] text-white' : 'border border-[#2A2A2A] text-on-surface hover:bg-surface-container-high'}`}
                >
                  {formData.plan === 'starter' ? 'Current Selection' : 'Select Plan'}
                </button>
              </div>

              {/* Pro (Recommended) */}
              <div className={`bg-surface-container-high border-2 rounded-xl p-6 relative flex flex-col justify-between transition-all ${formData.plan === 'pro' ? 'border-[#C0272D] shadow-[0_0_30px_rgba(192,39,45,0.1)]' : 'border-[#2A2A2A] hover:border-[#353534]'}`}>
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#C0272D] text-white text-[9px] font-bold uppercase tracking-[2px] px-3 py-1 rounded-full whitespace-nowrap">Recommended</div>
                {formData.billingCycle === 'yearly' && (
                  <div className="absolute -top-2 -right-2 bg-green-500/10 border border-green-500/20 text-green-500 text-[8px] font-black uppercase px-2 py-1 rounded-sm z-10">Save 2 Months</div>
                )}
                <div>
                  <h4 className={`text-sm font-bold uppercase tracking-wider mb-4 ${formData.plan === 'pro' ? 'text-[#C0272D]' : 'text-[#555555]'}`}>Professional</h4>
                  <div className="font-mono text-2xl font-bold mb-1 text-on-surface">
                    {formData.billingCycle === 'demo' ? '₹0' : formData.billingCycle === 'monthly' ? '₹5,999' : '₹59,990'}
                    <span className="text-sm font-normal text-[#555555]">
                      {formData.billingCycle === 'demo' ? '/trial' : formData.billingCycle === 'monthly' ? '/mo' : '/yr'}
                    </span>
                  </div>
                  {formData.billingCycle === 'demo' && <p className="text-[10px] text-primary-container font-black uppercase mb-6 tracking-tighter">7-day free trial</p>}
                  {formData.billingCycle !== 'demo' && <div className="h-4 mb-6" />}

                  <ul className="space-y-4 mb-8">
                    <li className="flex items-center gap-2 text-xs text-[#E5E2E1]">
                      <span className="material-symbols-outlined text-[16px] text-green-500" data-icon="check_circle" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                      Unlimited Tables
                    </li>
                    <li className="flex items-center gap-2 text-xs text-[#E5E2E1]">
                      <span className="material-symbols-outlined text-[16px] text-green-500" data-icon="check_circle" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                      POS Integration
                    </li>
                    <li className="flex items-center gap-2 text-xs text-[#E5E2E1]">
                      <span className="material-symbols-outlined text-[16px] text-green-500" data-icon="check_circle" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                      Advanced Analytics
                    </li>
                  </ul>
                </div>
                <button 
                  onClick={() => setPlan('pro')}
                  className={`w-full py-2 rounded-lg text-xs font-bold transition-all ${formData.plan === 'pro' ? 'bg-[#C0272D] text-white' : 'border border-[#2A2A2A] text-on-surface hover:bg-surface-container-high'}`}
                >
                  {formData.plan === 'pro' ? 'Current Selection' : 'Select Plan'}
                </button>
              </div>

              {/* Enterprise */}
              <div className={`bg-surface-container border rounded-xl p-6 flex flex-col justify-between transition-all relative ${formData.plan === 'enterprise' ? 'border-[#C0272D]' : 'border-[#2A2A2A] hover:border-[#353534]'}`}>
                {formData.billingCycle === 'yearly' && (
                  <div className="absolute -top-2 -right-2 bg-green-500/10 border border-green-500/20 text-green-500 text-[8px] font-black uppercase px-2 py-1 rounded-sm z-10">Save 2 Months</div>
                )}
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-wider text-[#555555] mb-4">Enterprise</h4>
                  <div className="font-mono text-2xl font-bold mb-1 text-on-surface">
                    {formData.billingCycle === 'demo' ? '₹0' : formData.billingCycle === 'monthly' ? '₹11,999' : '₹1,19,990'}
                    <span className="text-sm font-normal text-[#555555]">
                      {formData.billingCycle === 'demo' ? '/trial' : formData.billingCycle === 'monthly' ? '/mo' : '/yr'}
                    </span>
                  </div>
                  {formData.billingCycle === 'demo' && <p className="text-[10px] text-primary-container font-black uppercase mb-6 tracking-tighter">7-day free trial</p>}
                  {formData.billingCycle !== 'demo' && <div className="h-4 mb-6" />}

                  <ul className="space-y-4 mb-8">
                    <li className="flex items-center gap-2 text-xs text-[#E5E2E1]">
                      <span className="material-symbols-outlined text-[16px] text-green-500" data-icon="check_circle">check_circle</span>
                      Multi-location
                    </li>
                    <li className="flex items-center gap-2 text-xs text-[#E5E2E1]">
                      <span className="material-symbols-outlined text-[16px] text-green-500" data-icon="check_circle">check_circle</span>
                      Dedicated API
                    </li>
                  </ul>
                </div>
                <button 
                  onClick={() => setPlan('enterprise')}
                  className={`w-full py-2 rounded-lg text-xs font-bold transition-all ${formData.plan === 'enterprise' ? 'bg-[#C0272D] text-white' : 'border border-[#2A2A2A] text-on-surface hover:bg-surface-container-high'}`}
                >
                  {formData.plan === 'enterprise' ? 'Current Selection' : 'Select Plan'}
                </button>
              </div>
            </div>
          </section>

          {/* Step 3: Admin Account */}
          <section className="bg-[#201f1f] border border-[#2A2A2A] rounded-[10px] p-8">
            <div className="flex items-center gap-3 mb-8">
              <span className="material-symbols-outlined text-[#C0272D]">admin_panel_settings</span>
              <h3 className="text-xl font-bold text-[#e5e2e1]">Admin Account Creation</h3>
            </div>
            <div className="mb-8 p-4 bg-[#1A2744] border-l-[3px] border-[#3B82F6] rounded-r-lg flex items-start gap-4">
              <span className="material-symbols-outlined text-[#3B82F6] shrink-0">info</span>
              <p className="text-xs text-white/90 leading-relaxed font-medium">
                The admin will automatically receive their login credentials (email + temporary password) to their inbox. They can use these to log in to the app immediately.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-[#555555] mb-2 font-bold">
                  Owner Full Name <span className="text-[#C0272D]">*</span>
                </label>
                <input className={inputCls('ownerName')} placeholder="Johnathan Doe" type="text" value={formData.ownerName} onChange={set('ownerName')} />
                {fieldErrors.ownerName && <p className="text-xs text-[#C0272D] mt-1">{fieldErrors.ownerName}</p>}
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-[#555555] mb-2 font-bold">
                  Email Address <span className="text-[#C0272D]">*</span>
                </label>
                <input className={inputCls('ownerEmail')} placeholder="owner@restaurant.com" type="email" value={formData.ownerEmail} onChange={set('ownerEmail')} />
                {fieldErrors.ownerEmail && <p className="text-xs text-[#C0272D] mt-1">{fieldErrors.ownerEmail}</p>}
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-[#555555] mb-2 font-bold">
                  Admin PIN (4 digits) <span className="text-[#C0272D]">*</span>
                </label>
                <input
                  className={`${inputCls('pin')} font-mono tracking-[0.5em] text-center`}
                  placeholder="••••"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={formData.pin}
                  onChange={set('pin')}
                />
                {fieldErrors.pin && <p className="text-xs text-[#C0272D] mt-1">{fieldErrors.pin}</p>}
              </div>
            </div>
          </section>
        </div>

        {/* Right Column — Sticky Summary */}
        <div className="col-span-12 lg:col-span-4 sticky top-24">
          <div className="bg-[#0D0D0D] border-2 border-[#C0272D] rounded-[10px] p-8 overflow-hidden relative shadow-[0_0_40px_rgba(192,39,45,0.12)]">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <span className="material-symbols-outlined text-[120px]">receipt_long</span>
            </div>
            <h3 className="text-sm font-bold uppercase tracking-[2px] text-[#C0272D] mb-8">Onboarding Summary</h3>
            <div className="space-y-6 mb-10">
              <div>
                <p className="text-[10px] uppercase text-[#555555] font-bold tracking-widest mb-1">Entity</p>
                <p className="text-lg font-bold text-[#e5e2e1]">{formData.restaurantName || '—'}</p>
                <p className="text-xs font-mono text-[#555555]">ID: auto-generated on save</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-[#555555] font-bold tracking-widest mb-1">Subscription ({formData.billingCycle})</p>
                <p className="text-lg font-bold text-[#e5e2e1]">{planLabels[formData.plan]}</p>
                <p className="text-2xl font-mono font-bold text-[#e5e2e1] mt-1">
                  {formData.billingCycle === 'demo' ? '₹0' : formData.billingCycle === 'monthly' ? planPriceDisplay[formData.plan] : { starter: '₹29,990', pro: '₹59,990', enterprise: '₹1,19,990' }[formData.plan]}
                  <span className="text-xs text-[#555555] font-normal uppercase ml-2">
                    {formData.billingCycle === 'demo' ? 'Trial' : formData.billingCycle === 'monthly' ? 'MRR' : 'Yearly'}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-[#555555] font-bold tracking-widest mb-1">Admin Recipient</p>
                <p className="text-sm font-medium text-[#e5e2e1] break-all">{formData.ownerEmail || '—'}</p>
              </div>
            </div>
            <div className="border-t border-[#2A2A2A] pt-8 space-y-4">
              {submitError && (
                <div className="flex items-start gap-2 p-3 bg-[#C0272D1A] border border-[#C0272D]/30 rounded-lg">
                  <span className="material-symbols-outlined text-[#C0272D] text-sm shrink-0 mt-0.5">error</span>
                  <p className="text-xs text-[#ffb3ae] leading-relaxed">{submitError}</p>
                </div>
              )}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full bg-[#C0272D] text-white py-4 rounded-lg font-bold text-sm tracking-tight hover:brightness-110 active:scale-95 transition-all shadow-[0_4px_20px_rgba(192,39,45,0.3)] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Creating account...
                  </>
                ) : (
                  'Send Credentials & Create Account'
                )}
              </button>
            </div>
          </div>

          {/* Preview card */}
          <div className="mt-8 rounded-[10px] overflow-hidden border border-[#2A2A2A] h-[200px] relative">
            <div className="w-full h-full bg-linear-to-br from-[#1C1B1B] to-[#0D0D0D] flex items-center justify-center">
              <span className="material-symbols-outlined text-[64px] text-[#2A2A2A]" style={{ fontVariationSettings: "'FILL' 1" }}>restaurant</span>
            </div>
            <div className="absolute inset-0 bg-linear-to-t from-[#131313] to-transparent opacity-60" />
            <div className="absolute bottom-4 left-4">
              <p className="text-[10px] uppercase tracking-[2px] font-bold text-white/40">Preview Environment</p>
              <p className="text-xs font-medium text-white/80">TableOS Pro Engine v4.2</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Success Modal ── */}
      {showSuccess && successData && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
          <div className="relative w-full max-w-md bg-[#201f1f] border border-[#C0272D]/30 rounded-[10px] p-10 text-center shadow-[0_0_100px_rgba(192,39,45,0.15)]">
            {/* Animated checkmark or warning */}
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border ${
              emailDeliveryFailed 
                ? 'bg-yellow-500/10 border-yellow-500/20' 
                : 'bg-green-500/10 border-green-500/20'
            }`}>
              <span className={`material-symbols-outlined text-[48px] ${
                emailDeliveryFailed ? 'text-yellow-500' : 'text-green-500'
              }`} style={{ fontVariationSettings: "'FILL' 1" }}>
                {emailDeliveryFailed ? 'warning' : 'verified'}
              </span>
            </div>
            <h4 className="text-2xl font-bold mb-3 text-[#e5e2e1]">
              {emailDeliveryFailed ? 'Account Created!' : 'Credentials Sent!'}
            </h4>

            {successData.devCredentials && (
              <div className="mb-8 p-6 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-left space-y-4 shadow-lg shadow-yellow-500/5">
                <div className="flex items-center gap-2 text-yellow-500 mb-1">
                  <span className="material-symbols-outlined text-lg">warning</span>
                  <p className="text-[10px] font-black uppercase tracking-widest">Email delivery failed — share manually</p>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-[9px] uppercase tracking-tighter text-[#555555] font-bold mb-1">Login Email</label>
                    <div className="bg-black/40 px-3 py-2 rounded border border-white/5 font-mono text-xs text-[#e5e2e1] break-all">
                      {successData.devCredentials.email}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-[9px] uppercase tracking-tighter text-[#555555] font-bold mb-1">Temp Password</label>
                    <div className="flex gap-2">
                      <div className="flex-1 bg-black/40 px-3 py-2 rounded border border-white/5 font-mono text-xs text-yellow-500 font-bold tracking-wider">
                        {successData.devCredentials.password}
                      </div>
                      <button 
                        onClick={() => {
                          if (successData.devCredentials?.password) {
                            navigator.clipboard.writeText(successData.devCredentials.password)
                          }
                        }}
                        className="bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-500 p-2 rounded transition-colors flex items-center justify-center shrink-0"
                        title="Copy Password"
                      >
                        <span className="material-symbols-outlined text-sm">content_copy</span>
                      </button>
                    </div>
                  </div>
                </div>

                <p className="text-[9px] text-[#555555] italic leading-tight pt-1">
                  ⚠️ This is only visible once. Save it now.
                </p>
              </div>
            )}

            {!successData.devCredentials && (
              <div className="space-y-2 mb-8">
                <p className="text-[#c8c6c5] text-sm font-semibold">{successData.tenantName}</p>
                <p className="text-xs text-[#555555]">
                  {emailDeliveryFailed ? 'Account created for recipient' : 'Credentials sent to'}
                </p>
                <p className="font-mono text-sm text-[#ffb3ae] font-bold">{successData.adminEmail}</p>
                <p className="text-xs text-[#555555] leading-relaxed pt-2">
                  {emailDeliveryFailed 
                    ? 'Tenant is active, but the admin did not receive their automated invite. Manual distribution required.'
                    : 'They can now log in to the Admin Dashboard using the credentials sent to their email.'}
                </p>
              </div>
            )}
            <div className="space-y-3">
              <button
                onClick={() => router.push('/dashboard')}
                className="w-full bg-[#e5e2e1] text-black py-3 rounded-lg font-bold text-sm hover:brightness-90 transition-all"
              >
                Go to Dashboard
              </button>
              <button
                onClick={() => {
                  setShowSuccess(false)
                  setFormData(defaultForm)
                }}
                className="w-full text-[#555555] text-xs font-bold hover:text-[#e5e2e1] transition-colors"
              >
                Onboard Another
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
