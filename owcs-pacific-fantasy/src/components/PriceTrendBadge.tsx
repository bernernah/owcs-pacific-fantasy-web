'use client';

import React from 'react';

interface PriceTrendBadgeProps {
  delta?: number | null;
  size?: 'xs' | 'sm';
}

export default function PriceTrendBadge({
  delta,
  size = 'xs',
}: PriceTrendBadgeProps) {
  const numDelta = Number(delta ?? 0);
  if (!Number.isFinite(numDelta) || numDelta === 0) {
    return null;
  }

  const isPositive = numDelta > 0;
  const formatted = `${isPositive ? '+' : '-'}$${Math.abs(numDelta).toFixed(
    1
  )}M`;

  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-[11px]'
      : 'px-1.5 py-0.5 text-[10px]';

  return (
    <span
      title={
        isPositive
          ? `Recent Price Increase (${formatted})`
          : `Recent Price Drop (${formatted})`
      }
      className={`inline-flex items-center gap-0.5 rounded font-mono font-black leading-none border ${sizeClasses} ${
        isPositive
          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
          : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
      }`}
    >
      <span>{isPositive ? '▲' : '▼'}</span>
      <span>{formatted}</span>
    </span>
  );
}