import { prisma } from '../nucleo/db'
import type { CtbCtx } from '../nucleo/rbac'
import { brl, hojeMeioDia, iso10 } from '../nucleo/util'

// Régua de cobrança. O envio é SIMULADO: a mensagem é registrada (CtbCobranca) e NADA sai por e-mail/WhatsApp.
// PONTO DE EXTENSÃO: implemente `ProvedorCobranca` (SMTP, API do WhatsApp Business...) e registre com `definirProvedorCobranca`.

export interface MensagemCobranca { canal: 'EMAIL' | 'WHATSAPP'; destino: string | null; assunto: string; texto: string }
export interface ProvedorCobranca { nome: string; simulado: boolean; enviar(m: MensagemCobranca): Promise<{ status: 'SIMULADO' | 'ENVIADO' | 'FALHA'; detalhe?: string }> }

export const provedorSimulado: ProvedorCobranca = { nome: 'SIMULADO', simulado: true, async enviar() { return { status: 'SIMULADO', detalhe: 'Mensagem registrada; nenhum envio real foi feito.' } } }
let provedor: ProvedorCobranca = provedorSimulado
export const definirProvedorCobranca = (p: ProvedorCobranca) => { provedor = p }
export const provedorCobranca = () => provedor

export const ETAPAS: Array<{ etapa: string; dias: number; canal: 'EMAIL' | 'WHATSAPP'; nome: string }> = [
  { etapa: 'D-3', dias: -3, canal: 'EMAIL', nome: 'Lembrete 3 dias antes' },
  { etapa: 'D0', dias: 0, canal: 'WHATSAPP', nome: 'No dia do vencimento' },
  { etapa: 'D+3', dias: 3, canal: 'EMAIL', nome: '3 dias após o vencimento' },
  { etapa: 'D+7', dias: 7, canal: 'WHATSAPP', nome: '7 dias após o vencimento' },
  { etapa: 'D+15', dias: 15, canal: 'EMAIL', nome: '15 dias após o vencimento (último aviso)' },
]

export function montarMensagem(t: { descricao: string; parceiroNome: string; valor: number; vencimento: Date }, empresaNome: string, etapa: string, canal: 'EMAIL' | 'WHATSAPP'): MensagemCobranca & { assunto: string } {
  const v = brl(t.valor), d = t.vencimento.toISOString().slice(8, 10) + '/' + t.vencimento.toISOString().slice(5, 7) + '/' + t.vencimento.getUTCFullYear()
  const atraso = etapa.startsWith('D+')
  const assunto = atraso ? `Pendência em aberto — ${t.descricao}` : `Lembrete de vencimento — ${t.descricao}`
  const corpo = atraso
    ? `Olá, ${t.parceiroNome}. Identificamos em aberto "${t.descricao}" no valor de ${v}, vencido em ${d}. Se já pagou, desconsidere e nos envie o comprovante. Caso precise da segunda via, responda esta mensagem. — ${empresaNome}`
    : `Olá, ${t.parceiroNome}. Lembramos que "${t.descricao}" no valor de ${v} vence em ${d}. Segunda via disponível sob solicitação. — ${empresaNome}`
  return { canal, destino: null, assunto, texto: corpo }
}

/** Registra (e "envia" pelo provedor) uma cobrança de um título. Atualiza contadores do título. */
export async function registrarCobranca(ctx: Pick<CtbCtx, 'tenantId' | 'userId'>, titulo: any, empresaNome: string, etapa: string, canal: 'EMAIL' | 'WHATSAPP', textoLivre?: string) {
  const m = montarMensagem(titulo, empresaNome, etapa, canal)
  if (textoLivre) m.texto = textoLivre
  m.destino = canal === 'EMAIL' ? titulo.parceiroEmail : titulo.parceiroTelefone
  const r = await provedor.enviar(m)
  const c = await prisma.ctbCobranca.create({ data: { tenantId: ctx.tenantId, empresaId: titulo.empresaId, tituloId: titulo.id, etapa, canal, assunto: m.assunto, mensagem: m.texto, status: r.status, criadoPorId: ctx.userId } })
  await prisma.ctbTitulo.update({ where: { id: titulo.id }, data: { cobrancas: { increment: 1 }, ultimaCobrancaEm: new Date() } })
  return { ...c, destino: m.destino, detalhe: r.detalhe }
}

/** Roda a régua para uma empresa: para cada título a receber em aberto, envia a ETAPA mais avançada já devida e ainda não enviada. */
export async function executarRegua(ctx: Pick<CtbCtx, 'tenantId' | 'userId'>, empresa: { id: string; razaoSocial: string }, hoje = hojeMeioDia()) {
  const abertos = await prisma.ctbTitulo.findMany({ where: { tenantId: ctx.tenantId, empresaId: empresa.id, tipo: 'RECEBER', status: 'ABERTO' }, orderBy: { vencimento: 'asc' }, take: 500 })
  const enviados = await prisma.ctbCobranca.findMany({ where: { tenantId: ctx.tenantId, empresaId: empresa.id, tituloId: { in: abertos.map((t) => t.id) }, etapa: { in: ETAPAS.map((e) => e.etapa) } }, select: { tituloId: true, etapa: true } })
  const jaEnviou = new Set(enviados.map((e) => `${e.tituloId}|${e.etapa}`))
  const gerados: any[] = []
  for (const t of abertos) {
    const dias = Math.floor((hoje.getTime() - t.vencimento.getTime()) / 86_400_000)   // negativo = ainda não venceu
    const devidas = ETAPAS.filter((e) => dias >= e.dias)
    const alvo = devidas.length ? devidas[devidas.length - 1] : null
    if (!alvo || jaEnviou.has(`${t.id}|${alvo.etapa}`)) continue
    gerados.push({ vencimento: iso10(t.vencimento), ...(await registrarCobranca(ctx, t, empresa.razaoSocial, alvo.etapa, alvo.canal)) })
  }
  return { avaliados: abertos.length, enviados: gerados.length, items: gerados, simulado: provedor.simulado }
}
