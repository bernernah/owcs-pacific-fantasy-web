import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import { getCurrentUserProfile } from '@/lib/supabase/server';
import { Suspense } from 'react';
import { connection } from 'next/server';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'OWCS Pacific Fantasy | Overwatch Champions Series',
  description: 'Build your 5-player OWCS Pacific fantasy roster, manage daily transfers, and compete on the global leaderboard.',
};

async function AuthNavbar() {
  // Stops prerendering exactly here so Supabase can safely read the live cookie
  await connection(); 
  
  const profile = await getCurrentUserProfile();
  return (
    <Suspense fallback={<div className="h-16 border-b border-zinc-800 bg-zinc-950" />}>
      <Navbar profile={profile} />
    </Suspense>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} min-h-screen bg-[#07090e] text-zinc-100 antialiased selection:bg-orange-500 selection:text-black`}>
        
        <Suspense fallback={<Navbar profile={null} />}>
          <AuthNavbar />
        </Suspense>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}