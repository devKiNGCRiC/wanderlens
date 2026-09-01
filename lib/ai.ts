const GROQ_MODEL = 'openai/gpt-oss-120b';
const GEMINI_MODEL = 'gemini-3.1-flash-lite';

function extractJson(text: string): any {
  const cleaned = text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

export async function generateTrail(spots: any[], genrePreference: string | null, stopCount: number) {
  const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
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
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || 'Trail generation failed');
  return extractJson(json.choices[0].message.content) as { stops: { id: string; tip: string }[]; summary: string };
}

export async function generateCaption(base64Image: string) {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: 'Look at this travel/photography spot photo. Suggest a short, catchy title (max 6 words) and a warm 1-2 sentence description a photographer might write. Respond as JSON only: {"title": "...", "description": "..."}' },
          { inline_data: { mime_type: 'image/jpeg', data: base64Image } },
        ],
      }],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || 'Caption generation failed');
  const text = json.candidates[0].content.parts[0].text;
  return extractJson(text) as { title: string; description: string };
}