/**
 * lib/ai.ts: client-side entry point for Wanderlens's two AI features.
 *
 * Purpose: `generateTrail` powers the Photo-Trail Generator
 * (app/trail-generator.tsx), which asks the model to order real community
 * spots into a route with a tip per stop. `generateCaption` powers the caption
 * assistant in app/add-spot.tsx, which suggests a title and description from a
 * photo. Both are supporting features grounded in the app's own data (see the
 * thesis in CLAUDE.md).
 *
 * How it works:
 * - Each call goes to a Supabase Edge Function (server-side code hosted by
 *   Supabase) via `supabase.functions.invoke`, which sends the user's JWT.
 * - The functions verify the user, enforce a per-user quota
 *   (`consume_ai_quota()`), then call Groq (trail) or Gemini (caption).
 * - Errors are converted into a user-readable sentence and thrown, so screens
 *   can show `err.message` in an Alert.
 *
 * Why Edge Functions: API keys shipped in the app bundle (EXPO_PUBLIC_*) can
 * be extracted by anyone. The keys now live only as Supabase secrets; see
 * .claude/rules/security.md. Never add a vendor key to the client.
 */
import { supabase } from '@/lib/supabase';

// The Groq/Gemini keys, models, and prompts now live server-side in
// supabase/functions/generate-trail and supabase/functions/generate-caption.
// This file is a thin, typed transport — nothing here is a secret.

/** Response from generate-trail: ordered stops (spot id + photo tip) and an overall summary. */
export type TrailResult = { stops: { id: string; tip: string }[]; summary: string };
/** Response from generate-caption: a suggested spot title and description. */
export type CaptionResult = { title: string; description: string };

// RN's fetch has no default timeout; an LLM call behind a dead tunnel would
// otherwise spin forever. `timeout` is supported by @supabase/functions-js v2.
const TIMEOUT_MS = 60_000;

/**
 * Turns whatever `functions.invoke` hands back into a sentence worth showing in
 * an Alert. The default `error.message` on a non-2xx is the useless constant
 * 'Edge Function returned a non-2xx status code' — the real message is in the
 * JSON body, reachable through `error.context`.
 */
async function messageFor(error: any, fallback: string): Promise<string> {
  // FunctionsHttpError: `context` is the raw Response. Our Edge Functions always
  // answer a non-2xx with { error: "<sentence>" }. Body is single-read, so read
  // it exactly once and don't log the Response first.
  const context = error?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json();
      if (typeof body?.error === 'string' && body.error) return body.error;
    } catch {
      // Body was not JSON (e.g. a gateway 502/413 HTML page) — fall through.
    }
  }
  // FunctionsFetchError: `context` is the raw fetch error, not a Response — the
  // request never landed at all.
  if (error?.name === 'FunctionsFetchError') {
    return 'Network problem — check your connection and try again.';
  }
  return fallback;
}

/**
 * Shared wrapper: invokes Edge Function `name` with a JSON `body`.
 * @returns The response data, cast to T (not validated beyond "is an object").
 * @throws Error with a user-facing message on any failure or empty response.
 */
async function invokeAi<T>(name: string, body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body, timeout: TIMEOUT_MS });
  if (error) throw new Error(await messageFor(error, fallback));
  if (!data || typeof data !== 'object') throw new Error(fallback);
  return data as T;
}

/**
 * Asks the model to sequence candidate spots into a photo trail.
 * @param spots Real community spots the model may choose from (shape set by app/trail-generator.tsx).
 * @param genrePreference Optional photography genre to favour, or null.
 * @param stopCount How many stops the trail should have.
 */
export async function generateTrail(spots: any[], genrePreference: string | null, stopCount: number) {
  return invokeAi<TrailResult>(
    'generate-trail',
    { spots, genrePreference, stopCount },
    'Trail generation failed. Please try again.',
  );
}

/**
 * Asks the vision model for a title and description of a photo.
 * @param base64Image The photo encoded as base64.
 */
export async function generateCaption(base64Image: string) {
  return invokeAi<CaptionResult>(
    'generate-caption',
    { base64Image },
    'Caption generation failed. Please try again.',
  );
}
