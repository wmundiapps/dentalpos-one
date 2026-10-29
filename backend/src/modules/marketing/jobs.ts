import { registerEduJob } from '../core/jobs'
import { db } from './common'
import { processarCadencias, sincronizarAdmissoes } from './leads'
import { jobDisparos, jobPublicacoes } from './rotas-disparos'
import { lembretesEventos } from './rotas-site'

export function registerMktJobs() {
  registerEduJob('marketing.disparos-e-envios', jobDisparos)
  registerEduJob('marketing.cadencias', () => processarCadencias())
  registerEduJob('marketing.publicacoes', jobPublicacoes)
  registerEduJob('marketing.lembretes-eventos', lembretesEventos)
  registerEduJob('marketing.sync-admissoes', async () => {
    const ts = await db.mktLead.findMany({ distinct: ['tenantId'], select: { tenantId: true }, take: 200 })
    let n = 0; for (const t of ts) { const r = await sincronizarAdmissoes(t.tenantId); n += r.atualizados + r.importados }
    return { tenants: ts.length, alterados: n }
  })
}
