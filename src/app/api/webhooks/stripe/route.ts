import { NextRequest } from 'next/server';
import { json, guard } from '@/lib/api';
import { run } from '@/lib/db';
import { uid } from '@/lib/ids';
import { config } from '@/lib/config';

export const POST = guard(async (req: NextRequest) => {
  const raw = await req.text();
  if (!config.stripeKey) {
    await run(`INSERT INTO webhook_events (id, source, type, payload_json, status, error) VALUES (?, ?, ?, ?, ?, ?)`,
      uid('wh'), 'stripe', 'mock', raw.slice(0, 2000), 'skipped', 'no STRIPE_SECRET_KEY');
    return json({ ok: true, mock: true });
  }
  try {
    const stripe = (await import('stripe')).default;
    const s = new stripe(config.stripeKey);
    const sig = req.headers.get('stripe-signature') ?? '';
    const event = s.webhooks.constructEvent(raw, sig, config.stripeWebhookSecret);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as { metadata?: { businessId?: string; plan?: string } };
      const biz = session.metadata?.businessId;
      const plan = session.metadata?.plan ?? 'growth';
      if (biz) {
        await run(`UPDATE subscriptions SET plan=?, status='active' WHERE business_id=?`, plan, biz);
        await run(`INSERT INTO invoices (id, business_id, amount, currency, status) VALUES (?, ?, ?, 'INR', 'paid')`, uid('inv'), biz, 0);
      }
    }
    await run(`INSERT INTO webhook_events (id, source, type, payload_json, status) VALUES (?, ?, ?, ?, ?)`,
      uid('wh'), 'stripe', event.type, raw.slice(0, 2000), 'ok');
    return json({ received: true });
  } catch (e) {
    await run(`INSERT INTO webhook_events (id, source, type, payload_json, status, error) VALUES (?, ?, ?, ?, ?, ?)`,
      uid('wh'), 'stripe', 'error', raw.slice(0, 2000), 'failed', e instanceof Error ? e.message : 'verify failed');
    return json({ error: 'Webhook verification failed' }, 400);
  }
});
