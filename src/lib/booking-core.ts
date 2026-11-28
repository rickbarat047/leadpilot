// Pure, client-safe booking primitives shared by the API, booking service and tests.
// No database or network access lives in this module.

export type SlotOfferOption = { index: number; startsAt: string; label: string };
export type SlotOffer = {
  /** Stable identity so a consumed offer cannot be replayed with another option. */
  id: string;
  version: 1;
  type: 'slot_offer';
  createdAt: string;
  timezone: string;
  durationMin: number;
  serviceName: string | null;
  options: SlotOfferOption[];
  consumedAt?: string | null;
  consumedBy?: string | null;
};

export type BuildSlotOfferInput = {
  id?: string;
  createdAt: string;
  timezone: string;
  durationMin: number;
  serviceName: string | null;
  options: Array<{ startsAt: string; label: string }>;
};

const OFFER_TTL_MS = 60 * 60 * 1000;
const DEFAULT_DURATION_MIN = 60;

export function buildSlotOffer(input: BuildSlotOfferInput): SlotOffer {
  return {
    id: input.id || `offer_${input.createdAt}_${input.options[0]?.startsAt ?? 'none'}`,
    version: 1,
    type: 'slot_offer',
    createdAt: input.createdAt,
    timezone: input.timezone,
    durationMin: Math.floor(input.durationMin),
    serviceName: input.serviceName ?? null,
    options: input.options.map((o, i) => ({ index: i + 1, startsAt: o.startsAt, label: o.label })),
  };
}

/** Parse an untrusted meta_json value without trusting its shape. */
export function parseSlotOffer(value: unknown): SlotOffer | null {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !v.id) return null;
  if (v.version !== 1 || v.type !== 'slot_offer') return null;
  if (typeof v.createdAt !== 'string' || typeof v.timezone !== 'string') return null;
  if (typeof v.durationMin !== 'number' || !Number.isFinite(v.durationMin)) return null;
  if (!Array.isArray(v.options)) return null;
  const options: SlotOfferOption[] = [];
  for (const [i, raw] of v.options.entries()) {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    if (o.index !== i + 1 || typeof o.startsAt !== 'string' || typeof o.label !== 'string') return null;
    if (Number.isNaN(Date.parse(o.startsAt))) return null;
    options.push({ index: i + 1, startsAt: o.startsAt, label: o.label });
  }
  if (!options.length) return null;
  const parsed: SlotOffer = {
    id: v.id,
    version: 1,
    type: 'slot_offer',
    createdAt: v.createdAt,
    timezone: v.timezone,
    durationMin: v.durationMin,
    serviceName: typeof v.serviceName === 'string' ? v.serviceName : null,
    options,
  };
  if (typeof v.consumedAt === 'string') parsed.consumedAt = v.consumedAt;
  if (typeof v.consumedBy === 'string') parsed.consumedBy = v.consumedBy;
  return parsed;
}

export function offerConsumed(offer: SlotOffer | null): boolean {
  return !!offer && typeof offer.consumedAt === 'string' && offer.consumedAt.length > 0;
}

export function offerDurationMatches(offer: SlotOffer | null, durationMin: number): boolean {
  return !!offer && offer.durationMin === durationMin;
}

export type SelectionIntent =
  | { kind: 'selection'; index: number }
  | { kind: 'ambiguous' }
  | { kind: 'none' };

/**
 * Decide whether a reply is genuinely trying to pick an offered option.
 * This is deliberately strict: only exact supported selections, explicit
 * multi-option choices, and bare out-of-range numbers count. Ordinary prose
 * that happens to contain a digit must stay in the normal AI conversation.
 */
export function detectSelectionIntent(input: unknown, offer: SlotOffer | null): SelectionIntent {
  if (!offer || typeof input !== 'string') return { kind: 'none' };
  const text = input.trim().toLowerCase().replace(/[.!]+$/, '');
  if (!text) return { kind: 'none' };

  const index = parseSlotSelection(input, offer);
  if (index !== null) return { kind: 'selection', index };

  const numericTokens = text.match(/\d+/g) ?? [];
  const startsWithChoice = /^(?:\d+|option|choice|slot|first|second|third)\b/.test(text);
  const hasChoiceWord = /\b(?:option|choice|slot|first|second|third)\b/.test(text);
  const hasChoiceJoiner = /\b(?:or|and)\b/.test(text) || /[,/]/.test(text);

  // "2 or 3", "option 2 or 3", "1 and 2" are real but ambiguous attempts.
  if (startsWithChoice && (numericTokens.length >= 2 || (hasChoiceWord && hasChoiceJoiner))) {
    return { kind: 'ambiguous' };
  }
  if (/^\d+$/.test(text)) return { kind: 'ambiguous' };
  if (/^(?:option|choice|slot)\b/.test(text)) return { kind: 'ambiguous' };
  return { kind: 'none' };
}

