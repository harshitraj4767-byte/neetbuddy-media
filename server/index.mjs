// Entry file for Hostinger and Node hosts that expect server/index.mjs
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  resolve(here, "../.output/server/index.mjs"),
  resolve(here, "../.output/server/index.js"),
  resolve(process.cwd(), ".output/server/index.mjs"),
  resolve(process.cwd(), ".output/server/index.js"),
  resolve(here, "index.mjs"),
];

const target = candidates.find((p) => p !== fileURLToPath(import.meta.url) && existsSync(p));

if (!target) {
  console.error("Compiled server bundle not found at .output/server/index.mjs. Please run build first.");
  process.exit(1);
}

process.env.PORT ??= "3000";
process.env.HOST ??= "0.0.0.0";
process.env.NITRO_PORT = process.env.PORT;
process.env.NITRO_HOST = process.env.HOST;

console.log(`Starting server via server/index.mjs targeting ${target} on port ${process.env.PORT}`);
await import(pathToFileURL(target).href);
