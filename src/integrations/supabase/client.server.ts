// Server-side Supabase admin client (service role - bypasses RLS).
// SECURITY: Only import from server-only paths (createServerFn handlers, server routes).
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { SUPABASE_URL } from './config';

function createSupabaseAdminClient() {
  const SERVICE_ROLE_KEY = process.env.SB_SERVICE_ROLE_KEY || "missing-service-role-key";
  const url = SUPABASE_URL || "https://missing-config.supabase.co";

  return createClient<Database>(url, SERVICE_ROLE_KEY, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;

export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});
