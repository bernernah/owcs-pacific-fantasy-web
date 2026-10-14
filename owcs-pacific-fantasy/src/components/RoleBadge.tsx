import React from 'react';
import { Shield, Crosshair, HeartPulse } from 'lucide-react';
import type { PlayerRole } from '@/types/fantasy';

interface RoleBadgeProps {
  role: PlayerRole;
  size?: 'sm' | 'md';
}

export default function RoleBadge({ role, size = 'md' }: RoleBadgeProps) {
  const config = {
    TANK: {
      label: 'TANK',
      icon: Shield,
      classes: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    },
    DPS: {
      label: 'DPS',
      icon: Crosshair,
      classes: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    },
    SUPPORT: {
      label: 'SUP',
      icon: HeartPulse,
      classes: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    },
  }[role];

  const Icon = config.icon;
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <span className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider rounded border ${config.classes} ${sizeClasses}`}>
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {config.label}
    </span>
  );
}