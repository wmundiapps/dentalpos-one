import { prisma } from '../../lib/prisma'

// Enfileira uma mensagem na caixa de saída única. O despacho real pelos canais
// (WhatsApp, e-mail, SMS, voz, Telegram) é feito por modules/comunicacao.

export interface NotifyInput {
  tenantId: string
  canal?: 'IN_APP' | 'EMAIL' | 'WHATSAPP' | 'SMS' | 'VOZ' | 'TELEGRAM'
  userId?: string
  studentId?: string
  destino?: string
  assunto?: string
  mensagem: string
  templateKey?: string
  refType?: string
  refId?: string
  agendadoPara?: Date
}

export async function notify(input: NotifyInput) {
  return prisma.eduNotification.create({
    data: {
      tenantId: input.tenantId,
      canal: input.canal ?? 'IN_APP',
      userId: input.userId,
      studentId: input.studentId,
      destino: input.destino,
      assunto: input.assunto,
      mensagem: input.mensagem,
      templateKey: input.templateKey,
      refType: input.refType,
      refId: input.refId,
      agendadoPara: input.agendadoPara ?? new Date(),
    },
  })
}

export async function audit(params: { tenantId: string; userId?: string; modulo: string; acao: string; refType?: string; refId?: string; detalhes?: unknown }) {
  try {
    await prisma.eduAuditEvent.create({
      data: { tenantId: params.tenantId, userId: params.userId, modulo: params.modulo, acao: params.acao, refType: params.refType, refId: params.refId, detalhes: params.detalhes as any },
    })
  } catch (e) {
    console.error('[edu-audit]', e)
  }
}
