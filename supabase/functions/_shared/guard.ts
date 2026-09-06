import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fail } from './http.ts';

// Auto-injected by the platform — do NOT `supabase secrets set` these; the
// SUPABASE_ prefix is reserved and the CLI will reject it.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY =
  Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;

export type Authorized = { ok: true; userId: string } | { ok: false; response: Response };

/**
 * Verifies the caller's JWT and atomically consumes one unit of their quota.
 *
 * Call this AFTER validating the request payload — a malformed request should
 * 400 without costing the user a slot (there is no refund path, by design; see
 * the ai_usage migration header).
 *
 * Uses the ANON key plus the caller's forwarded JWT, so every query runs as the
 * caller under RLS. No service-role key is introduced.
 *
 * Note: the platform's own verify_jwt gate is NOT sufficient auth — the anon
 * key is itself a valid project JWT and supabase-js sends it as the Bearer
 * token when there is no session. getUser() is what actually rejects signed-out
 * callers.
 */
export async function authorize(req: Request, feature: 'trail' | 'caption'): Promise<Authorized> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, response: fail('You need to be signed in to use this.', 401) };

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    // No storage in a Deno isolate, and no point installing a refresh timer.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Pass the token explicitly — there is no persisted session to fall back on,
  // and this is version-proof across supabase-js releases.
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return { ok: false, response: fail('You need to be signed in to use this.', 401) };
  }

  const { data, error } = await supabase.rpc('consume_ai_quota', { p_feature: feature });
  if (error) {
    console.error('consume_ai_quota failed:', error.message);
    return { ok: false, response: fail('Could not check your usage limit. Please try again.', 500) };
  }

  // `returns table` comes back as an array.
  const quota = Array.isArray(data) ? data[0] : data;
  if (!quota?.allowed) {
    const wait = formatWait(quota?.retry_after_seconds ?? 3600);
    return {
      ok: false,
      response: fail(`You've used all your AI generations for now. Try again in ${wait}.`, 429),
    };
  }

  return { ok: true, userId: user.id };
}

function formatWait(seconds: number): string {
  if (seconds < 90) return 'a minute';
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? 'an hour' : `${hours} hours`;
}
