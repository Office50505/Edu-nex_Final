import { useEffect, useMemo, useState } from "react";
import { page as profilePage } from "../generated-pages/profile.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";
import { useEduNexRuntimeReady } from "../hooks/useEduNexRuntimeReady.js";
import { useViewportLock } from "../hooks/useViewportLock.js";
import { route } from "../lib/routes.js";
import "./ProfilePage.css";

const FALLBACK_AVATAR = "data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%27160%27%20height=%27160%27%20viewBox=%270%200%20160%20160%27%3E%3Crect%20width=%27160%27%20height=%27160%27%20rx=%2780%27%20fill=%27%230d0d0d%27/%3E%3Crect%20x=%272%27%20y=%272%27%20width=%27156%27%20height=%27156%27%20rx=%2778%27%20fill=%27%23111318%27%20stroke=%27%23C58B2A%27%20stroke-width=%274%27%20stroke-opacity=%27.45%27/%3E%3Ctext%20x=%2780%27%20y=%2796%27%20text-anchor=%27middle%27%20fill=%27%23C58B2A%27%20font-family=%27Arial%27%20font-size=%2762%27%20font-weight=%27800%27%3EE%3C/text%3E%3C/svg%3E";

function currentTheme() {
  return localStorage.getItem("enx-theme") === "light" ? "light" : "noir";
}

function profileSubscriptionLabel(value) {
  const normalized = String(value || "none").toLowerCase();
  if (["1rs trial", "trial", "trial_active"].includes(normalized)) return "Trial active";
  if (["active", "subscribed", "paid_active"].includes(normalized)) return "Active subscription";
  if (normalized === "cancelled") return "Subscription cancelled";
  if (normalized === "expired") return "Subscription expired";
  return "No active subscription";
}

function profileContactLabel(user) {
  if (!user?.mobileNumber) return "Mobile not added";
  if (user.isMobileVerified || user.mobileVerificationStatus === "Verified") return "Mobile verified";
  return "Mobile not verified";
}

function isAuthProfileError(error) {
  return /401|invalid token|expired|log in|authorization/i.test(error?.message || "");
}

function storedAccessToken() {
  return localStorage.getItem("edunexAccessToken") || sessionStorage.getItem("edunexAccessToken") || "";
}

function readStoredProfileUser() {
  for (const storage of [localStorage, sessionStorage]) {
    try {
      const raw = storage.getItem("edunexUser");
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const user = parsed?.user || parsed;
      if (user && typeof user === "object") return user;
    } catch (_) {}
  }
  return null;
}

function setStoredUser(user) {
  const target = localStorage.getItem("edunexAccessToken") ? localStorage : sessionStorage;
  target.setItem("edunexUser", JSON.stringify(user));
  if (target === localStorage) sessionStorage.removeItem("edunexUser");
  if (target === sessionStorage) localStorage.removeItem("edunexUser");
  window.EduNex?.renderUserAvatar?.();
  window.dispatchEvent(new Event("edunex:auth-changed"));
}

function formatProfileDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function historyRows(data) {
  const history = Array.isArray(data?.history) ? data.history : (Array.isArray(data?.subscriptions) ? data.subscriptions : []);
  return history;
}

const listButtonStyle = {
  width: "100%",
  borderTop: 0,
  borderLeft: 0,
  borderRight: 0,
  background: "transparent",
  color: "inherit",
  font: "inherit",
  textAlign: "left",
};

const profileLegalLinks = [
  [route("privacy.html"), "fa-lock", "Privacy Policy"],
  [route("terms.html"), "fa-file-contract", "Terms & Conditions"],
  [route("refund-policy.html"), "fa-undo-alt", "Refund & Cancellation"],
  [route("subscription-policy.html"), "fa-credit-card", "Subscription & Billing"],
  [route("shipping-policy.html"), "fa-truck", "Digital Delivery & Shipping"],
  [route("cookie-policy.html"), "fa-cookie-bite", "Cookie Policy"],
];

