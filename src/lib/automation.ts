import { all, get, run, sql } from './db';
import { uid, nowIso } from './ids';
import { getAIProvider } from './ai';
import { sendWhatsApp, isWhatsAppConfigured } from './whatsapp';
import { isOptOut } from './text';
import { queueEmail, flushEmailOutbox, notifyOwner, emailOn, isValidEmail, formatWhen } from './messaging';
import { recordRun } from './runs';
export { recordRun } from './runs';

export type EngineResult = { processed: number; actions: string[]; errors: string[] };

/**
 * Core automation tick. Called by /api/cron/tick (every few minutes) and
 * inline after lead creation for instant response. Never throws — logs instead.
 * All actions are one-shot (state transitions / NOT EXISTS guards), so the
 * endpoint is safe to call frequently and is rate-limited at the route.
 */
export async function runAutomationTick(businessId?: string): Promise<EngineResult> {
  const actions: string[] = [];
  const errors: string[] = [];
  try {
    const bizFilter = businessId ? `AND l.business_id='${businessId.replace(/'/g, '')}'` : '';
    // 1) Instant replies for brand-new leads with no AI message yet
    const fresh = await all<{
      id: string; business_id: string; name: string; email: string; phone: string;
      service: string; business_name: string;
    }>(`
      SELECT l.id, l.business_id, l.name, l.email, l.phone, l.service, b.name AS business_name
      FROM leads l JOIN businesses b ON b.id = l.business_id
      WHERE NOT EXISTS (SELECT 1 FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.lead_id = l.id AND m.sender IN ('ai','owner'))
      ${bizFilter} ORDER BY l.created_at DESC LIMIT 25`);
    for (const lead of fresh) {
      try {
        await instantReply(lead.business_id, lead.id);
        actions.push(`instant-reply:${lead.id}`);
      } catch (e) {
        errors.push(`instant ${lead.id}: ${e instanceof Error ? e.message : 'failed'}`);
        await recordRun(lead.business_id, '', 'Instant AI response', 'lead.created', lead.id, [], 'failed', String(e));
      }
    }

    // 2) Due follow-ups: leads with next_followup_at <= now and no recent inbound
    const due = await all<{ id: string; business_id: string; name: string; service: string; business_name: string; followups_sent: number }>(`
      SELECT l.id, l.business_id, l.name, l.service, b.name AS business_name,
        COUNT(m.id) AS followups_sent
      FROM leads l
      JOIN businesses b ON b.id=l.business_id
      LEFT JOIN conversations c ON c.lead_id=l.id
      LEFT JOIN messages m ON m.conversation_id=c.id AND m.sender IN ('ai','owner')
      WHERE l.status NOT IN ('Won','Lost','Completed','Appointment Booked') AND l.next_followup_at IS NOT NULL
        AND l.next_followup_at <= '${nowIso()}' ${bizFilter}
      GROUP BY l.id, l.business_id, l.name, l.service, b.name LIMIT 25`);
    for (const lead of due) {
      try {
        const sent = Number(lead.followups_sent ?? 1);
        if (sent >= 4) {
          await run(`UPDATE leads SET status='No Response', next_followup_at=NULL WHERE id=?`, lead.id);
          await recordRun(lead.business_id, '', 'No-reply chase', 'lead.no_reply', lead.id, [{ marked: 'No Response' }], 'ok', '');
          actions.push(`mark-no-response:${lead.id}`);
        } else {
          await sendFollowup(lead.business_id, lead.id, sent);
          actions.push(`followup:${lead.id}#${sent}`);
        }
      } catch (e) {
        errors.push(`followup ${lead.id}: ${e instanceof Error ? e.message : 'failed'}`);
      }
    }

    // 3) Reminders: appointments starting in ~24h or ~2h without reminder sent
    const rems = await all<{ id: string; business_id: string; customer_name: string; service: string; starts_at: string; lead_email: string; settings_json: string }>(`
      SELECT a.id, a.business_id, a.customer_name, a.service, a.starts_at,
             COALESCE(l.email, '') AS lead_email, b.settings_json
      FROM appointments a
      JOIN businesses b ON b.id = a.business_id
      LEFT JOIN leads l ON l.id = a.lead_id
      WHERE a.status='booked' AND (
        (a.starts_at BETWEEN ${sql.now()} AND ${sql.plusHours(25)} AND NOT EXISTS (SELECT 1 FROM automation_runs r WHERE r.lead_id=a.id AND r.trigger='reminder.24h'))
        OR (a.starts_at BETWEEN ${sql.now()} AND ${sql.plusMinutes(130)} AND NOT EXISTS (SELECT 1 FROM automation_runs r WHERE r.lead_id=a.id AND r.trigger='reminder.2h'))
      ) ${businessId ? `AND a.business_id='${businessId.replace(/'/g, '')}'` : ''} LIMIT 20`);
    for (const a of rems) {
      const when = (new Date(a.starts_at).getTime() - Date.now()) < 3 * 3600000 ? 'reminder.2h' : 'reminder.24h';
      await recordRun(a.business_id, '', 'Booking reminders', when, a.id,
        [{ to: a.customer_name, text: `Reminder: ${a.service} at ${formatWhen(a.starts_at)}. Reply RESCHEDULE to move it.` }], 'ok', '');
      if (a.lead_email && isValidEmail(a.lead_email) && emailOn(a.settings_json, 'emailReminders')) {
        try {
          await queueEmail(a.business_id, a.lead_email, `Reminder: ${a.service} appointment`,
            `Hi ${first(a.customer_name)}, a quick reminder about your ${a.service} appointment on ${formatWhen(a.starts_at)}.\n\nReply RESCHEDULE to move it, CANCEL to release the slot.`);
        } catch (e) {
          await recordRun(a.business_id, '', 'Booking reminders', when, a.id, [], 'failed', `email: ${e instanceof Error ? e.message : 'failed'}`);
        }
      }
      actions.push(`${when}:${a.id}`);
    }

    // 4) Review requests: completed appointments past review delay without request
    const done = await all<{ id: string; business_id: string; lead_id: string; customer_name: string; lead_email: string; business_name: string; settings_json: string }>(`
      SELECT a.id, a.business_id, COALESCE(a.lead_id,'') AS lead_id, a.customer_name,
             COALESCE(l.email, '') AS lead_email, b.name AS business_name, b.settings_json
      FROM appointments a
      JOIN businesses b ON b.id = a.business_id
      LEFT JOIN leads l ON l.id = a.lead_id
      WHERE a.status='completed' AND NOT EXISTS (SELECT 1 FROM review_requests r WHERE r.lead_id=a.id)
      ${businessId ? `AND a.business_id='${businessId.replace(/'/g, '')}'` : ''} LIMIT 20`);
    for (const a of done) {
      await run(`INSERT INTO review_requests (id, business_id, lead_id, destination, status) VALUES (?, ?, ?, 'google', 'sent')`,
        uid('rev'), a.business_id, a.lead_id || a.id);
      let channel = 'log only';
      if (a.lead_email && isValidEmail(a.lead_email) && emailOn(a.settings_json, 'emailReviews')) {
        try {
          let link = '';
          try { link = String(JSON.parse(a.settings_json || '{}').reviewLink || ''); } catch { link = ''; }
          await queueEmail(a.business_id, a.lead_email, `How was your visit to ${a.business_name}?`,
            `Hi ${first(a.customer_name)} — thanks for choosing ${a.business_name}! A 30-second review helps us a lot.${link ? `\n\nLeave a review: ${link}` : ''}\n\nReply STOP to opt out.`);
          channel = 'email';
        } catch (e) {
          await recordRun(a.business_id, '', 'Review request', 'review.send', a.lead_id || a.id, [], 'failed', `email: ${e instanceof Error ? e.message : 'failed'}`);
        }
      }
      await recordRun(a.business_id, '', 'Review request', 'review.send', a.lead_id || a.id, [{ channel }], 'ok', '');
      actions.push(`review:${a.id}`);
    }

    // 5) Email outbox retry pass (mock mode marks mock; Resend delivers live)
    try {
      const f = await flushEmailOutbox();
      if (f.sent || f.failed) actions.push(`email-flush:sent=${f.sent},failed=${f.failed}`);
    } catch (e) {
      errors.push(`email flush: ${e instanceof Error ? e.message : 'failed'}`);
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'tick failed');
  }
  return { processed: actions.length, actions, errors };
}

