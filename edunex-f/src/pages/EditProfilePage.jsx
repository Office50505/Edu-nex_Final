import { useEffect, useMemo, useRef, useState } from "react";
import { page as editProfilePage } from "../generated-pages/edit-profile.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";
import { useEduNexRuntimeReady } from "../hooks/useEduNexRuntimeReady.js";
import { route } from "../lib/routes.js";

const ALLOWED_AVATARS = [
  "assets/male1.jpeg",
  "assets/male2.jpeg",
  "assets/male3.jpeg",
  "assets/male4.jpeg",
  "assets/male5.jpeg",
  "assets/male6.jpeg",
  "assets/female1.jpeg",
  "assets/female2.jpeg",
  "assets/female3.jpeg",
  "assets/female4.jpeg",
  "assets/female5.jpeg",
  "assets/female6.jpeg",
];

function storedUserTarget() {
  return localStorage.getItem("edunexAccessToken") ? localStorage : sessionStorage;
}

function updateStoredUser(user) {
  const target = storedUserTarget();
  target.setItem("edunexUser", JSON.stringify(user));
  localStorage.setItem("edunexSignupProfile", JSON.stringify(user));
  if (target === localStorage) sessionStorage.removeItem("edunexUser");
  if (target === sessionStorage) localStorage.removeItem("edunexUser");
  window.EduNex?.renderUserAvatar?.();
  window.dispatchEvent(new Event("edunex:auth-changed"));
}

function isAuthProfileError(error) {
  return /401|invalid token|expired|log in|authorization/i.test(error?.message || "");
}

function userSafeProfileError(error, fallback) {
  const message = error?.message || "";
  if (!message || /request failed|failed to fetch|network|500|503/i.test(message)) return fallback;
  return message;
}

function splitName(fullName = "") {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  return {
    first: parts.shift() || "",
    last: parts.join(" "),
  };
}

function normalizedAvatarPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
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

function readStoredProfileUser() {
  const keys = ["edunexUser", "edunexSignupProfile", "user", "currentUser", "authUser"];
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of keys) {
      try {
        const raw = storage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const user = parsed?.user || parsed;
        if (user && (user.fullName || user.email || user.mobileNumber || user.avatar)) return user;
      } catch (_) {}
    }
  }
  return null;
}

function profileFromUser(user) {
  const name = splitName(user?.fullName);
  return {
    firstName: name.first,
    lastName: name.last,
    email: user?.email || "",
    mobile: user?.mobileNumber || "",
    age: user?.age || "",
    gender: user?.gender || "other",
    avatar: ALLOWED_AVATARS.includes(normalizedAvatarPath(user?.avatar || user?.avatarUrl || user?.photoUrl || user?.photoURL))
      ? normalizedAvatarPath(user?.avatar || user?.avatarUrl || user?.photoUrl || user?.photoURL)
      : ALLOWED_AVATARS[0],
    fullName: user?.fullName || "Skillomate Learner",
  };
}

