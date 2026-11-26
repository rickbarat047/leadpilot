import { NextRequest } from 'next/server';
import { requireBusiness, json, guard } from '@/lib/api';
import { get, run, all } from '@/lib/db';
import { planById } from '@/lib/billing';
import { config } from '@/lib/config';
import { uid } from '@/lib/ids';
import { notifyOwner } from '@/lib/messaging';
import { recordRun } from '@/lib/automation';
import { activeProvider, razorpayEnv, razorpayPlanId, createRazorpaySubscription } from '@/lib/razorpay';

export const GET = guard(async (req: NextRequest) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  const sub = await get(`SELECT * FROM subscriptions WHERE business_id=?`, businessId);
  const invoices = await all(`SELECT * FROM invoices WHERE business_id=? ORDER BY created_at DESC LIMIT 20`, businessId);
  const provider = activeProvider();
  return json({
    subscription: sub, plan: planById((sub as { plan: string } | undefined)?.plan ?? 'trial'), invoices,
    provider, upi: provider === 'razorpay',
    live: provider === 'razorpay' ? razorpayEnv().configured : !!config.stripeKey,
    stripeConfigured: !!config.stripeKey,
    upiConfigured: !!config.upiId,
    upiId: config.upiId,
    upiName: config.upiName,
  });
});

export const POST = guard(async (req: NextRequest) => {
  // Create checkout: Razorpay (UPI Autopay) by default, Stripe if BILLING_PROVIDER=stripe.
  // Mock activates instantly when the active provider has no keys.
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  const body = await req.json().catch(() => ({}));
  const plan = planById(body.plan ?? 'growth');
  if (plan.id === 'trial') return json({ error: 'Choose a paid plan' }, 400);

  // Manual UPI (no gateway): when UPI_ID is configured, collect payment intent
  // + UTR and verify by hand. No auto-activation, no webhook — owner marks paid
  // in the admin console. This is the production path for early pilots.
  if (config.upiId) {
    const utr = String(body.utr ?? '').trim().slice(0, 60);
    const id = uid('inv');
    await run(`INSERT INTO invoices (id, business_id, amount, currency, status, plan, url) VALUES (?, ?, ?, 'INR', 'pending_verification', ?, ?)`,
      id, businessId, plan.priceInr, plan.id, utr);
    try {
      await notifyOwner(businessId, `UPI payment pending verification`,
        `${plan.name} plan · ₹${plan.priceInr.toLocaleString('en-IN')}/mo\nUPI ref: ${utr || '(none provided)'}\nInvoice: ${id}\nMark paid in Admin → Billing once received.`);
    } catch { /* best effort */ }
    await recordRun(businessId, '', 'billing (upi)', 'billing.upi_submitted', id,
      [{ plan: plan.id, amount: plan.priceInr, utr }], 'ok', '');
    return json({
      ok: true, pending: true, invoiceId: id,
      upiId: config.upiId, upiName: config.upiName, amount: plan.priceInr,
      message: `Pay ₹${plan.priceInr.toLocaleString('en-IN')} via UPI to ${config.upiId}, then enter the UTR below. We'll activate ${plan.name} once verified (usually within 1 business day).`,
    });
  }

  if (activeProvider() === 'razorpay') {
    if (!razorpayEnv().configured) {
      const id = uid('inv');
      await run(`INSERT INTO invoices (id, business_id, amount, currency, status, plan, url) VALUES (?, ?, ?, 'INR', 'open', ?, ?)`, id, businessId, plan.priceInr, plan.id, '');
      await run(`UPDATE subscriptions SET plan=?, status='active' WHERE business_id=?`, plan.id, businessId);
      await run(`INSERT INTO automation_runs (id, business_id, automation_name, trigger, steps_json, status) VALUES (?, ?, ?, ?, ?, ?)`,
        uid('run'), businessId, 'billing (mock)', 'billing.checkout', JSON.stringify([{ provider: 'razorpay', plan: plan.id }]), 'ok');
      return json({ ok: true, mock: true, message: `Mock checkout: ${plan.name} activated (no Razorpay keys configured).` });
    }
    const rpPlanId = razorpayPlanId(plan.id);
    if (!rpPlanId) return json({ error: `Razorpay plan ID missing for ${plan.name}. Set RAZORPAY_PLAN_${plan.id.toUpperCase()} in env.` }, 500);
    try {
      const { subId, url } = await createRazorpaySubscription(rpPlanId, businessId, plan.id);
      await run(`INSERT INTO invoices (id, business_id, amount, currency, status, plan, url) VALUES (?, ?, ?, 'INR', 'open', ?, ?)`, uid('inv'), businessId, plan.priceInr, plan.id, subId);
      await run(`INSERT INTO automation_runs (id, business_id, automation_name, trigger, steps_json, status) VALUES (?, ?, ?, ?, ?, ?)`,
        uid('run'), businessId, 'billing', 'billing.checkout', JSON.stringify([{ provider: 'razorpay', subId, plan: plan.id }]), 'ok');
      return json({ ok: true, url, subId });
    } catch (e) {
      await run(`INSERT INTO automation_runs (id, business_id, automation_name, trigger, steps_json, status, error) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        uid('run'), businessId, 'billing', 'billing.checkout', JSON.stringify([{ provider: 'razorpay', plan: plan.id }]), 'failed', e instanceof Error ? e.message : 'checkout failed');
      return json({ error: 'Could not start UPI Autopay. Try again or contact support.' }, 502);
    }
  }

  if (!config.stripeKey) {
    const id = uid('inv');
    await run(`INSERT INTO invoices (id, business_id, amount, currency, status, plan, url) VALUES (?, ?, ?, 'INR', 'open', ?, ?)`, id, businessId, plan.priceInr, plan.id, '');
    await run(`UPDATE subscriptions SET plan=?, status='active' WHERE business_id=?`, plan.id, businessId);
    await run(`INSERT INTO automation_runs (id, business_id, automation_name, trigger, steps_json, status) VALUES (?, ?, ?, ?, ?, ?)`,
      uid('run'), businessId, 'billing (mock)', 'billing.checkout', JSON.stringify([{ plan: plan.id }]), 'ok');
    return json({ ok: true, mock: true, message: `Mock checkout: ${plan.name} activated (no Stripe key configured).` });
  }
  const stripe = (await import('stripe')).default;
  const s = new stripe(config.stripeKey);
  const priceMap: Record<string, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER, growth: process.env.STRIPE_PRICE_GROWTH, pro: process.env.STRIPE_PRICE_PRO,
  };
  const price = priceMap[plan.id];
  if (!price) return json({ error: 'Stripe price not configured for this plan.' }, 500);
  const session = await s.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    success_url: `${config.appUrl}/app/billing?success=1`,
    cancel_url: `${config.appUrl}/app/billing?cancelled=1`,
    metadata: { businessId, plan: plan.id },
  });
  return json({ ok: true, url: session.url });
});
