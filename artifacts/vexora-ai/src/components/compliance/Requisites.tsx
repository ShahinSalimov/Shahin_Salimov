import { Building2, Hash, Mail, MapPin, Phone } from 'lucide-react';
import { SITE } from '@/config/site';
import { useI18n } from '@/i18n';
import { CardBrands } from './CardBrands';

/** Owner/business details that payment gateways require to be visible on the site. */
export function Requisites({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
  const { t } = useI18n();
  const rows = [
    { icon: Building2, label: t('requisites.owner'), value: SITE.owner },
    { icon: Hash, label: t('requisites.voen'), value: SITE.voen },
    { icon: Phone, label: t('requisites.phone'), value: SITE.phone, href: `tel:${SITE.phone.replace(/[^\d+]/g, '')}` },
    { icon: Mail, label: t('requisites.email'), value: SITE.email, href: `mailto:${SITE.email}` },
    { icon: MapPin, label: t('requisites.address'), value: SITE.address },
  ];

  if (variant === 'compact') {
    return (
      <address className="not-italic text-xs leading-relaxed text-fg-subtle">
        <span className="font-semibold text-fg-muted">{SITE.owner}</span> · {t('requisites.voen')}: {SITE.voen}<br />
        {SITE.address} · <span className="select-all">{SITE.phone}</span> · <span className="select-all">{SITE.email}</span>
      </address>
    );
  }
  return (
    <section className="rounded-3xl bg-surface p-6 shadow-sm ring-1 ring-line" aria-labelledby="requisites-title">
      <h2 id="requisites-title" className="font-display text-xl font-bold">{t('requisites.title')}</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {rows.map(({ icon: Icon, label, value, href }) => (
          <div key={label} className="flex min-w-0 gap-3">
            <Icon size={18} className="mt-0.5 shrink-0 text-primary" />
            <div className="min-w-0">
              <dt className="text-xs text-fg-subtle">{label}</dt>
              {/* shown as selectable text; tel:/mailto: links are a convenience only */}
              <dd className="break-words font-medium select-all">{href ? <a href={href} className="hover:text-primary">{value}</a> : value}</dd>
            </div>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <span className="text-sm text-fg-muted">{t('requisites.accept')}</span>
        <CardBrands />
      </div>
    </section>
  );
}
