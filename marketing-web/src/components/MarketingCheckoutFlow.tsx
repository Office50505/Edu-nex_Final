'use client'

import Image from 'next/image'
import { Check, ChevronLeft, LoaderCircle, LockKeyhole, X } from 'lucide-react'
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import styles from './MarketingCheckoutFlow.module.css'

const BASE_PATH = '/marketing-web'
const SESSION_KEY = 'skillomateMarketingCheckoutSession'
const AWAITING_KEY = 'skillomateMarketingAwaitingPayment'

type Stage = 'account' | 'otp' | 'checking' | 'pending' | 'success' | null
type Pricing = { gateway: string; checkoutEnabled: boolean; oneTimeAmountPaise: number; accessDays: number }
type AuthResult = { accessToken: string; refreshToken: string; user: unknown }

async function api<T>(path: string, body?: unknown, bearer = ''): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    signal: AbortSignal.timeout(20000),
    headers: {
      'Content-Type': 'application/json',
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || data.message || 'Request failed. Please retry.')
  return data as T
}

function cleanPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  return (digits.length > 10 && digits.startsWith('91') ? digits.slice(2) : digits).slice(0, 10)
}

function saveAuth(data: AuthResult) {
  localStorage.setItem('edunexAccessToken', data.accessToken)
  localStorage.setItem('edunexRefreshToken', data.refreshToken)
  localStorage.setItem('edunexUser', JSON.stringify(data.user))
}

