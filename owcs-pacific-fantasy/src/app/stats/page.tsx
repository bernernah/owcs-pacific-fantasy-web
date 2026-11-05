'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { BarChart3, Search, ArrowUpDown, Filter } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import RoleBadge from '@/components/RoleBadge';
import PriceTrendBadge from '@/components/PriceTrendBadge';
import type {
  PlayerSeasonStat,
  Gameweek,
  PlayerRole,
  Player,
  PlayerOwnershipRow,
} from '@/types/fantasy';

type SortField =
  | 'total_fantasy_points'
  | 'avg_points_per_map'
  | 'price'
  | 'selected_by_pct'
  | 'total_elims'
  | 'total_deaths'
  | 'total_damage'
  | 'total_healing';

interface MatchLogWithRelations {
  id: string;
  gameweek_id: string;
  player_id: string;
  match_name: string;
  map_number: number;
  kills: number;
  deaths: number;
  damage: number;
  healing: number;
  map_won: boolean;
  calculated_points: number;
  players?: Player;
  gameweeks?: Gameweek;
}

export default function StatsDatabasePage() {
  const supabase = getSupabaseBrowserClient();

  const [seasonStats, setSeasonStats] = useState<PlayerSeasonStat[]>([]);
  const [matchLogs, setMatchLogs] = useState<MatchLogWithRelations[]>([]);
  const [ownershipById, setOwnershipById] = useState<
    Record<string, { pct: number; delta: number }>
  >({});
  const [gameweeks, setGameweeks] = useState<Gameweek[]>([]);

  const [selectedGwId, setSelectedGwId] = useState<string>('ALL');
  const [selectedMatchName, setSelectedMatchName] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<PlayerRole | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('total_fantasy_points');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadStatsHub() {
      setLoading(true);
      const [
        { data: seasonData },
        { data: logsData },
        { data: ownershipData },
        { data: gwData },
      ] = await Promise.all([
        supabase.from('player_season_stats_view').select('*'),
        supabase
          .from('match_logs')
          .select('*, players(*, teams(*)), gameweeks(*)')
          .order('created_at', { ascending: false }),
        supabase.from('player_ownership_view').select('*'),
        supabase
          .from('gameweeks')
          .select('*')
          .order('number', { ascending: true }),
      ]);

      const ownMap: Record<string, { pct: number; delta: number }> = {};
      if (ownershipData) {
        for (const row of ownershipData as PlayerOwnershipRow[]) {
          ownMap[row.player_id] = {
            pct: Number(row.selected_by_pct ?? 0),
            delta: Number(row.last_price_delta ?? 0),
          };
        }
      }
      setOwnershipById(ownMap);

      const enrichedSeason = ((seasonData as PlayerSeasonStat[]) ?? []).map(
        (row) => {
          const mapsPlayed = Number(row.maps_played ?? 0);
          const totalPts = Number(row.total_fantasy_points ?? 0);
          const safePpm =
            mapsPlayed > 0 ? Number((totalPts / mapsPlayed).toFixed(1)) : 0.0;

          return {
            ...row,
            avg_points_per_map: safePpm,
            selected_by_pct: ownMap[row.player_id]?.pct ?? 0.0,
            last_price_delta: ownMap[row.player_id]?.delta ?? 0.0,
          };
        }
      );

      setSeasonStats(enrichedSeason);
      setMatchLogs((logsData as MatchLogWithRelations[]) ?? []);
      setGameweeks((gwData as Gameweek[]) ?? []);
      setLoading(false);
    }

    loadStatsHub();
  }, [supabase]);

  // Distinct match names for dropdown filter
  const availableMatchNames = useMemo(() => {
    const filteredByGw =
      selectedGwId === 'ALL'
        ? matchLogs
        : matchLogs.filter((m) => m.gameweek_id === selectedGwId);
    return Array.from(new Set(filteredByGw.map((m) => m.match_name)));
  }, [matchLogs, selectedGwId]);

  // Unified rows: either Season Aggregate or Filtered by Matchday/Match
  const displayedRows = useMemo(() => {
    if (selectedGwId === 'ALL' && selectedMatchName === 'ALL') {
      return seasonStats
        .filter((row) => {
          if (roleFilter !== 'ALL' && row.role !== roleFilter) return false;
          if (
            searchQuery.trim() !== '' &&
            !row.player_name
              .toLowerCase()
              .includes(searchQuery.toLowerCase()) &&
            !row.team_code.toLowerCase().includes(searchQuery.toLowerCase())
          ) {
            return false;
          }
          return true;
        })
        .sort((a, b) => {
          const valA = Number(a[sortField] ?? 0);
          const valB = Number(b[sortField] ?? 0);
          if (valB !== valA) {
            return sortAsc ? valA - valB : valB - valA;
          }
          return (
            Number(b.total_fantasy_points ?? 0) -
            Number(a.total_fantasy_points ?? 0)
          );
        });
    }

    // Aggregate from granular match_logs for the selected Matchday and/or Match
    const grouped: Record<string, PlayerSeasonStat> = {};

    for (const ml of matchLogs) {
      if (selectedGwId !== 'ALL' && ml.gameweek_id !== selectedGwId) continue;
      if (selectedMatchName !== 'ALL' && ml.match_name !== selectedMatchName)
        continue;

      const p = ml.players;
      if (!p) continue;

      if (!grouped[p.id]) {
        grouped[p.id] = {
          player_id: p.id,
          player_name: p.name,
          role: p.role,
          price: Number(p.price),
          is_active: p.is_active,
          team_id: p.team_id,
          team_name: p.teams?.name ?? 'OWCS',
          team_code: p.teams?.code ?? 'OWCS',
          is_eliminated: p.teams?.is_eliminated ?? false,
          maps_played: 0,
          total_elims: 0,
          total_deaths: 0,
          total_damage: 0,
          total_healing: 0,
          maps_won: 0,
          total_fantasy_points: 0,
          avg_points_per_map: 0.0,
          selected_by_pct: ownershipById[p.id]?.pct ?? 0.0,
          last_price_delta: ownershipById[p.id]?.delta ?? 0.0,
        };
      }

      const entry = grouped[p.id];
      entry.maps_played += 1;
      entry.total_elims += Number(ml.kills);
      entry.total_deaths += Number(ml.deaths);
      entry.total_damage += Number(ml.damage);
      entry.total_healing += Number(ml.healing);
      entry.maps_won += ml.map_won ? 1 : 0;
      entry.total_fantasy_points += Number(ml.calculated_points);
      entry.avg_points_per_map =
        entry.maps_played > 0
          ? Number((entry.total_fantasy_points / entry.maps_played).toFixed(1))
          : 0.0;
    }

    return Object.values(grouped)
      .filter((row) => {
        if (roleFilter !== 'ALL' && row.role !== roleFilter) return false;
        if (
          searchQuery.trim() !== '' &&
          !row.player_name.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !row.team_code.toLowerCase().includes(searchQuery.toLowerCase())
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const valA = Number(a[sortField] ?? 0);
        const valB = Number(b[sortField] ?? 0);
        if (valB !== valA) {
          return sortAsc ? valA - valB : valB - valA;
        }
        return (
          Number(b.total_fantasy_points ?? 0) -
          Number(a.total_fantasy_points ?? 0)
        );
      });
  }, [
    seasonStats,
    matchLogs,
    ownershipById,
    selectedGwId,
    selectedMatchName,
    roleFilter,
    searchQuery,
    sortField,
    sortAsc,
  ]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Granular Filters */}
      <div className="rounded-2xl border border-zinc-800 bg-[#0b0e16] p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-orange-500/15 text-orange-400">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">
                OWCS PACIFIC STATS DATABASE
              </h1>
              <p className="text-xs text-zinc-400">
                Compare live manager ownership (Selected %), Points Per Map
                (PPM), and cumulative fantasy totals.
              </p>
            </div>
          </div>

          {/* Search & Role Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search player or team..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
              />
            </div>

            {(['ALL', 'TANK', 'DPS', 'SUPPORT'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRoleFilter(r)}
                className={`px-3 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                  roleFilter === r
                    ? 'bg-orange-500 text-zinc-950'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Granular Scope Dropdowns (Matchday & Match) */}
        <div className="pt-4 border-t border-zinc-800/80 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-400">
            <Filter className="w-4 h-4 text-orange-400" />
            Scope Filter:
          </div>

          <select
            value={selectedGwId}
            onChange={(e) => {
              setSelectedGwId(e.target.value);
              setSelectedMatchName('ALL');
            }}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs font-bold text-white"
          >
            <option value="ALL">All Stage (Cumulative Totals)</option>
            {gameweeks.map((gw) => (
              <option key={gw.id} value={gw.id}>
                Day {gw.number}: {gw.name}
              </option>
            ))}
          </select>

          <select
            value={selectedMatchName}
            onChange={(e) => setSelectedMatchName(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs font-bold text-white"
          >
            <option value="ALL">All Series / Matches</option>
            {availableMatchNames.map((mName) => (
              <option key={mName} value={mName}>
                {mName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Sortable Stats Table */}
      <div className="rounded-2xl border border-zinc-800 bg-[#0b0e16] overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-sm text-zinc-400">
            Loading player telemetry...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] font-bold uppercase tracking-wider text-zinc-400 bg-zinc-900/50">
                  <th className="py-3.5 px-5">Player</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th
                    onClick={() => toggleSort('price')}
                    className="py-3.5 px-4 cursor-pointer hover:text-white select-none"
                  >
                    <span className="inline-flex items-center gap-1">
                      Price <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    onClick={() => toggleSort('selected_by_pct')}
                    className="py-3.5 px-4 text-right cursor-pointer hover:text-emerald-400 select-none"
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      Selected % <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th className="py-3.5 px-4 text-right">Maps</th>
                  <th
                    onClick={() => toggleSort('total_elims')}
                    className="py-3.5 px-4 text-right cursor-pointer hover:text-white select-none"
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      Elims <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    onClick={() => toggleSort('total_deaths')}
                    className="py-3.5 px-4 text-right cursor-pointer hover:text-white select-none"
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      Deaths <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    onClick={() => toggleSort('total_damage')}
                    className="py-3.5 px-4 text-right cursor-pointer hover:text-white select-none"
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      Damage <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    onClick={() => toggleSort('total_healing')}
                    className="py-3.5 px-4 text-right cursor-pointer hover:text-white select-none"
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      Healing <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  {/* NEW: Sortable Points Per Map (PPM) Column immediately left of Fantasy Pts */}
                  <th
                    onClick={() => toggleSort('avg_points_per_map')}
                    title="Points Per Map (Total Fantasy Points / Maps Played)"
                    className="py-3.5 px-4 text-right cursor-pointer hover:text-amber-400 text-amber-300/90 select-none"
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      Points Per Map <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    onClick={() => toggleSort('total_fantasy_points')}
                    className="py-3.5 px-5 text-right cursor-pointer text-orange-400 select-none"
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      Fantasy Pts <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50 text-sm">
                {displayedRows.map((row) => {
                  const mapsPlayed = Number(row.maps_played ?? 0);
                  const totalPts = Number(row.total_fantasy_points ?? 0);
                  const ppmValue =
                    mapsPlayed > 0
                      ? Number((totalPts / mapsPlayed).toFixed(1))
                      : 0.0;

                  return (
                    <tr
                      key={row.player_id}
                      className="hover:bg-zinc-800/35 transition-colors"
                    >
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2.5">
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                            {row.team_code}
                          </span>
                          <span className="font-bold text-white">
                            {row.player_name}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <RoleBadge role={row.role} size="sm" />
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-emerald-400 font-mono">
                        <div className="flex items-center gap-1.5">
                          <span>${Number(row.price).toFixed(1)}M</span>
                          <PriceTrendBadge delta={row.last_price_delta} />
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 font-mono text-xs font-bold text-emerald-400">
                          {Number(row.selected_by_pct ?? 0).toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right text-zinc-300 font-mono">
                        {mapsPlayed}
                      </td>
                      <td className="py-3.5 px-4 text-right font-semibold text-zinc-200 font-mono">
                        {row.total_elims}
                      </td>
                      <td className="py-3.5 px-4 text-right text-rose-400 font-mono">
                        {row.total_deaths}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs text-zinc-300">
                        {Number(row.total_damage).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs text-zinc-300">
                        {Number(row.total_healing).toLocaleString()}
                      </td>
                      {/* NEW: Points Per Map Cell */}
                      <td className="py-3.5 px-4 text-right">
                        <span className="font-mono font-bold text-sm text-amber-300">
                          {ppmValue.toFixed(1)}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <span className="font-black text-base text-orange-400 font-mono">
                          {totalPts.toFixed(1)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}