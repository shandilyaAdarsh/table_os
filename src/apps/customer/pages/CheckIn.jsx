/**
 * CheckIn.jsx — Smart customer check-in screen
 * Two visual states:
 *   Screen A (Dark Luxury)  — returning guest detected via phone lookup
 *   Screen B (Warm Card)    — new guest form
 */

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { fetchWithRuntime, submitMutation } from '../../../lib/apiClient'
import { getTableNum } from '../utils/tableNum'

const TENANT_ID = '11111111-1111-1111-1111-111111111111'

// ── Translations ────────────────────────────────────────────────────────────
const t = {
  EN: {
    tagline: 'A Rooftop Kitchen',
    welcome: 'Welcome!',
    welcomeBack: (name) => `Welcome back, ${name}! 👋`,
    welcomeBackLabel: 'Welcome back,',
    lastVisit: (n) => `You've dined with us ${n} time${n > 1 ? 's' : ''}`,
    visitLabel: (n) => `You've dined with us ${n} time${n > 1 ? 's' : ''}`,
    continueAs: (name) => `Continue as ${name}`,
    notYou: 'Not you? Start fresh',
    subtitle: 'Enter your details to start your dining experience',
    yourName: 'YOUR NAME',
    namePlaceholder: 'e.g. Rahul Sharma',
    phone: 'PHONE NUMBER',
    phoneOptional: '(optional)',
    phonePlaceholder: '+91 99000 00000',
    guests: 'NUMBER OF GUESTS',
    checkin: (table) => `Check in to Table ${table}`,
    privacy: 'Your data is private and secure',
    nameError: 'Please enter your name to continue',
    table: 'TABLE',
    verifiedGuest: 'Verified Guest',
    authenticatedProfile: 'AUTHENTICATED PROFILE',
    verifiedContact: 'VERIFIED CONTACT',
    chefsNote: "Chef's Note",
    chefsNoteMsg: "Welcome back! We hope you enjoy today's specials.",
  },
  HI: {
    tagline: 'एक रूफटॉप रेस्टोरेंट',
    welcome: 'स्वागत है!',
    welcomeBack: (name) => `वापसी पर स्वागत, ${name}! 👋`,
    welcomeBackLabel: 'वापसी पर स्वागत,',
    lastVisit: (n) => `आप ${n} बार हमारे यहाँ आ चुके हैं`,
    visitLabel: (n) => `आप ${n} बार हमारे यहाँ आ चुके हैं`,
    continueAs: (name) => `${name} के रूप में जारी रखें`,
    notYou: 'आप नहीं? नए सिरे से शुरू करें',
    subtitle: 'अपना डाइनिंग अनुभव शुरू करने के लिए विवरण दर्ज करें',
    yourName: 'आपका नाम',
    namePlaceholder: 'जैसे राहुल शर्मा',
    phone: 'फ़ोन नंबर',
    phoneOptional: '(वैकल्पिक)',
    phonePlaceholder: '+91 99000 00000',
    guests: 'मेहमानों की संख्या',
    checkin: (table) => `टेबल ${table} पर चेक इन करें`,
    privacy: 'आपका डेटा निजी और सुरक्षित है',
    nameError: 'कृपया जारी रखने के लिए अपना नाम दर्ज करें',
    table: 'टेबल',
    verifiedGuest: 'सत्यापित अतिथि',
    authenticatedProfile: 'प्रमाणित प्रोफ़ाइल',
    verifiedContact: 'सत्यापित संपर्क',
    chefsNote: 'शेफ़ की टिप्पणी',
    chefsNoteMsg: 'वापसी पर स्वागत! हम आशा करते हैं कि आप आज के विशेष व्यंजनों का आनंद लेंगे।',
  }
}

// Mask phone: "+91 98765 43210" → "+91 ••••••210"
const maskPhone = (p = '') => {
  const digits = p.replace(/\D/g, '')
  if (digits.length < 4) return p
  return p.slice(0, 4) + '•'.repeat(Math.max(0, p.length - 7)) + p.slice(-3)
}

// Get initials from name
const initials = (name = '') =>
  name.trim().split(' ').slice(0, 2).map(w => w[0]?.toUpperCase()).join('')