/**
 * Classify a customer reply against the stored offer. Selection intent is
 * established first; only genuine selection attempts are checked against
 * consumption and expiry, so ordinary questions keep normal AI conversation.
 */
export function classifyOfferReply(
  input: unknown,
  offer: SlotOffer | null,
  now: Date,
): { kind: 'accept'; index: number } | { kind: 'expired' | 'consumed' | 'ambiguous' | 'none' } {
  if (!offer) return { kind: 'none' };
  const intent = detectSelectionIntent(input, offer);
  if (intent.kind === 'none') return { kind: 'none' };
  if (intent.kind === 'ambiguous') return { kind: 'ambiguous' };
  if (offerConsumed(offer)) return { kind: 'consumed' };
  if (slotOfferExpired(offer, now)) return { kind: 'expired' };
  return { kind: 'accept', index: intent.index };
}

/** Numbered choices come from stored metadata, never from reparsing conversation text. */
export function formatSlotOffers(offer: SlotOffer): string {
  return offer.options.map((o) => `${o.index}. ${o.label}`).join('\n');
}

const ORDINAL: Record<string, number> = { first: 1, second: 2, third: 3 };

/** Deterministic selection only; ambiguous language is never treated as a choice. */
export function parseSlotSelection(input: unknown, offer: SlotOffer | null): number | null {
  if (!offer || typeof input !== 'string') return null;
  const text = input.trim().toLowerCase().replace(/[.!]+$/, '');
  if (!text) return null;
  let n: number | null = null;
  if (/^\d+$/.test(text)) n = Number(text);
  else {
    const m = text.match(/^(?:option|choice|slot)\s+(\d+)$/);
    if (m) n = Number(m[1]);
    else {
      const w = text.match(/^(first|second|third)(?:\s+(?:please|one|slot|option))?$/);
      if (w) n = ORDINAL[w[1]!] ?? null;
    }
  }
  return n !== null && n >= 1 && n <= offer.options.length ? n : null;
}

export function isOfferedSlot(offer: SlotOffer, index: number, startsAt: string): boolean {
  const option = offer.options.find((o) => o.index === index);
  if (!option) return false;
  const a = Date.parse(option.startsAt);
  const b = Date.parse(startsAt);
  return !Number.isNaN(a) && !Number.isNaN(b) && a === b;
}

export function slotOfferExpired(offer: SlotOffer, now: Date): boolean {
  const created = Date.parse(offer.createdAt);
  return Number.isNaN(created) || now.getTime() - created > OFFER_TTL_MS;
}

export function serviceDuration(services: unknown, serviceName: string | null | undefined): number {
  if (!Array.isArray(services) || !serviceName) return DEFAULT_DURATION_MIN;
  const match = services.find((s) => {
    if (!s || typeof s !== 'object') return false;
    const row = s as { name?: unknown };
    return typeof row.name === 'string' && row.name.toLowerCase() === serviceName.trim().toLowerCase();
  }) as { duration_min?: unknown } | undefined;
  const value = Number(match?.duration_min);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_DURATION_MIN;
}

export function normalizeBookingTimes(
  startsAt: string,
  durationMin: number,
  now: Date,
): { startsAt: string; endsAt: string } | null {
  const start = Date.parse(startsAt);
  const duration = Number(durationMin);
  if (Number.isNaN(start) || !Number.isInteger(duration) || duration <= 0) return null;
  if (start <= now.getTime()) return null;
  return {
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(start + duration * 60_000).toISOString(),
  };
}

function toComparable(value: string): number | null {
  if (/^\d{2}:\d{2}$/.test(value)) {
    const [h, m] = value.split(':').map(Number);
    return h * 60 + m;
  }
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/** Half-open intervals: an appointment ending exactly when another starts is safe. */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const [a1, a2, b1, b2] = [aStart, aEnd, bStart, bEnd].map(toComparable);
  if (a1 === null || a2 === null || b1 === null || b2 === null) return false;
  return a1 < b2 && a2 > b1;
}
