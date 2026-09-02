const loadedAssets = new Map();

function assetUrl(src) {
  if (!src) return "";
  if (/^(https?:)?\/\//i.test(src) || src.startsWith("data:")) return src;
  return src.startsWith("/") ? src : `/${src}`;
}

function loadScript(src) {
  const url = assetUrl(src);
  if (loadedAssets.has(url)) return loadedAssets.get(url);

  const promise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-legacy-src="${CSS.escape(url)}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = url;
    script.dataset.legacySrc = url;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load ${url}`));
    document.body.appendChild(script);
  });
  loadedAssets.set(url, promise);
  return promise;
}

function loadStylesheet(href) {
  const url = assetUrl(href);
  if (!url || document.querySelector(`link[data-legacy-href="${CSS.escape(url)}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = url;
  link.dataset.legacyHref = url;
  document.head.appendChild(link);
}

function runInlineScript(code) {
  if (!code?.trim()) return;
  try {
    new Function(code);
  } catch (error) {
    console.error("Legacy inline script has invalid syntax:", error);
    return;
  }
  const script = document.createElement("script");
  script.text = code;
  document.body.appendChild(script);
  script.remove();
}

function refreshSharedRuntime() {
  window.EduNex?.applyTheme?.();
  window.EduNex?.renderUserAvatar?.();
  window.EduNex?.refreshIcons?.();
  applyAccessibilityRefinements();
}

function isHidden(element) {
  if (!(element instanceof HTMLElement)) return true;
  if (element.hidden || element.getAttribute("aria-hidden") === "true") return true;
  const style = window.getComputedStyle(element);
  return style.display === "none" || style.visibility === "hidden";
}

function visibleText(element) {
  return String(element?.textContent || "").replace(/\s+/g, " ").trim();
}

function hasAccessibleName(element) {
  if (!element) return false;
  if (element.getAttribute("aria-label")?.trim()) return true;
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy && labelledBy.split(/\s+/).some((id) => document.getElementById(id)?.textContent?.trim())) return true;
  if (element.id && document.querySelector(`label[for="${CSS.escape(element.id)}"]`)) return true;
  return Boolean(visibleText(element));
}

function labelFromControl(control) {
  const id = control.id || "";
  const name = control.getAttribute("name") || "";
  const placeholder = control.getAttribute("placeholder") || "";
  const type = control.getAttribute("type") || control.tagName.toLowerCase();
  const className = control.className || "";
  const map = [
    [/email/i, "Email address"],
    [/pass/i, "Password"],
    [/confirm/i, "Confirm password"],
    [/phone|mobile|tel/i, "Phone number"],
    [/search|query|q$/i, "Search"],
    [/otp|code/i, "One-time password digit"],
    [/name/i, "Name"],
    [/chat|message|nai-input/i, "Message"],
    [/volume/i, "Volume"],
  ];
  const source = `${id} ${name} ${className} ${type}`;
  const found = map.find(([pattern]) => pattern.test(source));
  if (found) return found[1];
  if (placeholder && !/^[•–-]+$/.test(placeholder.trim())) return placeholder;
  return type === "search" ? "Search" : "Input";
}

function ensureHiddenLabel(control, index = 0) {
  if (hasAccessibleName(control)) return;
  if (control.type === "hidden" || isHidden(control)) return;
  if (!control.id) control.id = `enx-control-${Date.now()}-${index}`;
  const label = document.createElement("label");
  label.className = "sr-only";
  label.htmlFor = control.id;
  label.textContent = labelFromControl(control);
  control.insertAdjacentElement("beforebegin", label);
}

function buttonLabel(button) {
  const id = button.id || "";
  const cls = button.className || "";
  const action = button.dataset?.action || "";
  const source = `${id} ${cls} ${action}`.toLowerCase();
  if (/close|times|x\b/.test(source)) return "Close";
  if (/search/.test(source)) return "Search";
  if (/send|paper-plane|arrow-up/.test(source)) return "Send message";
  if (/wish|heart/.test(source)) return "Save to wishlist";
  if (/remove|trash/.test(source)) return "Remove";
  if (/prev|previous|left/.test(source)) return "Previous";
  if (/next|right/.test(source)) return "Next";
  if (/play|toggle/.test(source)) return "Play or pause";
  if (/mute|volume/.test(source)) return "Mute or unmute";
  if (/caption/.test(source)) return "Toggle captions";
  if (/fullscreen|expand/.test(source)) return "Fullscreen";
  if (/share/.test(source)) return "Share";
  if (/save|bookmark/.test(source)) return "Save";
  if (/menu|hamburger/.test(source)) return "Menu";
  if (/attach/.test(source)) return "Attach file";
  if (/mic|voice/.test(source)) return "Voice input";
  if (/avatar/.test(source)) return "Choose avatar";
  return "Button";
}

function refineButtons(root) {
  root.querySelectorAll("button").forEach((button) => {
    if (!button.hasAttribute("type") && !button.closest("form")) button.type = "button";
    if (!hasAccessibleName(button)) button.setAttribute("aria-label", buttonLabel(button));
  });
}

function refineInputs(root) {
  root.querySelectorAll("input, textarea, select").forEach((control, index) => {
    ensureHiddenLabel(control, index);
  });
}

function mapHashLink(anchor) {
  const text = visibleText(anchor).toLowerCase();
  const label = anchor.getAttribute("aria-label")?.toLowerCase() || "";
  if (/privacy/.test(text)) return "privacy.html";
  if (/terms|service/.test(text)) return "terms.html";
  if (/help|support|contact/.test(text)) return "help.html";
  if (/course|catalog|guide/.test(text)) return "courses.html";
  if (/login|sign in/.test(text)) return "login.html";
  if (/signup|get started|journey/.test(text)) return "signup.html";
  if (/instagram|linkedin|youtube|twitter|discord/.test(label)) return "";
  return "";
}

function labelFromIconOnlyLink(anchor) {
  const html = anchor.innerHTML || "";
  if (/fa-twitter/i.test(html)) return "Twitter";
  if (/fa-linkedin/i.test(html)) return "LinkedIn";
  if (/fa-youtube/i.test(html)) return "YouTube";
  if (/fa-instagram/i.test(html)) return "Instagram";
  if (/fa-discord/i.test(html)) return "Discord";
  if (/fa-facebook/i.test(html)) return "Facebook";
  if (/fa-github/i.test(html)) return "GitHub";
  if (/fa-envelope|mail/i.test(html)) return "Email";
  return "";
}

function refineLinks(root) {
  root.querySelectorAll("a").forEach((anchor) => {
    if (!hasAccessibleName(anchor)) {
      const label = labelFromIconOnlyLink(anchor);
      if (label) anchor.setAttribute("aria-label", label);
    }
  });
  root.querySelectorAll('a[href="#"]').forEach((anchor) => {
    const mapped = mapHashLink(anchor);
    if (mapped) {
      anchor.href = mapped;
      return;
    }
    if (anchor.getAttribute("onclick")) {
      anchor.removeAttribute("href");
      anchor.setAttribute("role", "button");
      anchor.tabIndex = 0;
      return;
    }
    anchor.removeAttribute("href");
    anchor.setAttribute("aria-disabled", "true");
    anchor.tabIndex = -1;
  });
}

function refineClickableNonControls(root) {
  root.querySelectorAll("[onclick]").forEach((element) => {
    if (/^(A|BUTTON|INPUT|SELECT|TEXTAREA|LABEL)$/i.test(element.tagName)) return;
    if (!element.hasAttribute("role")) element.setAttribute("role", "button");
    if (!element.hasAttribute("tabindex")) element.tabIndex = 0;
    if (element.dataset.enxKeyboardClick === "true") return;
    element.dataset.enxKeyboardClick = "true";
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        element.click();
      }
    });
  });
}

