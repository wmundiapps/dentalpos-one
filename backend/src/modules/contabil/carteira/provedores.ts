import { createHash, randomUUID } from 'crypto'
import { prisma } from './host'

// ============================================================
// Interfaces de provedor da Carteira. Nada aqui chama sistema externo: os provedores padrão são SIMULADOS e marcados como tal.
// Para integrar de verdade: implemente a interface e chame registrar*() na inicialização (ex.: no módulo fiscal).
// ============================================================

// ---------- Fiscal (guias, pendências) ----------
export interface GuiaCarteira {
  id: string; clienteId: string; tipo: string; competencia: string | null; vencimento: Date; valor: number
  status: 'ABERTA' | 'PAGA' | 'CANCELADA'; codigo?: string | null; origem: string
}
export interface ClienteRef { id: string; empresaId?: string | null }
export interface FiscalProvider {
  nome: string
  /** true quando os dados vêm da camada mínima local (não do módulo fiscal real). */
  simulado: boolean
  guias(tenantId: string, clientes: ClienteRef[], opts?: { status?: 'ABERTA' | 'PAGA'; ateVencimento?: Date }): Promise<GuiaCarteira[]>
  /** Opcional: pendências fiscais por cliente (ex.: obrigações não entregues, divergências). */
  pendenciasFiscais?(tenantId: string, clientes: ClienteRef[]): Promise<Record<string, { total: number; itens: string[] }>>
  /** Opcional: acha a empresa do módulo fiscal pelo CNPJ/CPF (só dígitos) para vincular ao cliente. */
  localizarEmpresa?(tenantId: string, documento: string): Promise<{ id: string; nome: string; regime?: string | null } | null>
  empresaExiste?(tenantId: string, id: string): Promise<boolean>
}

export const fiscalLocal: FiscalProvider = {
  nome: 'LOCAL',
  simulado: true,
  async guias(tenantId, clientes, opts) {
    if (!clientes.length) return []
    const rows = await prisma.ctbCarGuia.findMany({
      where: {
        tenantId, clienteId: { in: clientes.map((c) => c.id) }, status: opts?.status ?? { not: 'CANCELADA' },
        ...(opts?.ateVencimento ? { vencimento: { lte: opts.ateVencimento } } : {}),
      },
      orderBy: { vencimento: 'asc' },
      take: 5000,
    })
    return rows.map((g) => ({ id: g.id, clienteId: g.clienteId, tipo: g.tipo, competencia: g.competencia, vencimento: g.vencimento, valor: g.valor, status: g.status as GuiaCarteira['status'], codigo: g.codigo, origem: 'LOCAL' }))
  },
}

let fiscal: FiscalProvider = fiscalLocal
export const registrarFiscalProvider = (p: FiscalProvider) => { fiscal = p }
export const fiscalAtual = () => fiscal

/** Consulta o fiscal; se o provedor registrado falhar, cai para a camada local e avisa (degradação elegante). */
export async function guiasDaCarteira(tenantId: string, clientes: ClienteRef[], opts?: Parameters<FiscalProvider['guias']>[2]) {
  try {
    return { guias: await fiscal.guias(tenantId, clientes, opts), degradado: false, provedor: fiscal.nome, simulado: fiscal.simulado }
  } catch (e: any) {
    console.error('[carteira-fiscal]', e?.message)
    return { guias: await fiscalLocal.guias(tenantId, clientes, opts), degradado: true, provedor: 'LOCAL', simulado: true }
  }
}
export async function pendenciasFiscais(tenantId: string, clientes: ClienteRef[]) {
  if (!fiscal.pendenciasFiscais) return { porCliente: {} as Record<string, { total: number; itens: string[] }>, disponivel: false }
  try { return { porCliente: await fiscal.pendenciasFiscais(tenantId, clientes), disponivel: true } } catch (e: any) { console.error('[carteira-fiscal-pend]', e?.message); return { porCliente: {}, disponivel: false } }
}

// ---------- Mensagens (e-mail / WhatsApp) ----------
export interface EnvioMensagem { canal: 'EMAIL' | 'WHATSAPP'; destino: string | null; assunto?: string | null; corpo: string }
export interface ResultadoEnvio { ok: boolean; simulado: boolean; provedor: string; id: string; aviso?: string }
export interface ProvedorMensagem { nome: string; simulado: boolean; enviar(m: EnvioMensagem): Promise<ResultadoEnvio> }

export const mensagemSimulada: ProvedorMensagem = {
  nome: 'SIMULADO',
  simulado: true,
  async enviar(m) {
    return { ok: true, simulado: true, provedor: 'SIMULADO', id: `sim-${randomUUID().slice(0, 8)}`, aviso: `Envio SIMULADO por ${m.canal === 'EMAIL' ? 'e-mail' : 'WhatsApp'}: nada foi enviado ao destinatário. Configure um provedor real para enviar de verdade.` }
  },
}
let msg: ProvedorMensagem = mensagemSimulada
export const registrarProvedorMensagem = (p: ProvedorMensagem) => { msg = p }
export const provedorMensagem = () => msg

// ---------- Assinatura eletrônica ----------
export interface PedidoAssinatura { tenantId: string; contratoId: string; parte: 'ESCRITORIO' | 'CLIENTE'; nome: string; resumo: string }
export interface ResultadoAssinatura { parte: string; nome: string; em: string; hash: string; simulada: boolean; provedor: string }
export interface ProvedorAssinatura { nome: string; simulado: boolean; assinar(p: PedidoAssinatura): Promise<ResultadoAssinatura> }

export const assinaturaSimulada: ProvedorAssinatura = {
  nome: 'SIMULADO',
  simulado: true,
  async assinar(p) {
    const em = new Date().toISOString()
    return { parte: p.parte, nome: p.nome, em, hash: createHash('sha256').update(`${p.contratoId}|${p.parte}|${p.nome}|${em}|${p.resumo}`).digest('hex'), simulada: true, provedor: 'SIMULADO' }
  },
}
let ass: ProvedorAssinatura = assinaturaSimulada
export const registrarProvedorAssinatura = (p: ProvedorAssinatura) => { ass = p }
export const provedorAssinatura = () => ass

export const AVISO_LEGAL = 'Este sistema não substitui um contador. Cálculos e guias são estimativas/simulações; valide com seu contador antes de enviar ou pagar. Seus dados são tratados conforme a LGPD.'
