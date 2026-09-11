import { openRazorpay } from "../lib/razorpayCheckout.js";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { page as paymentPage } from "../generated-pages/payment.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";
import { useEduNexRuntimeReady } from "../hooks/useEduNexRuntimeReady.js";

const APP_DEEP_LINK_BASE = "com.skillomate.app://payment-success";
const CHECKOUT_COURSE_CACHE_TTL = 10 * 60 * 1000;
const CHECKOUT_COURSE_CACHE_MAX_BYTES = 2 * 1024 * 1024;

function params() {
  return new URLSearchParams(window.location.search);
}

function safeJsonFromStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch (_) {
    return null;
  }
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

function buildAppDeepLink(merchantTransactionId) {
  if (!APP_DEEP_LINK_BASE || !merchantTransactionId) return "";
  const separator = APP_DEEP_LINK_BASE.includes("?") ? "&" : "?";
  return `${APP_DEEP_LINK_BASE}${separator}merchantTransactionId=${encodeURIComponent(merchantTransactionId)}`;
}

function openAppWithWebFallback(appLink, webLink) {
  if (!appLink) {
    window.location.href = webLink;
    return;
  }

  let didLeave = false;
  const markLeft = () => {
    didLeave = true;
  };
  const onVisibilityChange = () => {
    if (document.hidden) markLeft();
  };
  const cleanup = () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", markLeft);
    window.removeEventListener("blur", markLeft);
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", markLeft, { once: true });
  window.addEventListener("blur", markLeft, { once: true });
  window.location.href = appLink;

  window.setTimeout(() => {
    cleanup();
    if (!didLeave) window.location.href = webLink;
  }, 1400);
}

function markLocalCourseAccess() {
  localStorage.setItem("edunexHasCourseAccess", JSON.stringify({ active: true, savedAt: Date.now() }));
}

