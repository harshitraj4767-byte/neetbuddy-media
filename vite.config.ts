// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// NODE_BUILD=true (set by scripts/build-node.mjs) produces a runnable Node
// server (SSR + server functions). Everything else stays a static site build.
const isNodeBuild = process.env["NODE_BUILD"] === "true";

export default defineConfig({
  nitro: {
    preset: isNodeBuild ? "node-server" : "static",
    output: {
      dir: isNodeBuild ? ".output" : "dist",
      publicDir: isNodeBuild ? ".output/public" : "dist/client",
      serverDir: isNodeBuild ? ".output/server" : "dist/server",
    },
  },
  tanstackStart: {
    // Dedicated SSR entry point (src/server.ts). Without this, Rolldown tries
    // to use the client HTML as the SSR input and the build fails with
    // "rolldownOptions.input should not be an HTML file when building for SSR".
    server: { entry: "server" },
    prerender: isNodeBuild ? { enabled: false } : { enabled: true, crawlLinks: false },
  },
});
