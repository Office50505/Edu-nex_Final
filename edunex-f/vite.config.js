import fs from "node:fs";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const themePreloadSource = fs.readFileSync(new URL("./js/theme-preload.js", import.meta.url), "utf8");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || "http://127.0.0.1:3000";
  const apiBaseUrl = String(env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
  const escapedApiBaseUrl = apiBaseUrl
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const runtimeConfig = [
    `<meta name="skillomate-api-base-url" content="${escapedApiBaseUrl}">`,
    `<script id="skillomate-theme-preload">${themePreloadSource.replace(/<\/script/gi, "<\\/script")}</script>`,
  ].join("\n  ");

  return {
    plugins: [
      react(),
      {
        name: "skillomate-api-runtime-config",
        transformIndexHtml: {
          order: "pre",
          handler(html) {
            return html.replace("<!-- skillomate-runtime-config -->", runtimeConfig);
          },
        },
      },
    ],
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
    server: {
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: true,
        },
        "/uploads": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: true,
        },
      },
    },
    preview: {
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: true,
        },
        "/uploads": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
});