export async function instantReply(businessId: string, leadId: string): Promise<void> {
  const lead = await get<Record<string, string | number>>(`SELECT * FROM leads WHERE id=? AND business_id=?`, leadId, businessId);
  if (!lead) throw new Error('lead not found');
  const biz = await get<{ name: string; settings_json: string }>(`SELECT name, settings_json FROM businesses WHERE id=?`, businessId);
  const services = await all<{ name: string; price: number }>(`SELECT name, price FROM services WHERE business_id=? AND active=1`, businessId);
  const knowledge = await all<{ title: string; body: string }>(`SELECT title, body FROM knowledge_entries WHERE business_id=? LIMIT 20`, businessId);
  const lastMsg = await get<{ body: string }>(`
    SELECT m.body FROM messages m JOIN conversations c ON c.id=m.conversation_id
    WHERE c.lead_id=? AND m.sender='lead' ORDER BY m.created_at DESC LIMIT 1`, leadId);
  const ai = getAIProvider();
  const input = {
    name: String(lead.name || ''), email: String(lead.email || ''), phone: String(lead.phone || ''),
    service: String(lead.service || ''), message: lastMsg?.body ?? String(lead.service || ''),
    businessName: biz?.name ?? 'our business',
    services: services.map((s) => ({ name: s.name, price: Number(s.price) })),
    knowledge: knowledge.map((k) => ({ title: k.title, body: k.body })),
  };
  const c = await ai.classify(input);
  const reply = await ai.draftReply(input, c);

  // Guardrail: never invent price — strip ₹/numbers unless matched to a configured service
  let body = reply.body;
  const priceKnown = services.some((s) => body.includes(String(Math.round(Number(s.price)))) || body.toLowerCase().includes(s.name.toLowerCase()));
  if (!priceKnown) body = body.replace(/₹[\d,]+/g, 'our listed price');

  const conv = await ensureConversation(businessId, leadId);
  await run(`INSERT INTO messages (id, business_id, conversation_id, sender, body, meta_json) VALUES (?, ?, ?, 'ai', ?, ?)`,
    uid('m'), businessId, conv, body, JSON.stringify({ confidence: reply.confidence, model: ai.name }));
  await run(`UPDATE leads SET status='Contacted', score=?, value=?, urgency=?, intent=?, quality=?, conversion_prob=?, ai_summary=?, last_interaction_at=?, next_followup_at=? WHERE id=?`,
    scoreOf(c.quality), c.value, c.urgency, c.intent, c.quality, c.conversionProb, c.summary, nowIso(),
    (c.outOfScope || reply.confidence < 0.4) ? null : minutesFromNow(15), leadId);
  await run(`UPDATE conversations SET updated_at=? WHERE id=?`, nowIso(), conv);

  // WhatsApp twin of the instant reply (gated on config + lead phone).
  if (lead.phone && isWhatsAppConfigured()) {
    try { await sendWhatsApp(String(lead.phone), body); }
    catch { /* best effort */ }
  }

  if (c.outOfScope || reply.confidence < 0.4) {
    await run(`UPDATE conversations SET status='paused' WHERE id=?`, conv);
    await recordRun(businessId, '', 'Escalation on low confidence', 'message.low_confidence', leadId,
      [{ escalated: true, draft: body.slice(0, 300) }], 'ok', '');
    try {
      await notifyOwner(businessId, `AI paused — needs your review${lead.name ? ` (${lead.name})` : ''}`,
        `The AI draft was paused for low confidence:\n\n"${body.slice(0, 400)}"\n\nOpen Conversations to take over the chat.`);
    } catch (e) {
      await recordRun(businessId, '', 'Owner alert', 'message.low_confidence', leadId, [], 'failed', e instanceof Error ? e.message : 'failed');
    }
  } else {
    await recordRun(businessId, '', 'Instant AI response', 'lead.created', leadId,
      [{ reply: body.slice(0, 300), responseSec: '~10s (mock)' }], 'ok', '');
  }
}

