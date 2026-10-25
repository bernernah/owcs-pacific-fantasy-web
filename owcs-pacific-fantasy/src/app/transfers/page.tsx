'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  ArrowLeftRight,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Calendar,
  ArrowUpDown,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { FANTASY_CONFIG, isPreSeasonNow } from '@/lib/config';
import RoleBadge from '@/components/RoleBadge';
import CountdownTimer from '@/components/CountdownTimer';
import TeamFixturesTooltip from '@/components/TeamFixturesTooltip';
import StageFixturesSchedule from '@/components/StageFixturesSchedule';
import type {
  Player,
  Gameweek,
  UserRoster,
  Fixture,
  PlayerOwnershipRow,
} from '@/types/fantasy';

type SlotKey = 'tank' | 'dps1' | 'dps2' | 'sup1' | 'sup2';
type ReplacementSortOption =
  | 'PRICE_DESC'
  | 'PRICE_ASC'
  | 'OWNERSHIP_DESC'
  | 'OWNERSHIP_ASC';

export default function TransfersPage() {
  const supabase = getSupabaseBrowserClient();
  const scheduleSectionRef = useRef<HTMLDivElement | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [userBaseBudget, setUserBaseBudget] = useState<number>(100.0);
  const [playoffBonusApplied, setPlayoffBonusApplied] =
    useState<boolean>(false);

  const [gameweeks, setGameweeks] = useState<Gameweek[]>([]);
  const [activeGw, setActiveGw] = useState<Gameweek | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);

  const [originalSlots, setOriginalSlots] = useState<
    Record<SlotKey, Player | null>
  >({
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

  // Server-computed rolling free transfer allowance (1 or 2 in Reg Season, 3 in Playoffs)
  const [rolledFreeAllowance, setRolledFreeAllowance] = useState<number>(1);
  const [alreadyUsedTransfers, setAlreadyUsedTransfers] = useState<number>(0);

  const [activeSlotToSwap, setActiveSlotToSwap] = useState<SlotKey | null>(
    null
  );
  const [sortOption, setSortOption] =
    useState<ReplacementSortOption>('PRICE_DESC');

  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isPreSeason, setIsPreSeason] = useState<boolean>(true);

  const [showPenaltyModal, setShowPenaltyModal] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    const checkTimeState = () => {
      setIsPreSeason(isPreSeasonNow());
      if (activeGw) {
        const lockMs = new Date(activeGw.lock_time).getTime();
        setIsLocked(
          Date.now() >= lockMs || activeGw.status === 'COMPLETED'
        );
      }
    };

    checkTimeState();
    const timer = setInterval(checkTimeState, 1000);
    return () => clearInterval(timer);
  }, [activeGw]);

  useEffect(() => {
    async function loadTransferState() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);

      const [
        { data: gwData },
        { data: playerData },
        { data: ownershipData },
        { data: fixtureData },
      ] = await Promise.all([
        supabase
          .from('gameweeks')
          .select('*')
          .order('number', { ascending: true }),
        supabase
          .from('players')
          .select('*, teams(*)')
          .eq('is_active', true)
          .order('price', { ascending: false }),
        supabase.from('player_ownership_view').select('*'),
        supabase
          .from('fixtures')
          .select(
            '*, team_a_team:teams!fixtures_team_a_fkey(*), team_b_team:teams!fixtures_team_b_fkey(*), gameweeks(*)'
          )
          .order('match_time', { ascending: true }),
      ]);

      let gws = (gwData as Gameweek[]) ?? [];
      if (gws.length === 0) {
        const { data: createdGw } = await supabase
          .from('gameweeks')
          .insert({
            number: 1,
            name: 'Day 1 - Stage 3',
            lock_time: FANTASY_CONFIG.NEXT_TRANSFER_LOCK_DEADLINE,
            is_playoffs: false,
            status: 'ACTIVE',
          })
          .select()
          .single();
        if (createdGw) gws = [createdGw as Gameweek];
      }

      setGameweeks(gws);
      setFixtures((fixtureData as Fixture[]) ?? []);

      const currentGw =
        gws.find((g) => g.status === 'ACTIVE') ??
        gws.find((g) => g.status === 'UPCOMING') ??
        gws[0] ??
        null;

      setActiveGw(currentGw);

      const ownershipMap: Record<string, number> = {};
      if (ownershipData) {
        for (const row of ownershipData as PlayerOwnershipRow[]) {
          ownershipMap[row.player_id] = Number(row.selected_by_pct ?? 0);
        }
      }

      const allPlayers = ((playerData as Player[]) ?? []).map((p) => ({
        ...p,
        selected_by_pct: ownershipMap[p.id] ?? 0.0,
      }));
      setPlayers(allPlayers);

      if (user) {
        const { data: profData } = await supabase
          .from('profiles')
          .select('personal_budget, playoff_bonus_applied')
          .eq('id', user.id)
          .maybeSingle();

        if (profData?.personal_budget !== undefined) {
          setUserBaseBudget(Number(profData.personal_budget));
        }
        if (profData?.playoff_bonus_applied !== undefined) {
          setPlayoffBonusApplied(Boolean(profData.playoff_bonus_applied));
        }
      }

      if (user && currentGw) {
        const [{ data: rosters }, { data: freeAllowanceData }] =
          await Promise.all([
            supabase
              .from('user_rosters')
              .select('*')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false }),
            supabase.rpc('get_user_free_transfers', {
              p_user_id: user.id,
              p_gameweek_id: currentGw.id,
            }),
          ]);

        if (typeof freeAllowanceData === 'number') {
          setRolledFreeAllowance(freeAllowanceData);
        }

        if (rosters && rosters.length > 0) {
          const currentGwRoster = rosters.find(
            (r) => r.gameweek_id === currentGw.id
          ) as UserRoster | undefined;
          const baseline =
            currentGwRoster ?? (rosters[0] as UserRoster);

          setAlreadyUsedTransfers(currentGwRoster?.transfers_used ?? 0);

          const byId = Object.fromEntries(allPlayers.map((p) => [p.id, p]));
          const mapped: Record<SlotKey, Player | null> = {
            tank: baseline.tank_id ? byId[baseline.tank_id] ?? null : null,
            dps1: baseline.dps1_id ? byId[baseline.dps1_id] ?? null : null,
            dps2: baseline.dps2_id ? byId[baseline.dps2_id] ?? null : null,
            sup1: baseline.sup1_id ? byId[baseline.sup1_id] ?? null : null,
            sup2: baseline.sup2_id ? byId[baseline.sup2_id] ?? null : null,
          };
          setOriginalSlots(mapped);
          setDraftSlots(mapped);
        }
      }
    }

    loadTransferState();
  }, [supabase]);

  const isUnlimitedFreeWindow = useMemo(() => {
    return isPreSeason || activeGw?.number === 1 || rolledFreeAllowance > 50;
  }, [isPreSeason, activeGw, rolledFreeAllowance]);

  const freeTransferAllowance = useMemo(() => {
    if (isUnlimitedFreeWindow) return 999;
    if (activeGw?.is_playoffs) {
      return FANTASY_CONFIG.PLAYOFF_WILDCARD_FREE_TRANSFERS;
    }
    return Math.min(
      FANTASY_CONFIG.MAX_ROLLED_FREE_TRANSFERS,
      Math.max(1, rolledFreeAllowance)
    );
  }, [isUnlimitedFreeWindow, activeGw, rolledFreeAllowance]);

  const pendingChangesCount = useMemo(() => {
    const origIds = new Set(
      Object.values(originalSlots)
        .filter((p): p is Player => p !== null)
        .map((p) => p.id)
    );
    if (origIds.size === 0) {
      return Object.values(draftSlots).filter((p) => p !== null).length;
    }

    let diffCount = 0;
    for (const p of Object.values(draftSlots)) {
      if (p && !origIds.has(p.id)) {
        diffCount += 1;
      }
    }
    return diffCount;
  }, [originalSlots, draftSlots]);

  const totalTransfersAfterCommit = isUnlimitedFreeWindow
    ? 0
    : alreadyUsedTransfers + pendingChangesCount;

  const freeTransfersRemaining = isUnlimitedFreeWindow
    ? 999
    : Math.max(0, freeTransferAllowance - totalTransfersAfterCommit);

  const extraPaidTransfers = isUnlimitedFreeWindow
    ? 0
    : Math.max(0, totalTransfersAfterCommit - freeTransferAllowance);

  const penaltyPerTransfer = Math.abs(
    Number(FANTASY_CONFIG.TRANSFER_HIT_PENALTY_PTS)
  );
  const totalPointHit = extraPaidTransfers * penaltyPerTransfer;

  const maxBudget = useMemo(() => {
    const relativePlayoffBonus =
      activeGw?.is_playoffs && !playoffBonusApplied
        ? FANTASY_CONFIG.PLAYOFF_BUDGET_BONUS
        : 0.0;
    return Number((userBaseBudget + relativePlayoffBonus).toFixed(1));
  }, [userBaseBudget, activeGw, playoffBonusApplied]);

  const maxPerTeam = activeGw?.is_playoffs
    ? FANTASY_CONFIG.PLAYOFF_WILDCARD_MAX_PER_TEAM
    : FANTASY_CONFIG.REGULAR_SEASON_MAX_PER_TEAM;

  const draftCost = useMemo(
    () =>
      Object.values(draftSlots).reduce(
        (sum, p) => sum + (p ? Number(p.price) : 0),
        0
      ),
    [draftSlots]
  );

  const handleConfirmOrWarn = () => {
    setStatusMsg(null);
    if (!isUnlimitedFreeWindow && extraPaidTransfers > 0) {
      setShowPenaltyModal(true);
    } else {
      executeTransferCommit();
    }
  };

  const executeTransferCommit = async () => {
    setShowPenaltyModal(false);
    if (!userId || !activeGw) return;

    if (
      !draftSlots.tank ||
      !draftSlots.dps1 ||
      !draftSlots.dps2 ||
      !draftSlots.sup1 ||
      !draftSlots.sup2
    ) {
      setStatusMsg({
        type: 'error',
        text: 'All 5 starting slots must be filled before confirming transfers.',
      });
      return;
    }

    setSaving(true);

    const newRosterIds = [
      draftSlots.tank.id,
      draftSlots.dps1.id,
      draftSlots.dps2.id,
      draftSlots.sup1.id,
      draftSlots.sup2.id,
    ];

    const { data, error } = await supabase.rpc('submit_roster_lineup', {
      p_gameweek_id: activeGw.id,
      p_new_roster: newRosterIds,
      p_captain_id: null,
    });

    setSaving(false);

    if (error) {
      setStatusMsg({ type: 'error', text: error.message });
    } else {
      const savedRecord = data as UserRoster;
      setOriginalSlots(draftSlots);
      setAlreadyUsedTransfers(savedRecord?.transfers_used ?? 0);
      setActiveSlotToSwap(null);
      setStatusMsg({
        type: 'success',
        text: isUnlimitedFreeWindow
          ? 'Pre-Season lineup updated! (0 point penalty)'
          : `Transfers confirmed! Server recorded ${
              savedRecord?.transfers_used ?? 0
            } total transfer(s) used today.`,
      });
    }
  };

  const expectedRoleForActiveSlot = useMemo(() => {
    if (!activeSlotToSwap) return null;
    if (activeSlotToSwap === 'tank') return 'TANK';
    if (activeSlotToSwap === 'dps1' || activeSlotToSwap === 'dps2')
      return 'DPS';
    return 'SUPPORT';
  }, [activeSlotToSwap]);

  const replacementCandidates = useMemo(() => {
    if (!expectedRoleForActiveSlot) return [];
    const draftedIds = new Set(
      Object.values(draftSlots)
        .filter((p): p is Player => p !== null)
        .map((p) => p.id)
    );
    const eligible = players.filter(
      (p) =>
        p.role === expectedRoleForActiveSlot &&
        !p.teams?.is_eliminated &&
        !draftedIds.has(p.id)
    );

    return [...eligible].sort((a, b) => {
      if (sortOption === 'OWNERSHIP_DESC') {
        const diff =
          Number(b.selected_by_pct ?? 0) - Number(a.selected_by_pct ?? 0);
        if (diff !== 0) return diff;
        return Number(b.price) - Number(a.price);
      }
      if (sortOption === 'OWNERSHIP_ASC') {
        const diff =
          Number(a.selected_by_pct ?? 0) - Number(b.selected_by_pct ?? 0);
        if (diff !== 0) return diff;
        return Number(b.price) - Number(a.price);
      }
      if (sortOption === 'PRICE_ASC') {
        return Number(a.price) - Number(b.price);
      }
      return Number(b.price) - Number(a.price);
    });
  }, [players, expectedRoleForActiveSlot, draftSlots, sortOption]);

  return (
    <div className="space-y-8">
      {/* Pre-Season Unlimited Transfers Banner */}
      {isUnlimitedFreeWindow && (
        <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-zinc-900 px-5 py-3.5 flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
          <p className="text-xs sm:text-sm font-bold text-emerald-200">
            STAGE 3 PRE-SEASON OPEN: Transfers are{' '}
            <span className="text-white underline">
              100% Free and Unlimited
            </span>{' '}
            until the Day 1 Lock! Once matches begin, you earn 1 Free Daily
            Transfer and can save up to 2 free transfers by rolling them over to
            the next day.
          </p>
        </div>
      )}

      {/* Top Countdown & Transfer Counter Banner */}
      <div className="rounded-2xl border border-zinc-800 bg-gradient-to-r from-zinc-900 via-[#0f131d] to-zinc-950 p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-orange-400">
              {activeGw?.name ?? 'Stage 3 Transfers Hub'}
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
              DAILY TRANSFERS &amp; LOCK HUB
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              Save up to 2 free transfers by rolling them over to the next day.
              Extra transfers beyond your saved allowance cost -
              {penaltyPerTransfer} pts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <CountdownTimer
              lockTime={activeGw?.lock_time ?? null}
              dayName={activeGw ? `Day ${activeGw.number}` : 'Day 1'}
            />

            {/* Free Transfers Counter */}
            <div className="bg-zinc-950/90 border border-zinc-800 px-4 py-2.5 rounded-xl">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Free Transfers (Max {FANTASY_CONFIG.MAX_ROLLED_FREE_TRANSFERS}{' '}
                Saved)
              </p>
              <p className="text-xs sm:text-sm font-black text-emerald-400">
                {isUnlimitedFreeWindow
                  ? 'UNLIMITED (Pre-Season)'
                  : `${freeTransfersRemaining} / ${freeTransferAllowance} Free`}
                {totalPointHit > 0 && (
                  <span className="ml-2 text-rose-400">
                    (-{totalPointHit} pts hit)
                  </span>
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                scheduleSectionRef.current?.scrollIntoView({
                  behavior: 'smooth',
                })
              }
              className="inline-flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold text-xs px-3.5 py-2.5 rounded-xl transition-colors cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              Stage 3 Schedule ↓
            </button>
          </div>
        </div>
      </div>

      {statusMsg && (
        <div
          className={`rounded-xl border px-4 py-3 flex items-center gap-3 text-sm font-bold ${
            statusMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          {statusMsg.text}
        </div>
      )}

      {/* Main Split Interface: Current Draft Lineup vs Replacement Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Cols: Active 5 Slots */}
        <div className="lg:col-span-7 rounded-2xl border border-zinc-800 bg-[#0b0e16] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-white">
              1. Select a Player to Swap Out
            </h2>
            <span
              className={`text-xs font-bold ${
                draftCost > maxBudget ? 'text-rose-400' : 'text-zinc-400'
              }`}
            >
              Budget: ${draftCost.toFixed(1)}M / ${maxBudget.toFixed(1)}M
            </span>
          </div>

          <div className="space-y-3">
            {(
              [
                { key: 'tank', label: 'TANK', role: 'TANK' },
                { key: 'dps1', label: 'DPS 1', role: 'DPS' },
                { key: 'dps2', label: 'DPS 2', role: 'DPS' },
                { key: 'sup1', label: 'SUPPORT 1', role: 'SUPPORT' },
                { key: 'sup2', label: 'SUPPORT 2', role: 'SUPPORT' },
              ] as const
            ).map((slot) => {
              const current = draftSlots[slot.key];
              const orig = originalSlots[slot.key];
              const isModified =
                current && (!orig || current.id !== orig.id);
              const isSelectedForSwap = activeSlotToSwap === slot.key;

              return (
                <div
                  key={slot.key}
                  onClick={() => !isLocked && setActiveSlotToSwap(slot.key)}
                  className={`rounded-xl border p-4 flex items-center justify-between cursor-pointer transition-all ${
                    isSelectedForSwap
                      ? 'border-orange-500 bg-orange-500/10'
                      : isModified
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <RoleBadge role={slot.role} size="sm" />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-extrabold text-white text-sm">
                          {current?.name ?? `Empty ${slot.label}`}
                        </p>
                        {current && (
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                            Sel:{' '}
                            {Number(current.selected_by_pct ?? 0).toFixed(1)}%
                          </span>
                        )}
                        {isModified && (
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                            {orig ? `Swapped (was ${orig.name})` : 'Added'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400">
                        {current?.teams?.name ?? 'Select replacement on right'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-sm font-black text-emerald-400">
                      ${current ? Number(current.price).toFixed(1) : '0.0'}M
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-orange-400">
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      Swap
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setDraftSlots(originalSlots);
                setActiveSlotToSwap(null);
              }}
              disabled={pendingChangesCount === 0}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-white disabled:opacity-40 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reset Pending Swaps
            </button>

            <button
              type="button"
              onClick={handleConfirmOrWarn}
              disabled={
                saving ||
                isLocked ||
                pendingChangesCount === 0 ||
                draftCost > maxBudget
              }
              className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-zinc-950 font-black text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all cursor-pointer"
            >
              {saving
                ? 'Committing...'
                : `Confirm ${pendingChangesCount} Transfer(s)`}
            </button>
          </div>
        </div>

        {/* Right 5 Cols: Replacement Market with Ownership Sort */}
        <div className="lg:col-span-5 rounded-2xl border border-zinc-800 bg-[#0b0e16] p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h2 className="text-base font-black text-white">
              2. Choose Replacement{' '}
              {expectedRoleForActiveSlot
                ? `(${expectedRoleForActiveSlot})`
                : ''}
            </h2>

            <div className="relative inline-flex items-center">
              <ArrowUpDown className="w-3.5 h-3.5 text-orange-400 absolute left-2.5 pointer-events-none" />
              <select
                value={sortOption}
                onChange={(e) =>
                  setSortOption(e.target.value as ReplacementSortOption)
                }
                className="bg-zinc-900 border border-zinc-800 rounded-xl pl-7 pr-2.5 py-1.5 text-[11px] font-bold text-white focus:outline-none focus:border-orange-500"
              >
                <option value="PRICE_DESC">Sort by: Price (High-Low)</option>
                <option value="PRICE_ASC">Sort by: Price (Low-High)</option>
                <option value="OWNERSHIP_DESC">
                  Sort by: Selected % (High-Low)
                </option>
                <option value="OWNERSHIP_ASC">
                  Sort by: Selected % (Low-High)
                </option>
              </select>
            </div>
          </div>

          {!activeSlotToSwap ? (
            <div className="py-16 text-center text-xs text-zinc-500">
              Click any player slot on the left to view eligible replacements of
              the same role.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
              {replacementCandidates.map((candidate) => (
                <div
                  key={candidate.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3.5 flex items-center justify-between hover:border-zinc-700"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                        {candidate.teams?.code}
                      </span>
                      <p className="font-bold text-white text-sm">
                        {candidate.name}
                      </p>
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Sel:{' '}
                        {Number(candidate.selected_by_pct ?? 0).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mt-0.5">
                      <span>
                        {candidate.teams?.name} • Max {maxPerTeam}/team
                      </span>
                      <TeamFixturesTooltip
                        teamId={candidate.team_id}
                        teamCode={candidate.teams?.code}
                        fixtures={fixtures}
                        activeGw={activeGw}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-emerald-400">
                      ${Number(candidate.price).toFixed(1)}M
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftSlots((prev) => ({
                          ...prev,
                          [activeSlotToSwap]: candidate,
                        }))
                      }
                      className="bg-orange-500 hover:bg-orange-400 text-zinc-950 font-extrabold text-xs px-3 py-1.5 rounded-lg cursor-pointer"
                    >
                      Select
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stage 3 Full Matchday Schedule Section */}
      <div ref={scheduleSectionRef} className="scroll-mt-20">
        <StageFixturesSchedule
          gameweeks={gameweeks}
          fixtures={fixtures}
          activeGwId={activeGw?.id ?? null}
        />
      </div>

      {/* Point Penalty Warning Modal */}
      {showPenaltyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-[#0d1018] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-black text-white">
                Extra Transfer Point Hit Warning
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              You are making{' '}
              <strong className="text-white">{pendingChangesCount}</strong>{' '}
              transfer(s), which exceeds your saved free transfer allowance by{' '}
              <strong className="text-rose-400">{extraPaidTransfers}</strong>.
              Confirming this change will deduct{' '}
              <strong className="text-rose-400">
                -{totalPointHit} fantasy points
              </strong>{' '}
              (-{penaltyPerTransfer} pts per extra transfer) from your{' '}
              {activeGw?.name} score.
            </p>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowPenaltyModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-white bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeTransferCommit}
                className="px-4 py-2 rounded-xl text-xs font-black bg-rose-500 hover:bg-rose-400 text-white"
              >
                Confirm (-{totalPointHit} Pts Hit)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}