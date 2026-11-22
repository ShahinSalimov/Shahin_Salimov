import { Copy } from 'lucide-react';
import { useState } from 'react';
import { LEGAL } from '@/legal';
import { SITE } from '@/config/site';
import { useI18n, type TKey } from '@/i18n';
import type { LegalDoc } from '@/types';
import { Requisites } from '@/components/compliance/Requisites';

const fill = (s: string) => s.replace(/\{(brand|owner|email|country|voen|phone|address)\}/g, (_, k: keyof typeof SITE) => String(SITE[k]));

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const { t, locale, fmt } = useI18n();
  const content = LEGAL[locale][doc];
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(SITE.email); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* select manually */ } };
  const updated = fmt.day(SITE.legalUpdated);

  return (
    <article className="mx-auto max-w-2xl py-12">
      <p className="text-sm text-fg-subtle">{t('legal.updated', { date: updated })}</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">{t(`legal.${doc}` as TKey)}</h1>
      <p className="mt-4 text-lg leading-relaxed text-fg-muted">{fill(content.intro)}</p>
      {doc === 'contact' && <div className="mt-8"><Requisites /></div>}
      <div className="mt-10 space-y-8">
        {content.sections.map((s) => (
          <section key={s.h}>
            <h2 className="font-display text-xl font-bold">{s.h}</h2>
            {s.p.map((para) => para === '{email}' ? (
              <p key={para} className="mt-3 flex flex-wrap items-center gap-2">
                <span className="select-all rounded-xl bg-surface px-3 py-2 font-mono text-sm ring-1 ring-line">{SITE.email}</span>
                <button onClick={copy} className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline cursor-pointer"><Copy size={14} /> {t(copied ? 'preview.copied' : 'preview.copy')}</button>
              </p>
            ) : <p key={para} className="mt-3 leading-relaxed text-fg-muted">{fill(para)}</p>)}
          </section>
        ))}
      </div>
    </article>
  );
}
