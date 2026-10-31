#!/usr/bin/env python3
"""Gera os cards de anuncio (PNG) e valida os textos do Google Ads.
Uso: python3 ads/build_ads.py   (requer playwright + chromium)"""
import asyncio, csv, os, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent
FONTS = (ROOT.parent / 'landing' / 'fonts').as_uri()
OUT = ROOT / 'out'; OUT.mkdir(exist_ok=True)

SIZES = {'feed-1x1': (1080, 1080), 'feed-4x5': (1080, 1350), 'story-9x16': (1080, 1920), 'link-1.91x1': (1200, 628), 'google-1x1': (1200, 1200)}

# Icones genericos (SVG proprio, sem logos de terceiros)
ICON = {
 'cal': '<path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"/>',
 'chat': '<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/>',
 'bell': '<path d="M6 16V11a6 6 0 1112 0v5l2 2H4zM10 21h4"/>',
 'gift': '<path d="M4 9h16v4H4zM6 13v8h12v-8M12 9v12M12 9c-2 0-4-1-4-2.5S10 4 12 9zM12 9c2 0 4-1 4-2.5S14 4 12 9z"/>',
 'card': '<path d="M3 6h18v12H3zM3 10h18M7 15h4"/>',
 'repeat': '<path d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3"/>',
 'tag': '<path d="M3 12V4h8l10 10-8 8zM7.5 8.5h.01"/>',
}
CARDS = [
 dict(id='agenda', icon='cal', eyebrow='Para salões e barbearias', head='A agenda cheia, <em>sem</em> perder a elegância.', sub='Agenda online, caixa e clientes em um só lugar.', cta='Teste grátis por 30 dias'),
 dict(id='robo', icon='chat', eyebrow='Atendimento 24 horas', head='Seu robô agenda no <em>WhatsApp</em> enquanto você atende.', sub='Também no Instagram e no Facebook.', cta='Conheça o Studio Beauty Barber'),
 dict(id='faltas', icon='bell', eyebrow='Menos furos na agenda', head='Lembretes automáticos que <em>reduzem faltas</em>.', sub='24h e 2h antes, sem você digitar nada.', cta='Teste grátis por 30 dias'),
 dict(id='gratis', icon='gift', eyebrow='30 dias para testar', head='Organize seu salão em <em>um dia</em>. 30 dias grátis.', sub='Cadastre o cartão e comece. Cancele antes e não paga nada.', cta='Começar agora'),
 dict(id='reserva', icon='card', eyebrow='Reserva paga, agenda protegida', head='Faltou sem avisar? Você <em>retém 30%</em>.', sub='O cliente paga no Pix ou cartão para reservar e aceita a regra antes.', cta='Veja como funciona'),
 dict(id='clube', icon='repeat', eyebrow='Receita todo mês', head='Clube de assinatura com <em>horário fixo</em>.', sub='Semanal, 15, 30, 45 ou 60 dias, com cobrança automática.', cta='Conheça o clube'),
 dict(id='preco', icon='tag', eyebrow='Planos para todo tamanho', head='A partir de <em>R$ 59,90</em> por mês.', sub='30 dias grátis. Sem fidelidade. Cancele quando quiser.', cta='Teste grátis agora'),
]

