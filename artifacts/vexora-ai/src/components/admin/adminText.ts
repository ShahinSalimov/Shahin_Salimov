import { useI18n } from '@/i18n';

/** Owner-only UI: English + Azerbaijani; other locales fall back to English. */
const en = {
  title: 'Cashbox',
  subtitle: 'Revenue, payments and customer credits. Only you can see this page.',
  forbidden: 'This page is only for the site owner.',
  net: 'Net', gross: 'Gross', refunded: 'Refunded', payments: 'Payments: {n}',
  users: 'Users', payingUsers: 'Paying users', generations: 'Generations', creditsSpent: 'Credits spent', pending: 'Pending payments',
  payoutNote: 'Money is held by the payment provider and paid out to your bank account on the provider’s schedule. This page shows what customers were charged, before provider fees.',
  providerOff: 'Payments are switched off (free launch). Set PAYMENTS_ENABLED=true on the server when a gateway is connected.',
  provider: 'Gateway: {p}', demo: 'Demo data — stored only in this browser',
  modeSandbox: 'Sandbox mode — test payments, no real money', modeLive: 'Live payments', test: 'test',
  manualRefund: 'Refunds for {p} are made in the gateway’s merchant cabinet; this button records the refund and removes the credits.',
  tabPayments: 'Payments', tabUsers: 'Users',
  allStatuses: 'All statuses', allCurrencies: 'All currencies', search: 'Search by email',
  date: 'Date', customer: 'Customer', item: 'Item', amount: 'Amount', status: 'Status', credits: 'Credits', plan: 'Plan', joined: 'Joined', role: 'Role',
  refund: 'Refund', refundConfirm: 'Refund {amount} to {email}? {credits} credits will be removed from the account.', confirm: 'Yes, refund', cancel: 'Cancel',
  adjust: 'Adjust', adjustTitle: 'Adjust credits for {email}', delta: 'Credits to add (use − to remove)', note: 'Note (optional)', save: 'Save',
  noPayments: 'No payments match these filters.', noUsers: 'No users found.', prev: 'Previous', next: 'Next', range: '{from}–{to} of {total}',
  refresh: 'Refresh',
};
type AdminText = typeof en;
const az: AdminText = {
  title: 'Kassa',
  subtitle: 'Gəlir, ödənişlər və müştəri kreditləri. Bu səhifəni yalnız sən görürsən.',
  forbidden: 'Bu səhifə yalnız sayt sahibi üçündür.',
  net: 'Xalis', gross: 'Ümumi', refunded: 'Geri qaytarılıb', payments: '{n} ödəniş',
  users: 'İstifadəçilər', payingUsers: 'Ödəniş edənlər', generations: 'Generasiyalar', creditsSpent: 'Xərclənən kredit', pending: 'Gözləyən ödənişlər',
  payoutNote: 'Pul ödəniş provayderində saxlanılır və provayderin cədvəli ilə bank hesabına köçürülür. Bu səhifə müştərilərdən çıxılan məbləği provayder komissiyası çıxılmadan göstərir.',
  providerOff: 'Ödənişlər bağlıdır (pulsuz buraxılış). Gateway qoşulanda serverdə PAYMENTS_ENABLED=true et.',
  provider: 'Gateway: {p}', demo: 'Demo məlumat — yalnız bu brauzerdə saxlanılır',
  modeSandbox: 'Sandbox rejimi — test ödənişləri, real pul yoxdur', modeLive: 'Real ödənişlər', test: 'test',
  manualRefund: '{p} üçün geri qaytarma gateway-in merchant kabinetində edilir; bu düymə qaytarmanı qeydə alır və kreditləri silir.',
  tabPayments: 'Ödənişlər', tabUsers: 'İstifadəçilər',
  allStatuses: 'Bütün statuslar', allCurrencies: 'Bütün valyutalar', search: 'E-poçtla axtar',
  date: 'Tarix', customer: 'Müştəri', item: 'Məhsul', amount: 'Məbləğ', status: 'Status', credits: 'Kredit', plan: 'Plan', joined: 'Qoşulub', role: 'Rol',
  refund: 'Geri qaytar', refundConfirm: '{email} üçün {amount} geri qaytarılsın? Hesabdan {credits} kredit silinəcək.', confirm: 'Bəli, qaytar', cancel: 'İmtina',
  adjust: 'Düzəlt', adjustTitle: '{email} üçün kredit düzəlişi', delta: 'Əlavə ediləcək kredit (silmək üçün − yaz)', note: 'Qeyd (istəyə bağlı)', save: 'Yadda saxla',
  noPayments: 'Bu filtrlərə uyğun ödəniş yoxdur.', noUsers: 'İstifadəçi tapılmadı.', prev: 'Əvvəlki', next: 'Növbəti', range: '{from}–{to} / {total}',
  refresh: 'Yenilə',
};

export function useAdminText() {
  const { locale } = useI18n();
  const dict = locale === 'az' ? az : en;
  return (key: keyof AdminText, vars?: Record<string, string | number>) =>
    dict[key].replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m));
}
