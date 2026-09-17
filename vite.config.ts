import { defineConfig as defineLovableConfig } from "@lovable.dev/vite-tanstack-config";
import { mergeConfig, type Plugin, type PluginOption, type UserConfig } from "vite";

const isStaticBuild = process.env["STATIC_BUILD"] === "true" || process.env["BUILD_TARGET"] === "static";
const isNodeBuild = !isStaticBuild;

const REMOTE_MEDIA_BASE = "https://cdn.jsdelivr.net/gh/harshitraj4767-byte/neetbuddy-media@main/public";

/** Rewrite static public media URLs so they are never bundled into Hostinger builds. */
const remoteMediaPlugin: Plugin = {
  name: "remote-media-assets",
  enforce: "post",
  transform(code, id) {
    if (!/(?:\.[cm]?[jt]sx?|\.css)$/.test(id) || id.includes("node_modules")) return null;
    const transformed = code.replace(
      /([\"'`])\/(icons|illustrations|img|mascot)\/([^\"'`]*\.(?:png|jpe?g|webp|svg|gif|avif|ico))(?:\?[^\"'`]*)?\1/g,
      (_match, quote, directory, file) => quote + REMOTE_MEDIA_BASE + "/" + directory + "/" + file + quote,
    ).replace(
      /([\"'`])\/(favicon(?:-[^\"'`]+)?\.(?:png|ico))\1/g,
      (_match, quote, file) => quote + REMOTE_MEDIA_BASE + "/" + file + quote,
    );
    return transformed === code ? null : { code: transformed, map: null };
  },
};

/**
 * Vite 8 resolves tsconfig `paths` natively (`resolve.tsconfigPaths`), so the
 * bundled `vite-tsconfig-paths` plugin is dropped here: it emitted a
 * deprecation warning on every build and accounted for most of the build time.
 * The `@` alias below is declared explicitly so nothing depends on the plugin.
 */
function dropTsconfigPathsPlugin(plugins: PluginOption[] | undefined): PluginOption[] {
  const keep: PluginOption[] = [];
  for (const plugin of plugins ?? []) {
    if (!plugin) continue;
    if (Array.isArray(plugin)) {
      keep.push(dropTsconfigPathsPlugin(plugin));
      continue;
    }
    const name = (plugin as Plugin).name;
    if (name === "vite-tsconfig-paths") continue;
    keep.push(plugin);
  }
  return keep;
}

/** Vendor chunks: keeps any single chunk well under the 500 kB warning limit. */
const vendorGroups = [
  { name: "vendor-react", test: /node_modules\/(react|react-dom|scheduler|react-is|prop-types)\// },
  { name: "vendor-tanstack", test: /node_modules\/@tanstack\// },
  { name: "vendor-radix", test: /node_modules\/(@radix-ui|cmdk|vaul|input-otp|embla-carousel[^/]*|react-resizable-panels)\// },
  { name: "vendor-charts", test: /node_modules\/(recharts|d3-[^/]+|victory-vendor|decimal\.js-light|internmap|robust-predicates|delaunator)\// },
  { name: "vendor-katex", test: /node_modules\/(katex|react-katex)\// },
  { name: "vendor-pdf", test: /node_modules\/(pdf-lib|@pdf-lib)\// },
  { name: "vendor-supabase", test: /node_modules\/@supabase\// },
  { name: "vendor-forms", test: /node_modules\/(react-hook-form|@hookform|zod)\// },
  { name: "vendor-dates", test: /node_modules\/(date-fns|react-day-picker)\// },
  { name: "vendor-icons", test: /node_modules\/lucide-react\// },
];

const extraConfig: UserConfig = {
  resolve: {
    // Native replacement for the vite-tsconfig-paths plugin.
    tsconfigPaths: true,
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  build: {
    chunkSizeWarningLimit: 700,
    copyPublicDir: false,
  },
  environments: {
    // Vendor splitting only matters for what the browser downloads; the SSR /
    // prerender build keeps the framework's own chunking untouched.
    client: {
      build: {
        rolldownOptions: {
          output: {
            codeSplitting: {
              minSize: 0,
              groups: [...vendorGroups, { name: "vendor-misc", test: /node_modules\// }],
            },
          },
        },
      },
    },
  },
} as UserConfig;

const lovableConfig = defineLovableConfig({
  nitro: {
    preset: isNodeBuild ? "node-server" : "static",
    output: {
      dir: isNodeBuild ? ".output" : "dist",
      publicDir: isNodeBuild ? ".output/public" : "dist/client",
      serverDir: isNodeBuild ? ".output/server" : "dist/server",
    },
    ignore: [
      "**/img/**",
      "**/ncert/**",
      "**/chemistry/**",
      "**/physics/**",
      "**/illustrations/**",
      "**/mascot/**",
      "**/short_notes/**",
    ],
  },
  tanstackStart: {
    server: { entry: "./src/server.ts" },
    prerender: isNodeBuild ? { enabled: false } : { enabled: true, crawlLinks: false },
  },
});

export default async (env: { command: string; mode: string }) => {
  const base = (await (lovableConfig as unknown as (e: unknown) => Promise<UserConfig>)(env)) ?? {};
  const config = mergeConfig(base, extraConfig) as UserConfig;
  config.plugins = [remoteMediaPlugin, ...dropTsconfigPathsPlugin(base.plugins as PluginOption[] | undefined)];
  return config;
};
