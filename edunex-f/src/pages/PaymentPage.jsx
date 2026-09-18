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
  const paymentType = annual ? "annual" : trialEligible ? "trial" : "monthly";
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
  const [modalOpen, setModalOpen] = useState(false);
  const [watchHref, setWatchHref] = useState("/courses.html");
  const [watchText, setWatchText] = useState("Open Video Library");

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

  useEffect(() => {
    if (!modalOpen) return undefined;
    const handleKey = (event) => {
      if (event.key === "Escape") setModalOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    const timer = window.setTimeout(() => document.getElementById("continueWebBtn")?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", handleKey);
      window.clearTimeout(timer);
    };
  }, [modalOpen]);

  const webLink = buildWebContinueLink();

  const configureAppOpenButton = useCallback(() => {
    const courseWatch = courseId ? `/videos.html?courseId=${encodeURIComponent(courseId)}&video=0` : webLink;
    if (courseId) {
      setWatchHref(courseWatch);
      setWatchText("Continue on Web");
    } else {
      setWatchHref(webLink);
      setWatchText("Open Video Library");
    }
  }, [courseId, webLink]);

  const refreshAccessToken = useCallback(async () => {
    const token = await window.EduNex?.refreshAccessToken?.();
    if (!token) throw new Error("Please log in again to continue checkout.");
    return token;
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
        const activeStatuses = ["active", "subscribed", "1rs trial", "trial", "trial_active", "paid_active"];
        if (data.hasActiveAccess === true || activeStatuses.includes(data.status)) {
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
    setPayMsg({ text: "", type: "" });
    try {
      const response = await authFetch("/api/payment/initiate-trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentType, mandateConsent: true }),
      });
      const data = await safeJsonResponse(response) || {};
      if (response.status === 409) {
        if (data.error) {
          setPayMsg({ text: data.error, type: "error" });
          setSubmitting(false);
          return;
        }
        markLocalCourseAccess();
        configureAppOpenButton();
        setCheckoutState("subscribed");
        return;
      }
      if (!response.ok) throw new Error(data.error || data.message || `Payment initiation failed (${response.status})`);
      if (data.gateway === "razorpay") {
        const result = await openRazorpay(data);
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
        if (access) { markLocalCourseAccess(); configureAppOpenButton(); setCheckoutState("subscribed"); }
        else setPayMsg({ text: "Payment authorization received. Access is pending confirmation. Refresh shortly; do not pay again.", type: "info" });
        return;
      }
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      throw new Error("No redirect URL received from payment gateway");
    } catch (error) {
      setPayMsg({ text: error.message || "Payment initiation failed", type: "error" });
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  };

  const payButtonText = submitting
    ? "Redirecting to payment…"
    : annual ? `Subscribe for ${rupees(pricing?.annualAmountPaise)}/year`
      : trialEligible ? `Try ${pricing?.trialHours || 24} Hours for ${rupees(pricing?.trialAmountPaise)}`
        : `Subscribe for ${rupees(pricing?.subscriptionAmountPaise)}/month`;

  return (
    <div className="react-page-root" data-page="payment.html">
      <div className="pay-page">
        <div className="pay-grid direct-checkout">
          <div className="checkout-card">
            <div className="checkout-header">
              <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <i className="fas fa-graduation-cap" aria-hidden="true"></i> Get Full Access
              </h1>
              <p>Unlimited courses · Cancel anytime</p>
              <fieldset disabled={submitting} style={{ border: 0, padding: 0, margin: "16px 0 0", display: "flex", flexWrap: "wrap", gap: 12 }}>
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
                    <h3>You're already subscribed!</h3>
                    <p>Enjoy unlimited access to all Skillomate courses.</p>
                  </div>
                  <a
                    id="watchNowBtn"
                    href={watchHref}
                    className="login-cta-btn"
                  >
                    {watchText}
                  </a>
                  <a href="/profile" className="pay-btn-secondary" style={{ marginTop: 10 }}>Manage subscription</a>
                  <a href="/courses.html" className="pay-btn-secondary" style={{ marginTop: 10 }}><i className="fas fa-book-open" aria-hidden="true"></i> Browse All Courses</a>
                </div>
              ) : null}

              {checkoutState === "pay" ? (
                <div id="payState">
                  <div className="plan-option selected" style={{ cursor: "default" }}>
                    <div className="plan-info">
                      <div className="plan-name">{annual ? "Annual subscription" : trialEligible ? `${pricing?.trialHours || 24}-Hour Trial` : "Monthly subscription"}</div>
                      <div className="plan-desc">Full access · Auto-renews {annual ? "yearly" : "monthly"}</div>
                    </div>
                    <div className="plan-price">
                      <div className="amount">{pricing ? rupees(annual ? pricing.annualAmountPaise : trialEligible ? pricing.trialAmountPaise : pricing.subscriptionAmountPaise) : "…"}</div>
                      <span className="per">{annual ? "per year" : trialEligible ? "trial payment" : "per month"}</span>
                    </div>
                  </div>
                  {!annual && !trialEligible ? <p role="status" style={{ margin: "16px 0" }}>You've already used your trial. Continue with a monthly or yearly subscription.</p> : null}
                  {annual && pricing && !pricing.annualAvailable ? <p role="alert">Yearly checkout is currently unavailable. Please try again later or choose Monthly.</p> : null}
                  {pricing ? <p id="paymentAgreement" style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text)", margin: "16px 0" }}>
                    By continuing, you accept our <a href="/terms.html" target="_blank" rel="noopener noreferrer">Terms</a> &amp; <a href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a>. {annual
                      ? `You pay ${rupees(pricing.annualAmountPaise)} now for one year. You authorize automatic renewal at ${rupees(pricing.annualAmountPaise)} per year until cancelled. No trial charge applies.`
                      : trialEligible ? `Your ${pricing.trialHours || 24}-hour trial costs ${rupees(pricing.trialAmountPaise)}, then the subscription renews at ${rupees(pricing.subscriptionAmountPaise)}/month until cancelled.`
                        : `You pay ${rupees(pricing.subscriptionAmountPaise)} now and authorize renewal at that amount each month until cancelled.`} Cancel auto-renewal from your profile; paid access continues to its expiry.
                  </p> : null}
                  <button className="pay-btn" id="payBtn" type="button" aria-describedby="paymentAgreement" disabled={submitting || !planAvailable} onClick={initiatePayment}>
                    <span id="payBtnIcon">{<LightningIcon />}</span>
                    <span id="payBtnText">{payButtonText}</span>
                  </button>
                  <a href="/profile" style={{ display: "block", marginTop: 12 }}>Manage or cancel an unfinished checkout</a>
                  <div className="pay-divider"><span>or</span></div>
                  <a href="/courses.html" className="pay-btn-secondary">← Back to Courses</a>

                  <div className="pay-security" style={{ marginTop: 18, flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <LockIcon /> Secured by Razorpay
                    </div>
                    <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
                      <span><CheckIcon /> Cancel anytime</span>
                      <span><CheckIcon /> Instant access</span>
                      <span><CheckIcon /> All courses</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div
        className={`payment-choice-modal${modalOpen ? " is-open" : ""}`}
        id="paymentChoiceModal"
        aria-hidden={!modalOpen}
        onClick={(event) => {
          if (event.target === event.currentTarget) setModalOpen(false);
        }}
      >
        <div className="payment-choice-card" role="dialog" aria-modal="true" aria-labelledby="paymentChoiceTitle">
            <div className="payment-choice-head">
              <div className="payment-choice-kicker"><i className="fas fa-check-circle" aria-hidden="true"></i> Payment complete</div>
              <h2 className="payment-choice-title" id="paymentChoiceTitle">Continue learning</h2>
              <p className="payment-choice-copy">Your access is ready. Continue in the browser to open your courses.</p>
            </div>
            <div className="payment-choice-body">
              <div className="payment-choice-actions">
              <a className="payment-choice-btn primary" id="continueWebBtn" href={webLink}>
                <i className="fas fa-globe" aria-hidden="true"></i>
                Continue on Web
              </a>
            </div>
            <div className="payment-choice-meta">You can also open the Skillomate app separately and sign in with the same account.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
