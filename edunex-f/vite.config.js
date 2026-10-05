import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const themePreloadSource = fs.readFileSync(new URL("./js/theme-preload.js", import.meta.url), "utf8");
const marketingOutDir = path.resolve(projectRoot, "marketing-web", "out");
const marketingStaticBasePath = "/static-pages/skillomate-ai-influencer-courseweb";
const malformedMarketingNextPath = "/static-pages/skillomate-ai-influencer-courseweb_next";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function sendMarketingFile(response, filePath) {
  response.statusCode = 200;
  response.setHeader("Content-Type", contentTypes[path.extname(filePath)] || "application/octet-stream");
  fs.createReadStream(filePath).pipe(response);
}

function resolveMarketingFile(requestUrl = "") {
  if (!requestUrl.startsWith(marketingStaticBasePath)) return null;
  if (!fs.existsSync(marketingOutDir)) return null;

  const url = new URL(requestUrl, "http://127.0.0.1");
  const relativePath = decodeURIComponent(url.pathname.slice(marketingStaticBasePath.length).replace(/^\/+/, ""));
  const candidates = relativePath
    ? [
        path.join(marketingOutDir, relativePath),
        path.join(marketingOutDir, relativePath, "index.html"),
      ]
    : [path.join(marketingOutDir, "index.html")];

  for (const candidate of candidates) {
    const normalized = path.resolve(candidate);
    if (!normalized.startsWith(marketingOutDir)) continue;
    if (fs.existsSync(normalized) && fs.statSync(normalized).isFile()) return normalized;
  }

  return path.join(marketingOutDir, "404.html");
}

function useMarketingWeb(server) {
  server.middlewares.use((request, response, next) => {
    if (request.url?.startsWith(malformedMarketingNextPath)) {
      response.statusCode = 301;
      response.setHeader("Location", request.url.replace(malformedMarketingNextPath, `${marketingStaticBasePath}/_next`));
      response.end();
      return;
    }

    if (request.url?.startsWith("/marketing-web.html")) {
      response.statusCode = 301;
      response.setHeader("Location", `${marketingStaticBasePath}/#paywall`);
      response.end();
      return;
    }

    if (request.url?.startsWith("/marketing-web")) {
      response.statusCode = 301;
      response.setHeader("Location", `${marketingStaticBasePath}/#paywall`);
      response.end();
      return;
    }

    const marketingFile = resolveMarketingFile(request.url);
    if (marketingFile && fs.existsSync(marketingFile)) {
      sendMarketingFile(response, marketingFile);
      return;
    }

    next();
  });
}

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
        name: "skillomate-marketing-web-html-redirect",
        configureServer: useMarketingWeb,
        configurePreviewServer: useMarketingWeb,
      },
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
