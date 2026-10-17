'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Trophy,
  Users,
  ArrowLeftRight,
  BarChart3,
  ShieldAlert,
  LogOut,
  LogIn,
  Menu,
  X,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { Profile } from '@/types/fantasy';

interface NavbarProps {
  profile: Profile | null;
}

function NavbarInner({ profile }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const isAdmin =
    Boolean(profile?.is_admin) ||
    (Boolean(profile?.discord_id) &&
      profile?.discord_id === process.env.NEXT_PUBLIC_ADMIN_DISCORD_ID);

  const handleDiscordSignIn = async () => {
    setAuthLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.refresh();
  };

  const navItems = [
    { href: '/', label: 'Leaderboard', icon: Trophy },
    { href: '/my-team', label: 'My Team', icon: Users },
    { href: '/transfers', label: 'Transfers', icon: ArrowLeftRight },
    { href: '/stats', label: 'Stats Hub', icon: BarChart3 },
  ];

  if (isAdmin) {
    navItems.push({ href: '/admin', label: 'Admin OCR', icon: ShieldAlert });
  }

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20 font-black text-zinc-950 text-lg tracking-tighter">
            OW
          </div>
          <div>
            <span className="font-extrabold tracking-tight text-white text-base sm:text-lg block leading-none">
              OWCS <span className="text-orange-500">PACIFIC</span>
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 block mt-0.5">
              Official Fantasy League
            </span>
          </div>
        </Link>

        {/* Desktop Links */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                  active
                    ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Auth Control */}
        <div className="hidden md:flex items-center gap-3">
          {profile ? (
            <div className="flex items-center gap-3 bg-zinc-900/90 border border-zinc-800 px-3 py-1.5 rounded-xl">
              <Link
                href={`/profile/${profile.id}`}
                className="flex items-center gap-2.5 hover:opacity-85 transition-opacity"
                title="View My Profile"
              >
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.username}
                    className="w-7 h-7 rounded-full object-cover ring-1 ring-orange-500/50"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold text-xs">
                    {profile.username.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="text-xs">
                  <p className="font-bold text-zinc-100 leading-none">
                    {profile.username}
                  </p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    {isAdmin ? 'League Commissioner' : 'Fantasy Manager'}
                  </p>
                </div>
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                title="Sign Out"
                className="p-1.5 text-zinc-400 hover:text-rose-400 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleDiscordSignIn}
              disabled={authLoading}
              className="flex items-center gap-2 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold text-sm px-4 py-2 rounded-xl shadow-lg shadow-[#5865F2]/25 transition-all disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" />
              {authLoading ? 'Connecting...' : 'Sign in with Discord'}
            </button>
          )}
        </div>

        {/* Mobile Hamburger */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
        >
          {mobileMenuOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <Menu className="w-6 h-6" />
          )}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-zinc-800 bg-[#0b0d12] px-4 pt-3 pb-5 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-semibold ${
                  active
                    ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                    : 'text-zinc-300 hover:bg-zinc-800/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}

          <div className="pt-3 border-t border-zinc-800/80">
            {profile ? (
              <div className="flex items-center justify-between px-2">
                <Link
                  href={`/profile/${profile.id}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5"
                >
                  {profile.avatar_url && (
                    <img
                      src={profile.avatar_url}
                      alt={profile.username}
                      className="w-8 h-8 rounded-full"
                    />
                  )}
                  <span className="text-sm font-bold text-white">
                    {profile.username}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-xs font-semibold text-rose-400 px-3 py-1.5 rounded-lg bg-rose-500/10"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleDiscordSignIn}
                className="w-full flex items-center justify-center gap-2 bg-[#5865F2] text-white font-bold text-sm px-4 py-2.5 rounded-xl"
              >
                <LogIn className="w-4 h-4" />
                Sign in with Discord
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function NavbarFallback() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center font-black text-zinc-950 text-lg">
          OW
        </div>
        <div>
          <span className="font-extrabold tracking-tight text-white text-base sm:text-lg block leading-none">
            OWCS <span className="text-orange-500">PACIFIC</span>
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 block mt-0.5">
            Official Fantasy League
          </span>
        </div>
      </div>
      <div className="h-9 w-36 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" />
    </div>
  );
}

export default function Navbar({ profile }: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-[#0b0d12]/90 backdrop-blur-md">
      <Suspense fallback={<NavbarFallback />}>
        <NavbarInner profile={profile} />
      </Suspense>
    </header>
  );
}