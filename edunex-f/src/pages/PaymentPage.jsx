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

const MARKETING_ONBOARDING_TOKEN_KEY = "skillomateMarketingOnboardingToken";

function isPaymentReturn(searchParams) {
  return Boolean(searchParams.get("payment") || searchParams.get("status") || searchParams.get("merchantTransactionId"));
}

function readOnboardingToken() {
  try {
    return sessionStorage.getItem(MARKETING_ONBOARDING_TOKEN_KEY) || "";
  } catch (_) {
    return "";
  }
}

function saveOnboardingToken(token) {
  try {
    sessionStorage.setItem(MARKETING_ONBOARDING_TOKEN_KEY, token);
  } catch (_) {
    // Session storage can be unavailable in strict browser contexts.
  }
}

function clearOnboardingToken() {
  try {
    sessionStorage.removeItem(MARKETING_ONBOARDING_TOKEN_KEY);
  } catch (_) {
    // Session storage can be unavailable in strict browser contexts.
  }
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
  const directApp = query.get("source") === "skillomate-direct";
  const marketingOnboarding = query.get("flow") === "marketing-onboarding";
  const returnedFromGateway = isPaymentReturn(query);
  const requestedPlan = String(query.get("plan") || "").toLowerCase();
  const explicitMonthly = ["monthly", "annual", "yearly"].includes(requestedPlan);
  const [trialEligible, setTrialEligible] = useState(false);
  const [checkoutState, setCheckoutState] = useState("loading");
  const [payMsg, setPayMsg] = useState({ text: "", type: "" });
  const [submitting, setSubmitting] = useState(false);
  const busyRef = useRef(false);
  const autoLaunchAttemptedRef = useRef(false);
  const [pricing, setPricing] = useState(null);
  const phonePeOneTime = marketingOnboarding && (pricing?.gateway === "phonepe" || pricing?.gateway === "simulated");
  const trial = !phonePeOneTime && !explicitMonthly && trialEligible;
  const paymentType = phonePeOneTime ? "one_time" : trial ? "trial" : "monthly";
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [pending, setPending] = useState(false);
  const [onboardingToken, setOnboardingToken] = useState(() => readOnboardingToken());
  const planAvailable = Boolean(pricing);
  useEffect(() => {
    if (!["annual", "yearly"].includes(query.get("plan"))) return;
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.set("plan", "monthly");
    window.history.replaceState(window.history.state, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    apiFetch(marketingOnboarding ? "/api/onboarding/config" : "/api/payment/config", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Pricing is unavailable. Please reload.");
      const data = await response.json();
      if (marketingOnboarding && !["phonepe", "simulated"].includes(data.gateway)) {
        throw new Error("PhonePe checkout is not enabled yet.");
      }
      setPricing(data);
    }).catch(error => {
      if (error.name !== "AbortError") {
        setPayMsg({ text: error.message, type: "error" });
        setCheckoutState("error");
      }
    });
    return () => controller.abort();
  }, [marketingOnboarding]);
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

  const onboardingFetch = useCallback(async (url, options = {}) => {
    const token = onboardingToken || readOnboardingToken();
    if (!token) throw new Error("Checkout session expired. Please start again.");
    return apiFetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  }, [onboardingToken]);

  const ensureOnboardingToken = useCallback(async () => {
    const existing = onboardingToken || readOnboardingToken();
    if (existing) return existing;
    const response = await apiFetch("/api/onboarding/guest-session", { method: "POST" });
    const data = await safeJsonResponse(response) || {};
    if (!response.ok || !data.token) throw new Error(data.error || "Could not start checkout.");
    saveOnboardingToken(data.token);
    setOnboardingToken(data.token);
    return data.token;
  }, [onboardingToken]);

  const completeMarketingOnboarding = useCallback(async () => {
    setPayMsg({ text: "Confirming your PhonePe payment…", type: "info" });
    const response = await onboardingFetch("/api/onboarding/handoff", { method: "POST" });
    const data = await safeJsonResponse(response) || {};
    if (!response.ok || !data.code) throw new Error(data.error || "Payment is still awaiting confirmation.");
    clearOnboardingToken();
    markLocalCourseAccess();
    const signupUrl = `/signup.html?next=${encodeURIComponent("/courses.html")}#onboarding=${encodeURIComponent(data.code)}`;
    window.location.replace(signupUrl);
  }, [onboardingFetch]);

  useEffect(() => {
    if (!marketingOnboarding) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await ensureOnboardingToken();
        if (cancelled) return;
        if (returnedFromGateway) {
          await completeMarketingOnboarding();
          return;
        }
        setCheckoutState("pay");
      } catch (error) {
        if (!cancelled) {
          setPayMsg({ text: error.message || "Could not start checkout.", type: "error" });
          setCheckoutState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [completeMarketingOnboarding, ensureOnboardingToken, marketingOnboarding, returnedFromGateway]);

  useEffect(() => {
    if (marketingOnboarding) return undefined;
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
        const cancelledTrialMandate = !phonePeOneTime && !nextTrialEligible
          && data.autoRenewEnabled === false
          && String(data.subscriptionType || "").toLowerCase() === "trial";
        if ((data.accessGranted === true || data.hasActiveAccess === true) && !cancelledTrialMandate) {
          markLocalCourseAccess();
          if (!cancelled) {
            configureAppOpenButton();
            setCheckoutState("subscribed");
          }
        } else if (!cancelled) {
          const mandateStatus = String(data.mandateStatus || "").toLowerCase();
          const pendingPayment = data.pendingCheckout === true
            && (phonePeOneTime || !["cancelled", "expired", "completed", "paused"].includes(mandateStatus));
          setPending(pendingPayment);
          if (pendingPayment) {
            setPayMsg({ text: phonePeOneTime
              ? "Your PhonePe payment is being confirmed. Check its status before starting another payment."
              : "An existing payment mandate is being confirmed. Check its status before starting another payment.", type: "info" });
          }
          setCheckoutState("pay");
        }
      } catch (error) {
        if (!cancelled) { setPayMsg({ text: error.message || "Could not check your subscription. Please reload.", type: "error" }); setCheckoutState("error"); }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch, configureAppOpenButton, runtimeReady, phonePeOneTime, marketingOnboarding]);

  const initiatePayment = async () => {
    if (busyRef.current || !planAvailable || checkoutState !== "pay") return;
    busyRef.current = true;
    setSubmitting(true);
    setPayMsg({ text: "", type: "" });
    try {
      let response;
      if (marketingOnboarding) {
        const token = await ensureOnboardingToken();
        response = await apiFetch("/api/onboarding/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ paymentType: "one_time", returnUrl: window.location.href }),
        });
      } else {
        response = await authFetch("/api/payment/initiate-trial", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(phonePeOneTime
            ? { paymentType, returnUrl: window.location.href }
            : { paymentType, mandateConsent: true, returnUrl: window.location.href }),
        });
      }
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
      if ((data.gateway === "phonepe" || data.gateway === "simulated") && data.redirectUrl) {
        setPending(true);
        setPayMsg({ text: "Redirecting to secure PhonePe checkout…", type: "info" });
        window.location.assign(data.redirectUrl);
        return;
      }
      throw new Error("Secure checkout is unavailable. Please try again later.");
    } catch (error) {
      const message = error.message || "Payment initiation failed";
      if (/mandate already exists|unfinished checkout/i.test(message)) {
        setPending(true);
        setPayMsg({ text: phonePeOneTime
          ? "Your PhonePe payment is being confirmed. Check its status before starting another payment."
          : "An existing payment mandate is being confirmed. Check its status before starting another payment.", type: "info" });
      } else {
        setPayMsg({ text: message, type: "error" });
      }
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (marketingOnboarding) return;
    if (checkoutState !== "pay" || !planAvailable || pending || phonePeOneTime || autoLaunchAttemptedRef.current) return;
    autoLaunchAttemptedRef.current = true;
    void initiatePayment();
  }, [checkoutState, planAvailable, paymentType, pending, phonePeOneTime, marketingOnboarding]);

  useEffect(() => {
    if (!marketingOnboarding || returnedFromGateway || checkoutState !== "pay" || !planAvailable || pending || autoLaunchAttemptedRef.current) return;
    autoLaunchAttemptedRef.current = true;
    void initiatePayment();
  }, [checkoutState, marketingOnboarding, planAvailable, pending, returnedFromGateway]);

  const checkPayment = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setSubmitting(true);
    try {
      if (marketingOnboarding) {
        await completeMarketingOnboarding();
        return;
      }
      const response = await authFetch("/api/payment/subscription-status");
      const data = await safeJsonResponse(response);
      if (!response.ok) throw new Error(data?.error || "Unable to check payment status.");
      if (data?.accessGranted === true) {
        setPaymentCompleted(true); markLocalCourseAccess(); configureAppOpenButton(); setCheckoutState("subscribed");
      } else if (data?.pendingCheckout === false
        && (phonePeOneTime || ["cancelled", "expired", "completed", "paused"].includes(String(data?.mandateStatus || "").toLowerCase()))) {
        setPending(false);
        setPayMsg({ text: "The previous checkout is no longer pending. You can start checkout again.", type: "info" });
      } else {
        setPending(true);
        setPayMsg({ text: "Still waiting for payment confirmation. Please check again shortly.", type: "info" });
      }
    } catch (error) { setPayMsg({ text: error.message, type: "error" }); }
    finally { busyRef.current = false; setSubmitting(false); }
  };
  const amount = (paise) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(paise / 100);
  const oneTimePrice = pricing?.oneTimeAmountPaise ? amount(pricing.oneTimeAmountPaise) : "";
  const trialPrice = pricing?.trialAmountPaise ? amount(pricing.trialAmountPaise) : "₹1";
  const monthlyPrice = pricing?.subscriptionAmountPaise ? `${amount(pricing.subscriptionAmountPaise)}/month` : "₹499/month";
  const currentPlanPrice = phonePeOneTime ? (oneTimePrice || "₹299") : trial ? trialPrice : monthlyPrice;
  const checkoutProviderName = phonePeOneTime ? "PhonePe" : "Razorpay";
  const checkoutTitle = phonePeOneTime ? "Skillomate access" : trial ? "Skillomate trial" : "Skillomate monthly access";
  const checkoutDescription = phonePeOneTime
    ? "Full course access, lesson notes, progress tracking, and AI learning tools."
    : trial
      ? "Try Skillomate for 24 hours, then continue with the monthly plan."
      : "Start monthly access to unlock the full course library.";
  const checkoutPaymentCopy = phonePeOneTime
    ? `Pay ${currentPlanPrice} securely through PhonePe to activate your Skillomate account.`
    : `Continue securely through Razorpay to activate your Skillomate account.`;
  const checkoutButtonLabel = phonePeOneTime
    ? `${payMsg.type === "error" ? "Try" : "Pay"} ${currentPlanPrice} once`
    : explicitMonthly
      ? `${payMsg.type === "error" ? "Try" : "Pay"} ${monthlyPrice}`
      : payMsg.type === "error" ? "Try Checkout Again" : "Continue to secure payment";
  const loginCopy = phonePeOneTime
    ? `Create an account or log in, then continue to secure PhonePe payment for ${currentPlanPrice}.`
    : explicitMonthly
      ? `Create an account or log in, then continue to secure checkout for ${monthlyPrice}.`
      : `Create an account or log in, then continue to secure ${checkoutProviderName} payment.`;
  const signupLabel = phonePeOneTime ? `Create Account & Pay ${currentPlanPrice}` : explicitMonthly ? "Create Account & Subscribe" : "Create Account & Continue";
  const planLabel = phonePeOneTime ? `${currentPlanPrice} access` : trial ? `${trialPrice} trial` : `${monthlyPrice} membership`;

  return (
    <div className={`react-page-root${directApp ? " direct-app-payment" : ""}`} data-page="payment.html">
      <main className="checkout-launcher" aria-live="polite">
        {checkoutState === "loading" || (checkoutState === "pay" && submitting && !pending) ? (
          <div className="checkout-launcher-card" role="status">
            <span className="checkout-launcher-spinner" aria-hidden="true"></span>
            <h1>{checkoutState === "loading" ? "Checking your subscription…" : "Opening secure checkout…"}</h1>
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
            <h1>{checkoutTitle}</h1>
            <h2>{currentPlanPrice}</h2>
            <p>{checkoutDescription}</p>
            <p>{checkoutPaymentCopy}</p>
            {phonePeOneTime ? <p>This one-time access does not renew automatically.</p> : null}
            {payMsg.text ? <p role={payMsg.type === "error" ? "alert" : "status"}>{payMsg.text}</p> : null}
            <button className="checkout-launcher-primary" type="button" onClick={initiatePayment}>
              {checkoutButtonLabel}
            </button>
            <p>After successful payment, your Skillomate access will open on this account.</p>
            <a href="/courses" className="checkout-launcher-secondary">{directApp ? "Back to app" : "Back to courses"}</a>
          </div>
        ) : null}

        {checkoutState === "login" ? (
          <div className="checkout-launcher-card">
            <h1>Log in to continue</h1>
            <p>{loginCopy}</p>
            <a id="loginBtn" href={`/login.html?next=${encodeURIComponent(window.location.href)}`} className="checkout-launcher-primary">Log In</a>
            <a id="signupBtn" href={`/signup.html?next=${encodeURIComponent(window.location.href)}`} className="checkout-launcher-secondary">{signupLabel}</a>
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
              {payMsg.text || "Checkout could not be opened. Please try again."}
            </p>
            <button className="checkout-launcher-primary" type="button" disabled={submitting || !planAvailable} onClick={pending ? checkPayment : initiatePayment}>
              {submitting ? "Please wait…" : pending ? "Check payment status" : "Try Checkout Again"}
            </button>
            <a href="/courses.html" className="checkout-launcher-secondary">{directApp ? "Back to app" : "Back to Courses"}</a>
          </div>
        ) : null}
      </main>
    </div>
  );
}
