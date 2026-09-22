import { useCallback, useEffect, useRef, useState } from "react";
import { openRazorpay } from "../lib/razorpayCheckout.js";
import { nationalPhoneDigits, pasteNationalPhone } from "../lib/authNavigation.js";
import { useViewportLock } from "../hooks/useViewportLock.js";
import "./ad-offer.css";
import { apiFetch } from "../lib/apiUrl.js";

const PREVIEW_URL = "/assets/skillomate-offer-preview.mp4";
const POSTER_URL = "https://d5yxyknp74yz8.cloudfront.net/courses/ai-influencer/lessons/lesson-01.webp";

async function api(url, body, bearer = "") {
  const response = await apiFetch(url, {
    signal: AbortSignal.timeout(20000),
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || "Request failed. Please retry.");
  return data;
}

function PaymentTransition({ stage, seconds, onCheck, checking }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.focus();
    return () => previous?.focus?.();
  }, []);
  const title = stage === "success" ? "Payment successful" : stage === "pending" ? "Payment confirmation is taking longer" : "Confirming your payment";
  return <div className="ad-payment-backdrop">
    <section className="ad-payment-modal" role="dialog" aria-modal="true" aria-labelledby="ad-payment-title" aria-describedby="ad-payment-description" tabIndex={-1} ref={dialog}
      onKeyDown={event => {
        if (event.key === "Tab") {
          const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), a[href]')];
          const next = event.shiftKey ? controls.at(-1) : controls[0];
          if (!controls.length || event.target === (event.shiftKey ? controls[0] : controls.at(-1)) || event.target === dialog.current) {
            event.preventDefault(); (next || dialog.current)?.focus();
          }
        }
      }}>
      <div className={`ad-payment-icon ${stage === "success" ? "is-success" : ""}`} aria-hidden="true">{stage === "success" ? "✓" : stage === "pending" ? "◷" : <span />}</div>
      <p className="ad-payment-eyebrow">Secure payment</p>
      <h2 id="ad-payment-title">{title}</h2>
      <p id="ad-payment-description" role="status" aria-live="polite">{stage === "success"
        ? `Redirecting in ${seconds} ${seconds === 1 ? "second" : "seconds"} to complete your account.`
        : stage === "pending" ? "If you have paid, please do not pay again. Check your status to continue safely."
        : "Please stay here while we verify your payment. You’ll continue automatically—no need to pay again."}</p>
      {stage === "pending" ? <div className="ad-payment-actions"><button type="button" onClick={onCheck} disabled={checking}>{checking ? "Checking…" : "Check payment status"}</button><a href="mailto:support@skillomate.in">Contact support</a></div> : null}
    </section>
  </div>;
}

function PreviewVideo({ modalOpen }) {
  const videoRef = useRef(null);
  const modalOpenRef = useRef(modalOpen);
  modalOpenRef.current = modalOpen;
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);

  const start = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (modalOpenRef.current) { video.pause(); return; }
    video.autoplay = true;
    void video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const onReady = () => start();
    const onPlaying = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onVolumeChange = () => setMuted(video.muted);
    const onTime = () => setProgress(Number.isFinite(video.duration) && video.duration > 0 ? Math.min(100, (video.currentTime / video.duration) * 100) : 0);

    video.src = PREVIEW_URL;
    video.addEventListener("loadedmetadata", onReady, { once: true });
    video.addEventListener("loadeddata", onReady, { once: true });
    video.addEventListener("canplay", onReady, { once: true });
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("volumechange", onVolumeChange);
    video.addEventListener("timeupdate", onTime);
    start();
    return () => {
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("volumechange", onVolumeChange);
      video.removeEventListener("timeupdate", onTime);
    };
  }, [start]);

  useEffect(() => {
    if (modalOpen) videoRef.current?.pause();
    else start();
  }, [modalOpen, start]);

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    if (video.paused) start();
  };

  return (
    <div className="ad-preview-player" onClick={toggleMute} style={{ cursor: "pointer" }}>
      <video ref={videoRef} src={PREVIEW_URL} autoPlay muted loop playsInline preload="auto" poster={POSTER_URL} />
      {!playing ? <button className="ad-preview-play" type="button" onClick={start} aria-label="Play course preview">▶</button> : null}
      <button className={`ad-mute-button${muted ? "" : " is-unmuted"}`} type="button" aria-label={muted ? "Unmute preview" : "Mute preview"}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="m17 9 4 6m0-6-4 6"/></svg>
      </button>
      <div className="ad-video-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
    </div>
  );
}

