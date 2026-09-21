import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || "http://127.0.0.1:3000";
  const apiBaseUrl = String(env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");

  return {
    plugins: [
      react(),
      {
        name: "skillomate-api-runtime-config",
        transformIndexHtml: {
          order: "pre",
          handler() {
            return [{
              tag: "meta",
              attrs: { name: "skillomate-api-base-url", content: apiBaseUrl },
              injectTo: "head-prepend",
            }];
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
