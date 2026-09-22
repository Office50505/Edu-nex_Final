import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LegalLayout } from "../../src/components/legal/LegalLayout.jsx";

const appStyles = readFileSync(new URL("../../src/styles/app.css", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const legalStyles = readFileSync(new URL("../../src/components/legal/LegalPages.css", import.meta.url), "utf8");
const dashboardLegacySource = readFileSync(new URL("../../legacy-html/dashboard.html", import.meta.url), "utf8");
const homePageSource = readFileSync(new URL("../../src/pages/HomePage.jsx", import.meta.url), "utf8");
const dashboardPageSource = readFileSync(new URL("../../src/pages/DashboardPage.jsx", import.meta.url), "utf8");
const videosPageSource = readFileSync(new URL("../../src/pages/VideosPage.jsx", import.meta.url), "utf8");

describe("cross-viewport UX", () => {
  it("stops document overscroll at the footer across the website", () => {
    expect(appStyles).toMatch(/html \{[\s\S]*height: 100%;[\s\S]*overscroll-behavior: none;/);
    expect(appStyles).toMatch(/body \{[\s\S]*overflow-x: clip;[\s\S]*overscroll-behavior: none;/);
    expect(appStyles).toMatch(/#root \{[\s\S]*display: flex;[\s\S]*min-height: 100dvh;[\s\S]*flex-direction: column;/);
    expect(appStyles).toMatch(/\.react-page-root \{[\s\S]*width: 100%;[\s\S]*flex: 1 0 auto;/);
  });

  it("keeps the complete Skillomate wordmark visible during initial page loading", () => {
    expect(indexHtml).toContain('background:#000');
    expect(indexHtml).toContain('src="/assets/skillomate-logo-dark.png"');
  });

  it("exposes the page key used by route-specific responsive rules", () => {
    const markup = renderToStaticMarkup(<LegalLayout title="Pricing" pageKey="pricing.html">Plans</LegalLayout>);
    expect(markup).toContain('data-page="pricing.html"');
  });

  it("stacks pricing cards before tablet cards become cramped", () => {
    expect(legalStyles).toMatch(/@media \(max-width: 840px\)[\s\S]*\.pricing-plan-grid[\s\S]*grid-template-columns: 1fr;/);
    expect(legalStyles).toMatch(/@media \(max-width: 1180px\)[\s\S]*\.legal-shell[\s\S]*grid-template-columns: 1fr;/);
    expect(legalStyles).toMatch(/@container \(max-width: 720px\)[\s\S]*\.pricing-plan-grid[\s\S]*grid-template-columns: 1fr;/);
  });

  it("contains the AI workspace on tablet, phone, and short viewports", () => {
    expect(appStyles).toMatch(/@media \(min-width: 901px\) and \(max-width: 1200px\)[\s\S]*data-page="ai-tutor\.html"[\s\S]*\.tutor-sidebar/);
    expect(appStyles).toMatch(/@media \(max-width: 520px\)[\s\S]*\.chat-input-area[\s\S]*calc\(100% - 12px\)/);
    expect(appStyles).toMatch(/Keep the AI composer floating cleanly[\s\S]*\.tutor-chat[\s\S]*border: 0 !important;[\s\S]*\.chat-input-area:focus-within[\s\S]*box-shadow: none !important;/);
    expect(appStyles).toMatch(/@media \(max-width: 900px\) and \(max-height: 700px\)[\s\S]*\.tutor-welcome-avatar/);
  });

  it("keeps mobile carousel actions inside the course cards", () => {
    expect(appStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*data-page="index\.html"\] \.hero-course-card[\s\S]*height: 460px !important;/);
  });

  it("keeps both mobile hero typography lines inside the viewport", () => {
    expect(appStyles).toMatch(/@media \(max-width: 700px\)[\s\S]*\.learning-hero-copy[\s\S]*width: 100% !important;[\s\S]*padding-right: 16px !important;/);
    expect(appStyles).toMatch(/@media \(max-width: 700px\)[\s\S]*\.learning-hero h1[\s\S]*font-size: clamp\(24px, 8vw, 32px\) !important;/);
    expect(appStyles).toMatch(/@media \(max-width: 700px\)[\s\S]*\.learning-hero-copy > p[\s\S]*max-width: 340px !important;[\s\S]*overflow-wrap: anywhere !important;/);
  });

  it("renders the learning journey as connected stages instead of arrow buttons", () => {
    expect(homePageSource).not.toContain('className="journey-arrow"');
    expect(appStyles).toMatch(/\.journey-step:not\(:last-child\)::after \{[\s\S]*content: "→";/);
    expect(appStyles).toMatch(/@media \(max-width: 1120px\)[\s\S]*\.journey-step:not\(:last-child\)::after[\s\S]*content: "↓";/);
    expect(appStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*\.journey-strip \{[\s\S]*gap: 32px !important;/);
    expect(appStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*\.journey-strip \.journey-step \{[\s\S]*width: min\(100%, 280px\) !important;[\s\S]*align-self: center !important;/);
    expect(appStyles).toMatch(/\.journey-step \.journey-number \{[\s\S]*grid-row: 1 \/ span 2;[\s\S]*align-self: center;/);
  });

  it("groups the mobile lecture drawer into pages of twenty", () => {
    expect(videosPageSource).toContain("const LECTURES_PER_SHEET_PAGE = 20;");
    expect(appStyles).toMatch(/\.reel-lecture-sheet[\s\S]*height: min\(540px, calc\(100dvh - 16px\)\);[\s\S]*overflow: hidden;/);
    expect(appStyles).toMatch(/\.reel-lecture-grid[\s\S]*grid-template-rows: repeat\(4, minmax\(0, 1fr\)\);/);
    expect(appStyles).toMatch(/data-theme="light"[\s\S]*\.reel-lecture-sheet \.reel-sheet-header h2[\s\S]*-webkit-text-fill-color: #fff !important;/);
    expect(appStyles).toMatch(/\.reel-lecture-sheet[\s\S]*backdrop-filter: blur\(26px\) saturate\(145%\);/);
    expect(appStyles).toMatch(/\.reel-lecture-sheet::before[\s\S]*linear-gradient\(90deg, transparent, rgba\(255, 255, 255, \.58\), rgba\(197, 139, 42, \.62\), transparent\)/);
  });

  it("fills the mobile viewport and crops portrait video without side bars", () => {
    expect(appStyles).toMatch(/body\.has-edunex-mobile-reel #root[\s\S]*width: 100vw !important;[\s\S]*height: 100dvh !important;/);
    expect(appStyles).toMatch(/body\.has-edunex-mobile-reel[\s\S]*:where\(\.sm-player > video, \.custom-video-player > video\)[\s\S]*object-fit: cover !important;/);
  });

  it("keeps the minimized mobile lesson clear and above the fixed navigation", () => {
    expect(videosPageSource).toContain('is-mobile-player-minimized');
    expect(videosPageSource).toContain('watchPage.scrollTop = 0');
    expect(videosPageSource).not.toContain('playerFrameRef.current?.scrollIntoView');
    expect(appStyles).toMatch(/body:has\(\.react-page-root\[data-page="videos\.html"\]\.is-mobile-player-minimized\) \{[\s\S]*height: 100dvh !important;[\s\S]*overflow: hidden !important;/);
    expect(appStyles).toMatch(/\.is-mobile-player-minimized \{[\s\S]*flex: 0 0 calc\(100dvh - var\(--mobile-nav-height\) - var\(--mobile-safe-bottom\)\) !important;[\s\S]*max-height: calc\(100dvh - var\(--mobile-nav-height\) - var\(--mobile-safe-bottom\)\) !important;[\s\S]*overflow: hidden !important;/);
    expect(appStyles).toMatch(/\.is-mobile-player-minimized \.watch-page \{[\s\S]*height: 100% !important;[\s\S]*overflow-y: auto !important;[\s\S]*padding: 82px 12px 28px !important;[\s\S]*scrollbar-width: none;/);
    expect(appStyles).toMatch(/\.is-mobile-player-minimized \.course-progress \.course-progress__heading h2 \{[\s\S]*font-size: 1\.05rem !important;/);
    expect(appStyles).toMatch(/\.is-mobile-player-minimized \.lesson-info > p \{[\s\S]*color: rgba\(255, 255, 255, \.76\) !important;/);
  });

  it("uses the mobile reel actions and simplified player controls on desktop", () => {
    expect(appStyles).toMatch(/@media \(min-width: 1181px\), \(min-width: 821px\) and \(pointer: fine\)[\s\S]*#playerFrame \.reel-chrome[\s\S]*display: block;/);
    expect(appStyles).toMatch(/#playerFrame \.sm-row > :not\(\.sm-play-button\):not\(\.sm-volume-button\):not\(\.sm-volume\):not\(\.sm-spacer\):not\(\.sm-settings-button\):not\(\.sm-fullscreen-button\)[\s\S]*display: none !important;/);
    expect(appStyles).toMatch(/#playerFrame \.video-speed[\s\S]*display: none !important;/);
    expect(videosPageSource).toContain('aria-label="Open lecture notes"');
    expect(videosPageSource).toContain('aria-label="Report a problem"');
    expect(videosPageSource).toContain('aria-label="Open AI chat for this lecture"');
    expect(videosPageSource).toContain('aria-label="Open all lectures"');
  });

  it("hides the entire reel overlay with timed player controls and raises side actions", () => {
    expect(videosPageSource).toContain('reel-chrome${playerControlsVisible ? " is-visible" : ""}');
    expect(videosPageSource).toContain("onControlsVisibilityChange={handlePlayerControlsVisibility}");
    expect(appStyles).toMatch(/\.reel-chrome \{[\s\S]*visibility: hidden;[\s\S]*opacity: 0;/);
    expect(appStyles).toMatch(/\.reel-chrome\.is-visible \{[\s\S]*visibility: visible;[\s\S]*opacity: 1;/);
    expect(appStyles).toMatch(/\.player-frame:has\(\.sm-player:not\(\.sm-awake\):not\(:has\(:focus-visible\)\)\) \.reel-chrome[\s\S]*visibility: hidden;[\s\S]*opacity: 0;/);
    expect(appStyles).toMatch(/\.player-frame:has\(\.custom-video-player\.is-playing:not\(\.is-controls-awake\)\) \.reel-chrome[\s\S]*visibility: hidden;[\s\S]*opacity: 0;/);
    expect(appStyles).toMatch(/\.reel-side-actions[\s\S]*bottom: max\(150px, calc\(134px \+ env\(safe-area-inset-bottom\)\)\);/);
    expect(videosPageSource).toContain('className="video-paused-indicator"');
  });

  it("lets desktop lesson details use the full player card width", () => {
    expect(appStyles).toMatch(/data-page="videos\.html"\] \.lesson-info > p,[\s\S]*\.lesson-info > \.example-prompt-drawer[\s\S]*width: 100%;[\s\S]*max-width: none;/);
  });

  it("does not force the mobile profile navbar to black in light theme", () => {
    expect(appStyles).toContain('html:not([data-theme="light"]):has(.react-page-root[data-page="profile.html"]) .enx-navbar');
    expect(appStyles).not.toContain('html:has(.react-page-root[data-page="profile.html"]) .enx-navbar');
  });

  it("keeps the mobile navbar search readable between the logo and account actions", () => {
    expect(appStyles).toMatch(/@media \(max-width: 820px\)[\s\S]*\.enx-nav-logo \.brand-logo[\s\S]*width: clamp\(108px, 30vw, 122px\) !important;/);
    expect(appStyles).toMatch(/@media \(max-width: 820px\)[\s\S]*\.enx-mobile-top-search[\s\S]*grid-template-columns: minmax\(0, 1fr\) 38px !important;[\s\S]*max-width: none !important;/);
    expect(appStyles).toMatch(/\.enx-mobile-top-search-field:focus-within[\s\S]*border-color: rgba\(197, 139, 42, \.7\) !important;/);
  });

  it("keeps dashboard stats in one mobile row after removing learning history", () => {
    expect(appStyles).toMatch(/data-page="dashboard\.html"\] :where\(\.stats-row\)[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) !important;/);
    expect(dashboardPageSource).not.toContain("Learning History");
  });

  it("keeps dashboard recommendation badges readable over thumbnails", () => {
    expect(dashboardLegacySource).toMatch(/\.rec-badge[\s\S]*z-index: 2;[\s\S]*padding: 5px 10px;[\s\S]*white-space: nowrap;/);
    expect(dashboardLegacySource).toMatch(/\.badge-mono \{ background: var\(--cyan\);[\s\S]*color: #050505;[\s\S]*box-shadow:/);
  });

  it("keeps report dialog actions vivid and readable", () => {
    expect(appStyles).toMatch(/\.problem-report-cancel \{[\s\S]*background: rgba\(255, 255, 255, \.08\);[\s\S]*color: #F8FAFC;/);
    expect(appStyles).toMatch(/\.problem-report-submit \{[\s\S]*background: linear-gradient\(135deg, #EF4444, #DC2626\);[\s\S]*box-shadow:/);
    expect(appStyles).toMatch(/\.problem-report-dialog button:disabled \{[\s\S]*opacity: \.72;/);
  });

  it("keeps the mobile curriculum thumbnail aligned at its native ratio", () => {
    expect(appStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*\.curriculum-overview \{[\s\S]*grid-template-columns: 114px minmax\(0, 1fr\)/);
    expect(appStyles).toMatch(/\.curriculum-overview > img \{[\s\S]*width: 114px !important;[\s\S]*height: 64px !important;[\s\S]*aspect-ratio: 16 \/ 9 !important;[\s\S]*object-fit: cover !important;/);
  });

  it("keeps reel controls from bleeding through the mobile settings panel", () => {
    expect(appStyles).toMatch(/\.player-frame:has\(\.sm-settings\) \.reel-chrome[\s\S]*visibility: hidden;/);
    expect(appStyles).toMatch(/\.sm-settings[\s\S]*z-index: 40 !important;[\s\S]*max-height: min\(420px, calc\(100dvh - 150px\)\) !important;/);
  });

  it("omits the retired skills, modules, and projects homepage sections", () => {
    expect(homePageSource).not.toContain("Explore by Skill");
    expect(homePageSource).not.toContain("View All Skills");
    expect(homePageSource).not.toContain("View Course Curriculum");
    expect(homePageSource).not.toContain("Build These Projects");
    expect(homePageSource).not.toContain("View All Projects");
  });
});
