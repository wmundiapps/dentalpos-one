/**
 * Logomarca de demonstração corrigida: no seed principal o texto "SUA INSTITUIÇÃO" (46px) passa da largura do SVG (520) e
 * aparece cortado ("SUA INSTITUIÇ") nas telas. Aqui o texto tem 34px e o SVG 560 de largura. Idempotente: envia novas versões
 * de LOGO_PRINCIPAL e LOGO_ESCURA (a mais recente vale). Uso: await seedMarca(api)  // api(method, path, body?)
 */
export type SeedApi = (method: string, path: string, body?: any) => Promise<any>

const ouro = '#D4A017'
const logo = (escura: boolean) => {
  const cor = escura ? '#FFFFFF' : '#1F3A8A'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 160" width="560" height="160"><circle cx="80" cy="80" r="66" fill="${escura ? 'none' : '#1F3A8A'}" stroke="${ouro}" stroke-width="6"/><text x="80" y="102" text-anchor="middle" font-family="Georgia,serif" font-size="62" font-weight="700" fill="${escura ? '#FFFFFF' : ouro}">SI</text><text x="170" y="74" font-family="Georgia,serif" font-size="34" font-weight="700" fill="${cor}">SUA INSTITUIÇÃO</text><text x="172" y="108" font-family="Arial,sans-serif" font-size="17" letter-spacing="3" fill="${escura ? '#E5E7EB' : '#4B5563'}">ENSINO SUPERIOR</text><rect x="172" y="120" width="120" height="4" fill="${ouro}"/></svg>`
}
const du = (x: string) => 'data:image/svg+xml;base64,' + Buffer.from(x).toString('base64')

export async function seedMarca(api: SeedApi) {
  await api('POST', '/edu/core/marca', { kind: 'LOGO_PRINCIPAL', titulo: 'Logomarca principal', dataUrl: du(logo(false)), largura: 560, altura: 160 })
  await api('POST', '/edu/core/marca', { kind: 'LOGO_ESCURA', titulo: 'Logomarca para fundo escuro', dataUrl: du(logo(true)), largura: 560, altura: 160 })
}
