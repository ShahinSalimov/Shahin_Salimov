// Instagram lead botu: şərhdə açar söz → DM (private reply) → nömrə toplanır → Telegram-a ötürülür.
// Meta Graph API (rəsmi). Webhook: /webhooks/instagram
import crypto from 'node:crypto';

// Azərbaycan nömrəsini tapıb +994XXXXXXXXX formatına salır
export function extractPhone(text) {
  const m = String(text || '').match(/(?:\+?994|\b0)?[\s\-().]*(\d{2})[\s\-().]*(\d{3})[\s\-.]*(\d{2})[\s\-.]*(\d{2})\b/);
  if (!m) return null;
  return `+994${m[1]}${m[2]}${m[3]}${m[4]}`;
}

// Hərf fərqlərini aradan qaldırır: RIVIERA = riviera = RİVİERA, İPHONE = iphone
const norm = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ı/g, 'i');

export function findCampaign(campaigns, text) {
  const words = new Set(norm(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  return campaigns.find((c) => words.has(norm(c.keyword))) || null;
}

export function verifySignature(rawBody, header, appSecret) {
  if (!appSecret) return false;
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const got = header.slice(7);
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export function makeInstagram({ db, config, notify, fetchImpl = fetch, logger = console }) {
  const { graphHost, graphVersion, igUserId, accessToken } = config.meta;
  const configured = Boolean(igUserId && accessToken);
  const base = `https://${graphHost}/${graphVersion}`;
  const metrics = config.meta.insightMetrics || 'reach,likes,comments,shares,saved';

  async function graph(path, { method = 'GET', body } = {}) {
    const url = new URL(`${base}/${path}`);
    if (method === 'GET') url.searchParams.set('access_token', accessToken);
    const res = await fetchImpl(url, method === 'GET' ? {} : {
      method, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, access_token: accessToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(`Graph API: ${data.error?.message || res.status}`);
    return data;
  }

  const privateReply = (commentId, text) => graph(`${igUserId}/messages`, { method: 'POST', body: { recipient: { comment_id: commentId }, message: { text } } });
  const sendDM = (igsid, text) => graph(`${igUserId}/messages`, { method: 'POST', body: { recipient: { id: igsid }, message: { text } } });

  async function onComment(v) {
    const fromId = v?.from?.id;
    if (!v?.id || !fromId || fromId === igUserId) return null;
    const campaign = findCampaign(db.activeCampaigns(), v.text);
    if (!campaign) return null;
    const { lead, created } = db.upsertLead({
      campaign_id: campaign.id, ig_user_id: fromId, username: v.from.username || '', comment_id: v.id, comment_text: v.text || '',
    });
    if (!created) return lead;
    try {
      await privateReply(v.id, `${campaign.dm_text}\n\n${campaign.ask_phone_text}`);
      return db.updateLead(lead.id, { status: 'dm_sent' });
    } catch (e) {
      logger.error('DM göndərilmədi:', e.message);
      return lead;
    }
  }

  async function onMessage(senderId, text) {
    const lead = db.pendingLeadFor(senderId);
    if (!lead) return null;
    const campaign = db.getCampaign(lead.campaign_id);
    const phone = extractPhone(text);
    if (!phone) {
      if (!lead.asked_again) {
        db.updateLead(lead.id, { asked_again: 1 });
        await sendDM(senderId, campaign.ask_phone_text).catch((e) => logger.error(e.message));
      }
      return lead;
    }
    const name = String(text).replace(/[+\d\s\-().]{7,}/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    const updated = db.updateLead(lead.id, { phone, name, status: 'forwarded' });
    await sendDM(senderId, campaign.thanks_text).catch((e) => logger.error(e.message));
    const msg = `Yeni alıcı (${campaign.keyword}):\nAd: ${name || '—'}\nTelefon: ${phone}\nInstagram: ${updated.username ? '@' + updated.username : senderId}\nŞərh: ${updated.comment_text}`;
    if (campaign.forward_chat_id) await notify.chat(campaign.forward_chat_id, msg);
    else await notify.team(msg);
    return updated;
  }

  async function handleWebhook(body) {
    const handled = [];
    for (const entry of body?.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === 'comments') handled.push(await onComment(change.value));
      }
      for (const m of entry.messaging || []) {
        if (m.message && !m.message.is_echo && m.sender?.id && m.sender.id !== igUserId) handled.push(await onMessage(m.sender.id, m.message.text || ''));
      }
    }
    return handled.filter(Boolean);
  }

  return {
    configured,
    handleWebhook,
    profile: () => graph(`${igUserId}?fields=followers_count,media_count,username`),
    async mediaInsights(mediaId) {
      const data = await graph(`${mediaId}/insights?metric=${encodeURIComponent(metrics)}`);
      return Object.fromEntries((data.data || []).map((m) => [m.name, m.values?.[0]?.value ?? m.total_value?.value ?? '']));
    },
  };
}
