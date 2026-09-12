// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Static/SPA build for classic hosting (Hostinger, cPanel, Netlify drop, etc.).
// Enabled with `npm run build:static`, which sets STATIC_BUILD=true.
const isStaticBuild = process.env["STATIC_BUILD"] === "true";

// Full server build for a plain Node.js host (Hostinger Business "Web App",
// Cloud plans, VPS, Render, Railway, ...). Enabled with `npm run build:node`,
// which sets NODE_BUILD=true. Keeps SSR + every server function working.
const isNodeBuild = !isStaticBuild && process.env["NODE_BUILD"] === "true";

// Static hosting has no server runtime, so the public Supabase config must be
// baked into the client bundle at build time. Set SB_URL and SB_PUBLISHABLE_KEY
// in the build environment (Hostinger → Build settings → Environment variables).
// The Node build reads them at runtime too, but baking them in is harmless and
// makes the client resilient if the runtime env is missing.
const supabaseUrl = process.env["SB_URL"] ?? process.env["VITE_SB_URL"] ?? "";
const supabasePublishableKey =
  process.env["SB_PUBLISHABLE_KEY"] ?? process.env["VITE_SB_PUBLISHABLE_KEY"] ?? "";

const supabaseDefines = {
  __APP_SUPABASE_URL__: JSON.stringify(supabaseUrl),
  __APP_SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(supabasePublishableKey),
};

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    ...(isStaticBuild
      ? {
          spa: { enabled: true },
          prerender: { enabled: true, autoStaticPathsDiscovery: false },
          pages: [{ path: "/" }],
        }
      : {}),
  },
  ...(isStaticBuild
    ? {
        vite: {
          define: supabaseDefines,
        },
        // TanStack's SPA build already emits static client files. Running Nitro
        // as well changes dist/ into a server bundle that shared hosting cannot
        // execute and breaks the prerender preview server path.
        nitro: false,
      }
    : {}),
  ...(isNodeBuild
    ? {
        vite: {
          define: supabaseDefines,
        },
        // Plain Node server bundle instead of the Cloudflare Worker default.
        nitro: { preset: "node-server" },
      }
    : {}),
});
