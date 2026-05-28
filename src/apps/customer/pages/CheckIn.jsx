/**
 * CheckIn.jsx — Gusto-themed onboarding and customer check-in screen
 */

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../../lib/supabase'
import { getTableNum } from '../utils/tableNum'

const TENANT_ID = '11111111-1111-1111-1111-111111111111'

const maskPhone = (p = '') => {
  const digits = p.replace(/\D/g, '')
  if (digits.length < 4) return p
  return p.slice(0, 4) + '•'.repeat(Math.max(0, p.length - 7)) + p.slice(-3)
}

function LangToggle({ lang, setLang }) {
  return (
    <div style={{
      display: 'flex', gap: 4,
      background: 'rgba(241, 245, 249, 0.8)',
      borderRadius: 20, padding: 4,
      border: '1px solid rgba(226, 232, 240, 0.8)',
      width: 'fit-content',
      alignSelf: 'center',
      marginBottom: 24,
      boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
    }}>
      {['EN', 'HI'].map(l => (
        <motion.button
          key={l}
          onClick={() => setLang(l)}
          whileTap={{ scale: 0.95 }}
          style={{
            padding: '6px 14px', borderRadius: 16, fontSize: 12, fontWeight: 700,
            cursor: 'pointer', border: 'none', transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            background: lang === l ? 'linear-gradient(135deg, #FF4D4D 0%, #D91A2A 100%)' : 'transparent',
            color: lang === l ? '#FFFFFF' : '#64748B',
            boxShadow: lang === l ? '0 4px 10px rgba(217, 26, 42, 0.2)' : 'none'
          }}
        >{l === 'HI' ? 'हि' : l}</motion.button>
      ))}
    </div>
  )
}

