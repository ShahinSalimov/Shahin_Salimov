import { CURRENCIES, type Currency } from '@workspace/vexora-core';
import { useApp } from '@/store/AppStore';
import { useI18n } from '@/i18n';
import { Segmented } from '@/components/ui/Segmented';

export function CurrencySelect() {
  const { currency, setCurrency } = useApp();
  const { t } = useI18n();
  return (
    <Segmented<Currency> label={t('billing.currency')} value={currency} onChange={setCurrency}
      options={CURRENCIES.map((c) => ({ value: c, label: <span className="font-mono text-xs">{c}</span> }))} />
  );
}
