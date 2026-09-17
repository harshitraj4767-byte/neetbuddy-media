// Supabase project configuration.
// Canonical env vars (one env per value — do NOT reintroduce aliases):
//   Client-visible: SB_URL, SB_PUBLISHABLE_KEY (baked at build time)
//   Server-only:    SB_SERVICE_ROLE_KEY, SB_DB_URL, SB_PROJECT_ID

declare const __APP_SUPABASE_URL__: string | undefined;
declare const __APP_SUPABASE_PUBLISHABLE_KEY__: string | undefined;

type PublicSupabaseConfig = {
  url: string;
  publishableKey: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __APP_RUNTIME_ENV__: Record<string, string> | undefined;
  // eslint-disable-next-line no-var
  var __APP_SUPABASE_CONFIG__: PublicSupabaseConfig | undefined;
}

function readRuntimeEnv(name: string): string {
  const runtimeValue = globalThis.__APP_RUNTIME_ENV__?.[name];
  if (runtimeValue) return runtimeValue;
  if (typeof process === "undefined") return "";
  return process.env?.[name] ?? "";
}

export function getPublicSupabaseConfig(): PublicSupabaseConfig {
  const globalConfig = globalThis.__APP_SUPABASE_CONFIG__;

  const url =
    globalConfig?.url ||
    (typeof __APP_SUPABASE_URL__ !== "undefined" ? __APP_SUPABASE_URL__ : "") ||
    readRuntimeEnv("SB_URL");

  const publishableKey =
    globalConfig?.publishableKey ||
    (typeof __APP_SUPABASE_PUBLISHABLE_KEY__ !== "undefined"
      ? __APP_SUPABASE_PUBLISHABLE_KEY__
      : "") ||
    readRuntimeEnv("SB_PUBLISHABLE_KEY");

  return { url, publishableKey };
}

const publicConfig = getPublicSupabaseConfig();

export const SUPABASE_URL: string = publicConfig.url || "https://missing-config.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY: string = publicConfig.publishableKey || "missing-publishable-key";

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  // eslint-disable-next-line no-console
  console.error(
    "[Supabase] Missing SB_URL or SB_PUBLISHABLE_KEY. " +
      "Add them in Project Settings → Secrets and rebuild.",
  );
}
