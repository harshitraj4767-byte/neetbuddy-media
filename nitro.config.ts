import { defineNitroConfig } from "nitropack/config";

// Standalone Nitro configuration for Hostinger Web App (Nitro preset).
export default defineNitroConfig({
  preset: "node-server",
  output: {
    dir: ".output",
    serverDir: ".output/server",
    publicDir: ".output/public",
  },
  ignore: [
    "**/img/**",
    "**/ncert/**",
    "**/chemistry/**",
    "**/physics/**",
    "**/short_notes/**",
  ],
  compatibilityDate: "2026-09-15",
});
