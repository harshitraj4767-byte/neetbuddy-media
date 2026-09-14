import { defineNitroConfig } from "nitro/config";

// Standalone Nitro configuration for Hostinger Web App (Nitro preset).
export default defineNitroConfig({
  preset: "node-server",
  output: {
    dir: ".output",
    serverDir: ".output/server",
    publicDir: ".output/public",
  },
});