// ── Guest count dots ─────────────────────────────────────────────────────────
function GuestDots({ count, filled, empty }) {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12 }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 10, height: 10, borderRadius: '50%', display: 'inline-block',
            background: i < count ? filled : empty,
            transition: 'background 0.2s',
          }}
        />
      ))}
    </div>
  )
}

// ── Lang toggle ──────────────────────────────────────────────────────────────
function LangToggle({ lang, setLang, dark }) {
  const base = {
    padding: '4px 10px', borderRadius: 14, fontSize: 12, fontWeight: 700,
    cursor: 'pointer', border: 'none', transition: 'all 0.15s',
  }
  return (
    <div style={{
      position: 'absolute', top: 16, right: 20, zIndex: 10,
      display: 'flex', gap: 4,
      background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.18)',
      borderRadius: 18, padding: 3,
    }}>
      {['EN', 'HI'].map(l => (
        <button
          key={l}
          onClick={() => setLang(l)}
          style={{
            ...base,
            background: lang === l ? (dark ? '#D97706' : 'white') : 'transparent',
            color: lang === l ? (dark ? '#0F172A' : '#E31E24') : (dark ? '#94A3B8' : 'rgba(255,255,255,0.8)'),
            border: lang === l ? 'none' : (dark ? '1px solid rgba(217,119,6,0.4)' : '1px solid rgba(255,255,255,0.4)'),
          }}
        >{l === 'HI' ? 'हि' : l}</button>
      ))}
    </div>
  )
}

