import "./payment-premium.css";
import { openRazorpay } from "../lib/razorpayCheckout.js";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { page as paymentPage } from "../generated-pages/payment.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";
import { useEduNexRuntimeReady } from "../hooks/useEduNexRuntimeReady.js";

function params() {
  return new URLSearchParams(window.location.search);
}

async function safeJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function buildWebContinueLink() {
  return "/courses.html";
}

function markLocalCourseAccess() {
  localStorage.setItem("edunexHasCourseAccess", JSON.stringify({ active: true, savedAt: Date.now() }));
}

function LightningIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ verticalAlign: "middle", flexShrink: 0 }} aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C58B2A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", flexShrink: 0 }} aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", flexShrink: 0 }} aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

export function PaymentPage() {
  const runtimeReady = useEduNexRuntimeReady();
  const query = params();
  const courseId = query.get("courseId");
  const [selectedPlan, setSelectedPlan] = useState(() => ["annual", "yearly"].includes(query.get("plan")) ? "annual" : "monthly");
  const annual = selectedPlan === "annual";
  const [trialEligible, setTrialEligible] = useState(true);
  const [checkoutState, setCheckoutState] = useState("loading");
  const [payMsg, setPayMsg] = useState({ text: "", type: "" });
  const [submitting, setSubmitting] = useState(false);
  const busyRef = useRef(false);
  const [pricing, setPricing] = useState(null);
  const trial = !annual && query.get("plan") === "trial" && trialEligible;
  const paymentType = annual ? "annual" : trial ? "trial" : "monthly";
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [paymentFailed, setPaymentFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const planAvailable = Boolean(pricing && (!annual || pricing.annualAvailable));
  const rupees = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format((value || 0) / 100);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/payment/config", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Pricing is unavailable. Please reload.");
      const data = await response.json(); setPricing(data);
    }).catch(error => { if (error.name !== "AbortError") setPayMsg({ text: error.message, type: "error" }); });
    return () => controller.abort();
  }, []);
  const [watchHref, setWatchHref] = useState("/courses.html");

  usePageStyle("react-page-style-payment", paymentPage.styles);

  const sharedRuntimePage = useMemo(() => ({
    ...paymentPage,
    scripts: paymentPage.scripts.filter((script) => script.src),
  }), []);

  useEffect(() => {
    document.title = paymentPage.title;
    document.documentElement.lang = paymentPage.lang || "en";
    const cleanup = runLegacyPage(sharedRuntimePage);
    return () => cleanup?.();
  }, [sharedRuntimePage]);

  const webLink = buildWebContinueLink();

  const configureAppOpenButton = useCallback(() => {
    let courseWatch = courseId ? `/videos.html?courseId=${encodeURIComponent(courseId)}` : webLink;
    try {
      const next = new URL(new URLSearchParams(window.location.search).get("next") || "", window.location.origin);
      if (courseId && next.origin === window.location.origin && ["/videos", "/videos.html"].includes(next.pathname) && next.searchParams.get("courseId") === courseId) {
        courseWatch = next.pathname + next.search;
      }
    } catch (_) { /* Keep the course entry fallback for invalid return URLs. */ }
    if (courseId) {
      setWatchHref(courseWatch);
    } else {
      setWatchHref(webLink);
    }
  }, [courseId, webLink]);

  const refreshAccessToken = useCallback(async () => {
    const sessionStore = localStorage.getItem("edunexAccessToken") ? localStorage : sessionStorage;
    const refreshToken = sessionStore.getItem("edunexRefreshToken");
    if (!refreshToken) throw new Error("Please log in");
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const data = await safeJsonResponse(response) || {};
    if (!response.ok) throw new Error(data.error || data.message || "Session expired");
    sessionStore.setItem("edunexAccessToken", data.accessToken);
    return data.accessToken;
  }, []);

  const authFetch = useCallback(async (url, options = {}) => {
    let token = localStorage.getItem("edunexAccessToken") || sessionStorage.getItem("edunexAccessToken");
    const run = (accessToken) => fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${accessToken}` } });
    let response = await run(token);
    if (response.status === 401) {
      token = await refreshAccessToken();
      response = await run(token);
    }
    return response;
  }, [refreshAccessToken]);

  useEffect(() => {
    if (!runtimeReady) return undefined;
    let cancelled = false;
    (async () => {
      const token = localStorage.getItem("edunexAccessToken") || sessionStorage.getItem("edunexAccessToken");
      const returnUrl = encodeURIComponent(window.location.href);
      document.getElementById("loginBtn")?.setAttribute("href", `/login.html?next=${returnUrl}`);
      document.getElementById("signupBtn")?.setAttribute("href", `/signup.html?next=${returnUrl}`);

      if (!token) {
        if (!cancelled) setCheckoutState("login");
        return;
      }

      try {
        const response = await authFetch("/api/payment/subscription-status");
        const data = await safeJsonResponse(response) || {};
        const nextTrialEligible = data.trialEligible !== false;
        if (!cancelled) {
          setTrialEligible(nextTrialEligible);
        }
        if (!response.ok) throw new Error(data.error || "Could not check access.");
        const cancelledTrialMandate = !nextTrialEligible
          && data.autoRenewEnabled === false
          && String(data.subscriptionType || "").toLowerCase() === "trial";
        if ((data.accessGranted === true || data.hasActiveAccess === true) && !cancelledTrialMandate) {
          markLocalCourseAccess();
          if (!cancelled) {
            configureAppOpenButton();
            setCheckoutState("subscribed");
          }
        } else if (!cancelled) {
          setCheckoutState("pay");
        }
      } catch (_) {
        if (!cancelled) setCheckoutState("pay");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch, configureAppOpenButton, runtimeReady]);

  const initiatePayment = async () => {
    if (busyRef.current || !planAvailable) return;
    busyRef.current = true;
    setSubmitting(true);
    setPaymentFailed(false);
    setPayMsg({ text: "", type: "" });
    let authorizationReceived = false;
    try {
      const response = await authFetch("/api/payment/initiate-trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentType, mandateConsent: true }),
      });
      const data = await safeJsonResponse(response) || {};
      if (!response.ok) throw new Error(data.error || data.message || `Payment initiation failed (${response.status})`);
      if (data.gateway === "razorpay") {
        const result = await openRazorpay(data);
        authorizationReceived = true;
        setPending(true);
        setPayMsg({ text: "Verifying payment…", type: "info" });
        const verified = await authFetch("/api/payment/razorpay/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(result) });
        const verification = await safeJsonResponse(verified);
        if (!verified.ok) throw new Error(verification?.error || "Payment verification failed. Check status before paying again.");
        let access = verification.accessGranted;
        for (let attempt = 0; !access && attempt < 4; attempt += 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
          const check = await authFetch("/api/payment/subscription-status");
          const status = await safeJsonResponse(check);
          access = check.ok && status?.accessGranted;
        }
        if (access) { setPaymentCompleted(true); markLocalCourseAccess(); configureAppOpenButton(); setCheckoutState("subscribed"); }
        else { setPending(true); setPayMsg({ text: "Payment authorization received. Access is pending confirmation. Check payment status before paying again.", type: "info" }); }
        return;
      }
      throw new Error("Secure checkout is unavailable. Please try again later.");
    } catch (error) {
      setPaymentFailed(!authorizationReceived);
      setPayMsg({ text: error.message || "Payment initiation failed", type: "error" });
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  };

  const checkPayment = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setSubmitting(true);
    try {
      const response = await authFetch("/api/payment/subscription-status");
      const data = await safeJsonResponse(response);
      if (!response.ok) throw new Error(data?.error || "Unable to check payment status.");
      if (data?.accessGranted === true) {
        setPaymentCompleted(true); markLocalCourseAccess(); configureAppOpenButton(); setCheckoutState("subscribed");
      } else setPayMsg({ text: "Still waiting for payment confirmation. Please check again shortly.", type: "info" });
    } catch (error) { setPayMsg({ text: error.message, type: "error" }); }
    finally { busyRef.current = false; setSubmitting(false); }
  };
  const payButtonText = submitting ? "Please wait…" : pending ? "Check payment status" : paymentFailed ? "Try Again" : "Continue with UPI";

  return (
    <div className="react-page-root" data-page="payment.html">
      <div className="pay-page">
        <div className="pay-grid direct-checkout">
          <div className="checkout-card">
            <div className="checkout-header">
              <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <i className="fas fa-graduation-cap" aria-hidden="true"></i> Skillomate Premium
              </h1>
              <p>Learn more. Create more. Go Premium.</p>
              <fieldset disabled={submitting || pending} style={{ border: 0, padding: 0, margin: "16px 0 0", display: "flex", flexWrap: "wrap", gap: 12 }}>
                <legend style={{ fontSize: 14, marginBottom: 8 }}>Choose your billing plan</legend>
                {[['monthly', 'Monthly'], ['annual', 'Yearly']].map(([value, label]) => (
                  <label key={value} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, cursor: "pointer" }}>
                    <input type="radio" name="billingPlan" value={value} checked={selectedPlan === value} onChange={() => {
                      setSelectedPlan(value);
                      setPayMsg({ text: "", type: "" });
                      const url = new URL(window.location.href);
                      url.searchParams.set('plan', value);
                      window.history.replaceState(window.history.state, '', url.pathname + url.search);
                    }} />{label}
                  </label>
                ))}
              </fieldset>
            </div>
            <div className="checkout-body">
              <div className={`msg pay-msg ${payMsg.type}`} role="status" aria-live="polite">{payMsg.text}</div>
              {checkoutState === "loading" ? (
                <div id="loadingState" style={{ textAlign: "center", padding: "24px 0", color: "var(--muted)", fontSize: 14 }}>
                  Checking your account…
                </div>
              ) : null}

              {checkoutState === "login" ? (
                <div id="loginState">
                  <p className="premium-preview-price">{pricing ? rupees(annual ? pricing.annualAmountPaise : trial ? pricing.trialAmountPaise : pricing.subscriptionAmountPaise) : "…"}<small> / {annual ? "year" : trial ? "trial" : "month"}</small></p>
                  <ul className="premium-benefits"><li><CheckIcon /> Complete Course Access</li><li><CheckIcon /> Nex AI</li><li><CheckIcon /> Premium AI Tools</li></ul>
                  <p style={{ fontSize: 14, color: "var(--muted)", textAlign: "center", marginBottom: 20, lineHeight: 1.6 }}>
                    Create a free account to continue — it only takes 30 seconds.
                  </p>
                  <a id="loginBtn" href={`/login.html?next=${encodeURIComponent(window.location.href)}`} className="login-cta-btn"><i className="fas fa-key" aria-hidden="true"></i> Log In to Continue</a>

                  <div className="pay-divider"><span>New here?</span></div>
                  <a id="signupBtn" href={`/signup.html?next=${encodeURIComponent(window.location.href)}`} className="pay-btn-secondary"><i className="fas fa-star" aria-hidden="true"></i> Create Free Account</a>
                  <div className="pay-security"><LockIcon /> Your data is safe with us</div>
                </div>
              ) : null}

              {checkoutState === "subscribed" ? (
                <div id="subscribedState">
                  <div className="subscribed-banner">
                    <div className="icon"><CheckIcon /></div>
                    <h3>{paymentCompleted ? "Payment Successful" : "Your Premium access is active"}</h3>
                    <p>{paymentCompleted ? "Welcome to Skillomate Premium. Your Premium access is now active." : "Enjoy unlimited access to all Skillomate courses."}</p>
                  </div>
                  <a
                    id="watchNowBtn"
                    href={watchHref}
                    className="login-cta-btn"
                  >
                    Start Learning
                  </a>
                  <a href="/courses.html" className="pay-btn-secondary" style={{ marginTop: 10 }}><i className="fas fa-book-open" aria-hidden="true"></i> Browse All Courses</a>
                </div>
              ) : null}

              {checkoutState === "pay" ? (
                <div id="payState">
                  <div className="plan-option selected" style={{ cursor: "default" }}>
                    <div className="plan-info">
                      <div className="plan-name">{annual ? "Annual subscription" : trial ? `${pricing?.trialHours || 24}-Hour Trial` : "Monthly subscription"}</div>
                      <div className="plan-desc">Full access · Auto-renews {annual ? "yearly" : "monthly"}</div>
                    </div>
                    <div className="plan-price">
                      <div className="amount">{pricing ? rupees(annual ? pricing.annualAmountPaise : trial ? pricing.trialAmountPaise : pricing.subscriptionAmountPaise) : "…"}</div>
                      <span className="per">{annual ? "per year" : trial ? "trial payment" : "per month"}</span>
                    </div>
                  </div>
                  {!trialEligible && !annual ? <p role="status" style={{ margin: "16px 0" }}>Your one-time trial has already been used. Continue with the monthly plan.</p> : null}
                  {annual && pricing && !pricing.annualAvailable ? <p role="alert">Yearly checkout is currently unavailable. Please try again later or choose Monthly.</p> : null}
                  {pricing ? <p id="paymentAgreement" style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text)", margin: "16px 0" }}>
                    By continuing, you accept our <a href="/terms.html" target="_blank" rel="noopener noreferrer">Terms</a> &amp; <a href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a>. {annual
                      ? `You pay ${rupees(pricing.annualAmountPaise)} now for one year. You authorize automatic renewal at ${rupees(pricing.annualAmountPaise)} per year until cancelled. No trial charge applies.`
                      : trial ? `Your ${pricing.trialHours || 24}-hour trial costs ${rupees(pricing.trialAmountPaise)}, then the subscription renews at ${rupees(pricing.subscriptionAmountPaise)}/month until cancelled.`
                        : `You pay ${rupees(pricing.subscriptionAmountPaise)} now and authorize renewal at that amount each month until cancelled.`} Cancel auto-renewal from your profile; paid access continues to its expiry.
                  </p> : null}
                  <ul className="premium-benefits"><li><CheckIcon /> Complete Course Access</li><li><CheckIcon /> Nex AI</li><li><CheckIcon /> Premium AI Tools</li></ul>
                  {paymentFailed ? <div className="premium-failure" role="alert"><h3>Payment unsuccessful</h3><p>We couldn't complete your payment.</p></div> : null}
                  <button className="pay-btn" id="payBtn" type="button" aria-describedby="paymentAgreement" disabled={submitting || !planAvailable} onClick={pending ? checkPayment : initiatePayment}>
                    <span id="payBtnIcon">{<LightningIcon />}</span>
                    <span id="payBtnText">{payButtonText}</span>
                  </button>
                  {pricing && !annual && !trial ? <p className="premium-renewal">{rupees(pricing.subscriptionAmountPaise)}/month. Your subscription automatically renews every month through UPI AutoPay until cancelled.</p> : null}
                  <p className="premium-payment-help">On desktop, scan the checkout QR with a supported UPI app. On mobile, approve in your UPI app and return here.</p>
                  <a href="/profile" style={{ display: "block", marginTop: 12 }}>Manage or cancel an unfinished checkout</a>
                  <div className="pay-divider"><span>or</span></div>
                  <a href="/courses.html" className="pay-btn-secondary">← Back to Courses</a>

                  <div className="pay-security" style={{ marginTop: 18, flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <LockIcon /> Secured by Razorpay
                    </div>
                    <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
                      <span><CheckIcon /> Cancel anytime</span>
                      <span><CheckIcon /> Verified payments</span>
                      <span><CheckIcon /> All courses</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
