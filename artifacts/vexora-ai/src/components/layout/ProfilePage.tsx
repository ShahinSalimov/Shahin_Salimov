import { Coins, Crown, Images } from 'lucide-react';
import { useApp } from '@/store/AppStore';
import { getPlan } from '@/data/pricing';
import { GenerativeArt } from '@/components/media/GenerativeArt';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';

export function ProfilePage() {
  const { credits, planId, cycle, library, navigate } = useApp();
  const plan = getPlan(planId);
  const { t, fmt } = useI18n();
  const stats = [
    { icon: Coins, label: t('profile.credits'), value: fmt.num(credits) },
    { icon: Crown, label: t('profile.plan'), value: `${plan.name}${planId !== 'free' ? ` · ${t(cycle === 'yearly' ? 'profile.yearly' : 'profile.monthly')}` : ''}` },
    { icon: Images, label: t('profile.library'), value: library.length },
  ];
  return (
    <div className="py-10">
      <div className="flex flex-wrap items-center gap-5">
        <div className="grid size-20 place-items-center rounded-3xl bg-gradient-to-br from-blaze-500 to-volt-500 font-display text-3xl font-extrabold text-ink-900">{t('profile.guest').charAt(0)}</div>
        <div className="flex-1">
          <h1 className="font-display text-3xl font-extrabold">{t('profile.guest')}</h1>
          <p className="text-sm text-muted">{t('profile.demo')}</p>
        </div>
        <Button variant="volt" onClick={() => navigate('pricing')}>{t('profile.upgrade')}</Button>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-4 rounded-3xl bg-ink-850 p-5 ring-1 ring-ink-700">
            <Icon className="text-volt-400" />
            <div><p className="text-xs text-ink-400">{label}</p><p className="font-display text-xl font-bold">{value}</p></div>
          </div>
        ))}
      </div>
      <h2 className="mt-12 font-display text-2xl font-bold">{t('profile.works')}</h2>
      {library.length ? (
        <div className="mt-4 columns-2 gap-4 md:columns-4">
          {library.map((r) => (
            <div key={r.id} className="mb-4 break-inside-avoid overflow-hidden rounded-2xl ring-1 ring-ink-700">
              <GenerativeArt seed={r.seed} aspect={r.aspect} kind={r.kind} className="block w-full h-auto" />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-muted">{t('profile.empty')} <button onClick={() => navigate('create')} className="font-semibold text-volt-300 hover:underline cursor-pointer">{t('profile.start')}</button></p>
      )}
    </div>
  );
}
