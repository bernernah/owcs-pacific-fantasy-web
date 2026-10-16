'use client';

import React, { useState, useMemo } from 'react';
import { Calendar, Info } from 'lucide-react';
import type { Fixture, Gameweek } from '@/types/fantasy';

interface TeamFixturesTooltipProps {
  teamId: string;
  teamCode?: string;
  fixtures: Fixture[];
  activeGw: Gameweek | null;
}

export default function TeamFixturesTooltip({
  teamId,
  teamCode,
  fixtures,
  activeGw,
}: TeamFixturesTooltipProps) {
  const [open, setOpen] = useState(false);

  const upcomingTeamFixtures = useMemo(() => {
    const minGwNumber = activeGw?.number ?? 1;

    return fixtures
      .filter((f) => {
        const involvesTeam = f.team_a === teamId || f.team_b === teamId;
        if (!involvesTeam) return false;
        const gwNum = f.gameweeks?.number ?? minGwNumber;
        return gwNum >= minGwNumber;
      })
      .sort(
        (a, b) =>
          new Date(a.match_time).getTime() - new Date(b.match_time).getTime()
      )
      .slice(0, 4);
  }, [fixtures, teamId, activeGw]);

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        title="View Upcoming Fixtures"
        className="inline-flex items-center gap-1 text-zinc-400 hover:text-orange-400 transition-colors p-0.5 rounded"
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-full left-0 mb-2 z-50 w-60 rounded-xl border border-zinc-700 bg-[#0c0f17] p-3 shadow-2xl space-y-2 text-left"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-orange-400 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {teamCode ?? 'Team'} Upcoming Fixtures
            </span>
          </div>

          {upcomingTeamFixtures.length === 0 ? (
            <p className="text-[11px] text-zinc-400 py-1">
              No upcoming fixtures scheduled yet (TBD).
            </p>
          ) : (
            <div className="space-y-1.5">
              {upcomingTeamFixtures.map((fix) => {
                const isTeamA = fix.team_a === teamId;
                const opponent = isTeamA ? fix.team_b_team : fix.team_a_team;
                const gwNum = fix.gameweeks?.number;

                return (
                  <div
                    key={fix.id}
                    className="rounded-lg bg-zinc-900/90 border border-zinc-800 px-2.5 py-1.5 flex items-center justify-between text-[11px]"
                  >
                    <div>
                      <span className="font-black text-white">
                        vs {opponent?.code ?? 'TBD'}
                      </span>
                      {gwNum && (
                        <span className="ml-1.5 text-[10px] text-orange-400 font-bold">
                          (GW{gwNum})
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {new Date(fix.match_time).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}