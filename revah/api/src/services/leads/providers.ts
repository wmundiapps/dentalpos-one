// Fontes internas do REVAH Leads. Nomes de fontes NUNCA saem na API pública.
// Somente vias oficiais/licenciadas: dados públicos de CNPJ, Google Places API e Meta Lead Ads.
// Scraping de LinkedIn/Instagram/Facebook NÃO está implementado (decisão pendente — ver docs).
import { config } from '../../config'
import { digits, normalizeEmail, normalizePhone, searchText } from '../../lib/normalize'
import { prisma } from '../../lib/prisma'
import { HttpError } from '../../lib/errors'
import { httpJson } from '../channels/types'

export interface RawLead {
  name: string
  company?: string | null
  document?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  category?: string | null
  isMei?: boolean
  origin: string
  originRef: string
}

type CompanyRow = Awaited<ReturnType<typeof prisma.companyRecord.findFirst>>

function companyLead(c: NonNullable<CompanyRow>, cnaeNames: Map<string, string>): RawLead {
  return {
    name: c.tradeName || c.legalName || c.cnpj,
    company: c.legalName || c.tradeName,
    document: c.cnpj,
    phone: c.phone,
    email: c.email,
    address: [c.address, c.district].filter(Boolean).join(', ') || null,
    city: c.city,
    state: c.uf,
    category: cnaeNames.get(c.cnae) || null,
    isMei: c.isMei,
    origin: 'cnpj_public',
    originRef: c.cnpj,
  }
}

async function cnaeNames(codes: string[]) {
  const rows = await prisma.cnaeCode.findMany({ where: { code: { in: [...new Set(codes)] } } })
  return new Map(rows.map((r) => [r.code, r.description]))
}

// Segmentos (CNAE) por código ou por texto, para a busca por segmento.
export async function findSegments(q: string, take = 20) {
  const d = digits(q)
  if (d.length >= 2 && d.length === q.replace(/[\s./-]/g, '').length) return prisma.cnaeCode.findMany({ where: { code: { startsWith: d } }, take, orderBy: { code: 'asc' } })
  const words = searchText(q).split(' ').filter((w) => w.length > 1)
  if (!words.length) return []
  return prisma.cnaeCode.findMany({ where: { AND: words.map((w) => ({ searchNorm: { contains: w } })) }, take, orderBy: { code: 'asc' } })
}

export async function companyBaseStatus() {
  const last = await prisma.companyImport.findFirst({ where: { status: 'DONE' }, orderBy: { finishedAt: 'desc' } })
  return { available: Boolean(last), refMonth: last?.refMonth || null, updatedAt: last?.finishedAt || null }
}

// Empresas ativas por segmento + UF/cidade, na base empresarial carregada.
export async function searchCompanies(p: { cnaes: string[]; uf?: string | null; city?: string | null; limit: number; excludeRefs: string[]; mei?: 'ALL' | 'ONLY' | 'EXCLUDE' }): Promise<RawLead[]> {
  if (!p.cnaes.length) return []
  const rows = await prisma.companyRecord.findMany({
    where: {
      OR: p.cnaes.map((c) => (c.length === 7 ? { cnae: c } : { cnae: { startsWith: c } })),
      ...(p.uf ? { uf: p.uf.toUpperCase() } : {}),
      ...(p.city ? { cityNorm: searchText(p.city) } : {}),
      ...(p.excludeRefs.length ? { cnpj: { notIn: p.excludeRefs } } : {}),
      ...(p.mei === 'ONLY' ? { isMei: true } : p.mei === 'EXCLUDE' ? { isMei: false } : {}),
    },
    orderBy: { openedAt: 'desc' },
    take: p.limit,
  })
  const names = await cnaeNames(rows.map((r) => r.cnae))
  return rows.map((r) => companyLead(r, names))
}

export async function lookupCompany(cnpjRaw: string): Promise<RawLead | null> {
  const cnpj = digits(cnpjRaw)
  if (cnpj.length !== 14) return null
  const local = await prisma.companyRecord.findUnique({ where: { cnpj } }).catch(() => null)
  if (local) return companyLead(local, await cnaeNames([local.cnae]))
  try {
    const d = await httpJson(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { timeoutMs: 12000 })
    const phone = normalizePhone(d.ddd_telefone_1 || d.ddd_telefone_2)
    return {
      name: d.nome_fantasia || d.razao_social,
      company: d.razao_social,
      document: cnpj,
      phone,
      email: normalizeEmail(d.email),
      address: [d.descricao_tipo_de_logradouro, d.logradouro, d.numero, d.bairro].filter(Boolean).join(', ') || null,
      city: d.municipio || null,
      state: d.uf || null,
      category: d.cnae_fiscal_descricao || null,
      origin: 'cnpj_public',
      originRef: cnpj,
    }
  } catch (e: any) {
    if (e?.status === 404) return null
    throw e
  }
}

export async function searchLocalBusinesses(query: string, city?: string | null, limit = 20): Promise<RawLead[]> {
  if (!config.leads.googlePlacesKey) throw new HttpError(503, 'Busca de negócios locais indisponível no momento. Fale com o suporte.', 'LEADS_SOURCE_UNAVAILABLE')
  // A API devolve até 20 por página e até 60 no total (3 páginas).
  const places: any[] = []
  let pageToken: string | undefined
  do {
    const d = await httpJson('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': config.leads.googlePlacesKey,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.primaryTypeDisplayName,places.addressComponents,nextPageToken',
      },
      body: JSON.stringify({ textQuery: [query, city].filter(Boolean).join(' em '), languageCode: 'pt-BR', regionCode: 'BR', pageSize: Math.min(20, limit - places.length), ...(pageToken ? { pageToken } : {}) }),
    })
    places.push(...(d.places || []))
    pageToken = d.nextPageToken
  } while (pageToken && places.length < Math.min(60, limit))
  return places.slice(0, limit).map((p: any) => {
    const comp = (type: string) => p.addressComponents?.find((c: any) => c.types?.includes(type))
    return {
      name: p.displayName?.text || 'Empresa',
      company: p.displayName?.text || null,
      phone: normalizePhone(p.internationalPhoneNumber || p.nationalPhoneNumber),
      website: p.websiteUri || null,
      address: p.formattedAddress || null,
      city: comp('administrative_area_level_2')?.longText || null,
      state: comp('administrative_area_level_1')?.shortText || null,
      category: p.primaryTypeDisplayName?.text || null,
      origin: 'places',
      originRef: p.id,
    } as RawLead
  })
}

// Meta Lead Ads: busca os campos de um lead recebido pelo webhook "leadgen".
export async function fetchAdLead(leadgenId: string, pageAccessToken: string): Promise<RawLead> {
  const d = await httpJson(`https://graph.facebook.com/${config.meta.graphVersion}/${leadgenId}?fields=field_data,created_time,form_id`, {
    headers: { Authorization: `Bearer ${pageAccessToken}` },
  })
  const f: Record<string, string> = {}
  for (const x of d.field_data || []) f[String(x.name).toLowerCase()] = Array.isArray(x.values) ? x.values[0] : ''
  const name = f.full_name || [f.first_name, f.last_name].filter(Boolean).join(' ') || 'Lead de anúncio'
  return {
    name,
    company: f.company_name || null,
    phone: normalizePhone(f.phone_number || f.phone),
    email: normalizeEmail(f.email),
    city: f.city || null,
    state: f.state || null,
    origin: 'ads_form',
    originRef: leadgenId,
  }
}
