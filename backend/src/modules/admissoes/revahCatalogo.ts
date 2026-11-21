// Ofertas do vestibular -> catálogo do Marketing (REVAH): viram cards do carrossel de ofertas
// ("Pedagogia · Licenciatura · EAD" com botão "Quero saber mais"). O clique volta como conversa atribuída no Marketing.
// Toda a comunicação passa pela ponte do DentalPos (@revah/dentalpos-one-adapter), pela clínica ligada ao tenant.
import { prisma } from '../../lib/prisma'
import { ensureProvisioned, getRevahFlag, revah, revahConfigured, REVAH_FLAG } from '../../services/revahBridge'
import { decryptSecret } from '../../services/secretVault'

export interface ItemCatalogo {
  externalRef: string
  kind: 'CURSO'
  title: string
  subtitle: string | null
  url: string | null
}

const MODALIDADE: Record<string, string> = { PRESENCIAL: 'Presencial', SEMIPRESENCIAL: 'Semipresencial', EAD: 'EAD' }
const TURNO: Record<string, string> = { MATUTINO: 'Manhã', VESPERTINO: 'Tarde', NOTURNO: 'Noite', INTEGRAL: 'Integral', FLEXIVEL: 'Horário flexível' }

// Pura (testada no __selftest__): uma oferta vira um item de catálogo.
export function ofertaParaCatalogo(o: { id: string; nomeCurso: string; modalidade: string; turno: string; poloNome?: string | null }, urlInscricao?: string | null): ItemCatalogo {
  const partes = [MODALIDADE[o.modalidade] || o.modalidade, o.modalidade === 'EAD' ? null : TURNO[o.turno] || o.turno, o.poloNome?.trim() || null].filter(Boolean)
  return {
    externalRef: `edumaster:oferta:${o.id}`,
    kind: 'CURSO',
    title: o.nomeCurso.trim().slice(0, 60),
    subtitle: partes.join(' · ').slice(0, 90) || null,
    url: urlInscricao || null,
  }
}

async function clinicaDoTenant(tenantId: string, clinicId?: string | null) {
  if (clinicId) return clinicId
  const flag = await prisma.tenantFeatureFlag.findFirst({ where: { tenantId, key: REVAH_FLAG, enabled: true }, select: { clinicId: true } })
  return flag?.clinicId || null
}

// Envia as ofertas ativas dos processos seletivos ABERTOS. Ofertas encerradas saem do catálogo (ficam desativadas no Marketing).
export async function sincronizarCatalogoRevah(tenantId: string, clinicId?: string | null) {
  if (!revahConfigured()) return { pulado: 'Integração com o Marketing não configurada.' }
  const clinica = await clinicaDoTenant(tenantId, clinicId)
  if (!clinica) return { pulado: 'Nenhuma unidade com o Marketing ativo.' }
  const { row } = await getRevahFlag(clinica)
  if (!row?.enabled) return { pulado: 'Marketing desativado para esta unidade.' }
  const ofertas = await prisma.admOferta.findMany({
    where: { tenantId, ativo: true, processo: { status: 'ABERTO' } },
    orderBy: { nomeCurso: 'asc' },
    take: 500,
  })
  // Link de inscrição opcional por oferta: EDU_INSCRICAO_URL com {oferta} (ex.: https://site/inscricao?oferta={oferta}).
  const modelo = process.env.EDU_INSCRICAO_URL || ''
  const itens = ofertas.map((o) => ofertaParaCatalogo(o, modelo.includes('{oferta}') ? modelo.replace('{oferta}', encodeURIComponent(o.id)) : null))
  const meta = await ensureProvisioned(clinica)
  const apiKey = decryptSecret<string>(meta.encryptedApiKey)
  if (!apiKey) return { pulado: 'Unidade sem chave do Marketing.' }
  const r = await revah().syncCatalog(apiKey, itens, { source: 'EDUMASTER' })
  return { ofertas: itens.length, ...r }
}

// Todos os tenants com o Marketing ativo (rodado pelo cron /api/cron/edu).
export async function sincronizarCatalogosRevah() {
  if (!revahConfigured()) return { pulado: 'Integração com o Marketing não configurada.' }
  const flags = await prisma.tenantFeatureFlag.findMany({ where: { key: REVAH_FLAG, enabled: true }, select: { tenantId: true, clinicId: true } })
  const out: Record<string, unknown> = {}
  for (const f of flags) {
    const tem = await prisma.admOferta.count({ where: { tenantId: f.tenantId, ativo: true } })
    if (!tem) continue
    try {
      out[f.tenantId] = await sincronizarCatalogoRevah(f.tenantId, f.clinicId)
    } catch (e: any) {
      out[f.tenantId] = { erro: e?.message || String(e) }
    }
  }
  return out
}