// ── SCREEN A — Returning Guest (Dark Luxury) ─────────────────────────────────
function ReturningScreen({ guest, T, lang, setLang, guestCount, setGuestCount, onContinue, onReset }) {
  return (
    <motion.div
      key="returning"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.35 }}
      style={{
        minHeight: '100vh', background: '#0F172A', display: 'flex',
        flexDirection: 'column', padding: '32px 24px 40px',
        fontFamily: '"Plus Jakarta Sans", sans-serif', position: 'relative',
        maxWidth: 430, margin: '0 auto',
      }}
    >
      <LangToggle lang={lang} setLang={setLang} dark />

      {/* Avatar */}
      <div style={{ textAlign: 'center', marginTop: 48 }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%', background: '#D97706',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, fontWeight: 600, color: 'white',
          margin: '0 auto',
          boxShadow: '0 0 0 4px rgba(217,119,6,0.25)',
        }}>
          {initials(guest.name)}
        </div>
        <div style={{ color: '#4ADE80', fontSize: 12, marginTop: 8, fontWeight: 600 }}>
          ● {T.verifiedGuest}
        </div>
      </div>

      {/* Welcome */}
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <div style={{ color: '#94A3B8', fontSize: 16 }}>{T.welcomeBackLabel}</div>
        <div style={{ color: 'white', fontSize: 28, fontWeight: 600, lineHeight: 1.2 }}>{guest.name}</div>
        <div style={{ color: '#94A3B8', fontSize: 13, marginTop: 4 }}>
          {T.visitLabel(guest.visit_count || 1)}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(217,119,6,0.2)', margin: '24px 0' }} />

      {/* Profile card */}
      <div style={{
        background: '#1E293B', borderRadius: 16, padding: 16,
        border: '1px solid rgba(217,119,6,0.2)',
      }}>
        <div style={{ color: '#D97706', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 12 }}>
          {T.authenticatedProfile}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 16 }}>👤</span>
          <span style={{ color: 'white', fontSize: 15 }}>{guest.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 16 }}>📱</span>
          <span style={{ color: '#94A3B8', fontSize: 14 }}>{maskPhone(guest.phone)}</span>
        </div>
        <div style={{ color: '#4ADE80', fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase' }}>
          {T.verifiedContact}
        </div>
      </div>

      {/* Guest count */}
      <div style={{ marginTop: 24 }}>
        <div style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, textAlign: 'center' }}>
          {T.guests}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <button
            onClick={() => setGuestCount(c => Math.max(1, c - 1))}
            style={{
              width: 44, height: 44, borderRadius: 12, background: 'transparent',
              border: '1px solid #D97706', color: '#D97706', fontSize: 22,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >−</button>
          <span style={{ color: 'white', fontSize: 32, fontWeight: 700, minWidth: 60, textAlign: 'center' }}>
            {guestCount}
          </span>
          <button
            onClick={() => setGuestCount(c => Math.min(8, c + 1))}
            style={{
              width: 44, height: 44, borderRadius: 12, background: '#D97706',
              border: 'none', color: '#0F172A', fontSize: 22,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >+</button>
        </div>
        <GuestDots count={guestCount} filled="#D97706" empty="rgba(255,255,255,0.15)" />
      </div>

      {/* Chef's note */}
      {(guest.visit_count || 0) > 1 && (
        <div style={{
          marginTop: 20, background: 'rgba(217,119,6,0.08)',
          border: '1px solid rgba(217,119,6,0.2)', borderRadius: 12, padding: 12,
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 18 }}>🍽️</span>
          <div>
            <div style={{ color: '#D97706', fontSize: 12, fontWeight: 700 }}>{T.chefsNote}</div>
            <div style={{ color: '#94A3B8', fontSize: 12, fontStyle: 'italic', marginTop: 2 }}>
              {T.chefsNoteMsg}
            </div>
          </div>
        </div>
      )}

      {/* Buttons */}
      <div style={{ marginTop: 28 }}>
        <button
          onClick={() => onContinue(guest.name)}
          style={{
            width: '100%', background: '#D97706', border: 'none', borderRadius: 14,
            padding: 15, color: '#0F172A', fontWeight: 700, fontSize: 15,
            cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif',
          }}
        >
          {T.continueAs(guest.name)}
        </button>
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button
            onClick={onReset}
            style={{ background: 'none', border: 'none', color: '#64748B', fontSize: 13, cursor: 'pointer' }}
          >
            {T.notYou}
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ── SCREEN B — New Guest (Warm Card) ─────────────────────────────────────────
function NewGuestScreen({
  T, lang, setLang, tableNum,
  name, setName, phone, setPhone,
  guestCount, setGuestCount,
  error, isLoading, checkingPhone,
  isNewGuest,
  onCheckIn, onPhoneBlur,
}) {
  const [nameFocused, setNameFocused] = useState(false)
  const [phoneFocused, setPhoneFocused] = useState(false)

  return (
    <motion.div
      key="new-guest"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{ minHeight: '100vh', background: '#E31E24', position: 'relative', fontFamily: '"Plus Jakarta Sans", sans-serif', maxWidth: 430, margin: '0 auto' }}
    >
      <LangToggle lang={lang} setLang={setLang} dark={false} />

      {/* Top navy section */}
      <div style={{ padding: '64px 24px 56px', textAlign: 'center' }}>
        <div style={{ color: 'white', fontSize: 24, fontStyle: 'italic', fontWeight: 500 }}>
          The Grand Spice
        </div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 4 }}>{T.tagline}</div>
        <div style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(217,119,6,0.15)', border: '1px solid rgba(251,191,36,0.4)', borderRadius: 20, padding: '5px 14px' }}>
          <span style={{ color: '#FBBF24', fontSize: 8 }}>●</span>
          <span style={{ color: '#FBBF24', fontSize: 12, fontWeight: 600 }}>
            {T.table} {tableNum} · Floor 3
          </span>
        </div>
      </div>

      {/* White card */}
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        style={{
          background: 'white', borderRadius: '32px 32px 0 0',
          marginTop: -24, padding: '28px 24px 40px', minHeight: '60vh',
        }}
      >
        <p style={{ color: '#6C757D', fontSize: 13, textAlign: 'center', marginBottom: 24, marginTop: 0 }}>
          {T.subtitle}
        </p>

        {/* Name field */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {T.yourName}
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
              color: nameFocused ? '#E31E24' : '#9CA3AF', fontSize: 18, pointerEvents: 'none',
              fontFamily: 'Material Symbols Outlined',
            }}>person</span>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
              placeholder={T.namePlaceholder}
              style={{
                width: '100%', background: '#F8FAFC',
                border: `1.5px solid ${error ? '#EF4444' : nameFocused ? '#E31E24' : '#E5E7EB'}`,
                borderRadius: 12, padding: '13px 16px 13px 44px',
                fontSize: 15, color: '#1A1C1E', outline: 'none',
                boxSizing: 'border-box', fontFamily: '"Plus Jakarta Sans", sans-serif',
              }}
            />
          </div>
          {error && <div style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>{error}</div>}
        </div>

        {/* Phone field */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {T.phone} <span style={{ color: '#9CA3AF', fontWeight: 400, textTransform: 'none', fontSize: 11 }}>{T.phoneOptional}</span>
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
              color: phoneFocused ? '#E31E24' : '#9CA3AF', fontSize: 18, pointerEvents: 'none',
              fontFamily: 'Material Symbols Outlined',
            }}>phone</span>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              onFocus={() => setPhoneFocused(true)}
              onBlur={(e) => { setPhoneFocused(false); onPhoneBlur(e.target.value) }}
              placeholder={T.phonePlaceholder}
              style={{
                width: '100%', background: '#F8FAFC',
                border: `1.5px solid ${phoneFocused ? '#E31E24' : '#E5E7EB'}`,
                borderRadius: 12, padding: '13px 44px 13px 44px',
                fontSize: 15, color: '#1A1C1E', outline: 'none',
                boxSizing: 'border-box', fontFamily: '"Plus Jakarta Sans", sans-serif',
              }}
            />
            {checkingPhone && (
              <span style={{
                position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                width: 16, height: 16, border: '2px solid #E31E24', borderTopColor: 'transparent',
                borderRadius: '50%', display: 'inline-block',
                animation: 'spin 0.7s linear infinite',
              }} />
            )}
          </div>
          {isNewGuest === false && (
            <div style={{ color: '#16A34A', fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>✓</span> New guest — welcome!
            </div>
          )}
        </div>

        {/* Guest count */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            {T.guests}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              onClick={() => setGuestCount(c => Math.max(1, c - 1))}
              style={{
                width: 44, height: 44, borderRadius: 12,
                border: '1.5px solid #E31E24', background: 'transparent',
                color: '#E31E24', fontSize: 22, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >−</button>
            <span style={{ color: '#E31E24', fontSize: 32, fontWeight: 700 }}>{guestCount}</span>
            <button
              onClick={() => setGuestCount(c => Math.min(8, c + 1))}
              style={{
                width: 44, height: 44, borderRadius: 12,
                background: '#E31E24', border: 'none',
                color: 'white', fontSize: 22, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >+</button>
          </div>
          <GuestDots count={guestCount} filled="#D97706" empty="#E5E7EB" />
        </div>

        {/* Check-in button */}
        <button
          onClick={() => onCheckIn()}
          disabled={isLoading}
          style={{
            width: '100%', background: '#E31E24', border: 'none', borderRadius: 14,
            padding: 15, color: 'white', fontWeight: 600, fontSize: 15,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.6 : 1,
            fontFamily: '"Plus Jakarta Sans", sans-serif', transition: 'opacity 0.2s',
          }}
        >
          {isLoading ? 'Checking in...' : T.checkin(tableNum)}
        </button>

        {/* Privacy note */}
        <div style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'center', marginTop: 16 }}>
          🔒 {T.privacy}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Main CheckIn component ───────────────────────────────────────────────────
export default function CheckIn({ onComplete }) {
  const [lang, setLang] = useState('EN')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [guestCount, setGuestCount] = useState(2)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [checkingPhone, setCheckingPhone] = useState(false)
  const [returningGuest, setReturningGuest] = useState(null)
  // null = unknown | false = new guest | object = returning guest

  const T = t[lang]
  const tableNum = getTableNum()

  // On mount: check localStorage for a previously saved guest profile
  // This is the reliable local fallback when Supabase RLS blocks anonymous inserts
  useEffect(() => {
    try {
      const raw = localStorage.getItem('guestProfile')
      if (!raw) return
      const profile = JSON.parse(raw)
      if (profile?.phone && profile?.name) {
        console.log('[CheckIn] Found local guest profile:', profile.name)
        setPhone(profile.phone)
        setName(profile.name)
        // Auto-show returning screen from local data (no network needed)
        setReturningGuest({
          name: profile.name,
          phone: profile.phone,
          visit_count: profile.visit_count || 1,
        })
      }
    } catch { /* ignore */ }
  }, [])

  const checkReturningGuest = async (phoneVal) => {
    const digits = phoneVal.replace(/\D/g, '')
    if (digits.length < 10) return
    setCheckingPhone(true)
    try {
      // 1. Try unified backend API first
      const res = await fetchWithRuntime(`/api/v1/customer/guest-sessions/lookup?phone=${encodeURIComponent(phoneVal.trim())}&tenant_id=${TENANT_ID}`)
      if (res.ok) {
        const { data } = await res.json()
        if (data) {
          console.log('[CheckIn] Returning guest found in backend:', data.name)
          setReturningGuest(data)
          setName(data.name)
          setCheckingPhone(false)
          return
        }
      }
    } catch { /* no backend record — try localStorage */ }

    // 2. Fallback: check localStorage guestProfile
    try {
      const raw = localStorage.getItem('guestProfile')
      if (raw) {
        const profile = JSON.parse(raw)
        const stored = profile?.phone?.replace(/\D/g, '')
        const entered = phoneVal.replace(/\D/g, '')
        if (stored && stored === entered) {
          console.log('[CheckIn] Returning guest found in localStorage:', profile.name)
          setReturningGuest({
            name: profile.name,
            phone: profile.phone,
            visit_count: profile.visit_count || 1,
          })
          setName(profile.name)
          setCheckingPhone(false)
          return
        }
      }
    } catch { /* ignore */ }

    setReturningGuest(false)
    setCheckingPhone(false)
  }

  const handleCheckIn = async (overrideName) => {
    const finalName = (overrideName || name).trim()
    if (!finalName) {
      setError(T.nameError)
      return
    }
    setIsLoading(true)
    setError('')

    try {
      // Upsert guest session if phone provided
      if (phone.trim()) {
        await submitMutation('/api/v1/runtime/mutations', {
          mutation_id: 'upsert_guest_session',
          idempotency_key: crypto.randomUUID(),
          payload: {
            tenant_id: TENANT_ID,
            phone: phone.trim(),
            name: finalName
          }
        })
      }
    } catch (err) {
      console.warn('[CheckIn] guest_sessions upsert failed (non-fatal):', err.message)
    }

    // Save guest profile to localStorage for reliable local returning-guest detection
    // This works even if Supabase RLS blocks anonymous inserts
    try {
      const existingRaw = localStorage.getItem('guestProfile')
      const existingProfile = existingRaw ? JSON.parse(existingRaw) : {}
      const newVisitCount = (existingProfile.visit_count || 0) + 1
      localStorage.setItem('guestProfile', JSON.stringify({
        name: finalName,
        phone: phone.trim(),
        visit_count: newVisitCount,
        lastVisitAt: new Date().toISOString(),
      }))
    } catch { /* ignore */ }

    const session = {
      name: finalName,
      phone: phone.trim(),
      guestCount,
      tableNum,
      lang,
      sessionId: `session_${Date.now()}`,
      checkedInAt: new Date().toISOString(),
    }
    localStorage.setItem('customerSession', JSON.stringify(session))
    setIsLoading(false)
    onComplete(session)
  }

  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', overflow: 'hidden' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <AnimatePresence mode="wait">
        {returningGuest && typeof returningGuest === 'object' ? (
          <ReturningScreen
            key="returning"
            guest={returningGuest}
            T={T}
            lang={lang}
            setLang={setLang}
            guestCount={guestCount}
            setGuestCount={setGuestCount}
            onContinue={handleCheckIn}
            onReset={() => { setReturningGuest(false); setName(''); }}
          />
        ) : (
          <NewGuestScreen
            key="new"
            T={T}
            lang={lang}
            setLang={setLang}
            tableNum={tableNum}
            name={name}
            setName={setName}
            phone={phone}
            setPhone={setPhone}
            guestCount={guestCount}
            setGuestCount={setGuestCount}
            error={error}
            isLoading={isLoading}
            checkingPhone={checkingPhone}
            isNewGuest={returningGuest}
            onCheckIn={handleCheckIn}
            onPhoneBlur={checkReturningGuest}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
