// Removes bulk media trees from dist/client after the Vite/Nitro build so they are
// never uploaded as Cloudflare Worker static assets.
//
// Why: Workers static assets are capped per Worker version (20,000 files on the
// Free plan, 100,000 on Paid). public/img/data alone holds ~17k question-bank
// diagrams, which pushed the deployment to ~25.9k files and made every deploy
// fail with API error 10304. Those diagrams are served from
// VITE_QBANK_IMAGE_BASE (see src/lib/qbank-images.ts) in production and stay in
// git for local dev and the sync scripts.
import { rm, stat } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const CLIENT_DIR = "dist/client";

// Directories (relative to dist/client) dropped from the deployed asset set.
const PRUNE_DIRS = ["img/data"];
// Files matching these patterns are never served over HTTP.
const PRUNE_FILE_PATTERNS = [/\.zip(\.\w+)*$/i];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function countFiles(dir) {
  let total = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) total += await countFiles(join(dir, entry.name));
    else total += 1;
  }
  return total;
}

async function pruneMatchingFiles(dir) {
  let removed = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      removed += await pruneMatchingFiles(path);
    } else if (PRUNE_FILE_PATTERNS.some((re) => re.test(entry.name))) {
      await rm(path);
      removed += 1;
    }
  }
  return removed;
}

if (!(await exists(CLIENT_DIR))) {
  console.error(`[prune-deploy-assets] ${CLIENT_DIR} not found — run the build first.`);
  process.exit(1);
}

let removed = 0;
for (const dir of PRUNE_DIRS) {
  const target = join(CLIENT_DIR, dir);
  if (!(await exists(target))) continue;
  removed += await countFiles(target);
  await rm(target, { recursive: true, force: true });
}
removed += await pruneMatchingFiles(CLIENT_DIR);

const remaining = await countFiles(CLIENT_DIR);
console.log(
  `[prune-deploy-assets] removed ${removed} file(s); ${remaining} static asset file(s) will be uploaded (Workers Free limit: 20,000).`,
);
if (remaining > 20000) {
  console.error(
    `[prune-deploy-assets] ERROR: ${remaining} files exceeds the Workers Free static-asset limit of 20,000.`,
  );
  process.exit(1);
}
