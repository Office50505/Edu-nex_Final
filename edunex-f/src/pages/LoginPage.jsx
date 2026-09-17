import { readLoginPrefill, clearLoginPrefill, saveSignupPrefill, signupDestination } from "../lib/authNavigation.js";
import { useEffect, useMemo, useState } from "react";
import { page as loginPage } from "../generated-pages/login.html.js";
import { BrandLogo } from "../components/BrandLogo.jsx";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";
import { route } from "../lib/routes.js";
import { PasswordRecovery } from "../components/PasswordRecovery.jsx";

const EMPTY_LOGIN_MESSAGE = "Please enter your mobile number and password.";
const FALLBACK_LOGIN_MESSAGE = "Could not sign in. Please try again.";

function normalizePhone(value) {
  if (window.EduNex?.normalizePhone) return window.EduNex.normalizePhone(value);
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return String(value || "").trim();
}

function safeNext(defaultPath = "/dashboard.html") {
  if (window.EduNex?.safeNext) return window.EduNex.safeNext(defaultPath);
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next) return defaultPath;
  try {
    const url = new URL(next, window.location.origin);
    return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : defaultPath;
  } catch (_) {
    return next.startsWith("/") && !next.startsWith("//") ? next : defaultPath;
  }
}

async function requestLogin(loginId, password, remember) {
  if (window.EduNex?.request) {
    return window.EduNex.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ loginId, password, remember }),
    });
  }

  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loginId, password, remember }),
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
  if (!response.ok) throw Object.assign(new Error(data?.error || data?.message || FALLBACK_LOGIN_MESSAGE), { code: data?.code });
  return data;
}

function saveAuth(data, remember) {
  if (!data?.accessToken) {
    throw new Error(FALLBACK_LOGIN_MESSAGE);
  }
  if (window.EduNex?.saveAuth) {
    window.EduNex.saveAuth(data, remember);
    return;
  }
  const target = remember ? localStorage : sessionStorage;
  ["edunexAccessToken", "edunexRefreshToken", "edunexUser"].forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
  if (data?.accessToken) target.setItem("edunexAccessToken", data.accessToken);
  if (data?.refreshToken) target.setItem("edunexRefreshToken", data.refreshToken);
  if (data?.user) target.setItem("edunexUser", JSON.stringify(data.user));
}

function safeLoginError(error) {
  const message = String(error?.message || "").trim();
  if (!message || /request failed with \d+|failed to fetch|networkerror|load failed/i.test(message)) {
    return FALLBACK_LOGIN_MESSAGE;
  }
  return message;
}

function readSessionNotice() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("session") === "different-device";
  let fromStorage = "";
  try {
    fromStorage = sessionStorage.getItem("edunexSessionNotice") || "";
    sessionStorage.removeItem("edunexSessionNotice");
  } catch (_) {
    fromStorage = "";
  }
  return fromStorage || (fromQuery ? "Your account is logged in on a different device." : "");
}

