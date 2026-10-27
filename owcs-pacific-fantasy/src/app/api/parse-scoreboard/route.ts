import { NextRequest, NextResponse } from 'next/server';

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Executes the fetch call to Google's Gemini REST API with a 3-attempt
 * exponential backoff loop that silently retries on 503 Service Unavailable.
 */
async function fetchGeminiWithRetry(
  url: string,
  init: RequestInit,
  maxAttempts: number = MAX_ATTEMPTS
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, init);

      // If not a 503 Service Unavailable, return immediately
      if (response.status !== 503) {
        return response;
      }

      // If 503 and we still have retries left, wait exponentially and retry silently
      if (attempt < maxAttempts) {
        const backoffMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await sleep(backoffMs);
        continue;
      }

      return response;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxAttempts) {
        const backoffMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await sleep(backoffMs);
        continue;
      }
    }
  }

  throw lastError ?? new Error('Gemini API request failed after 3 attempts.');
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing GEMINI_API_KEY in server environment variables.' },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No scoreboard image provided.' },
        { status: 400 }
      );
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload an image.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: 'Image exceeds the 5MB maximum file size limit.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');

    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const prompt = `Extract all 10 Overwatch 2 players and their stats from this scoreboard screenshot.
Return ONLY a valid JSON object matching this exact structure:
{
  "players": [
    {
      "player_name": "string (exact BattleTag/name shown, without clan tag brackets)",
      "elims": number (Eliminations / Kills column),
      "deaths": number (Deaths column),
      "damage": number (Hero Damage column, integer without commas),
      "healing": number (Healing column, integer without commas),
      "map_won": boolean (true if their team won the map, else false)
    }
  ]
}`;

    const geminiResponse = await fetchGeminiWithRetry(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: file.type,
                  data: base64Image,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      return NextResponse.json(
        {
          error: `Gemini API Error (${geminiResponse.status}): ${
            geminiResponse.status === 503
              ? 'Google Gemini is temporarily overloaded (503) after 3 retry attempts. Please try again in a few seconds.'
              : errText
          }`,
        },
        { status: geminiResponse.status }
      );
    }

    const resultJson = await geminiResponse.json();
    const rawText =
      resultJson?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

    const cleanedJson = rawText
      .replace(/^```json\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const parsed = JSON.parse(cleanedJson);

    return NextResponse.json({
      players: Array.isArray(parsed.players) ? parsed.players : [],
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Unexpected error while parsing scoreboard screenshot.',
      },
      { status: 500 }
    );
  }
}