def html(card, w, h):
    story = h / w > 1.6; wide = w / h > 1.5
    pad_t = 250 if story else (48 if wide else 84); pad_b = 270 if story else (48 if wide else 84); pad_x = 70 if wide else 84
    hs = 54 if wide else (92 if not story else 104)
    return f'''<!doctype html><meta charset="utf-8"><style>
@font-face{{font-family:Lora;src:url('{FONTS}/Lora-Variable.ttf');font-weight:400 700}}
@font-face{{font-family:Lora;src:url('{FONTS}/Lora-Italic-Variable.ttf');font-weight:400 700;font-style:italic}}
@font-face{{font-family:Inter;src:url('{FONTS}/Inter-Medium.otf');font-weight:500}}
@font-face{{font-family:Inter;src:url('{FONTS}/Inter-SemiBold.otf');font-weight:600}}
*{{box-sizing:border-box;margin:0}} body{{width:{w}px;height:{h}px;background:radial-gradient({int(w*.9)}px {int(h*.5)}px at 85% 0%,#3d3020 0%,transparent 62%),#14110f;color:#fff;font-family:Inter,sans-serif;position:relative;overflow:hidden}}
.frame{{position:absolute;inset:{24 if wide else 36}px;border:1.5px solid rgba(201,166,107,.45);border-radius:{18 if wide else 26}px}}
.c{{position:absolute;inset:0;padding:{pad_t}px {pad_x}px {pad_b}px;display:flex;flex-direction:column;justify-content:space-between}}
.top{{display:flex;align-items:center;gap:14px;font-family:Lora;font-weight:700;font-size:{26 if wide else 32}px}}
.top i{{width:{40 if wide else 52}px;height:{40 if wide else 52}px;border-radius:12px;background:linear-gradient(135deg,#c9a66b,#b8955a);display:grid;place-items:center;color:#1b1916;font-style:normal;font-size:{22 if wide else 28}px}}
.eyebrow{{text-transform:uppercase;letter-spacing:.18em;color:#c9a66b;font-weight:600;font-size:{16 if wide else 24}px;margin-bottom:{12 if wide else 22}px}}
h1{{max-width:{760 if wide else w}px;font-family:Lora;font-weight:600;font-size:{hs}px;line-height:1.08;letter-spacing:-.015em}} h1 em{{color:#c9a66b}}
p.sub{{font-size:{22 if wide else 34}px;color:#d9d2c4;margin-top:{14 if wide else 26}px;line-height:1.4;max-width:{w-2*pad_x-(220 if wide else 0)}px}}
.bot{{display:flex;align-items:center;justify-content:space-between;gap:20px}}
.cta{{background:linear-gradient(135deg,#c9a66b,#b8955a);color:#1b1916;font-weight:600;font-size:{20 if wide else 30}px;padding:{16 if wide else 24}px {28 if wide else 44}px;border-radius:999px}}
.url{{color:#a39a89;font-size:{16 if wide else 24}px}}
svg{{width:{74 if wide else 120}px;height:{74 if wide else 120}px;stroke:#c9a66b;fill:none;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round;margin-bottom:{10 if wide else 28}px}}
{'.wideicon{position:absolute;right:70px;top:50%;transform:translateY(-50%)} .wideicon svg{width:170px;height:170px;margin:0;opacity:.9}' if wide else ''}
</style><body><div class="frame"></div><div class="c">
<div class="top"><i>S</i>Studio Beauty Barber</div>
<div>{'' if wide else f'<svg viewBox="0 0 24 24">{ICON[card["icon"]]}</svg>'}<div class="eyebrow">{card['eyebrow']}</div><h1>{card['head']}</h1><p class="sub">{card['sub']}</p></div>
<div class="bot"><div class="cta">{card['cta']}</div><div class="url">studiobeautybarber.com</div></div></div>
{f'<div class="wideicon"><svg viewBox="0 0 24 24">{ICON[card["icon"]]}</svg></div>' if wide else ''}</body>'''

async def render():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for card in CARDS:
            for size, (w, h) in SIZES.items():
                f = OUT / f'{card["id"]}_{size}.html'; f.write_text(html(card, w, h), encoding='utf-8')
                pg = await b.new_page(viewport={'width': w, 'height': h})
                await pg.goto(f.as_uri()); await pg.evaluate('document.fonts.ready'); await pg.wait_for_timeout(150)
                await pg.screenshot(path=str(OUT / f'{card["id"]}_{size}.png')); await pg.close(); f.unlink()
        await b.close()

