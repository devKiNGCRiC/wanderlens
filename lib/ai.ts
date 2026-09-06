import { supabase } from '@/lib/supabase';

// The Groq/Gemini keys, models, and prompts now live server-side in
// supabase/functions/generate-trail and supabase/functions/generate-caption.
// This file is a thin, typed transport — nothing here is a secret.

export type TrailResult = { stops: { id: string; tip: string }[]; summary: string };
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

async function invokeAi<T>(name: string, body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body, timeout: TIMEOUT_MS });
  if (error) throw new Error(await messageFor(error, fallback));
  if (!data || typeof data !== 'object') throw new Error(fallback);
  return data as T;
}

export async function generateTrail(spots: any[], genrePreference: string | null, stopCount: number) {
  return invokeAi<TrailResult>(
    'generate-trail',
    { spots, genrePreference, stopCount },
    'Trail generation failed. Please try again.',
  );
}

export async function generateCaption(base64Image: string) {
  return invokeAi<CaptionResult>(
    'generate-caption',
    { base64Image },
    'Caption generation failed. Please try again.',
  );
}
