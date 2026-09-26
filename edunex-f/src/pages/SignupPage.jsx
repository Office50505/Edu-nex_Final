import { saveLoginPrefill, loginDestination, readSignupPrefill, clearSignupPrefill, safeAuthReturnPath, nationalPhoneDigits, pasteNationalPhone } from "../lib/authNavigation.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { page as signupPage } from "../generated-pages/signup.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";
import { useViewportLock } from "../hooks/useViewportLock.js";
import { route } from "../lib/routes.js";
import { apiFetch } from "../lib/apiUrl.js";

const PHONE_ERROR = "Please enter a valid 10-digit phone number.";
const TERMS_ERROR = "Please agree to the Privacy Policy.";
const NAME_ERROR = "Please enter your name.";
const PASSWORD_ERROR = "Password must be at least 8 characters.";
const AGE_ERROR = "Please select your age. Skillomate is for learners aged 13 and older.";
const VERIFY_FIRST_ERROR = "Please verify your mobile number first.";
const SIGNUP_FALLBACK_ERROR = "Signup failed. Please try again.";
const DEFAULT_OTP_LENGTH = 6;
const START_AGE = 13;
const END_AGE = 90;
const AGE_ITEM_HEIGHT = 52;

const avatars = {
  male: [
    { src: "assets/avatars/male1-v1.webp", name: "Avatar 1" },
    { src: "assets/avatars/male2-v1.webp", name: "Avatar 2" },
    { src: "assets/avatars/male3-v1.webp", name: "Avatar 3" },
    { src: "assets/avatars/male4-v1.webp", name: "Avatar 4" },
  ],
  female: [
    { src: "assets/avatars/female1-v1.webp", name: "Avatar 5" },
    { src: "assets/avatars/female2-v1.webp", name: "Avatar 6" },
    { src: "assets/avatars/female3-v1.webp", name: "Avatar 7" },
    { src: "assets/avatars/female4-v1.webp", name: "Avatar 8" },
  ],
};

const ages = Array.from({ length: END_AGE - START_AGE + 1 }, (_, index) => START_AGE + index);

function normalizePhone(value) {
  if (window.EduNex?.normalizePhone) return window.EduNex.normalizePhone(value);
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return String(value || "").trim();
}

async function request(path, options) {
  if (window.EduNex?.request) return window.EduNex.request(path, options);

  const response = await apiFetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  let data = null;
  if (text && contentType.includes("application/json")) {
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = null;
    }
  }
  if (!response.ok) { const error = new Error(data?.error || data?.message || `Request failed with ${response.status}`); error.code = data?.code; throw error; }
  return data;
}

function saveAuth(data) {
  if (window.EduNex?.saveAuth) {
    window.EduNex.saveAuth(data, true);
    return;
  }
  ["edunexAccessToken", "edunexRefreshToken", "edunexUser"].forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
  if (data?.accessToken) localStorage.setItem("edunexAccessToken", data.accessToken);
  if (data?.refreshToken) localStorage.setItem("edunexRefreshToken", data.refreshToken);
  if (data?.user) localStorage.setItem("edunexUser", JSON.stringify(data.user));
}

function normalizedSignupAvatarPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "assets/avatars/male1-v1.webp";
  try {
    const parsed = new URL(raw, window.location.origin);
    const path = parsed.pathname.replace(/^\/+/, "");
    const assetIndex = path.lastIndexOf("assets/");
    return assetIndex >= 0 ? path.slice(assetIndex) : raw;
  } catch (_) {
    const cleaned = raw.replace(/^\/+/, "");
    const assetIndex = cleaned.lastIndexOf("assets/");
    return assetIndex >= 0 ? cleaned.slice(assetIndex) : cleaned;
  }
}

function safeErrorMessage(error, fallback) {
  const message = String(error?.message || "").trim();
  if (!message || /failed to fetch|networkerror|load failed/i.test(message)) return fallback;
  return message;
}

const adResumeRequests = new Map();

