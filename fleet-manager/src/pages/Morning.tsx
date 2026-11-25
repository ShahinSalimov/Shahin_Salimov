import { useState } from 'react';
import { Copy, Send, Settings } from 'lucide-react';
import { useDB } from '../lib/store';
import { morningReport } from '../lib/calc';
import { Button, Card, PageHeader, toast } from '../components/ui';

export default function Morning() {
  const db = useDB();
  const text = morningReport(db);
  const [sending, setSending] = useState(false);
  const { telegramToken, telegramChatId } = db.settings;

  const send = async () => {
    if (!telegramToken || !telegramChatId) {
      toast('Əvvəlcə Ayarlarda Telegram bot məlumatlarını daxil edin');
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: telegramChatId, text }),
      });
      const j = await res.json();
      toast(j.ok ? 'Telegram-a göndərildi' : `Xəta: ${j.description ?? res.status}`);
    } catch {
      toast('Göndərmək alınmadı — internet və ya bot məlumatlarını yoxlayın');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <PageHeader title="Səhər hesabatı" subtitle="Sahibə hər səhər gələn qısa xülasə (dünənki gün üzrə)" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* Telefon görünüşü */}
        <div className="mx-auto w-full max-w-[380px]">
          <div className="rounded-[2.5rem] bg-ink p-3 shadow-2xl">
            <div className="overflow-hidden rounded-[2rem] bg-[#0e1621]">
              <div className="flex items-center gap-3 bg-[#17212b] px-4 py-3">
                <img src={db.settings.logo || './icon.svg'} alt="" className="size-9 rounded-full bg-white object-contain" />
                <div><div className="text-sm font-semibold text-white">{db.settings.companyName} Bot</div><div className="text-xs text-sky-400">bot</div></div>
              </div>
              <div className="min-h-[420px] bg-[#0e1621] p-3" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, #1b2a3a 0, transparent 40%), radial-gradient(circle at 80% 70%, #172a26 0, transparent 40%)' }}>
                <div className="ml-auto w-fit rounded-lg bg-[#2b5278] px-3 py-1 text-[11px] text-white/70">09:00</div>
                <div className="mt-2 max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-[#182533] px-3.5 py-2.5 text-[13px] leading-relaxed text-white">{text}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="font-semibold">Necə işləyir?</div>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
              <li>Sistem gecə ərzində dünənki bütün rəqəmləri toplayır.</li>
              <li>Səhər 09:00-da sahibin Telegram-ına bu mesaj gəlir.</li>
              <li>Sahib proqramı açmadan biznesin vəziyyətini görür.</li>
            </ol>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={send} disabled={sending}><Send className="size-4" /> {sending ? 'Göndərilir...' : 'İndi Telegram-a göndər'}</Button>
              <Button onClick={() => navigator.clipboard.writeText(text).then(() => toast('Kopyalandı'))}><Copy className="size-4" /> Kopyala</Button>
              <a href="#/settings" className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm text-slate-600 hover:bg-slate-100"><Settings className="size-4" /> Bot ayarları</a>
            </div>
          </Card>
          <Card className="p-5 text-sm text-slate-600">
            <div className="font-semibold text-ink">Avtomatik göndəriş haqqında</div>
            <p className="mt-2">Hazırkı versiyada düymə ilə göndərilir. Hər səhər avtomatik göndərmək üçün server tərəfində cədvəl (məs. n8n və ya cron) qoşulmalıdır. Bu, növbəti mərhələdə edilir.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