export function ProfilePage() {
  const [user, setUser] = useState(readStoredProfileUser);
  const [status, setStatus] = useState(() => ({
    message: storedAccessToken() && !readStoredProfileUser() ? "Loading your profile..." : "",
    error: false,
    retry: false,
  }));
  const [theme, setTheme] = useState(currentTheme);
  const [modalOpen, setModalOpen] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelMessage, setCancelMessage] = useState("");
  const [subscription, setSubscription] = useState({ loading: false, data: null, error: false });
  const runtimeReady = useEduNexRuntimeReady();
  useViewportLock(modalOpen);

  usePageStyle("react-page-style-profile", profilePage.styles);

  const sharedRuntimePage = useMemo(() => ({
    ...profilePage,
    scripts: profilePage.scripts.filter((script) => script.src),
  }), []);

  useEffect(() => {
    document.title = profilePage.title;
    document.documentElement.lang = profilePage.lang || "en";
    const cleanup = runLegacyPage(sharedRuntimePage);
    return () => cleanup?.();
  }, [sharedRuntimePage]);

  useEffect(() => {
    localStorage.setItem("enx-theme", theme);
    window.EduNex?.applyTheme?.(theme);
  }, [theme]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === "enx-theme") setTheme(event.newValue === "light" ? "light" : "noir");
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const hydrateProfile = async ({ signal } = {}) => {
    if (!window.EduNex?.getAccessToken?.() && !storedAccessToken()) {
      window.location.href = `login.html?next=${encodeURIComponent("profile.html")}`;
      return;
    }
    const cached = window.EduNex?.getUser?.() || readStoredProfileUser();
    if (cached) {
      setUser(cached);
    } else {
      setStatus({ message: "Loading your profile...", error: false, retry: false });
    }
    try {
      const data = await window.EduNex.authRequest("/api/auth/me");
      if (signal?.aborted) return;
      if (data?.user) {
        setStoredUser(data.user);
        setUser(data.user);
        setStatus({ message: "", error: false, retry: false });
      }
    } catch (error) {
      if (signal?.aborted) return;
      if (isAuthProfileError(error)) {
        window.EduNex?.clearAuth?.();
        window.location.href = `login.html?next=${encodeURIComponent("profile.html")}`;
        return;
      }
      setStatus({ message: "We couldn't load your profile right now. Please try again in a moment.", error: true, retry: true });
    }
  };

  useEffect(() => {
    if (!runtimeReady) return undefined;
    const controller = new AbortController();
    hydrateProfile({ signal: controller.signal });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimeReady]);

  const selectTheme = (name) => {
    localStorage.setItem("enx-theme", name);
    setTheme(name);
    window.EduNex?.applyTheme?.(name);
    window.dispatchEvent(new CustomEvent("edunex:theme-changed", { detail: { theme: name } }));
  };

  const openSubscriptionHistory = async () => {
    setModalOpen(true);
    setCancelConfirm(false); setCancelMessage("");
    setSubscription({ loading: true, data: null, error: false });
    try {
      const data = await window.EduNex.authRequest("/api/payment/subscription-status");
      setSubscription({ loading: false, data: data || {}, error: false });
    } catch (_) {
      setSubscription({ loading: false, data: null, error: true });
    }
  };

  const cancelRenewal = async () => {
    if (cancelBusy) return;
    setCancelBusy(true); setCancelMessage("");
    try {
      const result = await window.EduNex.authRequest("/api/payment/cancel-subscription", { method: "POST" });
      setCancelConfirm(false);
      setSubscription(prev => ({ ...prev, data: { ...prev.data, canCancel: false, mandateStatus: "cancelled" } }));
      setCancelMessage(result.message || "Auto-renewal cancelled. Paid access remains until its expiry.");
    } catch (error) { setCancelMessage(error.message || "Cancellation could not be confirmed. Please retry."); }
    finally { setCancelBusy(false); }
  };

  const logoutProfile = () => {
    window.EduNex?.authRequest?.("/api/auth/logout", { method: "POST" }).catch(() => {}).finally(() => {
      window.EduNex?.clearAuth?.();
      window.dispatchEvent(new Event("edunex:auth-changed"));
      window.location.href = "login.html";
    });
  };

  const fallbackAvatar = window.EduNex?.avatarFallback?.(user) || FALLBACK_AVATAR;
  const avatar = user?.avatar || fallbackAvatar;
  const displayName = user?.fullName || user?.mobileNumber || "Learner";
  const email = user?.email || user?.mobileNumber || "No email saved";
  const subscriptionLabel = user?.subscriptionLabel || profileSubscriptionLabel(user?.subscriptionStatus);
  const modalStatus = subscription.data?.subscriptionDocStatus || subscription.data?.status || subscription.data?.subscriptionStatus || "none";
  const periodEnd = ["trial", "1rs trial"].includes(modalStatus)
    ? subscription.data?.trialExpiresAt : subscription.data?.currentPeriodEnd || subscription.data?.expiresAt;
  const handleProfileAvatarError = (event) => {
    if (event.currentTarget.src !== fallbackAvatar) {
      event.currentTarget.src = fallbackAvatar;
    }
  };

  if (!user) {
    return (
      <div className="react-page-root" data-page="profile.html">
        <div className="pf-page">
          <div className="pf-breadcrumb">
            <a href="index.html">Home</a>
            <span className="sep"><i className="fas fa-chevron-right" aria-hidden="true"></i></span>
            <span className="current">Account</span>
          </div>
          <h1 className="pf-page-title">Profile Settings</h1>
          <section className="pf-card pf-profile-card pf-profile-loading" aria-live="polite" aria-busy={!status.error}>
            <div className="enx-page-loading-mark" aria-hidden="true"><i className="fas fa-user"></i></div>
            <div>
              <div className="pf-profile-name">{status.error ? "Profile unavailable" : "Loading your profile"}</div>
              <div className="pf-profile-email">{status.message || "Checking your saved account details..."}</div>
            </div>
            {status.retry ? <button className="pf-secondary-btn" type="button" onClick={() => hydrateProfile()}>Retry</button> : null}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="react-page-root" data-page="profile.html">
      <div className="pf-page">
        <div className="pf-breadcrumb">
          <a href="index.html">Home</a>
          <span className="sep"><i className="fas fa-chevron-right" aria-hidden="true"></i></span>
          <span className="current">Account</span>
        </div>

        <h1 className="pf-page-title">Profile Settings</h1>
        <div className={`pf-status${status.message ? " show" : ""}${status.error ? " error" : ""}`} id="profileStatus" role="status" aria-live="polite">
          {status.message}
          {status.retry ? <button type="button" id="profileRetryBtn" onClick={hydrateProfile}>Retry</button> : null}
        </div>

        <div className="pf-card pf-profile-card" style={{ marginBottom: 20 }}>
          <div className="pf-avatar-wrap">
            <img className="pf-avatar" src={avatar} alt="Profile avatar" onError={handleProfileAvatarError} />
            <div className="pf-avatar-online"></div>
          </div>
          <div className="pf-profile-info">
            <div className="pf-profile-name">{displayName}</div>
            <div className="pf-profile-email">{email}</div>
            <div className="pf-badges">
              <span className="pf-badge pf-badge-teal">{subscriptionLabel}</span>
              <span className="pf-badge pf-badge-gray">{profileContactLabel(user)}</span>
            </div>
          </div>
          <div className="pf-profile-actions">
            <button className="pf-edit-btn" type="button" onClick={() => { window.location.href = "edit-profile.html"; }}>
              <i className="fas fa-pencil-alt" aria-hidden="true"></i> Edit Profile
            </button>
            <button className="pf-secondary-btn" type="button" onClick={openSubscriptionHistory}>
              <i className="fas fa-receipt" aria-hidden="true"></i> Subscription History
            </button>
          </div>
        </div>

        <div className="pf-row-2">
          <div className="pf-card">
            <h2 className="pf-card-heading"><i className="fas fa-palette" aria-hidden="true"></i> Interface Theme</h2>
            <div className="pf-theme-grid" role="group" aria-label="Interface theme">
              {["light", "noir"].map((name) => (
                <button
                  className={`pf-theme-opt${theme === name ? " selected" : ""}`}
                  data-theme={name}
                  type="button"
                  key={name}
                  aria-pressed={theme === name}
                  onClick={() => selectTheme(name)}
                >
                  <div className="pf-theme-preview">
                    <div className="pf-theme-bar"></div>
                    <div className="pf-theme-bar" style={{ width: "60%" }}></div>
                  </div>
                  <div className="pf-theme-label">{name === "noir" ? "Dark" : name.charAt(0).toUpperCase() + name.slice(1)}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="pf-card">
            <h2 className="pf-card-heading"><i className="fas fa-table-cells" aria-hidden="true"></i> Learning &amp; Activity</h2>
            <div>
              {[
                ["certificates.html", "fa-desktop", "My Certificates"],
                ["wishlist.html", "fa-heart", "My Wishlist"],
                ["help.html", "fa-question-circle", "Help & Support"],
              ].map(([href, icon, label]) => (
                <button className="pf-list-item" type="button" key={href} style={listButtonStyle} onClick={() => { window.location.href = href; }}>
                  <div className="pf-list-icon"><i className={`fas ${icon}`} aria-hidden="true"></i></div>
                  <span className="pf-list-label">{label}</span>
                  <i className="fas fa-chevron-right pf-list-chevron" aria-hidden="true"></i>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="pf-card pf-prefs-card">
          <h2 className="pf-card-heading"><i className="fas fa-shield-halved" aria-hidden="true"></i> Preferences &amp; Legal</h2>
          <div className="pf-prefs-inner">
            <div className="pf-prefs-list">
              {profileLegalLinks.map(([href, icon, label]) => (
                <a className="pf-list-item" href={href} key={href} style={listButtonStyle}>
                  <div className="pf-list-icon"><i className={`fas ${icon}`} aria-hidden="true"></i></div>
                  <span className="pf-list-label">{label}</span>
                  <i className="fas fa-chevron-right pf-list-chevron" aria-hidden="true"></i>
                </a>
              ))}
            </div>
            <div className="pf-prefs-right">
              <button className="pf-logout-btn" type="button" onClick={logoutProfile}>
                <i className="fas fa-arrow-right-from-bracket" aria-hidden="true"></i>
                Logout from Skillomate
              </button>
              <p className="pf-version-text">Version 4.2.1-stable • Skillomate <span>Cloud Sync Active</span></p>
            </div>
          </div>
        </div>
      </div>

      <div className="pf-watermark">
        <div className="pf-watermark-main">SKILLOMATE</div>
        <div className="pf-watermark-sub">T E C H N I C A L &nbsp; E L E G A N C E</div>
      </div>

      <div className="pf-modal" id="subscriptionModal" hidden={!modalOpen} onClick={(event) => {
        if (event.target === event.currentTarget) setModalOpen(false);
      }}>
        <div className="pf-modal-card" role="dialog" aria-modal="true" aria-labelledby="subscriptionModalTitle">
          <div className="pf-modal-head">
            <h2 id="subscriptionModalTitle">Subscription History</h2>
            <button className="pf-modal-close" type="button" onClick={() => setModalOpen(false)} aria-label="Close">
              <i className="fas fa-times" aria-hidden="true"></i>
            </button>
          </div>
          <div className="pf-modal-body" id="subscriptionModalBody">
            {subscription.loading ? (
              <div className="sub-current-card"><strong>Loading subscription...</strong><span>Please wait.</span></div>
            ) : null}
            {subscription.error ? (
              <div className="sub-history-row"><strong>Could not load subscription</strong><span>Please try again in a moment.</span></div>
            ) : null}
            {!subscription.loading && !subscription.error && subscription.data ? (
              <>
                <div className="sub-current-card">
                  <strong>Current plan: {profileSubscriptionLabel(modalStatus)}</strong>
                  <span>Valid until: {formatProfileDate(periodEnd)}</span>
                  <span>Payment reference: {subscription.data.orderId || subscription.data.subscriptionId || subscription.data.paymentId || "Not available"}</span>
                </div>
                {subscription.data.canCancel ? (
                  <div style={{ margin: "16px 0" }}>
                    <p>{cancelConfirm ? "Stop future renewals? Your paid access continues until its expiry." : "Manage automatic renewal or cancel an unfinished checkout."}</p>
                    <button type="button" className="pay-btn-secondary" disabled={cancelBusy} style={{ minHeight: 44, width: "100%", marginTop: 8 }} onClick={cancelConfirm ? cancelRenewal : () => setCancelConfirm(true)}>
                      {cancelBusy ? "Cancelling…" : cancelConfirm ? "Confirm cancellation" : "Cancel auto-renewal"}
                    </button>
                    {cancelConfirm ? <button type="button" disabled={cancelBusy} style={{ minHeight: 44 }} onClick={() => setCancelConfirm(false)}>Keep subscription</button> : null}
                  </div>
                ) : null}
                {cancelMessage ? <p role="status">{cancelMessage}</p> : null}
                <div className="sub-history-list">
                  {historyRows(subscription.data).length ? historyRows(subscription.data).map((item, index) => (
                    <div className="sub-history-row" key={`${item.orderId || item.paymentId || item.subscriptionId || index}`}>
                      <strong>{item.status || item.plan || "Subscription"}</strong>
                      <span>{formatProfileDate(item.createdAt || item.startedAt)} - {formatProfileDate(item.currentPeriodEnd || item.endedAt || item.expiresAt)}</span>
                      <span>{item.orderId || item.paymentId || item.subscriptionId || ""}</span>
                    </div>
                  )) : (
                    <div className="sub-history-row"><strong>No past subscription entries</strong><span>Your current subscription data is shown above. Previous plans and orders will appear here when available.</span></div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
