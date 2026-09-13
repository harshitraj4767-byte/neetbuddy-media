import { spawnSync } from "node:child_process";
import { existsSync, rmSync, cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

rmSync(resolve(root, ".output"), { recursive: true, force: true });
rmSync(resolve(root, "dist"), { recursive: true, force: true });

const env = {
  ...process.env,
  NODE_BUILD: "true",
  STATIC_BUILD: "",
  NITRO_PRESET: "node-server",
  NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=2048",
};
delete env["LOVABLE_SANDBOX"];
delete env["DEV_SERVER__PROJECT_PATH"];

const viteBin = resolve(root, "node_modules/.bin/vite");
const cmd = existsSync(viteBin) ? viteBin : "npx";
const args = existsSync(viteBin) ? ["build"] : ["vite", "build"];

console.log(`Running Vite build with ${cmd} ${args.join(" ")}...`);
const result = spawnSync(cmd, args, {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const serverEntry = [".output/server/index.mjs", "dist/server/index.mjs"]
  .map((p) => resolve(root, p))
  .find((p) => existsSync(p));

if (!serverEntry) {
  console.error("ERROR: no Node server bundle was produced (.output/server/index.mjs missing).");
  process.exit(1);
}

const publicOut = resolve(root, ".output/public");
const distDir = resolve(root, "dist");
if (existsSync(publicOut) && !existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
  cpSync(publicOut, distDir, { recursive: true });
}

console.log(`\n✔ Node server build ready: ${serverEntry}`);
console.log("  Output directories populated: .output/ and dist/");
console.log("  Start command: npm start (or node start-server.mjs)");
