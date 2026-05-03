// src/apps/superadmin/OnboardWizard.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'

const PLANS = [
  { id: 'starter', label: 'Starter', price: 2999, features: ['Up to 10 tables', 'Basic analytics', 'QR Menu'] },
  { id: 'pro',     label: 'Pro',     price: 5999, features: ['Up to 30 tables', 'Full analytics', 'QR + Waiter App', 'KDS'] },
  { id: 'enterprise', label: 'Enterprise', price: 11999, features: ['Unlimited tables', 'All features', 'Priority support', 'Custom branding'] },
]

const DEFAULT_FORM = {
  restaurantName: '',
  location: '',
  plan: 'pro',
  ownerName: '',
  ownerEmail: '',   
  pin: '',
}

export default function OnboardWizard() {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const navigate = useNavigate()

  const update = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const canProceed = () => {
    if (step === 1) return form.restaurantName.trim() && form.location.trim()
    if (step === 2) return !!form.plan
    if (step === 3) {
      const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail)
      const pinValid = /^\d{4}$/.test(form.pin)
      return form.ownerName.trim() && emailValid && pinValid
    }
    return false
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setError(null)

    try {
      // Step 1: Insert tenant
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          name: form.restaurantName.trim(),
          slug: form.restaurantName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
          location: form.location.trim(),
          plan: form.plan,
          mrr: PLANS.find(p => p.id === form.plan)?.price ?? 5999,
          status: 'active',
        })
        .select()
        .single()

      if (tenantError) throw new Error(`Tenant creation failed: ${tenantError.message}`)

      // Step 2: Create 15 default tables
      const tables = Array.from({ length: 15 }, (_, i) => ({
        tenant_id: tenant.id,
        table_num: `T${String(i + 1).padStart(2, '0')}`,
        status: 'vacant',
        capacity: 4,
        floor: 1,
      }))

      const { error: tablesError } = await supabase
        .from('tables') // Note: corrected from restaurant_tables to tables as per current schema in store/index.js
        .insert(tables)

      if (tablesError) throw new Error(`Tables creation failed: ${tablesError.message}`)

      // Step 3: Create owner staff record (WITH email)
      const { error: staffError } = await supabase
        .from('staff')
        .insert({
          tenant_id: tenant.id,
          name: form.ownerName.trim(),
          email: form.ownerEmail.toLowerCase().trim(),
          role: 'owner',
          pin: form.pin,
          is_active: true,
        })

      if (staffError) throw new Error(`Staff creation failed: ${staffError.message}`)

      // ✅ Success
      setSuccess({
        restaurantName: form.restaurantName,
        tenantId: tenant.id,
        loginEmail: form.ownerEmail,
        loginUrl: `/admin/login`,
      })

    } catch (err) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="bg-gray-900 rounded-3xl p-8 max-w-md w-full text-center border border-green-800">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-white text-2xl font-bold mb-2">Restaurant Onboarded!</h2>
          <p className="text-gray-400 mb-6">{success.restaurantName} is ready to go.</p>

          <div className="bg-gray-800 rounded-xl p-4 text-left space-y-2 mb-6">
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">Admin Login Credentials</p>
            <p className="text-white text-sm">Email: <span className="text-amber-400">{success.loginEmail}</span></p>
            <p className="text-white text-sm">PIN: <span className="text-amber-400">As set in wizard</span></p>
            <p className="text-white text-sm">URL: <span className="text-amber-400">{success.loginUrl}</span></p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => navigate('/superadmin/tenants')}
              className="flex-1 bg-amber-400 text-gray-900 font-bold py-3 rounded-xl"
            >
              View All Tenants
            </button>
            <button
              onClick={() => { setSuccess(null); setForm(DEFAULT_FORM); setStep(1) }}
              className="flex-1 bg-gray-800 text-white font-bold py-3 rounded-xl"
            >
              Onboard Another
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-lg mx-auto">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors
                ${s < step ? 'bg-green-500 text-white' : s === step ? 'bg-amber-400 text-gray-900' : 'bg-gray-800 text-gray-500'}`}>
                {s < step ? '✓' : s}
              </div>
              {s < 3 && <div className={`flex-1 h-0.5 ${s < step ? 'bg-green-500' : 'bg-gray-800'}`} />}
            </div>
          ))}
        </div>

        <div className="bg-gray-900 rounded-3xl p-6 border border-gray-800">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-white text-xl font-bold">Restaurant Details</h2>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-widest font-semibold block mb-2">Restaurant Name</label>
                <input
                  type="text"
                  value={form.restaurantName}
                  onChange={e => update('restaurantName', e.target.value)}
                  placeholder="The Grand Spice"
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl border border-gray-700 focus:border-amber-400 focus:outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-widest font-semibold block mb-2">Location</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={e => update('location', e.target.value)}
                  placeholder="Bandra West, Mumbai"
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl border border-gray-700 focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-white text-xl font-bold">Select Plan</h2>
              {PLANS.map(plan => (
                <button
                  key={plan.id}
                  onClick={() => update('plan', plan.id)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all
                    ${form.plan === plan.id ? 'border-amber-400 bg-amber-400/10' : 'border-gray-700 bg-gray-800 hover:border-gray-600'}`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-white font-bold">{plan.label}</span>
                    <span className="text-amber-400 font-bold">₹{plan.price.toLocaleString()}/mo</span>
                  </div>
                  <ul className="text-gray-400 text-xs space-y-0.5">
                    {plan.features.map(f => <li key={f}>• {f}</li>)}
                  </ul>
                </button>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-white text-xl font-bold">Owner Account</h2>
              <p className="text-gray-400 text-sm">These credentials will be used to log in to the Admin Dashboard.</p>

              <div>
                <label className="text-xs text-gray-400 uppercase tracking-widest font-semibold block mb-2">Owner Name</label>
                <input
                  type="text"
                  value={form.ownerName}
                  onChange={e => update('ownerName', e.target.value)}
                  placeholder="Rahul Sharma"
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl border border-gray-700 focus:border-amber-400 focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 uppercase tracking-widest font-semibold block mb-2">
                  Owner Email <span className="text-amber-400">← used to log in</span>
                </label>
                <input
                  type="email"
                  value={form.ownerEmail}
                  onChange={e => update('ownerEmail', e.target.value)}
                  placeholder="owner@thegrandspice.com"
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl border border-gray-700 focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 uppercase tracking-widest font-semibold block mb-2">4-Digit PIN</label>
                <input
                  type="password"
                  value={form.pin}
                  onChange={e => update('pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  maxLength={4}
                  inputMode="numeric"
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl border border-gray-700 focus:border-amber-400 focus:outline-none tracking-widest text-center text-2xl"
                />
              </div>

              {error && (
                <div className="px-4 py-3 bg-red-900/40 border border-red-700/50 rounded-xl">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 mt-6">
            {step > 1 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="flex-1 bg-gray-800 text-white font-bold py-3 rounded-xl hover:bg-gray-700"
              >
                Back
              </button>
            )}
            {step < 3 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canProceed()}
                className="flex-1 bg-amber-400 text-gray-900 font-bold py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-300"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canProceed() || isSubmitting}
                className="flex-1 bg-amber-400 text-gray-900 font-bold py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-300"
              >
                {isSubmitting ? 'Creating...' : 'Create Restaurant'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
