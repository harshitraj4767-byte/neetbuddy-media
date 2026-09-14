// Entry file for plain Node.js hosts (Hostinger "Web App", VPS, Render, ...).
//
// Hostinger asks for an entry file ending in .js/.mjs/.cjs — point it at this
// file. It boots the server bundle produced by `npm run build:node`, which
// listens on process.env.PORT.
//
// NOTE: do not rename this to `server.mjs` — TanStack Start resolves its own
// server entry by that name and would pick this file instead of src/server.ts.
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const candidates = [
  ".output/server/index.mjs",
  "dist/server/index.mjs",
  ".output/server/index.js",
  "dist/server/index.js",
];

const entry = candidates
  .flatMap((p) => [resolve(here, p), resolve(process.cwd(), p)])
  .find((p) => existsSync(p));

if (!entry) {
  console.error(
    "Server bundle not found. Run `npm run build:node` first " +
      `(looked for: ${candidates.join(", ")}).`,
  );
  process.exit(1);
}

process.env.PORT ??= "3000";
process.env.HOST ??= "0.0.0.0";
process.env.NITRO_PORT = process.env.PORT;
process.env.NITRO_HOST = process.env.HOST;

console.log(`Starting server from ${entry} on port ${process.env.PORT}`);
await import(pathToFileURL(entry).href);