function driveImageSrc(url) {
  const rawUrl = String(url || "").trim();
  if (!rawUrl) return "";
  const proxy = (value) => {
    if (!value || /^(data|blob):/i.test(value)) return value;
    try {
      const parsed = new URL(value, window.location.origin);
      if (parsed.origin === window.location.origin) return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      return `/api/image-proxy?url=${encodeURIComponent(parsed.href)}`;
    } catch (_) {
      return value;
    }
  };

  try {
    const parsed = new URL(rawUrl);
    const isDriveHost = /(^|\.)drive\.google\.com$/i.test(parsed.hostname);
    if (!isDriveHost) return proxy(rawUrl);

    const fileMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
    const fileId = fileMatch?.[1] || parsed.searchParams.get("id");
    return fileId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1200` : rawUrl;
  } catch (_) {
    return rawUrl;
  }
}

function courseThumbnailSrc(course) {
  const image = course?.thumbnailHorizontal || course?.thumbnail || course?.thumbnailVertical || course?.videos?.[0]?.thumbnail;
  if (image?.data) {
    return `data:${image.mimeType || image.contentType || "image/jpeg"};base64,${image.data}`;
  }
  return window.EduNex?.normalizeImageSrc?.(course?.thumbnailUrl || course?.thumbnailVerticalUrl || course?.videos?.[0]?.thumbnailUrl || "")
    || driveImageSrc(course?.thumbnailUrl || course?.thumbnailVerticalUrl || course?.videos?.[0]?.thumbnailUrl || "");
}

function fallbackCoursePreview() {
  return {
    title: "Skillomate Course Library",
    description: "Start your trial and choose from the real Skillomate courses available in your course catalogue.",
    category: { name: "Skillomate AI" },
    averageRating: 4.8,
    videoCount: 0,
  };
}

function readCachedCheckoutCourse(cacheKey) {
  const cached = safeJsonFromStorage(cacheKey);
  if (!cached?.course || Date.now() - Number(cached.savedAt || 0) > CHECKOUT_COURSE_CACHE_TTL) return null;
  return cached.course;
}

function writeCachedCheckoutCourse(cacheKey, course) {
  try {
    const payload = JSON.stringify({ savedAt: Date.now(), course });
    if (payload.length <= CHECKOUT_COURSE_CACHE_MAX_BYTES) localStorage.setItem(cacheKey, payload);
  } catch (_) {}
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
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#DAB77A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", flexShrink: 0 }} aria-hidden="true">
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

function CoursePreview({ course }) {
  if (!course) {
    return (
      <div className="course-preview" id="coursePreview">
        <div className="cp-thumb skeleton"></div>
        <div className="cp-body">
          <div className="skeleton cp-title-skel"></div>
          <div className="skeleton cp-desc-skel"></div>
        </div>
      </div>
    );
  }

  const cat = course.category?.name || "Course";
  const vids = course.videoCount ?? course.videos?.length ?? 0;
  const rating = Number(course.averageRating || 4.8);
  const title = course.title || "Skillomate";
  const thumbnail = courseThumbnailSrc(course) || window.EduNex?.placeholderImage?.(title) || "";

  return (
    <div className="course-preview" id="coursePreview">
      <div className="cp-recommended">Recommended</div>
      <div className="cp-thumb">
        <img
          src={thumbnail}
          alt={title}
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = window.EduNex?.placeholderImage?.(event.currentTarget.alt || "Skillomate") || "";
          }}
        />
      </div>
      <div className="cp-body">
        <div className="cp-cat">{cat}</div>
        <div className="cp-title">{title}</div>
        <p className="cp-desc">{course.description || ""}</p>
        <div className="cp-meta">
          <div className="cp-meta-item"><span className="icon"><i className="fas fa-star" aria-hidden="true"></i></span>{rating.toFixed(1)} Rating</div>
          {vids ? <div className="cp-meta-item"><span className="icon"><i className="fas fa-play-circle" aria-hidden="true"></i></span>{vids} Lessons</div> : null}
          {course.instructor ? <div className="cp-meta-item"><span className="icon"><i className="fas fa-user" aria-hidden="true"></i></span>{course.instructor}</div> : null}
          <div className="cp-meta-item"><span className="icon"><i className="fas fa-mobile-screen-button" aria-hidden="true"></i></span>All Devices</div>
        </div>
      </div>
      <div className="cp-includes">
        <p>What you get</p>
        <ul>
          <li>Unlimited access to all {vids || "all"} lessons</li>
          <li>Download &amp; watch offline in the app</li>
          <li>Certificate of completion</li>
          <li>Access to 200+ other premium courses</li>
          <li>New courses added every month</li>
        </ul>
      </div>
    </div>
  );
}

export function PaymentPage() {
  const runtimeReady = useEduNexRuntimeReady();
  const query = params();
  const courseId = query.get("courseId");
  const merchantTransactionId = query.get("merchantTransactionId");
  const paymentStatus = query.get("payment") || query.get("status");
  const checkoutCourseCacheKey = `edunexCheckoutCourse:${courseId || "featured"}`;
  const [course, setCourse] = useState(() => readCachedCheckoutCourse(checkoutCourseCacheKey));
  const [trialEligible, setTrialEligible] = useState(true);
  const [checkoutState, setCheckoutState] = useState("loading");
  const [payMsg, setPayMsg] = useState({ text: "", type: "" });
  const [submitting, setSubmitting] = useState(false);
  const busyRef = useRef(false);
  const [pricing, setPricing] = useState(null);
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

  const appLink = buildAppDeepLink(merchantTransactionId);
  const webLink = buildWebContinueLink();

  const configureAppOpenButton = useCallback((targetCourse = course) => {
    const courseWatch = targetCourse?._id ? `/videos.html?courseId=${encodeURIComponent(targetCourse._id)}&video=0` : webLink;
    if (appLink) {
      setWatchHref(appLink);
      setWatchText("Open Skillomate App");
    } else if (courseId || targetCourse?._id) {
      setWatchHref(courseWatch);
      setWatchText("Continue on Web");
    } else {
      setWatchHref(webLink);
      setWatchText("Open Video Library");
    }
  }, [appLink, course, courseId, webLink]);

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
      let rendered = Boolean(course);
      try {
        const summaryUrl = courseId
          ? `/api/courses/checkout-summary?courseId=${encodeURIComponent(courseId)}`
          : "/api/courses/checkout-summary";
        const response = await fetch(summaryUrl, { cache: "force-cache" });
        if (response.ok) {
          const nextCourse = await safeJsonResponse(response);
          if (!cancelled && nextCourse && (nextCourse._id || nextCourse.title || courseThumbnailSrc(nextCourse))) {
            writeCachedCheckoutCourse(checkoutCourseCacheKey, nextCourse);
            setCourse(nextCourse);
            configureAppOpenButton(nextCourse);
            rendered = true;
          }
        }
      } catch (_) {}

      if (!rendered) {
        try {
          const catalog = await window.EduNex.request("/api/courses");
          const list = Array.isArray(catalog) ? catalog : [];
          const fallbackCourse = list.find((item) => courseThumbnailSrc(item)) || list[0] || null;
          if (!cancelled) {
            setCourse(fallbackCourse || fallbackCoursePreview());
            configureAppOpenButton(fallbackCourse || null);
          }
        } catch (_) {
          if (!cancelled) setCourse(fallbackCoursePreview());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimeReady, courseId, checkoutCourseCacheKey]);

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
  }, [authFetch, configureAppOpenButton, merchantTransactionId, paymentStatus, runtimeReady]);

  const initiatePayment = async () => {
    if (busyRef.current || !pricing || !trialEligible) return;
    busyRef.current = true;
    setSubmitting(true);
    setPayMsg({ text: "", type: "" });
    try {
      const response = await authFetch("/api/payment/initiate-trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentType: "trial", mandateConsent: true }),
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
    : `Start ${rupees(pricing?.trialAmountPaise)} Trial`;

  return (
    <div className="react-page-root" data-page="payment.html">
      <div className="pay-page">
        <div className="pay-grid">
          <CoursePreview course={course} />

          <div className="checkout-card">
            <div className="checkout-header">
              <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <i className="fas fa-graduation-cap" aria-hidden="true"></i> Get Full Access
              </h1>
              <p>Unlimited courses · Cancel anytime</p>
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
                    onClick={(event) => {
                      if (!appLink) return;
                      event.preventDefault();
                      openAppWithWebFallback(appLink, webLink);
                    }}
                  >
                    {watchText}
                  </a>
                  <a href="/courses.html" className="pay-btn-secondary" style={{ marginTop: 10 }}><i className="fas fa-book-open" aria-hidden="true"></i> Browse All Courses</a>
                </div>
              ) : null}

              {checkoutState === "pay" ? (
                <div id="payState">
                  <div className="plan-option selected" style={{ cursor: "default" }}>
                    <div className="plan-info">
                      <div className="plan-name">{pricing?.trialHours || 24}-Hour Trial</div>
                      <div className="plan-desc">Full access · Auto-renews monthly</div>
                    </div>
                    <div className="plan-price">
                      <div className="amount">{pricing ? rupees(pricing.trialAmountPaise) : "…"}</div>
                      <span className="per">trial payment</span>
                    </div>
                  </div>
                  {!trialEligible ? <p role="status" style={{ margin: "16px 0" }}>You've already used your trial. <a href="/help.html">Contact support</a> for help with your subscription.</p> : null}
                  {pricing ? <p id="paymentAgreement" style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text)", margin: "16px 0" }}>
                    By continuing, you accept our <a href="/terms.html" target="_blank" rel="noopener noreferrer">Terms</a> &amp; <a href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a> and {rupees(pricing.subscriptionAmountPaise)}/mo auto-renewal after {pricing.trialHours}h.
                  </p> : null}
                  <button className="pay-btn" id="payBtn" type="button" aria-describedby="paymentAgreement" disabled={submitting || !pricing || !trialEligible} onClick={initiatePayment}>
                    <span id="payBtnIcon">{<LightningIcon />}</span>
                    <span id="payBtnText">{payButtonText}</span>
                  </button>
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
            <h2 className="payment-choice-title" id="paymentChoiceTitle">Choose where to continue</h2>
            <p className="payment-choice-copy">You can keep learning in the browser or jump straight into the app.</p>
          </div>
          <div className="payment-choice-body">
            <div className="payment-choice-actions">
              <a className="payment-choice-btn secondary" id="continueWebBtn" href={webLink}>
                <i className="fas fa-globe" aria-hidden="true"></i>
                Continue on Web
              </a>
              <a
                className="payment-choice-btn primary"
                id="continueAppBtn"
                href={appLink || webLink}
                onClick={(event) => {
                  event.preventDefault();
                  openAppWithWebFallback(appLink, webLink);
                }}
              >
                <i className="fas fa-mobile-screen-button" aria-hidden="true"></i>
                Continue on App
              </a>
            </div>
            <div className="payment-choice-meta">If the app does not open, tap Continue on Web and finish there.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
