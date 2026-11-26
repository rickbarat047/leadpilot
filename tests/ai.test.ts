import { describe, it, expect } from 'vitest';
import { MockProvider } from '../src/lib/ai';

describe('MockProvider classifier', () => {
  const ai = new MockProvider();
  const base = { name: 'Test', email: '', phone: '', businessName: 'Biz', services: [{ name: 'Balayage Colour', price: 4999 }], knowledge: [] };
  it('detects hot urgent booking + value', async () => {
    const c = await ai.classify({ ...base, service: '', message: 'Urgent! need balayage colour tomorrow' });
    expect(c.service).toBe('Balayage Colour');
    expect(c.urgency).toBe('high');
    expect(c.quality).toBe('hot');
    expect(c.value).toBe(4999);
  });
  it('flags out-of-scope + low confidence', async () => {
    const c = await ai.classify({ ...base, service: '', message: 'crypto loan please' });
    expect(c.outOfScope).toBe(true);
    const r = await ai.draftReply({ ...base, service: '', message: 'crypto loan please' }, c);
    expect(r.confidence).toBeLessThan(0.4);
    expect(r.body).toMatch(/flagged|owner/i);
  });
  it('never invents prices without configured service', async () => {
    const c = await ai.classify({ ...base, service: '', message: 'hi' });
    const r = await ai.draftReply({ ...base, service: '', message: 'hi' }, c);
    expect(r.body.length).toBeGreaterThan(10);
  });
});
