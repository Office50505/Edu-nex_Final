import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const frontendRoot = process.cwd();
const repoRoot = path.resolve(frontendRoot, "..");
const marketingRoot = path.join(repoRoot, "marketing-web");
const packageJson = path.join(marketingRoot, "package.json");

if (!fs.existsSync(packageJson)) {
  console.log("No marketing-web app found; skipping marketing export.");
  process.exit(0);
}

const result = spawnSync("npm", ["run", "build"], {
  cwd: marketingRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
