import fs from "node:fs";
import path from "node:path";
import { route } from "../src/lib/routes.js";

const root = process.cwd();
const dist = path.join(root, "dist");
const marketingOut = path.join(root, "marketing-web", "out");
const marketingDist = path.join(dist, "static-pages", "skillomate-ai-influencer-courseweb");

const staticPaths = [
  "_redirects",
  "assets",
  "css",
  "js",
  "main.css",
  "mock.png",
  "motion.css",
  "motion.js",
  "premium-nav.css",
  "premium-nav.js",
];

function copyMarketingExport() {
  if (!fs.existsSync(marketingOut)) return;
  fs.rmSync(marketingDist, { recursive: true, force: true });
  fs.mkdirSync(marketingDist, { recursive: true });
  fs.cpSync(marketingOut, marketingDist, { recursive: true, force: true });
}

function assertMarketingExport() {
  const marketingIndex = path.join(marketingDist, "index.html");
  if (!fs.existsSync(marketingIndex)) {
    throw new Error(`Marketing export is missing: ${marketingIndex}`);
  }
  const html = fs.readFileSync(marketingIndex, "utf8");
  if (!html.includes("premium-reel-stage") || html.includes("skillomate-api-base-url")) {
    throw new Error("Marketing courseweb route contains the app shell instead of the marketing export.");
  }
}

fs.rmSync(path.join(dist, "admin"), { recursive: true, force: true });

for (const item of staticPaths) {
  const from = path.join(root, item);
  const to = path.join(dist, item);
  if (!fs.existsSync(from)) continue;

  if (item !== "assets") {
    fs.rmSync(to, { recursive: true, force: true });
  }
  fs.cpSync(from, to, { recursive: true, force: true });
}

copyMarketingExport();

const indexHtml = path.join(dist, "index.html");
const legacyDir = path.join(root, "legacy-html");

if (fs.existsSync(indexHtml) && fs.existsSync(legacyDir)) {
  const shell = fs.readFileSync(indexHtml, "utf8");
  for (const file of fs.readdirSync(legacyDir)) {
    if (!file.endsWith(".html") || file === "react-index.html" || file === "index.html") continue;
    fs.writeFileSync(path.join(dist, file), shell);
    const cleanRoute = route(file).replace(/[?#].*$/, "");
    if (cleanRoute !== "/" && cleanRoute.startsWith("/")) {
      const cleanRouteDir = path.join(dist, cleanRoute.replace(/^\/+/, ""));
      fs.mkdirSync(cleanRouteDir, { recursive: true });
      fs.writeFileSync(path.join(cleanRouteDir, "index.html"), shell);
    }
  }
}

// React-only operational pages have no legacy HTML source.
if (fs.existsSync(indexHtml)) {
  const reactOnlyRoutes = [
    'account-deletion',
    'ai',
    'admin/certifications',
    'admin/system-health',
    'admin/reports',
    'contact',
    'cookie-policy',
    'delete-account',
    'pricing',
    'refund-policy',
    'shipping-policy',
    'subscription-policy',
  ];

  for (const routePath of reactOnlyRoutes) {
    const routeDir = path.join(dist, routePath);
    fs.mkdirSync(routeDir, { recursive: true });
    fs.copyFileSync(indexHtml, path.join(routeDir, 'index.html'));
  }
}

copyMarketingExport();
assertMarketingExport();
console.log("Copied static frontend assets and route shells into dist.");
