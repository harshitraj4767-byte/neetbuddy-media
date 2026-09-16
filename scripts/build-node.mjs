import { spawnSync } from "node:child_process";
import {
  existsSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  statSync,
  linkSync,
  copyFileSync,
  symlinkSync,
  renameSync,
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

// Media directories that carry ~25,000+ files (~900 MB).
// Stashing them during Vite/Nitro compilation prevents Vite and Nitro from
// globbing and copying thousands of files, which previously exhausted container disk
// and hit Hostinger's 5-minute timeout.
const heavyDirs = [
  "img",
  "ncert",
  "chemistry",
  "physics",
  "illustrations",
  "mascot",
  "short_notes",
];

const stashedDirs = [];
const stashParent = resolve(root, ".build_media_stash");

try {
  rmSync(stashParent, { recursive: true, force: true });
  mkdirSync(stashParent, { recursive: true });

  for (const name of heavyDirs) {
    const srcPath = resolve(root, "public", name);
    if (existsSync(srcPath)) {
      const stashPath = resolve(stashParent, name);
      renameSync(srcPath, stashPath);
      stashedDirs.push({ name, srcPath, stashPath });
    }
  }

  if (stashedDirs.length > 0) {
    console.log(
      `[build] stashed ${stashedDirs.length} heavy media directories during compilation (avoids duplicating ~900 MB)`,
    );
  }

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
} finally {
  // Always restore stashed media back to public/
  for (const { srcPath, stashPath } of stashedDirs) {
    if (existsSync(stashPath) && !existsSync(srcPath)) {
      renameSync(stashPath, srcPath);
    }
  }
  rmSync(stashParent, { recursive: true, force: true });
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
mkdirSync(publicDir, { recursive: true });

if (!existsSync(resolve(publicDir, "index.html"))) {
  writeFileSync(resolve(publicDir, "index.html"), fallbackHtml);
}
if (!existsSync(resolve(root, ".output/index.html"))) {
  writeFileSync(resolve(root, ".output/index.html"), fallbackHtml);
}

// Zero-copy link of all public media & files into .output/public
function linkPublicAssets() {
  const source = resolve(root, "public");
  const target = resolve(root, ".output/public");
  if (!existsSync(source) || !existsSync(target)) return;

  const entries = readdirSync(source, { withFileTypes: true });
  let dirCount = 0;
  let fileCount = 0;

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const srcPath = resolve(source, entry.name);
    const destPath = resolve(target, entry.name);

    if (existsSync(destPath)) continue;

    if (entry.isDirectory()) {
    if (heavyDirs.includes(entry.name)) continue;
      try {
        symlinkSync(srcPath, destPath, "junction");
        dirCount++;
      } catch (err) {
        console.warn(`[build] symlink fallback for ${entry.name}:`, err.message);
      }
    } else if (entry.isFile()) {
      try {
        linkSync(srcPath, destPath);
        fileCount++;
      } catch {
        try {
          copyFileSync(srcPath, destPath);
          fileCount++;
        } catch {}
      }
    }
  }
  console.log(
    `[build] linked ${dirCount} media directories and ${fileCount} root public files into .output/public (0 MB extra disk)`,
  );
}

linkPublicAssets();

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
