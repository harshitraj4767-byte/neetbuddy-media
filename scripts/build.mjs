// Single entry point for `npm run build`.
//
// Hostinger's "Web App" hosting (Nitro framework preset) runs `npm run build`
// and then boots `.output/server/index.mjs` via `npm start`. That only works if
// the build produces the Nitro node-server bundle, so that is the default here.
//
// A static/SPA build (for plain shared hosting + the PHP auth API) is still
// available with `npm run build:static`, or by setting BUILD_TARGET=static.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();

const target = (process.env.BUILD_TARGET ??
  (process.env.STATIC_BUILD === "true" ? "static" : "node")
).toLowerCase();

const script = target === "static" ? "build-static.mjs" : "build-node.mjs";

console.log(`[build] target: ${target} (scripts/${script})`);

const result = spawnSync(process.execPath, [resolve(root, "scripts", script)], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
