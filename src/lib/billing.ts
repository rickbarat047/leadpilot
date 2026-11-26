export type PlanId = 'trial' | 'starter' | 'growth' | 'pro';

export type Plan = {
  id: PlanId; name: string; priceInr: number; tagline: string;
  limits: { leadsPerMonth: number; seats: number; smsMonthly: number; locations: number };
  features: string[];
};

// Single source of truth — UI, API gating, and Stripe mapping all read this.
export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: 'trial', name: 'Trial', priceInr: 0, tagline: '14 days, full Growth feature set',
    limits: { leadsPerMonth: 200, seats: 2, smsMonthly: 100, locations: 1 },
    features: ['Instant AI replies', 'Follow-up sequences', 'Booking + reminders', 'Analytics'],
  },
  starter: {
    id: 'starter', name: 'Starter', priceInr: 2999, tagline: 'For solo owners who miss calls',
    limits: { leadsPerMonth: 200, seats: 1, smsMonthly: 200, locations: 1 },
    features: ['Instant AI replies', '3-step follow-up', 'Booking + reminders', '1 seat', 'Email support'],
  },
  growth: {
    id: 'growth', name: 'Growth', priceInr: 5999, tagline: 'For busy teams that live on bookings',
    limits: { leadsPerMonth: 1000, seats: 3, smsMonthly: 1000, locations: 2 },
    features: ['Everything in Starter', 'Review automation', 'Advanced sequences', '3 seats', 'Priority support'],
  },
  pro: {
    id: 'pro', name: 'Pro', priceInr: 11999, tagline: 'For multi-location operators',
    limits: { leadsPerMonth: 5000, seats: 10, smsMonthly: 5000, locations: 5 },
    features: ['Everything in Growth', 'API + webhooks', 'Multi-location', 'Audit logs', 'Onboarding call'],
  },
};

export function planById(id: string): Plan {
  return (PLANS as Record<string, Plan>)[id] ?? PLANS.trial;
}

export function trialActive(trialEndsAt: string | null): boolean {
  if (!trialEndsAt) return false;
  return new Date(trialEndsAt).getTime() > Date.now();
}

export function canAddLead(plan: Plan, leadsThisMonth: number): boolean {
  return leadsThisMonth < plan.limits.leadsPerMonth;
}
