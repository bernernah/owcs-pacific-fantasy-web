import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import { getCurrentUserProfile } from '@/lib/supabase/server';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'OWCS Pacific Fantasy | Overwatch Champions Series',
  description:
    'Build your 5-player OWCS Pacific fantasy roster, manage daily transfers, and compete on the global leaderboard.',
};

async function ServerNavbar() {
  const profile = await getCurrentUserProfile();
  return <Navbar profile={profile} />;
}

function HeaderSkeleton() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-[#0b0d12]/90 backdrop-blur-md h-16" />
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.className} min-h-screen bg-[#07090e] text-zinc-100 antialiased selection:bg-orange-500 selection:text-black`}
      >
        <Suspense fallback={<HeaderSkeleton />}>
          <ServerNavbar />
        </Suspense>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Suspense
            fallback={
              <div className="py-20 text-center text-sm text-zinc-400">
                Loading OWCS Pacific Fantasy...
              </div>
            }
          >
            {children}
          </Suspense>
        </main>
      </body>
    </html>
  );
}