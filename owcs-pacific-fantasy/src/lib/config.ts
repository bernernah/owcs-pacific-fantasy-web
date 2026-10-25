import type { SupabaseClient } from '@supabase/supabase-js';

export const SCORING_MULTIPLIERS = {
  /** Points awarded per 3 full Eliminations / Kills (Math.floor(kills / 3)) */
  POINTS_PER_KILL: 1.0,

  /** Points deducted per Death (use a negative number, e.g. -1.0) */
  POINTS_PER_DEATH: -1.0,

  /** Points awarded per 1,000 Hero Damage dealt */
  POINTS_PER_1K_DAMAGE: 1.0,

  /** Points awarded per 1,000 Healing done */
  POINTS_PER_1K_HEALING: 1.0,

  /** Flat bonus points awarded if the player's team won the map */
  POINTS_PER_MAP_WIN: 3.0,

  /** Multiplier applied to a manager's designated Captain (1.5 = +50% points) */
  CAPTAIN_MULTIPLIER: 1.5,
} as const;

export const FANTASY_CONFIG = {
  NEXT_TRANSFER_LOCK_DEADLINE:
    process.env.NEXT_PUBLIC_TRANSFER_DEADLINE || '2026-11-04T17:45:00+07:00',

  SEASON_START_GW1_LOCK: '2026-11-04T17:45:00+07:00',

  /** Exact point penalty per extra transfer (displayed as -15 pts in UI) */
  TRANSFER_HIT_PENALTY_PTS: 15,

  REGULAR_SEASON_FREE_TRANSFERS: 1,
  MAX_ROLLED_FREE_TRANSFERS: 2,
  PLAYOFF_WILDCARD_FREE_TRANSFERS: 3,

  REGULAR_SEASON_BUDGET: 100.0,

  /** Relative bonus added to each manager's current personal_budget for Playoffs */
  PLAYOFF_BUDGET_BONUS: 5.0,

  REGULAR_SEASON_MAX_PER_TEAM: 2,
  PLAYOFF_WILDCARD_MAX_PER_TEAM: 3,

  SCORING: SCORING_MULTIPLIERS,
} as const;

export function calculatePlayerFantasyPoints(stats: {
  kills: number;
  deaths: number;
  damage: number;
  healing: number;
  map_won: boolean;
}): number {
  const elimPoints =
    Math.floor(Number(stats.kills) / 3) * SCORING_MULTIPLIERS.POINTS_PER_KILL;

  const pts =
    elimPoints +
    Number(stats.deaths) * SCORING_MULTIPLIERS.POINTS_PER_DEATH +
    (Number(stats.damage) / 1000.0) * SCORING_MULTIPLIERS.POINTS_PER_1K_DAMAGE +
    (Number(stats.healing) / 1000.0) *
      SCORING_MULTIPLIERS.POINTS_PER_1K_HEALING +
    (stats.map_won ? SCORING_MULTIPLIERS.POINTS_PER_MAP_WIN : 0.0);

  return Number(pts.toFixed(2));
}

export async function syncConfigToDatabase(supabase: SupabaseClient) {
  await supabase.rpc('sync_scoring_config', {
    p_kill: SCORING_MULTIPLIERS.POINTS_PER_KILL,
    p_death: SCORING_MULTIPLIERS.POINTS_PER_DEATH,
    p_dmg: SCORING_MULTIPLIERS.POINTS_PER_1K_DAMAGE,
    p_heal: SCORING_MULTIPLIERS.POINTS_PER_1K_HEALING,
    p_win: SCORING_MULTIPLIERS.POINTS_PER_MAP_WIN,
    p_captain_mult: SCORING_MULTIPLIERS.CAPTAIN_MULTIPLIER,
    p_transfer_penalty: Math.abs(FANTASY_CONFIG.TRANSFER_HIT_PENALTY_PTS),
    p_playoff_bonus: FANTASY_CONFIG.PLAYOFF_BUDGET_BONUS,
  });
}

export function isPreSeasonNow(): boolean {
  const gw1LockMs = new Date(FANTASY_CONFIG.SEASON_START_GW1_LOCK).getTime();
  if (Number.isNaN(gw1LockMs)) return false;
  return Date.now() < gw1LockMs;
}