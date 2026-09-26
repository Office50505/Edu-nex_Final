import React from "react";
import { createRoot } from "react-dom/client";
import "../js/edunex-api.js";
import App from "./App.jsx";
import "./styles/fonts.css";
import "./styles/app.css";
import "./styles/mobile-footer-fix.css";
import "../css/theme.css";

function loadDeferredAiWidget() {
  void import("../js/nex-ai-widget.js").catch((error) => {
    console.error("Nex AI widget could not be loaded:", error);
  });
}

function scheduleDeferredAiWidget() {
  const schedule = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(loadDeferredAiWidget, { timeout: 3000 });
      return;
    }
    window.setTimeout(loadDeferredAiWidget, 1500);
  };

  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}

createRoot(document.getElementById("root")).render(
  <App />
);

scheduleDeferredAiWidget();
