'use client'

import Image from 'next/image'
import { Check, ChevronLeft, LoaderCircle, LockKeyhole, X } from 'lucide-react'
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import styles from './MarketingCheckoutFlow.module.css'
import { OFFER_PRICE } from '@/lib/pricing'
import { MARKETING_BASE_PATH } from '@/lib/links'

const SESSION_KEY = 'skillomateMarketingCheckoutSession'
const AWAITING_KEY = 'skillomateMarketingAwaitingPayment'

type Stage = 'account' | 'otp' | 'checking' | 'pending' | 'success' | null
type Pricing = { gateway: string; checkoutEnabled: boolean; oneTimeAmountPaise: number; accessDays: number }
type PaymentStatus = { accessGranted?: boolean; pendingCheckout?: boolean }
type ApiOptions = { timeoutMs?: number; timeoutMessage?: string }

const DEFAULT_API_TIMEOUT_MS = 20000
const OTP_API_TIMEOUT_MS = 60000
const OTP_TIMEOUT_MESSAGE = 'OTP request is taking longer than usual. Please try again in a moment.'
const CHECKOUT_HASHES = new Set(['#checkout', '#paywall'])

class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function isUnfinishedCheckoutError(error: unknown) {
  return error instanceof Error && /unfinished checkout|check payment status before paying again/i.test(error.message)
}

function isExpiredSessionError(error: unknown) {
  return error instanceof ApiError && error.status === 401
}

function apiPath(path: string) {
  const configuredBase = process.env.NEXT_PUBLIC_API_BASE_URL || ''
  if (configuredBase) return `${configuredBase}${path}`
  if (typeof window !== 'undefined' && window.location.hostname === 'skillomate.in') {
    return `https://api.skillomate.in${path}`
  }
  return path
}

