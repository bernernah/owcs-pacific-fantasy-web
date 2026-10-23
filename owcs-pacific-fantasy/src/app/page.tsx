'use client';

import React, {
  Suspense,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  Trophy,
  Search,
  Users,
  ArrowUpDown,
  Crown,
  BookOpen,
  DollarSign,
  Clock,
  ArrowLeftRight,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Pin,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { FANTASY_CONFIG, SCORING_MULTIPLIERS } from '@/lib/config';
import DailyHub from '@/components/DailyHub';
import type {
  Profile,
  Gameweek,
  Player,
  UserRoster,
  LeaderboardRow,
} from '@/types/fantasy';

const PAGE_SIZE = 10;

interface PaginatedStandingRow {
  rank: number;
  userId: string;
  username: string;
  avatarUrl: string | null;
  tank: Player | null;
  dps1: Player | null;
  dps2: Player | null;
  sup1: Player | null;
  sup2: Player | null;
  captainId: string | null;
  totalScore: number;
}

function LeaderboardContent() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const MAX_SAFE_PAGE = 500;
  const rawPageParam = Number(searchParams.get('page') ?? '1');
  const currentPage =
    Number.isFinite(rawPageParam) && rawPageParam >= 1
      ? Math.min(MAX_SAFE_PAGE, Math.floor(rawPageParam))
      : 1;

  const [currentUserProfile, setCurrentUserProfile] = useState<Profile | null>(
    null
  );
  const [myLeaderboardRow, setMyLeaderboardRow] =
    useState<LeaderboardRow | null>(null);
  const [myRosters, setMyRosters] = useState<UserRoster[]>([]);

  const [pageLeaderboardRows, setPageLeaderboardRows] = useState<
    LeaderboardRow[]
  >([]);
  const [totalManagersCount, setTotalManagersCount] = useState<number>(0);

  const [gameweeks, setGameweeks] = useState<Gameweek[]>([]);
  const [pageRosters, setPageRosters] = useState<UserRoster[]>([]);
  const [playersById, setPlayersById] = useState<Record<string, Player>>({});
  const [loading, setLoading] = useState<boolean>(true);

  const [selectedScope, setSelectedScope] = useState<string>('TOTAL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // 1. Load static reference data & logged-in user's permanent standing
  useEffect(() => {
    async function loadReferenceAndUserStanding() {
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

        const [
          { data: upsertedProfile },
          { data: myLbData },
          { data: myRosterData },
        ] = await Promise.all([
          supabase
            .from('profiles')
            .upsert(
              {
                id: user.id,
                discord_id: String(discordId),
                username: String(username),
                avatar_url: avatarUrl,
              },
              { onConflict: 'id' }
            )
            .select('*')
            .maybeSingle(),
          supabase
            .from('leaderboard_view')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('user_rosters')
            .select('*')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false }),
        ]);

        if (upsertedProfile) {
          setCurrentUserProfile(upsertedProfile as Profile);
        }
        if (myLbData) {
          setMyLeaderboardRow(myLbData as LeaderboardRow);
        }
        if (myRosterData) {
          setMyRosters(myRosterData as UserRoster[]);
        }
      }

      const [{ data: gwData }, { data: playerData }] = await Promise.all([
        supabase
          .from('gameweeks')
          .select('*')
          .order('number', { ascending: true }),
        supabase.from('players').select('*, teams(*)'),
      ]);

      setGameweeks((gwData as Gameweek[]) ?? []);

      const map: Record<string, Player> = {};
      if (playerData) {
        for (const p of playerData as Player[]) {
          map[p.id] = p;
        }
      }
      setPlayersById(map);
    }

    loadReferenceAndUserStanding();
  }, [supabase]);

  // 2. Fetch Paginated Leaderboard Slice (10 rows per page via .range()) & Total Count
  useEffect(() => {
    async function fetchPaginatedStandings() {
      setLoading(true);

      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('leaderboard_view')
        .select('*', { count: 'exact' })
        .order('total_points', { ascending: sortAsc })
        .order('username', { ascending: true });

      if (searchQuery.trim()) {
        query = query.ilike('username', `%${searchQuery.trim()}%`);
      }

      const { data: lbData, count } = await query.range(from, to);

      const safeTotalCount = count ?? 0;
      const computedMaxPage = Math.max(
        1,
        Math.ceil(safeTotalCount / PAGE_SIZE)
      );

      // If a user requested ?page=999999 beyond the last page, snap them to the final valid page
      if (currentPage > computedMaxPage && safeTotalCount > 0) {
        setTotalManagersCount(safeTotalCount);
        setLoading(false);
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', String(computedMaxPage));
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        return;
      }

      const rows = (lbData as LeaderboardRow[]) ?? [];
      setPageLeaderboardRows(rows);
      setTotalManagersCount(safeTotalCount);

      if (rows.length > 0) {
        const userIdsOnPage = rows.map((r) => r.user_id);
        const { data: rosterData } = await supabase
          .from('user_rosters')
          .select('*')
          .in('user_id', userIdsOnPage)
          .order('updated_at', { ascending: false });

        setPageRosters((rosterData as UserRoster[]) ?? []);
      } else {
        setPageRosters([]);
      }

      setLoading(false);
    }

    fetchPaginatedStandings();
  }, [supabase, currentPage, sortAsc, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(totalManagersCount / PAGE_SIZE));

  const navigateToPage = (targetPage: number) => {
    const safePage = Math.max(1, Math.min(totalPages, targetPage));
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(safePage));
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const activeOrLatestGwId = useMemo(() => {
    if (gameweeks.length === 0) return null;
    const active =
      gameweeks.find((g) => g.status === 'ACTIVE') ??
      gameweeks.find((g) => g.status === 'UPCOMING') ??
      gameweeks[gameweeks.length - 1];
    return active?.id ?? null;
  }, [gameweeks]);

  const gwNumberById = useMemo(() => {
    const map: Record<string, number> = {};
    for (const gw of gameweeks) {
      map[gw.id] = gw.number;
    }
    return map;
  }, [gameweeks]);

  const buildStandingRow = useCallback(
    (lbRow: LeaderboardRow, userRosters: UserRoster[]): PaginatedStandingRow => {
      const sortedUserRosters = [...userRosters].sort(
        (a, b) =>
          (gwNumberById[b.gameweek_id] ?? 0) -
          (gwNumberById[a.gameweek_id] ?? 0)
      );

      let displayedRoster: UserRoster | null = null;
      let score = Number(lbRow.total_points ?? 0);

      if (selectedScope === 'TOTAL') {
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

      return {
        rank: Number(lbRow.rank),
        userId: lbRow.user_id,
        username: lbRow.username,
        avatarUrl: lbRow.avatar_url,
        tank,
        dps1,
        dps2,
        sup1,
        sup2,
        captainId: displayedRoster?.captain_id ?? null,
        totalScore: Number(score.toFixed(1)),
      };
    },
    [gwNumberById, selectedScope, activeOrLatestGwId, playersById]
  );

  const displayedRows = useMemo<PaginatedStandingRow[]>(() => {
    return pageLeaderboardRows.map((lbRow) => {
      const userRosters = pageRosters.filter(
        (r) => r.user_id === lbRow.user_id
      );
      return buildStandingRow(lbRow, userRosters);
    });
  }, [pageLeaderboardRows, pageRosters, buildStandingRow]);

  const pinnedUserRow = useMemo<PaginatedStandingRow | null>(() => {
    if (!myLeaderboardRow) return null;
    return buildStandingRow(myLeaderboardRow, myRosters);
  }, [myLeaderboardRow, myRosters, buildStandingRow]);

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
      <span className="font-mono text-xs font-semibold text-zinc-300 pl-1">
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

  // Dynamic Formatting Helpers Driven by src/lib/config.ts
  const formatSignedPointValue = (val: number) => {
    const num = Number(val);
    const sign = num >= 0 ? '+' : '';
    const unit = Math.abs(num) === 1 ? 'pt' : 'pts';
    return `${sign}${num} ${unit}`;
  };

  const formattedTransferPenalty = `-${Math.abs(
    Number(FANTASY_CONFIG.TRANSFER_HIT_PENALTY_PTS)
  )} pts`;

  const howToPlayCards = [
    {
      title: 'Draft your 5-player roster',
      icon: Users,
      description: `Select 1 Tank, 2 DPS, and 2 Support players (max ${FANTASY_CONFIG.REGULAR_SEASON_MAX_PER_TEAM} per OWCS team in Regular Season) and assign your ${SCORING_MULTIPLIERS.CAPTAIN_MULTIPLIER}x Points Captain.`,
      badge: '1 - 2 - 2 Formation',
    },
    {
      title: `Manage your $${FANTASY_CONFIG.REGULAR_SEASON_BUDGET}M Budget`,
      icon: DollarSign,
      description: `Build within your $${FANTASY_CONFIG.REGULAR_SEASON_BUDGET}M starting salary cap, grow your franchise value via player price changes, and receive a +$${FANTASY_CONFIG.PLAYOFF_BUDGET_BONUS}M bonus added to your personal budget for Playoffs.`,
      badge: 'Dynamic Valuation',
    },
    {
      title: 'Rosters Lock Daily',
      icon: Clock,
      description:
        'OWCS Pacific moves fast! Lineups lock automatically 15 minutes before each Matchday begins. Check the daily countdown before matches start.',
      badge: 'Daily Matchdays',
    },
    {
      title: `Use your ${FANTASY_CONFIG.REGULAR_SEASON_FREE_TRANSFERS} Free Daily Transfer`,
      icon: ArrowLeftRight,
      description: `Every Matchday grants ${FANTASY_CONFIG.REGULAR_SEASON_FREE_TRANSFERS} Free Daily Transfer (${FANTASY_CONFIG.PLAYOFF_WILDCARD_FREE_TRANSFERS} in Playoffs) to swap out underperforming players without taking a ${formattedTransferPenalty} hit.`,
      badge: `${FANTASY_CONFIG.REGULAR_SEASON_FREE_TRANSFERS} Free / Day`,
    },
  ];

  const showingFrom =
    totalManagersCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(currentPage * PAGE_SIZE, totalManagersCount);

  return (
    <div className="space-y-6">
      {/* ====================================================================
          HERO PRIZING & SCORING TELEMETRY BANNER
      ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-black uppercase tracking-wider">
              <Trophy className="w-3.5 h-3.5 text-emerald-400" />
              OWCS Pacific Stage 2 • Official Prizing
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl sm:text-5xl font-black text-white tracking-tight">
                $100
              </span>
              <span className="text-sm font-extrabold uppercase tracking-wider text-emerald-400">
                1st Place Grand Prize
              </span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              The #1 ranked manager on the Global Leaderboard at the conclusion
              of the OWCS Pacific Playoffs takes home the{' '}
              <strong className="text-white">$100 cash prize</strong>.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3.5 flex items-start gap-3">
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
                the My Team sheet to multiply their points by{' '}
                <strong className="text-white">
                  {SCORING_MULTIPLIERS.CAPTAIN_MULTIPLIER}x
                </strong>{' '}
                every map!
              </p>
            </div>
          </div>
        </div>

        {/* Dynamic Scoring Formula Card (Synced directly to src/lib/config.ts) */}
        <div className="lg:col-span-7 rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-black uppercase tracking-wider text-white">
                Live Scoring Telemetry
              </h2>
            </div>
            <span className="text-[11px] text-zinc-400 font-medium">
              Aggregated per map played (Bo5 / Bo7)
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                Every 3 Elims
              </span>
              <span className="text-base font-black text-emerald-400 font-mono mt-1 block">
                {formatSignedPointValue(SCORING_MULTIPLIERS.POINTS_PER_KILL)}
              </span>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                Per Death
              </span>
              <span className="text-base font-black text-rose-400 font-mono mt-1 block">
                {formatSignedPointValue(SCORING_MULTIPLIERS.POINTS_PER_DEATH)}
              </span>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                Per 1k Damage
              </span>
              <span className="text-base font-black text-emerald-400 font-mono mt-1 block">
                {formatSignedPointValue(
                  SCORING_MULTIPLIERS.POINTS_PER_1K_DAMAGE
                )}
              </span>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                Per 1k Healing
              </span>
              <span className="text-base font-black text-emerald-400 font-mono mt-1 block">
                {formatSignedPointValue(
                  SCORING_MULTIPLIERS.POINTS_PER_1K_HEALING
                )}
              </span>
            </div>

            <div className="col-span-2 sm:col-span-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 block">
                Map Win Bonus
              </span>
              <span className="text-base font-black text-emerald-400 font-mono mt-1 block">
                {formatSignedPointValue(SCORING_MULTIPLIERS.POINTS_PER_MAP_WIN)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
            <div className="rounded-lg bg-zinc-950/60 border border-zinc-800 px-3 py-2 flex items-center justify-between">
              <span className="text-zinc-400">Starting Cap:</span>
              <strong className="text-emerald-400 font-mono">
                ${FANTASY_CONFIG.REGULAR_SEASON_BUDGET}M (+$
                {FANTASY_CONFIG.PLAYOFF_BUDGET_BONUS}M Playoffs)
              </strong>
            </div>
            <div className="rounded-lg bg-zinc-950/60 border border-zinc-800 px-3 py-2 flex items-center justify-between">
              <span className="text-zinc-400">Team Limit:</span>
              <strong className="text-white font-mono">
                Max {FANTASY_CONFIG.REGULAR_SEASON_MAX_PER_TEAM}/team (
                {FANTASY_CONFIG.PLAYOFF_WILDCARD_MAX_PER_TEAM} Playoffs)
              </strong>
            </div>
            <div className="rounded-lg bg-zinc-950/60 border border-zinc-800 px-3 py-2 flex items-center justify-between">
              <span className="text-zinc-400">Extra Transfer:</span>
              <strong className="text-rose-400 font-mono">
                {formattedTransferPenalty} (
                {FANTASY_CONFIG.REGULAR_SEASON_FREE_TRANSFERS} Free/Day)
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* ====================================================================
          RULES & HOW TO PLAY (4-CARD MECHANICS GRID)
      ==================================================================== */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-4">
          <div>
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400">
              Quick-Start Guide
            </span>
            <h2 className="text-lg sm:text-xl font-black text-white">
              Rules &amp; How to Play
            </h2>
          </div>
          <Link
            href="/my-team"
            className="text-xs font-extrabold text-emerald-400 hover:underline"
          >
            Build Your Day 1 Lineup →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {howToPlayCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-5 flex flex-col justify-between space-y-4 hover:border-emerald-500/40 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                      0{idx + 1} • {card.badge}
                    </span>
                    <Icon className="w-5 h-5 text-emerald-400" />
                  </div>
                  <h3 className="text-sm font-black text-white">
                    {card.title}
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {card.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ====================================================================
          DAILY CHECK-IN STREAK & TRANSFER REMINDER HUB
      ==================================================================== */}
      <DailyHub
        profile={currentUserProfile}
        onBonusClaimed={(newStreak) => {
          setCurrentUserProfile((prev) =>
            prev
              ? {
                ...prev,
                daily_streak: newStreak,
                last_daily_claim: new Date().toISOString(),
              }
              : null
          );
        }}
      />

      {/* ====================================================================
          PAGINATED GLOBAL LEADERBOARD + PINNED 11TH USER ROW
      ==================================================================== */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Global Leaderboard
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              Click any manager row or name to inspect their full Matchday
              history &amp; Trophy Cabinet
            </p>
          </div>

          <Link
            href="/my-team"
            className="self-start sm:self-auto bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-xs uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-500/20"
          >
            Edit My Lineup
          </Link>
        </div>

        {/* Matchday Filter Tabs ("Total | Day 1 | Day 2 | ...") */}
        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-zinc-950 p-1.5 border border-zinc-800">
          <button
            type="button"
            onClick={() => setSelectedScope('TOTAL')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedScope === 'TOTAL'
                ? 'bg-zinc-800 text-emerald-400 shadow'
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
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedScope === gw.id
                  ? 'bg-zinc-800 text-emerald-400 shadow'
                  : 'text-zinc-400 hover:text-zinc-200'
                }`}
            >
              {gw.is_playoffs ? 'Playoffs' : `Day ${gw.number}`}
            </button>
          ))}
        </div>

        {/* Search Input & Participant Count Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search for a manager..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (currentPage !== 1) {
                  navigateToPage(1);
                }
              }}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="text-xs font-medium text-zinc-400">
            Showing{' '}
            <span className="text-zinc-200 font-bold">
              {showingFrom}–{showingTo}
            </span>{' '}
            of{' '}
            <span className="text-zinc-200 font-bold">
              {totalManagersCount}
            </span>{' '}
            participants total
          </div>
        </div>

        {/* Standings Table */}
        {loading ? (
          <div className="py-16 text-center text-sm text-zinc-400">
            Loading Global Leaderboard...
          </div>
        ) : displayedRows.length === 0 ? (
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
                <tr className="border-b border-zinc-800 text-xs font-bold text-zinc-300">
                  <th className="py-3.5 px-4 w-24">Rank</th>
                  <th className="py-3.5 px-4">Manager</th>
                  <th className="py-3.5 px-4 text-center">Tank</th>
                  <th className="py-3.5 px-4 text-center">DPS</th>
                  <th className="py-3.5 px-4 text-center">DPS</th>
                  <th className="py-3.5 px-4 text-center">Support</th>
                  <th className="py-3.5 px-4 text-center">Support</th>
                  <th
                    onClick={() => setSortAsc(!sortAsc)}
                    className="py-3.5 px-4 text-right cursor-pointer hover:text-emerald-400 select-none"
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      Total Score
                      <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500" />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-sm">
                {displayedRows.map((row) => {
                  const isMe =
                    Boolean(pinnedUserRow) &&
                    row.userId === pinnedUserRow?.userId;

                  return (
                    <tr
                      key={row.userId}
                      onClick={() => router.push(`/profile/${row.userId}`)}
                      className={`group cursor-pointer transition-colors ${isMe
                          ? 'bg-emerald-500/5 hover:bg-emerald-500/10'
                          : 'hover:bg-zinc-800/50'
                        }`}
                    >
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderRankCell(row.rank)}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <Link
                          href={`/profile/${row.userId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-3 group/link"
                        >
                          {row.avatarUrl ? (
                            <img
                              src={row.avatarUrl}
                              alt={row.username}
                              className="w-8 h-8 rounded-full object-cover ring-1 ring-zinc-700 group-hover:ring-emerald-400 shrink-0 transition-all"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-200 flex items-center justify-center font-bold text-xs shrink-0">
                              {row.username.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-white text-xs sm:text-sm truncate group-hover:text-emerald-400 group-hover/link:text-emerald-400 transition-colors inline-flex items-center gap-1.5">
                              <span>{row.username}&apos;s Team</span>
                              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 text-emerald-400 transition-opacity" />
                            </p>
                            <p className="text-[11px] text-zinc-500 truncate block">
                              @{row.username}
                            </p>
                          </div>
                        </Link>
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

                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono font-bold text-white group-hover:text-emerald-400 transition-colors">
                        {row.totalScore % 1 === 0
                          ? row.totalScore.toFixed(0)
                          : row.totalScore.toFixed(1)}{' '}
                        <span className="text-zinc-400 font-normal text-xs">
                          pts
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* PERMANENT PINNED 11TH ROW FOR THE LOGGED-IN USER */}
              {pinnedUserRow && (
                <tfoot>
                  <tr
                    onClick={() =>
                      router.push(`/profile/${pinnedUserRow.userId}`)
                    }
                    className="group cursor-pointer bg-zinc-800/80 hover:bg-zinc-800 border-t-2 border-b border-emerald-500/60 shadow-lg transition-colors"
                  >
                    <td className="py-4 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Pin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        {renderRankCell(pinnedUserRow.rank)}
                      </div>
                    </td>

                    <td className="py-4 px-4 whitespace-nowrap">
                      <Link
                        href={`/profile/${pinnedUserRow.userId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-3 group/link"
                      >
                        {pinnedUserRow.avatarUrl ? (
                          <img
                            src={pinnedUserRow.avatarUrl}
                            alt={pinnedUserRow.username}
                            className="w-8 h-8 rounded-full object-cover ring-2 ring-emerald-400 shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-center font-bold text-xs shrink-0">
                            {pinnedUserRow.username.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-black text-white text-xs sm:text-sm truncate group-hover:text-emerald-400 transition-colors">
                              {pinnedUserRow.username}&apos;s Team
                            </p>
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500 text-zinc-950 font-black text-[10px] uppercase tracking-wider">
                              You
                            </span>
                          </div>
                          <p className="text-[11px] text-emerald-400/90 font-semibold truncate block">
                            Pinned Personal Standing
                          </p>
                        </div>
                      </Link>
                    </td>

                    <td className="py-4 px-4 text-center whitespace-nowrap">
                      {renderPlayerSlotCell(
                        pinnedUserRow.tank,
                        pinnedUserRow.captainId
                      )}
                    </td>

                    <td className="py-4 px-4 text-center whitespace-nowrap">
                      {renderPlayerSlotCell(
                        pinnedUserRow.dps1,
                        pinnedUserRow.captainId
                      )}
                    </td>

                    <td className="py-4 px-4 text-center whitespace-nowrap">
                      {renderPlayerSlotCell(
                        pinnedUserRow.dps2,
                        pinnedUserRow.captainId
                      )}
                    </td>

                    <td className="py-4 px-4 text-center whitespace-nowrap">
                      {renderPlayerSlotCell(
                        pinnedUserRow.sup1,
                        pinnedUserRow.captainId
                      )}
                    </td>

                    <td className="py-4 px-4 text-center whitespace-nowrap">
                      {renderPlayerSlotCell(
                        pinnedUserRow.sup2,
                        pinnedUserRow.captainId
                      )}
                    </td>

                    <td className="py-4 px-4 text-right whitespace-nowrap font-mono font-black text-emerald-400">
                      {pinnedUserRow.totalScore % 1 === 0
                        ? pinnedUserRow.totalScore.toFixed(0)
                        : pinnedUserRow.totalScore.toFixed(1)}{' '}
                      <span className="text-zinc-300 font-normal text-xs">
                        pts
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Pagination Controls Bar */}
        <div className="pt-4 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-xs font-bold text-zinc-400">
            Page <span className="text-white">{currentPage}</span> of{' '}
            <span className="text-white">{totalPages}</span>
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigateToPage(currentPage - 1)}
              disabled={currentPage <= 1 || loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-zinc-800 bg-zinc-950 hover:bg-zinc-800 text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4 text-emerald-400" />
              Previous
            </button>

            <span className="px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono font-black text-emerald-400">
              {currentPage}
            </span>

            <button
              type="button"
              onClick={() => navigateToPage(currentPage + 1)}
              disabled={currentPage >= totalPages || loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-zinc-800 bg-zinc-950 hover:bg-zinc-800 text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Next
              <ChevronRight className="w-4 h-4 text-emerald-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-sm text-zinc-400">
          Loading OWCS Pacific Leaderboard...
        </div>
      }
    >
      <LeaderboardContent />
    </Suspense>
  );
}