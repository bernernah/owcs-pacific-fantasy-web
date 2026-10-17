'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
  BarChart3,
  Search,
  ArrowUpDown,
  Filter,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import RoleBadge from '@/components/RoleBadge';
import type {
  PlayerSeasonStat,
  MatchStat,
  Gameweek,
  PlayerRole,
} from '@/types/fantasy';

type SortField =
  | 'total_fantasy_points'
  | 'price'
  | 'total_elims'
  | 'total_deaths'
  | 'total_damage'
  | 'total_healing';

export default function StatsDatabasePage() {
  const supabase = getSupabaseBrowserClient();

  const [seasonStats, setSeasonStats] = useState<PlayerSeasonStat[]>([]);
  const [matchStats, setMatchStats] = useState<MatchStat[]>([]);
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
      const [{ data: seasonData }, { data: matchData }, { data: gwData }] =
        await Promise.all([
          supabase.from('player_season_stats_view').select('*'),
          supabase
            .from('match_logs')
            .select('*, players(*, teams(*)), gameweeks(*)')
            .order('created_at', { ascending: false }),
          supabase
            .from('gameweeks')
            .select('*')
            .order('number', { ascending: true }),
        ]);

      setSeasonStats((seasonData as PlayerSeasonStat[]) ?? []);
      setMatchStats((matchData as MatchStat[]) ?? []);
      setGameweeks((gwData as Gameweek[]) ?? []);
      setLoading(false);
    }

    loadStatsHub();
  }, [supabase]);

  // Distinct match names for dropdown filter
  const availableMatchNames = useMemo(() => {
    const filteredByGw =
      selectedGwId === 'ALL'
        ? matchStats
        : matchStats.filter((m) => m.gameweek_id === selectedGwId);
    return Array.from(new Set(filteredByGw.map((m) => m.match_name)));
  }, [matchStats, selectedGwId]);

  // Unified rows: either Season Aggregate or Filtered by Gameweek/Match
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
          const valA = Number(a[sortField]);
          const valB = Number(b[sortField]);
          return sortAsc ? valA - valB : valB - valA;
        });
    }

    // Aggregate from granular match_logs for the selected Gameweek and/or Match
    const grouped: Record<string, PlayerSeasonStat> = {};

    for (const ms of matchStats) {
      if (selectedGwId !== 'ALL' && ms.gameweek_id !== selectedGwId) continue;
      if (
        selectedMatchName !== 'ALL' &&
        ms.match_name !== selectedMatchName
      )
        continue;

      const p = ms.players;
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
          avg_points_per_map: 0,
        };
      }

      const entry = grouped[p.id];
      entry.maps_played += 1;
      entry.total_elims += Number(ms.kills);
      entry.total_deaths += Number(ms.deaths);
      entry.total_damage += Number(ms.damage);
      entry.total_healing += Number(ms.healing);
      entry.maps_won += ms.map_won ? 1 : 0;
      entry.total_fantasy_points += Number(ms.calculated_points);
      entry.avg_points_per_map = Number(
        (entry.total_fantasy_points / entry.maps_played).toFixed(2)
      );
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
        const valA = Number(a[sortField]);
        const valB = Number(b[sortField]);
        return sortAsc ? valA - valB : valB - valA;
      });
  }, [
    seasonStats,
    matchStats,
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
                Inspect cumulative season totals or drill down into specific
                Gameweeks and individual map scoreboards.
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
                onClick={() => setRoleFilter(r)}
                className={`px-3 py-2 rounded-xl text-xs font-bold ${
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

        {/* Granular Scope Dropdowns (Gameweek & Match) */}
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
            <option value="ALL">All Season (Cumulative Totals)</option>
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
            <option value="ALL">All Matches / Maps</option>
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
                    className="py-3.5 px-4 cursor-pointer hover:text-white"
                  >
                    <span className="inline-flex items-center gap-1">
                      Price <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th className="py-3.5 px-4 text-right">Maps</th>
                  <th
                    onClick={() => toggleSort('total_elims')}
                    className="py-3.5 px-4 text-right cursor-pointer hover:text-white"
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      Elims <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    onClick={() => toggleSort('total_deaths')}
                    className="py-3.5 px-4 text-right cursor-pointer hover:text-white"
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      Deaths <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    onClick={() => toggleSort('total_damage')}
                    className="py-3.5 px-4 text-right cursor-pointer hover:text-white"
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      Damage <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    onClick={() => toggleSort('total_healing')}
                    className="py-3.5 px-4 text-right cursor-pointer hover:text-white"
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      Healing <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    onClick={() => toggleSort('total_fantasy_points')}
                    className="py-3.5 px-5 text-right cursor-pointer text-orange-400"
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      Fantasy Pts <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50 text-sm">
                {displayedRows.map((row) => (
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
                    <td className="py-3.5 px-4 font-semibold text-emerald-400">
                      ${Number(row.price).toFixed(1)}M
                    </td>
                    <td className="py-3.5 px-4 text-right text-zinc-300">
                      {row.maps_played}
                    </td>
                    <td className="py-3.5 px-4 text-right font-semibold text-zinc-200">
                      {row.total_elims}
                    </td>
                    <td className="py-3.5 px-4 text-right text-rose-400">
                      {row.total_deaths}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-zinc-300">
                      {Number(row.total_damage).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-zinc-300">
                      {Number(row.total_healing).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <span className="font-black text-base text-orange-400">
                        {Number(row.total_fantasy_points).toFixed(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}