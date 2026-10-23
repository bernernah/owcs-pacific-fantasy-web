'use client';

import React, { useState, useMemo } from 'react';
import { Calendar, Clock, Sparkles, Swords, Lock } from 'lucide-react';
import type { Fixture, Gameweek } from '@/types/fantasy';

interface StageFixturesScheduleProps {
  gameweeks: Gameweek[];
  fixtures: Fixture[];
  activeGwId?: string | null;
}

export default function StageFixturesSchedule({
  gameweeks,
  fixtures,
  activeGwId,
}: StageFixturesScheduleProps) {
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>('ALL');

  const fixturesByGwId = useMemo(() => {
    const map: Record<string, Fixture[]> = {};
    for (const gw of gameweeks) {
      map[gw.id] = [];
    }
    for (const fix of fixtures) {
      if (!map[fix.gameweek_id]) {
        map[fix.gameweek_id] = [];
      }
      map[fix.gameweek_id].push(fix);
    }
    for (const gwId of Object.keys(map)) {
      map[gwId].sort(
        (a, b) =>
          new Date(a.match_time).getTime() - new Date(b.match_time).getTime()
      );
    }
    return map;
  }, [gameweeks, fixtures]);

  const visibleGameweeks = useMemo(() => {
    if (selectedDayFilter === 'ALL') return gameweeks;
    return gameweeks.filter((gw) => gw.id === selectedDayFilter);
  }, [gameweeks, selectedDayFilter]);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#0b0e16] p-6 space-y-5 shadow-xl">
      {/* Header & Day Filter Pills */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white">
              OWCS Pacific Stage 3 • Matchday Schedule
            </h2>
            <p className="text-xs text-zinc-400">
              Plan your 1 Free Daily Transfer around upcoming team matchups and
              daily lock times
            </p>
          </div>
        </div>

        {/* Day Selector Tabs */}
        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-zinc-950 p-1.5 border border-zinc-800">
          <button
            type="button"
            onClick={() => setSelectedDayFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedDayFilter === 'ALL'
                ? 'bg-zinc-800 text-emerald-400 shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            All Days
          </button>
          {gameweeks.map((gw) => (
            <button
              key={gw.id}
              type="button"
              onClick={() => setSelectedDayFilter(gw.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedDayFilter === gw.id
                  ? 'bg-zinc-800 text-emerald-400 shadow'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {gw.is_playoffs ? `Day ${gw.number} (Playoffs)` : `Day ${gw.number}`}
            </button>
          ))}
        </div>
      </div>

      {/* Matchday Cards Grid */}
      {visibleGameweeks.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-zinc-800 rounded-xl text-xs text-zinc-500">
          No Stage 3 Matchdays scheduled yet.
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 gap-4 ${
            selectedDayFilter === 'ALL'
              ? 'md:grid-cols-2 lg:grid-cols-3'
              : 'max-w-2xl mx-auto'
          }`}
        >
          {visibleGameweeks.map((gw) => {
            const dayFixtures = fixturesByGwId[gw.id] ?? [];
            const isCurrentActive = gw.id === activeGwId || gw.status === 'ACTIVE';
            const lockDate = new Date(gw.lock_time);

            return (
              <div
                key={gw.id}
                className={`rounded-xl border p-4 flex flex-col justify-between space-y-4 transition-all ${
                  isCurrentActive
                    ? 'border-emerald-500/50 bg-gradient-to-b from-emerald-500/10 via-zinc-900/90 to-zinc-950 shadow-lg shadow-emerald-500/5'
                    : gw.is_playoffs
                    ? 'border-amber-500/40 bg-gradient-to-b from-amber-500/10 via-zinc-900/90 to-zinc-950'
                    : 'border-zinc-800 bg-zinc-900/60'
                }`}
              >
                <div className="space-y-3">
                  {/* Card Top Header */}
                  <div className="flex items-start justify-between gap-2 border-b border-zinc-800/80 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                            gw.is_playoffs
                              ? 'bg-amber-400 text-zinc-950'
                              : isCurrentActive
                              ? 'bg-emerald-500 text-zinc-950'
                              : 'bg-zinc-800 text-zinc-300'
                          }`}
                        >
                          Day {gw.number}
                        </span>
                        <h3 className="text-sm font-black text-white">
                          {gw.name}
                        </h3>
                      </div>

                      <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1">
                        <Lock className="w-3 h-3 text-orange-400 shrink-0" />
                        <span>
                          Locks{' '}
                          {lockDate.toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </p>
                    </div>

                    {gw.is_playoffs ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                        <Sparkles className="w-3 h-3" />
                        Playoffs
                      </span>
                    ) : isCurrentActive ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                        Active
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase text-zinc-500 shrink-0">
                        {gw.status}
                      </span>
                    )}
                  </div>

                  {/* Matchups List */}
                  {dayFixtures.length === 0 ? (
                    <p className="text-xs text-zinc-500 text-center py-6">
                      No matches listed for Day {gw.number}.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {dayFixtures.map((fix, idx) => {
                        const codeA = fix.team_a_team?.code ?? 'TBD';
                        const nameA = fix.team_a_team?.name ?? 'To Be Determined';
                        const codeB = fix.team_b_team?.code ?? 'TBD';
                        const nameB = fix.team_b_team?.name ?? 'To Be Determined';
                        const matchDate = new Date(fix.match_time);

                        return (
                          <div
                            key={fix.id}
                            className="rounded-xl border border-zinc-800/90 bg-zinc-950/80 px-3 py-2.5 flex items-center justify-between gap-2 hover:border-zinc-700 transition-colors"
                          >
                            {/* Team A vs Team B */}
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[10px] font-mono font-bold text-zinc-500 w-4">
                                M{idx + 1}
                              </span>

                              <div className="flex items-center gap-1.5">
                                <span
                                  title={nameA}
                                  className={`text-xs font-black px-2 py-0.5 rounded border ${
                                    codeA === 'TBD'
                                      ? 'bg-zinc-900 border-zinc-800 text-zinc-400'
                                      : 'bg-zinc-800 border-zinc-700 text-white'
                                  }`}
                                >
                                  {codeA}
                                </span>

                                <Swords className="w-3 h-3 text-orange-400 shrink-0" />

                                <span
                                  title={nameB}
                                  className={`text-xs font-black px-2 py-0.5 rounded border ${
                                    codeB === 'TBD'
                                      ? 'bg-zinc-900 border-zinc-800 text-zinc-400'
                                      : 'bg-zinc-800 border-zinc-700 text-white'
                                  }`}
                                >
                                  {codeB}
                                </span>
                              </div>
                            </div>

                            {/* Kickoff Time */}
                            <div className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400 shrink-0">
                              <Clock className="w-3 h-3 text-zinc-500" />
                              {matchDate.toLocaleTimeString(undefined, {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Playoff Note Footer */}
                {gw.is_playoffs && (
                  <div className="pt-2 border-t border-amber-500/20 text-[11px] font-semibold text-amber-300/90 flex items-center justify-between">
                    <span>Top 4 Teams Advance</span>
                    <span>+$5.0M Cap • 3 Free Transfers</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}