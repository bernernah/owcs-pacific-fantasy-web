// ============================================================================
// OWCS PACIFIC FANTASY — CENTRAL LEAGUE CONFIGURATION
// Edit the constants below to control lock timers, pre-season state, and rules.
// ============================================================================

export const FANTASY_CONFIG = {
  /**
   * 1. NEXT TRANSFER LOCK DEADLINE
   * Powers the live countdown timer on the /transfers page.
   * Format: YYYY-MM-DDTHH:mm:ss+08:00 (AWST / SGT)
   */
  NEXT_TRANSFER_LOCK_DEADLINE:
    process.env.NEXT_PUBLIC_TRANSFER_DEADLINE || '2026-10-26T18:00:00+08:00',

  /**
   * 2. PRE-SEASON CUTOFF (GAMEWEEK 1 LOCK)
   * While the current time is BEFORE this timestamp, the league is in "Pre-Season" mode:
   * - All transfers are 100% FREE and UNLIMITED.
   * - Point penalties are 0, and `transfers_used` is saved as 0 in the database.
   */
  SEASON_START_GW1_LOCK: '2026-10-26T18:00:00+08:00',

  /**
   * 3. EXTRA TRANSFER HIT COST
   * Exact fantasy point deduction for each transfer beyond a manager's free allowance
   * once the regular season has started.
   */
  TRANSFER_HIT_PENALTY_PTS: 4,

  /**
   * 4. FREE TRANSFERS PER GAMEWEEK (Post-GW1 Lock)
   */
  REGULAR_SEASON_FREE_TRANSFERS: 1,
  PLAYOFF_WILDCARD_FREE_TRANSFERS: 3,

  /**
   * 5. SALARY CAPS & TEAM CONCENTRATION LIMITS
   */
  REGULAR_SEASON_BUDGET: 100.0,
  PLAYOFF_WILDCARD_BUDGET: 110.0,
  REGULAR_SEASON_MAX_PER_TEAM: 2,
  PLAYOFF_WILDCARD_MAX_PER_TEAM: 3,
} as const;

/**
 * Helper: Returns true if the current date/time is prior to the GW1 lock deadline.
 */
export function isPreSeasonNow(): boolean {
  const gw1LockMs = new Date(FANTASY_CONFIG.SEASON_START_GW1_LOCK).getTime();
  if (Number.isNaN(gw1LockMs)) return false;
  return Date.now() < gw1LockMs;
}