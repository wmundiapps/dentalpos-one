// Gera os cards do carrossel da Meta (1080x1350, proporção 4:5) em PNG: carrossel/01.png ... 06.png.
// Uso: cd marketing/black-friday && node gerar-carrossel.mjs   (precisa de playwright)
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const dir = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(dir, 'carrossel')
fs.mkdirSync(out, { recursive: true })
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(dir, '../../frontend/public/brand/logo-leao.png')).toString('base64')

const slides = [
  { fundo: '#1D1D1F', tinta: '#F7F4EF', destaque: '#E0A83E', kicker: 'BLACK FRIDAY DENTALPOS', titulo: '30 dias grátis e <em>50% off</em> por 12 meses.', texto: 'Deslize e veja o que o seu consultório ganha.', rodape: 'Arraste →' },
  { fundo: '#FBEFD7', tinta: '#1D1D1F', destaque: '#B9821F', kicker: '1 · Automação', titulo: '<em>Centenas</em> de processos rodando sozinhos.', texto: 'Sem depender de funcionário. Você configura uma vez e o sistema trabalha todo dia.', rodape: 'DentalPos' },
  { fundo: '#2E8B6B', tinta: '#FFFFFF', destaque: '#FBEFD7', kicker: '2 · WhatsApp', titulo: 'Use o <em>WhatsApp do seu consultório.</em>', texto: 'É só configurar. Lembretes, confirmações e retorno de pacientes saem do seu número.', rodape: 'DentalPos' },
  { fundo: '#F7F4EF', tinta: '#1D1D1F', destaque: '#2E8B6B', kicker: '3 · Documentos', titulo: 'Papelaria e documentos <em>inclusos.</em>', texto: 'Receitas, atestados, termos e contratos prontos. Você não paga por documento novo.', rodape: 'DentalPos' },
  { fundo: '#E0A83E', tinta: '#1D1D1F', destaque: '#FFFFFF', kicker: '4 · Migração', titulo: 'Troque de sistema <em>sem dor.</em>', texto: 'Migração automática e simples: seus pacientes e histórico vêm junto.', rodape: 'DentalPos' },
  { fundo: '#8C1D2B', tinta: '#FFFFFF', destaque: '#FBEFD7', kicker: 'Oferta até 31/12', titulo: 'Cobrança só depois dos <em>30 dias.</em>', texto: 'Sem fidelidade, cancele quando quiser. Toque em “Enviar mensagem” e fale com a gente.', rodape: 'Fale no WhatsApp' },
]
const html = (c, i) => `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}body{width:1080px;height:1350px;background:${c.fundo};color:${c.tinta};font-family:"Liberation Sans",Arial,sans-serif;display:flex;flex-direction:column;justify-content:space-between;padding:90px 80px}
.top{display:flex;align-items:center;justify-content:space-between}.marca{display:flex;align-items:center;gap:22px;font-size:44px;font-weight:700}.marca img{width:86px;height:86px;border-radius:50%}.marca b{color:${c.destaque}}
.n{font-size:34px;opacity:.7}
.kicker{display:inline-block;border:3px solid ${c.destaque};color:${c.destaque};border-radius:999px;padding:14px 30px;font-size:34px;font-weight:700;margin-bottom:40px}
h1{font-family:"Liberation Serif",Georgia,serif;font-size:118px;line-height:1.03;font-weight:700;letter-spacing:-1px}h1 em{font-style:normal;color:${c.destaque}}
p{font-size:46px;line-height:1.35;margin-top:44px;opacity:.92;max-width:900px}
.rod{font-size:40px;font-weight:700;color:${c.destaque}}</style>
<div class="top"><div class="marca"><img src="${logo}"><span>Dental<b>Pos</b></span></div><div class="n">${i + 1}/${slides.length}</div></div>
<div><div class="kicker">${c.kicker}</div><h1>${c.titulo}</h1><p>${c.texto}</p></div>
<div class="rod">${c.rodape}</div>`

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' })
for (const [i, c] of slides.entries()) {
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 } })
  await p.setContent(html(c, i))
  await p.screenshot({ path: path.join(out, `${String(i + 1).padStart(2, '0')}.png`) })
  await p.close()
}
await b.close()
