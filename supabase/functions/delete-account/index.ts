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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Method not allowed.', 405);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return fail('You need to be signed in to do this.', 401);

  // Runs as the caller (anon key + forwarded JWT) — used only to identify
  // who's calling and to reach the security-definer cleanup RPC below as
  // that user; it does no direct table writes itself.
  const asCaller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

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

    return json({ success: true });
  } catch (e) {
    console.error('delete-account failed:', e);
    return fail('Could not delete your account. Please try again.', 500);
  }
});
