// Gera as gravuras da campanha Black Friday DentalPos (feed 1080x1080 e stories/TikTok 1080x1920).
// Uso: cd marketing/black-friday && node gerar.mjs   (precisa de playwright)
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const dir = path.dirname(fileURLToPath(import.meta.url))
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(dir, '../../frontend/public/brand/logo-leao.png')).toString('base64')

const cards = [
  { id: '01-oferta', fundo: '#1D1D1F', tinta: '#F7F4EF', destaque: '#E0A83E', selo: 'BLACK FRIDAY DENTALPOS', titulo: '30 dias grátis e <em>50% off</em> por 12 meses.', texto: 'Cobrança só depois dos 30 dias. Sem fidelidade, cancele quando quiser.', cta: 'Quero a oferta' },
  { id: '02-automatico', fundo: '#FBEFD7', tinta: '#1D1D1F', destaque: '#B9821F', selo: 'Automação de verdade', titulo: 'Centenas de processos <em>rodando sozinhos.</em>', texto: 'Sem depender de funcionário. Você configura uma vez e o sistema trabalha todo dia.', cta: 'Testar 30 dias grátis' },
  { id: '03-whatsapp', fundo: '#2E8B6B', tinta: '#FFFFFF', destaque: '#FBEFD7', selo: 'WhatsApp do seu consultório', titulo: 'Use o <em>seu próprio número.</em> É só configurar.', texto: 'Lembretes, confirmações e retorno de pacientes saindo do WhatsApp da sua clínica.', cta: 'Quero configurar' },
  { id: '04-documentos', fundo: '#F7F4EF', tinta: '#1D1D1F', destaque: '#2E8B6B', selo: 'Papelaria e documentos inclusos', titulo: 'Documento novo? <em>Você não paga nada a mais.</em>', texto: 'Receitas, atestados, termos e contratos já vêm no sistema, prontos para usar.', cta: 'Conhecer o sistema' },
  { id: '05-migracao', fundo: '#E0A83E', tinta: '#1D1D1F', destaque: '#FFFFFF', selo: 'Migração automática', titulo: 'Trocar de sistema <em>ficou simples.</em>', texto: 'Traga pacientes e histórico do sistema atual sem digitar nada de novo.', cta: 'Migrar sem dor' },
  { id: '06-ultimas-horas', fundo: '#8C1D2B', tinta: '#FFFFFF', destaque: '#FBEFD7', selo: 'Últimos dias · Black Friday', titulo: 'A oferta <em>acaba em 30/11.</em>', texto: '30 dias grátis, 50% de desconto por 12 meses e migração automática.', cta: 'Garantir agora' },
]
const formatos = [{ nome: 'feed', w: 1080, h: 1080 }, { nome: 'stories', w: 1080, h: 1920 }]
const html = (c, f) => `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}body{width:${f.w}px;height:${f.h}px;background:${c.fundo};color:${c.tinta};font-family:"Liberation Sans",Arial,sans-serif;display:flex;flex-direction:column;justify-content:space-between;padding:${f.h > 1500 ? '170px 90px 190px' : '80px'}}
.marca{display:flex;align-items:center;gap:22px;font-size:44px;font-weight:700}.marca img{width:86px;height:86px;border-radius:50%}.marca b{color:${c.destaque}}
.selo{display:inline-block;border:3px solid ${c.destaque};color:${c.destaque};border-radius:999px;padding:14px 30px;font-size:32px;font-weight:700;margin-bottom:34px}
h1{font-family:"Liberation Serif",Georgia,serif;font-size:${f.h > 1500 ? 118 : 90}px;line-height:1.05;font-weight:700;letter-spacing:-1px}h1 em{font-style:normal;color:${c.destaque}}
p{font-size:${f.h > 1500 ? 46 : 38}px;line-height:1.35;margin-top:34px;opacity:.92;max-width:900px}
.cta{align-self:flex-start;background:${c.destaque};color:${['#E0A83E','#F7F4EF','#FBEFD7'].includes(c.fundo) ? '#1D1D1F' : c.fundo};font-size:42px;font-weight:700;padding:26px 54px;border-radius:999px;display:inline-block}
.url{font-size:32px;opacity:.75;margin-top:22px}</style>
<div class="marca"><img src="${logo}"><span>Dental<b>Pos</b></span></div>
<div><div class="selo">${c.selo}</div><h1>${c.titulo}</h1><p>${c.texto}</p></div>
<div><div class="cta">${c.cta}</div><div class="url">app.dentalpos.com.br/cadastro</div></div>`

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' })
for (const c of cards) for (const f of formatos) {
  const p = await b.newPage({ viewport: { width: f.w, height: f.h } })
  await p.setContent(html(c, f))
  await p.screenshot({ path: path.join(dir, `${c.id}-${f.nome}.png`) })
  await p.close()
}
await b.close()
