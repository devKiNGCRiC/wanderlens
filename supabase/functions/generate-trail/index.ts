/**
 * Edge Function: generate-trail (Deno, runs on Supabase, not in the app).
 *
 * **Purpose**: the Photo-Trail Generator. The app sends real community spots;
 * an LLM picks a few and orders them into a single outing with a tip per stop.
 * It sequences existing spots only and never invents new ones, which keeps the
 * AI grounded in the app's own community data (the core thesis in CLAUDE.md).
 * Called from lib/ai.ts `generateTrail()` through
 * `supabase.functions.invoke('generate-trail')`.
 *
 * **How it works** (three numbered stages, marked in the code below):
 * 1. Validate and sanitise the payload: spots (capped at MAX_SPOTS and trimmed to
 *    the fields the model needs), stopCount (clamped 1-10), optional genre preference.
 * 2. `authorize()` from _shared/guard.ts verifies the caller's JWT and consumes one
 *    'trail' use via the `consume_ai_quota` RPC (rolling hourly + daily limits).
 * 3. Call Groq's OpenAI-compatible chat API in JSON mode, then return
 *    `{ stops: [{ id, tip }], summary }`.
 *
 * **Why server-side**: the Groq key lives only as the Edge Function secret
 * GROQ_API_KEY. It used to be an EXPO_PUBLIC_* var inside the app bundle, where
 * anyone could extract and bill it; now the client never sees it, and every call
 * is tied to a signed-in user with a rate limit (see .claude/rules/security.md).
 */
import { authorize } from '../_shared/guard.ts';
import { corsHeaders, extractJson, fail, json } from '../_shared/http.ts';

// The Groq-hosted model used for trail planning (also listed in CLAUDE.md's stack table).
const GROQ_MODEL = 'openai/gpt-oss-120b';
const MAX_SPOTS = 60;          // bounds prompt size, i.e. bounds cost per call
// Abort the vendor request if Groq hasn't answered within 45 seconds.
const VENDOR_TIMEOUT_MS = 45_000;

/**
 * Request handler, run by `Deno.serve` for every HTTP request to this function.
 * Returns `{ stops, summary }` on success, or `{ error }` with 400/401/405/429/500/502.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Method not allowed.', 405);

  // --- 1. Validate BEFORE charging quota ------------------------------------
  // Malformed JSON is a client bug, not a quota-worthy call: fail fast with 400.
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return fail('Malformed request.', 400);
  }

  const rawSpots = Array.isArray(payload?.spots) ? payload.spots : [];
  if (rawSpots.length === 0) return fail('No spots to build a trail from.', 400);

  // Never trust the client for shape or size. Strip to the fields the model
  // actually reasons over — nearby_spots also returns photo_url, a long signed
  // URL the model never uses and that we'd pay tokens for.
  const spots = rawSpots
    .slice(0, MAX_SPOTS)
    .map((s: any) => ({
      id: String(s?.id ?? ''),
      title: String(s?.title ?? ''),
      genre: s?.genre ?? null,
      best_time: s?.best_time ?? null,
      time_of_day: s?.time_of_day ?? null,
      lat: Number(s?.lat),
      lng: Number(s?.lng),
      location_label: s?.location_label ?? null,
    }))
    // Drop spots with no id or with non-numeric coordinates; the model can't place them.
    .filter((s: any) => s.id && Number.isFinite(s.lat) && Number.isFinite(s.lng));

  if (spots.length === 0) return fail('No usable spots to build a trail from.', 400);

  // Clamp the requested stop count to a whole number between 1 and 10
  // (missing, zero, or non-numeric falls back to 4), and cap the free-text genre
  // at 40 characters since it's pasted straight into the prompt.
  const stopCount = Math.min(Math.max(Math.trunc(Number(payload?.stopCount) || 4), 1), 10);
  const genrePreference =
    typeof payload?.genrePreference === 'string' && payload.genrePreference.trim()
      ? payload.genrePreference.trim().slice(0, 40)
      : null;

  // --- 2. Auth + quota ------------------------------------------------------
  const auth = await authorize(req, 'trail');
  if (!auth.ok) return auth.response;

  // The real vendor key, read from Edge Function secrets. This check runs after
  // authorize(), so a missing key still consumes the caller's quota slot.
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) {
    console.error('GROQ_API_KEY is not set — run: supabase secrets set GROQ_API_KEY=...');
    return fail('Trail generation is not configured. Please contact support.', 500);
  }

  // --- 3. Vendor call (prompt is byte-for-byte the original lib/ai.ts one) ---
  let res: Response;
  // JSON mode (`response_format: json_object`) asks Groq to return valid JSON.
  // The system message carries the "only use the real spots provided" rule;
  // the user message carries the sanitised spot list.
  try {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(VENDOR_TIMEOUT_MS),
      body: JSON.stringify({
        model: GROQ_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You plan photography trails using ONLY the real spots provided — never invent new locations. Pick up to ${stopCount} spots that make sense as a single outing, order them logically by geographic proximity and best shooting time-of-day, and give a one-sentence tip for each stop. Respond as JSON: {"stops": [{"id": "...", "tip": "..."}], "summary": "..."}`,
          },
          {
            role: 'user',
            content: `Genre preference: ${genrePreference || 'any'}\n\nAvailable spots:\n${JSON.stringify(spots)}`,
          },
        ],
      }),
    });
  // Network failure or timeout reaching Groq.
  } catch (e) {
    console.error('Groq fetch failed:', e);
    return fail('The trail service is unreachable right now. Please try again.', 502);
  }

  // Read the body even on errors (for logging); tolerate a non-JSON body.
  const body = await res.json().catch(() => null);

  // Log the vendor's message, never forward it — vendor errors can carry
  // account/key/quota detail that must not reach the client.
  if (!res.ok) {
    console.error('Groq error', res.status, body?.error?.message);
    return fail('Trail generation failed. Please try again.', 502);
  }

  // Parse the model's JSON, require a `stops` array, drop entries with no id, and
  // coerce fields to strings. Ids are not checked against the submitted spots here;
  // the app matches them back to its own spot list.
  try {
    const parsed = extractJson(body.choices[0].message.content);
    if (!Array.isArray(parsed?.stops)) throw new Error('missing stops array');
    return json({
      stops: parsed.stops
        .filter((s: any) => s?.id)
        .map((s: any) => ({ id: String(s.id), tip: String(s.tip ?? '') })),
      summary: String(parsed.summary ?? ''),
    });
  } catch (e) {
    console.error('Groq response parse failed:', e);
    return fail('The trail came back in an unexpected format. Please try again.', 502);
  }
});
