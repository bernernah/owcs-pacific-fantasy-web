'use client';

import React, { useEffect, useState } from 'react';
import { Clock, Lock } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { Gameweek } from '@/types/fantasy';

interface CountdownTimerProps {
  lockTime?: string | null;
  dayName?: string | null;
}

export default function CountdownTimer({
  lockTime: propLockTime,
  dayName: propDayName,
}: CountdownTimerProps) {
  const supabase = getSupabaseBrowserClient();

  const [targetLockIso, setTargetLockIso] = useState<string | null>(
    propLockTime ?? null
  );
  const [targetDayLabel, setTargetDayLabel] = useState<string>(
    propDayName ?? 'Next Matchday'
  );
  const [timeLeftText, setTimeLeftText] = useState<string>('--d --h --m --s');
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  // Fetch the next ACTIVE or UPCOMING Gameweek from Supabase if not passed via props
  useEffect(() => {
    if (propLockTime) {
      setTargetLockIso(propLockTime);
      if (propDayName) setTargetDayLabel(propDayName);
      return;
    }

    async function fetchNextGameweekLock() {
      const { data } = await supabase
        .from('gameweeks')
        .select('*')
        .in('status', ['ACTIVE', 'UPCOMING'])
        .order('number', { ascending: true });

      if (data && data.length > 0) {
        const gws = data as Gameweek[];
        const activeGw =
          gws.find((g) => g.status === 'ACTIVE') ?? gws[0];
        setTargetLockIso(activeGw.lock_time);
        setTargetDayLabel(`Day ${activeGw.number}`);
      }
    }

    fetchNextGameweekLock();
  }, [supabase, propLockTime, propDayName]);

  // Client-side 1-second ticking timer
  useEffect(() => {
    setMounted(true);
    if (!targetLockIso) return;

    const lockMs = new Date(targetLockIso).getTime();

    const updateCountdown = () => {
      if (Number.isNaN(lockMs)) {
        setTimeLeftText('TBD');
        return;
      }

      const diff = lockMs - Date.now();

      if (diff <= 0) {
        setIsLocked(true);
        setTimeLeftText('ROSTERS LOCKED');
        return;
      }

      setIsLocked(false);
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      setTimeLeftText(
        `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(
          2,
          '0'
        )}m ${String(seconds).padStart(2, '0')}s`
      );
    };

    updateCountdown();
    const timerId = setInterval(updateCountdown, 1000);
    return () => clearInterval(timerId);
  }, [targetLockIso]);

  if (!mounted) {
    return (
      <div className="inline-flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-xs font-mono text-zinc-400">
        <Clock className="w-4 h-4 text-emerald-400 animate-pulse" />
        <span>Loading lock timer...</span>
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="inline-flex items-center gap-2 rounded-xl border border-rose-500/50 bg-rose-500/15 px-4 py-2.5 shadow-lg shadow-rose-500/10">
        <Lock className="w-4 h-4 text-rose-400 shrink-0" />
        <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-rose-400">
          ROSTERS LOCKED
        </span>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 shadow-inner">
      <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
      <div className="flex items-center gap-1.5 text-xs sm:text-sm">
        <span className="font-bold text-zinc-400">
          {targetDayLabel} Locks in:
        </span>
        <span className="font-mono font-black text-emerald-400 tracking-tight">
          {timeLeftText}
        </span>
      </div>
    </div>
  );
}