'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
  Shield,
  Crosshair,
  HeartPulse,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Search,
  Sparkles,
  Plus,
  X,
  Lock,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import RoleBadge from '@/components/RoleBadge';
import type {
  Player,
  Team,
  Gameweek,
  UserRoster,
  PlayerRole,
} from '@/types/fantasy';

type SlotKey = 'tank' | 'dps1' | 'dps2' | 'sup1' | 'sup2';

export default function MyTeamPage() {
  const supabase = getSupabaseBrowserClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [activeGw, setActiveGw] = useState<Gameweek | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [existingRoster, setExistingRoster] = useState<UserRoster | null>(null);

  const [slots, setSlots] = useState<Record<SlotKey, Player | null>>({
    tank: null,
    dps1: null,
    dps2: null,
    sup1: null,
    sup2: null,
  });

  const [roleFilter, setRoleFilter] = useState<PlayerRole | 'ALL'>('ALL');
  const [teamFilter, setTeamFilter] = useState<string>('ALL');
  const [maxPriceFilter, setMaxPriceFilter] = useState<number>(30);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    async function loadTeamSheet() {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);

      const [{ data: gwData }, { data: teamData }, { data: playerData }] =
        await Promise.all([
          supabase
            .from('gameweeks')
            .select('*')
            .order('number', { ascending: true }),
          supabase.from('teams').select('*').order('name'),
          supabase
            .from('players')
            .select('*, teams(*)')
            .eq('is_active', true)
            .order('price', { ascending: false }),
        ]);

      const gws = (gwData as Gameweek[]) ?? [];
      const currentGw =
        gws.find((g) => g.status === 'ACTIVE') ??
        gws.find((g) => g.status === 'UPCOMING') ??
        gws[0] ??
        null;

      setActiveGw(currentGw);
      setTeams((teamData as Team[]) ?? []);
      const allPlayers = (playerData as Player[]) ?? [];
      setPlayers(allPlayers);

      if (user && currentGw) {
        // Fetch current GW roster or fallback to most recent previous GW roster
        const { data: userRosters } = await supabase
          .from('user_rosters')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (userRosters && userRosters.length > 0) {
          const exactGwRoster = userRosters.find(
            (r) => r.gameweek_id === currentGw.id
          ) as UserRoster | undefined;
          const baseRoster =
            exactGwRoster ?? (userRosters[0] as UserRoster);

          if (exactGwRoster) {
            setExistingRoster(exactGwRoster);
          }

          const byId = Object.fromEntries(allPlayers.map((p) => [p.id, p]));
          setSlots({
            tank: byId[baseRoster.tank_id] ?? null,
            dps1: byId[baseRoster.dps1_id] ?? null,
            dps2: byId[baseRoster.dps2_id] ?? null,
            sup1: byId[baseRoster.sup1_id] ?? null,
            sup2: byId[baseRoster.sup2_id] ?? null,
          });
        }
      }

      setLoading(false);
    }

    loadTeamSheet();
  }, [supabase]);

  // Dynamic Stage Rules (Regular Season vs Playoff Wildcard)
  const maxBudget = activeGw?.is_playoffs ? 110.0 : 100.0;
  const maxPerTeam = activeGw?.is_playoffs ? 3 : 2;

  const selectedPlayers = useMemo(
    () => Object.values(slots).filter((p): p is Player => p !== null),
    [slots]
  );

  const totalCost = useMemo(
    () => selectedPlayers.reduce((sum, p) => sum + Number(p.price), 0),
    [selectedPlayers]
  );

  const remainingBudget = Number((maxBudget - totalCost).toFixed(1));

  const teamCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of selectedPlayers) {
      counts[p.team_id] = (counts[p.team_id] ?? 0) + 1;
    }
    return counts;
  }, [selectedPlayers]);

  const isLocked = useMemo(() => {
    if (!activeGw) return false;
    const lockDeadline = new Date(
      new Date(activeGw.lock_time).getTime() - 15 * 60 * 1000
    );
    return new Date() >= lockDeadline || activeGw.status === 'COMPLETED';
  }, [activeGw]);

  const handleAddPlayer = (player: Player) => {
    setFeedback(null);
    if (selectedPlayers.some((p) => p.id === player.id)) return;

    if (player.role === 'TANK') {
      if (!slots.tank) {
        setSlots((prev) => ({ ...prev, tank: player }));
      } else {
        setFeedback({
          type: 'error',
          message: 'Remove your current Tank first to select a new Tank.',
        });
      }
    } else if (player.role === 'DPS') {
      if (!slots.dps1) {
        setSlots((prev) => ({ ...prev, dps1: player }));
      } else if (!slots.dps2) {
        setSlots((prev) => ({ ...prev, dps2: player }));
      } else {
        setFeedback({
          type: 'error',
          message: 'Both DPS slots are full. Remove a DPS player first.',
        });
      }
    } else if (player.role === 'SUPPORT') {
      if (!slots.sup1) {
        setSlots((prev) => ({ ...prev, sup1: player }));
      } else if (!slots.sup2) {
        setSlots((prev) => ({ ...prev, sup2: player }));
      } else {
        setFeedback({
          type: 'error',
          message: 'Both Support slots are full. Remove a Support first.',
        });
      }
    }
  };

  const handleRemoveSlot = (slotKey: SlotKey) => {
    setFeedback(null);
    setSlots((prev) => ({ ...prev, [slotKey]: null }));
  };

  const handleSaveSquad = async () => {
    setFeedback(null);
    if (!userId) {
      setFeedback({
        type: 'error',
        message: 'Please sign in with Discord in the top-right corner first.',
      });
      return;
    }
    if (!activeGw) return;

    if (
      !slots.tank ||
      !slots.dps1 ||
      !slots.dps2 ||
      !slots.sup1 ||
      !slots.sup2
    ) {
      setFeedback({
        type: 'error',
        message: 'Please fill all 5 starting role slots before saving.',
      });
      return;
    }

    if (totalCost > maxBudget) {
      setFeedback({
        type: 'error',
        message: `Roster cost ($${totalCost.toFixed(1)}M) exceeds the $${maxBudget}M salary cap.`,
      });
      return;
    }

    const overTeamLimit = Object.values(teamCounts).some(
      (c) => c > maxPerTeam
    );
    if (overTeamLimit) {
      setFeedback({
        type: 'error',
        message: `You cannot select more than ${maxPerTeam} players from a single OWCS team.`,
      });
      return;
    }

    setSaving(true);

    const payload = {
      user_id: userId,
      gameweek_id: activeGw.id,
      tank_id: slots.tank.id,
      dps1_id: slots.dps1.id,
      dps2_id: slots.dps2.id,
      sup1_id: slots.sup1.id,
      sup2_id: slots.sup2.id,
      transfers_used: existingRoster?.transfers_used ?? 0,
    };

    const { data, error } = await supabase
      .from('user_rosters')
      .upsert(payload, { onConflict: 'user_id,gameweek_id' })
      .select()
      .single();

    setSaving(false);

    if (error) {
      setFeedback({ type: 'error', message: error.message });
    } else {
      setExistingRoster(data as UserRoster);
      setFeedback({
        type: 'success',
        message: `Starting 5 locked in for ${activeGw.name}!`,
      });
    }
  };

  const filteredMarket = useMemo(() => {
    return players.filter((p) => {
      if (p.teams?.is_eliminated) return false;
      if (roleFilter !== 'ALL' && p.role !== roleFilter) return false;
      if (teamFilter !== 'ALL' && p.team_id !== teamFilter) return false;
      if (Number(p.price) > maxPriceFilter) return false;
      if (
        searchQuery.trim() !== '' &&
        !p.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !p.teams?.code.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [players, roleFilter, teamFilter, maxPriceFilter, searchQuery]);

  const renderPitchCard = (
    slotKey: SlotKey,
    label: string,
    expectedRole: PlayerRole
  ) => {
    const player = slots[slotKey];

    return (
      <div
        key={slotKey}
        onClick={() => {
          if (!player) setRoleFilter(expectedRole);
        }}
        className={`relative rounded-2xl border p-4 transition-all flex flex-col justify-between min-h-[135px] ${
          player
            ? 'bg-zinc-900/90 border-zinc-700/90 shadow-lg'
            : 'bg-zinc-950/60 border-dashed border-zinc-800 hover:border-orange-500/50 cursor-pointer'
        }`}
      >
        <div className="flex items-center justify-between">
          <RoleBadge role={expectedRole} size="sm" />
          {player ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveSlot(slotKey);
              }}
              disabled={isLocked}
              className="p-1 rounded-lg bg-zinc-800 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 transition-colors disabled:opacity-40"
              title="Remove player"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span className="text-[10px] font-bold uppercase text-zinc-500">
              Empty Slot
            </span>
          )}
        </div>

        {player ? (
          <div className="my-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-orange-400">
              {player.teams?.code ?? 'OWCS'}
            </span>
            <h4 className="text-base font-black text-white truncate">
              {player.name}
            </h4>
          </div>
        ) : (
          <div className="my-3 flex flex-col items-center justify-center text-center">
            <Plus className="w-5 h-5 text-zinc-600 mb-1" />
            <span className="text-xs font-bold text-zinc-500">
              Select {label}
            </span>
          </div>
        )}

        <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs">
          <span className="text-zinc-500 font-semibold">Contract</span>
          <span className="font-black text-emerald-400">
            {player ? `$${Number(player.price).toFixed(1)}M` : '—'}
          </span>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-zinc-400 text-sm">
        Loading your OWCS Pacific Team Sheet...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Playoff Wildcard Banner */}
      {activeGw?.is_playoffs && (
        <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-zinc-900 p-4 flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
          <p className="text-xs sm:text-sm font-bold text-amber-200">
            PLAYOFF WILDCARD ACTIVE: Salary cap boosted to{' '}
            <span className="text-white underline">$110.0M</span>, up to{' '}
            <span className="text-white underline">3 players per team</span>,
            and <span className="text-white underline">3 Free Transfers</span>{' '}
            available!
          </p>
        </div>
      )}

      {/* Top Status & Budget Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-[#0b0e16] p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Active Stage
            </p>
            <p className="text-base font-black text-white mt-0.5">
              {activeGw?.name ?? 'GW1'}
            </p>
          </div>
          {isLocked && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-500/15 text-rose-400 text-xs font-bold">
              <Lock className="w-3.5 h-3.5" /> Locked
            </span>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-[#0b0e16] p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Remaining Budget
            </p>
            <p
              className={`text-xl font-black mt-0.5 ${
                remainingBudget < 0 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              ${remainingBudget.toFixed(1)}M{' '}
              <span className="text-xs font-semibold text-zinc-500">
                / ${maxBudget.toFixed(0)}M
              </span>
            </p>
          </div>
          <DollarSign className="w-6 h-6 text-emerald-500/60" />
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-[#0b0e16] p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Selected Lineup
            </p>
            <p className="text-xl font-black text-white mt-0.5">
              {selectedPlayers.length}{' '}
              <span className="text-xs font-semibold text-zinc-500">
                / 5 Players
              </span>
            </p>
          </div>
          <Shield className="w-6 h-6 text-orange-500/60" />
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-[#0b0e16] p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Team Limit Rule
            </p>
            <p className="text-sm font-black text-white mt-0.5">
              Max {maxPerTeam} per OWCS Team
            </p>
          </div>
          <button
            onClick={handleSaveSquad}
            disabled={saving || isLocked}
            className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-zinc-950 font-black text-xs uppercase tracking-wider px-4 py-2.5 rounded-xl shadow-lg shadow-orange-500/20 transition-all"
          >
            {saving ? 'Saving...' : 'Save Lineup'}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 flex items-center gap-3 text-xs sm:text-sm font-bold ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          {feedback.message}
        </div>
      )}

      {/* Visual Overwatch Pitch (1 Tank Front, 2 DPS Middle, 2 Support Back) */}
      <div className="relative rounded-3xl border border-zinc-800 bg-gradient-to-b from-[#101624] via-[#0b0e17] to-[#090b10] p-6 sm:p-8 shadow-2xl overflow-hidden">
        <div className="text-center mb-6">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-orange-400 bg-orange-500/10 border border-orange-500/20 px-3 py-1 rounded-full">
            Starting Formation (1 - 2 - 2)
          </span>
        </div>

        <div className="space-y-6 max-w-3xl mx-auto">
          {/* Frontline: 1 Tank */}
          <div className="grid grid-cols-1 max-w-xs mx-auto">
            {renderPitchCard('tank', 'Tank', 'TANK')}
          </div>

          {/* Midline: 2 DPS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto">
            {renderPitchCard('dps1', 'DPS 1', 'DPS')}
            {renderPitchCard('dps2', 'DPS 2', 'DPS')}
          </div>

          {/* Backline: 2 Support */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto">
            {renderPitchCard('sup1', 'Support 1', 'SUPPORT')}
            {renderPitchCard('sup2', 'Support 2', 'SUPPORT')}
          </div>
        </div>
      </div>

      {/* Filterable Player Market Underneath */}
      <div className="rounded-2xl border border-zinc-800 bg-[#0b0e16] p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-white">
              OWCS Pacific Player Market
            </h2>
            <p className="text-xs text-zinc-400">
              Filter by role, team, or price and click any available pro player
              to slot them into your starting formation.
            </p>
          </div>

          {/* Filter Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
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

            {/* Role Filter Pills */}
            {(['ALL', 'TANK', 'DPS', 'SUPPORT'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  roleFilter === r
                    ? 'bg-orange-500 text-zinc-950'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                }`}
              >
                {r}
              </button>
            ))}

            {/* Team Dropdown */}
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-white"
            >
              <option value="ALL">All Teams</option>
              {teams
                .filter((t) => !t.is_eliminated)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))}
            </select>

            {/* Max Price Dropdown */}
            <select
              value={maxPriceFilter}
              onChange={(e) => setMaxPriceFilter(Number(e.target.value))}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-white"
            >
              <option value={30}>Max Price: Any</option>
              <option value={22}>Under $22.0M</option>
              <option value={20}>Under $20.0M</option>
              <option value={18.5}>Under $18.5M</option>
            </select>
          </div>
        </div>

        {/* Market Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {filteredMarket.map((player) => {
            const alreadyPicked = selectedPlayers.some(
              (p) => p.id === player.id
            );
            const currentTeamCount = teamCounts[player.team_id] ?? 0;
            const teamCapReached =
              !alreadyPicked && currentTeamCount >= maxPerTeam;

            return (
              <div
                key={player.id}
                className={`rounded-xl border p-4 flex flex-col justify-between transition-all ${
                  alreadyPicked
                    ? 'border-orange-500/40 bg-orange-500/5 opacity-60'
                    : 'border-zinc-800/90 bg-zinc-900/60 hover:border-zinc-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <RoleBadge role={player.role} size="sm" />
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                      {player.teams?.code ?? 'OWCS'}
                    </span>
                  </div>
                  <p className="text-base font-black text-white">
                    {player.name}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {player.teams?.name}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                  <span className="text-sm font-black text-emerald-400">
                    ${Number(player.price).toFixed(1)}M
                  </span>

                  <button
                    onClick={() => handleAddPlayer(player)}
                    disabled={alreadyPicked || teamCapReached || isLocked}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                      alreadyPicked
                        ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                        : teamCapReached
                        ? 'bg-rose-500/10 text-rose-400 cursor-not-allowed'
                        : 'bg-orange-500 hover:bg-orange-400 text-zinc-950'
                    }`}
                  >
                    {alreadyPicked
                      ? 'Selected'
                      : teamCapReached
                      ? 'Team Max'
                      : '+ Add'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}