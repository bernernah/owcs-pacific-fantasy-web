'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export interface ClaimDailyResult {
  success: boolean;
  message: string;
  daily_streak?: number;
  last_daily_claim?: string;
}

export async function claimDailyBonusAction(): Promise<ClaimDailyResult> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        success: false,
        message: 'Please sign in with Discord to complete your daily check-in.',
      };
    }

    const { data, error } = await supabase.rpc('claim_daily_bonus');

    if (error) {
      return {
        success: false,
        message: error.message || 'Could not complete daily check-in.',
      };
    }

    const payload = data as {
      daily_streak: number;
      last_daily_claim: string;
    };

    revalidatePath('/');
    revalidatePath(`/profile/${user.id}`);

    return {
      success: true,
      message: `Daily check-in complete! Active streak: ${payload.daily_streak} day(s).`,
      daily_streak: Number(payload.daily_streak),
      last_daily_claim: payload.last_daily_claim,
    };
  } catch (err: unknown) {
    return {
      success: false,
      message:
        err instanceof Error ? err.message : 'Failed to complete daily check-in.',
    };
  }
}