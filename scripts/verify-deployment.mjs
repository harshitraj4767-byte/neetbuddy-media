import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const serverEntry = resolve(root, ".output/server/index.mjs");
if (!existsSync(serverEntry)) {
  throw new Error("Missing .output/server/index.mjs. Run npm run build first.");
}

const port = String(4300 + Math.floor(Math.random() * 500));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [resolve(root, "start-server.mjs")], {
  cwd: root,
  env: { ...process.env, HOST: "127.0.0.1", PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

let logs = "";
server.stdout.on("data", (chunk) => { logs += chunk; });
server.stderr.on("data", (chunk) => { logs += chunk; });

const stop = () => {
  if (!server.killed) server.kill("SIGTERM");
};

process.on("exit", stop);
process.on("SIGINT", () => { stop(); process.exit(130); });
process.on("SIGTERM", () => { stop(); process.exit(143); });

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
    if (server.exitCode !== null) break;
    try {
      const response = await fetch(origin);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The server may still be starting.
    }
  }

  if (!ready) throw new Error(`Production server did not start.\n${logs}`);

  for (const path of ["/", "/login", "/dashboard", "/study-planner"]) {
    const response = await fetch(`${origin}${path}`, { redirect: "manual" });
    if (response.status < 200 || response.status >= 400) {
      throw new Error(`${path} returned HTTP ${response.status}`);
    }
    const body = await response.text();
    if (!body.includes("<html")) throw new Error(`${path} did not return an HTML page`);
    console.log(`✓ ${path} (${response.status})`);
  }

  console.log("Production deployment output verified.");
} finally {
  stop();
}