# ---------- Google Ads (limites oficiais RSA: titulo <=30, descricao <=90) ----------
HEADLINES = ['Gestão para Salão e Barbearia', 'Agenda Online para Salões', 'Teste Grátis por 30 Dias', 'Sistema para Barbearia', 'Robô de Agendamento WhatsApp', 'Reduza Faltas com Lembretes', 'Controle Caixa e Comissões', 'Studio Beauty Barber', 'A partir de R$ 59,90 por mês', 'Agenda Cheia Sem Planilha', 'Link de Agendamento Próprio', 'Clube de Assinatura Pronto', 'Reserva Paga com Pix e Cartão', 'Software para Salão de Beleza', 'Atenda Mais, Digite Menos']
DESCRIPTIONS = ['Agenda online, robô no WhatsApp, caixa e comissões. Teste grátis por 30 dias.', 'Cliente agenda sozinho 24h e recebe lembretes. 30 dias grátis, cancele quando quiser.', 'Organize clientes, serviços e equipe em um só lugar. Simples no celular e no computador.', 'Reserva paga: faltou sem avisar, você retém 30%. Clube de assinatura e planos de R$ 59,90.']
SHORT = ['Gestão para Salões', 'Agenda Online Grátis', 'Sistema para Barbearia']  # Performance Max / Display curtos (<=30)
LONG = 'Agenda online, robô de atendimento e caixa para salões e barbearias. Teste grátis.'  # <=90
KEYWORDS = {'exata': ['[sistema para salão de beleza]', '[sistema para barbearia]', '[software para salão de beleza]', '[agenda online para salão]', '[aplicativo para barbearia]', '[programa para salão de beleza]'],
            'frase': ['"sistema de agendamento para salão"', '"sistema de agendamento para barbearia"', '"gestão de salão de beleza"', '"controle financeiro para barbearia"', '"agenda online barbearia"', '"robô whatsapp salão de beleza"'],
            'negativas': ['grátis download', 'curso', 'vaga', 'emprego', 'apostila', 'pdf', 'crackeado', 'planilha pronta', 'franquia', 'como abrir']}

def check():
    for t in HEADLINES + SHORT: assert len(t) <= 30, f'titulo longo ({len(t)}): {t}'
    for t in DESCRIPTIONS + [LONG]: assert len(t) <= 90, f'descricao longa ({len(t)}): {t}'
    assert len(HEADLINES) <= 15 and len(DESCRIPTIONS) <= 4
    with open(ROOT / 'google_ads_rsa.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f); w.writerow(['tipo', 'texto', 'caracteres'])
        for t in HEADLINES: w.writerow(['titulo', t, len(t)])
        for t in DESCRIPTIONS: w.writerow(['descricao', t, len(t)])
    md = ['# Google Ads — Studio Beauty Barber', '', '## Campanha de Pesquisa (RSA)', '- Objetivo: leads. URL final: `https://studiobeautybarber.com/?utm_source=google&utm_medium=cpc&utm_campaign=pesquisa-salao&utm_term={keyword}`', '- Rede: só Pesquisa (desmarque Display e parceiros de pesquisa no início). Local: Brasil (comece pelas capitais). Orçamento inicial sugerido: definir por você.', '', '### Títulos (máx. 30)'] + [f'- {t} ({len(t)})' for t in HEADLINES] + ['', '### Descrições (máx. 90)'] + [f'- {t} ({len(t)})' for t in DESCRIPTIONS]
    md += ['', '### Palavras-chave'] + [f'**{k}**: ' + ', '.join(v) for k, v in KEYWORDS.items()]
    md += ['', '## Display / Performance Max', 'Títulos curtos: ' + ' | '.join(SHORT), f'Título longo: {LONG}', 'Imagens: `ads/out/google-1x1_*.png` (1:1) e `link-1.91x1_*.png` (1,91:1). Logo quadrado: usar o "S" dourado.',
           '', '## Conversões', '- Evento `generate_lead` (Google tag) disparado ao enviar o formulário, depois do consentimento de cookies.', '- Importante: política do Google exige aviso de cookies/consentimento (já implementado na landing).']
    (ROOT / 'google_ads.md').write_text('\n'.join(md) + '\n', encoding='utf-8')

if __name__ == '__main__':
    check(); print('Textos Google Ads OK')
    if '--html-only' in sys.argv:
        # Gera só os HTML (para renderizar com outra ferramenta, ex.: Playwright em Node)
        (OUT / 'html').mkdir(exist_ok=True)
        for card in CARDS:
            for size, (w, h) in SIZES.items():
                (OUT / 'html' / f'{card["id"]}_{size}.html').write_text(html(card, w, h), encoding='utf-8')
        print('HTML em', OUT / 'html')
    elif '--copy-only' not in sys.argv: asyncio.run(render()); print('PNGs em', OUT)
