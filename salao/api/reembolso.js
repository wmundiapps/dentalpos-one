// POST /api/reembolso — uso do salão. { pagamentoId, motivo: 'cancelou' | 'faltou' }
// cancelou no prazo: devolve 100%. faltou: devolve (100 - RETENCAO_PCT)%.
import { asaas, json, RETENCAO_PCT } from './_asaas.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { erro: 'Use POST' });
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!process.env.SALAO_ADMIN_TOKEN || token !== process.env.SALAO_ADMIN_TOKEN) return json(res, 401, { erro: 'Não autorizado' });
  const { pagamentoId, motivo } = req.body || {};
  if (!pagamentoId || !['cancelou', 'faltou'].includes(motivo)) return json(res, 400, { erro: 'Dados inválidos' });
  try {
    const pgto = await asaas(`/payments/${pagamentoId}`);
    if (!['RECEIVED', 'CONFIRMED'].includes(pgto.status)) return json(res, 409, { erro: `Pagamento está ${pgto.status}` });
    const devolver = motivo === 'faltou' ? Math.round(pgto.value * (100 - RETENCAO_PCT)) / 100 : pgto.value;
    const r = await asaas(`/payments/${pagamentoId}/refund`, 'POST', { value: devolver, description: motivo === 'faltou' ? `Não comparecimento: retido ${RETENCAO_PCT}%` : 'Cancelamento dentro do prazo' });
    return json(res, 200, { devolvido: devolver, retido: Math.round((pgto.value - devolver) * 100) / 100, status: r.status });
  } catch (e) {
    return json(res, 502, { erro: e.message });
  }
}
