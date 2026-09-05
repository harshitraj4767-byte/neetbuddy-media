// Builds the app as a self-contained Node.js server (SSR + all server
// functions) for hosts that can run Node — Hostinger Business "Web App",
// Hostinger Cloud/VPS, Render, Railway, a plain Ubuntu box, etc.
//
// Usage: npm run build:node   ->   then: npm start
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

rmSync(resolve(root, ".output"), { recursive: true, force: true });
rmSync(resolve(root, "dist"), { recursive: true, force: true });

// The Lovable build helper forces a Cloudflare Worker build when it thinks it
// is running inside the Lovable sandbox. This build is for a real Node host,
// so clear those markers for the child process only.
const env = { ...process.env, NODE_BUILD: "true", STATIC_BUILD: "", NITRO_PRESET: "node-server" };
delete env["LOVABLE_SANDBOX"];
delete env["DEV_SERVER__PROJECT_PATH"];

const result = spawnSync("npx", ["vite", "build"], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

if (result.status !== 0) process.exit(result.status ?? 1);

const entry = [".output/server/index.mjs", "dist/server/index.mjs"]
  .map((p) => resolve(root, p))
  .find((p) => existsSync(p));

if (!entry) {
  console.error("ERROR: no Node server bundle was produced (.output/server/index.mjs missing).");
  process.exit(1);
}

console.log(`\n✔ Node server build ready: ${entry}`);
console.log("  Start it with: npm start   (listens on $PORT, default 3000)");
