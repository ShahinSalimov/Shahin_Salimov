import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const tones = {
  primary: 'bg-primary-soft text-primary-strong ring-primary/25',
  accent: 'bg-accent-soft text-accent-fg ring-accent/40',
  neutral: 'bg-surface/90 text-fg ring-line backdrop-blur',
} as const;

export function Badge({ tone = 'neutral', children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ring-1', tones[tone], className)}>
      {children}
    </span>
  );
}
