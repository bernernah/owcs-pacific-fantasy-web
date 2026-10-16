'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Table,
  CheckCircle2,
  RotateCcw,
  Filter,
  Keyboard,
  Trophy,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import RoleBadge from '@/components/RoleBadge';
import type { Player, Team, Gameweek } from '@/types/fantasy';

export interface PlayerGridStat {
  player_id: string;
  included: boolean;
  kills: number;
  deaths: number;
  damage: number;
  healing: number;
  map_won: boolean;
}

interface SpreadsheetStatGridProps {
  gameweeks: Gameweek[];
  teams: Team[];
  players: Player[];
  selectedGwId: string;
  onSelectGwId: (id: string) => void;
  matchName: string;
  onChangeMatchName: (name: string) => void;
  externalPrefill?: Record<string, Partial<PlayerGridStat>> | null;
  onStatsCommitted?: () => void;
  onBanner: (msg: { type: 'success' | 'error'; text: string } | null) => void;
}

const STAT_COLUMNS = ['kills', 'deaths', 'damage', 'healing'] as const;
type StatColumnKey = (typeof STAT_COLUMNS)[number];

export default function SpreadsheetStatGrid({
  gameweeks,
  teams,
  players,
  selectedGwId,
  onSelectGwId,
  matchName,
  onChangeMatchName,
  externalPrefill,
  onStatsCommitted,
  onBanner,
}: SpreadsheetStatGridProps) {
  const supabase = getSupabaseBrowserClient();

  // Optional 2-Team Matchup Filter for faster entry
  const [teamAFilter, setTeamAFilter] = useState<string>('ALL');
  const [teamBFilter, setTeamBFilter] = useState<string>('ALL');
  const [committing, setCommitting] = useState<boolean>(false);

  // Dictionary of stats keyed by player.id
  const [gridMap, setGridMap] = useState<Record<string, PlayerGridStat>>({});

  // Initialize blank grid rows for all players
  useEffect(() => {
    setGridMap((prev) => {
      const next: Record<string, PlayerGridStat> = {};
      for (const p of players) {
        next[p.id] = prev[p.id] ?? {
          player_id: p.id,
          included: false,
          kills: 0,
          deaths: 0,
          damage: 0,
          healing: 0,
          map_won: false,
        };
      }
      return next;
    });
  }, [players]);

  // Apply external prefill from Gemini AI or Match History Edit
  useEffect(() => {
    if (!externalPrefill) return;
    setGridMap(() => {
      const next: Record<string, PlayerGridStat> = {};
      for (const p of players) {
        const incoming = externalPrefill[p.id];
        next[p.id] = {
          player_id: p.id,
          included: Boolean(incoming),
          kills: incoming?.kills ?? 0,
          deaths: incoming?.deaths ?? 0,
          damage: incoming?.damage ?? 0,
          healing: incoming?.healing ?? 0,
          map_won: incoming?.map_won ?? false,
        };
      }
      return next;
    });
  }, [externalPrefill, players]);

  // Auto-generate Match Name when both Team A and Team B are selected
  const handleTeamFilterChange = (slot: 'A' | 'B', teamId: string) => {
    const nextA = slot === 'A' ? teamId : teamAFilter;
    const nextB = slot === 'B' ? teamId : teamBFilter;
    if (slot === 'A') setTeamAFilter(teamId);
    if (slot === 'B') setTeamBFilter(teamId);

    if (nextA !== 'ALL' && nextB !== 'ALL' && nextA !== nextB) {
      const codeA = teams.find((t) => t.id === nextA)?.code;
      const codeB = teams.find((t) => t.id === nextB)?.code;
      if (codeA && codeB && !matchName.trim()) {
        onChangeMatchName(`${codeA} vs ${codeB}`);
      }
    }
  };

  // Sort players by Team Code, then Role (TANK -> DPS -> SUPPORT), then Name
  const visiblePlayers = useMemo(() => {
    const roleOrder: Record<string, number> = {
      TANK: 1,
      DPS: 2,
      SUPPORT: 3,
    };

    return players
      .filter((p) => {
        if (teamAFilter === 'ALL' && teamBFilter === 'ALL') return true;
        return p.team_id === teamAFilter || p.team_id === teamBFilter;
      })
      .sort((a, b) => {
        const teamA = a.teams?.code ?? '';
        const teamB = b.teams?.code ?? '';
        if (teamA !== teamB) return teamA.localeCompare(teamB);
        const rDiff = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
        if (rDiff !== 0) return rDiff;
        return a.name.localeCompare(b.name);
      });
  }, [players, teamAFilter, teamBFilter]);

  const updateStatCell = (
    playerId: string,
    field: StatColumnKey,
    rawVal: string
  ) => {
    const cleaned = rawVal.replace(/[^0-9]/g, '');
    const numeric = cleaned === '' ? 0 : parseInt(cleaned, 10);

    setGridMap((prev) => {
      const current = prev[playerId] ?? {
        player_id: playerId,
        included: false,
        kills: 0,
        deaths: 0,
        damage: 0,
        healing: 0,
        map_won: false,
      };

      const updated: PlayerGridStat = {
        ...current,
        [field]: numeric,
      };

      const hasAnyNonZero =
        updated.kills > 0 ||
        updated.deaths > 0 ||
        updated.damage > 0 ||
        updated.healing > 0;

      updated.included = hasAnyNonZero || current.included;

      return {
        ...prev,
        [playerId]: updated,
      };
    });
  };

  const toggleRowField = (
    playerId: string,
    field: 'included' | 'map_won',
    checked: boolean
  ) => {
    setGridMap((prev) => {
      const current = prev[playerId];
      if (!current) return prev;
      return {
        ...prev,
        [playerId]: {
          ...current,
          [field]: checked,
          included: field === 'map_won' && checked ? true : field === 'included' ? checked : current.included,
        },
      };
    });
  };

  // Mark an entire team as Map Winner (+3.0 pts)
  const setTeamWon = (teamId: string) => {
    if (teamId === 'ALL') return;
    setGridMap((prev) => {
      const next = { ...prev };
      for (const p of visiblePlayers) {
        const entry = next[p.id];
        if (!entry) continue;
        if (p.team_id === teamId) {
          next[p.id] = { ...entry, map_won: true };
        } else if (
          teamAFilter !== 'ALL' &&
          teamBFilter !== 'ALL' &&
          (p.team_id === teamAFilter || p.team_id === teamBFilter)
        ) {
          next[p.id] = { ...entry, map_won: false };
        }
      }
      return next;
    });
  };

  // Real-time Fantasy Point Preview
  const calculateRowPoints = (stat: PlayerGridStat | undefined): number => {
    if (!stat) return 0;
    const pts =
      stat.kills * 1.0 -
      stat.deaths * 1.0 +
      (stat.damage / 1000.0) * 1.0 +
      (stat.healing / 1000.0) * 1.2 +
      (stat.map_won ? 3.0 : 0.0);
    return Number(pts.toFixed(2));
  };

  // ==========================================================================
  // NATIVE SPREADSHEET ARROW-KEY NAVIGATION (UP, DOWN, LEFT, RIGHT, ENTER)
  // ==========================================================================
  const focusCell = (rowIdx: number, colIdx: number) => {
    const selector = `input[data-grid-cell="${rowIdx}-${colIdx}"]`;
    const target = document.querySelector<HTMLInputElement>(selector);
    if (target) {
      target.focus();
      target.select();
    }
  };

  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    colIdx: number
  ) => {
    const totalRows = visiblePlayers.length;
    const totalCols = STAT_COLUMNS.length;

    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      if (rowIdx + 1 < totalRows) {
        focusCell(rowIdx + 1, colIdx);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rowIdx - 1 >= 0) {
        focusCell(rowIdx - 1, colIdx);
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (colIdx + 1 < totalCols) {
        focusCell(rowIdx, colIdx + 1);
      } else if (rowIdx + 1 < totalRows) {
        focusCell(rowIdx + 1, 0);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (colIdx - 1 >= 0) {
        focusCell(rowIdx, colIdx - 1);
      } else if (rowIdx - 1 >= 0) {
        focusCell(rowIdx - 1, totalCols - 1);
      }
    }
  };

  const handleResetGrid = () => {
    const reset: Record<string, PlayerGridStat> = {};
    for (const p of players) {
      reset[p.id] = {
        player_id: p.id,
        included: false,
        kills: 0,
        deaths: 0,
        damage: 0,
        healing: 0,
        map_won: false,
      };
    }
    setGridMap(reset);
    onBanner(null);
  };

  const includedRows = useMemo(
    () => Object.values(gridMap).filter((r) => r.included),
    [gridMap]
  );

  const handleCommitMatchLogs = async () => {
    onBanner(null);

    if (!selectedGwId) {
      onBanner({ type: 'error', text: 'Please select a target Gameweek.' });
      return;
    }

    if (!matchName.trim()) {
      onBanner({
        type: 'error',
        text: 'Please enter a Match Name (e.g., "STH vs BXN").',
      });
      return;
    }

    if (includedRows.length === 0) {
      onBanner({
        type: 'error',
        text: 'Enter stats for at least one player before committing to the ledger.',
      });
      return;
    }

    setCommitting(true);

    const payload = includedRows.map((row) => ({
      gameweek_id: selectedGwId,
      match_name: matchName.trim(),
      player_id: row.player_id,
      kills: Number(row.kills),
      deaths: Number(row.deaths),
      damage: Number(row.damage),
      healing: Number(row.healing),
      map_won: Boolean(row.map_won),
    }));

    const { error } = await supabase.from('match_logs').upsert(payload, {
      onConflict: 'gameweek_id,match_name,player_id',
    });

    setCommitting(false);

    if (error) {
      onBanner({ type: 'error', text: error.message });
    } else {
      onBanner({
        type: 'success',
        text: `Saved ${payload.length} player stat lines to match_logs for "${matchName.trim()}" and updated all manager totals!`,
      });
      handleResetGrid();
      onChangeMatchName('');
      if (onStatsCommitted) onStatsCommitted();
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0b0e16] p-6 space-y-6 shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-2.5">
          <Table className="w-5 h-5 text-orange-400" />
          <div>
            <h2 className="text-lg font-black text-white">
              Per-Game Match Ledger Spreadsheet
            </h2>
            <p className="text-xs text-zinc-400">
              Navigate cells rapidly with{' '}
              <span className="text-orange-400 font-bold">
                ↑ ↓ ← → Arrow Keys
              </span>{' '}
              or <span className="text-orange-400 font-bold">Enter</span>. Only
              checked/active rows are committed to the match ledger.
            </p>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-[11px] font-bold text-zinc-300">
          <Keyboard className="w-3.5 h-3.5 text-orange-400" />
          Excel-Mode Keyboard Navigation Active
        </div>
      </div>

      {/* Match Target Metadata & Quick 2-Team Filter */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
            1. Target Gameweek
          </label>
          <select
            value={selectedGwId}
            onChange={(e) => onSelectGwId(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-bold text-white"
          >
            {gameweeks.map((gw) => (
              <option key={gw.id} value={gw.id}>
                GW{gw.number}: {gw.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
            2. Match Identifier
          </label>
          <input
            type="text"
            placeholder="e.g., STH vs BXN (Map 1)"
            value={matchName}
            onChange={(e) => onChangeMatchName(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-orange-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
            Filter Team A (Optional)
          </label>
          <div className="flex items-center gap-1.5">
            <select
              value={teamAFilter}
              onChange={(e) => handleTeamFilterChange('A', e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-bold text-white"
            >
              <option value="ALL">All Teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} — {t.name}
                </option>
              ))}
            </select>
            {teamAFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setTeamWon(teamAFilter)}
                title="Mark Team A as Map Winner"
                className="px-2.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-[10px] font-black shrink-0"
              >
                <Trophy className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
            Filter Team B (Optional)
          </label>
          <div className="flex items-center gap-1.5">
            <select
              value={teamBFilter}
              onChange={(e) => handleTeamFilterChange('B', e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-bold text-white"
            >
              <option value="ALL">All Teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} — {t.name}
                </option>
              ))}
            </select>
            {teamBFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setTeamWon(teamBFilter)}
                title="Mark Team B as Map Winner"
                className="px-2.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-[10px] font-black shrink-0"
              >
                <Trophy className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Spreadsheet Grid Table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-800 max-h-[560px] overflow-y-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="py-3 px-3 w-12 text-center">Play</th>
              <th className="py-3 px-3 w-20">Team</th>
              <th className="py-3 px-3">Player</th>
              <th className="py-3 px-3 w-24">Role</th>
              <th className="py-3 px-2 w-28 text-right text-zinc-200">
                Kills (E)
              </th>
              <th className="py-3 px-2 w-28 text-right text-zinc-200">
                Deaths (D)
              </th>
              <th className="py-3 px-2 w-32 text-right text-zinc-200">
                Damage
              </th>
              <th className="py-3 px-2 w-32 text-right text-zinc-200">
                Healing
              </th>
              <th className="py-3 px-3 w-20 text-center">Won (+3)</th>
              <th className="py-3 px-4 w-24 text-right text-orange-400">
                Points
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {visiblePlayers.map((player, rowIdx) => {
              const stat = gridMap[player.id] ?? {
                player_id: player.id,
                included: false,
                kills: 0,
                deaths: 0,
                damage: 0,
                healing: 0,
                map_won: false,
              };
              const rowPts = calculateRowPoints(stat);

              return (
                <tr
                  key={player.id}
                  className={`transition-colors ${
                    stat.included
                      ? 'bg-orange-500/5 hover:bg-orange-500/10'
                      : 'bg-zinc-950/40 hover:bg-zinc-900/50'
                  }`}
                >
                  {/* Included Checkbox */}
                  <td className="py-2 px-3 text-center">
                    <input
                      type="checkbox"
                      checked={stat.included}
                      onChange={(e) =>
                        toggleRowField(player.id, 'included', e.target.checked)
                      }
                      className="w-4 h-4 accent-orange-500 rounded cursor-pointer"
                    />
                  </td>

                  {/* Team Code Badge */}
                  <td className="py-2 px-3">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 border border-zinc-700">
                      {player.teams?.code ?? 'OWCS'}
                    </span>
                  </td>

                  {/* Player Name */}
                  <td className="py-2 px-3 font-bold text-white whitespace-nowrap">
                    {player.name}
                  </td>

                  {/* Role Badge */}
                  <td className="py-2 px-3">
                    <RoleBadge role={player.role} size="sm" />
                  </td>

                  {/* 4 Arrow-Navigable Stat Cells: Kills (0), Deaths (1), Damage (2), Healing (3) */}
                  {STAT_COLUMNS.map((colKey, colIdx) => (
                    <td key={colKey} className="py-1.5 px-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        data-grid-cell={`${rowIdx}-${colIdx}`}
                        value={stat[colKey]}
                        onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={(e) => handleCellKeyDown(e, rowIdx, colIdx)}
                        onChange={(e) =>
                          updateStatCell(player.id, colKey, e.target.value)
                        }
                        className={`w-full text-right font-mono font-bold rounded-lg px-2.5 py-1.5 border transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
                          stat.included
                            ? 'bg-zinc-900 border-zinc-700 text-white'
                            : 'bg-zinc-950 border-zinc-800/80 text-zinc-400'
                        }`}
                      />
                    </td>
                  ))}

                  {/* Map Won Bonus Checkbox */}
                  <td className="py-2 px-3 text-center">
                    <input
                      type="checkbox"
                      checked={stat.map_won}
                      onChange={(e) =>
                        toggleRowField(player.id, 'map_won', e.target.checked)
                      }
                      className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                    />
                  </td>

                  {/* Live Calculated Points */}
                  <td className="py-2 px-4 text-right font-mono font-black">
                    <span
                      className={
                        stat.included ? 'text-orange-400' : 'text-zinc-600'
                      }
                    >
                      {rowPts.toFixed(1)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer Bar: Active Row Count, Clear & Commit Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-zinc-800">
        <div className="flex items-center gap-4">
          <span className="text-xs font-bold text-zinc-400">
            Active Players Ready to Commit:{' '}
            <strong className="text-orange-400">{includedRows.length}</strong>
          </span>

          <button
            type="button"
            onClick={handleResetGrid}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Clear Grid
          </button>
        </div>

        <button
          type="button"
          onClick={handleCommitMatchLogs}
          disabled={committing || includedRows.length === 0}
          className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-zinc-950 font-black text-xs sm:text-sm uppercase tracking-wider px-6 py-3 rounded-xl shadow-lg shadow-emerald-500/20 transition-all"
        >
          <CheckCircle2 className="w-4 h-4" />
          {committing
            ? 'Committing to Ledger...'
            : `Commit Match Stats (${includedRows.length} Players)`}
        </button>
      </div>
    </div>
  );
}