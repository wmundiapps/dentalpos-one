// npx tsx src/modules/infraestrutura/etiquetas/selftest.ts  — gera arquivos em $OUT (padrão /tmp/etq) p/ conferir com decodificador externo.
import fs from 'fs'
import { gerarQr } from './qr'
import { larguraBarras, codificarCode128 } from './code128'
import { LAYOUTS_PADRAO, planejarPaginas, renderPdf, renderSvgPagina, validarLayout } from './render'

const out = process.env.OUT || '/tmp/etq'
fs.mkdirSync(out, { recursive: true })
let falhas = 0
const ok = (c: any, m: string) => { if (!c) { falhas++; console.log('FAIL', m) } else console.log('ok  ', m) }

// matrizes QR para decodificar fora (json)
const textos = ['EDU:BEM:PAT-000001', JSON.stringify({ t: 'INF_BEM', id: '3f1c2a9e-7d4b-4c1a-9b2e-0a1b2c3d4e5f', tomb: 'PAT-000123' }), 'x'.repeat(150), 'Ação ç ã é 日本', 'y'.repeat(300)]
const qrs = textos.map((t) => { const q = gerarQr(t); return { texto: t, versao: q.versao, modulos: q.modulos.map((r) => r.map((x) => (x ? 1 : 0)).join('')) } })
fs.writeFileSync(`${out}/qr.json`, JSON.stringify(qrs))
ok(qrs[0].versao <= 3, 'QR curto usa versão pequena')
const cods = ['PAT-000001', '123456', '1234567890', 'ABC-12345', 'Ola 2026/10', 'A1234567B']
fs.writeFileSync(`${out}/c128.json`, JSON.stringify(cods.map((c) => ({ texto: c, larguras: larguraBarras(c) }))))
for (const c of cods) { const w = larguraBarras(c); ok(w.reduce((a, b) => a + b, 0) === 11 * (codificarCode128(c).length - 1) + 13, `Code128 ${c}: largura total coerente`) }
for (const l of LAYOUTS_PADRAO) {
  ok(validarLayout(l) === null, `layout válido: ${l.nome}`)
  const dados = Array.from({ length: 30 }, (_, i) => ({ codigo: `PAT-${String(i + 1).padStart(6, '0')}`, nome: 'Microscópio binocular Olympus CX23 com iluminação LED', departamento: 'Odontologia', local: 'Lab 2 / Bloco B', responsavel: 'Maria Souza', categoria: 'Laboratório', instituicao: 'Faculdade Exemplo' }))
  const pg = planejarPaginas(l, dados)
  const slug = l.nome.replace(/[^a-z0-9]+/gi, '_')
  fs.writeFileSync(`${out}/${slug}.pdf`, renderPdf(l, pg))
  fs.writeFileSync(`${out}/${slug}.svg`, renderSvgPagina(l, pg[0]))
  console.log(l.nome, pg.length, 'páginas')
}
console.log(falhas ? `${falhas} falhas` : 'selftest ok')
process.exit(falhas ? 1 : 0)
