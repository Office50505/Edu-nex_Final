import { useEffect, useState } from "react";
import { adminRoutes, api, errorMessage, getToken, saveSession } from "./adminApi.js";

export function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Admin Login | Skillomate";
    if (!getToken()) return;
    const params = new URLSearchParams(window.location.search);
    window.location.href = params.get("next") || adminRoutes.dashboard;
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!password) {
      setMessageType("error");
      setMessage("Enter the admin password.");
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    try {
      const response = await fetch(api("/api/admin/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorMessage(data, "Admin login failed."));

      saveSession(data, remember);
      setMessageType("success");
      setMessage("Signed in. Opening admin dashboard...");
      const params = new URLSearchParams(window.location.search);
      window.location.href = params.get("next") || adminRoutes.dashboard;
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Cannot connect to server. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="admin-auth-page">
      <section className="admin-auth-card">
        <div className="admin-auth-brand">
          <span className="admin-auth-logo" aria-hidden="true">
            <img className="admin-theme-icon admin-icon-dark" src="/assets/brand/skillomate-admin-icon-dark.png" alt="" />
            <img className="admin-theme-icon admin-icon-light" src="/assets/brand/skillomate-admin-icon-light.png" alt="" />
          </span>
          <div className="admin-auth-copy">
            <span className="admin-brand-name admin-auth-brand-name" aria-label="Skillomate">
              <span className="admin-brand-text">Skill</span>
              <span className="admin-brand-o" aria-hidden="true">
                <img className="admin-brand-o-image admin-icon-dark" src="/assets/brand/skillomate-wordmark-symbol-dark.png" alt="" />
                <img className="admin-brand-o-image admin-icon-light" src="/assets/brand/skillomate-wordmark-symbol-light.png" alt="" />
              </span>
              <span className="admin-brand-mate">mate</span>
            </span>
            <small>Admin Workspace</small>
          </div>
        </div>
        <span className="admin-auth-kicker">Secure workspace</span>
        <h1>Admin Login</h1>
        <p>Use your configured admin password to manage analytics, users, content, payments, and platform settings.</p>

        <form className="admin-auth-form" onSubmit={handleSubmit}>
          <div className="admin-auth-label-row">
            <label htmlFor="adminPassword">Password</label>
            <span>Configured in backend .env</span>
          </div>
          <div className="admin-auth-password-field">
            <input
              id="adminPassword"
              autoComplete="current-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)}>
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <label className="admin-auth-check">
            <input checked={remember} type="checkbox" onChange={(event) => setRemember(event.target.checked)} />
            Keep me signed in
          </label>

          <button className="submit-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Log in"}
          </button>
          <div className={`message${message ? ` ${messageType}` : ""}`} role="status">
            {message}
          </div>
        </form>
      </section>
    </main>
  );
}
