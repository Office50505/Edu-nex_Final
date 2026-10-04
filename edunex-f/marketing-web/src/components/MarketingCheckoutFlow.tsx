'use client'

import Image from 'next/image'
import { Check, ChevronLeft, LoaderCircle, LockKeyhole, X } from 'lucide-react'
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import styles from './MarketingCheckoutFlow.module.css'
import { OFFER_PRICE } from '@/lib/pricing'

const BASE_PATH = '/marketing-web'
const SESSION_KEY = 'skillomateMarketingCheckoutSession'
const AWAITING_KEY = 'skillomateMarketingAwaitingPayment'

type Stage = 'account' | 'otp' | 'checking' | 'pending' | 'success' | null
type Pricing = { gateway: string; checkoutEnabled: boolean; oneTimeAmountPaise: number; accessDays: number }
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

export default function MarketingCheckoutFlow() {
  const [pricing, setPricing] = useState<Pricing | null>(null)
  const [stage, setStage] = useState<Stage>(null)
  const [bearer, setBearer] = useState('')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const finishingRef = useRef(false)
  const checkingRef = useRef(false)

  useEffect(() => {
    void api<Pricing>('/api/onboarding/config').then((data) => {
      if (data.gateway === 'phonepe' && data.checkoutEnabled && Number.isSafeInteger(data.oneTimeAmountPaise) && data.oneTimeAmountPaise > 0) setPricing(data)
      else setMessage(`The ${OFFER_PRICE} PhonePe offer is unavailable right now.`)
    }).catch(() => setMessage(`Unable to load the ${OFFER_PRICE} offer. Please retry.`))
  }, [])

  useEffect(() => {
    const savedBearer = sessionStorage.getItem(SESSION_KEY) || ''
    setBearer(savedBearer)
    const awaitingPayment = Boolean(savedBearer && sessionStorage.getItem(AWAITING_KEY))
    if (awaitingPayment) setStage('checking')

    const openFromLink = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest('a[href]')
      if (!anchor || new URL(anchor.getAttribute('href') || '', window.location.href).hash !== '#checkout') return
      event.preventDefault()
      if (finishingRef.current) return
      setMessage('')
      setStage(sessionStorage.getItem(SESSION_KEY)
        ? sessionStorage.getItem(AWAITING_KEY) ? 'checking' : 'otp'
        : 'account')
    }
    document.addEventListener('click', openFromLink)
    if (window.location.hash === '#checkout') {
      setStage(awaitingPayment ? 'checking' : savedBearer ? 'otp' : 'account')
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
    setMessage('Preparing your verified signup...')
    try {
      const result = await api<{ code: string }>('/api/onboarding/handoff', {}, token)
      if (!result.code) throw new Error('Your signup link is not ready. Please check payment status again.')
      setStage('success')
      window.setTimeout(() => {
        sessionStorage.removeItem(SESSION_KEY)
        sessionStorage.removeItem(AWAITING_KEY)
        window.location.assign(`/signup#onboarding=${encodeURIComponent(result.code)}`)
      }, 900)
    } catch (error) {
      finishingRef.current = false
      throw error
    }
  }, [])

  const checkPayment = useCallback(async (token = bearer, manual = false) => {
    if (!token || busyRef.current || finishingRef.current || checkingRef.current) return
    checkingRef.current = true
    if (manual) setBusy(true)
    try {
      const status = await api<{ accessGranted?: boolean }>('/api/onboarding/status', undefined, token)
      if (status.accessGranted) await finish(token)
      else if (manual) {
        setStage('pending')
        setMessage('PhonePe has not confirmed the payment yet. Please wait a moment and check again.')
      }
    } catch (error) {
      setStage('pending')
      setMessage(error instanceof Error ? error.message : 'Unable to check payment status.')
    } finally {
      checkingRef.current = false
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
    const status = await api<{ accessGranted?: boolean }>('/api/onboarding/status', undefined, token)
    if (status.accessGranted) { await finish(token); return }
    setMessage('Opening secure PhonePe checkout...')
    const checkout = await api<{ gateway: string; redirectUrl: string }>('/api/onboarding/checkout', {
      paymentType: 'one_time',
      returnUrl: `${window.location.origin}${BASE_PATH}/?payment=return`,
    }, token)
    if (checkout.gateway !== 'phonepe' || !checkout.redirectUrl) throw new Error('Secure PhonePe checkout is unavailable.')
    sessionStorage.setItem(AWAITING_KEY, '1')
    window.location.assign(checkout.redirectUrl)
  }, [finish])

  const sendOtp = async (event: FormEvent) => {
    event.preventDefault()
    if (busyRef.current) return
    if (phone.length !== 10) return setMessage('Enter a valid 10-digit mobile number.')
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
    if ((!bearer && otp.length !== 6) || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setMessage('Verifying and preparing checkout...')
    try {
      if (bearer) {
        await openPhonePe(bearer)
        return
      }
      const proof = await api<{ signupToken: string }>('/api/auth/verify-mobile-otp', { mobileNumber: `+91${phone}`, mobileOtp: otp, checkoutFlow: 'marketing-onboarding' })
      const session = await api<{ token: string }>('/api/onboarding/session', { signupToken: proof.signupToken })
      sessionStorage.setItem(SESSION_KEY, session.token)
      setBearer(session.token)
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
    busyRef.current = true
    setBusy(true)
    try {
      await api('/api/auth/resend-mobile-otp', { mobileNumber: `+91${phone}`, checkoutFlow: 'marketing-onboarding' })
      setMessage('A new OTP was sent to your phone.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to resend OTP.')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  if (!stage) return null
  const price = pricing ? `₹${pricing.oneTimeAmountPaise / 100}` : OFFER_PRICE
  const canClose = stage === 'account' || stage === 'otp'

  return (
    <div className={styles.backdrop} role="presentation">
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="checkout-title">
        <header>
          {stage === 'otp' ? <button type="button" onClick={() => { sessionStorage.removeItem(SESSION_KEY); setBearer(''); setStage('account') }} aria-label="Change mobile number"><ChevronLeft /></button> : <span />}
          <Image src={`${BASE_PATH}/skillomate-logo-navbar.png`} alt="Skillomate" width={180} height={60} priority />
          {canClose ? <button type="button" onClick={() => setStage(null)} aria-label="Close checkout"><X /></button> : <span />}
        </header>

        {stage === 'account' ? <form className={styles.form} onSubmit={sendOtp}>
          <div className={styles.heading}>
            <p><LockKeyhole /> Secure phone verification</p>
            <h2 id="checkout-title">Login / Sign up</h2>
            <span>Verify your phone, then pay {price} once with PhonePe. Complete your account details after payment.</span>
          </div>
          <label>Mobile number<div className={styles.phone}><span>+91</span><input type="tel" value={phone} onChange={(event) => setPhone(cleanPhone(event.target.value))} inputMode="numeric" autoComplete="tel-national" maxLength={13} placeholder="98765 43210" autoFocus required /></div></label>
          <button className={styles.primary} type="submit" disabled={busy || !pricing || phone.length !== 10}>{busy ? <><LoaderCircle className={styles.spinner} /> Sending OTP</> : 'Send OTP'}</button>
          <p className={styles.status} role="status">{message}</p>
          <small>By continuing, you agree to the Privacy Policy and Terms. This is a one-time payment with no automatic renewal.</small>
          <a className={styles.signin} href="/login">Already have an account? Sign in</a>
        </form> : null}

        {stage === 'otp' ? <form className={styles.form} onSubmit={verifyAndPay}>
          <div className={styles.heading}>
            <p><LockKeyhole /> Phone verification</p>
            <h2 id="checkout-title">{bearer ? 'Phone verified' : 'Enter your OTP'}</h2>
            <span>{bearer ? 'Continue to secure PhonePe checkout.' : `We sent a 6-digit code to +91 ${phone}.`}</span>
          </div>
          {!bearer ? <label>One-time password<input className={styles.otp} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="• • • • • •" autoFocus /></label> : null}
          <button className={styles.primary} type="submit" disabled={busy || (!bearer && otp.length !== 6)}>{busy ? <><LoaderCircle className={styles.spinner} /> Please wait</> : bearer ? `Pay ${price}` : `Verify & pay ${price}`}</button>
          {!bearer ? <button className={styles.textButton} type="button" onClick={resendOtp} disabled={busy}>Resend OTP</button> : null}
          <p className={styles.status} role="status">{message}</p>
          <div className={styles.phonePe}><LockKeyhole /> Secure payment powered by PhonePe</div>
        </form> : null}

        {(stage === 'checking' || stage === 'pending' || stage === 'success') ? <div className={styles.state} aria-live="polite">
          <div className={stage === 'success' ? styles.success : styles.stateIcon}>{stage === 'success' ? <Check /> : <LoaderCircle className={stage === 'checking' ? styles.spinner : ''} />}</div>
          <p>PhonePe payment</p>
          <h2 id="checkout-title">{stage === 'success' ? 'Payment successful' : stage === 'pending' ? 'Payment confirmation pending' : 'Confirming your payment'}</h2>
          <span>{stage === 'success' ? 'Opening signup to complete your account details...' : stage === 'pending' ? 'If you completed payment, do not pay again. Check the status below.' : message || 'Please stay here while we securely confirm your payment.'}</span>
          {stage === 'pending' ? <button className={styles.primary} type="button" onClick={() => void checkPayment(bearer, true)} disabled={busy}>{busy ? 'Checking...' : 'Check payment status'}</button> : null}
          {stage === 'pending' ? <small className={styles.status}>{message}</small> : null}
        </div> : null}
      </section>
    </div>
  )
}
