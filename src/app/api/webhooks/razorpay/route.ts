import { NextRequest } from 'next/server';
import { json, guard } from '@/lib/api';
import { run } from '@/lib/db';
import { uid } from '@/lib/ids';
import { razorpayEnv, verifyRazorpaySignature } from '@/lib/razorpay';

/**
 * Razorpay webhooks: subscription.activated/charged/halted/cancelled, payment.failed.
 * Verified with HMAC-SHA256 signature. Subscription notes carry { businessId, plan }.
 */
export const POST = guard(async (req: NextRequest) => {
  const raw = await req.text();
  const sig = req.headers.get('x-razorpay-signature') ?? '';
  const { webhookSecret } = razorpayEnv();
  let body: { event?: string; payload?: { subscription?: { entity?: Record<string, unknown> }; payment?: { entity?: Record<string, unknown> } } } = {};
  try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }

  if (!webhookSecret) {
    await run(`INSERT INTO webhook_events (id, source, type, payload_json, status, error) VALUES (?, ?, ?, ?, ?, ?)`,
      uid('wh'), 'razorpay', body.event ?? 'unknown', raw.slice(0, 2000), 'skipped', 'no RAZORPAY_WEBHOOK_SECRET');
    return json({ ok: true, mock: true });
  }
  if (!verifyRazorpaySignature(raw, sig, webhookSecret)) {
    await run(`INSERT INTO webhook_events (id, source, type, payload_json, status, error) VALUES (?, ?, ?, ?, ?, ?)`,
      uid('wh'), 'razorpay', body.event ?? 'unknown', raw.slice(0, 2000), 'failed', 'bad signature');
    return json({ error: 'Bad signature' }, 400);
  }

  const event = body.event ?? '';
  const entity = body.payload?.subscription?.entity ?? {};
  const notes = (entity.notes ?? {}) as { businessId?: string; plan?: string };
  const biz = notes.businessId ?? '';
  const plan = notes.plan ?? 'growth';
  try {
    if (event === 'subscription.activated' && biz) {
      await run(`UPDATE subscriptions SET plan=?, status='active' WHERE business_id=?`, plan, biz);
      await run(`INSERT INTO invoices (id, business_id, amount, currency, status) VALUES (?, ?, ?, 'INR', 'paid')`,
        uid('inv'), biz, 0);
    } else if (event === 'subscription.charged' && biz) {
      const paidPaise = Number(body.payload?.payment?.entity?.amount ?? 0);
      await run(`INSERT INTO invoices (id, business_id, amount, currency, status) VALUES (?, ?, ?, 'INR', 'paid')`,
        uid('inv'), biz, Math.round(paidPaise / 100));
      await run(`UPDATE subscriptions SET status='active' WHERE business_id=?`, biz);
    } else if ((event === 'subscription.halted' || event === 'subscription.cancelled') && biz) {
      await run(`UPDATE subscriptions SET status=? WHERE business_id=?`, event === 'subscription.cancelled' ? 'cancelled' : 'past_due', biz);
    } else if (event === 'payment.failed') {
      const pay = body.payload?.payment?.entity ?? {};
      const failBiz = (pay.notes as { businessId?: string } | undefined)?.businessId ?? biz;
      await run(`INSERT INTO automation_runs (id, business_id, automation_name, trigger, steps_json, status, error) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        uid('run'), failBiz, 'billing', 'payment.failed', JSON.stringify([{ event }]), 'failed', 'UPI Autopay charge failed — customer notified by Razorpay to retry');
    }
    await run(`INSERT INTO webhook_events (id, business_id, source, type, payload_json, status) VALUES (?, ?, ?, ?, ?, ?)`,
      uid('wh'), biz, 'razorpay', event, raw.slice(0, 2000), 'ok');
    return json({ received: true });
  } catch (e) {
    await run(`INSERT INTO webhook_events (id, business_id, source, type, payload_json, status, error) VALUES (?, ?, ?, ?, ?, ?)`,
      uid('wh'), biz, 'razorpay', event, raw.slice(0, 2000), 'failed', e instanceof Error ? e.message : 'handler failed');
    return json({ error: 'Handler failed' }, 500);
  }
});