export function SignupPage() {
  const requestedNext = new URLSearchParams(window.location.search).get("next");
  const loginHref = requestedNext ? loginDestination(requestedNext, window.location.origin) : route("login.html");
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState(() => readSignupPrefill(sessionStorage));
  useEffect(() => { clearSignupPrefill(sessionStorage); }, []);
  const [agreed, setAgreed] = useState(false);
  const [mobileNumber, setMobileNumber] = useState("");
  const [signupToken, setSignupToken] = useState("");
  const [otp, setOtp] = useState(() => Array(DEFAULT_OTP_LENGTH).fill(""));
  const [countdown, setCountdown] = useState(59);
  const [step1Error, setStep1Error] = useState("");
  const [step3Error, setStep3Error] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [gender, setGender] = useState("male");
  const [avatarTab, setAvatarTab] = useState("male");
  const [avatar, setAvatar] = useState({ src: "assets/avatars/male1-v1.webp", name: "Learner", gender: "male" });
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [age, setAge] = useState(null);
  const [thumbStyle, setThumbStyle] = useState({ left: 6, width: 0 });
  const [thumbReady, setThumbReady] = useState(false);
  useViewportLock(avatarModalOpen);

  const sliderRef = useRef(null);
  const genderButtonRefs = useRef({});
  const ageScrollerRef = useRef(null);
  const ageDragRef = useRef(null);
  const suppressAgeClickRef = useRef(false);
  const otpRefs = useRef([]);
  const avatarTriggerRef = useRef(null);
  const closeAvatarRef = useRef(null);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const incoming = fragment.get("onboarding");
    if (incoming) {
      sessionStorage.setItem("skillomateAdReturn", incoming);
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
    const code = incoming || sessionStorage.getItem("skillomateAdReturn");
    let cancelled = false;
    const restore = data => {
      if (cancelled) return;
      setMobileNumber(data.mobileNumber);
      setPhone(data.mobileNumber.replace(/^\+?91/, ""));
      setSignupToken(data.signupToken);
      setAgreed(true);
      setStep(3);
    };
    if (!code) {
      try {
        const saved = JSON.parse(sessionStorage.getItem("skillomateAdProfile") || "null");
        if (saved?.expiresAt > Date.now()) restore(saved);
      } catch (_) { /* Normal signup remains available. */ }
      return () => { cancelled = true; };
    }
    setStep1Error("Restoring your verified payment and phone number…");
    if (!adResumeRequests.has(code)) {
      adResumeRequests.set(code, request("/api/onboarding/resume", { method: "POST", body: JSON.stringify({ code }) }));
    }
    adResumeRequests.get(code).then(data => {
      sessionStorage.setItem("skillomateAdProfile", JSON.stringify({ ...data, expiresAt: Date.now() + 29 * 60 * 1000 }));
      sessionStorage.removeItem("skillomateAdReturn");
      if (!cancelled) { setStep1Error(""); restore(data); }
    }).catch(error => {
      sessionStorage.removeItem("skillomateAdReturn");
      adResumeRequests.delete(code);
      if (!cancelled) setStep1Error(error.message || "Unable to resume signup. Return to the ad page and check payment status.");
    });
    return () => { cancelled = true; };
  }, []);

  usePageStyle("react-page-style-signup", signupPage.styles);

  const sharedRuntimePage = useMemo(() => ({
    ...signupPage,
    scripts: signupPage.scripts.filter((script) => script.src),
  }), []);

  useEffect(() => {
    document.title = signupPage.title;
    document.documentElement.lang = signupPage.lang || "en";

    const cleanup = runLegacyPage(sharedRuntimePage);
    return () => cleanup?.();
  }, [sharedRuntimePage]);

  useEffect(() => {
    document.body.classList.toggle("profile-mode", step === 3);
    return () => {
      document.body.classList.remove("profile-mode");
    };
  }, [step]);

  useEffect(() => {
    if (step !== 2) return undefined;

    setCountdown(59);
    const timer = window.setInterval(() => {
      setCountdown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step]);

  useEffect(() => {
    if (step !== 3) return;
    const scroller = ageScrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = age === null ? 0 : (age - START_AGE) * AGE_ITEM_HEIGHT;
  }, [age, step]);

  useEffect(() => {
    if (step !== 3) return undefined;
    const scroller = ageScrollerRef.current;
    if (!scroller) return undefined;

    let raf = 0;
    const updateActiveAge = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const index = Math.round(scroller.scrollTop / AGE_ITEM_HEIGHT);
        setAge(Math.min(END_AGE, Math.max(START_AGE, START_AGE + index)));
      });
    };

    scroller.addEventListener("scroll", updateActiveAge, { passive: true });
    return () => {
      window.cancelAnimationFrame(raf);
      scroller.removeEventListener("scroll", updateActiveAge);
    };
  }, [step]);

  useEffect(() => {
    const updateThumb = () => {
      const slider = sliderRef.current;
      const selected = genderButtonRefs.current[gender];
      if (!slider || !selected) return;

      const width = selected.offsetWidth;
      if (!width) {
        window.requestAnimationFrame(updateThumb);
        return;
      }
      const sliderRect = slider.getBoundingClientRect();
      const buttonRect = selected.getBoundingClientRect();
      setThumbStyle({ left: buttonRect.left - sliderRect.left, width });
      setThumbReady(true);
    };

    updateThumb();
    window.addEventListener("resize", updateThumb);
    return () => window.removeEventListener("resize", updateThumb);
  }, [gender, step]);

  useEffect(() => {
    if (!avatarModalOpen) return undefined;
    const previous = document.activeElement;
    const closeButton = closeAvatarRef.current;
    window.requestAnimationFrame(() => closeButton?.focus());
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setAvatarModalOpen(false);
        avatarTriggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [avatarModalOpen]);

  const startOtpStep = (normalizedPhone, devOtp) => {
    setMobileNumber(normalizedPhone);
    setStep(2);
    setCountdown(59);
    if (devOtp) {
      setOtp(String(devOtp).split(""));
    } else {
      setOtp(Array(DEFAULT_OTP_LENGTH).fill(""));
    }
  };

  const sendOTP = async () => {
    if (sendingOtp) return;

    const normalizedPhone = normalizePhone(phone);
    if (!/^\+91\d{10}$/.test(normalizedPhone.replace(/\s/g, ""))) {
      setStep1Error(PHONE_ERROR);
      return;
    }
    if (!agreed) {
      setStep1Error(TERMS_ERROR);
      return;
    }

    setStep1Error("");
    setSendingOtp(true);
    try {
      const data = await request("/api/auth/send-mobile-otp", {
        method: "POST",
        body: JSON.stringify({ mobileNumber: normalizedPhone }),
      });
      startOtpStep(normalizedPhone, data?.devOtp);
    } catch (error) {
      if (error.code === "MOBILE_ALREADY_REGISTERED") {
        saveLoginPrefill(normalizedPhone, sessionStorage);
        window.location.assign(loginHref);
        return;
      }
      setStep1Error(safeErrorMessage(error, "Could not send OTP."));
    } finally {
      setSendingOtp(false);
    }
  };

  const resendOTP = async () => {
    if (!mobileNumber) return;
    try {
      await request("/api/auth/resend-mobile-otp", {
        method: "POST",
        body: JSON.stringify({ mobileNumber }),
      });
      setCountdown(59);
    } catch (error) {
      window.alert(safeErrorMessage(error, "Could not resend OTP."));
    }
  };

  const verifyOTP = async () => {
    if (verifyingOtp) return;

    const mobileOtp = otp.join("");
    if (mobileOtp.length !== otp.length) {
      window.alert(`Please enter all ${otp.length} digits.`);
      return;
    }

    setVerifyingOtp(true);
    try {
      const data = await request("/api/auth/verify-mobile-otp", {
        method: "POST",
        body: JSON.stringify({ mobileNumber, mobileOtp }),
      });
      setSignupToken(data?.signupToken || "");
      setStep(3);
    } catch (error) {
      window.alert(safeErrorMessage(error, "Invalid OTP. Please try again."));
    } finally {
      setVerifyingOtp(false);
    }
  };

  const completeProfile = async () => {
    if (creatingAccount) return;

    const signupProfile = {
      fullName: fullName.trim(),
      mobileNumber,
      gender,
      age,
      avatar: normalizedSignupAvatarPath(avatar.src),
    };

    if (!signupProfile.fullName) {
      setStep3Error(NAME_ERROR);
      return;
    }
    if (password.length < 8) {
      setStep3Error(PASSWORD_ERROR);
      return;
    }
    if (!Number.isInteger(age) || age < START_AGE || age > END_AGE) {
      setStep3Error(AGE_ERROR);
      return;
    }
    if (!signupToken) {
      setStep3Error(VERIFY_FIRST_ERROR);
      return;
    }

    setStep3Error("");
    setCreatingAccount(true);
    try {
      const data = await request("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          fullName: signupProfile.fullName,
          mobileNumber: signupProfile.mobileNumber,
          password,
          signupToken,
          gender: signupProfile.gender,
          age: signupProfile.age,
          avatar: signupProfile.avatar,
        }),
      });
      saveAuth(data);
      sessionStorage.removeItem("skillomateAdProfile");
      sessionStorage.removeItem("skillomateAdReturn");
      localStorage.setItem("edunexSignupProfile", JSON.stringify(data?.user || signupProfile));
      window.location.href = safeAuthReturnPath(requestedNext, window.location.origin, route("index.html"));
    } catch (error) {
      setStep3Error(safeErrorMessage(error, SIGNUP_FALLBACK_ERROR));
    } finally {
      setCreatingAccount(false);
    }
  };

  const selectGender = (nextGender) => {
    setGender(nextGender);
    if (nextGender === "male" || nextGender === "female") {
      setAvatarTab(nextGender);
    }
  };

  const switchAvatarTab = (nextTab) => {
    if (gender === "male" && nextTab === "female") return;
    if (gender === "female" && nextTab === "male") return;
    setAvatarTab(nextTab);
  };

  const selectAvatar = (nextAvatar, nextGender) => {
    if (gender === "male" && nextGender === "female") return;
    if (gender === "female" && nextGender === "male") return;
    setAvatar({ ...nextAvatar, gender: nextGender });
    window.setTimeout(() => {
      setAvatarModalOpen(false);
      avatarTriggerRef.current?.focus();
    }, 220);
  };

  const handleOtpChange = (index, value) => {
    const incoming = value.replace(/\D/g, "");
    if (incoming.length > 1) {
      setOtp((current) => {
        const next = [...current];
        incoming.slice(0, current.length - index).split("").forEach((digit, offset) => {
          next[index + offset] = digit;
        });
        return next;
      });
      otpRefs.current[Math.min(index + incoming.length, otpRefs.current.length - 1)]?.focus();
      return;
    }

    const digit = incoming.slice(-1);
    setOtp((current) => current.map((item, itemIndex) => (itemIndex === index ? digit : item)));
    if (digit && index < otpRefs.current.length - 1) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index, event) => {
    if (event.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (event) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, otp.length);
    const nextOtp = Array(otp.length).fill("").map((_, index) => text[index] || "");
    setOtp(nextOtp);
    otpRefs.current[Math.min(text.length, otpRefs.current.length - 1)]?.focus();
  };

  const scrollToAge = (nextAge, behavior = "smooth") => {
    const safeAge = Math.min(END_AGE, Math.max(START_AGE, nextAge));
    setAge(safeAge);
    ageScrollerRef.current?.scrollTo({
      top: (safeAge - START_AGE) * AGE_ITEM_HEIGHT,
      behavior,
    });
  };

  const handleAgePointerDown = (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const scroller = event.currentTarget;
    ageDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollTop: scroller.scrollTop,
      moved: false,
    };
    scroller.setPointerCapture?.(event.pointerId);
    scroller.classList.add("is-dragging");
  };

  const handleAgePointerMove = (event) => {
    const drag = ageDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = event.clientY - drag.startY;
    if (Math.abs(delta) > 3) drag.moved = true;
    event.currentTarget.scrollTop = drag.startScrollTop - delta;
    event.preventDefault();
  };

  const finishAgePointer = (event) => {
    const drag = ageDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const scroller = event.currentTarget;
    scroller.releasePointerCapture?.(event.pointerId);
    scroller.classList.remove("is-dragging");
    const nextAge = START_AGE + Math.round(scroller.scrollTop / AGE_ITEM_HEIGHT);
    scrollToAge(nextAge);
    if (drag.moved) {
      suppressAgeClickRef.current = true;
      window.setTimeout(() => { suppressAgeClickRef.current = false; }, 0);
    }
    ageDragRef.current = null;
  };

  const handleAgeKeyDown = (event) => {
    const ageStep = event.key === "PageUp" || event.key === "PageDown" ? 5 : 1;
    let nextAge = age ?? START_AGE;
    if (event.key === "ArrowUp" || event.key === "ArrowLeft" || event.key === "PageUp") nextAge -= ageStep;
    else if (event.key === "ArrowDown" || event.key === "ArrowRight" || event.key === "PageDown") nextAge += ageStep;
    else if (event.key === "Home") nextAge = START_AGE;
    else if (event.key === "End") nextAge = END_AGE;
    else return;
    event.preventDefault();
    scrollToAge(nextAge);
  };

  const openAvatarModal = () => setAvatarModalOpen(true);
  const closeAvatarModal = () => {
    setAvatarModalOpen(false);
    avatarTriggerRef.current?.focus();
  };
  const countdownText = `0:${countdown < 10 ? "0" : ""}${countdown}`;

  return (
    <div className="react-page-root" data-page="signup.html">
      <main className="sp-main">
        <div className="sp-photo">
          <img src="assets/image.png" alt="Student learning AI with Skillomate" />
          <div className="sp-photo-overlay"></div>
          <div className="sp-photo-bottom">
            <div className="sp-photo-heading">Join the AI Revolution</div>
            <div className="sp-photo-quote">
              <i className="fas fa-check-circle" aria-hidden="true"></i>
              <p>"The personalized AI pathways cut my learning time by 40%. The best investment for my career evolution."</p>
            </div>
            <a href="signup.html" className="sp-photo-cta">
              <i className="fas fa-plus-circle" aria-hidden="true"></i>
              Start your 24-hour trial for ₹1
            </a>
          </div>
        </div>

        <div className="sp-form-panel">
          <form className={`sp-step${step === 1 ? " active" : ""}`} id="step1" onSubmit={(event) => { event.preventDefault(); void sendOTP(); }}>
            {step === 1 ? (
              <h1 className="sp-form-title">Create your account</h1>
            ) : (
              <h2 className="sp-form-title">Create your account</h2>
            )}
            <p className="sp-form-sub">Start with ₹1 for 24 hours, then ₹499/month until cancelled.</p>

            <label className="sp-field-label" htmlFor="phoneInput">Phone Number</label>
            <div className="sp-input-row">
              <span className="sp-prefix">+91</span>
              <input
                type="tel"
                id="phoneInput"
                placeholder="98765 43210"
                maxLength={10}
                inputMode="numeric"
                autoComplete="tel-national"
                aria-describedby="step1-err"
                value={phone}
                onChange={(event) => setPhone(nationalPhoneDigits(event.target.value))}
                onPaste={(event) => pasteNationalPhone(event, setPhone)}
              />
            </div>

            <label className="sp-checkbox-row">
              <input
                type="checkbox"
                id="agreeCheck"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
              />
              I agree to the <a href={route("privacy.html")}>Privacy Policy.</a>
            </label>

            <p
              className="sp-err"
              id="step1-err"
              style={{ fontSize: ".78rem", color: "#f87171", marginBottom: 10, display: step1Error ? "block" : "none" }}
              role="alert"
              aria-live="assertive"
            >
              {step1Error}
            </p>

            <button className="sp-primary-btn" type="submit" disabled={sendingOtp}>
              {sendingOtp ? "Sending..." : "Send OTP & Continue"}
            </button>
            <p className="sp-login-row">Already have an account? <a href={loginHref}>Log in</a></p>
          </form>

          <div className={`sp-step${step === 2 ? " active" : ""}`} id="step2">
            {step === 2 ? (
              <h1 className="sp-form-title">Create your account</h1>
            ) : (
              <h2 className="sp-form-title">Create your account</h2>
            )}
            <p className="sp-form-sub">Start with ₹1 for 24 hours, then ₹499/month until cancelled.</p>

            <p className="sp-otp-label">Enter OTP</p>
            <p className="sp-otp-desc">We've sent a {otp.length}-digit code to your phone.</p>

            <div className="sp-otp-boxes">
              {otp.map((digit, index) => (
                <input
                  className="sp-otp-box"
                  type="text"
                  maxLength={index === 0 ? otp.length : 1}
                  inputMode="numeric"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  placeholder="–"
                  aria-label={`OTP digit ${index + 1}`}
                  key={`otp-${index + 1}`}
                  value={digit}
                  ref={(node) => {
                    otpRefs.current[index] = node;
                  }}
                  onChange={(event) => handleOtpChange(index, event.target.value)}
                  onKeyDown={(event) => handleOtpKeyDown(index, event)}
                  onPaste={handleOtpPaste}
                />
              ))}
            </div>

            <button className="sp-primary-btn" id="verifyBtn" type="button" onClick={verifyOTP} disabled={verifyingOtp}>
              {verifyingOtp ? "Verifying..." : "Verify OTP"}
            </button>

            <p className="sp-resend">
              Didn't receive the code?&nbsp;
              <button
                className="link"
                id="resendLink"
                type="button"
                onClick={resendOTP}
                style={{ pointerEvents: countdown > 0 ? "none" : "auto" }}
                aria-disabled={countdown > 0}
              >
                Resend Code (<span id="countdown">{countdownText}</span>)
              </button>
            </p>
            <p className="sp-login-row">Already have an account? <a href={loginHref}>Log in</a></p>
          </div>
        </div>

        <div
          className={`sp-ava-modal-overlay${avatarModalOpen ? " open" : ""}`}
          id="avaModal"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeAvatarModal();
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ava-modal-title"
        >
          <div className="sp-ava-modal">
            <div className="sp-ava-modal-head">
              <span className="sp-ava-modal-title" id="ava-modal-title">Choose Your Avatar</span>
              <button className="sp-ava-modal-close" onClick={closeAvatarModal} aria-label="Close avatar picker" ref={closeAvatarRef} type="button">
                <i className="fas fa-times" aria-hidden="true"></i>
              </button>
            </div>
            <div className="sp-avatar-tabs">
              <button
                className={`sp-avatar-tab${avatarTab === "male" ? " active" : ""}${gender === "female" ? " locked" : ""}`}
                id="tabMale"
                type="button"
                onClick={() => switchAvatarTab("male")}
                aria-disabled={gender === "female"}
              >
                <i className="fas fa-mars" aria-hidden="true"></i> Male
              </button>
              <button
                className={`sp-avatar-tab${avatarTab === "female" ? " active" : ""}${gender === "male" ? " locked" : ""}`}
                id="tabFemale"
                type="button"
                onClick={() => switchAvatarTab("female")}
                aria-disabled={gender === "male"}
              >
                <i className="fas fa-venus" aria-hidden="true"></i> Female
              </button>
            </div>
            <div className="sp-avatar-grid" id="avaGridMale" style={{ display: avatarTab === "male" ? "grid" : "none" }}>
              {avatars.male.map((item) => (
                <div
                  className={`sp-ava-opt${avatar.src === item.src ? " selected" : ""}`}
                  data-name={item.name}
                  data-gender="male"
                  key={item.src}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectAvatar(item, "male")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectAvatar(item, "male");
                    }
                  }}
                >
                  <img src={item.src} alt="" />
                </div>
              ))}
            </div>
            <div className="sp-avatar-grid" id="avaGridFemale" style={{ display: avatarTab === "female" ? "grid" : "none" }}>
              {avatars.female.map((item) => (
                <div
                  className={`sp-ava-opt${avatar.src === item.src ? " selected" : ""}`}
                  data-name={item.name}
                  data-gender="female"
                  key={item.src}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectAvatar(item, "female")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectAvatar(item, "female");
                    }
                  }}
                >
                  <img src={item.src} alt="" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={`sp-profile-wrap${step === 3 ? " active" : ""}`} id="step3">
          {step === 3 ? (
            <h1 className="sp-profile-heading">Tell us about yourself</h1>
          ) : (
            <h2 className="sp-profile-heading">Tell us about yourself</h2>
          )}
          <p className="sp-profile-sub">Customize your learning experience with AI-driven personalization.</p>

          <div className="sp-ava-center">
            <div
              className="sp-ava-circle"
              onClick={openAvatarModal}
              ref={avatarTriggerRef}
              role="button"
              tabIndex={0}
              aria-label="Choose avatar"
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openAvatarModal();
                }
              }}
            >
              <img id="avaCircleImg" src={avatar.src} alt="Avatar" />
              <div className="sp-ava-circle-edit">CHANGE</div>
            </div>
            <div className="sp-ava-circle-name" id="avaCircleName">{avatar.name}</div>
            <div className="sp-ava-circle-hint">Tap to change avatar</div>
          </div>

          <div className="sp-profile-card">
            <div className="sp-profile-field">
              <label className="sp-field-label" id="gender-label">Gender Identity</label>
              <div className={`sp-gender-slider${thumbReady ? " ready" : ""}`} id="genderSlider" ref={sliderRef} role="radiogroup" aria-labelledby="gender-label">
                <div className="sp-gender-slider-thumb" id="genderThumb" style={{ left: thumbStyle.left, width: thumbStyle.width }}></div>
                {["male", "female", "other"].map((item) => (
                  <button
                    className={`sp-gender-slide-btn${gender === item ? " selected" : ""}`}
                    data-gender={item}
                    key={item}
                    type="button"
                    role="radio"
                    aria-checked={gender === item}
                    ref={(node) => {
                      genderButtonRefs.current[item] = node;
                    }}
                    onClick={() => selectGender(item)}
                  >
                    <i className={`fas ${item === "male" ? "fa-mars" : item === "female" ? "fa-venus" : "fa-star"}`} aria-hidden="true"></i> {item === "other" ? "Other" : item[0].toUpperCase() + item.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="sp-profile-field">
              <label className="sp-field-label" htmlFor="fullNameInput">Enter your name</label>
              <input className="sp-profile-input" id="fullNameInput" type="text" placeholder="e.g. Alex Rivers" style={{ width: "100%" }} autoComplete="name" aria-describedby="step3-err" value={fullName} onChange={(event) => setFullName(event.target.value)} />
            </div>

            <div className="sp-profile-field">
              <label className="sp-field-label" htmlFor="passwordInput">Password</label>
              <input className="sp-profile-input" id="passwordInput" type="password" placeholder="Minimum 8 characters" style={{ width: "100%" }} autoComplete="new-password" aria-describedby="step3-err" value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>

            <div className="sp-profile-field">
              <label className="sp-field-label" id="age-label">Your Age</label>
              <div className="sp-age-roller">
                <div
                  className="sp-roller-track"
                  id="ageScroller"
                  ref={ageScrollerRef}
                  role="listbox"
                  tabIndex={0}
                  aria-labelledby="age-label"
                  aria-activedescendant={age === null ? undefined : `signup-age-${age}`}
                  onKeyDown={handleAgeKeyDown}
                  onPointerDown={handleAgePointerDown}
                  onPointerMove={handleAgePointerMove}
                  onPointerUp={finishAgePointer}
                  onPointerCancel={finishAgePointer}
                >
                  <div className="sp-roller-inner" id="rollerInner" data-ready="true">
                    {ages.map((item) => (
                      <div
                        className={`sp-roller-item${age === item ? " active" : ""}`}
                        data-age={item}
                        id={`signup-age-${item}`}
                        key={item}
                        role="option"
                        aria-selected={age === item}
                        onClick={() => {
                          if (suppressAgeClickRef.current) return;
                          scrollToAge(item);
                        }}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <p
              className="sp-err"
              id="step3-err"
              style={{ fontSize: ".78rem", color: "#f87171", marginBottom: 10, display: step3Error ? "block" : "none" }}
              role="alert"
              aria-live="assertive"
            >
              {step3Error}
            </p>
            <button className="sp-complete-btn" id="completeProfileBtn" type="button" onClick={completeProfile} disabled={creatingAccount}>
              {creatingAccount ? "Creating account..." : "Complete My Profile"}
            </button>
            <p className="sp-terms-note">By continuing, you agree to our <a href={route("privacy.html")}>Privacy Policy.</a></p>
          </div>
        </div>
      </main>
    </div>
  );
}
