import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/AppStore';
import type { LegalDoc } from '@/types';

const LINKS: LegalDoc[] = ['terms', 'privacy', 'refunds', 'contact'];

export function Footer() {
  const { t } = useI18n();
  const { navigate } = useApp();
  return (
    <footer className="mt-24 border-t border-line pb-24 md:pb-0">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-fg-muted sm:px-6 md:flex-row md:items-center md:justify-between">
        <p>{t('footer.rights', { year: new Date().getFullYear() })}</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label={t('legal.terms')}>
          {LINKS.map((l) => (
            <a key={l} href={`#${l}`} onClick={(e) => { e.preventDefault(); navigate(l); }} className="hover:text-primary">
              {t(`legal.${l}` as TKey)}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