export function LoginPage() {
  const [loginId, setLoginId] = useState(() => readLoginPrefill(sessionStorage));
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(() => readSessionNotice());

  usePageStyle("react-page-style-login", loginPage.styles);

  const sharedRuntimePage = useMemo(() => ({
    ...loginPage,
    scripts: loginPage.scripts.filter((script) => script.src),
  }), []);

  useEffect(() => {
    clearLoginPrefill(sessionStorage);
    document.title = loginPage.title;
    document.documentElement.lang = loginPage.lang || "en";

    const cleanup = runLegacyPage(sharedRuntimePage);
    return () => cleanup?.();
  }, [sharedRuntimePage]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    const trimmedLogin = loginId.trim();
    const trimmedPassword = password.trim();
    if (!trimmedLogin || !trimmedPassword) {
      setError(EMPTY_LOGIN_MESSAGE);
      return;
    }

    setError("");
    setLoading(true);
    try {
      const data = await requestLogin(normalizePhone(trimmedLogin), trimmedPassword, remember);
      saveAuth(data, remember);
      window.dispatchEvent(new Event("edunex:auth-changed"));
      window.location.href = safeNext("/dashboard.html");
    } catch (loginError) {
      if (loginError.code === "MOBILE_NOT_REGISTERED") {
        saveSignupPrefill(normalizePhone(trimmedLogin), sessionStorage);
        setError("Account does not exist. Redirecting to signup...");
        const next = new URLSearchParams(window.location.search).get("next");
        window.location.assign(signupDestination(next, window.location.origin));
        return;
      }
      setError(safeLoginError(loginError));
    } finally {
      setLoading(false);
    }
  };

  const showForgotPasswordHelp = () => {
    setError("");
    setNotice("");
    setPassword("");
    setRecovering(true);
  };

  return (
    <div className="react-page-root" data-page="login.html">
      <main className="lp-wrap">
        <div className="lp-left">
          <a href={route("index.html")} className="lp-logo" aria-label="Skillomate AI home">
            <BrandLogo />
          </a>
          <div className="lp-hero">
            <div className="lp-marketing-title">Elevate your career<br />with <span>AI precision.</span></div>
            <p>Build practical technology and creative skills through a focused, AI-first curriculum.</p>
          </div>
          <div className="lp-testimonial">
            <div className="lp-test-card">
              <img className="lp-test-photo" src="assets/image.png" alt="Student at laptop" />
              <div className="lp-test-body">
                <div className="lp-big-quote">❝</div>
                <p className="lp-test-text">"The AI Masterclass helped me build a clearer learning routine and apply new tools to practical projects."</p>
                <div className="lp-author">
                  <img className="lp-author-avatar" src="assets/image.png" alt="Skillomate Mentor" />
                  <div>
                    <div className="lp-author-name">Skillomate Learner</div>
                    <div className="lp-author-role">Course learner</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lp-right">
          {recovering ? <PasswordRecovery initialPhone={loginId} onBack={() => setRecovering(false)} onComplete={(phone) => {
            setLoginId(phone);
            setPassword("");
            setRecovering(false);
            setNotice("Password updated. Sign in with your new password.");
          }} /> :
          <form className="lp-form-box" onSubmit={handleSubmit}>
            <h1 className="lp-login-title">Welcome Back</h1>
            <p className="lp-subtitle">Enter your credentials to access your AI learning dashboard.</p>

            <div className="lp-form-group">
              <label htmlFor="emailInput">Mobile Number</label>
              <div className="lp-input-wrap" style={{ display: "flex", alignItems: "center" }}>
                <i className="fas fa-phone" aria-hidden="true"></i>
                <span className="lp-prefix">+91</span>
                <input
                  type="tel"
                  id="emailInput"
                  placeholder="Enter your mobile number"
                  maxLength={10}
                  autoComplete="tel-national"
                  aria-describedby="lp-err"
                  value={loginId}
                  onChange={(event) => setLoginId(event.target.value)}
                />
              </div>
            </div>

            <div className="lp-form-group">
              <div className="lp-label-row">
                <label htmlFor="passInput">Password</label>
                <button type="button" className="lp-forgot" disabled={loading} onClick={showForgotPasswordHelp}>Forgot?</button>
              </div>
              <div className="lp-input-wrap">
                <i className="fas fa-lock" aria-hidden="true"></i>
                <input
                  type={showPassword ? "text" : "password"}
                  id="passInput"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  aria-describedby="lp-err"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="lp-eye-icon"
                  id="eyeIcon"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <i className={`fas ${showPassword ? "fa-eye-slash" : "fa-eye"}`} aria-hidden="true"></i>
                </button>
              </div>
            </div>

            <label className="lp-remember">
              <input
                type="checkbox"
                id="rememberInput"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              /> Remember me for 30 days
            </label>

            {notice && <p role="status" style={{ color: "#86efac", marginBottom: 16 }}>{notice}</p>}
            <p className="lp-err" id="lp-err" style={{ display: error ? "block" : "none" }} role="alert" aria-live="assertive">
              {error}
            </p>

            <button className="lp-signin-btn" type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </button>

            <p className="lp-create-row">Don't have an account? <a href="signup.html">Create an account</a></p>

            <div className="lp-footer-links">
              <a href={route("privacy.html")}>Privacy Policy</a>
              <a href="help.html">Help Center</a>
            </div>
          </form>}
        </div>
      </main>
    </div>
  );
}
