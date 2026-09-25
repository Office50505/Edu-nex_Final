import fs from "node:fs";
import path from "node:path";
import { route } from "../src/lib/routes.js";

const root = process.cwd();
const dist = path.join(root, "dist");

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

const indexHtml = path.join(dist, "index.html");
const legacyDir = path.join(root, "legacy-html");

if (fs.existsSync(indexHtml) && fs.existsSync(legacyDir)) {
  const shell = fs.readFileSync(indexHtml, "utf8");
  for (const file of fs.readdirSync(legacyDir)) {
    if (!file.endsWith(".html") || file === "react-index.html" || file === "index.html") continue;
    fs.writeFileSync(path.join(dist, file), shell);
    const cleanRoute = route(file);
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
console.log("Copied static frontend assets and route shells into dist.");
