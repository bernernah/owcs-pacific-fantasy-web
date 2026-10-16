'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Trophy,
  Search,
  Users,
  X,
  Shield,
  ArrowUpDown,
  Crown,
  DollarSign,
  Zap,
  BookOpen,
  Swords,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { FANTASY_CONFIG, SCORING_MULTIPLIERS } from '@/lib/config';
import RoleBadge from '@/components/RoleBadge';
import type {
  Profile,
  Gameweek,
  Player,
  UserRoster,
} from '@/types/fantasy';

interface ManagerStandingRow {
  rank: number;
  profile: Profile;
  activeRoster: UserRoster | null;
  tank: Player | null;
  dps1: Player | null;
  dps2: Player | null;
  sup1: Player | null;
  sup2: Player | null;
  captainId: string | null;
  totalBudgetUsed: number;
  totalScore: number;
}

export default function LeaderboardPage() {
  const supabase = getSupabaseBrowserClient();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [gameweeks, setGameweeks] = useState<Gameweek[]>([]);
  const [rosters, setRosters] = useState<UserRoster[]>([]);
  const [playersById, setPlayersById] = useState<Record<string, Player>>({});
  const [loading, setLoading] = useState<boolean>(true);

  const [selectedScope, setSelectedScope] = useState<string>('TOTAL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const [inspectedRow, setInspectedRow] = useState<ManagerStandingRow | null>(
    null
  );

  useEffect(() => {
    async function fetchLeaderboardData() {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const discordId =
          user.user_metadata?.provider_id ||
          user.user_metadata?.sub ||
          user.id;
        const username =
          user.user_metadata?.custom_claims?.global_name ||
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          `Manager_${user.id.slice(0, 6)}`;
        const avatarUrl = user.user_metadata?.avatar_url || null;

        await supabase.from('profiles').upsert(
          {
            id: user.id,
            discord_id: String(discordId),
            username: String(username),
            avatar_url: avatarUrl,
          },
          { onConflict: 'id' }
        );
      }

      const [
        { data: profData },
        { data: gwData },
        { data: rosterData },
        { data: playerData },
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: true }),
        supabase
          .from('gameweeks')
          .select('*')
          .order('number', { ascending: true }),
        supabase
          .from('user_rosters')
          .select('*')
          .order('updated_at', { ascending: false }),
        supabase.from('players').select('*, teams(*)'),
      ]);

      setProfiles((profData as Profile[]) ?? []);
      setGameweeks((gwData as Gameweek[]) ?? []);
      setRosters((rosterData as UserRoster[]) ?? []);

      const map: Record<string, Player> = {};
      if (playerData) {
        for (const p of playerData as Player[]) {
          map[p.id] = p;
        }
      }
      setPlayersById(map);
      setLoading(false);
    }

    fetchLeaderboardData();
  }, [supabase]);

  const activeOrLatestGwId = useMemo(() => {
    if (gameweeks.length === 0) return null;
    const active =
      gameweeks.find((g) => g.status === 'ACTIVE') ??
      gameweeks.find((g) => g.status === 'UPCOMING') ??
      gameweeks[gameweeks.length - 1];
    return active?.id ?? null;
  }, [gameweeks]);

  const leaderboardRows = useMemo(() => {
    const gwNumberById: Record<string, number> = {};
    for (const gw of gameweeks) {
      gwNumberById[gw.id] = gw.number;
    }

    const computed: Omit<ManagerStandingRow, 'rank'>[] = profiles.map(
      (profile) => {
        const userRosters = rosters.filter((r) => r.user_id === profile.id);

        const sortedUserRosters = [...userRosters].sort(
          (a, b) =>
            (gwNumberById[b.gameweek_id] ?? 0) -
            (gwNumberById[a.gameweek_id] ?? 0)
        );

        let displayedRoster: UserRoster | null = null;
        let score = 0;

        if (selectedScope === 'TOTAL') {
          score = userRosters.reduce(
            (sum, r) => sum + Number(r.points_earned ?? 0),
            0
          );
          displayedRoster =
            userRosters.find((r) => r.gameweek_id === activeOrLatestGwId) ??
            sortedUserRosters[0] ??
            null;
        } else {
          const gwRoster =
            userRosters.find((r) => r.gameweek_id === selectedScope) ?? null;
          displayedRoster = gwRoster;
          score = gwRoster ? Number(gwRoster.points_earned ?? 0) : 0;
        }

        const tank =
          displayedRoster && displayedRoster.tank_id
            ? playersById[displayedRoster.tank_id] ?? null
            : null;
        const dps1 =
          displayedRoster && displayedRoster.dps1_id
            ? playersById[displayedRoster.dps1_id] ?? null
            : null;
        const dps2 =
          displayedRoster && displayedRoster.dps2_id
            ? playersById[displayedRoster.dps2_id] ?? null
            : null;
        const sup1 =
          displayedRoster && displayedRoster.sup1_id
            ? playersById[displayedRoster.sup1_id] ?? null
            : null;
        const sup2 =
          displayedRoster && displayedRoster.sup2_id
            ? playersById[displayedRoster.sup2_id] ?? null
            : null;

        const totalBudgetUsed = [tank, dps1, dps2, sup1, sup2].reduce(
          (sum, p) => sum + (p ? Number(p.price) : 0),
          0
        );

        return {
          profile,
          activeRoster: displayedRoster,
          tank,
          dps1,
          dps2,
          sup1,
          sup2,
          captainId: displayedRoster?.captain_id ?? null,
          totalBudgetUsed,
          totalScore: Number(score.toFixed(1)),
        };
      }
    );

    computed.sort((a, b) => {
      if (b.totalScore !== a.totalScore) {
        return sortAsc
          ? a.totalScore - b.totalScore
          : b.totalScore - a.totalScore;
      }
      return a.profile.username.localeCompare(b.profile.username);
    });

    const ranked: ManagerStandingRow[] = [];
    for (let i = 0; i < computed.length; i++) {
      const current = computed[i];
      let rank = i + 1;
      if (i > 0 && current.totalScore === computed[i - 1].totalScore) {
        rank = ranked[i - 1].rank;
      }
      ranked.push({
        ...current,
        rank,
      });
    }

    if (!searchQuery.trim()) return ranked;
    const q = searchQuery.toLowerCase();

    return ranked.filter((row) => {
      const inManager = row.profile.username.toLowerCase().includes(q);
      const inPlayers = [row.tank, row.dps1, row.dps2, row.sup1, row.sup2].some(
        (p) => p?.name.toLowerCase().includes(q)
      );
      return inManager || inPlayers;
    });
  }, [
    profiles,
    rosters,
    playersById,
    gameweeks,
    selectedScope,
    activeOrLatestGwId,
    searchQuery,
    sortAsc,
  ]);

  const formatOrdinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const renderRankCell = (rank: number) => {
    if (rank === 1) {
      return (
        <div className="inline-flex items-center gap-1.5 font-mono font-bold text-amber-400">
          <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
          <span>1st</span>
        </div>
      );
    }
    if (rank === 2) {
      return (
        <div className="inline-flex items-center gap-1.5 font-mono font-bold text-zinc-300">
          <Trophy className="w-4 h-4 text-zinc-300 shrink-0" />
          <span>2nd</span>
        </div>
      );
    }
    if (rank === 3) {
      return (
        <div className="inline-flex items-center gap-1.5 font-mono font-bold text-amber-600">
          <Trophy className="w-4 h-4 text-amber-600 shrink-0" />
          <span>3rd</span>
        </div>
      );
    }
    return (
      <span className="font-mono text-xs font-semibold text-zinc-400 pl-1">
        {formatOrdinal(rank)}
      </span>
    );
  };

  const renderPlayerSlotCell = (
    player: Player | null,
    captainId: string | null
  ) => {
    if (!player) {
      return <span className="text-zinc-600 font-mono text-xs">—</span>;
    }
    const isCapt = captainId === player.id;
    return (
      <div className="inline-flex items-center justify-center gap-1.5">
        <span className="font-semibold text-zinc-100 text-xs sm:text-sm tracking-tight">
          {player.name}
        </span>
        {isCapt && (
          <span
            title={`Team Captain (${SCORING_MULTIPLIERS.CAPTAIN_MULTIPLIER}x Points)`}
            className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-black rounded bg-amber-400 text-zinc-950 leading-none"
          >
            C
          </span>
        )}
      </div>
    );
  };

  const formatSignedStat = (val: number) => (val >= 0 ? `+${val}` : `${val}`);

  return (
    <div className="space-y-6">
      {/* ====================================================================
          PRIZING, CAPTAIN MULTIPLIER & DYNAMIC SCORING RULES PANEL
      ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 1st Place $100 Prize & Captain Boost Card */}
        <div className="lg:col-span-5 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-[#0d1017] to-[#0d1017] p-6 shadow-xl flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[11px] font-black uppercase tracking-wider">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              Official League Prizing
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl sm:text-5xl font-black text-white tracking-tight">
                $100
              </span>
              <span className="text-sm font-extrabold uppercase tracking-wider text-amber-400">
                1st Place Grand Prize
              </span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              The #1 ranked manager on the Global Leaderboard at the conclusion
              of the OWCS Pacific Playoffs takes home the{' '}
              <strong className="text-white">$100 cash prize</strong>.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/70 p-3.5 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-400 text-zinc-950 shrink-0 mt-0.5">
              <Crown className="w-4 h-4 fill-zinc-950" />
            </div>
            <div>
              <p className="text-xs font-black text-white uppercase tracking-wide">
                Captain Role Boost ({SCORING_MULTIPLIERS.CAPTAIN_MULTIPLIER}x
                Points)
              </p>
              <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                Designate one of your 5 starters as your{' '}
                <span className="text-amber-400 font-bold">Captain (C)</span> on
                the My Team sheet. Your Captain&apos;s match points are
                multiplied by{' '}
                <strong className="text-white">
                  {SCORING_MULTIPLIERS.CAPTAIN_MULTIPLIER}x
                </strong>{' '}
                every map!
              </p>
            </div>
          </div>
        </div>

        {/* Dynamic Scoring Formula & Roster Rules Card (Imported from config.ts) */}
        <div className="lg:col-span-7 rounded-2xl border border-zinc-800/90 bg-[#0d1017] p-6 shadow-xl flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-800/80 pb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-orange-400" />
              <h2 className="text-sm font-black uppercase tracking-wider text-white">
                Scoring Telemetry & Roster Rules
              </h2>
            </div>
            <span className="text-[11px] text-zinc-400 font-medium">
              Scored per map played (Bo5 / Bo7)
            </span>
          </div>

          {/* 5 Dynamic Scoring Stat Pills from SCORING_MULTIPLIERS */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                Per Kill (Elim)
              </span>
              <span className="text-base font-black text-emerald-400 font-mono mt-1 block">
                {formatSignedStat(SCORING_MULTIPLIERS.POINTS_PER_KILL)} pt
              </span>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                Per Death
              </span>
              <span className="text-base font-black text-rose-400 font-mono mt-1 block">
                {formatSignedStat(SCORING_MULTIPLIERS.POINTS_PER_DEATH)} pt
              </span>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                Per 1k Damage
              </span>
              <span className="text-base font-black text-sky-400 font-mono mt-1 block">
                {formatSignedStat(SCORING_MULTIPLIERS.POINTS_PER_1K_DAMAGE)} pt
              </span>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                Per 1k Healing
              </span>
              <span className="text-base font-black text-teal-400 font-mono mt-1 block">
                {formatSignedStat(SCORING_MULTIPLIERS.POINTS_PER_1K_HEALING)}{' '}
                pts
              </span>
            </div>

            <div className="col-span-2 sm:col-span-1 rounded-xl border border-orange-500/30 bg-orange-500/10 p-3 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-orange-300 block">
                Map Win Bonus
              </span>
              <span className="text-base font-black text-orange-400 font-mono mt-1 block">
                {formatSignedStat(SCORING_MULTIPLIERS.POINTS_PER_MAP_WIN)} pts
              </span>
            </div>
          </div>

          {/* Roster & Transfer Rules Summary from FANTASY_CONFIG */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
            <div className="rounded-lg bg-zinc-900/40 border border-zinc-800/80 px-3 py-2 flex items-center justify-between">
              <span className="text-zinc-400">Salary Cap:</span>
              <strong className="text-white font-mono">
                ${FANTASY_CONFIG.REGULAR_SEASON_BUDGET}M ($
                {FANTASY_CONFIG.PLAYOFF_WILDCARD_BUDGET}M Playoffs)
              </strong>
            </div>
            <div className="rounded-lg bg-zinc-900/40 border border-zinc-800/80 px-3 py-2 flex items-center justify-between">
              <span className="text-zinc-400">Team Limit:</span>
              <strong className="text-white font-mono">
                Max {FANTASY_CONFIG.REGULAR_SEASON_MAX_PER_TEAM}/team (
                {FANTASY_CONFIG.PLAYOFF_WILDCARD_MAX_PER_TEAM} Playoffs)
              </strong>
            </div>
            <div className="rounded-lg bg-zinc-900/40 border border-zinc-800/80 px-3 py-2 flex items-center justify-between">
              <span className="text-zinc-400">Extra Transfer:</span>
              <strong className="text-rose-400 font-mono">
                -{FANTASY_CONFIG.TRANSFER_HIT_PENALTY_PTS} pts (
                {FANTASY_CONFIG.REGULAR_SEASON_FREE_TRANSFERS} Free/GW)
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* ====================================================================
          MAIN OWTV-STYLE GLOBAL LEADERBOARD
      ==================================================================== */}
      <div className="rounded-2xl border border-zinc-800/90 bg-[#0d1017] p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Global Leaderboard
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              Current standings for OWCS Pacific Stage 2026 • All rosters are
              public
            </p>
          </div>

          <Link
            href="/my-team"
            className="self-start sm:self-auto bg-orange-500 hover:bg-orange-400 text-zinc-950 font-black text-xs uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-orange-500/20"
          >
            Edit My Lineup
          </Link>
        </div>

        {/* OWTV Week Filter Tabs */}
        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-[#080a0f] p-1.5 border border-zinc-800/80">
          <button
            type="button"
            onClick={() => setSelectedScope('TOTAL')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              selectedScope === 'TOTAL'
                ? 'bg-zinc-800 text-white shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Total
          </button>
          {gameweeks.map((gw) => (
            <button
              key={gw.id}
              type="button"
              onClick={() => setSelectedScope(gw.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedScope === gw.id
                  ? 'bg-zinc-800 text-white shadow'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {gw.is_playoffs ? 'Playoffs' : `Week ${gw.number}`}
            </button>
          ))}
        </div>

        {/* Search Input & Participant Count Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search for a manager or player..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#080a0f] border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
            />
          </div>

          <div className="text-xs font-medium text-zinc-400">
            Showing{' '}
            <span className="text-zinc-200 font-bold">
              {leaderboardRows.length}
            </span>{' '}
            of <span className="text-zinc-200 font-bold">{profiles.length}</span>{' '}
            participants total
          </div>
        </div>

        {/* OWTV Standings Table */}
        {loading ? (
          <div className="py-16 text-center text-sm text-zinc-400">
            Loading Global Leaderboard...
          </div>
        ) : leaderboardRows.length === 0 ? (
          <div className="py-16 text-center space-y-3 border border-dashed border-zinc-800 rounded-2xl">
            <Users className="w-10 h-10 text-zinc-600 mx-auto" />
            <p className="text-zinc-300 font-bold text-sm">
              No matching managers found
            </p>
            <p className="text-xs text-zinc-500">
              Sign in with Discord in the top-right corner to register
              automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[880px]">
              <thead>
                <tr className="border-b border-zinc-800/90 text-xs font-bold text-zinc-300">
                  <th className="py-3.5 px-4 w-24">Rank</th>
                  <th className="py-3.5 px-4">Manager</th>
                  <th className="py-3.5 px-4 text-center">Tank</th>
                  <th className="py-3.5 px-4 text-center">DPS</th>
                  <th className="py-3.5 px-4 text-center">DPS</th>
                  <th className="py-3.5 px-4 text-center">Support</th>
                  <th className="py-3.5 px-4 text-center">Support</th>
                  <th
                    onClick={() => setSortAsc(!sortAsc)}
                    className="py-3.5 px-4 text-right cursor-pointer hover:text-white select-none"
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      Total Score
                      <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500" />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-sm">
                {leaderboardRows.map((row) => (
                  <tr
                    key={row.profile.id}
                    onClick={() => setInspectedRow(row)}
                    className="group cursor-pointer hover:bg-zinc-800/30 transition-colors"
                  >
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {renderRankCell(row.rank)}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        {row.profile.avatar_url ? (
                          <img
                            src={row.profile.avatar_url}
                            alt={row.profile.username}
                            className="w-8 h-8 rounded-full object-cover ring-1 ring-zinc-700 shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-200 flex items-center justify-center font-bold text-xs shrink-0">
                            {row.profile.username.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-white text-xs sm:text-sm truncate group-hover:text-orange-400 transition-colors">
                            {row.profile.username}&apos;s Team
                          </p>
                          <p className="text-[11px] text-zinc-500 truncate">
                            {row.profile.username}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      {renderPlayerSlotCell(row.tank, row.captainId)}
                    </td>

                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      {renderPlayerSlotCell(row.dps1, row.captainId)}
                    </td>

                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      {renderPlayerSlotCell(row.dps2, row.captainId)}
                    </td>

                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      {renderPlayerSlotCell(row.sup1, row.captainId)}
                    </td>

                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      {renderPlayerSlotCell(row.sup2, row.captainId)}
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono font-bold text-white">
                      {row.totalScore % 1 === 0
                        ? row.totalScore.toFixed(0)
                        : row.totalScore.toFixed(1)}{' '}
                      <span className="text-zinc-400 font-normal text-xs">
                        pts
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manager Roster Detail Modal on Row Click */}
      {inspectedRow && (
        <div
          onClick={() => setInspectedRow(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-[#0d1018] p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-3">
                {inspectedRow.profile.avatar_url ? (
                  <img
                    src={inspectedRow.profile.avatar_url}
                    alt={inspectedRow.profile.username}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-zinc-800 text-white flex items-center justify-center font-bold text-sm">
                    {inspectedRow.profile.username.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-black text-white">
                    {inspectedRow.profile.username}&apos;s Starting Lineup
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Rank {formatOrdinal(inspectedRow.rank)} • Budget Used:{' '}
                    <span className="text-emerald-400 font-bold">
                      ${inspectedRow.totalBudgetUsed.toFixed(1)}M
                    </span>{' '}
                    • Score:{' '}
                    <span className="text-orange-400 font-bold">
                      {inspectedRow.totalScore} pts
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectedRow(null)}
                className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!inspectedRow.activeRoster ? (
              <div className="py-10 text-center bg-zinc-900/40 rounded-xl border border-zinc-800/80">
                <Shield className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-sm font-bold text-zinc-300">
                  {inspectedRow.profile.username} has not locked in a starting 5
                  yet.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                {[
                  {
                    label: 'TANK',
                    role: 'TANK' as const,
                    player: inspectedRow.tank,
                  },
                  {
                    label: 'DPS 1',
                    role: 'DPS' as const,
                    player: inspectedRow.dps1,
                  },
                  {
                    label: 'DPS 2',
                    role: 'DPS' as const,
                    player: inspectedRow.dps2,
                  },
                  {
                    label: 'SUPPORT 1',
                    role: 'SUPPORT' as const,
                    player: inspectedRow.sup1,
                  },
                  {
                    label: 'SUPPORT 2',
                    role: 'SUPPORT' as const,
                    player: inspectedRow.sup2,
                  },
                ].map((slot) => {
                  const isCapt =
                    Boolean(slot.player) &&
                    slot.player?.id === inspectedRow.captainId;

                  return (
                    <div
                      key={slot.label}
                      className={`rounded-xl border p-3.5 flex flex-col justify-between ${
                        isCapt
                          ? 'border-amber-400 bg-amber-500/10'
                          : 'border-zinc-800 bg-zinc-900/70'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <RoleBadge role={slot.role} size="sm" />
                          {isCapt ? (
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-400 text-zinc-950">
                              C • {SCORING_MULTIPLIERS.CAPTAIN_MULTIPLIER}x
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                              {slot.player?.teams?.code ?? 'OWCS'}
                            </span>
                          )}
                        </div>
                        <p className="font-extrabold text-white text-sm truncate">
                          {slot.player?.name ?? 'Empty'}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate">
                          {slot.player?.teams?.name ?? '—'}
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs">
                        <span className="text-zinc-500">Price</span>
                        <span className="font-bold text-emerald-400">
                          $
                          {slot.player
                            ? Number(slot.player.price).toFixed(1)
                            : '0.0'}
                          M
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}