import { useI18n } from '@/i18n';

export function Logo({ onClick }: { onClick?: () => void }) {
  const { t } = useI18n();
  return (
    <button onClick={onClick} className="group flex items-center gap-2.5 cursor-pointer" aria-label={t('nav.home')}>
      <span className="relative grid size-9 place-items-center rounded-xl bg-blaze-500 font-display text-lg font-extrabold text-cream rotate-[-6deg] transition-transform group-hover:rotate-0">
        V
        <span className="absolute -right-1 -top-1 size-3 rounded-full bg-volt-500 ring-2 ring-ink-900" />
      </span>
      <span className="whitespace-nowrap font-display text-lg font-extrabold tracking-tight">
        Vexora <span className="text-volt-400">AI</span>
      </span>
    </button>
  );
}
