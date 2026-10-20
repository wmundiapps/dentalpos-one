// Gera os cards do Meta Ads (feed 1080x1080 e stories 1080x1920) em PNG.
// Uso: cd marketing/meta-ads && node gerar.mjs   (precisa de playwright)
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const dir = path.dirname(fileURLToPath(import.meta.url))
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(dir, '../../frontend/public/brand/logo-leao.png')).toString('base64')

const cards = [
  { id: '01-atender', fundo: '#FBEFD7', tinta: '#1D1D1F', destaque: '#B9821F', titulo: 'Você só precisa <em>atender.</em>', texto: 'Agenda, prontuário, financeiro e retorno de pacientes em um só sistema.', selo: '60 dias grátis · sem cartão', cta: 'Começar grátis' },
  { id: '02-esquecimento', fundo: '#1D1D1F', tinta: '#F7F4EF', destaque: '#E0A83E', titulo: 'Paciente que sumiu <em>volta pra agenda.</em>', texto: 'O CompletoDonto lembra quem faltou, quem cancelou e quem ficou sem retorno. E avisa você toda semana.', selo: 'Retorno automático de pacientes', cta: 'Testar 60 dias grátis' },
  { id: '03-desconto', fundo: '#2E8B6B', tinta: '#FFFFFF', destaque: '#FBEFD7', titulo: '60 dias grátis e <em>50% off</em> por 12 meses.', texto: 'Sem cartão de crédito para testar. Cancele quando quiser.', selo: 'Oferta de lançamento', cta: 'Quero a oferta' },
  { id: '04-tudo-junto', fundo: '#F7F4EF', tinta: '#1D1D1F', destaque: '#2E8B6B', titulo: 'Chega de <em>5 sistemas</em> para tocar a clínica.', texto: 'Agenda, prontuário, financeiro, estoque, RH e comunicação com o paciente no mesmo lugar.', selo: 'Tudo em um só sistema', cta: 'Conhecer o sistema' },
  { id: '05-estudante', fundo: '#E0A83E', tinta: '#1D1D1F', destaque: '#FFFFFF', titulo: 'Estudante de odontologia <em>usa grátis.</em>', texto: 'Grátis até a colação de grau e mais 6 meses grátis depois de formado.', selo: 'Para acadêmicos', cta: 'Quero meu acesso' },
]
const formatos = [{ nome: 'feed', w: 1080, h: 1080 }, { nome: 'stories', w: 1080, h: 1920 }]
const html = (c, f) => `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}body{width:${f.w}px;height:${f.h}px;background:${c.fundo};color:${c.tinta};font-family:"Liberation Sans",Arial,sans-serif;display:flex;flex-direction:column;justify-content:space-between;padding:${f.h > 1500 ? '170px 90px 190px' : '80px 80px 80px'}}
.marca{display:flex;align-items:center;gap:22px;font-size:44px;font-weight:700}.marca img{width:86px;height:86px;border-radius:50%}.marca b{color:${c.destaque}}
.selo{display:inline-block;border:3px solid ${c.destaque};color:${c.destaque};border-radius:999px;padding:14px 30px;font-size:34px;font-weight:700;margin-bottom:34px}
h1{font-family:"Liberation Serif",Georgia,serif;font-size:${f.h > 1500 ? 124 : 96}px;line-height:1.04;font-weight:700;letter-spacing:-1px}h1 em{font-style:normal;color:${c.destaque}}
p{font-size:${f.h > 1500 ? 46 : 38}px;line-height:1.35;margin-top:34px;opacity:.92;max-width:900px}
.cta{align-self:flex-start;background:${c.destaque};color:${c.fundo === '#E0A83E' ? '#1D1D1F' : c.fundo};font-size:42px;font-weight:700;padding:26px 54px;border-radius:999px}
.url{font-size:32px;opacity:.75;margin-top:22px}</style>
<div class="marca"><img src="${logo}"><span>Completo<b>Donto</b></span></div>
<div><div class="selo">${c.selo}</div><h1>${c.titulo}</h1><p>${c.texto}</p></div>
<div><div class="cta">${c.cta}</div><div class="url">completodonto.com.br</div></div>`

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' })
for (const c of cards) for (const f of formatos) {
  const p = await b.newPage({ viewport: { width: f.w, height: f.h } })
  await p.setContent(html(c, f))
  await p.screenshot({ path: path.join(dir, `${c.id}-${f.nome}.png`) })
  await p.close()
}

