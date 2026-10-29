import { prisma } from '../../lib/prisma'
import { despacharPorId } from '../comunicacao/dispatcher'
import { canalAtivo } from '../comunicacao/store'
import { CANAL_COM } from './logic'

// ============================================================
// Interface de canal de saída do atendimento. A implementação SIMULADA é usada quando a instituição não
// configurou credenciais em Comunicação > Canais: o envio fica registrado como "ENVIADA_SIMULADA" (nunca finge
// entrega real). Com canal configurado, a mensagem entra na caixa de saída da comunicação (despacho real).
// ============================================================
export interface EnvioCanal { tenantId: string; canal: string; destino?: string | null; assunto?: string; texto: string; studentId?: string | null; refId?: string }
export interface ResultadoCanal { ok: boolean; status: 'ENVIADA_SIMULADA' | 'ENFILEIRADA' | 'REGISTRADA' | 'FALHA'; simulado: boolean; provedor: string; externalId?: string; erro?: string }
export interface CanalProvider { nome: string; enviar(i: EnvioCanal): Promise<ResultadoCanal> }

export const SimuladoProvider: CanalProvider = {
  nome: 'SIMULADO',
  async enviar(i) {
    if (i.canal === 'BALCAO' || i.canal === 'TELEFONE') return { ok: true, status: 'REGISTRADA', simulado: false, provedor: 'LOCAL' }
    if (!i.destino && i.canal !== 'CHAT_PORTAL') return { ok: false, status: 'FALHA', simulado: true, provedor: 'SIMULADO', erro: 'Sem destino para o canal.' }
    return { ok: true, status: 'ENVIADA_SIMULADA', simulado: true, provedor: 'SIMULADO', externalId: `sim-${Date.now().toString(36)}` }
  },
}

export const ComunicacaoProvider: CanalProvider = {
  nome: 'COMUNICACAO',
  async enviar(i) {
    const n = await prisma.eduNotification.create({ data: { tenantId: i.tenantId, canal: i.canal as any, destino: i.destino ?? undefined, studentId: i.studentId ?? undefined, assunto: i.assunto, mensagem: i.texto, refType: 'AtdAtendimento', refId: i.refId } })
    try { await despacharPorId(i.tenantId, n.id) } catch { /* fica na caixa de saída; o job reprocessa */ }
    const r = await prisma.eduNotification.findUnique({ where: { id: n.id }, select: { status: true, erro: true } })
    if (r?.status === 'FALHA') return { ok: false, status: 'FALHA', simulado: false, provedor: 'COMUNICACAO', erro: r.erro ?? undefined }
    return { ok: true, status: r?.status === 'ENVIADA' ? 'ENFILEIRADA' : 'ENFILEIRADA', simulado: false, provedor: 'COMUNICACAO', externalId: n.id }
  },
}

export async function resolverProvider(tenantId: string, canal: string): Promise<CanalProvider> {
  const tipo = canal === 'EMAIL' || canal === 'WHATSAPP' ? canal : undefined
  if (tipo && (await canalAtivo(tenantId, tipo))) return ComunicacaoProvider
  return SimuladoProvider
}

export async function entregar(i: EnvioCanal): Promise<ResultadoCanal> {
  const p = await resolverProvider(i.tenantId, i.canal)
  try { return await p.enviar(i) } catch (e: any) { return { ok: false, status: 'FALHA', simulado: p === SimuladoProvider, provedor: p.nome, erro: String(e?.message ?? e).slice(0, 200) } }
}

export const temEspelhoCom = (canal: string) => !!CANAL_COM[canal]
