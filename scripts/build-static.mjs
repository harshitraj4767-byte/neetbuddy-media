// Builds the app as a static site and puts the deployable files in ./dist
// (what Hostinger, cPanel and most static hosts expect).
//
// Usage: npm run build:static
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const out = resolve(root, "dist");

rmSync(resolve(root, ".output"), { recursive: true, force: true });
rmSync(out, { recursive: true, force: true });

const result = spawnSync("npx", ["vite", "build"], {
  stdio: "inherit",
  env: { ...process.env, STATIC_BUILD: "true", NITRO_PRESET: "static" },
  shell: process.platform === "win32",
});

if (result.status !== 0) process.exit(result.status ?? 1);

const candidates = [resolve(root, "dist/client"), resolve(root, ".output/public")];
const source = candidates.find((dir) => existsSync(dir));

if (!source) {
  console.error("ERROR: could not find the static output directory after build.");
  process.exit(1);
}

if (source !== out) {
  cpSync(source, out, { recursive: true });
}

// Vite also stages its intermediate client/server bundles under dist. They are
// not needed by Apache/LiteSpeed and can confuse one-click deployment scanners.
rmSync(resolve(out, "client"), { recursive: true, force: true });
rmSync(resolve(out, "server"), { recursive: true, force: true });

// Apache/LiteSpeed (Hostinger) SPA fallback so deep links and refreshes work.
writeFileSync(
  resolve(out, ".htaccess"),
  `Options -MultiViews
RewriteEngine On

# Serve existing files/directories as-is
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]

# Never send PHP API requests to the SPA shell
RewriteCond %{REQUEST_URI} ^/api/ [NC]
RewriteRule ^ - [L]

# Everything else falls back to the SPA shell
RewriteRule ^ /index.html [L]

<IfModule mod_headers.c>
  <FilesMatch "\\.(js|css|woff2|png|jpg|jpeg|svg|webp|avif)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "index\\.html$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
</IfModule>
`,
);

if (!existsSync(resolve(out, "index.html"))) {
  console.error("ERROR: dist/index.html was not generated — static build incomplete.");
  process.exit(1);
}

const size = readFileSync(resolve(out, "index.html")).length;
console.log(`\n✔ Static site ready in ./dist (index.html ${size} bytes)`);
console.log("  Upload the CONTENTS of ./dist into Hostinger's public_html.");
