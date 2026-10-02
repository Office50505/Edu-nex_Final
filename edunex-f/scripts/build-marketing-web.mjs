import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const frontendRoot = process.cwd();
const marketingRoot = path.join(frontendRoot, "marketing-web");
const packageJson = path.join(marketingRoot, "package.json");
const packageLock = path.join(marketingRoot, "package-lock.json");

if (!fs.existsSync(packageJson)) {
  console.log("No marketing-web app found; skipping marketing export.");
  process.exit(0);
}

if (fs.existsSync(packageLock)) {
  const install = spawnSync("npm", ["ci", "--no-audit", "--no-fund"], {
    cwd: marketingRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (install.status !== 0) {
    process.exit(install.status ?? 1);
  }
}

const result = spawnSync("npm", ["run", "build"], {
  cwd: marketingRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