async function api<T>(path: string, body?: unknown, bearer = '', options: ApiOptions = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(apiPath(path), {
      method: body === undefined ? 'GET' : 'POST',
      signal: AbortSignal.timeout(options.timeoutMs || DEFAULT_API_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error(options.timeoutMessage || 'Request timed out. Please retry.')
    }
    throw error
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(data.error || data.message || 'Request failed. Please retry.', response.status)
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
  const statusRequestRef = useRef<{ token: string; promise: Promise<PaymentStatus> } | null>(null)

  const resetExpiredSession = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(AWAITING_KEY)
    setBearer('')
    setOtp('')
    checkingRef.current = false
    finishingRef.current = false
    setBusy(false)
    setStage('account')
    setMessage('Your phone verification session expired. Please verify your phone again to continue.')
  }, [])

  const getStatus = useCallback((token: string) => {
    if (statusRequestRef.current?.token === token) return statusRequestRef.current.promise
    const promise = api<PaymentStatus>('/api/onboarding/status', undefined, token)
    const request = { token, promise }
    statusRequestRef.current = request
    void promise.finally(() => {
      if (statusRequestRef.current === request) statusRequestRef.current = null
    }).catch(() => {})
    return promise
  }, [])

  const resetPhone = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(AWAITING_KEY)
    setBearer('')
    setOtp('')
    checkingRef.current = false
    finishingRef.current = false
    setBusy(false)
    setStage('account')
    setMessage('')
  }, [])

  const closeCheckout = useCallback(() => {
    setStage(null)
    if (CHECKOUT_HASHES.has(window.location.hash)) {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    }
  }, [])

  useEffect(() => {
    void api<Pricing>('/api/onboarding/config').then((data) => {
      if (data.gateway === 'phonepe' && data.checkoutEnabled && Number.isSafeInteger(data.oneTimeAmountPaise) && data.oneTimeAmountPaise > 0) setPricing(data)
    }).catch(() => {
      // OTP verification can still proceed; checkout will surface provider/config errors later.
    })
  }, [])

  useEffect(() => {
    const savedBearer = sessionStorage.getItem(SESSION_KEY) || ''
    setBearer(savedBearer)
    const awaitingPayment = Boolean(savedBearer && sessionStorage.getItem(AWAITING_KEY))
    if (awaitingPayment) setStage('checking')

    const openFromLink = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest('a[href]')
      if (!anchor || !CHECKOUT_HASHES.has(new URL(anchor.getAttribute('href') || '', window.location.href).hash)) return
      event.preventDefault()
      if (finishingRef.current) return
      setMessage('')
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search + '#paywall')
      setStage(sessionStorage.getItem(SESSION_KEY)
        ? sessionStorage.getItem(AWAITING_KEY) ? 'checking' : 'otp'
        : 'account')
    }
    document.addEventListener('click', openFromLink)
    if (CHECKOUT_HASHES.has(window.location.hash)) {
      setStage(awaitingPayment ? 'checking' : savedBearer ? 'otp' : 'account')
    }
    return () => document.removeEventListener('click', openFromLink)
  }, [])

  useEffect(() => {
    if (!stage) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (stage === 'account' || stage === 'otp')) closeCheckout()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [closeCheckout, stage])

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
      const status = await getStatus(token)
      if (status.accessGranted) await finish(token)
      else if (status.pendingCheckout) {
        setStage('pending')
        setMessage('You already have a PhonePe checkout in progress. Check its status before starting another payment.')
      }
      else {
        sessionStorage.removeItem(AWAITING_KEY)
        setStage('otp')
        setMessage('Your previous PhonePe checkout expired. You can start a new payment now.')
      }
    } catch (error) {
      if (isExpiredSessionError(error)) {
        resetExpiredSession()
        return
      }
      setStage('pending')
      setMessage(error instanceof Error ? error.message : 'Unable to check payment status.')
    } finally {
      checkingRef.current = false
      if (manual) setBusy(false)
    }
  }, [bearer, finish, getStatus, resetExpiredSession])

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
    let status: PaymentStatus
    try {
      status = await getStatus(token)
    } catch (error) {
      if (isExpiredSessionError(error)) {
        resetExpiredSession()
        return
      }
      throw error
    }
    if (status.accessGranted) { await finish(token); return }
    if (status.pendingCheckout) {
      sessionStorage.setItem(AWAITING_KEY, '1')
      setStage('pending')
      setMessage('You already have a PhonePe checkout in progress. Check its status before starting another payment.')
      return
    }
    setMessage('Opening secure PhonePe checkout...')
    let checkout: { gateway: string; redirectUrl: string }
    try {
      checkout = await api<{ gateway: string; redirectUrl: string }>('/api/onboarding/checkout', {
        paymentType: 'one_time',
        returnUrl: `${window.location.origin}${MARKETING_BASE_PATH}/?payment=return`,
      }, token)
    } catch (error) {
      if (isExpiredSessionError(error)) {
        resetExpiredSession()
        return
      }
      if (isUnfinishedCheckoutError(error)) {
        sessionStorage.setItem(AWAITING_KEY, '1')
        setStage('pending')
        setMessage('You already have a PhonePe checkout in progress. Check its status before starting another payment.')
        return
      }
      throw error
    }
    if (checkout.gateway !== 'phonepe' || !checkout.redirectUrl) throw new Error('Secure PhonePe checkout is unavailable.')
    sessionStorage.setItem(AWAITING_KEY, '1')
    window.location.assign(checkout.redirectUrl)
  }, [finish, getStatus, resetExpiredSession])

  const sendOtp = async (event: FormEvent) => {
    event.preventDefault()
    if (busyRef.current) return
    if (phone.length !== 10) return setMessage('Enter a valid 10-digit mobile number.')
    busyRef.current = true
    setBusy(true)
    setMessage('Sending OTP...')
    try {
      await api('/api/auth/send-mobile-otp', { mobileNumber: `+91${phone}`, checkoutFlow: 'marketing-onboarding' }, '', {
        timeoutMs: OTP_API_TIMEOUT_MS,
        timeoutMessage: OTP_TIMEOUT_MESSAGE,
      })
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
      await api('/api/auth/resend-mobile-otp', { mobileNumber: `+91${phone}`, checkoutFlow: 'marketing-onboarding' }, '', {
        timeoutMs: OTP_API_TIMEOUT_MS,
        timeoutMessage: OTP_TIMEOUT_MESSAGE,
      })
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
          <Image src={`${MARKETING_BASE_PATH}/skillomate-logo-navbar.png`} alt="Skillomate" width={180} height={60} priority />
          {canClose ? <button type="button" onClick={closeCheckout} aria-label="Close checkout"><X /></button> : <span />}
        </header>

        {stage === 'account' ? <form className={styles.form} onSubmit={sendOtp}>
          <div className={styles.heading}>
            <p><LockKeyhole /> Secure phone verification</p>
            <h2 id="checkout-title">Login / Sign up</h2>
            <span>Verify your phone, then pay {price} once with PhonePe. Complete your account details after payment.</span>
          </div>
          <label>Mobile number<div className={styles.phone}><span>+91</span><input type="tel" value={phone} onChange={(event) => setPhone(cleanPhone(event.target.value))} inputMode="numeric" autoComplete="tel-national" maxLength={13} placeholder="98765 43210" autoFocus required /></div></label>
          <button className={styles.primary} type="submit" disabled={busy || phone.length !== 10}>{busy ? <><LoaderCircle className={styles.spinner} /> Sending OTP</> : 'Send OTP'}</button>
          <p className={styles.status} role="status">{message}</p>
          <small>By continuing, you agree to the Privacy Policy and Terms. This is a one-time payment with no automatic renewal.</small>
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
          {stage === 'pending' ? <div className={styles.stateActions}>
            <button className={styles.primary} type="button" onClick={() => void checkPayment(bearer, true)} disabled={busy}>{busy ? 'Checking...' : 'Check payment status'}</button>
            <button className={styles.secondary} type="button" onClick={resetPhone} disabled={busy}>Verify another phone</button>
            <a href="mailto:support@skillomate.in">Contact support</a>
          </div> : null}
          {stage === 'pending' ? <small className={styles.status}>{message}</small> : null}
        </div> : null}
      </section>
    </div>
  )
}
