import forms from "@tailwindcss/forms";
import containerQueries from "@tailwindcss/container-queries";

export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
    "./legacy-html/**/*.html",
    "./js/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0A0A0A",
        surface: "#131313",
        "surface-container": "#201f1f",
        "surface-container-high": "#2a2a2a",
        "surface-container-highest": "#353534",
        "on-surface": "#e5e2e1",
        "on-surface-variant": "#bbc9cd",
        outline: "#869397",
        "outline-variant": "#3c494c",
        primary: "#C58B2A",
        "primary-container": "#F3E4C8",
        "on-primary": "#FFFDF8",
        "on-primary-container": "#332820",
      },
      borderRadius: {
        DEFAULT: "1rem",
        lg: "2rem",
        xl: "3rem",
        full: "9999px",
      },
      spacing: {
        "margin-desktop": "clamp(32px, 5vw, 72px)",
        "margin-mobile": "16px",
        "container-max": "1480px",
        gutter: "24px",
      },
      fontFamily: {
        body: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [forms, containerQueries],
};
