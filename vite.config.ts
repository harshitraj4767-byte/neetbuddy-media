import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Bake public Supabase URL + publishable key into the client bundle from
// the canonical runtime secrets. One env per value:
//   SB_URL, SB_PUBLISHABLE_KEY  (client-visible; baked at build time)
//   SB_SERVICE_ROLE_KEY, SB_DB_URL, SB_PROJECT_ID  (server-only)
const APP_SUPABASE_URL = JSON.stringify(process.env.SB_URL ?? "");
const APP_SUPABASE_PUBLISHABLE_KEY = JSON.stringify(
  process.env.SB_PUBLISHABLE_KEY ?? "",
);

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: {
    preset: process.env.NITRO_PRESET ?? "cloudflare-module",
    output: {
      dir: "dist",
      serverDir: "dist/server",
      publicDir: "dist/client",
    },
  },
  vite: {
    define: {
      __APP_SUPABASE_URL__: APP_SUPABASE_URL,
      __APP_SUPABASE_PUBLISHABLE_KEY__: APP_SUPABASE_PUBLISHABLE_KEY,
    },
  },
});
