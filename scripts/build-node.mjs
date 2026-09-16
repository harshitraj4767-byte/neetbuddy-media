import { spawnSync } from "node:child_process";
import {
  existsSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  statSync,
  linkSync,
} from "node:fs";
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

// Ensure both .mjs and .js extensions exist in .output/server/
const serverDir = resolve(root, ".output/server");
if (existsSync(resolve(serverDir, "index.mjs")) && !existsSync(resolve(serverDir, "index.js"))) {
  writeFileSync(
    resolve(serverDir, "index.js"),
    'export * from "./index.mjs";\nimport "./index.mjs";\n',
  );
}

// Satisfy framework validators that look for index.html in the output directory
const fallbackHtml =
  '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Neet Buddy</title></head><body><div id="root"></div></body></html>';
const publicDir = resolve(root, ".output/public");
if (existsSync(publicDir) && !existsSync(resolve(publicDir, "index.html"))) {
  writeFileSync(resolve(publicDir, "index.html"), fallbackHtml);
}
if (!existsSync(resolve(root, ".output/index.html"))) {
  writeFileSync(resolve(root, ".output/index.html"), fallbackHtml);
}

// --- Disk guard -------------------------------------------------------------
// Nitro copies the whole `public/` tree into `.output/public`, so a build needs
// roughly 2x the size of public/ in free disk. On Hostinger that silently kills
// the build container (OOM/disk) with no log at all. Replacing each copied file
// with a hard link back to public/ keeps the output byte-identical while using
// almost no extra disk. Set DEDUPE_PUBLIC=false to skip.
function dirStats(dir) {
  let bytes = 0;
  let files = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = resolve(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) {
        files += 1;
        bytes += statSync(full).size;
      }
    }
  }
  return { bytes, files };
}

function hardlinkDedupePublic() {
  const source = resolve(root, "public");
  const target = resolve(root, ".output/public");
  if (!existsSync(source) || !existsSync(target)) return;

  let linked = 0;
  let saved = 0;
  const stack = [""];
  while (stack.length) {
    const rel = stack.pop();
    const dir = resolve(target, rel);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        stack.push(relPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const original = resolve(source, relPath);
      const copy = resolve(target, relPath);
      try {
        const a = statSync(original);
        const b = statSync(copy);
        if (!a.isFile() || a.size !== b.size || a.ino === b.ino) continue;
        rmSync(copy);
        linkSync(original, copy);
        linked += 1;
        saved += a.size;
      } catch {
        // Different filesystem or unreadable file: keep the copy as-is.
      }
    }
  }
  if (linked) {
    console.log(
      `[build] deduped ${linked} public assets via hard links (~${Math.round(saved / 1024 / 1024)} MB saved)`,
    );
  }
}

if (process.env.DEDUPE_PUBLIC !== "false") {
  hardlinkDedupePublic();
}

if (existsSync(publicDir)) {
  const { bytes, files } = dirStats(publicDir);
  console.log(`[build] .output/public: ${files} files, ${Math.round(bytes / 1024 / 1024)} MB`);
}

// Create a light dist/ fallback directory pointing to server output
const distServerDir = resolve(root, "dist/server");
mkdirSync(distServerDir, { recursive: true });
writeFileSync(
  resolve(distServerDir, "index.mjs"),
  'export * from "../../.output/server/index.mjs";\nimport "../../.output/server/index.mjs";\n',
);
writeFileSync(
  resolve(distServerDir, "index.js"),
  'export * from "../../.output/server/index.mjs";\nimport "../../.output/server/index.mjs";\n',
);
writeFileSync(resolve(root, "dist/index.html"), fallbackHtml);

console.log(`\n✔ Node server build ready: ${serverEntry}`);
console.log("  Output directory: .output (public assets in .output/public)");
console.log("  Start command: npm start (or node start-server.mjs)");
