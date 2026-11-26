import crypto from 'node:crypto';
import { config } from './config';

export type BillingProvider = 'razorpay' | 'stripe';

export function activeProvider(): BillingProvider {
  const p = (process.env.BILLING_PROVIDER ?? 'razorpay').toLowerCase();
  return p === 'stripe' ? 'stripe' : 'razorpay';
}

export function razorpayEnv(): { keyId: string; keySecret: string; webhookSecret: string; configured: boolean } {
  const keyId = process.env.RAZORPAY_KEY_ID ?? '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET ?? '';
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';
  return { keyId, keySecret, webhookSecret, configured: !!(keyId && keySecret) };
}

export function razorpayPlanId(plan: string): string | undefined {
  const map: Record<string, string | undefined> = {
    starter: process.env.RAZORPAY_PLAN_STARTER,
    growth: process.env.RAZORPAY_PLAN_GROWTH,
    pro: process.env.RAZORPAY_PLAN_PRO,
  };
  return map[plan];
}

/** Razorpay webhook signature: HMAC-SHA256(webhookSecret, rawBody). Pure — unit tested. */
export function verifyRazorpaySignature(rawBody: string, signature: string, webhookSecret: string): boolean {
  if (!signature || !webhookSecret) return false;
  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function createRazorpaySubscription(planId: string, businessId: string, plan: string): Promise<{ subId: string; url: string | null }> {
  const { keyId, keySecret } = razorpayEnv();
  const Razorpay = (await import('razorpay')).default;
  const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
  const sub = await rzp.subscriptions.create({
    plan_id: planId,
    total_count: 120, // 10 years of monthly cycles; cancellations handled explicitly
    quantity: 1,
    customer_notify: 1,
    notes: { businessId, plan, app: config.appName },
  });
  return { subId: sub.id as string, url: (sub.short_url as string) ?? null };
}
