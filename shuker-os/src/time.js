// Vaxt köməkçiləri. Bazada vaxt UTC ISO kimi saxlanılır, istifadəçiyə yerli vaxt (Bakı) göstərilir.

export function makeTime({ timezone = 'Asia/Baku', tzOffset = '+04:00' } = {}) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  });
  const WEEKDAYS = { Sun: 'Bazar', Mon: 'Bazar ertəsi', Tue: 'Çərşənbə axşamı', Wed: 'Çərşənbə', Thu: 'Cümə axşamı', Fri: 'Cümə', Sat: 'Şənbə' };

  function parts(date = new Date()) {
    const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, weekday: WEEKDAYS[p.weekday] || p.weekday };
  }

  // "2026-11-12 16:00" (yerli) -> ISO UTC. Səhv formatda null qaytarır.
  function localToIso(local) {
    const m = String(local || '').trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const d = new Date(`${m[1]}T${m[2].padStart(2, '0')}:${m[3]}:00${tzOffset}`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  // Yerli günün başlanğıcı və sonu (ISO UTC)
  function dayRange(localDate) {
    const start = localToIso(`${localDate} 00:00`);
    if (!start) return null;
    const end = new Date(new Date(start).getTime() + 24 * 3600 * 1000).toISOString();
    return { start, end };
  }

  function isoToLocal(iso) {
    if (!iso) return '';
    const p = parts(new Date(iso));
    return `${p.date} ${p.time}`;
  }

  function addDays(localDate, n) {
    const d = new Date(`${localDate}T12:00:00${tzOffset}`);
    d.setUTCDate(d.getUTCDate() + n);
    return parts(d).date;
  }

  return { parts, localToIso, dayRange, isoToLocal, addDays };
}
