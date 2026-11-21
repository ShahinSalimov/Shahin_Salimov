import { useI18n } from '@/i18n';

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="mt-24 border-t border-ink-700/60 pb-24 md:pb-0">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>{t('footer.rights', { year: new Date().getFullYear() })}</p>
        <p className="font-mono text-xs text-ink-400">{t('footer.synthetic')}</p>
      </div>
    </footer>
  );
}
