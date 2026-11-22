import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/AppStore';
import { Requisites } from '@/components/compliance/Requisites';
import { CardBrands } from '@/components/compliance/CardBrands';
import type { LegalDoc } from '@/types';

const LINKS: LegalDoc[] = ['terms', 'privacy', 'refunds', 'delivery', 'contact'];

export function Footer() {
  const { t } = useI18n();
  const { navigate } = useApp();
  return (
    <footer className="mt-24 border-t border-line bg-surface/60 pb-24 md:pb-0">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto]">
        <div className="min-w-0 space-y-4">
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label={t('requisites.title')}>
            {LINKS.map((l) => (
              <a key={l} href={`#${l}`} onClick={(e) => { e.preventDefault(); navigate(l); }} className="text-fg-muted hover:text-primary">
                {t(`legal.${l}` as TKey)}
              </a>
            ))}
          </nav>
          <Requisites variant="compact" />
          <p className="text-xs text-fg-subtle">{t('footer.rights', { year: new Date().getFullYear() })}</p>
        </div>
        <div className="flex flex-col gap-2 md:items-end">
          <span className="text-xs text-fg-subtle">{t('requisites.accept')}</span>
          <CardBrands />
        </div>
      </div>
    </footer>
  );
}