async function sendFollowup(businessId: string, leadId: string, sentCount: number): Promise<void> {
  const lead = await get<{ name: string; service: string; email: string; phone: string }>(`SELECT name, service, email, phone FROM leads WHERE id=? AND business_id=?`, leadId, businessId);
  const biz = await get<{ name: string; settings_json: string }>(`SELECT name, settings_json FROM businesses WHERE id=?`, businessId);
  const templates = [
    `Hi ${first(lead?.name)} — thanks for reaching out about ${lead?.service || 'our service'}. What date and time suit you? — ${biz?.name}`,
    `Still interested in ${lead?.service || 'booking'}? I can hold two slots for you — just reply YES with a time. — ${biz?.name}`,
    `No pressure — want me to close this for now? Reply LATER to keep your spot. STOP to opt out. — ${biz?.name}`,
  ];
  const body = templates[Math.min(sentCount - 1, 2)];
  const conv = await ensureConversation(businessId, leadId);
  await run(`INSERT INTO messages (id, business_id, conversation_id, sender, body, meta_json) VALUES (?, ?, ?, 'ai', ?, ?)`,
    uid('m'), businessId, conv, body, JSON.stringify({ template: `followup_${sentCount}` }));
  const nextMin = sentCount === 1 ? 360 : sentCount === 2 ? 1440 : 0;
  await run(`UPDATE leads SET last_interaction_at=?, next_followup_at=? WHERE id=?`,
    nowIso(), nextMin ? minutesFromNow(nextMin) : null, leadId);
  await run(`UPDATE conversations SET updated_at=? WHERE id=?`, nowIso(), conv);
  await recordRun(businessId, '', 'No-reply chase', 'lead.no_reply', leadId, [{ template: `followup_${sentCount}`, body }], 'ok', '');
  // Email twin of the in-app follow-up (gated by emailFollowups setting, default on)
  if (lead?.email && isValidEmail(lead.email) && emailOn(biz?.settings_json, 'emailFollowups')) {
    try {
      await queueEmail(businessId, lead.email,
        biz?.name ? `${biz.name}: quick follow-up` : 'Quick follow-up',
        `${body}\n\nReply STOP to opt out.`);
    } catch (e) {
      await recordRun(businessId, '', 'No-reply chase', 'lead.no_reply', leadId, [], 'failed', `email: ${e instanceof Error ? e.message : 'failed'}`);
    }
  }
  // WhatsApp twin of the in-app follow-up (gated on config + lead phone).
  if (lead?.phone && isWhatsAppConfigured()) {
    try { await sendWhatsApp(lead.phone, `${body}\n\nReply STOP to opt out.`); }
    catch (e) { await recordRun(businessId, '', 'No-reply chase', 'lead.no_reply', leadId, [], 'failed', `whatsapp: ${e instanceof Error ? e.message : 'failed'}`); }
  }
}

