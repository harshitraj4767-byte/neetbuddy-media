// Builds the app as a fully static site and puts the deployable files in ./dist
// (what Hostinger / cPanel / LiteSpeed expect: index.html at the top level).
//
// Usage: npm run build:static   (also the default `npm run build`)
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const out = resolve(root, "dist");

rmSync(resolve(root, ".output"), { recursive: true, force: true });
rmSync(out, { recursive: true, force: true });

const result = spawnSync("npx", ["--no-install", "vite", "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    STATIC_BUILD: "true",
    // Hostinger ships the PHP auth endpoints next to the static site.
    VITE_AUTH_API_BASE: process.env.VITE_AUTH_API_BASE ?? "/api/auth",
  },
  shell: process.platform === "win32",
});

if (result.status !== 0) process.exit(result.status ?? 1);

// The prerendered pages + client assets land in dist/client.
const source = resolve(root, "dist/client");
if (!existsSync(resolve(source, "index.html"))) {
  console.error("ERROR: dist/client/index.html was not generated — static build incomplete.");
  process.exit(1);
}

// Flatten dist/client/* up into dist/ so the folder can be uploaded straight
// into public_html.
const staged = resolve(root, ".static-dist");
rmSync(staged, { recursive: true, force: true });
cpSync(source, staged, { recursive: true });
rmSync(out, { recursive: true, force: true });
cpSync(staged, out, { recursive: true });
rmSync(staged, { recursive: true, force: true });

// Apache/LiteSpeed rules: serve the prerendered HTML for each route, keep the
// PHP API untouched, and fall back to the app shell for dynamic URLs.
writeFileSync(
  resolve(out, ".htaccess"),
  `Options -MultiViews +FollowSymLinks
DirectoryIndex index.html

<IfModule mod_rewrite.c>
  RewriteEngine On

  # Never touch the PHP API (login / signup live here)
  RewriteCond %{REQUEST_URI} ^/api/ [NC]
  RewriteRule ^ - [L]

  # Existing files are served as-is
  RewriteCond %{REQUEST_FILENAME} -f
  RewriteRule ^ - [L]

  # Prerendered page: /login -> /login/index.html
  RewriteCond %{REQUEST_FILENAME}/index.html -f
  RewriteRule ^(.*)$ /$1/index.html [L]

  # Anything else (dynamic URLs) falls back to the app shell
  RewriteRule ^ /index.html [L]
</IfModule>

<IfModule mod_headers.c>
  <FilesMatch "\\.(js|mjs|css|woff2|woff|ttf|png|jpg|jpeg|svg|webp|avif)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "\\.html$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
</IfModule>

<IfModule mod_mime.c>
  AddType application/javascript .js .mjs
  AddType text/css .css
  AddType application/manifest+json .webmanifest
</IfModule>

ErrorDocument 404 /index.html
`,
);

const pages = readdirSync(out, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
const size = readFileSync(resolve(out, "index.html")).length;
console.log(`\n✔ Static site ready in ./dist (index.html ${size} bytes, ${pages} route folders)`);
console.log("  Upload the CONTENTS of ./dist into Hostinger's public_html.");
