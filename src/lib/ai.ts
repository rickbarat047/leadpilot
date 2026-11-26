// AI provider abstraction — swap vendors without touching product code.
import { config } from './config';
export type LeadInput = {
  name: string; email: string; phone: string; service: string; message: string;
  businessName: string; services: { name: string; price: number }[]; knowledge: { title: string; body: string }[];
};

export type Classification = {
  service: string; urgency: 'low' | 'normal' | 'high'; value: number;
  intent: string; quality: 'cold' | 'warm' | 'hot'; conversionProb: number;
  summary: string; nextQuestion: string; confidence: number;
  outOfScope: boolean;
};

export interface AIProvider {
  name: string;
  classify(input: LeadInput): Promise<Classification>;
  draftReply(input: LeadInput, c: Classification): Promise<{ body: string; confidence: number }>;
}

/** Deterministic mock — works offline, powers demo + tests. */
export class MockProvider implements AIProvider {
  name = 'mock';
  async classify(input: LeadInput): Promise<Classification> {
    const text = `${input.service} ${input.message}`.toLowerCase();
    const urgent = /urgent|asap|today|emergency|tomorrow|wedding|pain/.test(text);
    const priceHint = /price|cost|charge|fee/.test(text);
    const matched = input.services.find((s) => text.includes(s.name.toLowerCase()));
    const service = matched?.name ?? input.service ?? input.services[0]?.name ?? 'General enquiry';
    const value = matched?.price ?? guessValue(text);
    const quality = urgent || text.length > 40 ? 'hot' : text.length > 12 ? 'warm' : 'cold';
    const conversionProb = quality === 'hot' ? 0.72 : quality === 'warm' ? 0.45 : 0.22;
    const outOfScope = /loan|crypto|visa|gamble|adult/.test(text);
    const nextQuestion = priceHint
      ? `Our ${service} pricing is confirmed in the system — what date and time suit you?`
      : /when|date|time|slot|book|appointment/.test(text)
        ? `Great — what date and time suit you for ${service}?`
        : `Thanks! To arrange ${service}, what date and time suit you?`;
    return {
      service, urgency: urgent ? 'high' : 'normal', value, intent: priceHint ? 'pricing+booking' : 'booking',
      quality, conversionProb,
      summary: `${input.name || 'New lead'} asked about ${service}. ${urgent ? 'Sounds time-sensitive. ' : ''}Intent: booking.`,
      nextQuestion, confidence: outOfScope ? 0.2 : 0.86, outOfScope,
    };
  }
  async draftReply(input: LeadInput, c: Classification): Promise<{ body: string; confidence: number }> {
    if (c.outOfScope) {
      return {
        body: `Thanks for reaching out to ${input.businessName}. That's outside what I can arrange — I've flagged this for the owner and they'll reply personally shortly.`,
        confidence: 0.25,
      };
    }
    return {
      body: `Hi ${input.name?.split(' ')[0] || 'there'} — thanks for contacting ${input.businessName}! For ${c.service}, ${c.nextQuestion} Reply STOP to opt out.`,
      confidence: c.confidence,
    };
  }
}

function guessValue(text: string): number {
  if (/wedding|event|real estate|implant|full/.test(text)) return 25000;
  if (/clean|repair|photo|facial|massage/.test(text)) return 3500;
  return 2000;
}

/** OpenAI-compatible provider (optional live mode). */
export class OpenAICompatibleProvider implements AIProvider {
  name = 'openai-compatible';
  constructor(private apiKey: string, private model: string, private baseUrl: string) {}
  async classify(input: LeadInput): Promise<Classification> {
    // Fall back to mock logic but attempt live call for reply quality.
    // Classification stays rule-based for reliability + cost; LLM used for reply phrasing.
    const mock = new MockProvider();
    return mock.classify(input);
  }
  async draftReply(input: LeadInput, c: Classification): Promise<{ body: string; confidence: number }> {
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model, temperature: 0.4, max_tokens: 220,
          messages: [
            { role: 'system', content: `You are ${input.businessName}'s booking assistant. Never invent prices, availability, or policies. Only use: services ${JSON.stringify(input.services)}; knowledge ${JSON.stringify(input.knowledge)}. If unsure, escalate. Keep replies under 60 words, friendly, end with one clear question.` },
            { role: 'user', content: `Lead: ${input.name} wants ${c.service}. Message: ${input.message}. Draft the first reply.` },
          ],
        }),
      });
      if (!res.ok) throw new Error(`AI ${res.status}`);
      const json = await res.json();
      const msg = json.choices?.[0]?.message;
      const body = (msg?.content?.trim()) || (msg?.reasoning?.trim());
      if (!body) throw new Error('empty AI reply');
      return { body: body.slice(0, 600), confidence: 0.8 };
    } catch {
      const mock = new MockProvider();
      return mock.draftReply(input, c);
    }
  }
}

export function getAIProvider(): AIProvider {
  if (config.aiProvider !== 'mock' && config.aiApiKey) {
    return new OpenAICompatibleProvider(config.aiApiKey, config.aiModel, config.aiBaseUrl);
  }
  return new MockProvider();
}
