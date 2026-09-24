/**
 * Shared HTTP helpers for the Supabase Edge Functions (Deno).
 *
 * **Purpose**: gives every function (generate-trail, generate-caption,
 * delete-account) the same CORS headers and the same JSON success/error shape,
 * so the app's single error reader in lib/ai.ts can handle the AI ones uniformly.
 */
// CORS is here for `expo start --web` (package.json has a `web` script and
// react-native-web is a dependency). Native fetch ignores CORS entirely, but a
// web build would preflight because supabase-js sends apikey + Content-Type.

// Sent on every response and on the OPTIONS preflight. Allows any origin and
// only POST, since every function here is called via supabase.functions.invoke().
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Builds a JSON `Response` with CORS headers attached.
 * @param body   Any JSON-serialisable value.
 * @param status HTTP status code, 200 by default.
 */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Every non-2xx MUST have this shape — lib/ai.ts reads `error` off the body to
// build the Alert message. Never return a 200 with an error field: invoke()
// would put it in `data` and never populate `error`.
/**
 * Builds an error response in the `{ error: message }` shape the app expects.
 * `message` is shown to the user, so it should be friendly and never contain vendor detail.
 */
export function fail(message: string, status: number): Response {
  return json({ error: message }, status);
}

/**
 * Parses JSON out of an LLM reply. Models sometimes wrap JSON in a Markdown
 * code fence (a json-tagged triple-backtick block) even when asked not to, so
 * the fences are stripped before `JSON.parse`. Throws if the remaining text
 * still isn't valid JSON; callers catch that and return a 502. Returns `any`
 * because this is the untyped parse boundary; callers coerce each field right after.
 */
export function extractJson(text: string): any {
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}
