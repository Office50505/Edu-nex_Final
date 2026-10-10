import React from "react";
import { createRoot } from "react-dom/client";
import "../js/edunex-api.js";
import App from "./App.jsx";
import { initAnalytics } from "./lib/analytics.js";
import "./styles/fonts.css";
import "./styles/app.css";
import "./styles/mobile-footer-fix.css";
import "../css/theme.css";

function loadDeferredAiWidget() {
  void import("../js/nex-ai-widget.js").catch((error) => {
    console.error("Nex AI widget could not be loaded:", error);
  });
}

function scheduleDeferredTask(task, delay, { onUserIntent = true } = {}) {
  let started = false;
  let timer = 0;

  function cleanup() {
    window.clearTimeout(timer);
    window.removeEventListener("pointerdown", run);
    window.removeEventListener("keydown", run);
    window.removeEventListener("touchstart", run);
    window.removeEventListener("load", schedule);
  }

  function run() {
    if (started) return;
    started = true;
    cleanup();
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(task, { timeout: 1500 });
      return;
    }
    window.setTimeout(task, 0);
  }

  function schedule() {
    timer = window.setTimeout(run, delay);
  }

  if (onUserIntent) {
    window.addEventListener("pointerdown", run, { once: true, passive: true });
    window.addEventListener("keydown", run, { once: true });
    window.addEventListener("touchstart", run, { once: true, passive: true });
  }
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}

createRoot(document.getElementById("root")).render(
  <App />
);

scheduleDeferredTask(initAnalytics, 4000);
scheduleDeferredTask(loadDeferredAiWidget, 6000, { onUserIntent: false });
