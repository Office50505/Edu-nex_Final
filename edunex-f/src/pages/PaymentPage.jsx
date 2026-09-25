import "./payment-premium.css";
import { openRazorpay } from "../lib/razorpayCheckout.js";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { page as paymentPage } from "../generated-pages/payment.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";
import { useEduNexRuntimeReady } from "../hooks/useEduNexRuntimeReady.js";
import { apiFetch } from "../lib/apiUrl.js";

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

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C58B2A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", flexShrink: 0 }} aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function PaymentPage() {
  const runtimeReady = useEduNexRuntimeReady();
  const query = params();
  const courseId = query.get("courseId");
  const [trialEligible, setTrialEligible] = useState(false);
  const [checkoutState, setCheckoutState] = useState("loading");
  const [payMsg, setPayMsg] = useState({ text: "", type: "" });
  const [submitting, setSubmitting] = useState(false);
  const busyRef = useRef(false);
  const autoLaunchAttemptedRef = useRef(false);
  const [pricing, setPricing] = useState(null);
  const trial = !["monthly", "annual", "yearly"].includes(query.get("plan")) && trialEligible;
  const paymentType = trial ? "trial" : "monthly";
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [pending, setPending] = useState(false);
  const planAvailable = Boolean(pricing);
  useEffect(() => {
    if (!["annual", "yearly"].includes(query.get("plan"))) return;
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.set("plan", "monthly");
    window.history.replaceState(window.history.state, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    apiFetch("/api/payment/config", { signal: controller.signal }).then(async response => {
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
    const response = await apiFetch("/api/auth/refresh", {
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
    const run = (accessToken) => apiFetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${accessToken}` } });
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
      } catch (error) {
        if (!cancelled) { setPayMsg({ text: error.message || "Could not check your subscription. Please reload.", type: "error" }); setCheckoutState("error"); }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch, configureAppOpenButton, runtimeReady]);

  const initiatePayment = async () => {
    if (busyRef.current || !planAvailable || checkoutState !== "pay") return;
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
      if (!response.ok) throw new Error(data.error || data.message || `Payment initiation failed (${response.status})`);
      if (data.gateway === "razorpay") {
        const result = await openRazorpay({ ...data, paymentType });
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
      setPayMsg({ text: error.message || "Payment initiation failed", type: "error" });
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (checkoutState !== "pay" || !planAvailable || autoLaunchAttemptedRef.current) return;
    autoLaunchAttemptedRef.current = true;
    void initiatePayment();
  }, [checkoutState, planAvailable, paymentType]);

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
  const amount = (paise) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(paise / 100);
  const trialPrice = pricing ? amount(pricing.trialAmountPaise) : "";
  const monthlyPrice = pricing ? amount(pricing.subscriptionAmountPaise) : "";
  const planLabel = trial ? `${trialPrice} trial` : "monthly subscription";

  return (
    <div className="react-page-root" data-page="payment.html">
      <main className="checkout-launcher" aria-live="polite">
        {checkoutState === "loading" || (checkoutState === "pay" && submitting && !pending) ? (
          <div className="checkout-launcher-card" role="status">
            <span className="checkout-launcher-spinner" aria-hidden="true"></span>
            <h1>{checkoutState === "loading" ? "Checking your subscription…" : "Opening Razorpay…"}</h1>
            <p>Preparing your {planLabel} securely.</p>
          </div>
        ) : null}

        {checkoutState === "error" ? (
          <div className="checkout-launcher-card">
            <h1>Could not check your subscription</h1>
            <p role="alert">{payMsg.text}</p>
            <button className="checkout-launcher-primary" onClick={() => window.location.reload()}>Retry</button>
          </div>
        ) : null}

        {checkoutState === "pay" && planAvailable && !submitting && !pending ? (
          <div className="checkout-launcher-card">
            <h1>Subscription plans</h1>
            <h2>{trial ? `${trialPrice} for ${pricing.trialHours} hours` : `${monthlyPrice}/month`}</h2>
            <p>Full course access, lesson notes and AI learning tools.</p>
            <p>{trial ? `Pay ${trialPrice} now. After ${pricing.trialHours} hours, your subscription renews at ${monthlyPrice}/month through AutoPay until cancelled.` : `Pay ${monthlyPrice} now. Your subscription renews at ${monthlyPrice}/month through AutoPay until cancelled.`}</p>
            {!trialEligible ? <p>The introductory trial is not available for this account.</p> : null}
            <p>Cancel auto-renewal anytime.</p>
            {payMsg.text ? <p role={payMsg.type === "error" ? "alert" : "status"}>{payMsg.text}</p> : null}
            <button className="checkout-launcher-primary" type="button" onClick={initiatePayment}>
              {payMsg.type === "error" ? "Try Razorpay Again" : trial ? `Pay ${trialPrice} and start trial` : `Pay ${monthlyPrice} and subscribe`}
            </button>
            <p>By continuing, you agree to the recurring payment terms above.</p>
            <a href="/courses" className="checkout-launcher-secondary">Back to courses</a>
          </div>
        ) : null}

        {checkoutState === "login" ? (
          <div className="checkout-launcher-card">
            <h1>Log in to continue</h1>
            <p>Log in to see your eligible subscription plan and price before paying.</p>
            <a id="loginBtn" href={`/login.html?next=${encodeURIComponent(window.location.href)}`} className="checkout-launcher-primary">Log In</a>
            <a id="signupBtn" href={`/signup.html?next=${encodeURIComponent(window.location.href)}`} className="checkout-launcher-secondary">Create Account</a>
          </div>
        ) : null}

        {checkoutState === "subscribed" ? (
          <div className="checkout-launcher-card">
            <CheckIcon />
            <h1>{paymentCompleted ? "Payment Successful" : "Premium access is active"}</h1>
            <p>{paymentCompleted ? "Your payment was verified and access is ready." : "No additional payment is required."}</p>
            <a id="watchNowBtn" href={watchHref} className="checkout-launcher-primary">Start Learning</a>
          </div>
        ) : null}

        {checkoutState === "pay" && (pending || !planAvailable) ? (
          <div className="checkout-launcher-card">
            <h1>{pending ? "Confirming payment" : "Checkout unavailable"}</h1>
            <p className={payMsg.type === "error" || !planAvailable ? "checkout-launcher-error" : ""} role={payMsg.type === "error" || !planAvailable ? "alert" : "status"}>
              {payMsg.text || "Razorpay could not be opened. Please try again."}
            </p>
            <button className="checkout-launcher-primary" type="button" disabled={submitting || !planAvailable} onClick={pending ? checkPayment : initiatePayment}>
              {submitting ? "Please wait…" : pending ? "Check payment status" : "Try Razorpay Again"}
            </button>
            <a href="/courses.html" className="checkout-launcher-secondary">Back to Courses</a>
          </div>
        ) : null}
      </main>
    </div>
  );
}
