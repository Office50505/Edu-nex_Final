import React from "react";
import { createRoot } from "react-dom/client";
import "../js/edunex-api.js";
import App from "./App.jsx";
import "./styles/app.css";
import "./styles/mobile-footer-fix.css";

createRoot(document.getElementById("root")).render(
  <App />
);
