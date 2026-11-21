import { Coins, Crown, Images } from 'lucide-react';
import { useApp } from '@/store/AppStore';
import { getPlan } from '@/data/pricing';
import { GenerativeArt } from '@/components/media/GenerativeArt';
import { Button } from '@/components/ui/Button';

export function ProfilePage() {
  const { credits, planId, cycle, library, navigate } = useApp();
  const plan = getPlan(planId);
  const stats = [
    { icon: Coins, label: 'Kredit', value: credits },
    { icon: Crown, label: 'Plan', value: `${plan.name}${planId !== 'free' ? ` · ${cycle === 'yearly' ? 'illik' : 'aylıq'}` : ''}` },
    { icon: Images, label: 'Kitabxana', value: library.length },
  ];
  return (
    <div className="py-10">
      <div className="flex flex-wrap items-center gap-5">
        <div className="grid size-20 place-items-center rounded-3xl bg-gradient-to-br from-blaze-500 to-volt-500 font-display text-3xl font-extrabold text-ink-900">Q</div>
        <div className="flex-1">
          <h1 className="font-display text-3xl font-extrabold">Qonaq istifadəçi</h1>
          <p className="text-sm text-muted">Hesab sistemi hələ demo rejimdədir — məlumat brauzerdə saxlanılır.</p>
        </div>
        <Button variant="volt" onClick={() => navigate('pricing')}>Planı yüksəlt</Button>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-4 rounded-3xl bg-ink-850 p-5 ring-1 ring-ink-700">
            <Icon className="text-volt-400" />
            <div><p className="text-xs text-ink-400">{label}</p><p className="font-display text-xl font-bold">{value}</p></div>
          </div>
        ))}
      </div>
      <h2 className="mt-12 font-display text-2xl font-bold">Mənim işlərim</h2>
      {library.length ? (
        <div className="mt-4 columns-2 gap-4 md:columns-4">
          {library.map((r) => (
            <div key={r.id} className="mb-4 break-inside-avoid overflow-hidden rounded-2xl ring-1 ring-ink-700">
              <GenerativeArt seed={r.seed} aspect={r.aspect} kind={r.kind} className="block w-full h-auto" />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-muted">Hələ heç nə yaratmamısan. <button onClick={() => navigate('create')} className="font-semibold text-volt-300 hover:underline cursor-pointer">İndi başla →</button></p>
      )}
    </div>
  );
}
