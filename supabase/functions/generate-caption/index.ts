import { authorize } from '../_shared/guard.ts';
import { corsHeaders, extractJson, fail, json } from '../_shared/http.ts';

const GEMINI_MODEL = 'gemini-3.1-flash-lite';
// ~3.7 MB decoded. expo-image-picker at quality 0.6 on a 12MP camera lands
// around 2-4 MB of base64, so this rarely fires — it exists to keep a hostile
// payload from reaching the vendor.
const MAX_BASE64_CHARS = 5_000_000;
const VENDOR_TIMEOUT_MS = 45_000;

const PROMPT =
  'Look at this travel/photography spot photo. Suggest a short, catchy title (max 6 words) and a warm 1-2 sentence description a photographer might write. Respond as JSON only: {"title": "...", "description": "..."}';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Method not allowed.', 405);

  // --- 1. Validate BEFORE charging quota ------------------------------------
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return fail('Malformed request.', 400);
  }

  const base64Image = typeof payload?.base64Image === 'string' ? payload.base64Image : '';
  if (!base64Image) return fail('No photo to caption.', 400);
  if (base64Image.length > MAX_BASE64_CHARS) {
    return fail('That photo is too large to caption. Try a smaller one.', 413);
  }

  // --- 2. Auth + quota ------------------------------------------------------
  const auth = await authorize(req, 'caption');
  if (!auth.ok) return auth.response;

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set — run: supabase secrets set GEMINI_API_KEY=...');
    return fail('Caption generation is not configured. Please contact support.', 500);
  }

  // --- 3. Vendor call -------------------------------------------------------
  // Key goes in the x-goog-api-key header rather than the ?key= query param the
  // old client used — request URLs end up in Edge Function logs, headers do not.
  let res: Response;
  try {
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
  } catch (e) {
    console.error('Gemini fetch failed:', e);
    return fail('The caption service is unreachable right now. Please try again.', 502);
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    console.error('Gemini error', res.status, body?.error?.message);
    return fail('Caption generation failed. Please try again.', 502);
  }

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
