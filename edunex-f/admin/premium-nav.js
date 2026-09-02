(function () {
  const nav = document.querySelector("[data-premium-nav]");
  if (!nav) return;

  const links = nav.querySelector(".premium-nav-links");
  const actions = nav.querySelector(".premium-nav-actions");
  const currentPath = window.location.pathname === "/" ? "admin-login.html" : window.location.pathname.split("/").pop();
  const icons = {
    brand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5Z"></path><path d="M6 12.5V17c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5"></path></svg>',
    analytics: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18"></path><path d="m7 15 4-4 4 4 5-7"></path></svg>',
    users: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
    courses: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"></path><path d="M8 7h8"></path><path d="M8 11h6"></path></svg>',
    upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="m17 8-5-5-5 5"></path><path d="M12 3v12"></path></svg>',
    login: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><path d="m10 17 5-5-5-5"></path><path d="M15 12H3"></path></svg>',
  };

  const adminLinks = [
    { href: "admin-dashboard.html", label: "Analytics", icon: icons.analytics, hint: "Dashboard" },
    { href: "admin-users.html", label: "Users", icon: icons.users, hint: "Learners" },
    { href: "admin-courses.html", label: "Courses", icon: icons.courses, hint: "Catalog" },
    { href: "course-posting.html", label: "Upload", icon: icons.upload, hint: "Create" },
  ];
  const brandMark = nav.querySelector(".premium-brand-mark");

  if (brandMark) {
    brandMark.innerHTML = icons.brand;
  }

  if (links) {
    links.innerHTML = adminLinks
      .map((link) => `
        <a href="${link.href}" data-nav-path="${link.href}" title="${link.label}">
          <span class="premium-nav-icon" aria-hidden="true">${link.icon}</span>
          <span class="premium-nav-copy">
            <span>${link.label}</span>
            <small>${link.hint}</small>
          </span>
        </a>
      `)
      .join("");
  }

  if (actions) {
    actions.innerHTML = `
      <a class="premium-nav-login-btn" href="admin-login.html" data-nav-path="admin-login.html">
        <span class="premium-nav-icon" aria-hidden="true">${icons.login}</span>
        <span class="premium-nav-copy">
          <span>Admin Login</span>
          <small>Secure access</small>
        </span>
      </a>
      <button class="premium-sidebar-collapse" type="button" aria-label="Collapse sidebar" aria-expanded="true">
        <span aria-hidden="true"></span>
      </button>
      <button class="premium-menu-toggle" type="button" aria-label="Open sidebar" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    `;
  }

  const nextLinks = nav.querySelector(".premium-nav-links");
  const nextToggle = nav.querySelector(".premium-menu-toggle");
  const collapseButton = nav.querySelector(".premium-sidebar-collapse");
  const collapseKey = "edunexAdminSidebarCollapsed";

  nav.insertAdjacentHTML("beforeend", '<button class="premium-nav-scrim" type="button" aria-label="Close sidebar"></button>');
  const scrim = nav.querySelector(".premium-nav-scrim");

  const savedState = localStorage.getItem(collapseKey);
  if (savedState === "true") {
    document.body.classList.add("premium-admin-sidebar-collapsed");
    collapseButton?.setAttribute("aria-expanded", "false");
    collapseButton?.setAttribute("aria-label", "Expand sidebar");
  }

  nav.querySelectorAll("[data-nav-path]").forEach((link) => {
    const path = link.getAttribute("data-nav-path");
    if (path === currentPath || path === window.location.pathname) {
      link.classList.add("is-active");
      link.setAttribute("aria-current", "page");
    }

    link.addEventListener("click", () => {
      if (!nextLinks || !nextToggle) return;
      nextLinks.classList.remove("is-open");
      document.body.classList.remove("premium-admin-sidebar-open");
      nextToggle.setAttribute("aria-expanded", "false");
    });
  });

  if (nextToggle && nextLinks) {
    nextToggle.addEventListener("click", () => {
      const isOpen = nextLinks.classList.toggle("is-open");
      document.body.classList.toggle("premium-admin-sidebar-open", isOpen);
      nextToggle.setAttribute("aria-expanded", String(isOpen));
    });
  }

  if (collapseButton) {
    collapseButton.addEventListener("click", () => {
      const isCollapsed = document.body.classList.toggle("premium-admin-sidebar-collapsed");
      localStorage.setItem(collapseKey, String(isCollapsed));
      collapseButton.setAttribute("aria-expanded", String(!isCollapsed));
      collapseButton.setAttribute("aria-label", isCollapsed ? "Expand sidebar" : "Collapse sidebar");
    });
  }

  if (scrim && nextLinks && nextToggle) {
    scrim.addEventListener("click", () => {
      nextLinks.classList.remove("is-open");
      document.body.classList.remove("premium-admin-sidebar-open");
      nextToggle.setAttribute("aria-expanded", "false");
    });
  }

  document.addEventListener("click", (event) => {
    if (!nextLinks || !nextToggle || !nextLinks.classList.contains("is-open")) return;
    if (nav.contains(event.target)) return;
    nextLinks.classList.remove("is-open");
    document.body.classList.remove("premium-admin-sidebar-open");
    nextToggle.setAttribute("aria-expanded", "false");
  });
})();
