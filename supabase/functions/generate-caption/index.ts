/**
 * Edge Function: generate-caption (Deno, runs on Supabase, not in the app).
 *
 * **Purpose**: the AI caption assistant. The app sends a spot photo here and gets
 * back a suggested title and short description the user can edit. Called from
 * lib/ai.ts `generateCaption()` through `supabase.functions.invoke('generate-caption')`.
 *
 * **How it works** (three numbered stages, marked in the code below):
 * 1. Validate the request body (a base64 JPEG, size-capped) before touching quota.
 * 2. `authorize()` from _shared/guard.ts verifies the caller's JWT and consumes one
 *    'caption' use via the `consume_ai_quota` RPC (rolling hourly + daily limits).
 * 3. Send the photo plus a fixed prompt to Google Gemini, parse the JSON reply,
 *    and return `{ title, description }`.
 *
 * **Why server-side**: the Gemini key lives only as the Edge Function secret
 * GEMINI_API_KEY (set with `supabase secrets set`). It used to be an EXPO_PUBLIC_*
 * var baked into the app bundle, where anyone could extract it and bill the
 * project. Now the client never sees it (see .claude/rules/security.md).
 *
 * **Gotcha**: every error must go through `fail()` so lib/ai.ts can read `error`
 * off the body; vendor error text is logged, never forwarded to the user.
 */
import { authorize } from '../_shared/guard.ts';
import { corsHeaders, extractJson, fail, json } from '../_shared/http.ts';

// The Gemini model used for photo captions (also listed in CLAUDE.md's stack table).
const GEMINI_MODEL = 'gemini-3.1-flash-lite';
// ~3.7 MB decoded. expo-image-picker at quality 0.6 on a 12MP camera lands
// around 2-4 MB of base64, so this rarely fires — it exists to keep a hostile
// payload from reaching the vendor.
const MAX_BASE64_CHARS = 5_000_000;
// Abort the vendor request if Gemini hasn't answered within 45 seconds.
const VENDOR_TIMEOUT_MS = 45_000;

// Fixed instruction sent alongside the photo. Asking for JSON-only output lets
// the reply be parsed with extractJson() instead of scraped from prose.
const PROMPT =
  'Look at this travel/photography spot photo. Suggest a short, catchy title (max 6 words) and a warm 1-2 sentence description a photographer might write. Respond as JSON only: {"title": "...", "description": "..."}';

/**
 * Request handler, run by `Deno.serve` for every HTTP request to this function.
 * Returns `{ title, description }` on success, or `{ error }` with 400/401/405/413/429/500/502.
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

  // Require a non-empty base64 string and cap its size, all before charging quota
  // (a used quota slot is never refunded, so rejected payloads must not cost one).
  const base64Image = typeof payload?.base64Image === 'string' ? payload.base64Image : '';
  if (!base64Image) return fail('No photo to caption.', 400);
  if (base64Image.length > MAX_BASE64_CHARS) {
    return fail('That photo is too large to caption. Try a smaller one.', 413);
  }

  // The real vendor key, read from Edge Function secrets. Checked BEFORE
  // authorize(), because authorize() consumes a quota slot and there is no
  // refund path: checking afterwards would charge every caller for a request
  // that can never succeed while the secret is missing.
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set — run: supabase secrets set GEMINI_API_KEY=...');
    return fail('Caption generation is not configured. Please contact support.', 500);
  }

  // --- 2. Auth + quota ------------------------------------------------------
  const auth = await authorize(req, 'caption');
  if (!auth.ok) return auth.response;

  // --- 3. Vendor call -------------------------------------------------------
  // Key goes in the x-goog-api-key header rather than the ?key= query param the
  // old client used — request URLs end up in Edge Function logs, headers do not.
  let res: Response;
  try {
    // Multimodal request: one text part (the prompt) and one inline image part.
    // AbortSignal.timeout cancels the fetch if Gemini hangs, which lands in the catch.
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal: AbortSignal.timeout(VENDOR_TIMEOUT_MS),
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                { inline_data: { mime_type: 'image/jpeg', data: base64Image } },
              ],
            },
          ],
        }),
      },
    );
  // Network failure or timeout reaching Gemini.
  } catch (e) {
    console.error('Gemini fetch failed:', e);
    return fail('The caption service is unreachable right now. Please try again.', 502);
  }

  // Read the body even on errors (for logging); tolerate a non-JSON body.
  const body = await res.json().catch(() => null);

  // Vendor rejected the call: log its message server-side, send the user a generic one.
  if (!res.ok) {
    console.error('Gemini error', res.status, body?.error?.message);
    return fail('Caption generation failed. Please try again.', 502);
  }

  // Dig the text out of Gemini's response envelope and parse it as JSON.
  // Any missing level or invalid JSON throws into the catch below. Fields are
  // coerced to strings so the app always receives the documented shape.
  try {
    const text = body.candidates[0].content.parts[0].text;
    const parsed = extractJson(text);
    return json({
      title: String(parsed?.title ?? ''),
      description: String(parsed?.description ?? ''),
    });
  } catch (e) {
    console.error('Gemini response parse failed:', e);
    return fail('The suggestion came back in an unexpected format. Please try again.', 502);
  }
});
