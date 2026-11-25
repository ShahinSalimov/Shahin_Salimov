import { useDB } from '../lib/store';
import { buildNav } from '../components/Layout';
import { Card } from '../components/ui';

/** Telefonda bütün bölmələrə keçid menyusu */
export default function More() {
  const db = useDB();
  return (
    <div className="space-y-5">
      {buildNav(db).map((g) => (
        <div key={g.group}>
          <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{g.group}</div>
          <Card className="divide-y divide-slate-100 overflow-hidden">
            {g.items.map((i) => (
              <a key={i.to} href={`#/${i.to}`} className="flex items-center gap-3 px-4 py-3.5 text-[15px] font-medium active:bg-slate-50">
                {i.color ? <span className="grid size-5 place-items-center"><span className="size-3 rounded-full" style={{ background: i.color }} /></span> : <i.icon className="size-5 text-slate-500" />}
                {i.label}
              </a>
            ))}
          </Card>
        </div>
      ))}
    </div>
  );
}
