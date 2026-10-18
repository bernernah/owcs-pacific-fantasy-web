'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
  ArrowLeftRight,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { FANTASY_CONFIG, isPreSeasonNow } from '@/lib/config';
import RoleBadge from '@/components/RoleBadge';
import TeamFixturesTooltip from '@/components/TeamFixturesTooltip';
import type { Player, Gameweek, UserRoster, Fixture } from '@/types/fantasy';


type SlotKey = 'tank' | 'dps1' | 'dps2' | 'sup1' | 'sup2';

export default function TransfersPage() {
  const supabase = getSupabaseBrowserClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [activeGw, setActiveGw] = useState<Gameweek | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [userBaseBudget, setUserBaseBudget] = useState<number>(100.0);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [playoffBonusApplied, setPlayoffBonusApplied] = useState<boolean>(false);

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

  const [alreadyUsedTransfers, setAlreadyUsedTransfers] = useState<number>(0);
  const [activeSlotToSwap, setActiveSlotToSwap] = useState<SlotKey | null>(
    null
  );
  const [countdownText, setCountdownText] = useState<string>('Loading...');
  const [isLocked, setIsLocked] = useState<boolean>(false);

  // Initialized with a static boolean so Next.js static prerendering never calls Date.now()
  const [isPreSeason, setIsPreSeason] = useState<boolean>(true);

  const [showPenaltyModal, setShowPenaltyModal] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Client-only evaluation of Date.now() for Pre-Season check & Live Countdown Timer
  useEffect(() => {
    const targetMs = new Date(
      FANTASY_CONFIG.NEXT_TRANSFER_LOCK_DEADLINE
    ).getTime();

    const updateTimer = () => {
      setIsPreSeason(isPreSeasonNow());

      if (Number.isNaN(targetMs)) {
        setCountdownText('INVALID DATE CONFIG');
        return;
      }

      const diff = targetMs - Date.now();

      if (diff <= 0) {
        setIsLocked(true);
        setCountdownText('LINEUPS LOCKED');
        return;
      }

      setIsLocked(false);
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const mins = Math.floor((diff / 1000 / 60) % 60);
      const secs = Math.floor((diff / 1000) % 60);

      setCountdownText(
        `${days > 0 ? `${days}d ` : ''}${String(hours).padStart(
          2,
          '0'
        )}h : ${String(mins).padStart(2, '0')}m : ${String(secs).padStart(
          2,
          '0'
        )}s`
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function loadTransferState() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);

      const [{ data: gwData }, { data: playerData }, { data: fixtureData }] =
        await Promise.all([
          supabase
            .from('gameweeks')
            .select('*')
            .order('number', { ascending: true }),
          supabase
            .from('players')
            .select('*, teams(*)')
            .eq('is_active', true)
            .order('price', { ascending: false }),
          supabase
            .from('fixtures')
            .select(
              '*, team_a_team:teams!fixtures_team_a_fkey(*), team_b_team:teams!fixtures_team_b_fkey(*), gameweeks(*)'
            )
            .order('match_time', { ascending: true }),
        ]);

      setFixtures((fixtureData as Fixture[]) ?? []);

      if (user) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('personal_budget, playoff_bonus_applied')
          .eq('id', user.id)
          .maybeSingle();
        if (prof?.personal_budget) {
          setUserBaseBudget(Number(prof.personal_budget));
        }
        if (prof?.playoff_bonus_applied !== undefined) {
          setPlayoffBonusApplied(Boolean(prof.playoff_bonus_applied));
        }
      }

      let gws = (gwData as Gameweek[]) ?? [];
      if (gws.length === 0) {
        const { data: createdGw } = await supabase
          .from('gameweeks')
          .insert({
            number: 1,
            name: 'Gameweek 1 - Day 1',
            lock_time: FANTASY_CONFIG.NEXT_TRANSFER_LOCK_DEADLINE,
            is_playoffs: false,
            status: 'ACTIVE',
          })
          .select()
          .single();
        if (createdGw) gws = [createdGw as Gameweek];
      }

      const currentGw =
        gws.find((g) => g.status === 'ACTIVE') ??
        gws.find((g) => g.status === 'UPCOMING') ??
        gws[0] ??
        null;

      setActiveGw(currentGw);
      const allPlayers = (playerData as Player[]) ?? [];
      setPlayers(allPlayers);

      if (user && currentGw) {
        const { data: rosters } = await supabase
          .from('user_rosters')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

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

  // Pre-Season = Unlimited Free Transfers (Before GW1 Lock or during GW1 setup)
  const isUnlimitedFreeWindow = useMemo(() => {
    return isPreSeason || activeGw?.number === 1;
  }, [isPreSeason, activeGw]);

  const freeTransferAllowance = useMemo(() => {
    if (isUnlimitedFreeWindow) return 999;
    if (activeGw?.is_playoffs) {
      return FANTASY_CONFIG.PLAYOFF_WILDCARD_FREE_TRANSFERS;
    }
    return FANTASY_CONFIG.REGULAR_SEASON_FREE_TRANSFERS;
  }, [isUnlimitedFreeWindow, activeGw]);

  // Calculate how many players differ between originalSlots and draftSlots
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

  // In Pre-Season, transfers_used stays 0 and extraPaidTransfers is strictly 0
  const totalTransfersAfterCommit = isUnlimitedFreeWindow
    ? 0
    : alreadyUsedTransfers + pendingChangesCount;

  const freeTransfersRemaining = isUnlimitedFreeWindow
    ? 999
    : Math.max(0, freeTransferAllowance - totalTransfersAfterCommit);

  const extraPaidTransfers = isUnlimitedFreeWindow
    ? 0
    : Math.max(0, totalTransfersAfterCommit - freeTransferAllowance);

  const totalPointHit =
    extraPaidTransfers * FANTASY_CONFIG.TRANSFER_HIT_PENALTY_PTS;

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

    // Send ONLY the 5-player UUID array; backend calculates transfers_used
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
          : `Transfers confirmed! Server recorded ${savedRecord?.transfers_used ?? 0
          } total transfer(s) used this Gameweek.`,
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
    return players.filter(
      (p) =>
        p.role === expectedRoleForActiveSlot &&
        !p.teams?.is_eliminated &&
        !draftedIds.has(p.id)
    );
  }, [players, expectedRoleForActiveSlot, draftSlots]);

  return (
    <div className="space-y-8">
      {/* Pre-Season Unlimited Transfers Banner */}
      {isUnlimitedFreeWindow && (
        <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-zinc-900 px-5 py-3.5 flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
          <p className="text-xs sm:text-sm font-bold text-emerald-200">
            PRE-SEASON OPEN: Transfers are{' '}
            <span className="text-white underline">
              100% Free and Unlimited
            </span>{' '}
            until the Matchday 1 Lock! Experiment with your roster with zero
            point penalties.
          </p>
        </div>
      )}

      {/* Top Countdown & Transfer Counter Banner */}
      <div className="rounded-2xl border border-zinc-800 bg-gradient-to-r from-zinc-900 via-[#0f131d] to-zinc-950 p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-orange-400">
              {activeGw?.name ?? 'Transfers Hub'}
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
              DAILY TRANSFERS & LOCK HUB
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              Click any starter below to test swaps in your local draft, then
              confirm before the deadline lock.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Live Countdown Box */}
            <div className="bg-zinc-950/90 border border-zinc-800 px-4 py-3 rounded-xl flex items-center gap-3">
              <Clock
                className={`w-5 h-5 ${isLocked ? 'text-rose-400' : 'text-orange-400'
                  }`}
              />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Lock Countdown
                </p>
                <p className="text-sm font-black font-mono text-white">
                  {countdownText}
                </p>
              </div>
            </div>

            {/* Free Transfers Counter */}
            <div className="bg-zinc-950/90 border border-zinc-800 px-4 py-3 rounded-xl">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Free Transfers Remaining
              </p>
              <p className="text-sm font-black text-emerald-400">
                {isUnlimitedFreeWindow
                  ? 'UNLIMITED (Pre-Season)'
                  : `${freeTransfersRemaining} Free`}
                {totalPointHit > 0 && (
                  <span className="ml-2 text-rose-400">
                    (-{totalPointHit} pts hit)
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {statusMsg && (
        <div
          className={`rounded-xl border px-4 py-3 flex items-center gap-3 text-sm font-bold ${statusMsg.type === 'success'
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
              className={`text-xs font-bold ${draftCost > maxBudget ? 'text-rose-400' : 'text-zinc-400'
                }`}
            >
              Budget: ${draftCost.toFixed(1)}M / ${maxBudget.toFixed(0)}M
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
                  className={`rounded-xl border p-4 flex items-center justify-between cursor-pointer transition-all ${isSelectedForSwap
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
              className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-white disabled:opacity-40"
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
              className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-zinc-950 font-black text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all"
            >
              {saving
                ? 'Committing...'
                : `Confirm ${pendingChangesCount} Transfer(s)`}
            </button>
          </div>
        </div>

        {/* Right 5 Cols: Replacement Market */}
        <div className="lg:col-span-5 rounded-2xl border border-zinc-800 bg-[#0b0e16] p-6 space-y-4">
          <h2 className="text-base font-black text-white">
            2. Choose Replacement{' '}
            {expectedRoleForActiveSlot ? `(${expectedRoleForActiveSlot})` : ''}
          </h2>

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
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                        {candidate.teams?.code}
                      </span>
                      <p className="font-bold text-white text-sm">
                        {candidate.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                      <span>{candidate.teams?.name} • Max {maxPerTeam}/team</span>
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
                      className="bg-orange-500 hover:bg-orange-400 text-zinc-950 font-extrabold text-xs px-3 py-1.5 rounded-lg"
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

      {/* Point Penalty Warning Modal (Only triggers after GW1 lock) */}
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
              transfer(s), which exceeds your remaining free transfer allowance
              by <strong className="text-rose-400">{extraPaidTransfers}</strong>.
              Confirming this change will deduct{' '}
              <strong className="text-rose-400">
                -{totalPointHit} fantasy points
              </strong>{' '}
              ({FANTASY_CONFIG.TRANSFER_HIT_PENALTY_PTS} pts per extra transfer)
              from your {activeGw?.name} score.
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