export function AdOfferPage() {
  const [bearer, setBearer] = useState(() => sessionStorage.getItem("skillomateAdSession") || "");
  const [modalStep, setModalStep] = useState(null);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [checkoutAttempt, setCheckoutAttempt] = useState(0);
  const [paymentStage, setPaymentStage] = useState(() => sessionStorage.getItem("skillomateAdAwaitingPayment") ? "checking" : null);
  const [redirect, setRedirect] = useState(null);
  const [seconds, setSeconds] = useState(3);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const statusRequestRef = useRef(null);
  const verifyingRef = useRef(false);
  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const handoffRef = useRef(null);
  useViewportLock(Boolean(modalStep || paymentStage));
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const getStatus = useCallback((token) => {
    if (statusRequestRef.current?.token === token) return statusRequestRef.current.promise;
    const promise = api("/api/onboarding/status", undefined, token);
    const request = { token, promise };
    statusRequestRef.current = request;
    void promise.finally(() => { if (statusRequestRef.current === request) statusRequestRef.current = null; }).catch(() => {});
    return promise;
  }, []);

  useEffect(() => {
    if (!redirect) return;
    const deadline = Date.now() + 3000;
    setSeconds(3);
    const timer = setInterval(() => setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 250);
    const navigate = setTimeout(() => {
      sessionStorage.removeItem("skillomateAdAwaitingPayment");
      window.location.assign(redirect);
    }, 3000);
    return () => { clearInterval(timer); clearTimeout(navigate); };
  }, [redirect]);

  useEffect(() => {
    document.title = "Special Offer | Skillomate";
  }, []);

  const finish = useCallback(async (token = bearer) => {
    if (handoffRef.current?.token === token) return handoffRef.current.promise;
    const promise = (async () => {
      const result = await api("/api/onboarding/handoff", {}, token);
      if (!mountedRef.current) return;
      if (!result.code) throw new Error("Your account link is not ready. Please check payment status again.");
      setModalStep(null);
      setPaymentStage("success");
      setRedirect(`/signup#onboarding=${encodeURIComponent(result.code)}`);
    })();
    handoffRef.current = { token, promise };
    try { await promise; }
    catch (error) { handoffRef.current = null; throw error; }
  }, [bearer]);

  // Provider confirmation can arrive after the checkout callback, or while the
  // customer is in their UPI app. Resume only after the server grants access.
  useEffect(() => {
    if (!bearer) return;
    let disposed = false;
    let checking = false;
    const check = async () => {
      if (disposed || checking || verifyingRef.current || handoffRef.current || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const state = await getStatus(bearer);
        if (!disposed && !verifyingRef.current && state.accessGranted) {
          await finish(bearer);
          clearInterval(timer);
        }
      } catch (_) {
        // Transient failures remain retryable; manual recovery stays available.
      } finally { checking = false; }
    };
    const timer = setInterval(() => void check(), 3000);
    const timeout = setTimeout(() => {
      clearInterval(timer);
      setPaymentStage(stage => stage === "checking" ? "pending" : stage);
    }, 120000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    void check();
    return () => {
      disposed = true;
      clearInterval(timer);
      clearTimeout(timeout);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [bearer, checkoutAttempt, finish, getStatus]);

  const showRecovery = useCallback((text) => {
    setModalStep(null);
    setRecovery(true);
    setMessage(text);
  }, []);

  const openCheckout = useCallback(async (token = bearer, monthlyConsent = false) => {
    if (!token || busyRef.current || handoffRef.current || paymentStage) return;
    busyRef.current = true;
    setBusy(true);
    setModalStep(null);
    let checkoutStarted = false;
    try {
      const [pricing, state] = await Promise.all([
        api("/api/onboarding/config"),
        getStatus(token),
      ]);
      if (state.accessGranted) return await finish(token);
      if (pricing.gateway !== "razorpay") throw new Error("Razorpay checkout is unavailable. Please retry later.");
      const paymentType = state.trialEligible === false ? "monthly" : "trial";
      if (paymentType === "monthly" && !monthlyConsent) { setModalStep("monthly"); return; }
      const checkout = await api("/api/onboarding/checkout", { paymentType, mandateConsent: true, monthlyConsent }, token);
      setCheckoutAttempt(attempt => attempt + 1);
      checkoutStarted = true;
      const result = await openRazorpay({ ...checkout, paymentType });
      setCheckoutAttempt(attempt => attempt + 1);
      if (handoffRef.current) return;
      sessionStorage.setItem("skillomateAdAwaitingPayment", "1");
      setRecovery(false);
      setPaymentStage("checking");
      verifyingRef.current = true;
      // Wait for any polling request before verifying; both acquire the same server lease.
      await statusRequestRef.current?.promise.catch(() => {});
      const verified = await api("/api/onboarding/verify", result, token);
      if (verified.accessGranted) await finish(token);
    } catch (error) {
      if (!handoffRef.current) {
        if (error.code === "CHECKOUT_DISMISSED") {
          sessionStorage.removeItem("skillomateAdAwaitingPayment");
          setPaymentStage(null);
          showRecovery(error.message);
          setCheckoutAttempt(attempt => attempt + 1);
        }
        else if (checkoutStarted || sessionStorage.getItem("skillomateAdAwaitingPayment")) {
          // Closing checkout (or a provider failure event) does not prove that
          // the initial payment failed. Verify before offering another payment.
          sessionStorage.setItem("skillomateAdAwaitingPayment", "1");
          setPaymentStage("checking");
          setCheckoutAttempt(attempt => attempt + 1);
        }
        else showRecovery(error.message || "Checkout could not be completed. Please retry.");
      }
    } finally {
      verifyingRef.current = false;
      busyRef.current = false;
      setBusy(false);
    }
  }, [bearer, finish, showRecovery, getStatus, paymentStage]);

  const begin = () => {
    if (bearer) void openCheckout(bearer);
    else {
      setMessage("");
      setModalStep("phone");
    }
  };

  const sendOtp = async (event, resend = false) => {
    event?.preventDefault();
    if (busyRef.current || phone.length !== 10) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("Sending OTP…");
    try {
      await api(`/api/auth/${resend ? "resend-mobile-otp" : "send-mobile-otp"}`, { mobileNumber: `+91${phone}` });
      setOtp("");
      setModalStep("otp");
      setMessage("Enter the OTP sent to your phone.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const verifyOtp = async (event) => {
    event.preventDefault();
    if (busyRef.current || otp.length !== 6) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("Verifying…");
    try {
      const proof = await api("/api/auth/verify-mobile-otp", { mobileNumber: `+91${phone}`, mobileOtp: otp });
      const session = await api("/api/onboarding/session", { signupToken: proof.signupToken });
      sessionStorage.setItem("skillomateAdSession", session.token);
      setBearer(session.token);
      busyRef.current = false;
      setBusy(false);
      await openCheckout(session.token);
    } catch (error) {
      setMessage(error.message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const checkPayment = async () => {
    if (!bearer || verifyingRef.current || handoffRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setCheckingPayment(true);
    try {
      const state = await getStatus(bearer);
      if (state.accessGranted) await finish(bearer);
      else {
        setMessage("Payment confirmation is still pending. Please check again shortly.");
        setPaymentStage(stage => stage ? "pending" : stage);
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      busyRef.current = false;
      setBusy(false);
      setCheckingPayment(false);
    }
  };

  const resetPhone = () => {
    sessionStorage.removeItem("skillomateAdSession");
    sessionStorage.removeItem("skillomateAdAwaitingPayment");
    setPaymentStage(null);
    setBearer("");
    setRecovery(false);
    setMessage("");
    setModalStep("phone");
  };

  const cancelMandate = async () => {
    if (!bearer || busyRef.current || !window.confirm("Cancel automatic renewal for this checkout?")) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await api("/api/onboarding/cancel", {}, bearer);
      setMessage("Auto-renewal cancelled. Paid access remains available until its expiry.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <main className="ad-offer-page" data-page="offer.html">
      <section className="ad-offer-shell" aria-label="Skillomate subscription offer" inert={Boolean(paymentStage)} aria-hidden={paymentStage ? true : undefined}>
        <PreviewVideo modalOpen={Boolean(modalStep || paymentStage || busy)} />
        <section className="ad-offer-content" aria-labelledby="ad-offer-title">
          <div className="ad-special-ribbon"><span aria-hidden="true">ϟ</span> Special offer</div>
          <p className="ad-offer-kicker">Only for you</p>
          <h1 id="ad-offer-title">Skillomate <span>Subscription</span></h1>
          <p className="ad-offer-intro">Unlock complete access and start your learning journey today.</p>
          <article className="ad-price-card">
            <div className="ad-limited-badge"><span aria-hidden="true">◷</span> Limited time offer</div>
            <strong>₹1</strong>
            <h2>For 24 Hours</h2>
            <div className="ad-offer-rule" />
            <p>Then ₹499/month <span>·</span> Cancel anytime</p>
          </article>
          <div className="ad-benefits" aria-label="Subscription benefits">
            <div><span aria-hidden="true">▶</span><p>Full Course<br />Access</p></div>
            <div><span aria-hidden="true">◆</span><p>Learn at<br />Your Pace</p></div>
            <div><span aria-hidden="true">✦</span><p>Practical<br />AI Skills</p></div>
            <div><span aria-hidden="true">▣</span><p>Cancel<br />Anytime</p></div>
          </div>
        </section>
        <div className="ad-action-bar">
          {!recovery ? <button type="button" onClick={begin} disabled={busy}>Subscribe for ₹1 <span>→</span></button> : (
            <div className="ad-recovery">
              <p role="status" aria-live="polite">{message}</p>
              <button type="button" onClick={() => openCheckout()} disabled={busy}>Open Razorpay again</button>
              <button type="button" onClick={checkPayment} disabled={busy}>Check payment status</button>
              <button type="button" onClick={resetPhone} disabled={busy}>Verify another phone</button>
              <button type="button" onClick={cancelMandate} disabled={busy}>Cancel unfinished mandate</button>
            </div>
          )}
          <div className="ad-secure-payment"><span aria-hidden="true">✓</span> Secure payments powered by Razorpay</div>
          <p>To enjoy uninterrupted learning, your subscription will auto-renew. You can cancel it anytime.</p>
        </div>
      </section>

      {paymentStage ? <PaymentTransition stage={paymentStage} seconds={seconds} onCheck={checkPayment} checking={checkingPayment} /> : null}
      {modalStep ? <div className="ad-signin-backdrop">
        <section className="ad-signin-modal" role="dialog" aria-modal="true" aria-labelledby="ad-signin-title">
          <span className="ad-sheet-handle" aria-hidden="true" />
          <button className="ad-signin-close" type="button" aria-label="Close" onClick={() => setModalStep(null)}>×</button>
          <div className="ad-signin-brand"><img src="/assets/skillomate-logo-dark.png" alt="Skillomate" /></div>
          {modalStep === "phone" ? <form onSubmit={sendOtp}>
            <h2 id="ad-signin-title">Login / Sign up</h2>
            <p>Enter your mobile number, we&apos;ll send an OTP.</p>
            <label htmlFor="ad-phone">Mobile number</label>
            <div className="ad-phone-field"><span>🇮🇳 +91</span><input id="ad-phone" value={phone} onChange={(event) => setPhone(nationalPhoneDigits(event.target.value))} onPaste={(event) => pasteNationalPhone(event, setPhone)} type="tel" inputMode="numeric" autoComplete="tel-national" maxLength="10" placeholder="Mobile number" required autoFocus /></div>
            <button type="submit" disabled={busy || phone.length !== 10}>Send OTP</button>
            <p className="ad-form-status" role="status">{message}</p>
            <p><a href="/login">Already registered? Sign in to Skillomate</a></p>
            <small className="ad-secure-note">🔒 Your information is fully secure</small>
          </form> : modalStep === "monthly" ? <div>
            <h2 id="ad-signin-title">Continue with monthly access</h2>
            <p>The ₹1 introductory trial is not available for this account. This subscription costs ₹499 now, then ₹499/month until cancelled.</p>
            <button type="button" className="ad-monthly-confirm" disabled={busy} onClick={() => openCheckout(bearer, true)}>Agree and continue for ₹499</button>
          </div> : <form onSubmit={verifyOtp}>
            <button className="ad-otp-back" type="button" onClick={() => setModalStep("phone")}>← Change number</button>
            <h2 id="ad-signin-title">Enter OTP</h2>
            <p>We sent a 6-digit code to <strong>+91 {phone}</strong>.</p>
            <label htmlFor="ad-otp">One-time password</label>
            <input className="ad-otp-input" id="ad-otp" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength="6" placeholder="• • • • • •" required autoFocus />
            <button type="submit" disabled={busy || otp.length !== 6}>Pay now</button>
            <p className="ad-payment-consent">By clicking Pay now, you agree to our Terms &amp; Conditions and authorize ₹1 for 24 hours, followed by ₹499/month through AutoPay until cancelled.</p>
            <button className="ad-resend-otp" type="button" onClick={(event) => sendOtp(event, true)} disabled={busy}>Resend OTP</button>
            <p className="ad-form-status" role="status">{message}</p>
          </form>}
        </section>
      </div> : null}
    </main>
  );
}
