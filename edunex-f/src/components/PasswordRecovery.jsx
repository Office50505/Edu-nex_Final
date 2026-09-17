import { useEffect, useState } from "react";

async function requestReset(action, body) {
  const path = `/api/auth/password-reset/${action}`;
  const options = { method: "POST", body: JSON.stringify(body) };
  if (window.EduNex?.request) return window.EduNex.request(path, options);
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Password recovery is unavailable. Please try again.");
  return data;
}

export function PasswordRecovery({ initialPhone, onBack, onComplete }) {
  const [phone, setPhone] = useState(() => String(initialPhone || "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, ""));
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function sendCode() {
    if (busy) return;
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await requestReset("request", { mobileNumber: `91${phone}` });
      setSent(true);
      setOtp("");
      setCooldown(60);
      setNotice(data.developmentAutofill && data.devOtp
        ? `Development code: ${data.devOtp}`
        : "If this number is registered, a code has been sent. It expires in 5 minutes.");
    } catch (failure) {
      setError(failure.message || "Could not send a code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (!sent) return sendCode();
    if (!/^\d{6}$/.test(otp)) return setError("Enter the 6-digit code from your SMS.");
    if (password.length < 8 || password !== password.trim()) return setError("Use at least 8 characters, without spaces at the start or end.");
    if (password !== confirmation) return setError("Passwords do not match.");
    setBusy(true);
    setError("");
    try {
      await requestReset("confirm", { mobileNumber: `91${phone}`, otp, newPassword: password });
      onComplete(phone);
    } catch (failure) {
      setError(failure.message || "Could not reset your password. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="lp-form-box" onSubmit={submit}>
      <h1 className="lp-login-title">Reset password</h1>
      <p className="lp-subtitle">{sent ? "Enter your SMS code and choose a new password." : "We’ll send a verification code to your registered mobile number."}</p>
      <div className="lp-form-group">
        <label htmlFor="reset-phone">Mobile Number</label>
        <div className="lp-input-wrap">
          <span className="lp-prefix">+91</span>
          <input id="reset-phone" type="tel" autoComplete="tel-national" inputMode="numeric" maxLength={10} placeholder="Enter your mobile number" value={phone} disabled={sent || busy} onChange={event => setPhone(event.target.value.replace(/\D/g, ""))} />
        </div>
      </div>
      {sent && <>
        <div className="lp-form-group">
          <label htmlFor="reset-code">SMS code</label>
          <div className="lp-input-wrap"><input id="reset-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code" value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, ""))} /></div>
        </div>
        <div className="lp-form-group">
          <label htmlFor="reset-password">New password</label>
          <div className="lp-input-wrap"><input id="reset-password" type="password" autoComplete="new-password" placeholder="At least 8 characters" value={password} onChange={event => setPassword(event.target.value)} /></div>
        </div>
        <div className="lp-form-group">
          <label htmlFor="reset-confirmation">Confirm new password</label>
          <div className="lp-input-wrap"><input id="reset-confirmation" type="password" autoComplete="new-password" placeholder="Repeat your new password" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></div>
        </div>
      </>}
      {notice && <p role="status" style={{ color: "var(--gray)", fontSize: ".85rem", marginBottom: 16 }}>{notice}</p>}
      {error && <p className="lp-err" role="alert">{error}</p>}
      <button className="lp-signin-btn" type="submit" disabled={busy}>{busy ? "Please wait..." : sent ? "Reset password" : "Send reset code"}</button>
      {sent && <p className="lp-create-row"><button className="lp-forgot" type="button" disabled={busy || cooldown > 0} onClick={sendCode}>{cooldown ? `Resend code in ${cooldown}s` : "Resend code"}</button>{" · "}<button className="lp-forgot" type="button" disabled={busy} onClick={() => { setSent(false); setOtp(""); setPassword(""); setConfirmation(""); setNotice(""); setError(""); }}>Change number</button></p>}
      <p className="lp-create-row"><button className="lp-forgot" type="button" disabled={busy} onClick={onBack}>Back to sign in</button></p>
    </form>
  );
}
