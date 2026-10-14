import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const authCode = requestUrl.searchParams.get('code');
  const redirectTarget = requestUrl.searchParams.get('next') ?? '/my-team';

  // Fix for GitHub Codespaces proxy: look for the real cloud URL in the headers
  const forwardedHost = request.headers.get('x-forwarded-host');
  const origin = forwardedHost ? `https://${forwardedHost}` : requestUrl.origin;

  if (authCode) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(authCode);
    if (!error) {
      return NextResponse.redirect(`${origin}${redirectTarget}`);
    }
  }

  return NextResponse.redirect(`${origin}/?authError=true`);
}