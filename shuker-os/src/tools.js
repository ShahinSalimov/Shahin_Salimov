// AI köməkçinin istifadə etdiyi əməliyyatlar (tool-lar).
// Hər tool: Claude üçün təsvir + sxem, rol icazəsi və icra funksiyası.
import { STAGES, STAGE_NAMES } from './db.js';

const S = (description, extra = {}) => ({ type: 'string', description, ...extra });
const N = (description) => ({ type: 'number', description });
const I = (description) => ({ type: 'integer', description });
const B = (description) => ({ type: 'boolean', description });
const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

const stageEnum = { enum: STAGES };

// Rollar: owner (Şükran), manager (komanda rəhbəri), member (komanda üzvü)
export function canSeeFinance(role, financeAccess = 'none') {
  return role === 'owner' || (role === 'manager' && financeAccess === 'manager');
}

export function sanitizeDeal(deal, role, financeAccess) {
  if (!deal) return deal;
  const d = { ...deal, stage_name: STAGE_NAMES[deal.stage] || deal.stage };
  if (!canSeeFinance(role, financeAccess)) { delete d.price; delete d.paid; delete d.paid_at; }
  return d;
}

export const TOOL_DEFS = [
  {
    name: 'list_deals', roles: ['owner', 'manager', 'member'],
    description: 'Reklam əməkdaşlıqlarının (deal) siyahısı. Mərhələyə, ödənilməmişlərə və ya brend adına görə süzmək olar.',
    input_schema: obj({ stage: S('Mərhələ', stageEnum), unpaid_only: B('Yalnız ödənilməmiş aktiv reklamlar'), search: S('Brend adında axtarış') }),
  },
  {
    name: 'create_deal', roles: ['owner', 'manager', 'member'],
    description: 'Yeni reklam təklifi və ya razılaşma yaradır. Yeni gələn təkliflər "sorgu" mərhələsində yaradılır.',
    input_schema: obj({
      brand: S('Brendin adı'), category: S('Sahə: Əmlak, Market, Restoran, Avto, İdman, Geyim, Texnologiya, Digər'),
      business: S('Hansı iş istiqamətinə aiddir (default: Reklam)'),
      deliverables: S('Format, məs. "1 reels + 2 story"'), price: N('Məbləğ, AZN'), stage: S('Mərhələ', stageEnum),
      contact: S('Brenddə əlaqə şəxsi / telefon'), notes: S('Qeyd'), due_date: S('Ödəniş tarixi, YYYY-MM-DD'),
    }, ['brand', 'category']),
  },
  {
    name: 'update_deal', roles: ['owner', 'manager', 'member'],
    description: 'Mövcud reklamı yeniləyir: mərhələ, məbləğ, ödəniş statusu, qeyd, paylaşım vaxtı, Instagram media ID.',
    input_schema: obj({
      id: I('Reklamın ID-si'), stage: S('Yeni mərhələ', stageEnum), price: N('Məbləğ, AZN'), paid: B('Ödənilib?'),
      deliverables: S('Format'), notes: S('Qeyd'), due_date: S('Ödəniş tarixi, YYYY-MM-DD'),
      publish_at: S('Paylaşım vaxtı, yerli: YYYY-MM-DD HH:MM'), ig_media_id: S('Paylaşılan postun Instagram media ID-si'),
    }, ['id']),
  },
  {
    name: 'evaluate_offer', roles: ['owner', 'manager'],
    description: 'Təklifi qiymətləndirmək üçün məlumat: eyni sahədə keçmiş reklamların sayı və qiymətləri, bu brendlə keçmiş iş. Rəqəmləri yalnız buradan götür.',
    input_schema: obj({ id: I('Təklifin (deal) ID-si') }, ['id']),
  },
  {
    name: 'list_events', roles: ['owner', 'manager', 'member'],
    description: 'Təqvimdəki hadisələr (çəkiliş, paylaşım, görüş, səfər) verilmiş tarix aralığında. Tarixlər yerli, daxil olmaqla.',
    input_schema: obj({ from_date: S('YYYY-MM-DD'), to_date: S('YYYY-MM-DD') }, ['from_date', 'to_date']),
  },
  {
    name: 'add_event', roles: ['owner', 'manager', 'member'],
    description: 'Təqvimə hadisə əlavə edir. Üst-üstə düşən hadisələri qaytarır, onları istifadəçiyə mütləq de.',
    input_schema: obj({
      title: S('Başlıq, məs. "Chaidan · çəkiliş"'), start_local: S('Başlama vaxtı, yerli: YYYY-MM-DD HH:MM'),
      duration_min: I('Müddət, dəqiqə (default 60)'), location: S('Yer'), category: S('Sahə'),
      deal_id: I('Bağlı reklamın ID-si'), notes: S('Qeyd'),
    }, ['title', 'start_local']),
  },
  {
    name: 'update_event', roles: ['owner', 'manager', 'member'],
    description: 'Hadisənin vaxtını, müddətini, başlığını və ya yerini dəyişir.',
    input_schema: obj({ id: I('Hadisənin ID-si'), start_local: S('Yeni vaxt, YYYY-MM-DD HH:MM'), duration_min: I('Müddət'), title: S('Başlıq'), location: S('Yer') }, ['id']),
  },
  {
    name: 'delete_event', roles: ['owner', 'manager'],
    description: 'Hadisəni təqvimdən silir. Yalnız istifadəçi açıq şəkildə silməyi istəyəndə istifadə et.',
    input_schema: obj({ id: I('Hadisənin ID-si') }, ['id']),
  },
  {
    name: 'finance_summary', roles: ['owner', 'manager'], finance: true,
    description: 'Ay üzrə daxil olan gəlir, sahələr üzrə bölgü və gözlənilən ödənişlər.',
    input_schema: obj({ month: S('YYYY-MM (default: cari ay)') }),
  },
  {
    name: 'create_task', roles: ['owner', 'manager', 'member'],
    description: 'Komanda üçün tapşırıq yaradır və komanda çatına göndərir. Brendə yazılacaq mesaj lazımdırsa, hazır mətni title-a daxil et.',
    input_schema: obj({ title: S('Tapşırığın mətni'), assignee: S('Kimə (ad)'), deal_id: I('Bağlı reklam'), due_local: S('Son müddət, YYYY-MM-DD HH:MM') }, ['title']),
  },
  {
    name: 'list_tasks', roles: ['owner', 'manager', 'member'],
    description: 'Açıq tapşırıqların siyahısı.',
    input_schema: obj({}),
  },
  {
    name: 'complete_task', roles: ['owner', 'manager', 'member'],
    description: 'Tapşırığı bitmiş kimi qeyd edir.',
    input_schema: obj({ id: I('Tapşırığın ID-si') }, ['id']),
  },
  {
    name: 'notify_team', roles: ['owner', 'manager'],
    description: 'Komanda çatına mesaj göndərir.',
    input_schema: obj({ text: S('Mesaj') }, ['text']),
  },
  {
    name: 'create_campaign', roles: ['owner', 'manager'],
    description: 'Instagram lead kampaniyası yaradır: şərhdə açar söz yazana bot DM göndərir və nömrəsini toplayır.',
    input_schema: obj({
      keyword: S('Açar söz, məs. RIVIERA'), dm_text: S('DM-də göndəriləcək mətn (broşür linki, qısa məlumat)'),
      title: S('Kampaniya adı'), deal_id: I('Bağlı reklam'), forward_chat_id: S('Lead-lərin göndəriləcəyi Telegram chat ID (developerin satış komandası)'),
    }, ['keyword', 'dm_text']),
  },
  {
    name: 'campaign_stats', roles: ['owner', 'manager', 'member'],
    description: 'Lead kampaniyalarının nəticələri: şərh, DM, toplanan nömrə sayı.',
    input_schema: obj({}),
  },
];

