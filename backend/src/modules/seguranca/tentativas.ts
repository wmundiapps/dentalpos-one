import { prisma } from '../../lib/prisma'
import { registrarEvento } from './eventos'

// ============================================================
// Bloqueio temporário progressivo por (escopo, chave, IP).
//   login: 5 falhas -> 15 min; depois 1 h; depois 4 h (teto).
//   2fa  : 5 falhas -> 15 min (mesma escada, por usuário+IP).
// A mensagem ao cliente é sempre genérica. Falha de banco = não bloqueia (fail-open) para
// nunca derrubar o login por problema no módulo de segurança.
// ============================================================

export interface PoliticaBloqueio {
  maxFalhas: number
  duracoesMin: number[]     // índice = nível do bloqueio; o último vale para os seguintes
}

export const POLITICA_LOGIN: PoliticaBloqueio = { maxFalhas: 5, duracoesMin: [15, 60, 240] }
export const POLITICA_2FA: PoliticaBloqueio = { maxFalhas: 5, duracoesMin: [15, 60, 240] }

export type Escopo = 'login' | '2fa'

export async function estaBloqueado(escopo: Escopo, chave: string, ip: string): Promise<{ bloqueado: boolean; segundos: number }> {
  try {
    const row = await prisma.segTentativaLogin.findUnique({ where: { escopo_chave_ip: { escopo, chave, ip } } })
    if (row?.bloqueadoAte && row.bloqueadoAte.getTime() > Date.now()) {
      return { bloqueado: true, segundos: Math.ceil((row.bloqueadoAte.getTime() - Date.now()) / 1000) }
    }
  } catch (e: any) {
    console.warn('[seguranca] verificação de bloqueio indisponível:', String(e?.code || e?.message).slice(0, 100))
  }
  return { bloqueado: false, segundos: 0 }
}

export async function registrarFalha(
  escopo: Escopo,
  chave: string,
  ip: string,
  opt: { tenantId?: string | null; userId?: string | null; politica?: PoliticaBloqueio; userAgent?: string | null } = {},
): Promise<{ bloqueou: boolean; falhas: number }> {
  const pol = opt.politica ?? (escopo === 'login' ? POLITICA_LOGIN : POLITICA_2FA)
  try {
    const agora = new Date()
    const atual = await prisma.segTentativaLogin.findUnique({ where: { escopo_chave_ip: { escopo, chave, ip } } })
    // Janela de contagem: falhas com mais de 15 min sem novas tentativas voltam a zero (o nível permanece).
    const expirou = !!atual && agora.getTime() - atual.ultimaTentativaEm.getTime() > 15 * 60_000 && !(atual.bloqueadoAte && atual.bloqueadoAte > agora)
    const falhasAntes = !atual || expirou ? 0 : atual.falhas
    const falhas = falhasAntes + 1
    let nivel = atual?.nivel ?? 0
    let bloqueadoAte: Date | null = atual?.bloqueadoAte ?? null
    let bloqueou = false
    let falhasGravar = falhas
    if (falhas >= pol.maxFalhas) {
      const min = pol.duracoesMin[Math.min(nivel, pol.duracoesMin.length - 1)]
      bloqueadoAte = new Date(agora.getTime() + min * 60_000)
      nivel += 1
      falhasGravar = 0
      bloqueou = true
    }
    await prisma.segTentativaLogin.upsert({
      where: { escopo_chave_ip: { escopo, chave, ip } },
      create: { tenantId: opt.tenantId || 'global', escopo, chave, ip, falhas: falhasGravar, nivel, bloqueadoAte, ultimaTentativaEm: agora },
      update: { falhas: falhasGravar, nivel, bloqueadoAte, ultimaTentativaEm: agora, ...(opt.tenantId ? { tenantId: opt.tenantId } : {}) },
    })
    if (bloqueou) {
      await registrarEvento({
        tenantId: opt.tenantId, userId: opt.userId, ip, userAgent: opt.userAgent,
        tipo: escopo === 'login' ? 'login_bloqueado' : '2fa_bloqueado', severidade: 'ATENCAO',
        detalhe: { nivel, minutos: Math.round((bloqueadoAte!.getTime() - agora.getTime()) / 60_000), chave: escopo === 'login' ? chave : undefined },
      })
    }
    return { bloqueou, falhas }
  } catch (e: any) {
    console.warn('[seguranca] contagem de falhas indisponível:', String(e?.code || e?.message).slice(0, 100))
    return { bloqueou: false, falhas: 0 }
  }
}

/** Login/2FA bem-sucedido: zera falhas e bloqueio (e o nível). */
export async function limparTentativas(escopo: Escopo, chave: string, ip: string): Promise<void> {
  try {
    await prisma.segTentativaLogin.deleteMany({ where: { escopo, chave, ip } })
  } catch {
    /* ignora */
  }
}

/** Para o job de limpeza: apaga registros sem atividade há `dias` e sem bloqueio vigente. */
export async function limparTentativasAntigas(dias = 7): Promise<number> {
  const corte = new Date(Date.now() - dias * 86_400_000)
  const r = await prisma.segTentativaLogin.deleteMany({
    where: { ultimaTentativaEm: { lt: corte }, OR: [{ bloqueadoAte: null }, { bloqueadoAte: { lt: new Date() } }] },
  })
  return r.count
}