export function EditProfilePage() {
  const [form, setForm] = useState(() => profileFromUser(null));
  const [status, setStatus] = useState({ message: "Loading your signup profile...", error: false, retry: false });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ message: "Profile updated successfully!", ok: true, show: false });
  const avatarCardRef = useRef(null);
  const runtimeReady = useEduNexRuntimeReady();

  usePageStyle("react-page-style-edit-profile", editProfilePage.styles);

  const sharedRuntimePage = useMemo(() => ({
    ...editProfilePage,
    scripts: editProfilePage.scripts.filter((script) => script.src),
  }), []);

  useEffect(() => {
    document.title = editProfilePage.title;
    document.documentElement.lang = editProfilePage.lang || "en";
    const cleanup = runLegacyPage(sharedRuntimePage);
    return () => cleanup?.();
  }, [sharedRuntimePage]);

  const showProfileToast = (message, ok = true) => {
    setToast({ message, ok, show: true });
    window.setTimeout(() => setToast((current) => ({ ...current, show: false })), 2800);
  };

  const applyProfileUser = (user) => {
    if (!user) {
      window.location.href = `login.html?next=${encodeURIComponent("edit-profile.html")}`;
      return;
    }
    setForm(profileFromUser(user));
  };

  const loadProfileForm = async () => {
    if (!window.EduNex?.getAccessToken?.()) {
      window.location.href = `login.html?next=${encodeURIComponent("edit-profile.html")}`;
      return;
    }

    const cachedUser = window.EduNex?.getUser?.() || readStoredProfileUser();
    if (cachedUser) {
      applyProfileUser(cachedUser);
      setStatus({ message: "Refreshing your latest profile details...", error: false, retry: false });
    }

    try {
      const data = await window.EduNex.authRequest("/api/auth/me");
      updateStoredUser(data.user);
      applyProfileUser(data.user);
      setStatus({ message: "", error: false, retry: false });
    } catch (error) {
      if (isAuthProfileError(error)) {
        window.EduNex?.clearAuth?.();
        window.location.href = `login.html?next=${encodeURIComponent("edit-profile.html")}`;
        return;
      }
      const message = "We couldn't load your profile right now. Please try again in a moment.";
      setStatus({ message, error: true, retry: true });
      showProfileToast(message, false);
    }
  };

  useEffect(() => {
    if (runtimeReady) loadProfileForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimeReady]);

  const setField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const fullName = [form.firstName, form.lastName].map((value) => value.trim()).filter(Boolean).join(" ");

  const saveProfile = async () => {
    if (saving) return;
    if (!fullName) {
      showProfileToast("Full name is required", false);
      return;
    }
    if (fullName.length > 80) {
      showProfileToast("Full name must be 80 characters or less", false);
      return;
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      showProfileToast("Please enter a valid email address", false);
      return;
    }
    if (form.age && (Number(form.age) < 5 || Number(form.age) > 80)) {
      showProfileToast("Please select a valid age", false);
      return;
    }
    if (!ALLOWED_AVATARS.includes(form.avatar)) {
      showProfileToast("Please choose one of the Skillomate avatars", false);
      return;
    }

    setSaving(true);
    try {
      const data = await window.EduNex.authRequest("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({
          fullName,
          email: form.email.trim(),
          avatar: form.avatar,
          gender: form.gender,
          age: form.age,
        }),
      });
      updateStoredUser(data.user);
      setForm((current) => ({ ...current, fullName: data.user.fullName || "Skillomate Learner" }));
      showProfileToast("Profile updated successfully!");
      window.location.assign(route("profile.html"));
    } catch (error) {
      showProfileToast(userSafeProfileError(error, "We couldn't save your changes. Please try again."), false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="react-page-root" data-page="edit-profile.html">
      <div className="page">
        <div className="back-row">
          <button className="back-btn" type="button" onClick={() => history.back()} aria-label="Go back">
            <i className="fas fa-arrow-left" aria-hidden="true"></i>
          </button>
          <h1 className="back-title">Edit Profile</h1>
        </div>
        <div className={`ep-status${status.message ? " show" : ""}${status.error ? " error" : ""}`} id="profileStatus">
          {status.message}
          {status.retry ? <button type="button" id="editProfileRetryBtn" onClick={loadProfileForm}>Retry</button> : null}
        </div>

        <div className="ava-edit-wrap">
          <div className="ava-edit-circle">
            <img id="avaImg" src={form.avatar} alt="Avatar" data-avatar={form.avatar} />
            <div className="ava-edit-overlay"><i className="fas fa-user-check" aria-hidden="true"></i></div>
          </div>
          <div className="ava-edit-name">{form.fullName || fullName || "Skillomate Learner"}</div>
          <div className="ava-edit-sub">This is the avatar saved from signup</div>
          <button className="ava-change-btn" type="button" onClick={() => avatarCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            <i className="fas fa-user-pen" aria-hidden="true"></i> Change avatar
          </button>
        </div>

        <div className="ep-card" id="avatarSelectionCard" ref={avatarCardRef}>
          <h2 className="ep-card-title"><i className="fas fa-user-circle" aria-hidden="true"></i> Avatar Selection</h2>
          <p className="ava-picker-note">Your signup avatar is preselected. Pick another avatar here, then save your profile.</p>
          <div className="ava-picker" id="avatarPicker">
            {ALLOWED_AVATARS.map((path) => (
              <button className={`ava-choice${path === form.avatar ? " selected" : ""}`} type="button" data-avatar={path} aria-label="Select avatar" key={path} onClick={() => setField("avatar", path)}>
                <img src={path} alt="" />
              </button>
            ))}
          </div>
        </div>

        <div className="ep-card">
          <h2 className="ep-card-title"><i className="fas fa-user" aria-hidden="true"></i> Personal Information</h2>
          <div className="ep-row-2">
            <div>
              <label className="ep-label" htmlFor="firstNameInput">First Name</label>
              <input className="ep-input" id="firstNameInput" type="text" placeholder="First name" value={form.firstName} onChange={(event) => setField("firstName", event.target.value)} />
            </div>
            <div>
              <label className="ep-label" htmlFor="lastNameInput">Last Name</label>
              <input className="ep-input" id="lastNameInput" type="text" placeholder="Last name" value={form.lastName} onChange={(event) => setField("lastName", event.target.value)} />
            </div>
          </div>
        </div>

        <div className="ep-card">
          <h2 className="ep-card-title"><i className="fas fa-address-card" aria-hidden="true"></i> Contact Information</h2>
          <div className="ep-field">
            <label className="ep-label" htmlFor="emailInput">Email Address</label>
            <div className="ep-input-wrap">
              <i className="fas fa-envelope" aria-hidden="true"></i>
              <input className="ep-input" id="emailInput" type="email" placeholder="Email" value={form.email} onChange={(event) => setField("email", event.target.value)} />
            </div>
          </div>
          <div className="ep-field">
            <label className="ep-label" htmlFor="mobileInput">Mobile Number</label>
            <div className="ep-phone-wrap">
              <span className="ep-country-code">+91</span>
              <input className="ep-input" id="mobileInput" type="tel" placeholder="Mobile number" style={{ flex: 1 }} disabled value={form.mobile} readOnly />
            </div>
          </div>
        </div>

        <div className="ep-card">
          <h2 className="ep-card-title"><i className="fas fa-id-badge" aria-hidden="true"></i> Identity</h2>
          <div className="ep-field">
            <label className="ep-label" htmlFor="ageInput">Age</label>
            <input className="ep-input" id="ageInput" type="number" min="5" max="80" style={{ color: "var(--cyan)", fontWeight: 800 }} value={form.age} onChange={(event) => setField("age", event.target.value)} />
          </div>
          <div className="ep-field" style={{ marginBottom: 0 }}>
            <label className="ep-label">Gender</label>
            <div className="ep-gender-slider" id="epGenderSlider">
              <div className="ep-gender-thumb" id="epGenderThumb" style={{ left: `${5 + ["male", "female", "other"].indexOf(form.gender) * 33.333}%`, width: "31%" }}></div>
              {[
                ["male", "fa-mars", "Male"],
                ["female", "fa-venus", "Female"],
                ["other", "fa-star", "Other"],
              ].map(([value, icon, label]) => (
                <button className={`ep-gender-btn${form.gender === value ? " selected" : ""}`} data-g={value} type="button" key={value} onClick={() => setField("gender", value)}>
                  <i className={`fas ${icon}`} aria-hidden="true"></i> {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button className="ep-save-btn" id="saveProfileBtn" type="button" onClick={saveProfile} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <div className={`ep-toast${toast.show ? " show" : ""}`} id="epToast" style={{ color: toast.ok ? "var(--cyan)" : "#f87171" }}>
        <i className={`fas ${toast.ok ? "fa-check-circle" : "fa-circle-exclamation"}`} style={{ marginRight: 7 }} aria-hidden="true"></i>{toast.message}
      </div>
    </div>
  );
}
