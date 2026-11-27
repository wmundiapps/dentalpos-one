import { prisma } from '../../lib/prisma'

// Identidade visual da instituição para telas, portal do aluno, certificados,
// históricos e qualquer documento impresso. Reaproveita Clinic.logo/cores
// quando a instituição ainda não cadastrou os ativos de marca.

export interface Branding {
  nome: string
  sigla?: string | null
  cnpj?: string | null
  codigoEmec?: string | null
  endereco?: string | null
  site?: string | null
  email?: string | null
  telefone?: string | null
  reitorNome?: string | null
  reitorCargo?: string | null
  cores: { primaria: string; secundaria: string; destaque: string }
  logos: Partial<Record<string, string>>    // kind -> dataUrl|url
  logoPrincipal: string | null
}

export async function getBranding(tenantId: string, campusId?: string | null): Promise<Branding> {
  const [inst, assets, clinic] = await Promise.all([
    prisma.eduInstitution.findUnique({ where: { tenantId } }),
    prisma.eduBrandAsset.findMany({
      where: { tenantId, ativo: true, OR: [{ campusId: null }, ...(campusId ? [{ campusId }] : [])] },
      orderBy: [{ updatedAt: 'asc' }],
    }),
    prisma.clinic.findFirst({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
  ])
  const logos: Record<string, string> = {}
  // marca geral (campusId nulo) primeiro; a do campus, por último, a sobrescreve
  const ordered = [...assets].sort((a, b) => Number(a.campusId != null) - Number(b.campusId != null))
  for (const a of ordered) {
    const src = a.dataUrl || a.url
    if (src) logos[a.kind] = src // campus (ordenado depois) sobrescreve a marca geral
  }
  const logoPrincipal = logos.LOGO_PRINCIPAL || logos.LOGO_HORIZONTAL || clinic?.logo || null
  return {
    nome: inst?.nome || clinic?.displayName || clinic?.name || 'Instituição de Ensino',
    sigla: inst?.sigla,
    cnpj: inst?.cnpj || clinic?.cnpj,
    codigoEmec: inst?.codigoEmec,
    endereco: inst?.endereco || [clinic?.address, clinic?.city, clinic?.state].filter(Boolean).join(', ') || null,
    site: inst?.site,
    email: inst?.email || clinic?.email,
    telefone: inst?.telefone || clinic?.phone,
    reitorNome: inst?.reitorNome,
    reitorCargo: inst?.reitorCargo,
    cores: {
      primaria: inst?.corPrimaria || clinic?.primaryColor || '#0F5FDB',
      secundaria: inst?.corSecundaria || clinic?.secondaryColor || '#0B1F3A',
      destaque: inst?.corDestaque || clinic?.accentColor || '#21C7A8',
    },
    logos,
    logoPrincipal,
  }
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

// Cabeçalho HTML padrão com espaço generoso para a logomarca — usado em
// certificados, declarações, históricos e relatórios impressos.
export function brandHeaderHtml(b: Branding, opts: { titulo?: string; subtitulo?: string } = {}) {
  const logo = b.logoPrincipal
    ? `<img src="${esc(b.logoPrincipal)}" alt="${esc(b.nome)}" style="max-height:96px;max-width:260px;object-fit:contain"/>`
    : `<div style="width:96px;height:96px;border:2px dashed #cbd5e1;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font:600 11px sans-serif;text-align:center">LOGOMARCA<br/>DA INSTITUIÇÃO</div>`
  return `<header style="display:flex;align-items:center;gap:24px;padding:20px 28px;border-bottom:4px solid ${esc(b.cores.primaria)}">
  <div style="min-width:120px;display:flex;justify-content:center">${logo}</div>
  <div style="flex:1;text-align:center;font-family:Georgia,serif">
    <div style="font-size:20px;font-weight:700;color:${esc(b.cores.secundaria)}">${esc(b.nome)}</div>
    ${b.cnpj ? `<div style="font-size:11px;color:#475569">CNPJ ${esc(b.cnpj)}${b.codigoEmec ? ' · e-MEC ' + esc(b.codigoEmec) : ''}</div>` : ''}
    ${b.endereco ? `<div style="font-size:11px;color:#475569">${esc(b.endereco)}</div>` : ''}
    ${opts.titulo ? `<div style="margin-top:8px;font-size:16px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${esc(b.cores.primaria)}">${esc(opts.titulo)}</div>` : ''}
    ${opts.subtitulo ? `<div style="font-size:12px;color:#475569">${esc(opts.subtitulo)}</div>` : ''}
  </div>
  <div style="min-width:120px"></div>
</header>`
}
export { esc as escapeHtml }
