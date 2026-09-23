// Fontes internas do REVAH Leads. Nomes de fontes NUNCA saem na API pública.
// Somente vias oficiais/licenciadas: dados públicos de CNPJ, Google Places API e Meta Lead Ads.
// Scraping de LinkedIn/Instagram/Facebook NÃO está implementado (decisão pendente — ver docs).
import { config } from '../../config'
import { digits, normalizeEmail, normalizePhone } from '../../lib/normalize'
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
  origin: string
  originRef: string
}

export async function lookupCompany(cnpjRaw: string): Promise<RawLead | null> {
  const cnpj = digits(cnpjRaw)
  if (cnpj.length !== 14) return null
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
  if (!config.leads.googlePlacesKey) throw new Error('Busca local indisponível no momento.')
  const d = await httpJson('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': config.leads.googlePlacesKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.primaryTypeDisplayName,places.addressComponents',
    },
    body: JSON.stringify({ textQuery: [query, city].filter(Boolean).join(' em '), languageCode: 'pt-BR', regionCode: 'BR', pageSize: Math.min(20, limit) }),
  })
  return (d.places || []).map((p: any) => {
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