function refineTabs(root) {
  root.querySelectorAll('[role="tablist"]').forEach((tablist) => {
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"], .home-hero-tab, .library-tab, .filter-tab, .cert-tab'));
    tabs.forEach((tab) => {
      tab.setAttribute("role", "tab");
      const selected = tab.classList.contains("active") || tab.classList.contains("is-active") || tab.classList.contains("selected");
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    if (tablist.dataset.enxTabsReady === "true") return;
    tablist.dataset.enxTabsReady = "true";
    tablist.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const currentTabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
      const current = currentTabs.indexOf(document.activeElement);
      if (current < 0) return;
      event.preventDefault();
      const nextIndex = event.key === "Home" ? 0
        : event.key === "End" ? currentTabs.length - 1
        : event.key === "ArrowRight" ? (current + 1) % currentTabs.length
        : (current - 1 + currentTabs.length) % currentTabs.length;
      currentTabs[nextIndex]?.focus();
      currentTabs[nextIndex]?.click();
    });
  });
}

function refinePaymentPlans(root) {
  const selector = root.querySelector("#planSelector");
  if (!selector) return;
  selector.setAttribute("role", "radiogroup");
  selector.setAttribute("aria-label", "Choose subscription plan");
  selector.querySelectorAll(".plan-option").forEach((option) => {
    option.setAttribute("role", "radio");
    const input = option.querySelector('input[type="radio"]');
    option.setAttribute("aria-checked", String(Boolean(input?.checked || option.classList.contains("selected"))));
    if (!option.hasAttribute("tabindex")) option.tabIndex = 0;
  });
}

