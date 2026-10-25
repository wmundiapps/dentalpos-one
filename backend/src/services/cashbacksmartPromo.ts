// Propaganda do Cashbacksmart no rodapé das mensagens de confirmação ao paciente.
// Só é anexada quando CASHBACKSMART_URL está definida no ambiente (sem link, nenhuma propaganda sai).
const PROMO_CHANNELS = new Set(['WHATSAPP', 'TELEGRAM'])
const PROMO_TYPES = new Set(['CONFIRMATION', 'ON_BOOKING'])

export function cashbacksmartFooter(channel: string, type: string, status?: string): string {
  const url = String(process.env.CASHBACKSMART_URL || '').trim()
  if (!url || !PROMO_CHANNELS.has(channel) || !PROMO_TYPES.has(type)) return ''
  // Pedido ainda aguardando confirmação da clínica não leva propaganda.
  if (type === 'ON_BOOKING' && status === 'WAITING') return ''
  return `\n\n──────────────\n💰 Ganhe dinheiro de volta nas suas compras!\nParticipe do Cashbacksmart: ${url}`
}
