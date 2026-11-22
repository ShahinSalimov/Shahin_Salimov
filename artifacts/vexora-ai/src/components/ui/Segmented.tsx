import { cn } from '@/lib/cn';

interface Option<T extends string> { value: T; label: React.ReactNode }
interface Props<T extends string> { value: T; onChange: (v: T) => void; options: Option<T>[]; className?: string; label: string }

export function Segmented<T extends string>({ value, onChange, options, className, label }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-full bg-surface-2 p-1 ring-1 ring-line', className)}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors cursor-pointer',
            value === o.value ? 'bg-surface text-fg shadow-sm ring-1 ring-line' : 'text-fg-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
