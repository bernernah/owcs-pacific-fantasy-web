import React from 'react';
import Link from 'next/link';
import {
  Trophy,
  Calendar,
  Award,
  Shield,
  DollarSign,
  TrendingUp,
  ChevronDown,
  Crown,
  Sparkles,
  ArrowLeft,
  UserCheck,
  Lock,
} from 'lucide-react';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import RoleBadge from '@/components/RoleBadge';
import type {
  Profile,
  Season,
  GameweekRosterSnapshot,
  UserBadge,
  LeaderboardRow,
  PlayerRole,
  SnapshotPlayerItem,
} from '@/types/fantasy';

export const dynamic = 'force-dynamic';

interface ProfilePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ManagerProfilePage({ params }: ProfilePageProps) {
  const { id: profileId } = await params;
  const supabase = await getSupabaseServerClient();

  // 1. Fetch Manager Profile
  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', profileId)
    .maybeSingle();

  if (profileError || !profileData) {
    return (
      <div className="max-w-xl mx-auto my-16 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 text-center space-y-4 shadow-2xl">
        <Shield className="w-12 h-12 text-zinc-500 mx-auto" />
        <h1 className="text-xl font-black text-white">Manager Not Found</h1>
        <p className="text-xs text-zinc-400 leading-relaxed">
          We couldn&apos;t locate an OWCS Pacific Fantasy manager profile with
          this ID.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-zinc-950 font-black text-xs uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Global Leaderboard
        </Link>
      </div>
    );
  }

  const profile = profileData as Profile;

