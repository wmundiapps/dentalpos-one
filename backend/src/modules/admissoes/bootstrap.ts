import { prisma } from '../../lib/prisma'
import { DOCUMENTOS_PADRAO } from './services'

export const BOLSAS_PADRAO = [
  { nome: 'Bolsa Mérito Vestibular (30%)', tipo: 'BOLSA' as const, percentual: 30, regras: { notaMinima: 80, niveis: ['GRADUACAO'] }, cumulativa: false },
  { nome: 'Desconto Portador de Diploma (20%)', tipo: 'DESCONTO' as const, percentual: 20, regras: { tiposProcesso: ['PORTADOR_DIPLOMA'] }, cumulativa: false },
  { nome: 'Desconto Transferência Externa (15%)', tipo: 'DESCONTO' as const, percentual: 15, regras: { tiposProcesso: ['TRANSFERENCIA_EXTERNA'] }, cumulativa: false },
  { nome: 'Bolsa Nota ENEM 700+ (40%)', tipo: 'BOLSA' as const, percentual: 40, regras: { notaMinima: 70, tiposProcesso: ['ENEM'] }, cumulativa: false },
  { nome: 'Desconto Egresso Pós-graduação (15%)', tipo: 'DESCONTO' as const, percentual: 15, regras: { niveis: ['POS_LATO', 'POS_STRICTO'], cotas: ['EGRESSO'] }, cumulativa: true },
  { nome: 'Convênio Empresarial (10%)', tipo: 'CONVENIO' as const, percentual: 10, regras: {}, convenioEmpresa: null, cumulativa: true, ativo: false },
  { nome: 'Indicação de Aluno (5%)', tipo: 'BOLSA' as const, percentual: 5, regras: { cotas: ['INDICACAO'] }, cumulativa: true },
]

// Idempotente: cria apenas o que não existe.
export async function bootstrapAdmissoes(tenantId: string) {
  let docs = 0, bolsas = 0
  for (const d of DOCUMENTOS_PADRAO) {
    const ex = await prisma.admDocumentoTipo.findUnique({ where: { tenantId_codigo: { tenantId, codigo: d.codigo } } })
    if (!ex) { await prisma.admDocumentoTipo.create({ data: { tenantId, ...d } }); docs++ }
  }
  for (const b of BOLSAS_PADRAO) {
    const ex = await prisma.admBolsa.findFirst({ where: { tenantId, nome: b.nome } })
    if (!ex) { await prisma.admBolsa.create({ data: { tenantId, ...b, regras: b.regras as any, ativo: (b as any).ativo ?? true } }); bolsas++ }
  }
  return { documentosCriados: docs, bolsasCriadas: bolsas }
}
