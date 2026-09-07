import { useEffect, useMemo, useState } from "react";
import { page as loginPage } from "../generated-pages/login.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";

const EMPTY_LOGIN_MESSAGE = "Please enter your mobile number and password.";
const FORGOT_PASSWORD_MESSAGE = "Password recovery is not available on this local build yet. Please contact Skillomate support for account help.";
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

async function requestLogin(loginId, password) {
  if (window.EduNex?.request) {
    return window.EduNex.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ loginId, password }),
    });
  }

  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loginId, password }),
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
  if (!response.ok) throw new Error(data?.error || data?.message || FALLBACK_LOGIN_MESSAGE);
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

function safeLoginError(error) {
  const message = String(error?.message || "").trim();
  if (!message || /request failed with \d+|failed to fetch|networkerror|load failed/i.test(message)) {
    return FALLBACK_LOGIN_MESSAGE;
  }
  return message;
}

export function LoginPage() {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  usePageStyle("react-page-style-login", loginPage.styles);

  const sharedRuntimePage = useMemo(() => ({
    ...loginPage,
    scripts: loginPage.scripts.filter((script) => script.src),
  }), []);

  useEffect(() => {
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
      const data = await requestLogin(normalizePhone(trimmedLogin), trimmedPassword);
      saveAuth(data);
      window.dispatchEvent(new Event("edunex:auth-changed"));
      window.location.href = safeNext("/dashboard.html");
    } catch (loginError) {
      setError(safeLoginError(loginError));
    } finally {
      setLoading(false);
    }
  };

  const showForgotPasswordHelp = () => {
    setError(FORGOT_PASSWORD_MESSAGE);
  };

  return (
    <div className="react-page-root" data-page="login.html">
      <main className="lp-wrap">
        <div className="lp-left">
          <a href="index.html" className="lp-logo">Skillomate</a>
          <div className="lp-hero">
            <div className="lp-marketing-title">Elevate your career<br />with <span>AI precision.</span></div>
            <p>Join over 100,000+ students mastering the future of technology and creative strategy through our curated AI-first curriculum.</p>
          </div>
          <div className="lp-testimonial">
            <div className="lp-test-card">
              <img className="lp-test-photo" src="assets/image.png" alt="Student at laptop" />
              <div className="lp-test-body">
                <div className="lp-big-quote">❝</div>
                <p className="lp-test-text">"The AI Masterclass at Skillomate completely redefined my workflow. I secured a Senior Developer role within 3 months of finishing."</p>
                <div className="lp-author">
                  <img className="lp-author-avatar" src="assets/image.png" alt="Skillomate Mentor" />
                  <div>
                    <div className="lp-author-name">Skillomate Mentor</div>
                    <div className="lp-author-role">Google Alumni</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lp-right">
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
                  style={{ paddingLeft: 56 }}
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
                <button type="button" className="lp-forgot" onClick={showForgotPasswordHelp}>Forgot?</button>
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

            <p className="lp-err" id="lp-err" style={{ display: error ? "block" : "none" }} role="alert" aria-live="assertive">
              {error}
            </p>

            <button className="lp-signin-btn" type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </button>

            <p className="lp-create-row">Don't have an account? <a href="signup.html">Create an account</a></p>

            <div className="lp-footer-links">
              <a href="privacy.html">Privacy Policy</a>
              <a href="terms.html">Terms of Service</a>
              <a href="help.html">Help Center</a>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
