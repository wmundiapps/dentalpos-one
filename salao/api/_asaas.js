// Cliente mínimo da API do Asaas. A chave vem só de variável de ambiente (nunca no código).
const BASE = process.env.ASAAS_ENV === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';

export async function asaas(path, method = 'GET', body) {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new Error('ASAAS_API_KEY não configurada');
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', access_token: key, 'User-Agent': 'BeautyPos' },
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Asaas ${r.status}: ${JSON.stringify(j.errors || j)}`);
  return j;
}

export const RETENCAO_PCT = Number(process.env.RETENCAO_PCT ?? 30);
export const hoje = () => new Date().toISOString().slice(0, 10);
export const json = (res, code, obj) => res.status(code).setHeader('Content-Type', 'application/json').send(JSON.stringify(obj));
