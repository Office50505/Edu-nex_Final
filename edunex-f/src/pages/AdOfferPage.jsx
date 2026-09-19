import Hls from "hls.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { openRazorpay } from "../lib/razorpayCheckout.js";
import "./ad-offer.css";

const PREVIEW_URL = "https://d2vntxz4x493rp.cloudfront.net/courses/ai-influencer/lesson-001/final%20intro%201_captioned/v1/final%20intro%201_captioned_1.m3u8";
const POSTER_URL = "https://d5yxyknp74yz8.cloudfront.net/courses/ai-influencer/lessons/lesson-01.webp";

async function api(url, body, bearer = "") {
  const response = await fetch(url, {
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

function PreviewVideo({ modalOpen }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);

  const start = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    video.autoplay = true;
    setMuted(true);
    void video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    let hls;
    const onReady = () => start();
    const onPlaying = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => setProgress(Number.isFinite(video.duration) && video.duration > 0 ? Math.min(100, (video.currentTime / video.duration) * 100) : 0);

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = PREVIEW_URL;
      video.addEventListener("loadedmetadata", onReady, { once: true });
    } else if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: false, autoStartLoad: true, startPosition: 0 });
      hls.once(Hls.Events.MANIFEST_PARSED, onReady);
      hls.once(Hls.Events.FRAG_BUFFERED, onReady);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        setPlaying(false);
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      });
      hls.loadSource(PREVIEW_URL);
      hls.attachMedia(video);
    }
    video.addEventListener("loadeddata", onReady, { once: true });
    video.addEventListener("canplay", onReady, { once: true });
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    start();
    return () => {
      hls?.destroy();
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
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
  };

  return (
    <div className="ad-preview-player">
      <video ref={videoRef} autoPlay muted loop playsInline preload="auto" poster={POSTER_URL} />
      {!playing ? <button className="ad-preview-play" type="button" onClick={start} aria-label="Play course preview">▶</button> : null}
      <button className={`ad-mute-button${muted ? "" : " is-unmuted"}`} type="button" onClick={toggleMute} aria-label={muted ? "Unmute preview" : "Mute preview"}>
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
  const busyRef = useRef(false);

  useEffect(() => {
    document.title = "Special Offer | Skillomate";
  }, []);

  const finish = useCallback(async (token = bearer) => {
    const result = await api("/api/onboarding/handoff", {}, token);
    window.location.assign(`/signup#onboarding=${encodeURIComponent(result.code)}`);
  }, [bearer]);

  const showRecovery = useCallback((text) => {
    setModalStep(null);
    setRecovery(true);
    setMessage(text);
  }, []);

  const openCheckout = useCallback(async (token = bearer) => {
    if (!token || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setModalStep(null);
    try {
      const [pricing, state] = await Promise.all([
        api("/api/onboarding/config"),
        api("/api/onboarding/status", undefined, token),
      ]);
      if (state.accessGranted) return await finish(token);
      if (pricing.gateway !== "razorpay") throw new Error("Razorpay checkout is unavailable. Please retry later.");
      const paymentType = state.trialEligible === false ? "monthly" : "trial";
      const checkout = await api("/api/onboarding/checkout", { paymentType, mandateConsent: true }, token);
      const result = await openRazorpay({ ...checkout, paymentType });
      showRecovery("Verifying payment…");
      const verified = await api("/api/onboarding/verify", result, token);
      if (verified.accessGranted) await finish(token);
      else showRecovery("Payment confirmation is pending. Check payment status; do not pay again.");
    } catch (error) {
      showRecovery(error.message || "Checkout could not be completed. Please retry.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [bearer, finish, showRecovery]);

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
    if (!bearer || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const state = await api("/api/onboarding/status", undefined, bearer);
      if (state.accessGranted) await finish(bearer);
      else setMessage("Payment confirmation is still pending. Please check again shortly.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const resetPhone = () => {
    sessionStorage.removeItem("skillomateAdSession");
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
      <section className="ad-offer-shell" aria-label="Skillomate subscription offer">
        <PreviewVideo modalOpen={Boolean(modalStep)} />
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

      {modalStep ? <div className="ad-signin-backdrop">
        <section className="ad-signin-modal" role="dialog" aria-modal="true" aria-labelledby="ad-signin-title">
          <span className="ad-sheet-handle" aria-hidden="true" />
          <button className="ad-signin-close" type="button" aria-label="Close" onClick={() => setModalStep(null)}>×</button>
          <div className="ad-signin-brand"><img src="/assets/skillomate-logo-dark.png" alt="Skillomate" /></div>
          {modalStep === "phone" ? <form onSubmit={sendOtp}>
            <h2 id="ad-signin-title">Login / Sign up</h2>
            <p>Enter your mobile number, we&apos;ll send an OTP.</p>
            <label htmlFor="ad-phone">Mobile number</label>
            <div className="ad-phone-field"><span>🇮🇳 +91</span><input id="ad-phone" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} type="tel" inputMode="numeric" autoComplete="tel" maxLength="10" placeholder="Mobile number" required autoFocus /></div>
            <button type="submit" disabled={busy || phone.length !== 10}>Send OTP</button>
            <p className="ad-form-status" role="status">{message}</p>
            <p><a href="/login">Already registered? Sign in to Skillomate</a></p>
            <small className="ad-secure-note">🔒 Your information is fully secure</small>
          </form> : <form onSubmit={verifyOtp}>
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
