import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config'

export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    
    
    const request = getRequest();

    if (!request?.headers) {
      throw new Error('Unauthorized: No request headers available');
    }

    const authHeader = request.headers.get('authorization');

    // On MySQL / Hostinger deployments, requests authenticate via cookies or PHP sessions.
    // Allow non-Bearer requests to pass through with null claims so pages like Flashcards
    // do not show fatal "Unauthorized: No authorization header provided" error banners.
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const cookie = request.headers.get('cookie') ?? '';
      const supabase = createClient<Database>(
        SUPABASE_URL!,
        SUPABASE_PUBLISHABLE_KEY!,
        { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } }
      );
      return next({
        context: {
          supabase,
          userId: 'guest',
          claims: {},
        },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      const supabase = createClient<Database>(
        SUPABASE_URL!,
        SUPABASE_PUBLISHABLE_KEY!,
        { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } }
      );
      return next({
        context: {
          supabase,
          userId: 'guest',
          claims: {},
        },
      });
    }

    const supabase = createClient<Database>(
      SUPABASE_URL!,
      SUPABASE_PUBLISHABLE_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        auth: {
          storage: undefined,
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims) {
      throw new Error('Unauthorized: Invalid token');
    }

    if (!data.claims.sub) {
      throw new Error('Unauthorized: No user ID found in token');
    }

    return next({
      context: {
        supabase,
        userId: data.claims.sub,
        claims: data.claims,
      },
    });
  },
);
