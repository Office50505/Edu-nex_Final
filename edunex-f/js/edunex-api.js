(function () {
  const AUTH_KEYS = ["edunexAccessToken", "edunexRefreshToken", "edunexUser"];
  const SESSION_ENDED_NOTICE = "Your account is logged in on a different device.";
  const THEME_VARS = {
    light: {
      "--bg": "#F8FAFC",
      "--card": "#FFFFFF",
      "--card2": "#FFFFFF",
      "--panel": "#F1F5F9",
      "--panel2": "#F8FAFC",
      "--border": "#E2E8F0",
      "--border2": "#CBD5E1",
      "--text": "#0F172A",
      "--text2": "#475569",
      "--nav-bg": "#F8FAFC",
      "--gray": "#94A3B8",
      "--light": "#475569",
      "--cyan": "#C58B2A",
      "--cyan-dim": "rgba(197,139,42,0.10)",
      "--cyan-border": "rgba(197,139,42,0.26)",
      "--accent": "#C58B2A",
      "--gold": "#C58B2A",
    },
    noir: {
      "--bg": "#000000",
      "--card": "#0d0d0d",
      "--card2": "#111318",
      "--panel": "#141820",
      "--panel2": "#1a1f2e",
      "--border": "rgba(255,255,255,0.07)",
      "--border2": "rgba(255,255,255,0.10)",
      "--text": "#ffffff",
      "--text2": "#9ca3af",
      "--nav-bg": "rgba(0,0,0,0.92)",
      "--gray": "#888888",
      "--light": "#bbbbbb",
    },
  };

  function themeName() {
    return localStorage.getItem("enx-theme") || "noir";
  }

  function resolvedTheme(name = themeName()) {
    if (name === "light") return "light";
    if (name === "system") {
      return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "noir" : "light";
    }
    return "noir";
  }

  function applyTheme(name = themeName()) {
    const resolved = resolvedTheme(name);
    const vars = THEME_VARS[resolved];
    const root = document.documentElement;
    Object.keys(vars).forEach((key) => root.style.setProperty(key, vars[key]));
    root.dataset.theme = resolved;
    root.classList.toggle("dark", resolved !== "light");
    root.style.colorScheme = resolved === "light" ? "light" : "dark";
    root.style.background = vars["--bg"];
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute("content", resolved === "light" ? "#F8FAFC" : "#000000");
    if (document.body) {
      document.body.style.background = vars["--bg"];
      document.body.style.color = vars["--text"];
    }
  }

  function injectThemeStyles() {
    if (document.getElementById("edunex-theme-style")) return;
    const style = document.createElement("style");
    style.id = "edunex-theme-style";
    style.textContent = `
      :root {
        --font-body: "Manrope", ui-sans-serif, system-ui, sans-serif;
        --font-display: "Fraunces", Georgia, serif;
      }
      body,
      button,
      input,
      textarea,
      select,
      .navbar,
      .premium-site-nav,
      .edunex-mobile-menu,
      .index2-mobile-menu,
      .premium-mobile-menu {
        font-family: var(--font-body) !important;
      }
      h1,
      h2,
      .hero-title,
      .section-title,
      .auth-brand,
      .library-hero h1,
      .welcome-left h1,
      .market-right h2,
      .trial-left h2,
      .team-header-row h2,
      .cta-section h2,
      .section-head h2,
      .lp-title,
      .sp-title,
      .payment-choice-title {
        font-family: var(--font-display) !important;
        font-weight: 600;
        letter-spacing: 0;
      }
      .material-symbols-outlined {
        font-family: "Material Symbols Outlined" !important;
        font-weight: normal !important;
        font-style: normal !important;
        font-size: 24px;
        line-height: 1;
        letter-spacing: normal !important;
        text-transform: none !important;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        white-space: nowrap;
        word-wrap: normal;
        direction: ltr;
        -webkit-font-feature-settings: "liga";
        -webkit-font-smoothing: antialiased;
        font-variation-settings: "FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24;
      }
      html[data-theme="light"],
      html[data-theme="light"] body {
        background: var(--bg, #F8FAFC);
        color: var(--text, #0F172A);
      }
      html[data-theme="light"] .navbar,
      html[data-theme="light"] .premium-site-nav {
        background: var(--nav-bg, #F8FAFC) !important;
        border-bottom-color: var(--border, rgba(0,0,0,.08)) !important;
      }
      html[data-theme="light"] .nav-logo,
      html[data-theme="light"] .premium-logo,
      html[data-theme="light"] .nav-links a.active,
      html[data-theme="light"] .premium-nav-links a.active {
        color: var(--text, #0F172A) !important;
      }
      html[data-theme="light"] .nav-links a,
      html[data-theme="light"] .nav-login,
      html[data-theme="light"] .premium-nav-links a {
        color: var(--text2, #475569) !important;
      }
      html[data-theme="light"] .nav-links a:hover,
      html[data-theme="light"] .nav-login:hover,
      html[data-theme="light"] .premium-nav-links a:hover {
        color: var(--text, #0F172A) !important;
      }
      html[data-theme="light"] .nav-avatar,
      html[data-theme="light"] .premium-avatar {
        background: var(--card2, #F8FAFC) !important;
        border-color: var(--border, rgba(0,0,0,.08)) !important;
        color: var(--gray, #6b7280) !important;
      }
      html[data-theme="light"] .nav-hamburger span {
        background: var(--text, #0F172A) !important;
      }
      html[data-theme="light"] .edunex-mobile-menu,
      html[data-theme="light"] .index2-mobile-menu,
      html[data-theme="light"] .premium-mobile-menu {
        background: var(--nav-bg, #F8FAFC) !important;
        border-color: var(--border, rgba(0,0,0,.08)) !important;
      }
      html[data-theme="light"] .edunex-mobile-menu a,
      html[data-theme="light"] .index2-mobile-menu a,
      html[data-theme="light"] .premium-mobile-menu a {
        color: var(--text2, #475569) !important;
        border-color: var(--border, rgba(0,0,0,.08)) !important;
      }
      html[data-theme="light"] .edunex-mobile-menu a.active,
      html[data-theme="light"] .index2-mobile-menu a.active,
      html[data-theme="light"] .premium-mobile-menu a.active {
        color: var(--text, #0F172A) !important;
      }
      html[data-theme="light"] .glass-card,
      html[data-theme="light"] .card-traditional,
      html[data-theme="light"] .directive-card,
      html[data-theme="light"] .team-card,
      html[data-theme="light"] .trial-card,
      html[data-theme="light"] .hero-stat-card,
      html[data-theme="light"] .library-summary,
      html[data-theme="light"] .course-tile,
      html[data-theme="light"] .lesson-sidebar,
      html[data-theme="light"] .empty-state,
      html[data-theme="light"] .pf-card,
      html[data-theme="light"] .pf-profile-card,
      html[data-theme="light"] .ep-card,
      html[data-theme="light"] .cert-card,
      html[data-theme="light"] .wl-card,
      html[data-theme="light"] .hist-card,
      html[data-theme="light"] .rec-card,
      html[data-theme="light"] .activity-card,
      html[data-theme="light"] .streak-card,
      html[data-theme="light"] .stat-pill {
        background: var(--card, #F8FAFC) !important;
        border-color: var(--border, rgba(0,0,0,.08)) !important;
      }
      html[data-theme="light"] .page,
      html[data-theme="light"] .dash-page,
      html[data-theme="light"] .library-page,
      html[data-theme="light"] .watch-page,
      html[data-theme="light"] .hero-section,
      html[data-theme="light"] .team-section,
      html[data-theme="light"] .cta-section {
        background: transparent !important;
        color: var(--text, #0F172A) !important;
      }
      html[data-theme="light"] .market-section,
      html[data-theme="light"] .trial-section,
      html[data-theme="light"] .footer,
      html[data-theme="light"] .footer-wrap {
        background: #F8FAFC !important;
        border-color: var(--border, rgba(0,0,0,.08)) !important;
      }
      html[data-theme="light"] .hero-title,
      html[data-theme="light"] .market-right h2,
      html[data-theme="light"] .trial-left h2,
      html[data-theme="light"] .team-header-row h2,
      html[data-theme="light"] .cta-section h2,
      html[data-theme="light"] .section-head h2,
      html[data-theme="light"] .tile-body h3,
      html[data-theme="light"] .lesson-info h1,
      html[data-theme="light"] .activity-head span,
      html[data-theme="light"] .streak-head span,
      html[data-theme="light"] .card-traditional h3,
      html[data-theme="light"] .directive-card h3,
      html[data-theme="light"] .team-name,
      html[data-theme="light"] .ep-card-title,
      html[data-theme="light"] .back-title,
      html[data-theme="light"] .ava-edit-name {
        color: var(--text, #0F172A) !important;
      }
      html[data-theme="light"] .hero-sub,
      html[data-theme="light"] .crisis-header p,
      html[data-theme="light"] .market-left p,
      html[data-theme="light"] .trial-left p,
      html[data-theme="light"] .proof-text,
      html[data-theme="light"] .trial-desc,
      html[data-theme="light"] .team-sub,
      html[data-theme="light"] .cta-section p,
      html[data-theme="light"] .card-traditional p,
      html[data-theme="light"] .directive-card p,
      html[data-theme="light"] .hero-stat-lbl,
      html[data-theme="light"] .section-head p,
      html[data-theme="light"] .status-line,
      html[data-theme="light"] .tile-body p,
      html[data-theme="light"] .tile-meta,
      html[data-theme="light"] .library-hero p,
      html[data-theme="light"] .summary-label,
      html[data-theme="light"] .lesson-info p,
      html[data-theme="light"] .lesson-copy span,
      html[data-theme="light"] .sidebar-head p,
      html[data-theme="light"] .back-bar-title,
      html[data-theme="light"] .ep-label,
      html[data-theme="light"] .ava-edit-sub {
        color: var(--text2, #475569) !important;
      }
      html[data-theme="light"] .hero-btn-secondary,
      html[data-theme="light"] .btn-ghost,
      html[data-theme="light"] .back-btn,
      html[data-theme="light"] .filter-tab,
      html[data-theme="light"] .library-tab,
      html[data-theme="light"] .back-library,
      html[data-theme="light"] .lesson-meta span,
      html[data-theme="light"] .ep-country-code,
      html[data-theme="light"] .ep-gender-slider,
      html[data-theme="light"] .ava-choice {
        background: var(--card2, #F8FAFC) !important;
        border-color: var(--border2, rgba(0,0,0,.12)) !important;
        color: var(--text2, #475569) !important;
      }
      html[data-theme="light"] .hero-btn-secondary:hover,
      html[data-theme="light"] .btn-ghost:hover,
      html[data-theme="light"] .back-library:hover,
      html[data-theme="light"] .library-tab:hover,
      html[data-theme="light"] .lesson-item:hover {
        color: var(--text, #0F172A) !important;
        background: #eefcff !important;
        border-color: rgba(197,139,42,.28) !important;
      }
      html[data-theme="light"] .hero-neural-card,
      html[data-theme="light"] .hero-neural-card img,
      html[data-theme="light"] .team-photo,
      html[data-theme="light"] .tile-media,
      html[data-theme="light"] .lesson-thumb,
      html[data-theme="light"] .hist-thumb,
      html[data-theme="light"] .rec-thumb,
      html[data-theme="light"] .ava-edit-circle {
        background: #e5edf3 !important;
        border-color: var(--border2, rgba(0,0,0,.12)) !important;
      }
      html[data-theme="light"] .ava-edit-overlay {
        background: #F8FAFC !important;
      }
      html[data-theme="light"] .library-summary {
        background: linear-gradient(180deg, #F8FAFC, #F8FAFC), #F8FAFC !important;
      }
      html[data-theme="light"] .course-tile:hover,
      html[data-theme="light"] .lesson-item.is-active {
        background: #eefcff !important;
        border-color: rgba(197,139,42,.28) !important;
      }
      html[data-theme="light"] .summary-number,
      html[data-theme="light"] .lesson-copy strong,
      html[data-theme="light"] .player-placeholder strong,
      html[data-theme="light"] .hero-stat-num {
        color: var(--text, #0F172A) !important;
      }
      html[data-theme="light"] .library-search input,
      html[data-theme="light"] .ep-input {
        background: #F8FAFC !important;
        border-color: var(--border2, rgba(0,0,0,.12)) !important;
        color: var(--text, #0F172A) !important;
      }
      html[data-theme="light"] .player-frame,
      html[data-theme="light"] .player-placeholder {
        background: #e5e7eb !important;
      }
      html[data-theme="light"] .player-frame iframe,
      html[data-theme="light"] .player-frame video {
        background: #0F172A !important;
      }
      html[data-theme="light"] .lesson-sidebar {
        background: #F8FAFC !important;
      }
      html[data-theme="light"] .sidebar-head {
        border-color: var(--border, rgba(0,0,0,.08)) !important;
      }
      html[data-theme="light"] .lesson-number {
        background: #F8FAFC !important;
        color: var(--text, #0F172A) !important;
      }
      html[data-theme="light"] .tile-progress,
      html[data-theme="light"] .hist-progress-track {
        background: #e5e7eb !important;
      }
      html[data-theme="light"] .activity-card,
      html[data-theme="light"] .streak-card {
        background: #F8FAFC !important;
        border-color: var(--border, rgba(0,0,0,.08)) !important;
      }
      html[data-theme="light"] .bar {
        background: #dbe3ea !important;
      }
      html[data-theme="light"] .bar.bar-active {
        background: var(--cyan, #C58B2A) !important;
      }
      html[data-theme="light"] .bar-tooltip {
        background: #F8FAFC !important;
        border-color: var(--border2, rgba(0,0,0,.12)) !important;
        color: var(--text, #0F172A) !important;
        box-shadow: 0 8px 20px rgba(15,23,42,.10);
      }
      html[data-theme="light"] .bar-tooltip::after {
        border-top-color: rgba(0,0,0,.12) !important;
      }
      html[data-theme="light"] .chart-day,
      html[data-theme="light"] .activity-more,
      html[data-theme="light"] .streak-sub {
        color: var(--text2, #475569) !important;
      }
      html[data-theme="light"] .activity-stats {
        border-color: var(--border, rgba(0,0,0,.08)) !important;
      }
      html[data-theme="light"] .streak-dot {
        background: #dbe3ea !important;
      }
      html[data-theme="light"] .streak-dot.done,
      html[data-theme="light"] .streak-dot.today {
        background: var(--cyan, #C58B2A) !important;
        box-shadow: none !important;
      }
      html[data-theme="light"] .lp-wrap,
      html[data-theme="light"] .lp-right,
      html[data-theme="light"] .sp-main,
      html[data-theme="light"] .sp-profile-wrap,
      html[data-theme="light"] .sp-form-panel {
        background: var(--bg, #F8FAFC) !important;
        color: var(--text, #0F172A) !important;
      }
      html[data-theme="light"] .lp-left,
      html[data-theme="light"] .lp-form-box,
      html[data-theme="light"] .lp-test-card,
      html[data-theme="light"] .sp-profile-card,
      html[data-theme="light"] .sp-footer,
      html[data-theme="light"] .sp-ava-modal {
        background: var(--card, #F8FAFC) !important;
        border-color: var(--border, rgba(0,0,0,.08)) !important;
        color: var(--text, #0F172A) !important;
      }
      html[data-theme="light"] .lp-input-wrap,
      html[data-theme="light"] .sp-input-row,
      html[data-theme="light"] .sp-profile-input,
      html[data-theme="light"] .sp-otp-box,
      html[data-theme="light"] .sp-age-roller,
      html[data-theme="light"] .sp-gender-slider,
      html[data-theme="light"] .sp-avatar-tab,
      html[data-theme="light"] .sp-ava-modal-close,
      html[data-theme="light"] .sp-ava-opt,
      html[data-theme="light"] .sp-footer-icon {
        background: var(--card2, #F8FAFC) !important;
        border-color: var(--border2, rgba(0,0,0,.12)) !important;
      }
      html[data-theme="light"] .lp-marketing-title,
      html[data-theme="light"] .lp-login-title,
      html[data-theme="light"] .lp-form-group > label,
      html[data-theme="light"] .lp-label-row label,
      html[data-theme="light"] .lp-author-name,
      html[data-theme="light"] .lp-test-text,
      html[data-theme="light"] .sp-form-title,
      html[data-theme="light"] .sp-field-label,
      html[data-theme="light"] .sp-otp-label,
      html[data-theme="light"] .sp-profile-heading,
      html[data-theme="light"] .sp-ava-circle-name,
      html[data-theme="light"] .sp-ava-modal-title,
      html[data-theme="light"] .sp-footer-brand,
      html[data-theme="light"] .sp-footer-col-title,
      html[data-theme="light"] .stat-pill-value,
      html[data-theme="light"] .sec-title,
      html[data-theme="light"] .hist-title,
      html[data-theme="light"] .rec-title,
      html[data-theme="light"] .astat-value {
        color: var(--text, #0F172A) !important;
      }
      html[data-theme="light"] .lp-hero p,
      html[data-theme="light"] .lp-subtitle,
      html[data-theme="light"] .lp-author-role,
      html[data-theme="light"] .lp-remember,
      html[data-theme="light"] .lp-create-row,
      html[data-theme="light"] .lp-footer-links a,
      html[data-theme="light"] .sp-form-sub,
      html[data-theme="light"] .sp-prefix,
      html[data-theme="light"] .sp-checkbox-row,
      html[data-theme="light"] .sp-login-row,
      html[data-theme="light"] .sp-otp-desc,
      html[data-theme="light"] .sp-resend,
      html[data-theme="light"] .sp-profile-sub,
      html[data-theme="light"] .sp-ava-circle-hint,
      html[data-theme="light"] .sp-roller-item,
      html[data-theme="light"] .sp-gender-slide-btn,
      html[data-theme="light"] .sp-terms-note,
      html[data-theme="light"] .sp-footer-brand-desc,
      html[data-theme="light"] .sp-footer-col-links a,
      html[data-theme="light"] .sp-footer-bottom p,
      html[data-theme="light"] .sp-footer-bottom-links a,
      html[data-theme="light"] .sp-footer-icon,
      html[data-theme="light"] .stat-pill-label,
      html[data-theme="light"] .hist-meta,
      html[data-theme="light"] .hist-time,
      html[data-theme="light"] .rec-meta-row,
      html[data-theme="light"] .astat-label {
        color: var(--text2, #475569) !important;
      }
      html[data-theme="light"] .lp-input-wrap input,
      html[data-theme="light"] .sp-input-row input,
      html[data-theme="light"] .sp-profile-input,
      html[data-theme="light"] .sp-otp-box {
        color: var(--text, #0F172A) !important;
      }
      html[data-theme="light"] .ep-toast {
        background: #F8FAFC !important;
        border-color: rgba(197,139,42,.32) !important;
        box-shadow: 0 18px 45px rgba(15,23,42,.12);
      }
      html[data-theme="light"] input,
      html[data-theme="light"] textarea,
      html[data-theme="light"] select {
        background: var(--card2, #F8FAFC) !important;
        border-color: var(--border2, rgba(0,0,0,.12)) !important;
        color: var(--text, #0F172A) !important;
      }
      html[data-theme="light"] .pay-nav,
      html[data-theme="light"] .navbar,
      html[data-theme="light"] .premium-site-nav {
        background: var(--nav-bg, #F8FAFC) !important;
      }
      html[data-theme="light"] .course-preview,
      html[data-theme="light"] .checkout-card,
      html[data-theme="light"] .payment-choice-card,
      html[data-theme="light"] .course-card,
      html[data-theme="light"] .library-shell,
      html[data-theme="light"] .watch-shell {
        background: var(--card, #F8FAFC) !important;
      }
      html[data-theme="light"] .checkout-body,
      html[data-theme="light"] .payment-choice-body,
      html[data-theme="light"] .cp-includes,
      html[data-theme="light"] .plan-option,
      html[data-theme="light"] .pay-btn-secondary,
      html[data-theme="light"] .payment-choice-btn.secondary {
        background: var(--card2, #F8FAFC) !important;
      }
      html[data-theme="light"] .orb,
      html[data-theme="light"] .orb-tl,
      html[data-theme="light"] .orb-br {
        display: none !important;
      }
      html[data-theme="light"] {
        --bg: #F8FAFC;
        --card: #FFFFFF;
        --card2: #FFFFFF;
        --panel: #F1F5F9;
        --panel2: #F8FAFC;
        --border: #E2E8F0;
        --border2: #CBD5E1;
        --text: #0F172A;
        --text2: #475569;
        --nav-bg: #F8FAFC;
        --gray: #94A3B8;
        --light: #475569;
        --cyan: #C58B2A;
        --cyan-dim: rgba(197,139,42,.10);
        --cyan-border: rgba(197,139,42,.26);
        --accent: #C58B2A;
        --gold: #C58B2A;
      }
      html[data-theme="light"],
      html[data-theme="light"] body {
        background: #F8FAFC !important;
        color: #0F172A !important;
      }
      html[data-theme="light"] :where(h1, h2, h3, h4, h5, h6, .hero-title, .sec-title, .section-title, .card-title, .course-title, .tile-body h3, .pf-name, .pf-card-heading, .ep-card-title, .cert-visual-title, .welcome-left h1, .stat-pill-value, .hist-title, .rec-title, .astat-value) {
        color: #0F172A !important;
      }
      html[data-theme="light"] :where(p, .text-on-surface-variant, .hero-sub, .section-head p, .tile-body p, .tile-meta, .pf-email, .pf-list-hint, .hist-meta, .hist-time, .rec-meta-row, .cert-meta, .wl-meta, .wl-instructor, .stat-pill-label, .astat-label, .chart-day, .footer-desc, .footer-links a, .footer-bottom p) {
        color: #475569 !important;
      }
      html[data-theme="light"] :where(.navbar, .premium-site-nav, .enx-navbar, .pay-nav, .edunex-mobile-menu, .index2-mobile-menu, .premium-mobile-menu) {
        background: #F8FAFC !important;
        border-color: #E2E8F0 !important;
      }
      html[data-theme="light"] :where(.nav-logo, .premium-logo, .footer-brand, .enx-nav-logo, .enx-footer-brand) {
        color: #0F172A !important;
      }
      html[data-theme="light"] :where(.nav-logo .brand-logo-mate, .nav-logo .brand-logo-ai, .premium-logo .brand-logo-mate, .premium-logo .brand-logo-ai, .enx-nav-logo .brand-logo-mate, .enx-nav-logo .brand-logo-ai, .enx-footer-brand span span, .nav-links a.active, .premium-nav-links a.active, .enx-nav-links a.active, .nav-login:hover, .enx-nav-login:hover, .nav-avatar:hover, .enx-nav-avatar:hover, .premium-avatar:hover, .footer-links a:hover, .enx-footer-links a:hover, .enx-footer-cta > a, .sec-link, .course-price, .wl-price, .cp-price, .hero-card-price strong, .hero-card-action) {
        color: #C58B2A !important;
      }
      html[data-theme="light"] :where(.bar.bar-active, .streak-dot.done, .streak-dot.today, .tile-progress span, .hist-progress-track span, .hero-progress-track span) {
        background: #C58B2A !important;
      }
      html[data-theme="light"] .nav-links a.active::after,
      html[data-theme="light"] .premium-nav-links a.active::after,
      html[data-theme="light"] .enx-nav-links a.active::after {
        background: #C58B2A !important;
      }
      html[data-theme="light"] :where(.glass-card, .card-traditional, .directive-card, .team-card, .trial-card, .hero-stat-card, .library-summary, .course-tile, .lesson-sidebar, .empty-state, .pf-card, .pf-profile-card, .ep-card, .cert-card, .wl-card, .hist-card, .rec-card, .activity-card, .streak-card, .stat-pill, .checkout-card, .course-preview, .payment-choice-card, .course-card, .library-shell, .watch-shell, .video-shell, .lp-form-box, .lp-test-card, .sp-profile-card, .sp-form-panel, .legal-card, .hero-course-card, .hero-search-form, .hero-trust-item, .hero-topic, .hero-carousel-btn) {
        background: #FFFFFF !important;
        border-color: #E2E8F0 !important;
        box-shadow: 0 8px 24px rgba(15, 23, 42,.06) !important;
      }
      html[data-theme="light"] :where(.checkout-body, .payment-choice-body, .cp-includes, .plan-option, .pay-btn-secondary, .payment-choice-btn.secondary, .library-tabs, .library-search, .summary-subline, .lesson-item, .pf-list-icon, .pf-edit-btn, .filter-tab, .library-tab, .cert-tab, .back-btn, .btn-ghost, .hero-cta-secondary, .hero-btn-secondary) {
        background: #FFFFFF !important;
        border-color: #E2E8F0 !important;
        color: #C58B2A !important;
      }
      html[data-theme="light"] :where(input, textarea, select, .ep-input, .sp-profile-input, .library-search input, .hero-search-field input) {
        background: #F8FAFC !important;
        border-color: #E2E8F0 !important;
        color: #0F172A !important;
      }
      html[data-theme="light"] :where(input, textarea, select):focus {
        border-color: #C58B2A !important;
        outline-color: #C58B2A !important;
      }
      html[data-theme="light"] input::placeholder,
      html[data-theme="light"] textarea::placeholder {
        color: #94A3B8 !important;
      }
      html[data-theme="light"] :where(.hero-cta-primary, .hero-search-btn, .btn-cyan, .btn-trial, .trial-btn, .cta-big-btn, .login-cta-btn, .footer-contact-link, .lp-signin-btn, .sp-primary-btn, .sp-complete-btn, .payment-choice-btn.primary, .pay-btn-primary, .wl-enroll-btn, .cart-btn, .upgrade-card) {
        background: #C58B2A !important;
        border-color: #C58B2A !important;
        color: #FFFFFF !important;
        box-shadow: 0 8px 24px rgba(15, 23, 42,.10) !important;
      }
      html[data-theme="light"] :where(.hero-cta-primary:hover, .hero-search-btn:hover, .btn-cyan:hover, .btn-trial:hover, .trial-btn:hover, .cta-big-btn:hover, .login-cta-btn:hover, .footer-contact-link:hover, .lp-signin-btn:hover, .sp-primary-btn:hover, .sp-complete-btn:hover, .payment-choice-btn.primary:hover, .pay-btn-primary:hover, .wl-enroll-btn:hover, .cart-btn:hover) {
        background: #C58B2A !important;
        border-color: #C58B2A !important;
      }
      html[data-theme="light"] :where(.hero-card-badge, .bg-black\\/80, .pf-badge-teal, .pf-badge-gray, .filter-tab.active, .cert-tab.active, .wl-sort-btn.active) {
        background: #F1F5F9 !important;
        border-color: #C58B2A !important;
        color: #C58B2A !important;
      }
      html[data-theme="light"] :where([data-enx-icon="star"], .wl-rating, .rating, .cert-visual-org, .streak-num) {
        color: #C58B2A !important;
      }
      html[data-theme="light"] :where(.page-grid, #page-grid-global) {
        background-image:
          linear-gradient(rgba(197,139,42,.055) 1px, transparent 1px),
          linear-gradient(90deg, rgba(197,139,42,.055) 1px, transparent 1px) !important;
      }
      html[data-theme="light"] :where(.grid-dot-global) {
        background: rgba(197, 139, 42,.78) !important;
        box-shadow: 0 0 8px 2px rgba(197, 139, 42,.28) !important;
      }
      html[data-theme="light"] :where(.site-footer, .footer, .footer-wrap, .sp-footer, .enx-footer, .enx-footer-cta, .enx-footer-trust-row span, .enx-footer-support a) {
        background: #F8FAFC !important;
        border-color: #E2E8F0 !important;
      }
      html[data-theme="light"] :where(.hero-cta-secondary, .hero-btn-secondary, .btn-ghost, .pay-btn-secondary, .payment-choice-btn.secondary, .back-btn, .pf-edit-btn) {
        background: #FFFFFF !important;
        border-color: #C58B2A !important;
        color: #C58B2A !important;
      }
      html[data-theme="light"] :where(.hero-topic, .topic-chip, .filter-tab, .library-tab, .cert-tab) {
        background: #F8FAFC !important;
        border-color: #E2E8F0 !important;
        color: #475569 !important;
      }
      html[data-theme="light"] :where(.hero-topic i, .topic-chip i, .filter-tab i, .library-tab i, .cert-tab i) {
        color: #C58B2A !important;
      }
      html[data-theme="light"] :where(.hero-card-badge, .bg-black\\/80, .pf-badge-teal, .pf-badge-gray, .filter-tab.active, .cert-tab.active, .wl-sort-btn.active, .hero-topic:hover, .topic-chip:hover) {
        background: #F1F5F9 !important;
        border-color: #C58B2A !important;
        color: #C58B2A !important;
      }
      .enx-icon {
        width: 1em;
        height: 1em;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        color: currentColor;
        line-height: 1;
        vertical-align: -0.14em;
      }
      .enx-icon svg {
        width: 1em;
        height: 1em;
        display: block;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.85;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      i.enx-iconized,
      .material-symbols-outlined.enx-iconized {
        font-family: inherit !important;
        font-style: normal !important;
        font-weight: inherit !important;
        letter-spacing: 0 !important;
        text-transform: none !important;
      }
      :where(.hero-trust-item, .pf-card-heading, .ep-card-title, .payment-feature, .pay-secure-item, .stat-pill-label, .course-stats, .wl-meta, .cert-meta) .enx-icon {
        color: #C58B2A;
      }
      html[data-theme="light"] :where(.navbar .enx-icon, .premium-site-nav .enx-icon, .enx-navbar .enx-icon, .pay-nav .enx-icon, .hero-trust-item .enx-icon) {
        color: #C58B2A !important;
      }
    `;
    document.head.appendChild(style);
  }

  injectThemeStyles();
  applyTheme();
  window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener("change", () => {
    if (themeName() === "system") applyTheme("system");
  });
  window.addEventListener("storage", (event) => {
    if (event.key === "enx-theme") applyTheme(event.newValue || "noir");
  });

  const ICON_PATHS = {
    search: '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path>',
    user: '<path d="M19 21a7 7 0 0 0-14 0"></path><circle cx="12" cy="8" r="4"></circle>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
    book: '<path d="M12 7v14"></path><path d="M3 5a7 7 0 0 1 7 0v14a7 7 0 0 0-7 0z"></path><path d="M21 5a7 7 0 0 0-7 0v14a7 7 0 0 1 7 0z"></path>',
    sparkles: '<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"></path><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"></path><path d="M5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8z"></path>',
    brain: '<path d="M8 6a3 3 0 0 1 6 0"></path><path d="M9 21a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4"></path><path d="M15 4a4 4 0 0 1 4 4v9a4 4 0 0 1-4 4"></path><path d="M12 6v15"></path><path d="M8 12h8"></path><path d="M8 16h8"></path>',
    award: '<circle cx="12" cy="8" r="5"></circle><path d="M8.5 12.5 7 22l5-3 5 3-1.5-9.5"></path>',
    badge: '<path d="M12 3 8.5 5 4.5 5.5 4 9.5 2 12l2 2.5.5 4 4 .5 3.5 2 3.5-2 4-.5.5-4 2-2.5-2-2.5-.5-4-4-.5z"></path><path d="m9 12 2 2 4-4"></path>',
    device: '<rect x="3" y="4" width="13" height="10" rx="2"></rect><path d="M8 20h5"></path><path d="M10.5 14v6"></path><rect x="17" y="8" width="4" height="10" rx="1"></rect>',
    clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.2 6.4 20.2 7.5 14 3 9.6l6.2-.9z"></path>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"></path>',
    bookmark: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"></path>',
    play: '<path d="m8 5 11 7-11 7z"></path>',
    playCircle: '<circle cx="12" cy="12" r="9"></circle><path d="m10 8 6 4-6 4z"></path>',
    arrowRight: '<path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path>',
    arrowLeft: '<path d="M19 12H5"></path><path d="m11 6-6 6 6 6"></path>',
    arrowUp: '<path d="M12 19V5"></path><path d="m6 11 6-6 6 6"></path>',
    chevron: '<path d="m9 6 6 6-6 6"></path>',
    chevronLeft: '<path d="m15 18-6-6 6-6"></path>',
    plus: '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
    x: '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
    check: '<path d="m5 12 4 4L19 6"></path>',
    checkCircle: '<circle cx="12" cy="12" r="9"></circle><path d="m8 12 2.5 2.5L16 9"></path>',
    alert: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v6"></path><path d="M12 17h.01"></path>',
    eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>',
    eyeOff: '<path d="m3 3 18 18"></path><path d="M10.6 10.6A3 3 0 0 0 13.4 13.4"></path><path d="M9.9 4.2A10.7 10.7 0 0 1 12 4c6.5 0 10 8 10 8a18.8 18.8 0 0 1-2.3 3.3"></path><path d="M6.6 6.6C3.7 8.6 2 12 2 12s3.5 8 10 8a10.8 10.8 0 0 0 4.1-.8"></path>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3 7 9 6 9-6"></path>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6.4 6.4l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6A2 2 0 0 1 22 16.9z"></path>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M3 10h18"></path><path d="M7 15h4"></path>',
    receipt: '<path d="M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1 2-1V3z"></path><path d="M8 8h8"></path><path d="M8 12h8"></path><path d="M8 16h5"></path>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="m9 12 2 2 4-4"></path>',
    lock: '<rect x="4" y="10" width="16" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path>',
    help: '<circle cx="12" cy="12" r="9"></circle><path d="M9.5 9a2.5 2.5 0 0 1 4.5 1.5c0 2-2 2-2 4"></path><path d="M12 18h.01"></path>',
    fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M8 13h8"></path><path d="M8 17h6"></path>',
    chart: '<path d="M4 19V5"></path><path d="M4 19h16"></path><path d="M8 16v-5"></path><path d="M12 16V8"></path><path d="M16 16v-3"></path>',
    flame: '<path d="M12 22a7 7 0 0 0 7-7c0-4-3-7-4-11-2 2-3 4-3 6-2-1-3-3-3-5-2 2-4 5-4 9a7 7 0 0 0 7 8z"></path>',
    target: '<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1"></circle>',
    cap: '<path d="m2 7 10-4 10 4-10 4z"></path><path d="M6 10v4c3 2 9 2 12 0v-4"></path><path d="M22 7v6"></path>',
    globe: '<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path><path d="M12 3a15 15 0 0 1 0 18"></path><path d="M12 3a15 15 0 0 0 0 18"></path>',
    share: '<circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="m8.6 10.6 6.8-4.2"></path><path d="m8.6 13.4 6.8 4.2"></path>',
    menu: '<path d="M4 6h16"></path><path d="M4 12h16"></path><path d="M4 18h16"></path>',
    mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><path d="M12 19v3"></path>',
    volume: '<path d="M11 5 6 9H3v6h3l5 4z"></path><path d="M15.5 8.5a5 5 0 0 1 0 7"></path>',
    id: '<rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="9" cy="10" r="2"></circle><path d="M15 8h3"></path><path d="M15 12h3"></path><path d="M7 16h6"></path>',
    pen: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"></path>',
    trash: '<path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v5"></path><path d="M14 11v5"></path>',
    layers: '<path d="m12 2 9 5-9 5-9-5z"></path><path d="m3 12 9 5 9-5"></path><path d="m3 17 9 5 9-5"></path>',
    signal: '<path d="M2 20h20"></path><path d="M6 16h.01"></path><path d="M10 13a4 4 0 0 1 4 0"></path><path d="M7 10a8 8 0 0 1 10 0"></path><path d="M4 7a12 12 0 0 1 16 0"></path>',
    languages: '<path d="M5 8h8"></path><path d="M9 4v4"></path><path d="M4 14c3.2-1.8 5.2-4.2 6-6"></path><path d="M8 14c-1.2-1.1-2.2-2.4-3-4"></path><path d="M14 20l4-9 4 9"></path><path d="M16 16h4"></path>',
    spinner: '<path d="M21 12a9 9 0 1 1-6.2-8.6"></path>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"></rect><path d="M16 2v4"></path><path d="M8 2v4"></path><path d="M3 10h18"></path><path d="m9 15 2 2 4-4"></path>',
    code: '<path d="m8 9-4 3 4 3"></path><path d="m16 9 4 3-4 3"></path><path d="m14 5-4 14"></path>',
    desktop: '<rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M8 20h8"></path><path d="M12 16v4"></path>',
    palette: '<path d="M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 1.4-3.4 1 1 0 0 1 .7-1.7H17a4 4 0 0 0 4-4 9 9 0 0 0-9-9z"></path><circle cx="7.5" cy="10.5" r=".8"></circle><circle cx="10.5" cy="7.5" r=".8"></circle><circle cx="14.5" cy="7.5" r=".8"></circle>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect>',
    captions: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M8 13h3"></path><path d="M13 13h3"></path><path d="M8 16h6"></path>',
    paperclip: '<path d="m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 1 1-2.8-2.8l8.5-8.5"></path>',
    send: '<path d="m22 2-7 20-4-9-9-4z"></path><path d="M22 2 11 13"></path>',
    sliders: '<path d="M4 21v-7"></path><path d="M4 10V3"></path><path d="M12 21v-9"></path><path d="M12 8V3"></path><path d="M20 21v-5"></path><path d="M20 12V3"></path><path d="M2 14h4"></path><path d="M10 8h4"></path><path d="M18 16h4"></path>',
    expand: '<path d="M15 3h6v6"></path><path d="m21 3-7 7"></path><path d="M9 21H3v-6"></path><path d="m3 21 7-7"></path>',
    home: '<path d="m3 11 9-8 9 8"></path><path d="M5 10v10h14V10"></path><path d="M9 20v-6h6v6"></path>',
    store: '<path d="M4 10h16"></path><path d="M5 10l1-6h12l1 6"></path><path d="M6 10v10h12V10"></path><path d="M9 20v-5h6v5"></path>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"></rect><path d="M9 7V5h6v2"></path><path d="M3 12h18"></path>',
    lightbulb: '<path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M8.5 14.5A6 6 0 1 1 15.5 14.5c-.8.7-1.3 1.6-1.5 2.5h-4c-.2-.9-.7-1.8-1.5-2.5z"></path>',
    circleInfo: '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5"></path><path d="M12 8h.01"></path>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="M16 17l5-5-5-5"></path><path d="M21 12H9"></path>'
  };

  const FA_ICON_MAP = {
    "fa-search": "search", "fa-user": "user", "fa-user-circle": "user", "fa-user-check": "checkCircle", "fa-user-pen": "pen", "fa-pencil-alt": "pen", "fa-users": "users",
    "fa-book": "book", "fa-book-open": "book", "fa-file-lines": "fileText", "fa-file-alt": "fileText", "fa-bolt": "sparkles", "fa-robot": "sparkles",
    "fa-rocket": "arrowUp", "fa-trash-alt": "trash", "fa-trash": "trash",
    "fa-wand-magic-sparkles": "sparkles", "fa-award": "award", "fa-certificate": "badge", "fa-shield": "shield", "fa-shield-halved": "shield",
    "fa-lock": "lock", "fa-credit-card": "card", "fa-receipt": "receipt", "fa-clock": "clock", "fa-star": "star", "fa-heart": "heart", "fa-heart-crack": "bookmark",
    "fa-bookmark": "bookmark", "fa-play": "play", "fa-pause": "play", "fa-play-circle": "playCircle", "fa-circle-play": "playCircle",
    "fa-video": "playCircle", "fa-arrow-right": "arrowRight", "fa-arrow-left": "arrowLeft", "fa-arrow-up": "arrowUp", "fa-chevron-right": "chevron", "fa-chevron-left": "chevronLeft",
    "fa-chevron-down": "chevron", "fa-plus": "plus", "fa-plus-circle": "plus", "fa-times": "x", "fa-xmark": "x", "fa-check": "check",
    "fa-check-circle": "checkCircle", "fa-circle-check": "checkCircle", "fa-circle-exclamation": "alert", "fa-eye": "eye", "fa-eye-slash": "eyeOff",
    "fa-envelope": "mail", "fa-at": "mail", "fa-phone": "phone", "fa-question-circle": "help", "fa-circle-question": "help", "fa-headset": "help",
    "fa-fire": "flame", "fa-bullseye": "target", "fa-graduation-cap": "cap", "fa-chart-line": "chart", "fa-globe": "globe",
    "fa-share-alt": "share", "fa-share-nodes": "share", "fa-bars": "menu", "fa-volume-high": "volume", "fa-volume-low": "volume",
    "fa-volume-xmark": "volume", "fa-expand": "expand", "fa-microphone": "mic", "fa-mars": "user", "fa-venus": "user",
    "fa-address-card": "id", "fa-id-badge": "id", "fa-university": "book", "fa-network-wired": "chart", "fa-redo": "arrowRight",
    "fa-times-circle": "x", "fa-instagram": "share", "fa-twitter": "share", "fa-whatsapp": "phone", "fa-linkedin": "share", "fa-youtube": "playCircle", "fa-discord": "share",
    "fa-layer-group": "layers", "fa-signal": "signal", "fa-language": "languages", "fa-spinner": "spinner", "fa-calendar-check": "calendar",
    "fa-code": "code", "fa-desktop": "desktop", "fa-palette": "palette", "fa-table-cells": "grid", "fa-closed-captioning": "captions",
    "fa-paperclip": "paperclip", "fa-paper-plane": "send", "fa-sliders-h": "sliders", "fa-home": "home", "fa-store": "store",
    "fa-cogs": "sliders", "fa-chalkboard-teacher": "user", "fa-pen-nib": "pen", "fa-lightbulb": "lightbulb", "fa-user-tie": "user",
    "fa-circle-info": "circleInfo", "fa-arrow-right-from-bracket": "logout", "fa-mobile-screen-button": "device", "fa-key": "lock"
  };
  const MATERIAL_ICON_MAP = {
    search: "search", school: "book", groups: "users", workspace_premium: "award", play_lesson: "playCircle", verified: "badge",
    devices: "device", arrow_forward: "arrowRight", arrow_back: "arrowLeft", bolt: "sparkles", auto_awesome: "sparkles", psychology: "brain",
    smart_toy: "sparkles", favorite: "heart", favorite_border: "heart", bookmark: "bookmark", menu: "menu", logout: "arrowRight",
    notifications: "badge", person: "user", account_circle: "user", credit_card: "card", receipt_long: "receipt", lock: "lock",
    shield: "shield", help: "help", language: "globe", expand_more: "chevron", chevron_left: "chevronLeft", chevron_right: "chevron", check_circle: "checkCircle",
    error: "alert", schedule: "clock", play_circle: "playCircle", rocket_launch: "arrowUp", trending_flat: "arrowRight",
    workspace_premium: "award", payments: "card", paid: "card", trophy: "award"
  };
  const EMOJI_ICON_MAP = { "\u{1F525}": "flame", "\u26A1": "sparkles", "\u{1F680}": "arrowUp", "\u{1F393}": "cap", "\u{1F3C6}": "award", "\u{1F916}": "sparkles", "\u{1F4B0}": "card", "\u2728": "sparkles", "\u{1F3AF}": "target" };

  function iconMarkup(name) {
    const path = ICON_PATHS[name] || ICON_PATHS.sparkles;
    return `<span class="enx-icon" data-enx-icon="${name}" aria-hidden="true"><svg viewBox="0 0 24 24">${path}</svg></span>`;
  }

  function isLegacyIconClass(cls) {
    return /^(fa-|fas$|far$|fab$|fal$|fad$|fa-solid$|fa-regular$|fa-brands$|material-symbols-outlined$)/.test(cls || "");
  }

  function cleanIconClasses(el) {
    return Array.from(el.classList || []).filter((cls) => !isLegacyIconClass(cls) && cls !== "enx-iconized" && cls !== "enx-icon").join(" ");
  }

  function applyIconNode(el, name) {
    const retainedClasses = cleanIconClasses(el);
    el.className = `${retainedClasses} enx-icon enx-iconized`.trim();
    el.dataset.enxIcon = name;
    el.dataset.enxIconized = "true";
    el.setAttribute("aria-hidden", el.getAttribute("aria-hidden") || "true");
    el.innerHTML = `<svg viewBox="0 0 24 24">${ICON_PATHS[name] || ICON_PATHS.sparkles}</svg>`;
  }

  function replaceIconElement(el, name) {
    if (!el || el.dataset.enxIconized === "true") return;
    const span = document.createElement("span");
    Array.from(el.attributes || []).forEach((attr) => {
      if (attr.name === "class") return;
      span.setAttribute(attr.name, attr.value);
    });
    applyIconNode(span, name);
    el.replaceWith(span);
  }

  function normalizeIconElement(el, name) {
    if (!el) return;
    if (el.classList?.contains("enx-icon")) {
      applyIconNode(el, name);
    } else {
      replaceIconElement(el, name);
    }
  }

  function iconNameFromFa(el) {
    const classes = Array.from(el.classList || []);
    for (const cls of classes) if (FA_ICON_MAP[cls]) return FA_ICON_MAP[cls];
    if (classes.some((cls) => cls.startsWith("fab"))) return "share";
    return "sparkles";
  }

  function replaceEmojiText(root) {
    const emojiPattern = /[\u{1F525}\u26A1\u{1F680}\u{1F393}\u{1F3C6}\u{1F916}\u{1F4B0}\u2728\u{1F3AF}]/u;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || /^(SCRIPT|STYLE|TEXTAREA|INPUT)$/i.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
        return emojiPattern.test(node.nodeValue || "") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const fragment = document.createDocumentFragment();
      String(node.nodeValue || "").split(/([\u{1F525}\u26A1\u{1F680}\u{1F393}\u{1F3C6}\u{1F916}\u{1F4B0}\u2728\u{1F3AF}])/u).forEach((part) => {
        if (!part) return;
        if (EMOJI_ICON_MAP[part]) {
          const wrapper = document.createElement("span");
          wrapper.innerHTML = iconMarkup(EMOJI_ICON_MAP[part]);
          fragment.appendChild(wrapper.firstElementChild);
        } else {
          fragment.appendChild(document.createTextNode(part));
        }
      });
      node.replaceWith(fragment);
    });
  }

  let iconObserver = null;
  let iconRefreshQueued = false;
  function refreshIcons(root = document) {
    const scope = root.nodeType === Node.ELEMENT_NODE || root.nodeType === Node.DOCUMENT_NODE ? root : document;
    scope.querySelectorAll?.("i[class*='fa-'], .enx-icon[class*='fa-'], span[class*='fa-']").forEach((el) => normalizeIconElement(el, iconNameFromFa(el)));
    scope.querySelectorAll?.(".enx-icon[data-enx-icon]").forEach((el) => {
      if (el.querySelector?.("svg") && !(el.textContent || "").trim()) return;
      normalizeIconElement(el, el.dataset.enxIcon || "sparkles");
    });
    scope.querySelectorAll?.(".material-symbols-outlined").forEach((el) => {
      const key = String(el.textContent || "").trim();
      normalizeIconElement(el, MATERIAL_ICON_MAP[key] || "sparkles");
    });
    scope.querySelectorAll?.("a, button").forEach((el) => {
      if (el.getAttribute("aria-label") || (el.textContent || "").trim()) return;
      const title = el.getAttribute("title");
      if (title) el.setAttribute("aria-label", title);
    });
    replaceEmojiText(scope);
  }

  function scheduleIconRefresh(root = document) {
    if (iconRefreshQueued) return;
    iconRefreshQueued = true;
    requestAnimationFrame(() => {
      iconRefreshQueued = false;
      refreshIcons(root);
    });
  }

  function observeIconChanges() {
    if (iconObserver || !document.body) return;
    iconObserver = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.addedNodes.length || mutation.type === "attributes" || mutation.type === "characterData")) scheduleIconRefresh(document);
    });
    iconObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"], characterData: true });
  }

  function store() {
    return localStorage.getItem("edunexAccessToken") ? localStorage : sessionStorage;
  }

  function configuredApiBaseUrl() {
    const raw = String(document.querySelector('meta[name="skillomate-api-base-url"]')?.content || "").trim();
    if (!raw) return "";
    try {
      const parsed = new URL(raw);
      if (!/^https?:$/.test(parsed.protocol)) return "";
      return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "").replace(/\/api$/i, "")}`;
    } catch (_) {
      return "";
    }
  }

  const API_BASE_URL = configuredApiBaseUrl();

  function apiUrl(path) {
    const raw = String(path || "").trim();
    if (/^(https?:)?\/\//i.test(raw)) return raw;
    const rooted = `/${raw.replace(/^\/+/, "")}`;
    const apiPath = rooted === "/api" || rooted.startsWith("/api/")
      ? rooted
      : `/api${rooted === "/" ? "" : rooted}`;
    return API_BASE_URL ? `${API_BASE_URL}${apiPath}` : apiPath;
  }

  function getAccessToken() {
    return localStorage.getItem("edunexAccessToken") || sessionStorage.getItem("edunexAccessToken");
  }

  function getRefreshToken() {
    return localStorage.getItem("edunexRefreshToken") || sessionStorage.getItem("edunexRefreshToken");
  }

  function getUser() {
    try {
      const raw = localStorage.getItem("edunexUser") || sessionStorage.getItem("edunexUser");
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function saveAuth(data, remember = true) {
    if (!data?.accessToken) {
      throw new Error("Could not sign in. Please try again.");
    }
    const target = remember ? localStorage : sessionStorage;
    AUTH_KEYS.forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
    if (data.accessToken) target.setItem("edunexAccessToken", data.accessToken);
    if (data.refreshToken) target.setItem("edunexRefreshToken", data.refreshToken);
    if (data.user) target.setItem("edunexUser", JSON.stringify(data.user));
  }

  function clearAuth() {
    try {
      const accountCacheKeys = ["edunexWishlistLocal", "edunexHasCourseAccess", "edunexSignupProfile"];
      const progressKeys = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith("edunexCourseProgress:")) progressKeys.push(key);
      }
      [...accountCacheKeys, ...progressKeys].forEach((key) => localStorage.removeItem(key));
    } catch (_) {}
    AUTH_KEYS.forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
  }

  function isLoginScreen() {
    return /(?:^|\/)(?:login|signup|otp)\.html$/i.test(window.location.pathname);
  }

  function currentPathForNext() {
    return `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
  }

  function loginUrlWithSessionNotice() {
    const params = new URLSearchParams();
    params.set("next", currentPathForNext());
    params.set("session", "different-device");
    return `/login.html?${params.toString()}`;
  }

  function handleSessionRevoked(options = {}) {
    clearAuth();
    try {
      sessionStorage.setItem("edunexSessionNotice", SESSION_ENDED_NOTICE);
    } catch (_) {}
    window.dispatchEvent(new CustomEvent("edunex:auth-revoked", { detail: { message: SESSION_ENDED_NOTICE } }));
    window.dispatchEvent(new Event("edunex:auth-changed"));
    if (options.redirect !== false && !isLoginScreen()) {
      window.location.assign(loginUrlWithSessionNotice());
    }
  }

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers["Content-Type"] && !(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(apiUrl(path), { ...options, headers });
    let data = null;
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    if (text && contentType.includes("application/json")) {
      try {
        data = JSON.parse(text);
      } catch (_) {
        data = null;
      }
    }

    if (!response.ok) {
      const error = new Error(data?.error || data?.message || `Request failed with ${response.status}`);
      error.code = data?.code;
      error.status = response.status;
      throw error;
    }
    return data;
  }

  let refreshInFlight = null;
  async function refreshAccessToken() {
    if (refreshInFlight) return refreshInFlight;
    const original = getRefreshToken();
    if (!original) return null;
    const refresh = async () => {
      // Another tab may have rotated the token while this tab waited for the lock.
      if (getRefreshToken() !== original) return getAccessToken();
      try {
        const data = await request("/api/auth/refresh", {
          method: "POST", body: JSON.stringify({ refreshToken: original }),
        });
        // An older response must not overwrite a newer login or restore a logout.
        if (getRefreshToken() !== original) return getAccessToken();
        if (!data?.accessToken || !data?.refreshToken) throw new Error('Could not refresh your session. Please retry.');
        const target = store();
        target.setItem("edunexAccessToken", data.accessToken);
        target.setItem("edunexRefreshToken", data.refreshToken);
        if (data.user) target.setItem("edunexUser", JSON.stringify(data.user));
        return data.accessToken;
      } catch (error) {
        if (getRefreshToken() !== original) return getAccessToken();
        if (error.status === 401) { handleSessionRevoked(); return null; }
        // Network failures and server errors are not session revocations.
        throw error;
      }
    };
    refreshInFlight = (navigator.locks?.request
      ? navigator.locks.request('edunex-token-refresh', refresh)
      : refresh()).finally(() => { refreshInFlight = null; });
    return refreshInFlight;
  }

  async function authRequest(path, options = {}) {
    const run = (token) => request(path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });

    let token = getAccessToken();
    if (!token) throw new Error("Please log in to continue.");

    try {
      return await run(token);
    } catch (error) {
      if (error.status !== 401) throw error;
      token = await refreshAccessToken();
      if (!token) throw error;
      return run(token);
    }
  }

  let sessionValidationTimer = null;
  let sessionValidationBusy = false;
  async function validateStoredSession() {
    if (sessionValidationBusy) return;
    const token = getAccessToken();
    const user = getUser();
    const userId = user?._id || user?.id;
    if (!token || !userId) return;

    sessionValidationBusy = true;
    try {
      await authRequest(`/api/auth/validate/${encodeURIComponent(userId)}`, { method: "GET" });
    } catch (error) {
      if (error.status === 401 || /session|expired|invalid|log in/i.test(error.message || "")) {
        handleSessionRevoked();
      }
    } finally {
      sessionValidationBusy = false;
    }
  }

  function syncSessionValidation() {
    if (getAccessToken()) {
      if (!sessionValidationTimer) {
        sessionValidationTimer = setInterval(() => {
          if (!document.hidden) validateStoredSession();
        }, 15000);
      }
      return;
    }
    if (sessionValidationTimer) {
      clearInterval(sessionValidationTimer);
      sessionValidationTimer = null;
    }
  }

  function normalizePhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
    return String(value || "").trim();
  }

  function safeNext(defaultPath = "/dashboard.html") {
    const next = new URLSearchParams(window.location.search).get("next");
    if (!next) return defaultPath;
    try {
      const url = new URL(next, window.location.origin);
      return url.origin === window.location.origin ? url.pathname + url.search + url.hash : defaultPath;
    } catch (_) {
      return next.startsWith("/") && !next.startsWith("//") ? next : defaultPath;
    }
  }

  function imageUrl(image) {
    if (!image) return "";
    if (typeof image === "string") return image;
    if (image.data) return `data:${image.mimeType || image.contentType || "image/jpeg"};base64,${image.data}`;
    return "";
  }

  function normalizedImageOptions(options = {}) {
    const source = typeof options === "number" ? { width: options } : options;
    const requestedWidth = Number(source?.width || 0);
    const requestedQuality = Number(source?.quality || 76);
    const width = Number.isFinite(requestedWidth)
      ? Math.max(0, Math.min(1600, Math.round(requestedWidth)))
      : 0;
    const quality = Number.isFinite(requestedQuality)
      ? Math.max(45, Math.min(90, Math.round(requestedQuality)))
      : 76;
    return { width, quality };
  }

  function proxiedImageUrl(rawUrl, options = {}) {
    if (!rawUrl) return "";
    if (/^(data|blob):/i.test(rawUrl)) return rawUrl;

    try {
      const imageOptions = normalizedImageOptions(options);
      const parsed = new URL(rawUrl, window.location.origin);
      if (parsed.origin === window.location.origin) {
        const relativeUrl = `${parsed.pathname}${parsed.search}${parsed.hash}`;
        return parsed.pathname === "/api" || parsed.pathname.startsWith("/api/")
          ? apiUrl(relativeUrl)
          : relativeUrl;
      }
      if (API_BASE_URL && parsed.origin === new URL(API_BASE_URL).origin) return parsed.href;
      const params = new URLSearchParams({ url: parsed.href });
      if (imageOptions.width) {
        params.set("w", String(imageOptions.width));
        params.set("q", String(imageOptions.quality));
      }
      return apiUrl(`/api/image-proxy?${params.toString()}`);
    } catch (_) {
      return rawUrl;
    }
  }

  function normalizeImageSrc(value, options = {}) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    try {
      const imageOptions = normalizedImageOptions(options);
      const parsed = new URL(raw, window.location.origin);
      const localAvatar = parsed.origin === window.location.origin
        ? parsed.pathname.match(/^\/assets\/(male[1-6]|female[1-6])\.jpeg$/i)
        : null;
      if (localAvatar) return `/assets/avatars/${localAvatar[1].toLowerCase()}-v1.webp`;
      const isDrive = /(^|\.)drive\.google\.com$/i.test(parsed.hostname);
      if (!isDrive) return proxiedImageUrl(parsed.href, imageOptions);

      const fileMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
      const id = fileMatch?.[1] || parsed.searchParams.get("id");
      const driveWidth = imageOptions.width || 1200;
      const driveUrl = id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${driveWidth}` : parsed.href;
      return driveUrl;
    } catch (_) {
      return raw;
    }
  }

  function placeholderImage(label = "Skillomate") {
    const clean = String(label || "Skillomate").replace(/[&<>"']/g, "").slice(0, 32);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#F8FAFC"/><rect x="1" y="1" width="1198" height="673" rx="34" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2"/><circle cx="960" cy="120" r="170" fill="rgba(197,139,42,.10)"/><circle cx="210" cy="540" r="210" fill="rgba(197,139,42,.12)"/><text x="72" y="340" fill="#0F172A" font-family="Arial, sans-serif" font-size="54" font-weight="800">${clean}</text><text x="74" y="394" fill="#C58B2A" font-family="Arial, sans-serif" font-size="24" font-weight="700">Skillomate course</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function avatarFallback(user) {
    const label = user?.fullName || user?.name || user?.email || user?.mobileNumber || "E";
    const initial = String(label).trim().charAt(0).toUpperCase() || "E";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" rx="80" fill="#F1F5F9"/><rect x="2" y="2" width="156" height="156" rx="78" fill="#FFFFFF" stroke="#C58B2A" stroke-width="4"/><text x="80" y="96" text-anchor="middle" fill="#C58B2A" font-family="Arial, sans-serif" font-size="62" font-weight="800">${initial}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function injectIndexNavbarStyles() {
    if (document.getElementById("edunex-index-navbar-style")) return;
    const style = document.createElement("style");
    style.id = "edunex-index-navbar-style";
    style.textContent = `
      .navbar {
        position: fixed; top: 0; left: 0; right: 0; z-index: 999;
        background: var(--nav-bg, rgba(0,0,0,0.92));
        backdrop-filter: blur(20px);
        border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
        padding: 16px 0;
      }
      .nav-inner {
        max-width: 1200px; margin: 0 auto; padding: 0 24px;
        display: flex; align-items: center; gap: 32px;
      }
      .nav-logo {
        color: var(--text, #fff);
        white-space: nowrap; flex-shrink: 0; text-decoration: none;
        display: inline-flex; align-items: center;
      }
      .brand-logo {
        display: inline-flex; align-items: center;
        width: clamp(150px, 12vw, 190px); height: 42px; overflow: visible;
      }
      .brand-logo-image {
        display: block; width: 100%; height: auto;
        object-fit: contain; object-position: left center;
      }
      html[data-theme="light"] .brand-logo-image-dark,
      html:not([data-theme="light"]) .brand-logo-image-light { display: none; }
      .nav-links {
        display: flex; align-items: center; gap: 4px;
        flex: 1; justify-content: center; list-style: none; margin: 0; padding: 0;
      }
      .nav-links li { display: flex; align-items: center; }
      .nav-links a {
        padding: 8px 14px; font-size: 0.9rem; font-weight: 500;
        color: var(--text2, #9ca3af); transition: color 0.2s; position: relative;
        text-decoration: none;
      }
      .nav-links a:hover { color: var(--text, #fff); }
      .nav-links a.active { color: var(--text, #fff); font-weight: 600; }
      .nav-links a.active::after {
        content: ''; position: absolute; bottom: 0; left: 14px; right: 14px;
        height: 2px; background: var(--cyan, #C58B2A); border-radius: 2px;
      }
      .nav-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
      .nav-login {
        font-size: 0.9rem; font-weight: 500; color: var(--text2, #9ca3af);
        transition: color 0.2s; text-decoration: none;
      }
      .nav-login:hover { color: var(--cyan, #C58B2A); }
      .nav-avatar {
        width: 36px; height: 36px; border-radius: 50%;
        background: var(--card2, #111318); border: 1px solid var(--border, rgba(255,255,255,0.08));
        display: flex; align-items: center; justify-content: center;
        font-size: 0.85rem; color: var(--gray, #888); cursor: pointer;
        transition: border-color 0.2s, color 0.2s; overflow: hidden; text-decoration: none;
      }
      .nav-avatar:hover, .nav-avatar.active { border-color: var(--cyan, #C58B2A); color: var(--cyan, #C58B2A); }
      .nav-avatar img { width: 100%; height: 100%; object-fit: cover; object-position: center top; display: block; }
      .nav-hamburger {
        display: none; flex-direction: column; gap: 5px;
        background: none; border: none; cursor: pointer; padding: 4px;
      }
      .nav-hamburger span { display: block; width: 22px; height: 2px; background: var(--text, #fff); border-radius: 2px; transition: 0.3s; }
      .edunex-mobile-menu {
        display: none; position: fixed; top: 65px; left: 0; right: 0; z-index: 998;
        background: var(--nav-bg, rgba(0,0,0,0.92));
        border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
        padding: 16px 24px; flex-direction: column; gap: 4px;
      }
      .edunex-mobile-menu a {
        padding: 12px 0; font-size: .95rem; color: var(--text2, #9ca3af);
        border-bottom: 1px solid var(--border, rgba(255,255,255,0.08)); display: block; text-decoration: none;
      }
      .edunex-mobile-menu a.active { color: var(--text, #fff); }
      .edunex-mobile-menu a:last-child { border-bottom: 0; }
      .edunex-mobile-actions { margin-top: 16px; display: flex; gap: 10px; }
      .edunex-mobile-actions a {
        flex: 1; text-align: center; padding: 11px; border-radius: 8px;
        font-size: .9rem; border: 1px solid var(--border, rgba(255,255,255,0.08));
      }
      .edunex-mobile-actions a:last-child {
        background: var(--cyan, #C58B2A); color: #FFFFFF; border-color: transparent; font-weight: 700;
      }
      @media (max-width: 900px) {
        .nav-links, .nav-right { display: none; }
        .nav-hamburger { display: flex; margin-left: auto; }
      }
    `;
    document.head.appendChild(style);
  }

  function renderUserAvatar() {
    const user = getUser();
    const token = getAccessToken();
    document.querySelectorAll('.nav-avatar, a[href$="profile.html"] .avatar, .premium-avatar').forEach((avatar) => {
      if (!token || !user) return;
      const label = user.fullName || user.email || user.mobileNumber || "Account";
      const src = normalizeImageSrc(user.avatar) || avatarFallback(user);
      avatar.setAttribute("title", label);
      avatar.setAttribute("aria-label", label);
      if (avatar.tagName === "IMG") {
        avatar.src = src;
        return;
      }
      avatar.innerHTML = `<img src="${src.replace(/"/g, "&quot;")}" alt="${label.replace(/"/g, "&quot;")}">`;
    });
  }

  function mountIndexNavbar() {
    if (document.querySelector(".react-navbar")) return;
    const existing = document.querySelector("nav.navbar, nav.premium-site-nav");
    if (!existing) return;
    injectIndexNavbarStyles();

    const current = window.location.pathname.split("/").pop() || "index.html";
    const link = (file, label) => `<li><a href="${file}"${current === file ? ' class="active"' : ""}>${label}</a></li>`;
    existing.outerHTML = `
      <nav class="navbar">
        <div class="nav-inner">
          <a href="index.html" class="nav-logo" aria-label="Skillomate AI home">
            <span class="brand-logo">
              <img class="brand-logo-image brand-logo-image-light" src="/assets/skillomate-logo-light-v1.webp" alt="Skillomate" width="480" height="160">
              <img class="brand-logo-image brand-logo-image-dark" src="/assets/skillomate-logo-dark-v1.webp" alt="" aria-hidden="true" width="480" height="160">
            </span>
          </a>
          <ul class="nav-links">
            ${link("index.html", "Home")}
            ${link("courses.html", "Courses")}
            ${link("dashboard.html", "Dashboard")}
            ${link("about.html", "About")}
          </ul>
          <div class="nav-right">
            <a href="login.html" class="nav-login">Login</a>
            <a href="profile.html" class="nav-avatar${current === "profile.html" ? " active" : ""}" title="Profile Settings"><i class="fas fa-user"></i></a>
          </div>
          <button class="nav-hamburger" id="hamburger" aria-label="Menu" aria-expanded="false">
            <span></span><span></span><span></span>
          </button>
        </div>
      </nav>`;

    document.querySelectorAll("#mobileMenu, .premium-mobile-menu, .edunex-mobile-menu").forEach((menu) => menu.remove());
    const mobile = document.createElement("div");
    mobile.id = "mobileMenu";
    mobile.className = "edunex-mobile-menu";
    mobile.innerHTML = `
      <a href="index.html"${current === "index.html" ? ' class="active"' : ""}>Home</a>
      <a href="courses.html"${current === "courses.html" ? ' class="active"' : ""}>Courses</a>
      <a href="dashboard.html"${current === "dashboard.html" ? ' class="active"' : ""}>Dashboard</a>
      <a href="about.html"${current === "about.html" ? ' class="active"' : ""}>About</a>
      <div class="edunex-mobile-actions">
        <a href="login.html" class="nav-login">Login</a>
        <a href="login.html">Get Started</a>
      </div>`;
    document.body.insertBefore(mobile, document.body.firstChild?.nextSibling || document.body.firstChild);

    const hamburger = document.getElementById("hamburger");
    if (hamburger) {
      hamburger.addEventListener("click", (event) => {
        event.stopPropagation();
        const open = mobile.style.display === "flex";
        mobile.style.display = open ? "none" : "flex";
        hamburger.setAttribute("aria-expanded", String(!open));
      });
      document.addEventListener("click", (event) => {
        if (!hamburger.contains(event.target) && !mobile.contains(event.target)) {
          mobile.style.display = "none";
          hamburger.setAttribute("aria-expanded", "false");
        }
      });
    }
  }

  function courseImage(course, options = {}) {
    const embedded =
      imageUrl(course.thumbnailHorizontal) ||
      imageUrl(course.thumbnail) ||
      imageUrl(course.thumbnailVertical) ||
      imageUrl(course.videos?.[0]?.thumbnail);
    const external = course.thumbnailUrl || course.thumbnailHorizontalUrl || course.thumbnailVerticalUrl ||
      course.videos?.[0]?.thumbnailUrl || "";
    return embedded || normalizeImageSrc(external, options) || placeholderImage(course.title || "Skillomate");
  }

  function courseId(course) {
    return course._id || course.id || "";
  }

  function courseDetailHref(courseOrId) {
    const id = typeof courseOrId === "string" ? courseOrId : courseId(courseOrId || {});
    if (!id) return "courses.html";
    return `course.html?id=${encodeURIComponent(id)}`;
  }

  function openCourseDetails(courseOrId) {
    window.location.href = courseDetailHref(courseOrId);
  }

  function courseCategory(course) {
    if (typeof course.category === "string") return course.category;
    return course.category?.name || course.category?.title || "AI Skills";
  }

  async function checkSubscription() {
    return authRequest("/api/payment/subscription-status");
  }

  function hasCourseAccess(subscription) {
    if (typeof subscription?.hasActiveAccess === "boolean") {
      return subscription.hasActiveAccess;
    }
    if (typeof subscription?.accessGranted === "boolean") {
      return subscription.accessGranted;
    }
    const status = String(subscription?.status || subscription?.subscriptionStatus || subscription?.subscriptionDocStatus || "none").toLowerCase();
    const now = Date.now();
    if (["trial_active", "paid_active"].includes(status)) return true;
    if (["trial", "1rs trial", "active", "subscribed"].includes(status)) {
      const end = subscription.trialExpiresAt || subscription.currentPeriodEnd;
      return !end || new Date(end).getTime() > now;
    }
    return false;
  }

  async function openCourse(course) {
    const id = courseId(course);
    if (!id) return;
    const next = `/videos.html?courseId=${encodeURIComponent(id)}`;
    if (!getAccessToken()) {
      window.location.href = `/login.html?next=${encodeURIComponent(next)}`;
      return;
    }

    try {
      const subscription = await checkSubscription();
      window.location.href = hasCourseAccess(subscription)
        ? next
        : `/payment.html?courseId=${encodeURIComponent(id)}&next=${encodeURIComponent(next)}`;
    } catch (_) {
      window.location.href = `/payment.html?courseId=${encodeURIComponent(id)}&next=${encodeURIComponent(next)}`;
    }
  }

  function normalizeLoggedInCtas() {
    const user = getUser();
    const token = getAccessToken();
    if (!token || !user) return;

    const dashboardLabels = /(start learning|get started|join|claim|trial|revolution|login)/i;
    document.querySelectorAll('a[href$="login.html"], button[onclick*="login.html"], .hero-cta-primary, .hero-btn-primary, .trial-btn, .cta-big-btn, .footer-contact-link').forEach((el) => {
      const text = el.textContent || "";
      const href = el.getAttribute?.("href") || "";
      const onclick = el.getAttribute?.("onclick") || "";
      if (!dashboardLabels.test(text) && !/login\.html/.test(href + onclick)) return;
      if (el.tagName === "A") {
        el.setAttribute("href", "dashboard.html");
      } else {
        el.removeAttribute("onclick");
        el.addEventListener("click", () => {
          window.location.href = "dashboard.html";
        }, { once: true });
      }

      if (/login/i.test(text)) el.textContent = "Dashboard";
      else if (/start learning|get started|join|claim|trial|revolution/i.test(text)) {
        el.innerHTML = el.innerHTML.replace(/Start Learning|Get Started for ₹1|Start Your Trial Now|Join the Revolution|Claim Your Trial Now|Claim Trial/gi, "Continue Learning");
      }
    });
  }

  window.EduNex = {
    apiUrl,
    request,
    authRequest,
    refreshAccessToken,
    normalizePhone,
    saveAuth,
    clearAuth,
    handleSessionRevoked,
    getUser,
    getAccessToken,
    safeNext,
    courseImage,
    courseId,
    courseDetailHref,
    openCourseDetails,
    courseCategory,
    openCourse,
    checkSubscription,
    hasCourseAccess,
    applyTheme,
    placeholderImage,
    avatarFallback,
    normalizeImageSrc,
    mountIndexNavbar,
    renderUserAvatar,
    normalizeLoggedInCtas,
    refreshIcons,
    iconMarkup,
  };

  function initializeSharedRuntime() {
    injectThemeStyles();
    applyTheme();
    if (!document.querySelector(".react-navbar")) mountIndexNavbar();
    const user = getUser();
    const token = getAccessToken();
    document.querySelectorAll('a[href$="login.html"], .nav-login, .btn-ghost, .lp-create-row a').forEach((link) => {
      if (!token || !user) return;
      if (/login/i.test(link.textContent || "") || /login\.html$/.test(link.getAttribute("href") || "")) {
        link.textContent = "Dashboard";
        link.setAttribute("href", "dashboard.html");
      }
    });
    normalizeLoggedInCtas();
    renderUserAvatar();
    refreshIcons();
    observeIconChanges();
    syncSessionValidation();
  }

  window.addEventListener("edunex:auth-changed", syncSessionValidation);
  window.addEventListener("storage", syncSessionValidation);
  window.addEventListener("focus", validateStoredSession);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) validateStoredSession();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeSharedRuntime, { once: true });
  } else {
    initializeSharedRuntime();
  }
})();