  // 2. Fetch Season, Leaderboard Rank, Active Roster Value, GW Snapshots & Badges in parallel
  const [
    { data: activeSeasonData },
    { data: leaderboardData },
    { data: latestRosterData },
    { data: snapshotsData },
    { data: userBadgesData },
  ] = await Promise.all([
    supabase
      .from('seasons')
      .select('*')
      .eq('is_active', true)
      .order('year', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('leaderboard_view')
      .select('*')
      .eq('user_id', profile.id)
      .maybeSingle(),
    supabase
      .from('user_rosters')
      .select('tank_id, dps1_id, dps2_id, sup1_id, sup2_id')
      .eq('user_id', profile.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('gameweek_rosters')
      .select('*, gameweeks(*), seasons(*)')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('user_badges')
      .select('*, badges(*)')
      .eq('user_id', profile.id)
      .order('awarded_at', { ascending: false }),
  ]);

  const activeSeason = (activeSeasonData as Season | null) ?? {
    id: 'default-2026',
    name: '2026 Pacific Stage 2',
    year: 2026,
    is_active: true,
    created_at: new Date().toISOString(),
  };

  const leaderboardEntry = leaderboardData as LeaderboardRow | null;
  const snapshots = ((snapshotsData as GameweekRosterSnapshot[]) ?? []).sort(
    (a, b) => (b.gameweeks?.number ?? 0) - (a.gameweeks?.number ?? 0)
  );
  const earnedBadges = (userBadgesData as UserBadge[]) ?? [];

  // Calculate Total Team Value from current active lineup (or fallback to personal_budget)
  let activeLineupValue = 0;
  if (latestRosterData) {
    const slotIds = [
      latestRosterData.tank_id,
      latestRosterData.dps1_id,
      latestRosterData.dps2_id,
      latestRosterData.sup1_id,
      latestRosterData.sup2_id,
    ].filter((pid): pid is string => Boolean(pid));

    if (slotIds.length > 0) {
      const { data: activePlayers } = await supabase
        .from('players')
        .select('price')
        .in('id', slotIds);

      if (activePlayers) {
        activeLineupValue = activePlayers.reduce(
          (sum, p) => sum + Number(p.price ?? 0),
          0
        );
      }
    }
  }

  const displayedTeamValue =
    activeLineupValue > 0
      ? activeLineupValue
      : Number(profile.personal_budget ?? 100.0);

  const globalRank = leaderboardEntry?.rank ?? null;
  const totalSeasonPoints = Number(leaderboardEntry?.total_points ?? 0);

  const formatOrdinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const joinedDateFormatted = new Date(profile.created_at).toLocaleDateString(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }
  );

  return (
    <div className="space-y-8">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-orange-400" />
          Back to Global Leaderboard
        </Link>

        <span className="text-[11px] font-mono text-zinc-500">
          Manager ID: {profile.id.slice(0, 8)}
        </span>
      </div>

      {/* ====================================================================
          ZONE 1: HEADER CARD (Avatar, Username, Joined Date & Badges Flex Row)
      ==================================================================== */}
      <section className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/90 p-6 sm:p-8 shadow-2xl">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-orange-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            {/* Avatar */}
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.username}
                className="w-20 h-20 rounded-2xl object-cover ring-2 ring-orange-500/50 shadow-lg shrink-0"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-zinc-800 border border-zinc-700 text-orange-400 flex items-center justify-center font-black text-2xl shrink-0">
                {profile.username.slice(0, 2).toUpperCase()}
              </div>
            )}

            {/* Username, Badges Flex Container & Creation Date */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                  {profile.username}
                </h1>

                {/* Dedicated Flex Container for Earned Badges / Titles */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {profile.is_admin && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-orange-500/15 border border-orange-500/30 text-orange-400 text-[11px] font-extrabold uppercase tracking-wider">
                      <Sparkles className="w-3 h-3" />
                      Commissioner
                    </span>
                  )}

                  {earnedBadges.length > 0 ? (
                    earnedBadges.slice(0, 4).map((ub) => (
                      <span
                        key={ub.id}
                        title={ub.badges?.description ?? ub.badges?.name}
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold"
                      >
                        {ub.badges?.icon_url ? (
                          <img
                            src={ub.badges.icon_url}
                            alt={ub.badges.name}
                            className="w-3.5 h-3.5 object-contain"
                          />
                        ) : (
                          <Award className="w-3.5 h-3.5" />
                        )}
                        {ub.badges?.name}
                      </span>
                    ))
                  ) : (
                    /* Placeholder Badge Icon when user_badges is empty */
                    <span
                      title="No badges unlocked yet"
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-zinc-800/90 border border-zinc-700/80 text-zinc-400 text-[11px] font-semibold"
                    >
                      <Award className="w-3.5 h-3.5 text-zinc-500" />
                      Rookie Manager
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                  Joined {joinedDateFormatted}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                  OWCS Pacific Registered Manager
                </span>
              </div>
            </div>
          </div>

          {/* Personal Cap Pill */}
          <div className="self-start sm:self-center rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-left sm:text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
              Personal Salary Cap
            </span>
            <span className="text-lg font-black text-emerald-400 font-mono">
              ${Number(profile.personal_budget ?? 100.0).toFixed(1)}M
            </span>
          </div>
        </div>
      </section>

      {/* ====================================================================
          ZONE 2: CURRENT SEASON OVERVIEW (Stats Grid + Multi-Season Dropdown)
      ==================================================================== */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-6 space-y-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <h2 className="text-lg font-black text-white">
              Current Season Overview
            </h2>
            <p className="text-xs text-zinc-400">
              Live standings and franchise valuation for the active OWCS stage
            </p>
          </div>

          {/* Disabled UI Dropdown Placeholder for Future Multi-Season Support */}
          <div className="relative inline-flex items-center">
            <Lock className="w-3.5 h-3.5 text-zinc-500 absolute left-3 pointer-events-none" />
            <select
              disabled
              aria-label="Select Fantasy Season"
              defaultValue={activeSeason.name}
              className="appearance-none bg-zinc-950 border border-zinc-800 text-zinc-300 font-bold text-xs rounded-xl pl-8 pr-9 py-2.5 cursor-not-allowed opacity-80"
            >
              <option value={activeSeason.name}>
                Season: {activeSeason.name}
              </option>
            </select>
            <ChevronDown className="w-4 h-4 text-zinc-500 absolute right-3 pointer-events-none" />
          </div>
        </div>

        {/* 3-Card Stat Grid: Global Rank, Total Points, Total Team Value */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Global Rank */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Global Rank
              </p>
              <p className="text-2xl sm:text-3xl font-black text-white font-mono mt-1">
                {globalRank ? formatOrdinal(globalRank) : 'Unranked'}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Trophy className="w-6 h-6" />
            </div>
          </div>

          {/* Total Points */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Total Points
              </p>
              <p className="text-2xl sm:text-3xl font-black text-orange-400 font-mono mt-1">
                {totalSeasonPoints % 1 === 0
                  ? totalSeasonPoints.toFixed(0)
                  : totalSeasonPoints.toFixed(1)}{' '}
                <span className="text-xs font-bold text-zinc-400 uppercase">
                  pts
                </span>
              </p>
            </div>
            <div className="p-3 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-400">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>

          {/* Total Team Value */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Total Team Value
              </p>
              <p className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono mt-1">
                ${displayedTeamValue.toFixed(1)}M
              </p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>
        </div>
      </section>

      {/* ====================================================================
          ZONE 3: GAMEWEEK HISTORY (Expandable Snapshot Accordion)
      ==================================================================== */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-6 space-y-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-4">
          <div>
            <h2 className="text-lg font-black text-white">Gameweek History</h2>
            <p className="text-xs text-zinc-400">
              Historical roster snapshots locked per Gameweek (unaffected by
              subsequent transfers or price changes)
            </p>
          </div>
          <span className="text-xs font-bold text-zinc-400">
            {snapshots.length} Recorded Gameweek(s)
          </span>
        </div>

        {snapshots.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 py-12 px-4 text-center space-y-2">
            <Calendar className="w-8 h-8 text-zinc-600 mx-auto" />
            <p className="text-sm font-bold text-zinc-300">
              No Gameweek snapshots recorded yet
            </p>
            <p className="text-xs text-zinc-400">
              Once {profile.username} locks in a starting lineup, each
              Gameweek&apos;s historical squad and score will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {snapshots.map((snap, index) => {
              const gwNum = snap.gameweeks?.number ?? index + 1;
              const gwName = snap.gameweeks?.name ?? `Gameweek ${gwNum}`;
              const payload = snap.roster_json ?? {};
              const snapPlayers: SnapshotPlayerItem[] = Array.isArray(
                payload.players
              )
                ? payload.players
                : [];
              const budgetUsed = Number(payload.budget_used ?? 0);
              const transfersUsed = Number(payload.transfers_used ?? 0);
              const gwPoints = Number(snap.total_points ?? 0);

              return (
                <details
                  key={snap.id}
                  open={index === 0}
                  className="group rounded-xl border border-zinc-800 bg-zinc-950/70 overflow-hidden transition-all"
                >
                  <summary className="list-none cursor-pointer select-none px-5 py-4 flex flex-wrap items-center justify-between gap-4 hover:bg-zinc-800/40 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="px-2.5 py-1 rounded-lg bg-orange-500/15 border border-orange-500/30 text-orange-400 font-black text-xs">
                        GW{gwNum}
                      </span>
                      <div>
                        <p className="text-sm font-extrabold text-white">
                          {gwName}
                        </p>
                        <p className="text-[11px] text-zinc-400">
                          Budget Fielded:{' '}
                          <span className="text-emerald-400 font-bold font-mono">
                            ${budgetUsed.toFixed(1)}M
                          </span>{' '}
                          • Transfers:{' '}
                          <span className="text-zinc-200 font-bold">
                            {transfersUsed}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 ml-auto">
                      <div className="text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                          GW Score
                        </span>
                        <span className="text-base font-black text-emerald-400 font-mono">
                          {gwPoints % 1 === 0
                            ? gwPoints.toFixed(0)
                            : gwPoints.toFixed(1)}{' '}
                          pts
                        </span>
                      </div>
                      <ChevronDown className="w-4 h-4 text-zinc-400 transition-transform duration-200 group-open:rotate-180" />
                    </div>
                  </summary>

                  {/* Expanded Snapshot Lineup Details */}
                  <div className="border-t border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
                    {snapPlayers.length === 0 ? (
                      <p className="text-xs text-zinc-400 text-center py-4">
                        Detailed slot breakdown unavailable for this snapshot.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                        {snapPlayers.map((sp) => (
                          <div
                            key={`${snap.id}-${sp.slot}`}
                            className={`rounded-xl border p-3.5 flex flex-col justify-between ${
                              sp.is_captain
                                ? 'border-amber-400/80 bg-amber-500/10'
                                : 'border-zinc-800 bg-zinc-950/80'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-1 mb-2">
                                <RoleBadge
                                  role={
                                    (sp.role as PlayerRole) ||
                                    ('DPS' as PlayerRole)
                                  }
                                  size="sm"
                                />
                                {sp.is_captain ? (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-400 text-zinc-950 font-black text-[10px]">
                                    <Crown className="w-2.5 h-2.5 fill-zinc-950" />
                                    C • 1.5x
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                                    {sp.team_code}
                                  </span>
                                )}
                              </div>

                              <p className="font-extrabold text-white text-sm truncate">
                                {sp.name}
                              </p>
                              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mt-0.5">
                                {sp.slot}
                              </p>
                            </div>

                            <div className="mt-3 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs">
                              <span className="text-zinc-500">Snapshot Val</span>
                              <span className="font-bold text-emerald-400 font-mono">
                                ${Number(sp.price ?? 0).toFixed(1)}M
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      {/* ====================================================================
          ZONE 4: TROPHY CABINET (Achievements & Empty State)
      ==================================================================== */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-6 space-y-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2.5">
            <Award className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-lg font-black text-white">Trophy Cabinet</h2>
              <p className="text-xs text-zinc-400">
                Seasonal championships, stage medals, and milestone honours
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-emerald-400">
            {earnedBadges.length} Unlocked
          </span>
        </div>

        {earnedBadges.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 py-12 px-4 text-center space-y-2">
            <Trophy className="w-8 h-8 text-zinc-600 mx-auto" />
            <p className="text-sm font-medium text-zinc-400">
              No badges earned yet. Compete to unlock rewards.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {earnedBadges.map((ub) => (
              <div
                key={ub.id}
                className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 flex items-start gap-3.5 hover:border-emerald-500/40 transition-colors"
              >
                <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                  {ub.badges?.icon_url ? (
                    <img
                      src={ub.badges.icon_url}
                      alt={ub.badges.name}
                      className="w-6 h-6 object-contain"
                    />
                  ) : (
                    <Award className="w-6 h-6" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-white truncate">
                    {ub.badges?.name ?? 'Achievement'}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">
                    {ub.badges?.description}
                  </p>
                  <span className="text-[10px] font-mono text-emerald-400 mt-2 block">
                    Unlocked{' '}
                    {new Date(ub.awarded_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}