'use client';

import React, { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import {
  BellRing,
  Flame,
  CalendarCheck,
  ArrowLeftRight,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { claimDailyBonusAction } from '@/app/actions/dailyBonus';
import CountdownTimer from '@/components/CountdownTimer';
import type { Profile } from '@/types/fantasy';

interface DailyHubProps {
  profile: Profile | null;
  onBonusClaimed?: (newStreak: number) => void;
}

export default function DailyHub({ profile, onBonusClaimed }: DailyHubProps) {
  const [isPending, startTransition] = useTransition();
  const [claimedToday, setClaimedToday] = useState<boolean>(false);
  const [streak, setStreak] = useState<number>(profile?.daily_streak ?? 0);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!profile) return;
    setStreak(profile.daily_streak ?? 0);

    if (!profile.last_daily_claim) {
      setClaimedToday(false);
      return;
    }

    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Australia/Perth',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const todayStr = fmt.format(new Date());
    const lastClaimStr = fmt.format(new Date(profile.last_daily_claim));

    setClaimedToday(todayStr === lastClaimStr);
  }, [profile]);

  const handleClaim = () => {
    setFeedback(null);
    startTransition(async () => {
      const result = await claimDailyBonusAction();
      if (result.success) {
        setClaimedToday(true);
        if (result.daily_streak !== undefined) {
          setStreak(result.daily_streak);
          if (onBonusClaimed) {
            onBonusClaimed(result.daily_streak);
          }
        }
        setFeedback({ type: 'success', text: result.message });
      } else {
        setFeedback({ type: 'error', text: result.message });
      }
    });
  };

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6 space-y-4 shadow-xl">
      {/* Daily Lock Reminder + Live Countdown Timer Banner */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
            <BellRing className="w-5 h-5" />
          </div>
          <p className="text-xs sm:text-sm font-bold text-emerald-100 leading-relaxed">
            Rosters lock daily! Use your{' '}
            <span className="text-emerald-400 underline">
              1 Free Daily Transfer
            </span>
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <CountdownTimer />

          <Link
            href="/transfers"
            className="inline-flex items-center gap-1.5 bg-zinc-950 hover:bg-zinc-800 text-emerald-400 border border-emerald-500/30 font-extrabold text-xs px-3.5 py-2.5 rounded-xl shrink-0 transition-colors"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Daily Transfers
          </Link>
        </div>
      </div>

      {/* Daily Check-In Streak Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-emerald-400">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-white">
                Daily Manager Check-In
              </h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[11px] font-black">
                <Flame className="w-3 h-3" />
                {streak} Day Streak
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Check in every Matchday to build your active manager streak on
              your public profile.
            </p>
          </div>
        </div>

        {!profile ? (
          <span className="text-xs font-bold text-zinc-400 bg-zinc-950 border border-zinc-800 px-4 py-2.5 rounded-xl">
            Sign in with Discord to track your streak
          </span>
        ) : claimedToday ? (
          <button
            type="button"
            disabled
            className="px-5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-600 font-black text-xs uppercase tracking-wider cursor-not-allowed shrink-0"
          >
            Come back tomorrow!
          </button>
        ) : (
          <button
            type="button"
            onClick={handleClaim}
            disabled={isPending}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 transition-all shrink-0 cursor-pointer"
          >
            <CalendarCheck className="w-4 h-4" />
            {isPending ? 'Checking In...' : 'Claim Daily Check-In'}
          </button>
        )}
      </div>

      {feedback && (
        <div
          className={`rounded-xl border px-3.5 py-2.5 flex items-center gap-2 text-xs font-bold ${
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
          {feedback.text}
        </div>
      )}
    </section>
  );
}