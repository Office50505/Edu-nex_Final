import { useEffect, useMemo, useRef, useState } from "react";
import { page as otpPage } from "../generated-pages/otp.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";

const OTP_LENGTH = 6;
const INITIAL_SECONDS = 4 * 60 + 59;

function formatCountdown(value) {
  const minutes = Math.floor(value / 60).toString().padStart(2, "0");
  const seconds = (value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

const inertLinkStyle = {
  appearance: "none",
  background: "none",
  border: 0,
  color: "var(--accent)",
  cursor: "default",
  font: "inherit",
  fontWeight: 600,
  margin: 0,
  padding: 0,
};

const mutedInertLinkStyle = {
  ...inertLinkStyle,
  color: "var(--text-muted)",
  fontWeight: "inherit",
};

export function OtpPage() {
  const [digits, setDigits] = useState(() => Array(OTP_LENGTH).fill(""));
  const [countdown, setCountdown] = useState(INITIAL_SECONDS);
  const inputRefs = useRef([]);

  usePageStyle("react-page-style-otp", otpPage.styles);

  const sharedRuntimePage = useMemo(() => ({
    ...otpPage,
    scripts: otpPage.scripts.filter((script) => script.src && !/js\/main\.js$/i.test(script.src)),
  }), []);

  useEffect(() => {
    document.title = otpPage.title;
    document.documentElement.lang = otpPage.lang || "en";

    const cleanup = runLegacyPage(sharedRuntimePage);
    return () => cleanup?.();
  }, [sharedRuntimePage]);

  useEffect(() => {
    setCountdown(INITIAL_SECONDS);
    const timer = window.setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return value - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  function updateDigits(nextDigits, focusIndex) {
    setDigits(nextDigits);
    if (typeof focusIndex === "number") {
      window.requestAnimationFrame(() => inputRefs.current[focusIndex]?.focus());
    }
  }

  function handleInput(index, event) {
    const value = onlyDigits(event.target.value).slice(-1);
    const nextDigits = [...digits];
    nextDigits[index] = value;
    updateDigits(nextDigits, value && index < OTP_LENGTH - 1 ? index + 1 : undefined);
  }

  function handleKeyDown(index, event) {
    if (event.key !== "Backspace" || digits[index]) return;
    if (index > 0) {
      event.preventDefault();
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(index, event) {
    const pasted = onlyDigits(event.clipboardData?.getData("text")).slice(0, OTP_LENGTH - index);
    if (!pasted) return;

    event.preventDefault();
    const nextDigits = [...digits];
    pasted.split("").forEach((digit, offset) => {
      nextDigits[index + offset] = digit;
    });
    updateDigits(nextDigits, Math.min(index + pasted.length, OTP_LENGTH - 1));
  }

  function handleVerify() {
    window.location.href = "dashboard.html";
  }

  return (
    <div className="react-page-root" data-page="otp.html" role="main">
      <div className="otp-wrap">
        <div className="otp-box">
          <a
            href="index.html"
            style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginBottom: 32 }}
          >
            <div className="logo-mark">N</div>
            <span className="logo-name" style={{ fontSize: "1.35rem", fontWeight: 800 }}>
              Edu<span style={{ color: "var(--accent)" }}>Nex</span>
            </span>
          </a>

          <div className="otp-icon">
            <i className="fas fa-shield-alt" style={{ color: "var(--accent)" }} aria-hidden="true" />
          </div>

          <h1>Tell us about yourself</h1>
          <p style={{ margin: "12px 0 8px" }}>
            We've sent a 6-digit verification code to your WhatsApp number ending in{" "}
            <strong style={{ color: "var(--text-primary)" }}>••••7891</strong>
          </p>

          <div className="otp-inputs" role="group" aria-label="One-time password">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(node) => {
                  inputRefs.current[index] = node;
                }}
                type="text"
                className={digit ? "otp-input filled" : "otp-input"}
                maxLength={1}
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : undefined}
                aria-label={`OTP digit ${index + 1}`}
                value={digit}
                onChange={(event) => handleInput(index, event)}
                onKeyDown={(event) => handleKeyDown(index, event)}
                onPaste={(event) => handlePaste(index, event)}
              />
            ))}
          </div>

          <div className="countdown">
            Code expires in <span id="timer">{formatCountdown(countdown)}</span>
          </div>

          <button
            type="button"
            onClick={handleVerify}
            className="btn btn-primary btn-lg"
            style={{ width: "100%", justifyContent: "center", marginTop: 24 }}
          >
            <i className="fas fa-check-circle" aria-hidden="true" /> Verify &amp; Continue
          </button>

          <div
            style={{
              marginTop: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontSize: ".85rem",
              color: "var(--text-muted)",
            }}
          >
            Didn't receive the code?
            <button type="button" style={inertLinkStyle} aria-disabled="true" tabIndex={-1}>
              Resend via WhatsApp
            </button>
          </div>

          <div
            style={{
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontSize: ".85rem",
              color: "var(--text-muted)",
            }}
          >
            <button type="button" style={mutedInertLinkStyle} aria-disabled="true" tabIndex={-1}>
              Try SMS instead
            </button>
            <span>·</span>
            <a href="login.html" style={{ color: "var(--text-muted)" }}>Change number</a>
          </div>

          <div
            style={{
              marginTop: 24,
              padding: 16,
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)",
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              textAlign: "left",
            }}
          >
            <i className="fab fa-whatsapp" style={{ color: "#25D366", fontSize: "1.1rem", marginTop: 2 }} aria-hidden="true" />
            <div>
              <div style={{ fontSize: ".82rem", fontWeight: 600, marginBottom: 2 }}>WhatsApp Verification</div>
              <p style={{ fontSize: ".78rem", margin: 0 }}>
                Your WhatsApp number will be used for important course updates, lesson reminders, and community announcements. We respect your privacy.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OtpPage;
