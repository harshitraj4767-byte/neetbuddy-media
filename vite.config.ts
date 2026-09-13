import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isNodeBuild = process.env["NODE_BUILD"] === "true" || process.env["NITRO_PRESET"] === "node-server";

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
    server: { entry: "server" },
    prerender: isNodeBuild ? { enabled: false } : { enabled: true, crawlLinks: false },
  },
});
