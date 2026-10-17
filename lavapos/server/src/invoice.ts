// Nota fiscal de serviço (NFS-e). A emissão real depende de um provedor fiscal contratado (eNotas, Focus NFe...) e da inscrição municipal
// do lava-rápido. Enquanto não houver provedor configurado, a nota fica na fila ("aguardando_provedor") com todos os dados prontos.
export interface InvoiceInput { tenantId: string; cnpj?: string | null; customerName: string; cpf?: string; email?: string; amountCents: number; description: string }
export interface InvoiceResult { status: 'emitida' | 'aguardando_provedor' | 'erro'; number?: string; error?: string }

export async function emitInvoice(provider: string, _i: InvoiceInput): Promise<InvoiceResult> {
  if (provider === 'manual' || !process.env.INVOICE_PROVIDER_TOKEN) return { status: 'aguardando_provedor' };
  // Ponto de integração com o provedor fiscal escolhido (credenciais em INVOICE_PROVIDER_TOKEN).
  return { status: 'aguardando_provedor' };
}
