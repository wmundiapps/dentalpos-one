// Guia ilustrado (coluna única, leitura no celular). Uso: node docs/apresentacao/gerar-guia.mjs [pasta-de-shots-reduzidos]
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aqui, '..', '..')
const fonte = join(aqui, 'fonte')
const shots = resolve(process.argv[2] || join(fonte, 'shots-s'))
const c = JSON.parse(readFileSync(join(raiz, 'frontend/src/edu/apresentacao/conteudo.json'), 'utf8'))
const J = (f) => JSON.parse(readFileSync(join(fonte, f), 'utf8'))
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]))
const slug = (r) => r.replace(/^\/edu\/?/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'painel'
const ul = (a) => (a && a.length ? `<ul>${a.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '')
const paras = (t) => String(t || '').split(/\n+/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('')
const logoB64 = readFileSync(join(raiz, 'frontend/public/wmundi-logo.png')).toString('base64')
const logo = (h) => `<img style="height:${h}px;border-radius:6px" src="data:image/png;base64,${logoB64}">`
const contato = [c.contato.site, c.contato.email, 'WhatsApp ' + c.contato.telefone, c.contato.endereco].filter(Boolean).join(' · ')

const ORDEM = ['PDI e Gestão Institucional', 'Infraestrutura', 'Pedagógico', 'Docente', 'Discente', 'Administrativo e Financeiro', 'Relacionamento e Captação', 'Segurança e LGPD']
const INTRO = {
  'PDI e Gestão Institucional': 'Planejamento institucional, avaliação interna e externa, comissões e indicadores: a gestão enxerga a instituição inteira e se prepara para o MEC o ano todo, não só na véspera da visita.',
  'Infraestrutura': 'Espaços, salas, laboratórios, campos de prática e patrimônio sob controle, com agenda, manutenção e alertas que acontecem sozinhos.',
  'Pedagógico': 'Matrizes, turmas, avaliações, conteúdo e acompanhamento do ensino em um fluxo contínuo, apoiado por inteligência artificial e pela literatura da área.',
  'Docente': 'Menos burocracia e mais sala de aula: diário, planejamento, provas e relatórios com ajuda automática.',
  'Discente': 'Uma jornada do aluno simples, no celular, com tudo o que ele precisa em um só lugar, do ingresso ao diploma.',
  'Administrativo e Financeiro': 'Caixa, cobrança, contratos, compras, pessoal e jurídico integrados: a informação chega até você, sem planilha paralela.',
  'Relacionamento e Captação': 'Atendimento, comunicação e captação de alunos com robôs e inteligência artificial trabalhando o dia inteiro.',
  'Segurança e LGPD': 'Proteção de dados e conformidade desde o projeto, com criptografia e trilha de auditoria.',
}
const itens = ['inventario-1.json', 'inventario-2.json', 'inventario-3.json', 'inventario-4.json'].flatMap(J)
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const porNucleo = (n) => itens.filter((i) => i.nucleo === n).sort((a, b) => norm(a.modulo).localeCompare(norm(b.modulo), 'pt'))

const img = (it) => {
  for (const t of it.telas_para_print || []) {
    const f = join(shots, slug(t.rota) + '.jpg')
    if (existsSync(f)) return `<figure><img src="file://${f}"><figcaption>${esc(t.legenda || it.modulo)}</figcaption></figure>`
  }
  const f = join(shots, slug(it.rota.split(' ')[0]) + '.jpg')
  return existsSync(f) ? `<figure><img src="file://${f}"><figcaption>${esc(it.modulo)}</figcaption></figure>` : ''
}
const bloco = (t, a, cls = '') => (a && a.length ? `<div class="bl ${cls}"><h5>${t}</h5>${ul(a)}</div>` : '')
let nIt = 0
const secaoItem = (it) => {
  nIt++
  return `<article class="it"><h3>${esc(it.modulo)}</h3><h4>${esc(it.titulo_chamada)}</h4>${paras(it.descricao)}${img(it)}${bloco('O que você ganha', it.funcionalidades)}${bloco('Acontece sozinho', it.automacoes, 'auto')}${bloco('Inteligência artificial', it.ia, 'ia')}${bloco('Base normativa e literatura', it.base_normativa_literatura, 'norma')}${bloco('Em evolução', it.limites, 'lim')}</article>`
}
const nucleos = ORDEM.map((n, k) => {
  const lst = porNucleo(n)
  return `<section class="nuc"><div class="nh">Núcleo ${k + 1}</div><h2>${esc(n)}</h2><p class="ni">${esc(INTRO[n])}</p><ol class="ix">${lst.map((i) => `<li>${esc(i.modulo)}</li>`).join('')}</ol>${lst.map(secaoItem).join('')}</section>`
}).join('')

const refs = J('referencias-ia.json').filter((r) => r.confiabilidade === 'alta')
const sIA = `<section class="nuc"><div class="nh">Inteligência artificial</div><h2>IA que já funciona em universidades</h2><p class="ni">Tudo no EduMaster Pro é pensado com a literatura científica e com experiências reais de universidades do Brasil e do mundo. A IA ajuda, resume, avisa e atende; as decisões continuam com as pessoas. Exemplos publicados:</p>${refs.map((r) => `<article class="it"><h3>${esc(r.instituicao)} <small>${esc(r.pais)} · ${esc(r.ano)}</small></h3><p>${esc(r.resumo)}</p><p><b>Resultado:</b> ${esc(r.resultado)}</p><p class="url">${esc(r.url)}</p></article>`).join('')}</section>`

const cob = [...J('cobertura-1.json'), ...J('cobertura-2.json')]
const rot = { true: 'Disponível', SIM: 'Disponível', PARCIAL: 'Disponível em parte', NAO: 'Em desenvolvimento' }
const sCob = `<section class="nuc"><div class="nh">Checklist</div><h2>O que você pediu, onde está</h2>${cob.map((i) => `<article class="it"><h3>${esc(i.item)}</h3><p class="st st-${esc(i.existe === true ? 'SIM' : i.existe)}">${esc(rot[i.existe] || i.existe)}</p><p>${esc(i.como_funciona)}</p>${i.observacao ? `<p class="obs">Em evolução: ${esc(i.observacao)}</p>` : ''}</article>`).join('')}</section>`

const seg = J('seguranca-lgpd.json')
const cats = [...new Set(seg.map((s) => s.categoria))]
const sSeg = `<section class="nuc"><div class="nh">Segurança</div><h2>Tudo criptografado</h2><p class="ni">Toda a comunicação é criptografada e a tecnologia anti-código usada também protege contra ataques. ${esc(c.seguranca.itens.slice(1, 4).join('. '))}.</p>${cats.map((k) => `<article class="it"><h3>${esc(k)}</h3>${seg.filter((s) => s.categoria === k).map((s) => `<p><b>${esc(s.controle)}.</b> ${esc(s.beneficio)}</p>`).join('')}</article>`).join('')}</section>`

const p = c.proposta
const sProp = `<section class="nuc"><div class="nh">Proposta</div><h2>${esc(p.titulo)}</h2><div class="dest"><b>${esc(p.implantacao)}</b><br><b>${esc(p.teste)}</b></div><p>Depois do teste: <b>${esc(p.valorFixo)}</b> + <b>${esc(p.valorAluno)}</b>.</p><p>${esc(p.terceiros)}</p><h3>${esc(p.app.titulo)}</h3>${ul(p.app.itens)}<div class="ct">${logo(54)}<h3>${esc(c.wmundi.nome)}</h3><p>${esc(c.wmundi.resumo)}</p><p><b>${esc(contato)}</b></p></div></section>`

const capa = `<section class="capa"><div class="em">EM</div><h1>${esc(c.produto.completo)}</h1><h2>${esc(c.produto.tagline)}</h2><p>Guia ilustrado de funcionalidades, com telas reais do sistema e a aplicação de cada uma na rotina da instituição.</p><p class="pts">Simples de aprender · Automatizado · Apoiado por IA · Baseado na literatura</p><div class="dev"><small>Desenvolvido por</small><br>${logo(46)}<p>${esc(contato)}</p></div></section>`
const indice = `<section class="nuc"><h2>Neste guia</h2><ol class="ix big">${ORDEM.map((n, k) => `<li>${k + 1}. ${esc(n)} <small>${porNucleo(n).length} módulos</small></li>`).join('')}<li>9. Inteligência artificial na educação</li><li>10. Checklist do que você pediu</li><li>11. Segurança e LGPD</li><li>12. Proposta comercial</li></ol><p>${esc(c.produto.subtitulo)}</p></section>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(c.produto.completo)} — Guia de funcionalidades</title><style>
@page{size:110mm 200mm;margin:8mm 7mm 10mm}
*{box-sizing:border-box}body{margin:0;font:13pt/1.5 Helvetica,Arial,sans-serif;color:#0f172a;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.capa{page-break-after:always;height:182mm;padding:10mm 4mm;color:#fff;margin:-8mm -7mm;padding:14mm 9mm;height:200mm;background:linear-gradient(135deg,#07111f,#102a43 55%,#0b5fff)}
.em{width:20mm;height:20mm;border-radius:50%;background:linear-gradient(135deg,#0F5FDB,#6366F1);display:grid;place-items:center;font-weight:800;font-size:22pt}
.capa h1{font-size:30pt;margin:6mm 0 2mm}.capa h2{color:#fff;font-size:15pt;line-height:1.3;margin:0 0 5mm}.capa p{font-size:11.5pt;opacity:.9}.pts{font-weight:700}
.dev{margin-top:8mm;padding:4mm;border-radius:4mm;background:rgba(255,255,255,.12)}.dev small{text-transform:uppercase;letter-spacing:1px}.dev p{font-size:9.5pt}
.nuc{page-break-before:always}.nh{color:#0b5fff;font-weight:800;text-transform:uppercase;letter-spacing:1px;font-size:10pt}
h2{font-size:21pt;line-height:1.2;color:#0b2a5b;margin:1mm 0 3mm}.ni{font-size:13pt;color:#334155}
.ix{padding-left:6mm;font-size:12pt}.ix li{margin:1mm 0}.ix.big li{font-size:14pt;margin:3mm 0}.ix.big{list-style:none;padding:0}.ix small{color:#64748b;font-size:10pt}
.it{margin-top:7mm;padding-top:5mm;border-top:2px solid #dbe3f0}h3{font-size:16pt;line-height:1.25;color:#0b2a5b;margin:0 0 1mm;page-break-after:avoid}h3 small{display:block;font-size:10pt;color:#64748b;font-weight:400}
h4{font-size:13pt;color:#0b5fff;margin:0 0 2mm;page-break-after:avoid}p{margin:2mm 0}
figure{margin:3mm auto;text-align:center;page-break-inside:avoid}figure img{width:44mm;border:1px solid #cbd5e1;border-radius:4mm;box-shadow:0 2px 8px rgba(0,0,0,.15)}figcaption{font-size:9.5pt;color:#64748b;margin-top:1mm}
.bl{margin-top:3mm;padding:3mm 4mm;border-radius:3mm;background:#f1f6ff}.bl h5{margin:0 0 1mm;font-size:11pt;color:#0b5fff;text-transform:uppercase;letter-spacing:.5px}
.bl.auto{background:#ecfdf5}.bl.auto h5{color:#047857}.bl.ia{background:#f5f3ff}.bl.ia h5{color:#6d28d9}.bl.norma{background:#f8fafc}.bl.norma h5{color:#475569}.bl.lim{background:#fffbeb}.bl.lim h5{color:#b45309}
ul{margin:1mm 0 0;padding-left:5mm}li{font-size:12pt;line-height:1.45;margin:1mm 0}
.url{font-size:8.5pt;color:#64748b;word-break:break-all}.st{display:inline-block;padding:1mm 3mm;border-radius:99px;font-size:10.5pt;font-weight:700;background:#dcfce7;color:#166534}.st-PARCIAL{background:#fef3c7;color:#92400e}.obs{font-size:11pt;color:#92400e}
.dest{border-left:2mm solid #0F5FDB;background:#f1f6ff;border-radius:3mm;padding:4mm;font-size:14pt}.ct{margin-top:8mm;padding:5mm;border-radius:4mm;background:#f1f6ff}
</style></head><body>${capa}${indice}${nucleos}${sIA}${sCob}${sSeg}${sProp}</body></html>`

const saida = join(aqui, 'guia-edumaster.html')
writeFileSync(saida, html)
const chrome = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const pdf = join(aqui, 'guia-edumaster.pdf')
execFileSync(chrome, ['--headless=new', '--no-sandbox', '--allow-file-access-from-files', '--no-pdf-header-footer', `--print-to-pdf=${pdf}`, 'file://' + saida], { stdio: 'inherit' })
console.log('itens', nIt, '->', pdf)
