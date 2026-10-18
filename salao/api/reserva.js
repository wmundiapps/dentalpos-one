// POST /api/reserva — cria a cobrança (Pix ou cartão) da reserva. O valor vem do catálogo do servidor, nunca do navegador.
import { readFileSync } from 'node:fs';
import { asaas, hoje, json, RETENCAO_PCT } from './_asaas.js';

const catalogo = JSON.parse(readFileSync(new URL('./catalogo.json', import.meta.url), 'utf8'));

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { erro: 'Use POST' });
  const { servico, horario, nome, cpfCnpj, email, telefone, forma, aceitouPolitica } = req.body || {};
  const item = catalogo[servico];
  if (!item) return json(res, 400, { erro: 'Serviço inválido' });
  if (!aceitouPolitica) return json(res, 400, { erro: 'É preciso aceitar a política de não comparecimento' });
  if (!['PIX', 'CREDIT_CARD'].includes(forma)) return json(res, 400, { erro: 'Forma de pagamento inválida' });
  if (!nome || !cpfCnpj || !horario) return json(res, 400, { erro: 'Informe nome, CPF/CNPJ e horário' });
  try {
    const cliente = await asaas('/customers', 'POST', { name: nome, cpfCnpj, email, mobilePhone: telefone });
    const pgto = await asaas('/payments', 'POST', {
      customer: cliente.id,
      billingType: forma,
      value: item.valor,
      dueDate: hoje(),
      description: `Reserva ${item.nome} em ${horario} (não comparecer retém ${RETENCAO_PCT}%)`,
      externalReference: JSON.stringify({ servico, horario })
    });
    const pix = forma === 'PIX' ? await asaas(`/payments/${pgto.id}/pixQrCode`) : null;
    return json(res, 200, { pagamentoId: pgto.id, linkPagamento: pgto.invoiceUrl, pix: pix && { copiaECola: pix.payload, qrCodeBase64: pix.encodedImage } });
  } catch (e) {
    return json(res, 502, { erro: e.message });
  }
}
