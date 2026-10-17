'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export interface ClaimDailyResult {
  success: boolean;
  message: string;
  personal_budget?: number;
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
        message: 'Please sign in with Discord to claim your daily bonus.',
      };
    }

    const { data, error } = await supabase.rpc('claim_daily_bonus');

    if (error) {
      return {
        success: false,
        message: error.message || 'Could not claim daily bonus.',
      };
    }

    const payload = data as {
      personal_budget: number;
      daily_streak: number;
      last_daily_claim: string;
    };

    revalidatePath('/');
    revalidatePath('/my-team');
    revalidatePath('/transfers');

    return {
      success: true,
      message: `+$100,000 ($0.10M) added to your salary cap! Daily streak: ${payload.daily_streak} day(s).`,
      personal_budget: Number(payload.personal_budget),
      daily_streak: Number(payload.daily_streak),
      last_daily_claim: payload.last_daily_claim,
    };
  } catch (err: unknown) {
    return {
      success: false,
      message:
        err instanceof Error ? err.message : 'Failed to claim daily bonus.',
    };
  }
}