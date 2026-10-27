import type { ExtractedScoreboardRow, Player } from '@/types/fantasy';

/**
 * Normalizes a BattleTag for fuzzy OCR comparison.
 */
function normalizeTag(raw: string): string {
    return raw
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .replace(/1|l/g, 'i')
        .replace(/0/g, 'o')
        .replace(/2/g, 'z')
        .replace(/5/g, 's');
}

/**
 * Computes Levenshtein edit distance between two strings for fuzzy BattleTag matching.
 */
function editDistance(a: string, b: string): number {
    const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
        Array(b.length + 1).fill(0)
    );
    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost
            );
        }
    }
    return dp[a.length][b.length];
}

/**
 * Matches a noisy OCR name token against known database players.
 */
function matchKnownPlayerName(
    rawCandidate: string,
    knownPlayers: Player[]
): string {
    const normCandidate = normalizeTag(rawCandidate);
    if (!normCandidate) return rawCandidate.trim();

    // 1. Exact or substring normalized match
    for (const p of knownPlayers) {
        const normDb = normalizeTag(p.name);
        if (normDb === normCandidate) return p.name;
        if (
            normDb.length >= 3 &&
            (normCandidate.includes(normDb) || normDb.includes(normCandidate))
        ) {
            return p.name;
        }
    }

    // 2. Closest Levenshtein distance (within <= 2 character edits)
    let bestPlayer: Player | null = null;
    let bestDist = Infinity;

    for (const p of knownPlayers) {
        const normDb = normalizeTag(p.name);
        const dist = editDistance(normCandidate, normDb);
        const maxAllowed = normDb.length <= 4 ? 1 : 2;
        if (dist <= maxAllowed && dist < bestDist) {
            bestDist = dist;
            bestPlayer = p;
        }
    }

    return bestPlayer ? bestPlayer.name : rawCandidate.trim();
}

/**
 * Pre-processes the scoreboard image on an offscreen canvas to boost contrast
 * for Overwatch 2's light-text-on-dark-background scoreboard layout.
 */
async function preprocessScoreboardImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);

        img.onload = () => {
            try {
                const scale = img.width < 1600 ? 1.5 : 1;
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    URL.revokeObjectURL(objectUrl);
                    resolve(objectUrl);
                    return;
                }

                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;

                // Convert to inverted high-contrast grayscale (dark text on white background for Tesseract)
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

                    // Boost contrast and invert so bright OW2 scoreboard text becomes dark ink
                    const contrast = luminance > 135 ? 0 : 255;
                    data[i] = contrast;
                    data[i + 1] = contrast;
                    data[i + 2] = contrast;
                }

                ctx.putImageData(imageData, 0, 0);
                URL.revokeObjectURL(objectUrl);
                resolve(canvas.toDataURL('image/png'));
            } catch (err) {
                URL.revokeObjectURL(objectUrl);
                reject(err);
            }
        };

        img.onerror = (err) => {
            URL.revokeObjectURL(objectUrl);
            reject(err);
        };

        img.src = objectUrl;
    });
}

/**
 * Parses raw Tesseract OCR text lines into Overwatch 2 ExtractedScoreboardRow objects.
 * Standard OW2 Scoreboard columns: [Player Name] | E | A | D | DMG | H | MIT
 */
export function parseOcrTextToScoreboardRows(
    rawText: string,
    knownPlayers: Player[]
): ExtractedScoreboardRow[] {
    const lines = rawText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 3);

    const extracted: ExtractedScoreboardRow[] = [];
    const seenNames = new Set<string>();

    for (const line of lines) {
        // Strip thousands-separator commas inside numbers (e.g. "12,450" -> "12450")
        const cleanedLine = line.replace(/(\d),(\d{3})\b/g, '$1$2');

        // Match all integer groups on the line
        const numberMatches = Array.from(cleanedLine.matchAll(/\b\d+\b/g));
        if (numberMatches.length < 4) {
            continue;
        }

        // Everything before the first stat column number is the candidate player name
        const firstNumIndex = numberMatches[0].index ?? 0;
        const rawNameSegment = cleanedLine
            .slice(0, firstNumIndex)
            .replace(/\[.*?\]/g, '') // Remove clan tags in brackets
            .replace(/[^a-zA-Z0-9_\- ]/g, ' ')
            .trim();

        // Take the last token of the name segment (in case role icon / clan prefix produced leading noise)
        const nameTokens = rawNameSegment.split(/\s+/).filter(Boolean);
        const candidateName =
            nameTokens.length > 0 ? nameTokens[nameTokens.length - 1] : '';

        if (candidateName.length < 2) {
            continue;
        }

        const nums = numberMatches.map((m) => parseInt(m[0], 10));

        let elims = 0;
        let deaths = 0;
        let damage = 0;
        let healing = 0;

        if (nums.length >= 6) {
            // Standard 6-stat OW2 row: [Elims, Assists, Deaths, Damage, Healing, Mitigated]
            elims = nums[0];
            deaths = nums[2];
            damage = nums[3];
            healing = nums[4];
        } else if (nums.length === 5) {
            // 5 numbers: either [Elims, Assists, Deaths, Damage, Healing] or [Elims, Deaths, Damage, Healing, Mitigated]
            if (nums[1] <= 60 && nums[2] <= 40 && nums[3] >= 500) {
                elims = nums[0];
                deaths = nums[2];
                damage = nums[3];
                healing = nums[4];
            } else {
                elims = nums[0];
                deaths = nums[1];
                damage = nums[2];
                healing = nums[3];
            }
        } else {
            // 4 numbers: [Elims, Deaths, Damage, Healing]
            elims = nums[0];
            deaths = nums[1];
            damage = nums[2];
            healing = nums[3];
        }

        // Sanity check bounds so random UI numbers aren't treated as player rows
        if (elims > 150 || deaths > 100) {
            continue;
        }

        const resolvedName = matchKnownPlayerName(candidateName, knownPlayers);
        const dedupeKey = resolvedName.toLowerCase();

        if (!seenNames.has(dedupeKey)) {
            seenNames.add(dedupeKey);
            extracted.push({
                player_name: resolvedName,
                role: '' as any,
                elims,
                deaths,
                damage,
                healing,
                map_won: false,
            });
        }
    }

    return extracted;
}

/**
 * Runs Tesseract.js directly in the browser and returns parsed OW2 scoreboard rows.
 */
export async function runLocalTesseractScoreboardOcr(
    file: File,
    knownPlayers: Player[],
    onProgress?: (statusText: string) => void
): Promise<ExtractedScoreboardRow[]> {
    if (onProgress) {
        onProgress('Preparing image for local OCR...');
    }

    const processedDataUrl = await preprocessScoreboardImage(file);
    const Tesseract = await import('tesseract.js');

    const result = await Tesseract.recognize(processedDataUrl, 'eng', {
        logger: (m: { status?: string; progress?: number }) => {
            if (onProgress && m.status === 'recognizing text') {
                const pct = Math.round((m.progress ?? 0) * 100);
                onProgress(`Local Tesseract OCR (${pct}%)...`);
            }
        },
    });

    const rawText = result?.data?.text ?? '';
    return parseOcrTextToScoreboardRows(rawText, knownPlayers);
}