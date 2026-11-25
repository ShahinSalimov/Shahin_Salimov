import { useRef, useState } from 'react';
import { Download, Upload, RotateCcw, Trash2, Plus, Pencil, ImagePlus } from 'lucide-react';
import { clearAll, getDB, replaceDB, resetDemo, update, useDB } from '../lib/store';
import type { BusinessDef, DB, Settings as S } from '../lib/types';
import { Button, Card, Field, Input, PageHeader, Select, toast } from '../components/ui';
import { BusinessForm } from './Business';

export default function Settings({ query }: { query: URLSearchParams }) {
  const db = useDB();
  const [f, setF] = useState<S>(db.settings);
  const [biz, setBiz] = useState<BusinessDef | 'new' | null>(query.get('new') === 'biz' ? 'new' : null);
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof S>(k: K, v: S[K]) => setF((x) => ({ ...x, [k]: v }));

  const save = () => {
    update('Ayarlar yeniləndi', (d) => ({ ...d, settings: f }));
    toast('Yadda saxlanıldı');
  };

  const onLogo = (file?: File) => {
    if (!file) return;
    if (file.size > 400_000) return toast('Loqo 400 KB-dan kiçik olmalıdır');
    const r = new FileReader();
    r.onload = () => {
      const logo = String(r.result);
      setF((x) => ({ ...x, logo }));
      update('Loqo yükləndi', (d) => ({ ...d, settings: { ...d.settings, logo } }));
    };
    r.readAsDataURL(file);
  };

  const exportJSON = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(db)], { type: 'application/json' }));
    a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const importJSON = (file?: File) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(String(r.result)) as DB;
        if (!parsed.cars || !parsed.drivers) throw new Error();
        if (!confirm('Bütün cari məlumatlar backup faylı ilə əvəz olunsun?')) return;
        replaceDB(parsed, 'Backup faylından bərpa edildi');
        setF(parsed.settings);
        toast('Bərpa edildi');
      } catch {
        toast('Fayl düzgün deyil');
      }
    };
    r.readAsText(file);
  };

  return (
    <>
      <PageHeader title="Ayarlar" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 font-semibold">Şirkət</div>
          <div className="mb-4 flex items-center gap-4">
            <img src={f.logo || './icon.svg'} alt="" className="size-16 rounded-2xl border border-slate-200 bg-white object-contain" />
            <div className="flex flex-col gap-1.5">
              <Button size="sm" onClick={() => logoRef.current?.click()}><ImagePlus className="size-4" /> Loqo yüklə</Button>
              {f.logo && <button className="text-xs text-rose-600" onClick={() => { setF({ ...f, logo: undefined }); update('Loqo silindi', (d) => ({ ...d, settings: { ...d.settings, logo: undefined } })); }}>Loqonu sil</button>}
              <input ref={logoRef} type="file" accept="image/*" hidden onChange={(e) => onLogo(e.target.files?.[0])} />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Şirkətin adı"><Input value={f.companyName} onChange={(e) => set('companyName', e.target.value)} /></Field>
            <Field label="Sahibin adı" hint="Panel və səhər hesabatında"><Input value={f.ownerName} onChange={(e) => set('ownerName', e.target.value)} /></Field>
            <Field label="Daxil olan istifadəçi" hint="Audit jurnalında kimin nə etdiyi yazılır">
              <Select value={f.currentUser} onChange={(e) => set('currentUser', e.target.value)}>
                {[f.ownerName || 'Sahib', 'Menecer', 'Kassir'].filter((x, i, a) => a.indexOf(x) === i).map((u) => <option key={u}>{u}</option>)}
              </Select>
            </Field>
            <Field label="Standart gündəlik icarə (₼)"><Input type="number" value={f.defaultDailyRate} onChange={(e) => set('defaultDailyRate', Number(e.target.value))} /></Field>
          </div>
          <div className="mt-5 mb-3 font-semibold">Telegram bot</div>
          <div className="grid gap-4">
            <Field label="Bot token" hint="@BotFather-dən alınır"><Input value={f.telegramToken ?? ''} onChange={(e) => set('telegramToken', e.target.value)} placeholder="123456:ABC..." /></Field>
            <Field label="Chat ID" hint="Sahibin Telegram chat ID-si"><Input value={f.telegramChatId ?? ''} onChange={(e) => set('telegramChatId', e.target.value)} /></Field>
          </div>
          <Button variant="primary" className="mt-5 w-full md:w-auto" onClick={save}>Yadda saxla</Button>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="mb-1 flex items-center justify-between">
              <div className="font-semibold">Bizneslər</div>
              <Button size="sm" variant="primary" onClick={() => setBiz('new')}><Plus className="size-4" /> Yeni biznes</Button>
            </div>
            <p className="mb-3 text-xs text-slate-500">Yeni biznes açanda (avtoyuma, kafe, ehtiyat hissələri və s.) buradan əlavə edin. Onun öz gəlir/xərc səhifəsi yaranır və panel, kassa, hesabatlara avtomatik qoşulur.</p>
            {db.businesses.map((b) => (
              <button key={b.id} onClick={() => setBiz(b)} className="flex w-full items-center justify-between border-b border-slate-50 py-2.5 text-left text-sm last:border-0 hover:bg-slate-50">
                <span className="flex items-center gap-2.5"><span className="size-3 rounded-full" style={{ background: b.color }} /><span className="font-medium">{b.name}</span>{b.builtin && <span className="text-xs text-slate-400">əsas modul</span>}</span>
                <Pencil className="size-4 text-slate-300" />
              </button>
            ))}
          </Card>

          <Card className="p-5">
            <div className="mb-3 font-semibold">Məlumatlar</div>
            <div className="grid gap-2 md:grid-cols-2">
              <Button onClick={exportJSON}><Download className="size-4" /> Backup yüklə</Button>
              <Button onClick={() => fileRef.current?.click()}><Upload className="size-4" /> Backup-dan bərpa</Button>
              <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => importJSON(e.target.files?.[0])} />
              <Button onClick={() => confirm('Demo məlumatları yenidən yüklənsin? Cari məlumatlar silinəcək.') && (resetDemo(), setF(useDBSnapshot()))}><RotateCcw className="size-4" /> Demo məlumatları</Button>
              <Button variant="danger" onClick={() => confirm('BÜTÜN məlumatlar silinsin və sistem təmiz başlasın?') && confirm('Əminsiniz? Bu geri qaytarılmır (backup yükləməmisinizsə).') && (clearAll(), setF(useDBSnapshot()))}><Trash2 className="size-4" /> Təmiz başla</Button>
            </div>
            <p className="mt-3 text-xs text-slate-400">Bu versiyada məlumatlar bu cihazın brauzerində saxlanılır. Mütəmadi backup yükləyin. Bulud verilənlər bazası (bütün cihazlarda sinxron) növbəti mərhələdədir.</p>
          </Card>

          <Card className="p-5">
            <div className="mb-3 font-semibold">Audit jurnalı</div>
            <p className="mb-2 text-xs text-slate-500">Kim, nə vaxt, nəyi dəyişib</p>
            <div className="max-h-80 overflow-y-auto">
              {db.audit.slice(0, 100).map((a) => (
                <div key={a.id} className="border-b border-slate-50 py-2 text-sm last:border-0">
                  <div>{a.action}</div>
                  <div className="text-xs text-slate-400">{new Date(a.ts).toLocaleString('az-AZ')} · {a.user}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
      {biz && <BusinessForm biz={biz === 'new' ? null : biz} onClose={() => setBiz(null)} />}
    </>
  );
}

const useDBSnapshot = () => getDB().settings;
