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
    "**/icons/**",
    "**/illustrations/**",
    "**/mascot/**",
  ],
  // The media trees above are deliberately excluded from the deployed output,
  // so the server must send those paths to the media CDN instead of 404ing.
  // (public/.htaccess has the same rules, but Hostinger runs this app as a
  // Node server where .htaccess is never read.)
  routeRules: {
    "/img/data/**": {
      redirect: {
        to: "https://cdn.jsdelivr.net/gh/sanskarj1589-png/neetbuddy-media@main/public/img/data/**",
        statusCode: 302,
      },
    },
    "/illustrations/**": {
      redirect: {
        to: "https://cdn.jsdelivr.net/gh/sanskarj1589-png/neetbuddy-media@main/public/illustrations/**",
        statusCode: 302,
      },
    },
    "/mascot/**": {
      redirect: {
        to: "https://cdn.jsdelivr.net/gh/sanskarj1589-png/neetbuddy-media@main/public/mascot/**",
        statusCode: 302,
      },
    },
    "/icons/**": {
      redirect: {
        to: "https://cdn.jsdelivr.net/gh/sanskarj1589-png/neetbuddy-media@main/public/icons/**",
        statusCode: 302,
      },
    },
    "/ncert/**": {
      redirect: {
        to: "https://cdn.jsdelivr.net/gh/sanskarj1589-png/neetbuddy-media@main/public/ncert/**",
        statusCode: 302,
      },
    },
  },
  compatibilityDate: "2026-09-15",
});