// Card de postagem (Facebook/Instagram): as duas ofertas lado a lado.
const postHtml = (f) => `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}body{width:${f.w}px;height:${f.h}px;background:#1D1D1F;color:#F7F4EF;font-family:"Liberation Sans",Arial,sans-serif;display:flex;flex-direction:column;justify-content:space-between;padding:${f.h > 1500 ? '150px 80px 170px' : f.h > 1200 ? '70px 70px' : '60px 70px'}}
.marca{display:flex;align-items:center;gap:20px;font-size:42px;font-weight:700}.marca img{width:80px;height:80px;border-radius:50%}.marca b{color:#E0A83E}
h1{font-family:"Liberation Serif",Georgia,serif;font-size:${f.h > 1500 ? 104 : 80}px;line-height:1.05;margin-top:26px}h1 em{font-style:normal;color:#E0A83E}
.box{border-radius:28px;padding:28px 34px;margin-top:22px}.box.a{background:#E0A83E;color:#1D1D1F}.box.b{background:#2E8B6B;color:#fff}
.box small{display:block;font-size:26px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;opacity:.85}.box strong{display:block;font-size:${f.h > 1500 ? 56 : 46}px;line-height:1.1;margin-top:8px}.box span{display:block;font-size:30px;margin-top:8px}
.rod{font-size:32px;line-height:1.4}.rod b{color:#E0A83E}</style>
<div><div class="marca"><img src="${logo}"><span>Completo<b>Donto</b></span></div>
<h1>Sua clínica <em>completa</em> em um só sistema.</h1>
<div class="box a"><small>Clínicas e dentistas</small><strong>60 dias grátis</strong><span>+ 12 meses com 50% do valor</span></div>
<div class="box b"><small>Acadêmicos de odontologia</small><strong>Grátis até a colação de grau</strong><span>+ 6 meses grátis depois de formado</span></div></div>
<div class="rod">Agenda, prontuário, financeiro e retorno de pacientes.<br><b>Promoção até 04/12.</b> Sem cartão de crédito.<br><b>completodonto.com.br</b></div>`
for (const f of [{ nome: 'feed', w: 1080, h: 1080 }, { nome: 'retrato', w: 1080, h: 1350 }, { nome: 'stories', w: 1080, h: 1920 }]) {
  const p = await b.newPage({ viewport: { width: f.w, height: f.h } })
  await p.setContent(postHtml(f))
  await p.screenshot({ path: path.join(dir, `06-post-geral-${f.nome}.png`) })
  await p.close()
}

// Cartões de divulgação geral (sem citar acadêmicos): feed, retrato (4:5) e stories.
const gerais = [
  { id: '07-oferta', fundo: '#1D1D1F', tinta: '#F7F4EF', destaque: '#E0A83E', titulo: '60 dias grátis para testar a sua <em>clínica completa.</em>', texto: 'Depois, 12 meses com 50% do valor. Sem cartão de crédito. Promoção até 04/12.', selo: 'Promoção de lançamento', cta: 'Começar grátis' },
  { id: '08-retorno', fundo: '#FBEFD7', tinta: '#1D1D1F', destaque: '#B9821F', titulo: 'Paciente que sumiu <em>volta pra agenda.</em>', texto: 'O CompletoDonto lembra quem faltou, quem cancelou e quem ficou sem retorno. E avisa você toda semana.', selo: 'Retorno automático de pacientes', cta: 'Testar 60 dias grátis' },
  { id: '09-tudo-junto', fundo: '#2E8B6B', tinta: '#FFFFFF', destaque: '#FBEFD7', titulo: 'Agenda, prontuário e financeiro <em>em um só lugar.</em>', texto: 'Gestão completa para a sua clínica odontológica, com 60 dias grátis para testar.', selo: 'Tudo em um só sistema', cta: 'Conhecer o sistema' },
]
for (const c of gerais) for (const f of [{ nome: 'feed', w: 1080, h: 1080 }, { nome: 'retrato', w: 1080, h: 1350 }, { nome: 'stories', w: 1080, h: 1920 }]) {
  const p = await b.newPage({ viewport: { width: f.w, height: f.h } })
  await p.setContent(html(c, f))
  await p.screenshot({ path: path.join(dir, `${c.id}-${f.nome}.png`) })
  await p.close()
}
await b.close()
