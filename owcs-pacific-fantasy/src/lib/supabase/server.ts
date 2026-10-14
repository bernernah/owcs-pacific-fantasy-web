import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Profile } from '@/types/fantasy';

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Safe to ignore when invoked from a Server Component render pass
          }
        },
      },
    }
  );
}

export async function getCurrentUserProfile(): Promise<Profile | null> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profile) return profile as Profile;

  // Fallback: If no database row exists yet, construct the profile from Discord session metadata
  return {
    id: user.id,
    discord_id: user.user_metadata?.provider_id ?? user.user_metadata?.sub ?? '',
    username:
      user.user_metadata?.custom_claims?.global_name ??
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      user.email?.split('@')[0] ??
      'Fantasy Manager',
    avatar_url: user.user_metadata?.avatar_url ?? null,
    is_admin:
      user.id === '947126005137563679' ||
      user.user_metadata?.provider_id === '947126005137563679' ||
      user.user_metadata?.sub === '947126005137563679' ||
      user.id === process.env.NEXT_PUBLIC_ADMIN_DISCORD_ID ||
      user.user_metadata?.provider_id === process.env.NEXT_PUBLIC_ADMIN_DISCORD_ID,
  };
}