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
  econTitle: 'Profit & loss — last 30 days',
  econNote: 'Estimates: AI cost uses each model’s vendor price; ad income uses ADS_REVENUE_PER_VIEW_USD. Fixed costs come from FIXED_COSTS_USD_MONTHLY.',
  revenue: 'Revenue', fees: 'Gateway fees', tax: 'Tax', aiCost: 'AI cost', adIncome: 'Ad income', fixed: 'Fixed costs', profit: 'Profit', loss: 'Loss',
  adViews: '{n} ad views · {c} free credits given',
  unitTitle: 'Price per model (worst case: cheapest credit)', model: 'Model', unit: 'Unit', vendor: 'Vendor cost', charged: 'Charged', minRevenue: 'Min. revenue', margin: 'Margin',
  perImage: 'image', perSecond: 'second', freeOk: 'free credits', marginRule: 'Prices are raised automatically so every model keeps at least {m}% margin after a {g}% gateway fee and {t}% tax.',
  creditsUsed: 'The customer already used credits from this payment, and the AI cost is already paid. Refunding now loses money.', refundAnyway: 'Refund anyway',
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
  econTitle: 'Gəlir və xərc — son 30 gün',
  econNote: 'Təxmini hesab: AI xərci hər modelin provayder qiymətindən, reklam gəliri ADS_REVENUE_PER_VIEW_USD dəyərindən götürülür. Sabit xərclər FIXED_COSTS_USD_MONTHLY-dən.',
  revenue: 'Gəlir', fees: 'Gateway komissiyası', tax: 'Vergi', aiCost: 'AI xərci', adIncome: 'Reklam gəliri', fixed: 'Sabit xərclər', profit: 'Qazanc', loss: 'Zərər',
  adViews: '{n} reklam baxışı · {c} pulsuz kredit verilib',
  unitTitle: 'Model üzrə qiymət (ən pis hal: ən ucuz kredit)', model: 'Model', unit: 'Vahid', vendor: 'Provayder xərci', charged: 'Tutulan', minRevenue: 'Min. gəlir', margin: 'Marja',
  perImage: 'şəkil', perSecond: 'saniyə', freeOk: 'pulsuz kredit', marginRule: 'Qiymətlər avtomatik qaldırılır ki, hər model {g}% gateway komissiyası və {t}% vergidən sonra ən azı {m}% marja saxlasın.',
  creditsUsed: 'Müştəri bu ödənişin kreditlərini artıq istifadə edib və AI xərci artıq ödənilib. İndi qaytarmaq zərər deməkdir.', refundAnyway: 'Yenə də qaytar',
};

export function useAdminText() {
  const { locale } = useI18n();
  const dict = locale === 'az' ? az : en;
  return (key: keyof AdminText, vars?: Record<string, string | number>) =>
    dict[key].replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m));
}
