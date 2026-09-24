/**
 * Edge Function: delete-account (Deno, runs on Supabase, not in the app).
 *
 * **Purpose**: permanently deletes the signed-in user's account. Called from
 * app/(tabs)/profile.tsx via `supabase.functions.invoke('delete-account')`.
 *
 * **How it works**:
 * - Verifies the caller's JWT with `auth.getUser(token)`, the same check the AI
 *   functions do in _shared/guard.ts (no quota here; it isn't an AI call).
 * - Calls the `delete_own_account_data` RPC as the caller. It wipes personal data
 *   and anonymizes the profile in one Postgres transaction
 *   (supabase/migrations/20260928000000_account_deletion.sql).
 * - Best-effort removes the avatar and banner images from the `profile-media` bucket.
 * - Soft-deletes the auth.users account with the admin API, the only step that
 *   needs the service-role key.
 * - Returns `{ success: true }`, or `{ error }` with 401/405/500 via _shared/http.ts.
 *
 * **Why an Edge Function**: deleting an auth account needs the service-role key,
 * which bypasses RLS entirely and must never ship in the app bundle. Here it is
 * only a server-side environment value that the client never sees.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, fail, json } from '../_shared/http.ts';

// Auto-injected by the platform — do NOT `supabase secrets set` these; the
// SUPABASE_ prefix is reserved and the CLI will reject it.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY =
  Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
// Also auto-injected — this is the first place in this project that ever
// uses it. Every prior Edge Function (generate-trail, generate-caption)
// deliberately avoided a service-role key; this one needs it because only
// the admin API can invalidate a real auth.users account. Nothing else in
// this function uses it — every other step runs as the caller, under RLS.
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Request handler. `Deno.serve` registers this function to run for every HTTP
 * request that reaches the Edge Function.
 */
Deno.serve(async (req) => {
  // CORS preflight (web builds only) gets an empty OK; anything but POST is rejected.
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Method not allowed.', 405);

  // Extract the raw JWT from "Authorization: Bearer <token>".
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return fail('You need to be signed in to do this.', 401);

  // Runs as the caller (anon key + forwarded JWT) — used only to identify
  // who's calling and to reach the security-definer cleanup RPC below as
  // that user; it does no direct table writes itself.
  const asCaller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Validate the token with Supabase Auth. This, not the platform's own JWT
  // gate, is what rejects callers who only hold the public anon key
  // (see the note on authorize() in _shared/guard.ts).
  const { data: { user }, error: userError } = await asCaller.auth.getUser(token);
  if (userError || !user) return fail('You need to be signed in to do this.', 401);
  const userId = user.id;

  try {
    // Runs the personal-data cleanup + profile anonymization as one
    // transaction inside Postgres (see the migration's function comment for
    // why this isn't a series of table calls from here: several of these
    // tables don't actually grant authenticated callers delete/update
    // rights the way a naive per-table approach would assume, which would
    // silently no-op instead of erroring — a security review of an earlier
    // version of this function found exactly that). Runs as security
    // definer, scoped internally to auth.uid(), so it only ever touches
    // this caller's own rows regardless of table grants.
    const { error: cleanupError } = await asCaller.rpc('delete_own_account_data');
    if (cleanupError) throw cleanupError;

    // Best-effort: remove the old profile photos so they don't stay
    // publicly fetchable at their old URL after the profile is anonymized.
    // Fixed, predictable keys — no need to know if they actually exist.
    await asCaller.storage.from('profile-media').remove([`${userId}/avatar.jpg`, `${userId}/banner.jpg`]);

    // The only step that needs elevated privilege: invalidate the actual
    // auth account. shouldSoftDelete=true keeps the auth.users row (and its
    // id) intact — email/phone get irreversibly hashed, tokens/sessions are
    // purged — so nothing that references profiles.id above is orphaned.
    const asAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { error: deleteError } = await asAdmin.auth.admin.deleteUser(userId, true);
    if (deleteError) throw deleteError;

    // All steps succeeded.
    return json({ success: true });
  } catch (e) {
    // Any failure is logged server-side and reported to the app as a generic
    // retryable error, never the raw Postgres/Auth message.
    console.error('delete-account failed:', e);
    return fail('Could not delete your account. Please try again.', 500);
  }
});
