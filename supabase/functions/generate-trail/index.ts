import { authorize } from '../_shared/guard.ts';
import { corsHeaders, extractJson, fail, json } from '../_shared/http.ts';

const GROQ_MODEL = 'openai/gpt-oss-120b';
const MAX_SPOTS = 60;          // bounds prompt size, i.e. bounds cost per call
const VENDOR_TIMEOUT_MS = 45_000;

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
    .filter((s: any) => s.id && Number.isFinite(s.lat) && Number.isFinite(s.lng));

  if (spots.length === 0) return fail('No usable spots to build a trail from.', 400);

  const stopCount = Math.min(Math.max(Math.trunc(Number(payload?.stopCount) || 4), 1), 10);
  const genrePreference =
    typeof payload?.genrePreference === 'string' && payload.genrePreference.trim()
      ? payload.genrePreference.trim().slice(0, 40)
      : null;

  // --- 2. Auth + quota ------------------------------------------------------
  const auth = await authorize(req, 'trail');
  if (!auth.ok) return auth.response;

  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) {
    console.error('GROQ_API_KEY is not set — run: supabase secrets set GROQ_API_KEY=...');
    return fail('Trail generation is not configured. Please contact support.', 500);
  }

  // --- 3. Vendor call (prompt is byte-for-byte the original lib/ai.ts one) ---
  let res: Response;
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
  } catch (e) {
    console.error('Groq fetch failed:', e);
    return fail('The trail service is unreachable right now. Please try again.', 502);
  }

  const body = await res.json().catch(() => null);

  // Log the vendor's message, never forward it — vendor errors can carry
  // account/key/quota detail that must not reach the client.
  if (!res.ok) {
    console.error('Groq error', res.status, body?.error?.message);
    return fail('Trail generation failed. Please try again.', 502);
  }

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
