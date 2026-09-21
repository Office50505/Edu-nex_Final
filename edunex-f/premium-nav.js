(function () {
  const nav = document.querySelector("[data-premium-nav]");
  if (!nav) return;

  const links = nav.querySelector(".premium-nav-links");
  const toggle = nav.querySelector(".premium-menu-toggle");
  const avatar = nav.querySelector(".premium-avatar");
  const joinButton = nav.querySelector(".premium-join-btn");
  const loginButton = nav.querySelector(".premium-nav-login-btn");
  const actions = nav.querySelector(".premium-nav-actions");
  const currentPath = window.location.pathname === "/" ? "/index.html" : window.location.pathname;
  const token = localStorage.getItem("edunexAccessToken") || sessionStorage.getItem("edunexAccessToken");
  const tokenStore = localStorage.getItem("edunexAccessToken") ? localStorage : sessionStorage;
  function apiUrl(path) {
    return window.EduNex?.apiUrl?.(path) || path;
  }

  function hideJoinButton() {
    if (!joinButton) return;
    joinButton.classList.add("is-hidden");
    joinButton.hidden = true;
    joinButton.setAttribute("aria-hidden", "true");
  }

  function showJoinButton() {
    if (!joinButton) return;
    joinButton.classList.remove("is-hidden");
    joinButton.hidden = false;
    joinButton.removeAttribute("aria-hidden");
  }

  function hideLoginButton() {
    if (!loginButton) return;
    loginButton.classList.add("is-hidden");
    loginButton.hidden = true;
    loginButton.setAttribute("aria-hidden", "true");
  }

  function showLoginButton() {
    if (!loginButton) return;
    loginButton.classList.remove("is-hidden");
    loginButton.hidden = false;
    loginButton.removeAttribute("aria-hidden");
  }

  function readStoredUser() {
    try {
      const rawUser = localStorage.getItem("edunexUser") || sessionStorage.getItem("edunexUser");
      return rawUser ? JSON.parse(rawUser) : null;
    } catch (_) {
      return null;
    }
  }

  function normalizeSubscriptionStatus(status) {
    return String(status || "none").trim().toLowerCase();
  }

  function shouldShowJoinButton(status) {
    return normalizeSubscriptionStatus(status) === "none";
  }

  function shouldHideJoinButton(status) {
    return !shouldShowJoinButton(status);
  }

  function clearAuthStorage() {
    ["edunexAccessToken", "edunexRefreshToken", "edunexUser"].forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
    ["edunexWishlistLocal", "edunexHasCourseAccess", "edunexSignupProfile"].forEach((key) => localStorage.removeItem(key));
    const progressKeys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith("edunexCourseProgress:")) progressKeys.push(key);
    }
    progressKeys.forEach((key) => localStorage.removeItem(key));
    window.dispatchEvent(new Event("edunex:auth-changed"));
  }

  function userInitial(user) {
    const displayName = user?.fullName || user?.name || user?.email || user?.mobileNumber || "A";
    return String(displayName).trim().charAt(0).toUpperCase() || "A";
  }

  function renderAvatar(user) {
    if (!avatar) return;

    const avatarUrl = user?.avatar || user?.avatarUrl || user?.photoUrl || user?.photoURL || "";
    avatar.classList.remove("is-hidden");
    avatar.hidden = false;
    avatar.removeAttribute("aria-hidden");

    if (avatarUrl) {
      avatar.innerHTML = "";
      const image = document.createElement("img");
      image.src = avatarUrl;
      image.alt = "";
      image.addEventListener("error", () => {
        avatar.textContent = userInitial(user);
      }, { once: true });
      avatar.appendChild(image);
    } else {
      avatar.textContent = userInitial(user);
    }
  }

  function createSignOutButton() {
    if (!token || !actions || actions.querySelector(".premium-signout-btn")) return;

    const button = document.createElement("button");
    button.className = "premium-signout-btn";
    button.type = "button";
    button.textContent = "Sign out";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await fetch(apiUrl("/api/auth/logout"), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (_) {
        // Local logout should still happen if the network/session is already gone.
      }

      clearAuthStorage();
      window.location.href = "/login.html";
    });

    if (joinButton) {
      actions.insertBefore(button, joinButton.nextSibling);
    } else if (avatar) {
      actions.insertBefore(button, avatar);
    } else {
      actions.appendChild(button);
    }
  }

  async function refreshAccessToken() {
    const refreshToken = tokenStore.getItem("edunexRefreshToken");
    if (!refreshToken) return null;

    const response = await fetch(apiUrl("/api/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) return null;

    const data = await response.json();
    if (data.accessToken) {
      tokenStore.setItem("edunexAccessToken", data.accessToken);
    }
    if (data.user) {
      tokenStore.setItem("edunexUser", JSON.stringify(data.user));
    }

    return data.accessToken || null;
  }

  async function fetchSubscriptionStatus(accessToken) {
    const response = await fetch(apiUrl("/api/payment/subscription-status"), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 401) {
      const refreshedToken = await refreshAccessToken();
      if (!refreshedToken) return null;

      const retry = await fetch(apiUrl("/api/payment/subscription-status"), {
        headers: { Authorization: `Bearer ${refreshedToken}` },
      });
      return retry.ok ? retry.json() : null;
    }

    return response.ok ? response.json() : null;
  }

  function hasCourseAccess(subscriptionData) {
    const status = normalizeSubscriptionStatus(
      subscriptionData?.subscriptionDocStatus ||
      subscriptionData?.status ||
      subscriptionData?.subscriptionStatus
    );
    const now = Date.now();

    if (status === "trial" || status === "1rs trial") {
      return !subscriptionData?.trialExpiresAt || new Date(subscriptionData.trialExpiresAt).getTime() > now;
    }

    if (status === "active" || status === "subscribed") {
      return !subscriptionData?.currentPeriodEnd || new Date(subscriptionData.currentPeriodEnd).getTime() > now;
    }

    return false;
  }

  function paymentUrlForCourse(courseUrl) {
    const paymentUrl = new URL("/payment.html", window.location.origin);
    const courseId = courseUrl.searchParams.get("courseId");
    if (courseId) paymentUrl.searchParams.set("courseId", courseId);
    paymentUrl.searchParams.set("next", courseUrl.pathname + courseUrl.search);
    return paymentUrl.pathname + paymentUrl.search;
  }

  async function guardCourseAccess(event) {
    const link = event.target.closest?.('a[href*="/videos.html?courseId="]');
    if (!link) return;

    const courseUrl = new URL(link.getAttribute("href"), window.location.origin);
    if (courseUrl.pathname !== "/videos.html" || !courseUrl.searchParams.get("courseId")) return;

    const accessToken = localStorage.getItem("edunexAccessToken") || sessionStorage.getItem("edunexAccessToken");
    event.preventDefault();

    const nextUrl = courseUrl.pathname + courseUrl.search;
    if (!accessToken) {
      window.location.href = `/login.html?next=${encodeURIComponent(nextUrl)}`;
      return;
    }

    try {
      const data = await fetchSubscriptionStatus(accessToken);
      if (data && hasCourseAccess(data)) {
        window.location.href = nextUrl;
        return;
      }

      window.location.href = paymentUrlForCourse(courseUrl);
    } catch (_) {
      window.location.href = paymentUrlForCourse(courseUrl);
    }
  }

  nav.querySelectorAll("[data-nav-path]").forEach((link) => {
    const path = link.getAttribute("data-nav-path");
    if (path === currentPath) {
      link.classList.add("is-active");
      link.setAttribute("aria-current", "page");
    }

    link.addEventListener("click", () => {
      links.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });

  const storedUser = readStoredUser();

  if (!token) {
    showLoginButton();
    if (avatar) {
      avatar.classList.add("is-hidden");
      avatar.hidden = true;
      avatar.setAttribute("aria-hidden", "true");
    }
  }

  if (token) {
    hideLoginButton();
    hideJoinButton();
    renderAvatar(storedUser);
  }

  if (storedUser?.subscriptionStatus && shouldHideJoinButton(storedUser.subscriptionStatus)) {
    hideJoinButton();
  }

  createSignOutButton();

  if (token && joinButton) {
    fetchSubscriptionStatus(token)
      .then((data) => {
        const status = data?.subscriptionStatus || data?.status;
        if (status && shouldHideJoinButton(status)) {
          hideJoinButton();
        } else if (status && shouldShowJoinButton(status)) {
          showJoinButton();
        }
      })
      .catch(() => {});
  }

  if (toggle && links) {
    toggle.addEventListener("click", () => {
      const isOpen = links.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });
  }

  document.addEventListener("click", (event) => {
    if (!links || !toggle || !links.classList.contains("is-open")) return;
    if (nav.contains(event.target)) return;
    links.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  });

  document.addEventListener("click", guardCourseAccess);

  function logoutForInspectionAttempt() {
    clearAuthStorage();
    const destination = `/login.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    if (window.location.pathname !== "/login.html") {
      window.location.href = destination;
    }
  }

  const initialDevtoolsGap = {
    width: Math.max(0, window.outerWidth - window.innerWidth),
    height: Math.max(0, window.outerHeight - window.innerHeight),
  };

  function devtoolsSizeGapDetected() {
    if (window.innerWidth < 768) return false;

    const widthGap = Math.max(0, window.outerWidth - window.innerWidth);
    const heightGap = Math.max(0, window.outerHeight - window.innerHeight);
    const widthDelta = widthGap - initialDevtoolsGap.width;
    const heightDelta = heightGap - initialDevtoolsGap.height;

    return widthGap > 260 || heightGap > 260 || widthDelta > 140 || heightDelta > 140;
  }

  function devtoolsDebuggerDetected() {
    const start = performance.now();
    debugger;
    return performance.now() - start > 120;
  }

  window.setInterval(() => {
    if (devtoolsSizeGapDetected() || devtoolsDebuggerDetected()) {
      logoutForInspectionAttempt();
    }
  }, 1000);
})();
