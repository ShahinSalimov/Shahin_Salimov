import { useEffect, useRef, useState } from 'react';
import { Check, Globe } from 'lucide-react';
import { LOCALES, useI18n, type Locale } from '@/i18n';
import { cn } from '@/lib/cn';

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t('nav.language')}: ${LOCALES[locale].label}`}
        className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold text-muted ring-1 ring-ink-700 hover:text-cream hover:ring-ink-600 cursor-pointer"
      >
        <Globe size={15} /> <span className="font-mono uppercase">{locale}</span>
      </button>
      {open && (
        <ul role="listbox" aria-label={t('nav.language')}
          className="absolute right-0 top-10 z-50 w-44 overflow-hidden rounded-2xl bg-ink-850 p-1 ring-1 ring-ink-700 shadow-2xl animate-rise">
          {(Object.keys(LOCALES) as Locale[]).map((l) => (
            <li key={l}>
              <button
                role="option"
                aria-selected={l === locale}
                lang={l}
                onClick={() => { setLocale(l); setOpen(false); }}
                className={cn('flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm cursor-pointer',
                  l === locale ? 'bg-blaze-500/15 text-cream' : 'text-muted hover:bg-ink-700 hover:text-cream')}
              >
                <span><span className="mr-2 font-mono text-xs uppercase text-ink-400">{l}</span>{LOCALES[l].label}</span>
                {l === locale && <Check size={14} className="text-volt-400" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
