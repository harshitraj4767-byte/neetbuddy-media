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
        // TanStack's SPA build already emits static client files. Running Nitro
        // as well changes dist/ into a server bundle that shared hosting cannot
        // execute and breaks the prerender preview server path.
        nitro: false,
      }
    : {}),
});
