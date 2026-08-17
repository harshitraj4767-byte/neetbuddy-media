// External Supabase browser client.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config';

const supabaseUrl = SUPABASE_URL || "https://missing-config.supabase.co";
const supabasePublishableKey = SUPABASE_PUBLISHABLE_KEY || "missing-publishable-key";

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
});
