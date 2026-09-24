/**
 * Shared auth + rate-limit gate for the AI Edge Functions (generate-trail, generate-caption).
 *
 * **Purpose**: every AI request costs the project money at a vendor (Groq / Gemini).
 * Before a function spends that money, it calls `authorize()` here to confirm the
 * caller is a real signed-in Wanderlens user and that they still have quota left.
 *
 * **How it works**:
 * - Reads the caller's JWT (the Supabase session token the app sends as
 *   `Authorization: Bearer ...`) off the incoming request.
 * - Builds a Supabase client with the public ANON key plus that JWT, so every
 *   query runs as the caller and Row Level Security (RLS, Postgres per-row access
 *   rules) applies exactly as it would in the app.
 * - `auth.getUser(token)` asks Supabase Auth to validate the token and return the user.
 * - Calls the `consume_ai_quota` RPC (a Postgres function exposed over the API),
 *   which atomically checks the per-user limits and records one use.
 * - Returns either `{ ok: true, userId }` or a ready-made error `Response`
 *   the Edge Function can return as-is.
 *
 * **Why server-side**: the vendor API keys used to ship in the app bundle as
 * EXPO_PUBLIC_* vars, readable by anyone who unzips an APK. Moving the calls into
 * Edge Functions keeps the keys as server secrets, and this gate adds the
 * per-user scoping and rate limit the client-side keys never had
 * (see .claude/rules/security.md).
 *
 * Runs in Deno (the Supabase Edge runtime), not React Native, which is why the
 * import is a URL and env vars come from `Deno.env`.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fail } from './http.ts';

// Auto-injected by the platform — do NOT `supabase secrets set` these; the
// SUPABASE_ prefix is reserved and the CLI will reject it.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY =
  Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;

/**
 * Result of `authorize()`. A discriminated union: check `ok` first, then either
 * use `userId` or return `response` (an already-built 401/429/500) straight to the client.
 */
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
  // Pull the raw JWT out of "Authorization: Bearer <token>". No token at all
  // means the request didn't come from a signed-in app session.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, response: fail('You need to be signed in to use this.', 401) };

  // A per-request client that acts as the caller: the forwarded JWT is sent on
  // every query, so RLS and auth.uid() inside RPCs resolve to this user.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    // No storage in a Deno isolate, and no point installing a refresh timer.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Pass the token explicitly — there is no persisted session to fall back on,
  // and this is version-proof across supabase-js releases.
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  // Invalid, expired, or anon-key-only tokens all end up here: reject as signed out.
  if (userError || !user) {
    return { ok: false, response: fail('You need to be signed in to use this.', 401) };
  }

  // Atomically check and record one use of this feature. The limits themselves
  // live in SQL (supabase/migrations/20260927000000_ai_usage_quota.sql): a
  // rolling one-hour window and a 24-hour cap per feature, so they can be tuned
  // without redeploying this function. An advisory lock inside the RPC stops two
  // concurrent requests from both slipping under the limit.
  const { data, error } = await supabase.rpc('consume_ai_quota', { p_feature: feature });
  if (error) {
    console.error('consume_ai_quota failed:', error.message);
    return { ok: false, response: fail('Could not check your usage limit. Please try again.', 500) };
  }

  // `returns table` comes back as an array.
  const quota = Array.isArray(data) ? data[0] : data;
  // Over the limit: the RPC also reports how long until a counted use expires,
  // which becomes a human-friendly "try again in ..." message (HTTP 429).
  if (!quota?.allowed) {
    const wait = formatWait(quota?.retry_after_seconds ?? 3600);
    return {
      ok: false,
      response: fail(`You've used all your AI generations for now. Try again in ${wait}.`, 429),
    };
  }

  return { ok: true, userId: user.id };
}

/**
 * Turns a retry-after duration in seconds into a short phrase for the 429 message,
 * e.g. 45 -> "a minute", 600 -> "10 minutes", 3600 -> "an hour", 7300 -> "3 hours".
 * Rounds up so the user is never told to retry too early.
 */
function formatWait(seconds: number): string {
  if (seconds < 90) return 'a minute';
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? 'an hour' : `${hours} hours`;
}