export default function MarketingCheckoutFlow() {
  const [pricing, setPricing] = useState<Pricing | null>(null)
  const [stage, setStage] = useState<Stage>(null)
  const [bearer, setBearer] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('other')
  const [otp, setOtp] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const finishingRef = useRef(false)

  useEffect(() => {
    void api<Pricing>('/api/onboarding/config').then((data) => {
      if (data.gateway === 'phonepe' && data.checkoutEnabled && data.oneTimeAmountPaise === 29900) setPricing(data)
      else setMessage('The ₹299 PhonePe offer is unavailable right now.')
    }).catch(() => setMessage('Unable to load the ₹299 offer. Please retry.'))
  }, [])

  useEffect(() => {
    const savedBearer = sessionStorage.getItem(SESSION_KEY) || ''
    setBearer(savedBearer)
    if (savedBearer && sessionStorage.getItem(AWAITING_KEY)) setStage('checking')

    const openFromLink = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest('a[href]')
      if (!anchor || new URL(anchor.getAttribute('href') || '', window.location.href).hash !== '#checkout') return
      event.preventDefault()
      setMessage('')
      setStage('account')
    }
    document.addEventListener('click', openFromLink)
    if (window.location.hash === '#checkout') {
      setStage('account')
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    }
    return () => document.removeEventListener('click', openFromLink)
  }, [])

  useEffect(() => {
    if (!stage) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (stage === 'account' || stage === 'otp')) setStage(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [stage])

  const finish = useCallback(async (token: string) => {
    if (finishingRef.current) return
    finishingRef.current = true
    setStage('checking')
    setMessage('Creating your Skillomate account...')
    try {
      const result = await api<AuthResult>('/api/onboarding/complete', {}, token)
      saveAuth(result)
      sessionStorage.removeItem(SESSION_KEY)
      sessionStorage.removeItem(AWAITING_KEY)
      setStage('success')
      window.setTimeout(() => window.location.assign('/'), 900)
    } catch (error) {
      finishingRef.current = false
      throw error
    }
  }, [])

  const checkPayment = useCallback(async (token = bearer, manual = false) => {
    if (!token || busyRef.current || finishingRef.current) return
    if (manual) setBusy(true)
    try {
      const status = await api<{ accessGranted?: boolean }>('/api/onboarding/status', undefined, token)
      if (status.accessGranted) await finish(token)
      else if (manual) {
        setStage('pending')
        setMessage('PhonePe has not confirmed the payment yet. Please wait a moment and check again.')
      }
    } catch (error) {
      if (manual) setMessage(error instanceof Error ? error.message : 'Unable to check payment status.')
    } finally {
      if (manual) setBusy(false)
    }
  }, [bearer, finish])

  useEffect(() => {
    if (!bearer || (stage !== 'checking' && stage !== 'pending')) return
    let stopped = false
    const run = () => { if (!stopped && document.visibilityState === 'visible') void checkPayment(bearer) }
    run()
    const interval = window.setInterval(run, 3000)
    const timeout = window.setTimeout(() => { if (!stopped && !finishingRef.current) setStage('pending') }, 120000)
    window.addEventListener('focus', run)
    document.addEventListener('visibilitychange', run)
    return () => {
      stopped = true
      window.clearInterval(interval)
      window.clearTimeout(timeout)
      window.removeEventListener('focus', run)
      document.removeEventListener('visibilitychange', run)
    }
  }, [bearer, checkPayment, stage])

  const openPhonePe = useCallback(async (token: string) => {
    setMessage('Opening secure PhonePe checkout...')
    const checkout = await api<{ gateway: string; redirectUrl: string }>('/api/onboarding/checkout', {
      paymentType: 'one_time',
      returnUrl: `${window.location.origin}${BASE_PATH}/?payment=return`,
    }, token)
    if (checkout.gateway !== 'phonepe' || !checkout.redirectUrl) throw new Error('Secure PhonePe checkout is unavailable.')
    sessionStorage.setItem(AWAITING_KEY, '1')
    window.location.assign(checkout.redirectUrl)
  }, [])

  const sendOtp = async (event: FormEvent) => {
    event.preventDefault()
    if (busyRef.current) return
    const numericAge = Number(age)
    if (fullName.trim().length < 2) return setMessage('Enter your full name.')
    if (phone.length !== 10) return setMessage('Enter a valid 10-digit mobile number.')
    if (password.length < 8) return setMessage('Password must be at least 8 characters.')
    if (!Number.isInteger(numericAge) || numericAge < 13 || numericAge > 80) return setMessage('Age must be between 13 and 80.')
    busyRef.current = true
    setBusy(true)
    setMessage('Sending OTP...')
    try {
      await api('/api/auth/send-mobile-otp', { mobileNumber: `+91${phone}`, checkoutFlow: 'marketing-onboarding' })
      setOtp('')
      setStage('otp')
      setMessage('Enter the OTP sent to your phone.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to send OTP.')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const verifyAndPay = async (event: FormEvent) => {
    event.preventDefault()
    if (otp.length !== 6 || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setMessage('Verifying and preparing checkout...')
    try {
      const proof = await api<{ signupToken: string }>('/api/auth/verify-mobile-otp', { mobileNumber: `+91${phone}`, mobileOtp: otp, checkoutFlow: 'marketing-onboarding' })
      const session = await api<{ token: string }>('/api/onboarding/session', { signupToken: proof.signupToken })
      await api('/api/onboarding/profile', { fullName: fullName.trim(), password, age: Number(age), gender }, session.token)
      sessionStorage.setItem(SESSION_KEY, session.token)
      setBearer(session.token)
      setPassword('')
      await openPhonePe(session.token)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to continue to PhonePe.')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const resendOtp = async () => {
    if (busyRef.current) return
    setBusy(true)
    try {
      await api('/api/auth/resend-mobile-otp', { mobileNumber: `+91${phone}`, checkoutFlow: 'marketing-onboarding' })
      setMessage('A new OTP was sent to your phone.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to resend OTP.')
    } finally {
      setBusy(false)
    }
  }

  if (!stage) return null
  const price = pricing ? `₹${pricing.oneTimeAmountPaise / 100}` : '₹299'
  const canClose = stage === 'account' || stage === 'otp'

  return (
    <div className={styles.backdrop} role="presentation">
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="checkout-title">
        <header>
          {stage === 'otp' ? <button type="button" onClick={() => setStage('account')} aria-label="Back to account details"><ChevronLeft /></button> : <span />}
          <Image src={`${BASE_PATH}/skillomate-logo-navbar.png`} alt="Skillomate" width={180} height={60} priority />
          {canClose ? <button type="button" onClick={() => setStage(null)} aria-label="Close checkout"><X /></button> : <span />}
        </header>

        {stage === 'account' ? <form className={styles.form} onSubmit={sendOtp}>
          <div className={styles.heading}>
            <p><LockKeyhole /> Secure account setup</p>
            <h2 id="checkout-title">Create your account</h2>
            <span>Set up your details, verify your phone, then pay {price} once with PhonePe.</span>
          </div>
          <label>Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" placeholder="Your full name" autoFocus /></label>
          <label>Mobile number<div className={styles.phone}><span>+91</span><input value={phone} onChange={(event) => setPhone(cleanPhone(event.target.value))} inputMode="numeric" autoComplete="tel-national" placeholder="98765 43210" /></div></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="Minimum 8 characters" /></label>
          <div className={styles.row}>
            <label>Age<input value={age} onChange={(event) => setAge(event.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" placeholder="18" /></label>
            <fieldset><legend>Gender</legend><div className={styles.segmented}>{['male', 'female', 'other'].map((item) => <button className={gender === item ? styles.selected : ''} type="button" key={item} onClick={() => setGender(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div></fieldset>
          </div>
          <button className={styles.primary} type="submit" disabled={busy || !pricing}>{busy ? <><LoaderCircle className={styles.spinner} /> Sending OTP</> : 'Continue securely'}</button>
          <p className={styles.status} role="status">{message}</p>
          <small>By continuing, you agree to the Privacy Policy and Terms. This is a one-time payment with no automatic renewal.</small>
          <a className={styles.signin} href="/login">Already have an account? Sign in</a>
        </form> : null}

        {stage === 'otp' ? <form className={styles.form} onSubmit={verifyAndPay}>
          <div className={styles.heading}>
            <p><LockKeyhole /> Phone verification</p>
            <h2 id="checkout-title">Enter your OTP</h2>
            <span>We sent a 6-digit code to +91 {phone}.</span>
          </div>
          <label>One-time password<input className={styles.otp} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="• • • • • •" autoFocus /></label>
          <button className={styles.primary} type="submit" disabled={busy || otp.length !== 6}>{busy ? <><LoaderCircle className={styles.spinner} /> Please wait</> : `Verify & pay ${price}`}</button>
          <button className={styles.textButton} type="button" onClick={resendOtp} disabled={busy}>Resend OTP</button>
          <p className={styles.status} role="status">{message}</p>
          <div className={styles.phonePe}><LockKeyhole /> Secure payment powered by PhonePe</div>
        </form> : null}

        {(stage === 'checking' || stage === 'pending' || stage === 'success') ? <div className={styles.state} aria-live="polite">
          <div className={stage === 'success' ? styles.success : styles.stateIcon}>{stage === 'success' ? <Check /> : <LoaderCircle className={stage === 'checking' ? styles.spinner : ''} />}</div>
          <p>PhonePe payment</p>
          <h2 id="checkout-title">{stage === 'success' ? 'You’re ready to learn' : stage === 'pending' ? 'Payment confirmation pending' : 'Confirming your payment'}</h2>
          <span>{stage === 'success' ? 'Your account is ready. Opening Skillomate...' : stage === 'pending' ? 'If you completed payment, do not pay again. Check the status below.' : message || 'Please stay here while we securely confirm your payment.'}</span>
          {stage === 'pending' ? <button className={styles.primary} type="button" onClick={() => void checkPayment(bearer, true)} disabled={busy}>{busy ? 'Checking...' : 'Check payment status'}</button> : null}
          {stage === 'pending' ? <small className={styles.status}>{message}</small> : null}
        </div> : null}
      </section>
    </div>
  )
}
