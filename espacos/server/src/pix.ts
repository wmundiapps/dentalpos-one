// Envio de Pix pelo SpaceHour (repasse ao anfitrião nas reservas do Plano e aos parceiros).
// Com ASAAS_API_KEY, o Pix sai automaticamente pela conta Asaas do SpaceHour (API de transferências);
// sem ela, a equipe paga pelo banco e marca como pago no Admin → Financeiro.
const ASAAS_API = () => (process.env.ASAAS_SANDBOX === 'true' ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3');

export const autoPixEnabled = () => !!process.env.ASAAS_API_KEY;

export type PixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';
/** Tipo da chave Pix pelo formato. */
export function pixKeyType(key: string): PixKeyType | null {
  const k = key.trim();
  const d = k.replace(/\D/g, '');
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k)) return 'EMAIL';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)) return 'EVP';
  if (/^\+?55?\s?\(?\d{2}\)?\s?9?\d{4}-?\d{4}$/.test(k) && (d.length === 13 || (d.length === 11 && k.startsWith('+')))) return 'PHONE';
  if (d.length === 11 && /^[\d.\-\s]+$/.test(k)) return 'CPF';
  if (d.length === 14 && /^[\d./\-\s]+$/.test(k)) return 'CNPJ';
  if (/^\+55\d{10,11}$/.test(k.replace(/[\s()-]/g, ''))) return 'PHONE';
  return null;
}

let http: typeof fetch = (...a) => fetch(...a);
export function setPixFetch(f?: typeof fetch) { http = f ?? ((...a) => fetch(...a)); }

/** Envia um Pix pela conta Asaas do SpaceHour. Retorna o id da transferência. */
export async function sendPix(input: { key: string; amount: number; description: string; ref: string }): Promise<string> {
  const type = pixKeyType(input.key);
  if (!type) throw new Error('chave Pix inválida');
  const key = type === 'CPF' || type === 'CNPJ' ? input.key.replace(/\D/g, '') : type === 'PHONE' ? input.key.replace(/[^\d+]/g, '') : input.key.trim();
  const r = await http(`${ASAAS_API()}/transfers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', access_token: process.env.ASAAS_API_KEY ?? '' },
    body: JSON.stringify({ value: Math.round(input.amount * 100) / 100, operationType: 'PIX', pixAddressKey: key, pixAddressKeyType: type, description: input.description.slice(0, 140), externalReference: input.ref }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await r.json().catch(() => ({})) as { id?: string; errors?: Array<{ description?: string }> };
  if (!r.ok || !body.id) throw new Error(`Asaas ${r.status}: ${body.errors?.[0]?.description ?? 'falha no Pix'}`);
  return body.id;
}
