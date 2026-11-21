import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const tones = {
  red: 'bg-blaze-500/15 text-blaze-300 ring-blaze-500/30',
  yellow: 'bg-volt-500/15 text-volt-300 ring-volt-500/30',
  dark: 'bg-ink-900/70 text-cream ring-ink-600 backdrop-blur',
} as const;

export function Badge({ tone = 'dark', children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ring-1', tones[tone], className)}>
      {children}
    </span>
  );
}
