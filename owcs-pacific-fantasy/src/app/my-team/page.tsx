'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Shield,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Search,
  Sparkles,
  Plus,
  X,
  Lock,
  RotateCcw,
  Save,
  ArrowDownCircle,
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

const SLOT_METADATA: Record<
  SlotKey,
  { label: string; expectedRole: PlayerRole }
> = {
  tank: { label: 'Tank', expectedRole: 'TANK' },
  dps1: { label: 'DPS 1', expectedRole: 'DPS' },
  dps2: { label: 'DPS 2', expectedRole: 'DPS' },
  sup1: { label: 'Support 1', expectedRole: 'SUPPORT' },
  sup2: { label: 'Support 2', expectedRole: 'SUPPORT' },
};

export default function MyTeamPage() {
  const supabase = getSupabaseBrowserClient();
  const marketSectionRef = useRef<HTMLDivElement | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [activeGw, setActiveGw] = useState<Gameweek | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [existingRoster, setExistingRoster] = useState<UserRoster | null>(null);

  // Saved state in DB vs Local experimental draft state
  const [savedSlots, setSavedSlots] = useState<Record<SlotKey, Player | null>>({
    tank: null,
    dps1: null,
    dps2: null,
    sup1: null,
    sup2: null,
  });

  const [draftSlots, setDraftSlots] = useState<Record<SlotKey, Player | null>>({
    tank: null,
    dps1: null,
    dps2: null,
    sup1: null,
    sup2: null,
  });

  // Active slot being targeted by the user (e.g. 'dps1')
  const [activeSlotKey, setActiveSlotKey] = useState<SlotKey | null>(null);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState<boolean>(false);

  // Market Filters
  const [roleFilter, setRoleFilter] = useState<PlayerRole | 'ALL'>('ALL');
  const [teamFilter, setTeamFilter] = useState<string>('ALL');
  const [maxPriceFilter, setMaxPriceFilter] = useState<number>(50);
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

      let gws = (gwData as Gameweek[]) ?? [];

      // Safeguard: If gameweeks table is empty, create GW1 automatically
      if (gws.length === 0) {
        const { data: createdGw } = await supabase
          .from('gameweeks')
          .insert({
            number: 1,
            name: 'Gameweek 1 - Day 1',
            lock_time: '2026-10-26T10:00:00Z',
            is_playoffs: false,
            status: 'ACTIVE',
          })
          .select()
          .single();
        if (createdGw) {
          gws = [createdGw as Gameweek];
        }
      }

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
          const loadedSlots: Record<SlotKey, Player | null> = {
            tank: baseRoster.tank_id ? byId[baseRoster.tank_id] ?? null : null,
            dps1: baseRoster.dps1_id ? byId[baseRoster.dps1_id] ?? null : null,
            dps2: baseRoster.dps2_id ? byId[baseRoster.dps2_id] ?? null : null,
            sup1: baseRoster.sup1_id ? byId[baseRoster.sup1_id] ?? null : null,
            sup2: baseRoster.sup2_id ? byId[baseRoster.sup2_id] ?? null : null,
          };

          setSavedSlots(loadedSlots);
          setDraftSlots(loadedSlots);
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
    () => Object.values(draftSlots).filter((p): p is Player => p !== null),
    [draftSlots]
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

  // Detect if local draft differs from what is saved in Supabase
  const hasUnsavedChanges = useMemo(() => {
    const keys: SlotKey[] = ['tank', 'dps1', 'dps2', 'sup1', 'sup2'];
    return keys.some(
      (k) => (draftSlots[k]?.id ?? null) !== (savedSlots[k]?.id ?? null)
    );
  }, [draftSlots, savedSlots]);

  const [isLocked, setIsLocked] = useState<boolean>(false);

  useEffect(() => {
    if (!activeGw) {
      setIsLocked(false);
      return;
    }
    const lockDeadlineMs =
      new Date(activeGw.lock_time).getTime() - 15 * 60 * 1000;
    setIsLocked(
      Date.now() >= lockDeadlineMs || activeGw.status === 'COMPLETED'
    );
  }, [activeGw]);

  // Clicking a slot on the pitch focuses that role and opens the selection modal
  const handleSlotClick = (slotKey: SlotKey) => {
    if (isLocked) return;
    const meta = SLOT_METADATA[slotKey];
    setActiveSlotKey(slotKey);
    setRoleFilter(meta.expectedRole);
    setIsRoleModalOpen(true);
  };

  const scrollToMarketWithRole = (slotKey: SlotKey) => {
    const meta = SLOT_METADATA[slotKey];
    setActiveSlotKey(slotKey);
    setRoleFilter(meta.expectedRole);
    setIsRoleModalOpen(false);
    marketSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Add or swap player in local draft state ONLY (does not write to DB)
  const handleSelectPlayerIntoDraft = (
    player: Player,
    explicitSlot?: SlotKey | null
  ) => {
    setFeedback(null);

    if (selectedPlayers.some((p) => p.id === player.id)) {
      return;
    }

    // If user clicked a specific slot (e.g. dps2) and the player's role matches, place them right there
    if (
      explicitSlot &&
      SLOT_METADATA[explicitSlot].expectedRole === player.role
    ) {
      setDraftSlots((prev) => ({ ...prev, [explicitSlot]: player }));
      setIsRoleModalOpen(false);
      return;
    }

    // Otherwise auto-slot into the first available slot for that role
    if (player.role === 'TANK') {
      if (!draftSlots.tank) {
        setDraftSlots((prev) => ({ ...prev, tank: player }));
      } else {
        setFeedback({
          type: 'error',
          message:
            'Your Tank slot is full. Click the X on your current Tank or click the Tank card to swap.',
        });
      }
    } else if (player.role === 'DPS') {
      if (!draftSlots.dps1) {
        setDraftSlots((prev) => ({ ...prev, dps1: player }));
      } else if (!draftSlots.dps2) {
        setDraftSlots((prev) => ({ ...prev, dps2: player }));
      } else {
        setFeedback({
          type: 'error',
          message:
            'Both DPS slots are full. Remove a DPS player first to experiment with a new one.',
        });
      }
    } else if (player.role === 'SUPPORT') {
      if (!draftSlots.sup1) {
        setDraftSlots((prev) => ({ ...prev, sup1: player }));
      } else if (!draftSlots.sup2) {
        setDraftSlots((prev) => ({ ...prev, sup2: player }));
      } else {
        setFeedback({
          type: 'error',
          message:
            'Both Support slots are full. Remove a Support player first to experiment with a new one.',
        });
      }
    }

    setIsRoleModalOpen(false);
  };

  const handleRemoveSlot = (slotKey: SlotKey) => {
    setFeedback(null);
    setDraftSlots((prev) => ({ ...prev, [slotKey]: null }));
  };

  const handleResetDraft = () => {
    setFeedback(null);
    setDraftSlots(savedSlots);
    setActiveSlotKey(null);
  };

  // Manual 'Save Lineup' action — commits local draft state to Supabase
  const handleSaveSquad = async () => {
    setFeedback(null);

    if (!userId) {
      setFeedback({
        type: 'error',
        message: 'Please sign in with Discord in the top-right corner first.',
      });
      return;
    }

    if (!activeGw) {
      setFeedback({
        type: 'error',
        message: 'No active Gameweek found.',
      });
      return;
    }

    if (
      !draftSlots.tank ||
      !draftSlots.dps1 ||
      !draftSlots.dps2 ||
      !draftSlots.sup1 ||
      !draftSlots.sup2
    ) {
      setFeedback({
        type: 'error',
        message:
          'You must fill all 5 starting role slots (1 Tank, 2 DPS, 2 Support) before saving to the database.',
      });
      return;
    }

    if (totalCost > maxBudget) {
      setFeedback({
        type: 'error',
        message: `Roster cost ($${totalCost.toFixed(
          1
        )}M) exceeds the $${maxBudget}M salary cap.`,
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
      tank_id: draftSlots.tank.id,
      dps1_id: draftSlots.dps1.id,
      dps2_id: draftSlots.dps2.id,
      sup1_id: draftSlots.sup1.id,
      sup2_id: draftSlots.sup2.id,
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
      setSavedSlots(draftSlots);
      setFeedback({
        type: 'success',
        message: `Lineup saved to database for ${activeGw.name}!`,
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
    const player = draftSlots[slotKey];
    const savedPlayer = savedSlots[slotKey];
    const isChangedInDraft =
      (player?.id ?? null) !== (savedPlayer?.id ?? null);
    const isTargeted = activeSlotKey === slotKey;

    return (
      <div
        key={slotKey}
        onClick={() => handleSlotClick(slotKey)}
        className={`relative rounded-2xl border p-4 transition-all flex flex-col justify-between min-h-[140px] cursor-pointer ${
          isTargeted
            ? 'bg-orange-500/10 border-orange-500 ring-2 ring-orange-500/30 shadow-xl'
            : player
            ? isChangedInDraft
              ? 'bg-zinc-900/95 border-amber-500/60 shadow-lg'
              : 'bg-zinc-900/90 border-zinc-700/90 hover:border-orange-500/50 shadow-lg'
            : 'bg-zinc-950/60 border-dashed border-zinc-800 hover:border-orange-500/60'
        }`}
      >
        <div className="flex items-center justify-between">
          <RoleBadge role={expectedRole} size="sm" />
          <div className="flex items-center gap-1.5">
            {isChangedInDraft && (
              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Draft
              </span>
            )}
            {player ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveSlot(slotKey);
                }}
                disabled={isLocked}
                className="p-1 rounded-lg bg-zinc-800 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 transition-colors disabled:opacity-40"
                title="Remove from draft"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <span className="text-[10px] font-bold uppercase text-zinc-500">
                Empty Slot
              </span>
            )}
          </div>
        </div>

        {player ? (
          <div className="my-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-orange-400">
              {player.teams?.code ?? 'OWCS'}
            </span>
            <h4 className="text-base font-black text-white truncate">
              {player.name}
            </h4>
            <p className="text-[10px] text-zinc-500 mt-0.5">
              Click card to swap {label}
            </p>
          </div>
        ) : (
          <div className="my-3 flex flex-col items-center justify-center text-center group">
            <Plus className="w-5 h-5 text-zinc-500 group-hover:text-orange-400 mb-1 transition-colors" />
            <span className="text-xs font-bold text-zinc-400 group-hover:text-white transition-colors">
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
    <div className="space-y-8 pb-24">
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
              {activeGw ? `GW${activeGw.number}` : 'GW1'}
            </p>
          </div>
          {isLocked ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-500/15 text-rose-400 text-xs font-bold">
              <Lock className="w-3.5 h-3.5" /> Locked
            </span>
          ) : hasUnsavedChanges ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[11px] font-bold">
              Unsaved Draft
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-400 text-[11px] font-bold">
              Saved
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

        <div className="rounded-2xl border border-zinc-800 bg-[#0b0e16] p-4 flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Team Limit Rule
            </p>
            <p className="text-sm font-black text-white mt-0.5">
              Max {maxPerTeam} per OWCS Team
            </p>
          </div>
          <button
            type="button"
            onClick={handleSaveSquad}
            disabled={saving || isLocked}
            className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-zinc-950 font-black text-xs uppercase tracking-wider px-4 py-2.5 rounded-xl shadow-lg shadow-orange-500/20 transition-all shrink-0"
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
        <div className="text-center mb-6 space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-orange-400 bg-orange-500/10 border border-orange-500/20 px-3 py-1 rounded-full">
            Starting Formation (1 - 2 - 2)
          </span>
          <p className="text-xs text-zinc-400 pt-1">
            Click any slot below to open the role-filtered player selector, then
            click <strong className="text-white">Save Lineup</strong> when ready.
          </p>
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
      <div
        id="player-market"
        ref={marketSectionRef}
        className="rounded-2xl border border-zinc-800 bg-[#0b0e16] p-6 space-y-5 scroll-mt-20"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-black text-white">
                OWCS Pacific Player Market
              </h2>
              {activeSlotKey && (
                <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30">
                  Picking for: {SLOT_METADATA[activeSlotKey].label}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Experiment freely with combinations—changes stay in your local
              draft until you click Save Lineup.
            </p>
          </div>

          {/* Filter Controls */}
          <div className="flex flex-wrap items-center gap-3">
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
                onClick={() => {
                  setRoleFilter(r);
                  if (r === 'ALL') setActiveSlotKey(null);
                }}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  roleFilter === r
                    ? 'bg-orange-500 text-zinc-950'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                }`}
              >
                {r}
              </button>
            ))}

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

            <select
              value={maxPriceFilter}
              onChange={(e) => setMaxPriceFilter(Number(e.target.value))}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-white"
            >
              <option value={50}>Max Price: Any</option>
              <option value={25}>Under $25.0M</option>
              <option value={22}>Under $22.0M</option>
              <option value={20}>Under $20.0M</option>
              <option value={18.5}>Under $18.5M</option>
            </select>
          </div>
        </div>

        {/* Market Grid */}
        {filteredMarket.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-zinc-800 rounded-xl text-xs text-zinc-500">
            No players match the current filter criteria.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {filteredMarket.map((player) => {
              const alreadyPicked = selectedPlayers.some(
                (p) => p.id === player.id
              );
              const currentTeamCount = teamCounts[player.team_id] ?? 0;
              // If replacing a player currently in activeSlotKey from the same team, don't block
              const activeSlotPlayer = activeSlotKey
                ? draftSlots[activeSlotKey]
                : null;
              const effectiveTeamCount =
                activeSlotPlayer &&
                activeSlotPlayer.role === player.role &&
                activeSlotPlayer.team_id === player.team_id
                  ? currentTeamCount - 1
                  : currentTeamCount;

              const teamCapReached =
                !alreadyPicked && effectiveTeamCount >= maxPerTeam;

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
                      type="button"
                      onClick={() =>
                        handleSelectPlayerIntoDraft(player, activeSlotKey)
                      }
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
                        ? 'In Draft'
                        : teamCapReached
                        ? 'Team Max'
                        : '+ Select'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky Bottom Budget & Manual Save Bar (Always Visible) */}
      <div className="fixed bottom-0 inset-x-0 z-30 border-t border-zinc-800 bg-[#0b0d13]/95 backdrop-blur-md shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                Draft Budget Remaining
              </span>
              <span
                className={`text-sm sm:text-base font-black ${
                  remainingBudget < 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                ${remainingBudget.toFixed(1)}M{' '}
                <span className="text-xs text-zinc-500 font-normal">
                  / ${maxBudget.toFixed(0)}M
                </span>
              </span>
            </div>

            <div className="h-7 w-px bg-zinc-800 hidden sm:block" />

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                Draft Slots Filled
              </span>
              <span className="text-sm sm:text-base font-black text-white">
                {selectedPlayers.length} / 5{' '}
                <span className="text-xs text-zinc-500 font-normal">
                  (Max {maxPerTeam}/team)
                </span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            {hasUnsavedChanges && (
              <button
                type="button"
                onClick={handleResetDraft}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Draft
              </button>
            )}

            <button
              type="button"
              onClick={handleSaveSquad}
              disabled={saving || isLocked}
              className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-zinc-950 font-black text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-lg shadow-orange-500/20 transition-all"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving Lineup...' : 'Save Lineup'}
            </button>
          </div>
        </div>
      </div>

      {/* Role-Filtered Quick Selection Modal when clicking a Pitch Slot */}
      {isRoleModalOpen && activeSlotKey && (
        <div
          onClick={() => setIsRoleModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-[#0d1018] p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <RoleBadge
                  role={SLOT_METADATA[activeSlotKey].expectedRole}
                  size="md"
                />
                <div>
                  <h3 className="text-base font-black text-white">
                    Select {SLOT_METADATA[activeSlotKey].label}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Remaining Draft Budget:{' '}
                    <span className="text-emerald-400 font-bold">
                      ${remainingBudget.toFixed(1)}M
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => scrollToMarketWithRole(activeSlotKey)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-orange-400 hover:underline px-2 py-1"
                >
                  <ArrowDownCircle className="w-3.5 h-3.5" /> View in Full
                  Market
                </button>
                <button
                  type="button"
                  onClick={() => setIsRoleModalOpen(false)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
              {players
                .filter(
                  (p) =>
                    p.role === SLOT_METADATA[activeSlotKey].expectedRole &&
                    !p.teams?.is_eliminated
                )
                .map((player) => {
                  const alreadyPicked = selectedPlayers.some(
                    (p) => p.id === player.id
                  );
                  const currentSlotPlayer = draftSlots[activeSlotKey];
                  const currentTeamCount = teamCounts[player.team_id] ?? 0;
                  const effectiveTeamCount =
                    currentSlotPlayer &&
                    currentSlotPlayer.team_id === player.team_id
                      ? currentTeamCount - 1
                      : currentTeamCount;
                  const teamCapReached =
                    !alreadyPicked && effectiveTeamCount >= maxPerTeam;

                  return (
                    <div
                      key={player.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3.5 flex items-center justify-between hover:border-zinc-700"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-extrabold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                          {player.teams?.code ?? 'OWCS'}
                        </span>
                        <div>
                          <p className="font-bold text-white text-sm">
                            {player.name}
                          </p>
                          <p className="text-[11px] text-zinc-400">
                            {player.teams?.name}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-sm font-black text-emerald-400">
                          ${Number(player.price).toFixed(1)}M
                        </span>
                        <button
                          type="button"
                          disabled={alreadyPicked || teamCapReached}
                          onClick={() =>
                            handleSelectPlayerIntoDraft(player, activeSlotKey)
                          }
                          className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
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
                            : 'Select'}
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}