function ReturningScreen({ guest, lang, setLang, guestCount, setGuestCount, selectedAvatar, setSelectedAvatar, onContinue, onReset }) {
  return (
    <motion.div
      key="returning"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      style={{
        background: '#F8FAFC', minHeight: '100vh', display: 'flex',
        flexDirection: 'column', padding: '24px 20px 40px',
        maxWidth: 430, margin: '0 auto', boxSizing: 'border-box'
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 20, color: '#D91A2A' }}>🍴</span>
          <span style={{ fontSize: 20, fontWeight: 900, color: '#D91A2A', letterSpacing: '0.05em', fontFamily: 'Outfit, sans-serif' }}>GUSTO</span>
        </div>
      </div>

      <LangToggle lang={lang} setLang={setLang} />

      {/* Welcome Title */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <motion.div 
          animate={{ scale: [0.95, 1, 0.95] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            width: 84, height: 84, borderRadius: '50%', background: '#FEF2F2',
            border: '2px solid #FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 38, margin: '0 auto 16px',
            boxShadow: '0 10px 24px rgba(217, 26, 42, 0.08)'
          }}
        >
          {selectedAvatar}
        </motion.div>
        <h2 style={{ color: '#0F172A', fontSize: 24, fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>
          Welcome Back, {guest.name}!
        </h2>
        <p style={{ color: '#64748B', fontSize: 14, marginTop: 6 }}>
          You've dined with us <span style={{ color: '#D91A2A', fontWeight: 700 }}>{guest.visit_count || 1} time{(guest.visit_count || 1) > 1 ? 's' : ''}</span>.
        </p>
      </div>

      {/* Main card */}
      <div style={{ background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 24, padding: 22, boxShadow: '0 10px 30px rgba(15, 23, 42, 0.03)', marginBottom: 20 }}>
        <div style={{ color: '#D91A2A', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 16, fontWeight: 800 }}>
          AUTHENTICATED PROFILE
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 18 }}>👤</span>
          <span style={{ color: '#0F172A', fontSize: 15, fontWeight: 700 }}>{guest.name}</span>
        </div>
        {guest.phone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18 }}>📱</span>
            <span style={{ color: '#64748B', fontSize: 14, fontWeight: 500 }}>{maskPhone(guest.phone)}</span>
          </div>
        )}
      </div>

      {/* Guests modifier */}
      <div style={{ background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 24, padding: 20, boxShadow: '0 10px 30px rgba(15, 23, 42, 0.03)', marginBottom: 30 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#1E293B' }}>Guests Joining</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <motion.button
              whileTap={{ scale: 0.88 }}
              whileHover={{ scale: 1.05 }}
              onClick={() => setGuestCount(c => Math.max(1, c - 1))}
              style={{ width: 38, height: 38, borderRadius: '50%', background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#0F172A', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, boxShadow: '0 2px 6px rgba(0,0,0,0.03)', transition: 'all 0.2s' }}
            >−</motion.button>
            <span style={{ color: '#0F172A', fontSize: 17, fontWeight: 800, minWidth: 20, textAlign: 'center' }}>{guestCount}</span>
            <motion.button
              whileTap={{ scale: 0.88 }}
              whileHover={{ scale: 1.05 }}
              onClick={() => setGuestCount(c => Math.min(8, c + 1))}
              style={{ width: 38, height: 38, borderRadius: '50%', background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#0F172A', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, boxShadow: '0 2px 6px rgba(0,0,0,0.03)', transition: 'all 0.2s' }}
            >+</motion.button>
          </div>
        </div>
      </div>

      {/* Button */}
      <div style={{ marginTop: 'auto' }}>
        <motion.button
          onClick={() => onContinue(guest.name)}
          whileHover={{ scale: 1.02, boxShadow: '0 12px 30px rgba(217, 26, 42, 0.32)' }}
          whileTap={{ scale: 0.98 }}
          style={{
            width: '100%', background: 'linear-gradient(135deg, #FF4D4D 0%, #D91A2A 100%)', border: 'none', borderRadius: 24,
            padding: 16, color: '#FFFFFF', fontWeight: 700, fontSize: 16,
            cursor: 'pointer', boxShadow: '0 8px 24px rgba(217, 26, 42, 0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
          }}
        >
          Join Table & Browse Menu →
        </motion.button>
        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <motion.button
            onClick={onReset}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{ background: 'none', border: 'none', color: '#64748B', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
          >
            Not you? Start fresh
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}

function NewGuestScreen({
  tableNum, lang, setLang,
  name, setName, phone, setPhone,
  guestCount, setGuestCount,
  selectedAvatar, setSelectedAvatar,
  error, isLoading, checkingPhone,
  onCheckIn, onPhoneBlur
}) {
  const [nameFocused, setNameFocused] = useState(false)
  const [phoneFocused, setPhoneFocused] = useState(false)

  return (
    <motion.div
      key="new-guest"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      style={{
        background: '#F8FAFC', minHeight: '100vh', display: 'flex',
        flexDirection: 'column', padding: '24px 20px 40px',
        maxWidth: 430, margin: '0 auto', boxSizing: 'border-box'
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 20, color: '#D91A2A' }}>🍴</span>
          <span style={{ fontSize: 20, fontWeight: 900, color: '#D91A2A', letterSpacing: '0.05em', fontFamily: 'Outfit, sans-serif' }}>GUSTO</span>
        </div>
      </div>

      <LangToggle lang={lang} setLang={setLang} />

      {/* QR Validated Banner */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <motion.div 
          animate={{ scale: [0.98, 1.02, 0.98] }}
          transition={{ duration: 4, repeat: Infinity }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '6px 14px', borderRadius: 20, color: '#065F46', fontSize: 12, fontWeight: 700, boxShadow: '0 4px 12px rgba(16, 185, 129, 0.05)' }}
        >
          <span style={{ fontSize: 12, color: '#10B981', fontWeight: 900 }}>✓</span> QR Signature Validated
        </motion.div>
      </div>

      {/* Welcome Title */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', marginBottom: 8, fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.02em' }}>Welcome to Gusto</h1>
        <p style={{ color: '#64748B', fontSize: 14, fontWeight: 500 }}>Let's get you seated at <span style={{ color: '#D91A2A', fontWeight: 700 }}>Table {tableNum}</span>.</p>
      </div>

      {/* Form container */}
      <div style={{ background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 24, padding: 24, boxShadow: '0 10px 30px rgba(15, 23, 42, 0.03)', marginBottom: 20 }}>
        {/* Nickname input */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#1E293B', marginBottom: 8 }}>Who's joining?</label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: nameFocused ? '#D91A2A' : '#94A3B8', fontSize: 16, transition: 'color 0.2s' }}>👤</span>
            <input
              type="text"
              value={name}
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
              onChange={e => setName(e.target.value)}
              placeholder="Your Nickname"
              style={{ 
                width: '100%', 
                padding: '14px 16px 14px 44px', 
                border: nameFocused ? '1.5px solid #D91A2A' : '1px solid #E2E8F0', 
                borderRadius: 16, 
                fontSize: 15, 
                fontWeight: 500,
                outline: 'none', 
                background: nameFocused ? '#FFFFFF' : '#F8FAFC', 
                color: '#0F172A', 
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)', 
                boxSizing: 'border-box',
                boxShadow: nameFocused ? '0 0 0 4px rgba(217, 26, 42, 0.06), 0 4px 12px rgba(15, 23, 42, 0.02)' : 'none'
              }}
            />
          </div>
          {error && <div style={{ color: '#D91A2A', fontSize: 12, marginTop: 6, fontWeight: 700 }}>{error}</div>}
        </div>

        {/* Optional phone check */}
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#1E293B', marginBottom: 8 }}>Phone Number <span style={{ fontWeight: 500, color: '#64748B', fontSize: 12 }}>(Optional)</span></label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: phoneFocused ? '#D91A2A' : '#94A3B8', fontSize: 16, transition: 'color 0.2s' }}>📱</span>
            <input
              type="tel"
              value={phone}
              onFocus={() => setPhoneFocused(true)}
              onBlur={(e) => { setPhoneFocused(false); onPhoneBlur(e.target.value); }}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. +91 99000 00000"
              style={{ 
                width: '100%', 
                padding: '14px 16px 14px 44px', 
                border: phoneFocused ? '1.5px solid #D91A2A' : '1px solid #E2E8F0', 
                borderRadius: 16, 
                fontSize: 15, 
                fontWeight: 500,
                outline: 'none', 
                background: phoneFocused ? '#FFFFFF' : '#F8FAFC', 
                color: '#0F172A', 
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)', 
                boxSizing: 'border-box',
                boxShadow: phoneFocused ? '0 0 0 4px rgba(217, 26, 42, 0.06), 0 4px 12px rgba(15, 23, 42, 0.02)' : 'none'
              }}
            />
            {checkingPhone && <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, borderRadius: '50%', border: '2px solid #D91A2A', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />}
          </div>
        </div>
      </div>

      {/* Guests Joining modifier */}
      <div style={{ background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 24, padding: 18, boxShadow: '0 10px 30px rgba(15, 23, 42, 0.03)', marginBottom: 30, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#1E293B' }}>Party Size</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <motion.button 
            whileTap={{ scale: 0.88 }}
            whileHover={{ scale: 1.05 }}
            onClick={() => setGuestCount(c => Math.max(1, c - 1))} 
            style={{ width: 34, height: 34, borderRadius: '50%', background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#0F172A', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, boxShadow: '0 2px 6px rgba(0,0,0,0.03)', transition: 'all 0.2s' }}
          >−</motion.button>
          <span style={{ color: '#0F172A', fontSize: 16, fontWeight: 800, minWidth: 16, textAlign: 'center' }}>{guestCount}</span>
          <motion.button 
            whileTap={{ scale: 0.88 }}
            whileHover={{ scale: 1.05 }}
            onClick={() => setGuestCount(c => Math.min(8, c + 1))} 
            style={{ width: 34, height: 34, borderRadius: '50%', background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#0F172A', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, boxShadow: '0 2px 6px rgba(0,0,0,0.03)', transition: 'all 0.2s' }}
          >+</motion.button>
        </div>
      </div>

      {/* Main button */}
      <div style={{ marginTop: 'auto' }}>
        <motion.button
          onClick={() => onCheckIn()}
          disabled={isLoading}
          whileHover={{ scale: 1.02, boxShadow: '0 12px 30px rgba(217, 26, 42, 0.32)' }}
          whileTap={{ scale: 0.98 }}
          style={{ width: '100%', background: 'linear-gradient(135deg, #FF4D4D 0%, #D91A2A 100%)', border: 'none', borderRadius: 24, padding: '16px 24px', color: '#FFFFFF', fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 8px 24px rgba(217, 26, 42, 0.2)', transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          {isLoading ? 'Checking in...' : 'Join Table & Browse Menu →'}
        </motion.button>
        <div style={{ color: 'rgba(100,116,139,0.7)', fontSize: 12, textAlign: 'center', marginTop: 16, fontWeight: 500 }}>
          🔒 Your data is private and secure
        </div>
      </div>
    </motion.div>
  )
}

export default function CheckIn({ onComplete }) {
  const [lang, setLang] = useState('EN')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [guestCount, setGuestCount] = useState(2)
  const [selectedAvatar, setSelectedAvatar] = useState('🦁')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [checkingPhone, setCheckingPhone] = useState(false)
  const [returningGuest, setReturningGuest] = useState(null)

  const tableNum = getTableNum()

  useEffect(() => {
    try {
      const raw = localStorage.getItem('guestProfile')
      if (!raw) return
      const profile = JSON.parse(raw)
      if (profile?.phone && profile?.name) {
        setPhone(profile.phone)
        setName(profile.name)
        if (profile.avatar) setSelectedAvatar(profile.avatar)
        setReturningGuest({
          name: profile.name,
          phone: profile.phone,
          visit_count: profile.visit_count || 1,
          tableNum: tableNum
        })
      }
    } catch { /* ignore */ }
  }, [tableNum])

  const checkReturningGuest = async (phoneVal) => {
    const digits = phoneVal.replace(/\D/g, '')
    if (digits.length < 10) return
    setCheckingPhone(true)
    try {
      const { data } = await supabase
        .from('guest_sessions')
        .select('name, phone, visit_count')
        .eq('tenant_id', TENANT_ID)
        .eq('phone', phoneVal.trim())
        .single()

      if (data) {
        setReturningGuest(data)
        setName(data.name)
        setCheckingPhone(false)
        return
      }
    } catch { /* ignore */ }

    try {
      const raw = localStorage.getItem('guestProfile')
      if (raw) {
        const profile = JSON.parse(raw)
        const stored = profile?.phone?.replace(/\D/g, '')
        const entered = phoneVal.replace(/\D/g, '')
        if (stored && stored === entered) {
          setReturningGuest({
            name: profile.name,
            phone: profile.phone,
            visit_count: profile.visit_count || 1,
            tableNum: tableNum
          })
          setName(profile.name)
          if (profile.avatar) setSelectedAvatar(profile.avatar)
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
      setError('Please enter your name to continue')
      return
    }
    setIsLoading(true)
    setError('')

    try {
      if (phone.trim()) {
        const { data: existing } = await supabase
          .from('guest_sessions')
          .select('id, visit_count')
          .eq('tenant_id', TENANT_ID)
          .eq('phone', phone.trim())
          .single()

        if (existing) {
          await supabase
            .from('guest_sessions')
            .update({
              name: finalName,
              visit_count: (existing.visit_count || 1) + 1,
              last_visit_at: new Date().toISOString(),
            })
            .eq('id', existing.id)
        } else {
          await supabase
            .from('guest_sessions')
            .insert({
              tenant_id: TENANT_ID,
              phone: phone.trim(),
              name: finalName,
              visit_count: 1,
            })
        }
      }
    } catch (err) {
      console.warn('[CheckIn] guest_sessions upsert failed:', err.message)
    }

    try {
      const existingRaw = localStorage.getItem('guestProfile')
      const existingProfile = existingRaw ? JSON.parse(existingRaw) : {}
      const newVisitCount = (existingProfile.visit_count || 0) + 1
      localStorage.setItem('guestProfile', JSON.stringify({
        name: finalName,
        phone: phone.trim(),
        visit_count: newVisitCount,
        avatar: selectedAvatar,
        lastVisitAt: new Date().toISOString(),
      }))
    } catch { /* ignore */ }

    const session = {
      name: finalName,
      phone: phone.trim(),
      guestCount,
      avatar: selectedAvatar,
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
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', overflow: 'hidden', background: '#F8FAFC' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } .hide-scrollbar::-webkit-scrollbar { display: none; }`}</style>
      <AnimatePresence mode="wait">
        {returningGuest && typeof returningGuest === 'object' ? (
          <ReturningScreen
            key="returning"
            guest={returningGuest}
            lang={lang}
            setLang={setLang}
            guestCount={guestCount}
            setGuestCount={setGuestCount}
            selectedAvatar={selectedAvatar}
            setSelectedAvatar={setSelectedAvatar}
            onContinue={handleCheckIn}
            onReset={() => { setReturningGuest(false); setName(''); }}
          />
        ) : (
          <NewGuestScreen
            key="new"
            tableNum={tableNum}
            lang={lang}
            setLang={setLang}
            name={name}
            setName={setName}
            phone={phone}
            setPhone={setPhone}
            guestCount={guestCount}
            setGuestCount={setGuestCount}
            selectedAvatar={selectedAvatar}
            setSelectedAvatar={setSelectedAvatar}
            error={error}
            isLoading={isLoading}
            checkingPhone={checkingPhone}
            onCheckIn={handleCheckIn}
            onPhoneBlur={checkReturningGuest}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