function refineLiveRegions(root) {
  root.querySelectorAll(".lp-err, .sp-err, .nai-setup-error").forEach((node) => {
    node.setAttribute("role", "alert");
    node.setAttribute("aria-live", "assertive");
  });
  root.querySelectorAll(".pay-msg, .ep-toast, .pf-toast, .hero-carousel-shell, #chatMessages, #nai-messages").forEach((node) => {
    node.setAttribute("aria-live", "polite");
  });
}

function refineDialogs(root) {
  root.querySelectorAll('[role="dialog"]').forEach((dialog) => {
    if (!dialog.hasAttribute("aria-labelledby") && !dialog.hasAttribute("aria-label")) {
      const title = dialog.querySelector("h1,h2,h3,.chat-title,.payment-choice-title,.sp-ava-modal-title");
      if (title) {
        if (!title.id) title.id = `enx-dialog-title-${Date.now()}`;
        dialog.setAttribute("aria-labelledby", title.id);
      }
    }
  });
}

export function applyAccessibilityRefinements(root = document) {
  refineButtons(root);
  refineInputs(root);
  refineLinks(root);
  refineClickableNonControls(root);
  refineTabs(root);
  refinePaymentPlans(root);
  refineLiveRegions(root);
  refineDialogs(root);
}

export function runLegacyPage(page) {
  let cancelled = false;
  let observer = null;
  let raf = 0;

  page.stylesheets?.forEach(loadStylesheet);

  (async () => {
    for (const item of page.scripts || []) {
      if (cancelled) return;
      if (item.src) {
        await loadScript(item.src);
      } else {
        runInlineScript(item.code);
      }
    }
    if (!cancelled) {
      refreshSharedRuntime();
      observer = new MutationObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => applyAccessibilityRefinements());
      });
      observer.observe(document.querySelector(".react-page-root") || document.body, {
        childList: true,
        subtree: true,
      });
      window.dispatchEvent(new Event("edunex:page-ready"));
    }
  })().catch((error) => {
    console.error("Legacy page script failed:", error);
  });

  return () => {
    cancelled = true;
    observer?.disconnect();
    cancelAnimationFrame(raf);
  };
}
