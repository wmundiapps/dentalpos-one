// POST /api/webhook-asaas — o Asaas avisa aqui quando o pagamento entra.
// Cadastre no painel do Asaas esta URL e o mesmo token de ASAAS_WEBHOOK_TOKEN.
import { json } from './_asaas.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { erro: 'Use POST' });
  if (!process.env.ASAAS_WEBHOOK_TOKEN || req.headers['asaas-access-token'] !== process.env.ASAAS_WEBHOOK_TOKEN) return json(res, 401, { erro: 'Token inválido' });
  const { event, payment } = req.body || {};
  if (['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(event) && payment) {
    // TODO (depende do banco, ver docs/INTEGRACAO-ASAAS.md §5): marcar a reserva como "confirmada" de forma idempotente
    // usando payment.id e payment.externalReference, e acionar o Robô Lembrete.
    console.log('pagamento confirmado', payment.id, payment.externalReference);
  }
  return json(res, 200, { ok: true });
}
