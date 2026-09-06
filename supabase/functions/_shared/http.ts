// CORS is here for `expo start --web` (package.json has a `web` script and
// react-native-web is a dependency). Native fetch ignores CORS entirely, but a
// web build would preflight because supabase-js sends apikey + Content-Type.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Every non-2xx MUST have this shape — lib/ai.ts reads `error` off the body to
// build the Alert message. Never return a 200 with an error field: invoke()
// would put it in `data` and never populate `error`.
export function fail(message: string, status: number): Response {
  return json({ error: message }, status);
}

export function extractJson(text: string): any {
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}
