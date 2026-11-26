// WhatsApp Cloud API provider — mock when no token configured (same pattern as email).
import { config } from './config';

export type WaResult = { ok: boolean; provider: 'meta' | 'mock'; id?: string; error?: string };

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d]/g, '').replace(/^0+/, '');
}

export async function sendWhatsApp(to: string, body: string): Promise<WaResult> {
  const phone = normalizePhone(to);
  if (!phone) return { ok: false, provider: 'mock', error: 'no phone' };
  if (!config.whatsappToken || !config.whatsappPhoneNumberId) {
    // Mock: log only, never fake a send.
    console.log(`[whatsapp:mock] to=${phone} body=${body.slice(0, 120)}`);
    return { ok: true, provider: 'mock', id: `mock_${Date.now()}` };
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${config.whatsappPhoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.whatsappToken}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'text',
        text: { body: body.slice(0, 4096) },
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, provider: 'meta', error: json?.error?.message ?? `HTTP ${res.status}` };
    return { ok: true, provider: 'meta', id: json?.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, provider: 'meta', error: e instanceof Error ? e.message : 'send failed' };
  }
}

export function isWhatsAppConfigured(): boolean {
  return !!config.whatsappToken && !!config.whatsappPhoneNumberId;
}
