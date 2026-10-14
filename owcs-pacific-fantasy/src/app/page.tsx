'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Trophy,
  Clock,
  Sparkles,
  ChevronRight,
  X,
  Shield,
  Award,
  Users,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import RoleBadge from '@/components/RoleBadge';
import type {
  LeaderboardRow,
  Gameweek,
  Player,
  UserRoster,
} from '@/types/fantasy';

interface EnrichedRosterModalData {
  manager: LeaderboardRow;
  roster: UserRoster | null;
  playersById: Record<string, Player>;
  playerGwPoints: Record<string, number>;
}

export default function LeaderboardPage() {
  const supabase = getSupabaseBrowserClient();

  const [standings, setStandings] = useState<LeaderboardRow[]>([]);
  const [activeGw, setActiveGw] = useState<Gameweek | null>(null);
  const [allGameweeks, setAllGameweeks] = useState<Gameweek[]>([]);
  const [selectedGwId, setSelectedGwId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  const [modalLoading, setModalLoading] = useState<boolean>(false);
  const [inspectedManager, setInspectedManager] =
    useState<EnrichedRosterModalData | null>(null);

  useEffect(() => {
    async function fetchInitialData() {
      setLoading(true);

      const [{ data: gwData }, { data: lbData }] = await Promise.all([
        supabase
          .from('gameweeks')
          .select('*')
          .order('number', { ascending: true }),
        supabase.from('leaderboard_view').select('*'),
      ]);

      if (gwData && gwData.length > 0) {
        const gws = gwData as Gameweek[];
        setAllGameweeks(gws);
        const current =
          gws.find((g) => g.status === 'ACTIVE') ??
          gws.find((g) => g.status === 'UPCOMING') ??
          gws[gws.length - 1];
        setActiveGw(current);
        setSelectedGwId(current.id);
      }

      if (lbData) {
        setStandings(lbData as LeaderboardRow[]);
      }

      setLoading(false);
    }

    fetchInitialData();
  }, [supabase]);

  const handleInspectManager = async (
    manager: LeaderboardRow,
    gwIdToInspect?: string
  ) => {
    const targetGwId = gwIdToInspect || selectedGwId || activeGw?.id;
    if (!targetGwId) return;

    setModalLoading(true);

    const { data: rosterData } = await supabase
      .from('user_rosters')
      .select('*')
      .eq('user_id', manager.user_id)
      .eq('gameweek_id', targetGwId)
      .maybeSingle();

    const roster = (rosterData as UserRoster) ?? null;
    const playersById: Record<string, Player> = {};
    const playerGwPoints: Record<string, number> = {};

    if (roster) {
      const slotIds = [
        roster.tank_id,
        roster.dps1_id,
        roster.dps2_id,
        roster.sup1_id,
        roster.sup2_id,
      ];

      const [{ data: playersData }, { data: statsData }] = await Promise.all([
        supabase
          .from('players')
          .select('*, teams(*)')
          .in('id', slotIds),
        supabase
          .from('match_stats')
          .select('player_id, calculated_points')
          .eq('gameweek_id', targetGwId)
          .in('player_id', slotIds),
      ]);

      if (playersData) {
        for (const p of playersData as Player[]) {
          playersById[p.id] = p;
        }
      }

      if (statsData) {
        for (const row of statsData) {
          playerGwPoints[row.player_id] =
            (playerGwPoints[row.player_id] ?? 0) +
            Number(row.calculated_points);
        }
      }
    }

    setInspectedManager({
      manager,
      roster,
      playersById,
      playerGwPoints,
    });
    setModalLoading(false);
  };

  const getEffectiveLockDate = (gw: Gameweek | null) => {
    if (!gw) return null;
    return new Date(new Date(gw.lock_time).getTime() - 15 * 60 * 1000);
  };

  const lockDate = getEffectiveLockDate(activeGw);
  const isLocked = lockDate ? new Date() >= lockDate : false;

  return (
    <div className="space-y-8">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-[#0f131d] to-zinc-950 p-6 sm:p-8 shadow-2xl">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-orange-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              {activeGw ? activeGw.name : 'OWCS Pacific Stage'}
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
              OWCS PACIFIC <span className="text-orange-500">LEADERBOARD</span>
            </h1>
            <p className="text-sm text-zinc-400 max-w-2xl">
              Click any manager in the standings to inspect their active 5-player
              starting lineup and individual Gameweek point breakdowns.
            </p>
          </div>

          {/* Lock Deadline Box */}
          {activeGw && lockDate && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-zinc-950/80 border border-zinc-800/90 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-lg ${
                    isLocked
                      ? 'bg-rose-500/15 text-rose-400'
                      : 'bg-emerald-500/15 text-emerald-400'
                  }`}
                >
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider font-bold text-zinc-400">
                    {isLocked ? 'Lineups Locked' : 'Next Roster Lock (15m Prior)'}
                  </p>
                  <p className="text-sm font-bold text-white">
                    {lockDate.toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
              <Link
                href="/my-team"
                className="w-full sm:w-auto text-center bg-orange-500 hover:bg-orange-400 text-zinc-950 font-extrabold text-xs uppercase tracking-wider px-4 py-2.5 rounded-lg transition-all"
              >
                Manage Squad
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Standings Table */}
      <div className="rounded-2xl border border-zinc-800/90 bg-[#0b0e16] overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-zinc-800/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Trophy className="w-5 h-5 text-orange-500" />
            <h2 className="text-lg font-extrabold text-white">
              Global Manager Standings
            </h2>
          </div>
          <span className="text-xs text-zinc-400 font-medium">
            {standings.length} Registered Managers
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-zinc-400 text-sm">
            Loading OWCS Pacific standings...
          </div>
        ) : standings.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Users className="w-10 h-10 text-zinc-600 mx-auto" />
            <p className="text-zinc-300 font-bold">No managers ranked yet</p>
            <p className="text-xs text-zinc-500">
              Sign in with Discord and lock in your GW1 starting 5 to appear on
              the global leaderboard.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800/80 text-[11px] font-bold uppercase tracking-wider text-zinc-400 bg-zinc-900/40">
                  <th className="py-3.5 px-6 w-20">Rank</th>
                  <th className="py-3.5 px-6">Manager</th>
                  <th className="py-3.5 px-6 text-right">GW Points</th>
                  <th className="py-3.5 px-6 text-right">Season Total</th>
                  <th className="py-3.5 px-6 w-16 text-right">Lineup</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50 text-sm">
                {standings.map((row) => {
                  const isTop3 = row.rank <= 3;
                  const rankColors: Record<number, string> = {
                    1: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
                    2: 'bg-zinc-300/20 text-zinc-200 border-zinc-400/40',
                    3: 'bg-orange-700/20 text-orange-400 border-orange-600/40',
                  };

                  return (
                    <tr
                      key={row.user_id}
                      onClick={() => handleInspectManager(row)}
                      className="group cursor-pointer hover:bg-zinc-800/40 transition-colors"
                    >
                      <td className="py-4 px-6 font-black">
                        {isTop3 ? (
                          <span
                            className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border text-xs ${
                              rankColors[row.rank]
                            }`}
                          >
                            #{row.rank}
                          </span>
                        ) : (
                          <span className="text-zinc-400 pl-2">#{row.rank}</span>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          {row.avatar_url ? (
                            <img
                              src={row.avatar_url}
                              alt={row.username}
                              className="w-9 h-9 rounded-full object-cover ring-1 ring-zinc-700"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 flex items-center justify-center font-bold text-xs">
                              {row.username.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-bold text-white group-hover:text-orange-400 transition-colors">
                              {row.username}
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              Click to view active roster
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right font-semibold text-zinc-300">
                        {Number(row.gw_points).toFixed(1)}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <span className="font-black text-base text-orange-400">
                          {Number(row.total_points).toFixed(1)}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-orange-400 ml-auto transition-transform group-hover:translate-x-0.5" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manager Active Lineup Modal */}
      {(inspectedManager || modalLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-2xl rounded-2xl border border-zinc-800 bg-[#0d1018] p-6 shadow-2xl">
            {modalLoading || !inspectedManager ? (
              <div className="py-12 text-center text-sm text-zinc-400">
                Loading manager lineup...
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                  <div className="flex items-center gap-3">
                    {inspectedManager.manager.avatar_url && (
                      <img
                        src={inspectedManager.manager.avatar_url}
                        alt={inspectedManager.manager.username}
                        className="w-10 h-10 rounded-full"
                      />
                    )}
                    <div>
                      <h3 className="text-lg font-black text-white">
                        {inspectedManager.manager.username}&apos;s Starting 5
                      </h3>
                      <p className="text-xs text-zinc-400">
                        Rank #{inspectedManager.manager.rank} • Season Total:{' '}
                        <span className="text-orange-400 font-bold">
                          {Number(
                            inspectedManager.manager.total_points
                          ).toFixed(1)}{' '}
                          pts
                        </span>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setInspectedManager(null)}
                    className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Gameweek Selector inside Modal */}
                <div className="my-4 flex items-center justify-between gap-4">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Inspect Gameweek:
                  </label>
                  <select
                    value={selectedGwId}
                    onChange={(e) => {
                      setSelectedGwId(e.target.value);
                      handleInspectManager(
                        inspectedManager.manager,
                        e.target.value
                      );
                    }}
                    className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                  >
                    {allGameweeks.map((gw) => (
                      <option key={gw.id} value={gw.id}>
                        GW{gw.number}: {gw.name}
                      </option>
                    ))}
                  </select>
                </div>

                {!inspectedManager.roster ? (
                  <div className="py-10 text-center bg-zinc-900/40 rounded-xl border border-zinc-800/80">
                    <Shield className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                    <p className="text-sm font-bold text-zinc-300">
                      No roster submitted for this Gameweek
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                      {[
                        {
                          label: 'TANK',
                          id: inspectedManager.roster.tank_id,
                        },
                        {
                          label: 'DPS 1',
                          id: inspectedManager.roster.dps1_id,
                        },
                        {
                          label: 'DPS 2',
                          id: inspectedManager.roster.dps2_id,
                        },
                        {
                          label: 'SUP 1',
                          id: inspectedManager.roster.sup1_id,
                        },
                        {
                          label: 'SUP 2',
                          id: inspectedManager.roster.sup2_id,
                        },
                      ].map((slot) => {
                        const player =
                          inspectedManager.playersById[slot.id];
                        const pts =
                          inspectedManager.playerGwPoints[slot.id] ?? 0;

                        return (
                          <div
                            key={slot.label}
                            className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3.5 flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                {player ? (
                                  <RoleBadge role={player.role} size="sm" />
                                ) : (
                                  <span className="text-[10px] text-zinc-500">
                                    {slot.label}
                                  </span>
                                )}
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                                  {player?.teams?.code ?? 'OWCS'}
                                </span>
                              </div>
                              <p className="font-extrabold text-white text-sm truncate">
                                {player?.name ?? 'Unknown'}
                              </p>
                              <p className="text-[11px] text-zinc-400">
                                ${player?.price ?? 0}M
                              </p>
                            </div>
                            <div className="mt-3 pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                              <span className="text-[10px] uppercase text-zinc-500 font-bold">
                                GW Pts
                              </span>
                              <span className="text-xs font-black text-orange-400">
                                {pts.toFixed(1)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between bg-zinc-900/90 border border-zinc-800 px-4 py-3 rounded-xl text-xs">
                      <span className="text-zinc-400">
                        Transfers Used:{' '}
                        <strong className="text-white">
                          {inspectedManager.roster.transfers_used}
                        </strong>
                      </span>
                      <span className="text-zinc-400">
                        Net Gameweek Score:{' '}
                        <strong className="text-orange-400 text-sm">
                          {Number(
                            inspectedManager.roster.points_earned
                          ).toFixed(1)}{' '}
                          pts
                        </strong>
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}