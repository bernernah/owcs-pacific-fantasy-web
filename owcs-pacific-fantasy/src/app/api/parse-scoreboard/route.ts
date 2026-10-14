import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, SchemaType, type Schema } from '@google/generative-ai';
import { getCurrentUserProfile } from '@/lib/supabase/server';

const scoreboardResponseSchema: Schema = {
  type: SchemaType.ARRAY,
  description: 'List of player stat lines extracted from an Overwatch 2 post-match scoreboard.',
  items: {
    type: SchemaType.OBJECT,
    properties: {
      player_name: {
        type: SchemaType.STRING,
        description: 'Player BattleTag/name without team clan tags or brackets.',
      },
      role: {
        type: SchemaType.STRING,
        format: 'enum',
        enum: ['TANK', 'DPS', 'SUPPORT'],
        description: 'Overwatch role: TANK, DPS, or SUPPORT.',
      },
      elims: {
        type: SchemaType.INTEGER,
        description: 'Eliminations (E column).',
      },
      deaths: {
        type: SchemaType.INTEGER,
        description: 'Deaths (D column).',
      },
      damage: {
        type: SchemaType.INTEGER,
        description: 'Total hero damage dealt (integer without commas).',
      },
      healing: {
        type: SchemaType.INTEGER,
        description: 'Total healing done (integer without commas).',
      },
      map_won: {
        type: SchemaType.BOOLEAN,
        description: 'True if this player belongs to the team that won the map, otherwise false.',
      },
    },
    required: [
      'player_name',
      'role',
      'elims',
      'deaths',
      'damage',
      'healing',
      'map_won',
    ],
  },
};

export async function POST(request: Request) {
  try {
    // 1. Verify Admin Authorization via Supabase Session + Discord ID
    const profile = await getCurrentUserProfile();
    const isAuthorizedAdmin =
      Boolean(profile?.is_admin) ||
      (Boolean(profile?.discord_id) &&
        profile?.discord_id === process.env.NEXT_PUBLIC_ADMIN_DISCORD_ID);

    if (!isAuthorizedAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized: Commissioner access required.' },
        { status: 403 }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'Missing GEMINI_API_KEY in server environment variables.' },
        { status: 500 }
      );
    }

    // 2. Parse Uploaded Screenshot File
    const formData = await request.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No scoreboard image provided.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = file.type || 'image/png';

    // 3. Configure Gemini Flash with Structured JSON Schema Output
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: scoreboardResponseSchema,
        temperature: 0.1,
      },
    });

    const prompt = `
      You are an esports telemetry parser for the Overwatch Champions Series (OWCS).
      Extract all player statistics from this Overwatch 2 scoreboard screenshot.

      Important Overwatch 2 Scoreboard Rules:
      1. There are typically 10 players total (5 on Team 1, 5 on Team 2).
      2. Within each 5-player team block, rows are ordered by Role:
         - 1st row of a team: TANK
         - 2nd & 3rd rows of a team: DPS
         - 4th & 5th rows of a team: SUPPORT
      3. Stat columns in standard OW2 scoreboards are ordered:
         - Eliminations (E)
         - Assists (A) -> Ignore Assists
         - Deaths (D)
         - Damage Dealt (DMG) -> Strip commas/periods and return full integer
         - Healing Done (H) -> Strip commas/periods and return full integer
         - Mitigated (MIT) -> Ignore Mitigated
      4. Strip team prefixes/clan tags from player_name (e.g., "DAF Clear" -> "Clear").
      5. If the scoreboard shows which team won the map, set map_won = true for the 5 winning players and false for the 5 losing players. If unclear, default map_won to false.
    `;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Image,
          mimeType,
        },
      },
    ]);

    const responseText = result.response.text();
    const parsedRows = JSON.parse(responseText);

    return NextResponse.json({ players: parsedRows });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to parse scoreboard image.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}