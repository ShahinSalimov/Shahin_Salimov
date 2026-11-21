import { cn } from '@/lib/cn';

interface Option<T extends string> { value: T; label: React.ReactNode }
interface Props<T extends string> { value: T; onChange: (v: T) => void; options: Option<T>[]; className?: string; label: string }

export function Segmented<T extends string>({ value, onChange, options, className, label }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-full bg-ink-800 p-1 ring-1 ring-ink-700', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors cursor-pointer',
            value === o.value ? 'bg-volt-500 text-ink-900' : 'text-muted hover:text-cream',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