// Sadə sxem yoxlaması (Claude-un göndərdiyi input-u icradan əvvəl yoxlayırıq)
export function validateInput(schema, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'input obyekt olmalıdır';
  for (const r of schema.required || []) if (input[r] === undefined || input[r] === null || input[r] === '') return `"${r}" tələb olunur`;
  for (const [k, v] of Object.entries(input)) {
    const p = schema.properties[k];
    if (!p) return `naməlum sahə: ${k}`;
    if (v === null) continue;
    if (p.type === 'string' && typeof v !== 'string') return `${k} mətn olmalıdır`;
    if (p.type === 'number' && typeof v !== 'number') return `${k} rəqəm olmalıdır`;
    if (p.type === 'integer' && !Number.isInteger(v)) return `${k} tam ədəd olmalıdır`;
    if (p.type === 'boolean' && typeof v !== 'boolean') return `${k} true/false olmalıdır`;
    if (p.enum && !p.enum.includes(v)) return `${k} bunlardan biri olmalıdır: ${p.enum.join(', ')}`;
  }
  return null;
}

export function toolsForRole(role, financeAccess = 'none') {
  return TOOL_DEFS
    .filter((t) => t.roles.includes(role))
    .filter((t) => !t.finance || canSeeFinance(role, financeAccess))
    .map(({ name, description, input_schema }) => ({ name, description, input_schema }));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ctx: { db, time, user: {id, name, role}, financeAccess, notifyTeam(text), onOfferCreated(deal) }
export async function executeTool(name, input, ctx) {
  const def = TOOL_DEFS.find((t) => t.name === name);
  if (!def) return { error: `Naməlum tool: ${name}` };
  const { db, time, user } = ctx;
  if (!def.roles.includes(user.role) || (def.finance && !canSeeFinance(user.role, ctx.financeAccess))) {
    return { error: 'Bu əməliyyat üçün icazəniz yoxdur' };
  }
  const bad = validateInput(def.input_schema, input);
  if (bad) return { error: bad };
  const fin = canSeeFinance(user.role, ctx.financeAccess);
  const clean = (d) => sanitizeDeal(d, user.role, ctx.financeAccess);

  switch (name) {
    case 'list_deals':
      return { deals: db.listDeals({ stage: input.stage, unpaidOnly: input.unpaid_only, search: input.search, limit: 50 }).map(clean) };

    case 'create_deal': {
      if (input.due_date && !DATE_RE.test(input.due_date)) return { error: 'due_date formatı: YYYY-MM-DD' };
      if (!fin && input.price !== undefined) delete input.price;
      const deal = db.createDeal({ ...input, stage: input.stage || 'sorgu', created_by: user.name });
      if (deal.stage === 'sorgu' && ctx.onOfferCreated) await ctx.onOfferCreated(deal, user);
      return { created: clean(deal) };
    }

    case 'update_deal': {
      const deal = db.getDeal(input.id);
      if (!deal) return { error: `Reklam tapılmadı: ${input.id}` };
      const patch = { ...input };
      delete patch.id;
      if (!fin) { delete patch.price; delete patch.paid; }
      if (patch.due_date && !DATE_RE.test(patch.due_date)) return { error: 'due_date formatı: YYYY-MM-DD' };
      if (patch.publish_at) {
        const iso = time.localToIso(patch.publish_at);
        if (!iso) return { error: 'publish_at formatı: YYYY-MM-DD HH:MM' };
        patch.publish_at = iso;
      }
      if (patch.paid === false) patch.paid_at = null;
      return { updated: clean(db.updateDeal(input.id, patch)) };
    }

    case 'evaluate_offer': {
      const deal = db.getDeal(input.id);
      if (!deal) return { error: `Təklif tapılmadı: ${input.id}` };
      const stats = db.categoryStats(deal.category);
      const history = db.findDealsByBrand(deal.brand).filter((d) => d.id !== deal.id)
        .map((d) => ({ id: d.id, stage: d.stage, price: fin ? d.price : undefined, deliverables: d.deliverables }));
      return {
        offer: clean(deal),
        category_history: fin ? stats : { count: stats.count },
        same_brand_history: history,
        note: stats.count ? null : 'Bu sahədə keçmiş məlumat yoxdur, qiymət tövsiyəsi üçün kifayət qədər data yoxdur.',
      };
    }

    case 'list_events': {
      if (!DATE_RE.test(input.from_date) || !DATE_RE.test(input.to_date)) return { error: 'Tarix formatı: YYYY-MM-DD' };
      const from = time.dayRange(input.from_date).start;
      const to = time.dayRange(input.to_date).end;
      return { events: db.listEvents(from, to).map((e) => ({ ...e, start_local: time.isoToLocal(e.starts_at) })) };
    }

    case 'add_event': {
      const iso = time.localToIso(input.start_local);
      if (!iso) return { error: 'start_local formatı: YYYY-MM-DD HH:MM' };
      const duration = input.duration_min || 60;
      const conflicts = db.overlapping(iso, duration).map((e) => ({ id: e.id, title: e.title, start_local: time.isoToLocal(e.starts_at) }));
      const ev = db.createEvent({
        title: input.title, starts_at: iso, duration_min: duration, location: input.location || '',
        category: input.category || '', deal_id: input.deal_id ?? null, notes: input.notes || '', created_by: user.name,
      });
      return { created: { ...ev, start_local: time.isoToLocal(ev.starts_at) }, conflicts };
    }

    case 'update_event': {
      const ev = db.getEvent(input.id);
      if (!ev) return { error: `Hadisə tapılmadı: ${input.id}` };
      const patch = {};
      if (input.start_local) {
        const iso = time.localToIso(input.start_local);
        if (!iso) return { error: 'start_local formatı: YYYY-MM-DD HH:MM' };
        patch.starts_at = iso; patch.reminded = 0;
      }
      for (const k of ['duration_min', 'title', 'location']) if (input[k] !== undefined) patch[k] = input[k];
      const updated = db.updateEvent(input.id, patch);
      const conflicts = db.overlapping(updated.starts_at, updated.duration_min, updated.id)
        .map((e) => ({ id: e.id, title: e.title, start_local: time.isoToLocal(e.starts_at) }));
      return { updated: { ...updated, start_local: time.isoToLocal(updated.starts_at) }, conflicts };
    }

    case 'delete_event': {
      const ev = db.getEvent(input.id);
      if (!ev) return { error: `Hadisə tapılmadı: ${input.id}` };
      db.deleteEvent(input.id);
      return { deleted: { id: ev.id, title: ev.title } };
    }

    case 'finance_summary': {
      const month = input.month || time.parts().date.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) return { error: 'month formatı: YYYY-MM' };
      const fromIso = time.localToIso(`${month}-01 00:00`);
      const [y, m] = month.split('-').map(Number);
      const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
      const toIso = time.localToIso(`${next}-01 00:00`);
      return { month, ...db.finance({ fromIso, toIso }) };
    }

    case 'create_task': {
      let dueIso = null;
      if (input.due_local) { dueIso = time.localToIso(input.due_local); if (!dueIso) return { error: 'due_local formatı: YYYY-MM-DD HH:MM' }; }
      const task = db.createTask({ title: input.title, assignee: input.assignee || '', deal_id: input.deal_id ?? null, due_at: dueIso, created_by: user.name });
      const delivered = ctx.notifyTeam ? await ctx.notifyTeam(`Yeni tapşırıq #${task.id}${task.assignee ? ` (${task.assignee})` : ''}:\n${task.title}${dueIso ? `\nSon müddət: ${time.isoToLocal(dueIso)}` : ''}`) : false;
      return { created: task, sent_to_team_chat: Boolean(delivered) };
    }

    case 'list_tasks':
      return { tasks: db.listTasks().map((t) => ({ ...t, due_local: t.due_at ? time.isoToLocal(t.due_at) : null })) };

    case 'complete_task':
      db.completeTask(input.id);
      return { completed: input.id };

    case 'notify_team': {
      const delivered = ctx.notifyTeam ? await ctx.notifyTeam(input.text) : false;
      return delivered ? { sent: true } : { error: 'Komanda çatı qoşulmayıb (TEAM_CHAT_ID)' };
    }

    case 'create_campaign': {
      try {
        return { created: db.createCampaign(input) };
      } catch (e) {
        return { error: /UNIQUE/.test(e.message) ? 'Bu açar sözlə kampaniya artıq var' : e.message };
      }
    }

    case 'campaign_stats':
      return { campaigns: db.listCampaigns().map(({ id, keyword, title, active, comments, dms, phones }) => ({ id, keyword, title, active, comments, dms, phones })) };

    default:
      return { error: `İcra olunmayan tool: ${name}` };
  }
}
