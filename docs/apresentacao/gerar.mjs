// Gera apresentacao.html e o PDF a partir de frontend/src/edu/apresentacao/conteudo.json (mesma fonte da capa do site).
// Uso: node docs/apresentacao/gerar.mjs   (CHROME=/caminho/do/chrome se necessário)
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aqui, '..', '..')
const c = JSON.parse(readFileSync(join(raiz, 'frontend/src/edu/apresentacao/conteudo.json'), 'utf8'))
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]))
const lista = (itens) => `<ul>${itens.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`
const temCv = Boolean(c.curriculo.nome || c.curriculo.resumo || c.curriculo.itens.length)
const temContato = Boolean(c.contato.email || c.contato.telefone)

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(c.produto.completo)}</title>
<style>
@page { size: A4; margin: 0 }
* { box-sizing: border-box }
body { margin: 0; font-family: "Helvetica Neue", Arial, sans-serif; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact }
.pag { width: 210mm; height: 297mm; padding: 16mm 16mm; page-break-after: always; position: relative; overflow: hidden }
.capa { color: #fff; background: radial-gradient(circle at 15% 15%, rgba(21,101,192,.45), transparent 40%), linear-gradient(135deg,#07111f,#102a43 55%,#0b5fff); display: flex; flex-direction: column; justify-content: center }
.logo { display: flex; align-items: center; gap: 14px; margin-bottom: 26px }
.em { width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg,#0F5FDB,#6366F1); display: grid; place-items: center; font-weight: 800; font-size: 24px }
.capa h1 { font-size: 40px; margin: 0; letter-spacing: -1px }
.capa h2 { font-size: 24px; line-height: 1.3; margin: 0 0 12px }
.capa p { font-size: 15px; opacity: .88; line-height: 1.5 }
.box { margin-top: 26px; padding: 18px 20px; border-radius: 14px; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.25) }
.box small { letter-spacing: 2px; text-transform: uppercase; opacity: .8; font-size: 11px }
.box h3 { margin: 4px 0 6px; font-size: 20px }
.tags span { display: inline-block; margin: 8px 6px 0 0; padding: 4px 12px; border-radius: 999px; background: rgba(255,255,255,.18); font-size: 12px }
h2.t { font-size: 24px; margin: 0 0 14px; color: #0b2a5b }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px }
.card { border: 1px solid #dbe3f0; border-radius: 12px; padding: 14px 16px; background: #fff }
.card h3 { margin: 0 0 6px; font-size: 15px; color: #0b5fff }
ul { margin: 6px 0 0; padding-left: 18px }
li { font-size: 12.5px; line-height: 1.45; margin: 3px 0 }
.dest { border-left: 6px solid #0F5FDB; background: #f1f6ff; border-radius: 10px; padding: 14px 18px; margin-bottom: 14px }
.rod { position: absolute; left: 16mm; right: 16mm; bottom: 10mm; font-size: 10px; color: #64748b; display: flex; justify-content: space-between }
.cv h3 { margin: 0 0 4px }
</style></head><body>

<section class="pag capa">
  <div class="logo"><div class="em">EM</div><h1>${esc(c.produto.completo)}</h1></div>
  <h2>${esc(c.produto.tagline)}</h2>
  <p>${esc(c.produto.subtitulo)}</p>
  <div class="box">
    <small>Desenvolvido por</small>
    <h3>${esc(c.wmundi.nome)}</h3>
    <p style="margin:0;font-size:13.5px">${esc(c.wmundi.resumo)}</p>
    <div class="tags"><span>Apple · iOS</span><span>Android</span><span>Web e nuvem</span><span>IA aplicada</span></div>
  </div>
  <p style="margin-top:22px;font-size:13px"><b>Tudo criptografado.</b> ${esc(c.seguranca.itens[0])}; dados sensíveis protegidos com AES-256. A tecnologia anti-código também reforça a proteção contra ataques.</p>
</section>

<section class="pag">
  <h2 class="t">Sobre a ${esc(c.wmundi.nome)}</h2>
  <div class="card"><p style="margin:0;font-size:13.5px;line-height:1.5">${esc(c.wmundi.resumo)}</p>${lista(c.wmundi.itens)}</div>
  ${temCv ? `<div class="card cv" style="margin-top:14px"><h3>${esc(c.curriculo.nome)}${c.curriculo.cargo ? ' · ' + esc(c.curriculo.cargo) : ''}</h3>${c.curriculo.resumo ? `<p style="margin:0;font-size:13px;line-height:1.5">${esc(c.curriculo.resumo)}</p>` : ''}${c.curriculo.itens.length ? lista(c.curriculo.itens) : ''}</div>` : ''}
  <h2 class="t" style="margin-top:22px">O que o ${esc(c.produto.nome)} entrega</h2>
  <div class="grid">${c.pilares.slice(0, 4).map((p) => `<div class="card"><h3>${esc(p.titulo)}</h3>${lista(p.itens)}</div>`).join('')}</div>
  <div class="rod"><span>${esc(c.produto.completo)}</span><span>${esc(c.wmundi.nome)}</span></div>
</section>

<section class="pag">
  <div class="grid">${c.pilares.slice(4).map((p) => `<div class="card"><h3>${esc(p.titulo)}</h3>${lista(p.itens)}</div>`).join('')}</div>
  <div class="dest" style="margin-top:16px"><h3 style="margin:0 0 6px;color:#0b2a5b">🔒 ${esc(c.seguranca.titulo)}</h3>${lista(c.seguranca.itens)}</div>
  <div class="card"><h3>${esc(c.lgpd.titulo)}</h3>${lista(c.lgpd.itens)}</div>
  ${temContato ? `<div class="card" style="margin-top:14px"><h3>Contato</h3><p style="margin:0;font-size:13px">${esc([c.contato.nome, c.contato.email, c.contato.telefone].filter(Boolean).join(' · '))}</p></div>` : ''}
  <p style="font-size:11px;color:#64748b;margin-top:14px">Ambiente de demonstração com dados fictícios. Os textos legais (política de privacidade, termos e contrato de operador) são modelos a validar com assessoria jurídica da instituição.</p>
  <div class="rod"><span>${esc(c.produto.completo)}</span><span>${esc(c.wmundi.nome)}</span></div>
</section>
</body></html>`

const htmlPath = join(aqui, 'apresentacao.html')
writeFileSync(htmlPath, html)
const candidatos = [process.env.CHROME, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean)
const chrome = candidatos.find((p) => existsSync(p))
if (!chrome) { console.error('Chrome/Chromium não encontrado; defina CHROME=...'); process.exit(1) }
const pdf = join(aqui, 'apresentacao-edumaster.pdf')
execFileSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdf}`, `file://${htmlPath}`], { stdio: 'ignore' })
copyFileSync(pdf, join(raiz, 'frontend/public/apresentacao-edumaster.pdf'))
console.log('PDF gerado:', pdf)
