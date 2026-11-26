/**
 * Seed do ACESSO POR CARGO: matriz padrão para o piloto (Uningá).
 *   - Acesso amplo: todo cargo interno (secretaria, marketing, RH, suprimentos, coordenação etc.) vê os módulos de
 *     gestão normalmente; só o Financeiro/Tesouraria/Cobrança/Caixa de boletos fica restrito a FINANCE e à Reitoria
 *     (RECTOR já é cargo SUPER, então nunca é bloqueado — ver abaixo).
 *   - SECRETARY e MARKETING sem Financeiro / Tesouraria / Cobrança / Caixa de boletos (dados financeiros da
 *     instituição não são de rotina desses setores).
 *   - MARKETING: concessão (PERMITIR) em Atendimento.
 *   - FINANCE: concessão (PERMITIR) em Suprimentos (compras ligadas ao contas a pagar).
 *   - STUDENT sem módulos de gestão (Financeiro acadêmico/Tesouraria/RH/Jurídico), sem tocar nos portais.
 * Cargos SUPER (ADMIN, OWNER, RECTOR, BOARD) nunca são afetados: apresentacao@uninga.br (ADMIN) segue vendo tudo.
 * IMPORTANTE: rode este seed por ÚLTIMO — outros seeds usam usuários por papel (ex.: ctx.apiAs('FINANCE')) e dependem do acesso padrão.
 *
 *   import { seedAcesso } from './seeds/acesso'
 *   await seedAcesso(api, ctx)    // api(method, path, body?) -> corpo JSON ou null em caso de erro (deve estar logada como ADMIN/OWNER)
 *
 * Usa SOMENTE a API (PUT /edu/acesso/regras), é idempotente (reaplicar não muda nada) e dados 100% fictícios.
 */
export type SeedApi = (method: string, path: string, body?: any) => Promise<any>
export interface SeedCtx { tenantId?: string; failures?: string[] }

export interface ResumoSeedAcesso { regras: number; alteradas: number }

const BLOQUEIOS: Record<string, string[]> = {
  SECRETARY: ['financeiro', 'tesouraria', 'cobranca', 'boletos'],
  MARKETING: ['financeiro', 'tesouraria', 'cobranca', 'boletos'],
  STUDENT: ['tesouraria', 'cobranca', 'boletos', 'rh', 'juridico', 'suprimentos', 'infraestrutura', 'governanca', 'reitoria'],
}
const CONCESSOES: Record<string, string[]> = {
  FINANCE: ['suprimentos'],
  MARKETING: ['atendimento'],
}

export async function seedAcesso(api: SeedApi, ctx: SeedCtx = {}): Promise<ResumoSeedAcesso> {
  const alteracoes: Array<{ cargo: string; modulo: string; estado: string }> = []
  for (const [cargo, mods] of Object.entries(BLOQUEIOS)) for (const modulo of mods) alteracoes.push({ cargo, modulo, estado: 'BLOQUEAR' })
  for (const [cargo, mods] of Object.entries(CONCESSOES)) for (const modulo of mods) alteracoes.push({ cargo, modulo, estado: 'PERMITIR' })
  const r = await api('PUT', '/edu/acesso/regras', { alteracoes })
  if (!r) {
    ctx.failures?.push('seedAcesso: não foi possível salvar a matriz (usuário precisa ser ADMIN/OWNER)')
    return { regras: alteracoes.length, alteradas: 0 }
  }
  return { regras: alteracoes.length, alteradas: Number(r.alteradas) || 0 }
}
