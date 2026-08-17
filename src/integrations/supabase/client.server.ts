// Server-side Supabase admin client (service role - bypasses RLS).
// SECURITY: Only import from server-only paths (createServerFn handlers, server routes).
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { SUPABASE_URL } from './config';

function createSupabaseAdminClient() {
  const SERVICE_ROLE_KEY = process.env.SB_SERVICE_ROLE_KEY;

  if (!SERVICE_ROLE_KEY) {
    const message =
      'Missing SB_SERVICE_ROLE_KEY env var. Add it in Project Settings → Secrets.';
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
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