export async function ensureConversation(businessId: string, leadId: string): Promise<string> {
  // Tenant isolation: the lead must belong to this business and the conversation
  // lookup must be scoped — otherwise a caller could link to another tenant's
  // conversation or attach a conversation to a foreign lead.
  const lead = await get<{ id: string }>(`SELECT id FROM leads WHERE id=? AND business_id=?`, leadId, businessId);
  if (!lead) throw new Error('lead_not_found');
  const ex = await get<{ id: string }>(`SELECT id FROM conversations WHERE lead_id=? AND business_id=?`, leadId, businessId);
  if (ex) return ex.id;
  const id = uid('conv');
  await run(`INSERT INTO conversations (id, business_id, lead_id, status) VALUES (?, ?, ?, 'ai')`, id, businessId, leadId);
  return id;
}

function minutesFromNow(min: number): string {
  return new Date(Date.now() + min * 60000).toISOString();
}
function scoreOf(q: string): number {
  return q === 'hot' ? 85 : q === 'warm' ? 60 : 35;
}
function first(n?: string): string {
  return (n || 'there').split(' ')[0] || 'there';
}

export async function handleInboundText(businessId: string, leadId: string, text: string): Promise<{ optedOut: boolean }> {
  if (isOptOut(text)) {
    await run(`UPDATE leads SET status='Lost', next_followup_at=NULL WHERE id=?`, leadId);
    await recordRun(businessId, '', 'Opt-out', 'message.optout', leadId, [{ text: text.slice(0, 200) }], 'ok', '');
    return { optedOut: true };
  }
  return { optedOut: false };
}
