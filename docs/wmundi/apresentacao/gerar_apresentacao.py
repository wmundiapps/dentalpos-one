#!/usr/bin/env python3
"""Gera apresentacao.html (slides 1920x1080) com o portfólio e o Programa de Gestores da WMundi.
Depois: node gerar_pdf.mjs  -> WMundi-Portfolio-e-Programa-de-Gestores.pdf
Regras: SEM valores (preços, percentuais, taxas) em nenhum slide; fontes de leads do REVAH ocultas."""
import html, os
AQUI = os.path.dirname(os.path.abspath(__file__))
e = html.escape

INK, INK2, SUN, CORAL, BLUE, MINT = '#0b1b3f', '#14275a', '#ffc94d', '#ff5a4e', '#2f5bff', '#13b58f'
CAT = {'saude': ('Saúde', '#7a4dff'), 'mkt': ('Marketing e vendas', '#ff5a4e'), 'edu': ('Educação', '#13b58f'),
       'neg': ('Comércio e serviços', '#e08a00'), 'mob': ('Mobilidade', '#0b8f8f'), 'fin': ('Gestão e finanças', '#2f5bff'),
       'car': ('Carreira', '#c2410c'), 'mod': ('Gestão empresarial', '#0f9fc9'), 'ia': ('Inteligência artificial', '#2f5bff')}

CSS = '''
@page{size:1920px 1080px;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#06102b}
body{font-family:'DM Sans',system-ui,sans-serif;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.slide{position:relative;width:1920px;height:1080px;overflow:hidden;page-break-after:always;break-after:page;
 background:radial-gradient(1100px 700px at 88% -5%,#1d3a8a 0%,transparent 62%),linear-gradient(160deg,#0b1b3f 0%,#091330 100%)}
.slide.alt{background:radial-gradient(1000px 700px at 5% 105%,#1d3a8a 0%,transparent 60%),linear-gradient(200deg,#0b1b3f 0%,#091330 100%)}
.slide.div{background:radial-gradient(1300px 900px at 80% 20%,var(--c,#2f5bff) 0%,transparent 65%),linear-gradient(160deg,#0b1b3f,#06102b)}
.pad{position:absolute;inset:0;padding:90px 110px 120px}
h1,h2,h3{font-family:'Bricolage Grotesque',sans-serif;letter-spacing:-.02em;line-height:1.05}
.eyebrow{font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#ffc94d;font-size:24px;margin-bottom:22px}
h2{font-size:76px;font-weight:800;max-width:1500px}
h2 em,h1 em{font-style:normal;color:#ffc94d}
.lead{margin-top:26px;color:#c3cdee;font-size:33px;line-height:1.4;max-width:1400px}
.foot{position:absolute;left:110px;right:110px;bottom:38px;display:flex;align-items:center;justify-content:space-between;color:#8fa0d0;font-size:21px}
.foot img{height:40px}
.foot b{color:#ffc94d}
.rule{width:140px;height:8px;border-radius:8px;background:#ffc94d;margin:30px 0}
/* cartões */
.cards{display:grid;gap:26px;margin-top:50px}
.card{background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.14);border-radius:26px;padding:34px 36px}
.card h3{font-size:36px;font-weight:700;margin-bottom:12px}
.card p,.card li{color:#c3cdee;font-size:26px;line-height:1.4}
.card ul{padding-left:26px}.card li{margin:6px 0}
.dot{display:inline-block;width:16px;height:16px;border-radius:50%;margin-right:12px;background:var(--c,#ffc94d)}
/* produto */
.prod{display:grid;grid-template-columns:1.05fr .95fr;gap:70px;height:100%}
.pn{display:inline-flex;align-items:center;gap:18px;margin-bottom:26px}
.badge{width:78px;height:78px;border-radius:22px;display:grid;place-items:center;font:800 34px 'Bricolage Grotesque';color:#fff;background:var(--c)}
.badge img{width:78px;height:78px;border-radius:22px;background:#fff;padding:6px;object-fit:contain}
.cat{font-weight:700;letter-spacing:.14em;text-transform:uppercase;font-size:22px;color:var(--c)}
h1.pt{font-size:96px;font-weight:800;line-height:1}
.tag{margin-top:24px;color:#e3e9ff;font-size:35px;line-height:1.35;max-width:880px}
.bl{margin-top:36px;list-style:none}
.bl li{position:relative;padding-left:46px;margin:15px 0;font-size:30px;line-height:1.35;color:#dbe3ff}
.bl li::before{content:"";position:absolute;left:0;top:11px;width:22px;height:22px;border-radius:7px;background:var(--c)}
.chips{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
.chips span{padding:10px 22px;border-radius:999px;background:rgba(255,255,255,.1);border:1.5px solid rgba(255,255,255,.22);font-size:24px;font-weight:500}
.art{display:grid;place-items:center}
.dev{width:780px;height:640px;border-radius:34px;background:#f4f7ff;box-shadow:0 40px 100px rgba(0,0,0,.5);position:relative;overflow:hidden;color:#0e1a38}
.dev .bar{height:62px;background:var(--c);display:flex;align-items:center;gap:10px;padding:0 24px}
.dev .bar s{width:14px;height:14px;border-radius:50%;background:rgba(255,255,255,.7)}
.dev .bar b{margin-left:14px;color:#fff;font-size:22px;font-weight:700}
.dev .body{padding:26px;height:calc(100% - 62px);position:relative}
.b{background:#fff;border:1.5px solid #dbe3f5;border-radius:16px}
.nota{position:absolute;left:110px;right:110px;bottom:84px;color:#8fa0d0;font-size:20px}
/* capa */
.capa .logo{height:150px}
.capa h1{font-size:112px;font-weight:800;margin-top:60px;max-width:1250px}
.capa .sub{font-size:40px;color:#c3cdee;margin-top:30px;max-width:1100px;line-height:1.35}
.ring{position:absolute;right:-340px;top:110px;width:820px;height:820px}
.ring i{position:absolute;border-radius:50%;border:10px solid rgba(255,201,77,.5)}
.ring i:nth-child(1){inset:0}.ring i:nth-child(2){inset:110px;border-color:rgba(255,255,255,.28)}.ring i:nth-child(3){inset:230px;border-color:rgba(47,91,255,.9)}
.ring i:nth-child(4){inset:340px;border:0;background:radial-gradient(circle,rgba(255,201,77,.35),transparent 70%)}
/* grade do portfólio */
.pg{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:36px}
.pg div{background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.14);border-radius:20px;padding:20px 22px;display:flex;align-items:center;gap:16px;font-size:25px;font-weight:700;line-height:1.15}
.pg i{flex:none;width:44px;height:44px;border-radius:13px;background:var(--c);font:800 20px 'Bricolage Grotesque';font-style:normal;display:grid;place-items:center}
.pgb{display:grid;grid-template-columns:1fr 1fr;gap:30px 50px;margin-top:34px}.pgb .bk h4{font:700 24px 'DM Sans';letter-spacing:.14em;text-transform:uppercase;color:#ffc94d;margin-bottom:14px}.pgb .cs{display:flex;flex-wrap:wrap;gap:10px}.pgb .cs span{display:flex;align-items:center;gap:10px;padding:10px 20px;border-radius:999px;background:rgba(255,255,255,.08);border:1.5px solid rgba(255,255,255,.18);font-size:23px;font-weight:700}.pgb .cs i{width:14px;height:14px;border-radius:50%;background:var(--c)}
/* números */
.nums{display:grid;grid-template-columns:repeat(5,1fr);gap:24px;margin-top:70px}
.nums div{background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.14);border-radius:26px;padding:44px 24px;text-align:center}
.nums b{display:block;font:800 84px 'Bricolage Grotesque';color:#ffc94d}
.nums span{display:block;margin-top:14px;font-size:26px;color:#c3cdee;line-height:1.3}
/* passos */
.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:22px;margin-top:44px}
.steps .card{padding:26px 28px}.steps .n{font:800 56px 'Bricolage Grotesque';color:#ffc94d;line-height:1;margin-bottom:10px}
.steps h3{font-size:30px}.steps p{font-size:23px}
/* contato */
.ct{display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:40px}
.ct .card h3{font-size:24px;letter-spacing:.12em;text-transform:uppercase;color:#ffc94d;font-weight:700;font-family:'DM Sans'}
.ct .card p{font-size:32px;color:#fff;line-height:1.35}
'''

# ---------- ilustrações (telas de exemplo, sem números nem valores) ----------
def dev(titulo, corpo, cor):
    return f'<div class="dev" style="--c:{cor}"><div class="bar"><s></s><s></s><s></s><b>{e(titulo)}</b></div><div class="body">{corpo}</div></div>'

def bar(w, h=18, cor='#dbe3f5', mb=14): return f'<div style="width:{w}%;height:{h}px;border-radius:99px;background:{cor};margin-bottom:{mb}px"></div>'

def m_agenda(c):
    cols = ''.join(f'<div style="flex:1;display:flex;flex-direction:column;gap:12px"><div style="text-align:center;font-weight:700;color:#55638a;font-size:18px">{d}</div>' +
        ''.join(f'<div style="height:{h}px;border-radius:12px;background:{col}"></div>' for h, col in blocos) + '</div>'
        for d, blocos in [('SEG', [(70, c), (50, '#dbe3f5'), (90, '#ffd98a')]), ('TER', [(40, '#dbe3f5'), (110, c), (50, '#bfe9dc')]),
                          ('QUA', [(90, '#ffd98a'), (60, c), (60, '#dbe3f5')]), ('QUI', [(60, c), (80, '#bfe9dc'), (80, '#dbe3f5')]), ('SEX', [(100, '#dbe3f5'), (70, c), (50, '#ffd98a')])])
    return f'<div style="display:flex;gap:14px">{cols}</div><div class="b" style="margin-top:26px;padding:18px 22px;display:flex;gap:16px;align-items:center"><div style="width:46px;height:46px;border-radius:14px;background:{c}"></div><div style="flex:1">{bar(70,16,"#0b1b3f",8)}{bar(45,12)}</div><div style="padding:10px 18px;border-radius:12px;background:{MINT};color:#fff;font-weight:700;font-size:18px">Confirmado</div></div>'

def m_odonto(c):
    def dente(cor): return f'<div style="width:58px;height:78px;border-radius:22px 22px 30px 30px;background:{cor};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.15)"></div>'
    cores = ['#fff', '#fff', c, '#fff', '#ffd98a', '#fff', '#fff', '#bfe9dc']
    linha = lambda cs: '<div style="display:flex;gap:10px;justify-content:center;margin-bottom:12px">' + ''.join(dente(x) for x in cs) + '</div>'
    return f'<div class="b" style="padding:22px">{linha(cores)}{linha(cores[::-1])}</div><div style="display:flex;gap:14px;margin-top:20px"><div class="b" style="flex:1;padding:18px">{bar(80,16,"#0b1b3f",10)}{bar(60,12)}{bar(70,12)}</div><div class="b" style="flex:1;padding:18px;display:flex;gap:10px;align-items:flex-end">' + ''.join(f'<div style="flex:1;height:{h}px;border-radius:8px 8px 0 0;background:{c}"></div>' for h in (40, 70, 55, 90, 65)) + '</div></div>'

def m_chat(c):
    def b(t, me): 
        return f'<div style="max-width:78%;padding:16px 20px;border-radius:20px;font-size:23px;line-height:1.3;{"align-self:flex-end;background:#d9fdd3" if me else "align-self:flex-start;background:#fff;border:1.5px solid #dbe3f5"}">{e(t)}</div>'
    return '<div style="display:flex;flex-direction:column;gap:14px">' + b('Olá! Posso ajudar?', False) + b('Quero um horário', True) + b('Tenho amanhã de manhã. Confirmo?', False) + b('Confirmado!', True) + '</div>'

def m_dash(c):
    barras = ''.join(f'<div style="flex:1;height:{h}px;border-radius:10px 10px 0 0;background:{col}"></div>' for h, col in [(80, '#dbe3f5'), (130, c), (100, '#dbe3f5'), (170, c), (140, '#dbe3f5'), (200, c)])
    return f'<div style="display:flex;gap:16px"><div class="b" style="flex:1.3;padding:20px;display:flex;gap:14px;align-items:flex-end;height:250px">{barras}</div><div class="b" style="flex:1;display:grid;place-items:center"><div style="width:170px;height:170px;border-radius:50%;background:conic-gradient({c} 0 62%,#dbe3f5 0)"><div style="margin:34px;width:102px;height:102px;border-radius:50%;background:#fff"></div></div></div></div><div style="margin-top:18px">{"".join(f"<div class=b style=padding:16px;margin-bottom:12px;display:flex;gap:14px;align-items:center><div style=width:30px;height:30px;border-radius:9px;background:{c}></div><div style=flex:1>{bar(w,14,chr(35)+chr(100)+chr(98)+chr(101)+chr(51)+chr(102)+chr(53),0)}</div></div>" for w in (90,70,55))}</div>'

def m_tele(c):
    tile = lambda cor: f'<div style="flex:1;height:230px;border-radius:20px;background:{cor};display:grid;place-items:center"><div style="width:90px;height:90px;border-radius:50%;background:rgba(255,255,255,.75)"></div></div>'
    return f'<div style="display:flex;gap:16px">{tile(c)}{tile("#0b1b3f")}</div><div class="b" style="margin-top:22px;padding:22px;display:flex;gap:16px;align-items:center"><div style="width:54px;height:54px;border-radius:50%;background:{MINT}"></div><div style="flex:1">{bar(65,16,"#0b1b3f",10)}{bar(40,12,"#dbe3f5",0)}</div><div style="padding:12px 22px;border-radius:14px;background:{c};color:#fff;font-weight:700;font-size:20px">Agendar</div></div>'

def m_net(c):
    nos = [(380, 220, 60, c), (150, 120, 40, '#ffc94d'), (600, 110, 44, '#13b58f'), (120, 330, 38, '#ff5a4e'), (600, 330, 42, '#0b1b3f'), (380, 420, 36, '#ffc94d')]
    linhas = ''.join(f'<line x1="{x}" y1="{y}" x2="380" y2="220" stroke="#b8c4e6" stroke-width="4"/>' for x, y, r, k in nos[1:])
    circ = ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{k}"/>' for x, y, r, k in nos)
    return f'<svg viewBox="0 0 740 520" width="100%" height="480">{linhas}{circ}</svg>'

def m_phone(c):
    return f'<div style="display:flex;justify-content:center"><div style="width:300px;height:520px;border:10px solid #0b1b3f;border-radius:44px;background:#fff;padding:22px;overflow:hidden"><div style="height:46px;border-radius:14px;background:{c};margin-bottom:16px"></div>' + ''.join(f'<div style="display:flex;gap:12px;align-items:center;margin-bottom:14px"><div style="width:50px;height:50px;border-radius:14px;background:{col}"></div><div style="flex:1">{bar(80,14,"#0b1b3f",8)}{bar(50,10,"#dbe3f5",0)}</div></div>' for col in (c, '#ffc94d', '#13b58f', '#ff5a4e', '#dbe3f5')) + '</div></div>'

def m_map(c):
    pin = lambda x, y, k: f'<g transform="translate({x},{y})"><path d="M0,0 C-26,-34 -26,-70 0,-70 C26,-70 26,-34 0,0Z" fill="{k}"/><circle cx="0" cy="-48" r="9" fill="#fff"/></g>'
    return f'<svg viewBox="0 0 740 520" width="100%" height="480"><rect width="740" height="520" rx="22" fill="#e6ecfb"/><path d="M0 150H740M0 330H740M180 0V520M470 0V520M600 0V520" stroke="#fff" stroke-width="22"/><path d="M90 440 C230 330 330 380 420 250 S600 110 650 90" stroke="{c}" stroke-width="10" stroke-dasharray="26 18" fill="none"/>{pin(90,452,"#ffc94d")}{pin(650,102,c)}{pin(470,340,"#ff5a4e")}</svg>'

def m_cards(c):
    return ''.join(f'<div class="b" style="padding:20px;margin-bottom:16px;display:flex;gap:18px;align-items:center"><div style="width:64px;height:64px;border-radius:18px;background:{k}"></div><div style="flex:1">{bar(70,18,"#0b1b3f",10)}{bar(45,12,"#dbe3f5",0)}</div><div style="padding:10px 18px;border-radius:12px;border:2px solid {c};color:{c};font-weight:700;font-size:18px">Ver</div></div>' for k in (c, '#ffc94d', '#13b58f', '#ff5a4e'))

def m_doc(c):
    chips = ''.join(f'<div style="padding:10px 18px;border-radius:12px;background:{k};color:#fff;font-weight:700;font-size:20px">{t}</div>' for t, k in [('FGTS', c), ('ISS', '#13b58f'), ('IRPJ', '#ff5a4e'), ('CSLL', '#7a4dff'), ('PIS', '#e08a00'), ('COFINS', '#0b1b3f')])
    return f'<div class="b" style="padding:24px">{bar(55,20,"#0b1b3f",16)}{bar(95)}{bar(88)}{bar(92)}{bar(60,14,"#dbe3f5",0)}</div><div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:24px">{chips}</div><div class="b" style="margin-top:22px;padding:18px 22px;display:flex;gap:16px;align-items:center"><div style="width:44px;height:44px;border-radius:50%;background:{MINT}"></div>{bar(60,16,"#0b1b3f",0)}</div>'

def m_face(c):
    return f'<div style="display:grid;place-items:center;height:440px"><div style="position:relative;width:340px;height:380px"><div style="position:absolute;inset:0;border-radius:36px;border:6px solid {c};clip-path:polygon(0 0,32% 0,32% 6px,6px 6px,6px 32%,0 32%,0 0,100% 0,100% 32%,calc(100% - 6px) 32%,calc(100% - 6px) 6px,68% 6px,68% 0)"></div><div style="position:absolute;left:90px;top:70px;width:160px;height:160px;border-radius:50%;background:#c3cdee"></div><div style="position:absolute;left:55px;top:240px;width:230px;height:100px;border-radius:120px 120px 20px 20px;background:#c3cdee"></div><div style="position:absolute;right:-30px;bottom:6px;width:90px;height:90px;border-radius:50%;background:{MINT};display:grid;place-items:center;color:#fff;font-size:52px;font-weight:800">✓</div></div></div><div style="display:flex;gap:12px;justify-content:center">' + ''.join(f'<div style="padding:10px 20px;border-radius:12px;background:#fff;border:1.5px solid #dbe3f5;font-weight:700;font-size:20px">{t}</div>' for t in ('Entrada', 'Intervalo', 'Saída')) + '</div>'

def m_calc(c):
    return f'<svg viewBox="0 0 740 420" width="100%" height="380"><rect width="740" height="420" rx="20" fill="#fff" stroke="#dbe3f5" stroke-width="3"/><path d="M60 350 L680 110" stroke="{c}" stroke-width="9" fill="none"/><path d="M60 280 L680 280" stroke="#ff5a4e" stroke-width="9" fill="none"/><circle cx="388" cy="280" r="20" fill="#ffc94d" stroke="#0b1b3f" stroke-width="5"/><path d="M60 40V360H690" stroke="#b8c4e6" stroke-width="5" fill="none"/></svg><div style="display:flex;gap:14px;margin-top:18px">' + ''.join(f'<div class="b" style="flex:1;padding:16px;text-align:center;font-weight:700;font-size:19px;color:#55638a">{t}</div>' for t in ('Custo fixo', 'Custo variável', 'Impostos', 'Pró-labore')) + '</div>'

def m_space(c):
    sala = lambda k, w, h: f'<div style="width:{w}px;height:{h}px;border-radius:16px;background:{k};display:grid;place-items:center"><div style="width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,.65)"></div></div>'
    return f'<div style="display:flex;gap:16px;margin-bottom:16px">{sala(c,320,200)}{sala("#ffc94d",340,200)}</div><div style="display:flex;gap:16px">{sala("#13b58f",200,200)}{sala("#ff5a4e",210,200)}{sala("#0b1b3f",250,200)}</div><div class="b" style="margin-top:18px;padding:16px 22px;display:flex;gap:14px;align-items:center"><div style="width:40px;height:40px;border-radius:12px;background:{c}"></div>{bar(60,16,"#0b1b3f",0)}</div>'

def m_edu(c):
    return f'<div style="display:flex;gap:16px"><div class="b" style="flex:1;padding:22px"><div style="width:96px;height:96px;border-radius:24px;background:{c};margin-bottom:18px;display:grid;place-items:center;font-size:54px">🎓</div>{bar(80,16,"#0b1b3f",10)}{bar(55,12,"#dbe3f5",0)}</div><div class="b" style="flex:1;padding:22px">' + ''.join(f'<div style="margin-bottom:16px"><div style="height:20px;border-radius:99px;background:#dbe3f5;overflow:hidden"><div style="width:{w}%;height:100%;background:{k}"></div></div></div>' for w, k in ((85, c), (60, '#ffc94d'), (40, '#ff5a4e'), (72, '#13b58f'))) + '</div></div>' + f'<div class="b" style="margin-top:18px;padding:18px 22px;display:flex;gap:14px;align-items:center"><div style="width:42px;height:42px;border-radius:50%;background:{c}"></div>{bar(65,16,"#0b1b3f",0)}</div>'

def m_cash(c):
    moeda = lambda x, y, s, k: f'<div style="position:absolute;left:{x}px;top:{y}px;width:{s}px;height:{s}px;border-radius:50%;background:{k};border:8px solid rgba(255,255,255,.6);display:grid;place-items:center;font:800 {s//2}px Bricolage Grotesque;color:#0b1b3f">$</div>'
    return f'<div style="position:relative;height:420px">{moeda(60,40,170,"#ffc94d")}{moeda(290,150,210,c)}{moeda(520,30,150,"#ff5a4e")}{moeda(110,250,130,"#13b58f")}</div><div class="b" style="padding:16px 22px;display:flex;gap:14px;align-items:center"><div style="width:42px;height:42px;border-radius:12px;background:{c}"></div>{bar(65,16,"#0b1b3f",0)}</div>'

def m_agent(c):
    return f'<div style="display:flex;gap:22px;align-items:flex-start"><svg viewBox="0 0 32 32" width="180" height="180"><rect x="4" y="9" width="24" height="17" rx="7" fill="#0b1b3f"/><circle cx="11.5" cy="17.5" r="2.6" fill="#ffc94d"/><circle cx="20.5" cy="17.5" r="2.6" fill="#ffc94d"/><rect x="14.5" y="4" width="3" height="5" rx="1.5" fill="#0b1b3f"/><circle cx="16" cy="3.8" r="2" fill="{CORAL}"/><path d="M11.5 22.6c1.2.9 2.8 1.4 4.5 1.4s3.3-.5 4.5-1.4" stroke="#ffc94d" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg><div style="flex:1">{m_chat(c)}</div></div><div style="display:flex;gap:12px;margin-top:24px;flex-wrap:wrap">' + ''.join(f'<div style="padding:10px 18px;border-radius:12px;background:#fff;border:1.5px solid #dbe3f5;font-weight:700;font-size:19px">{t}</div>' for t in ('Atendimento', 'Agenda', 'Cobrança', 'Avaliação', 'Resumo')) + '</div>'

def m_crm(c):
    return f'<div style="display:flex;gap:16px"><div class="b" style="flex:.8;padding:18px">' + ''.join(f'<div style="display:flex;gap:10px;align-items:center;margin-bottom:14px"><div style="width:38px;height:38px;border-radius:50%;background:{k}"></div><div style="flex:1">{bar(80,12,"#0b1b3f",6)}{bar(50,10,"#dbe3f5",0)}</div></div>' for k in (c, '#ffc94d', '#13b58f', '#ff5a4e')) + f'</div><div style="flex:1.2">{m_chat(c)}</div></div>'

MOCK = {'agenda': m_agenda, 'odonto': m_odonto, 'chat': m_chat, 'dash': m_dash, 'tele': m_tele, 'net': m_net, 'phone': m_phone, 'map': m_map,
        'cards': m_cards, 'doc': m_doc, 'face': m_face, 'calc': m_calc, 'space': m_space, 'edu': m_edu, 'cash': m_cash, 'agent': m_agent, 'crm': m_crm}

# ---------- peças de slide ----------
SLIDES = []
def add(h, cls=''): SLIDES.append((h, cls))

def foot(n):
    return f'<div class="foot"><img src="logo-wmundi.png" alt=""><span>wmundi.com · <b>WMundi Technologies &amp; Co®</b></span><span>{n}</span></div>'

def produto(num, nome, cat, tag, itens, mock, titulo_dev, chips=None, logo=None, extra=None, nota=None, sufixo=''):
    cor = CAT[cat][1]
    ic = f'<img src="{logo}" alt="">' if logo else e(''.join(w[0] for w in nome.split()[:2]).upper())
    corpo = MOCK[mock](cor)
    ch = f'<div class="chips">{"".join(f"<span>{e(c)}</span>" for c in chips)}</div>' if chips else ''
    lis = ''.join(f'<li>{e(i)}</li>' for i in itens)
    nt = f'<div class="nota">{e(nota)}</div>' if nota else ''
    return (f'<div class="pad" style="--c:{cor}"><div class="prod"><div><div class="pn"><div class="badge">{ic}</div><div class="cat">{num:02d} · {e(CAT[cat][0])}{sufixo}</div></div>'
            f'<h1 class="pt">{e(nome)}</h1><p class="tag">{e(tag)}</p><ul class="bl">{lis}</ul>{ch}</div>'
            f'<div class="art">{dev(titulo_dev, corpo, cor)}</div></div></div>{nt}')

# ---------- CONTEÚDO ----------
CONTATO = [('Razão social', 'Instituto Ravel de Ensino Superior Ltda.<br>CNPJ 03.162.275/0001-10'),
           ('Endereço', 'Av. XV de Novembro, 255, Sobreloja<br>Maringá · Paraná · Brasil'),
           ('E-mail', 'info@wmundi.com'), ('Telefone e WhatsApp', '(44) 98453-5069<br>wmundi.com')]

# 1 capa
add(f'''<div class="pad capa" style="padding-top:110px"><div class="ring"><i></i><i></i><i></i><i></i></div>
<img class="logo" src="logo-wmundi.png" alt="WMundi Marketing Digital"><div class="rule"></div>
<h1>Tecnologia que trabalha para o seu negócio <em>prosperar</em>.</h1>
<p class="sub">Portfólio de soluções e Programa de Gestores WMundi</p></div>
<div class="foot"><span>Maringá · Paraná · Brasil</span><span>wmundi.com · <b>WMundi Technologies &amp; Co®</b></span></div>''')

# 2 sumário
add(f'''<div class="pad"><div class="eyebrow">Roteiro</div><h2>O que você vai conhecer</h2>
<div class="cards" style="grid-template-columns:repeat(3,1fr)">
<div class="card"><h3><span class="dot"></span>A WMundi</h3><p>Quem somos, as 7 áreas de atuação e as três frentes em destaque.</p></div>
<div class="card"><h3><span class="dot" style="--c:{CORAL}"></span>Portfólio de soluções</h3><p>23 soluções para saúde, educação, comércio, mobilidade, finanças e gestão.</p></div>
<div class="card"><h3><span class="dot" style="--c:{MINT}"></span>Programa de Gestores</h3><p>Como levar a WMundi para a sua região, com o apoio da matriz.</p></div></div></div>''', 'alt')

# 3 quem somos
add(f'''<div class="pad"><div class="eyebrow">A WMundi</div><h2>Uma empresa de tecnologia, <em>do esboço à operação</em>.</h2>
<p class="lead">A WMundi desenvolve sistemas, aplicativos e agentes de inteligência artificial para clínicas, escolas, comércio, serviços e empresas. Todo o desenvolvimento é feito na nossa sede, em Maringá-PR, com acompanhamento próximo de cada cliente.</p>
<div class="cards" style="grid-template-columns:repeat(3,1fr)">
<div class="card"><h3><span class="dot"></span>Desenvolvimento próprio</h3><p>Equipe e tecnologia na sede. O que é essencial não é terceirizado.</p></div>
<div class="card"><h3><span class="dot" style="--c:{CORAL}"></span>Presença internacional</h3><p>Registros no Brasil e na Europa e estrutura pronta para crescer para outros países.</p></div>
<div class="card"><h3><span class="dot" style="--c:{MINT}"></span>Aplicativos nas lojas</h3><p>Contas ativas na App Store (Apple) e no Google Play para publicar aplicativos para iPhone, iPad e Android.</p></div></div></div>''')

# 4 números
add(f'''<div class="pad"><div class="eyebrow">WMundi em números</div><h2>Um ecossistema <em>completo e integrado</em>.</h2>
<div class="nums"><div><b>23</b><span>soluções no portfólio</span></div><div><b>7</b><span>áreas de atuação</span></div><div><b>Próprio</b><span>desenvolvimento feito na nossa sede</span></div><div><b>BR · EU</b><span>registros no Brasil e na Europa</span></div><div><b>Semanal</b><span>atualização dos sistemas</span></div></div>
<p class="lead" style="margin-top:60px">As soluções conversam entre si: agenda, cadastro, financeiro, contabilidade, RH, marketing e mensageria compartilham a mesma base.</p></div>''', 'alt')

# 5 áreas
areas = [('Desenvolvimento de aplicativos', 'iPhone, iPad e Android', BLUE), ('Marketing digital', 'Automações e ferramentas para as suas redes e vendas', CORAL),
         ('Educação', 'Reforço, preparatórios e gestão educacional', MINT), ('Saúde', 'Odontologia e medicina, on-line e presencial', '#7a4dff'),
         ('Serviços', 'Espaços, profissionais, mobilidade e comércio', '#e08a00'), ('Automação', 'Fluxos, integrações e soluções sob medida', '#0f9fc9'), ('Inteligência artificial', 'Agentes que atendem, agendam e cobram, com supervisão humana', SUN)]
add(f'''<div class="pad"><div class="eyebrow">Nossas especialidades</div><h2>Sete áreas de excelência, <em>uma só inteligência</em>.</h2>
<div class="cards" style="grid-template-columns:repeat(4,1fr);gap:22px">{"".join(f'<div class="card" style="--c:{c}"><h3><span class="dot"></span>{e(t)}</h3><p>{e(d)}</p></div>' for t, d, c in areas)}</div></div>''')

# 6-8 destaques
def destaque(eye, titulo, lead, cols, cor):
    return (f'<div class="pad"><div class="eyebrow">{e(eye)}</div><h2>{titulo}</h2><p class="lead">{e(lead)}</p><div class="cards" style="grid-template-columns:repeat({len(cols)},1fr);--c:{cor}">' +
            ''.join(f'<div class="card"><h3><span class="dot"></span>{e(t)}</h3><p>{e(d)}</p></div>' for t, d in cols) + '</div></div>')
add(destaque('Em destaque', 'Criação de sites e <em>soluções personalizadas</em>.', 'Sites institucionais, lojas virtuais, landing pages e sistemas sob medida, elegantes, rápidos e preparados para converter visitas em clientes.',
             [('Sites e landing pages', 'Alta conversão, versão para celular e suporte contínuo.'), ('Lojas virtuais', 'Catálogo, pedidos e pagamentos integrados.'), ('Sistemas sob medida', 'Soluções desenhadas para o fluxo do seu negócio.'), ('Identidade e domínio', 'Branding, registro de domínio, hospedagem e Google Meu Negócio.')], BLUE), 'alt')
add(destaque('Em destaque', 'Automação para as suas <em>redes sociais</em>.', 'Gerencie Instagram, Facebook, Google, TikTok, LinkedIn e X com mais eficiência. Nós criamos as automações; as suas contas continuam sob o seu controle.',
             [('Publicações agendadas', 'Calendário organizado em todas as redes.'), ('Conteúdo com IA', 'Roteiros e legendas criados por inteligência artificial, com a sua aprovação.'), ('Respostas supervisionadas', 'Respostas automáticas registradas e sob supervisão.'), ('Relatórios automáticos', 'Resultados claros, sem trabalho manual.')], CORAL))
add(destaque('Em destaque', 'Aplicativos para <em>iPhone, iPad e Android</em>.', 'Do primeiro esboço à publicação nas lojas, com manutenção e suporte contínuos. A WMundi mantém contas ativas na App Store e no Google Play.',
             [('Aplicativos próprios e sob encomenda', 'Da ideia ao produto publicado.'), ('Publicação nas duas lojas', 'Cuidamos do processo de envio e atualização.'), ('Manutenção contínua', 'Evolução e suporte depois do lançamento.'), ('Agentes de IA integrados', 'Atendimento inteligente dentro do aplicativo.')], MINT), 'alt')

# 9 segurança
add(f'''<div class="pad"><div class="eyebrow">Segurança e controle</div><h2>A tecnologia executa. <em>Você decide.</em></h2>
<div class="cards" style="grid-template-columns:repeat(3,1fr)">
<div class="card"><h3><span class="dot"></span>Decisões sempre suas</h3><p>Cobrança, banco de dados, acessos e textos legais só avançam com aprovação.</p></div>
<div class="card"><h3><span class="dot" style="--c:{CORAL}"></span>Registro completo</h3><p>Cada ação fica no histórico: quem fez, o quê e quando.</p></div>
<div class="card"><h3><span class="dot" style="--c:{MINT}"></span>Controle absoluto</h3><p>Cada agente tem limite de uso e pode ser desligado a qualquer momento.</p></div>
<div class="card"><h3><span class="dot" style="--c:#7a4dff"></span>Privacidade e LGPD</h3><p>Os dados dos seus clientes pertencem a você. Consentimento registrado e opção de sair.</p></div>
<div class="card"><h3><span class="dot" style="--c:#e08a00"></span>Verificação em duas etapas</h3><p>Acesso protegido nos sistemas, com envio seguro de arquivos.</p></div>
<div class="card"><h3><span class="dot" style="--c:#0f9fc9"></span>Atendimento dedicado</h3><p>Suporte por e-mail e acompanhamento por uma equipe que conhece o seu caso.</p></div></div></div>''', 'alt')

# 10 divisor portfólio
add(f'''<div class="pad" style="display:flex;flex-direction:column;justify-content:center"><div class="eyebrow">Parte 2</div><h2 style="font-size:130px;max-width:1500px">Portfólio de <em>soluções</em></h2><p class="lead" style="font-size:40px">23 soluções, uma só plataforma de tecnologia.</p></div>''', 'div')

# 11 grade do portfólio
GRADE = [('Saúde', 'saude', ['Completodonto', 'AlignSystem', 'MedicinaOnline']),
         ('Marketing e IA', 'mkt', ['REVAH', 'Agentes WMundi', 'Mundi Business']),
         ('Educação', 'edu', ['WhatSpeak', 'AllCollege', 'EduMaster Pro']),
         ('Comércio e serviços', 'neg', ['Venda de Empresas', 'SpaceHour', 'Studio BB', 'Lavacar Smart', 'ClubeFaz', 'Cashbacksmart']),
         ('Mobilidade e carreira', 'mob', ['EarlyCar', 'UrbanFlow', 'MeuEmprego']),
         ('Gestão empresarial', 'mod', ['Gerenciador de vendas', 'Gerenciador fiscal e contábil', 'Gerenciador de RH', 'Ponto por reconhecimento facial', 'Precificador'])]
def grade():
    out = ''
    for tit, cat, nomes in GRADE:
        c = CAT[cat][1]
        out += f'<div class="bk" style="--c:{c}"><h4>{e(tit)}</h4><div class="cs">' + ''.join(f'<span><i></i>{e(n)}</span>' for n in nomes) + '</div></div>'
    return f'<div class="pgb">{out}</div>'
add(f'<div class="pad"><div class="eyebrow">O portfólio em um olhar</div><h2 style="font-size:64px">23 soluções, <em>seis frentes</em>.</h2>{grade()}</div>', 'alt')

N = [0]
def p(*a, **k):
    N[0] += 1
    return produto(N[0], *a, **k)

# 12-14 Completodonto
add(p('Completodonto', 'saude', 'O ecossistema de gestão odontológica que reúne a clínica inteira em um só lugar.',
      ['Agenda inteligente, com agendamento on-line e confirmação automática', 'Prontuário digital completo, do cadastro à evolução clínica', 'Orçamentos, financeiro e recebimentos integrados',
       'Marketing e relacionamento com o paciente, com recall', 'Equipe, laboratório e documentos na mesma plataforma', 'Segurança, auditoria e privacidade (LGPD)'],
      'agenda', 'Completodonto · Agenda', logo='logo-completodonto.png', sufixo=' · visão geral'))
add(p.__call__ if False else produto(N[0], 'Completodonto', 'saude', 'Do primeiro atendimento ao tratamento concluído, tudo registrado e organizado.',
      ['Prontuário e anamnese digitais, com assinatura e LGPD', 'Odontograma e periodontograma digitais', 'Plano de tratamento e orçamento em poucos cliques',
       'Evolução, documentos clínicos e arquivos de exames', 'Cirurgia, implantodontia e prótese', 'Ortodontia, ortopedia funcional e DTM / dor orofacial'],
      'odonto', 'Completodonto · Clínico', logo='logo-completodonto.png', sufixo=' · módulo clínico'))
add(produto(N[0], 'Completodonto', 'saude', 'Gestão do negócio integrada, sem planilhas e sem retrabalho.',
      ['Agenda com tempo clínico configurável, laboratório e próximo retorno', 'Recall: retorno e reativação de pacientes', 'Financeiro, cobrança e recebimentos (Pix, boleto e cartão)',
       'Precificador e gerenciador fiscal e contábil integrados', 'RH, ponto da equipe, marketing e mensageria (REVAH)'],
      'dash', 'Completodonto · Gestão', chips=['Agenda', 'Financeiro', 'Contabilidade', 'Recall', 'Marketing', 'RH', 'IA'], logo='logo-completodonto.png', sufixo=' · gestão e integrações'), 'alt')

add(p('AlignSystem®', 'saude', 'Consultas odontológicas on-line e presencial, com agendamento automático e on-line.',
      ['Consulta on-line para o seu próximo paciente de alinhadores', 'Atendimento presencial na mesma agenda', 'Agendamento automático e on-line, 24 horas por dia',
       'Confirmação e lembretes automáticos ao paciente'], 'tele', 'AlignSystem · Consulta'), 'alt')
add(p('MedicinaOnline', 'saude', 'Consultas on-line e tratamentos híbridos.',
      ['Teleconsultas com agendamento on-line', 'Tratamentos híbridos: remoto e presencial combinados', 'Cadastro de pacientes e agenda integrados', 'Lembretes e confirmação automáticos'], 'tele', 'MedicinaOnline · Teleconsulta'))
add(p('REVAH', 'mkt', 'Mensageria multicanal com CRM e inteligência artificial.',
      ['WhatsApp, SMS, e-mail e voz em um só lugar', 'CRM com o histórico completo de cada contato', 'Campanhas e automações de relacionamento', 'Robô de atendimento com IA e transferência para a equipe',
       'Integração com o Completodonto'], 'crm', 'REVAH · Conversas', logo='logo-revah.svg', sufixo=' · mensageria e CRM'), 'alt')
add(produto(N[0], 'REVAH', 'mkt', 'Gerador de leads com captação inteligente e respeito à LGPD.',
      ['Segmentação por perfil, segmento e região', 'Listas prontas para campanhas e abordagem comercial', 'Convite que identifica o operador e a origem, com opção de sair',
       'Bloqueio automático de quem pediu para não ser contatado', 'Importação de planilhas e contato por WhatsApp em um clique'], 'cards', 'REVAH · Leads', logo='logo-revah.svg', sufixo=' · gerador de leads'))
add(p('Agentes WMundi', 'ia', 'Criação de robôs com inteligência artificial para soluções específicas e personalizadas.',
      ['Você descreve o que precisa; nós construímos o agente sob medida', 'Pedido pelo ícone "Peça o seu agente", em qualquer aplicativo', 'Funciona dentro dos sistemas WMundi: enxerga agenda, cadastro e financeiro',
       'Supervisão humana, registro de cada ação e botão para desligar'], 'agent', 'Agentes WMundi', sufixo=' · personalizados'), 'alt')
add(produto(N[0], 'Agentes WMundi', 'ia', 'Cinco agentes prontos para começar, e quantos mais o seu negócio precisar.',
      ['Atendente de WhatsApp, 24 horas por dia', 'Agenda inteligente: confirma, remarca e preenche a lista de espera', 'Cobrança de atraso, feita com educação',
       'Pós-atendimento e avaliação no Google', 'Resumo diário do dono, com as prioridades do dia'], 'chat', 'Agentes WMundi · Prontos', sufixo=' · agentes prontos'))
add(p('Mundi Business', 'mkt', 'Mensageria e network entre clientes e usuários que aderirem ou autorizarem receber informações da rede.',
      ['Rede de relacionamento entre clientes e usuários participantes', 'Comunicação apenas com quem aderiu ou autorizou', 'Consentimento registrado e opção de sair a qualquer momento',
       'Mensagens segmentadas por interesse', 'Respeito à LGPD desde a origem'], 'net', 'Mundi Business · Rede'), 'alt')
add(p('WhatSpeak', 'edu', 'Cursos de idiomas, começando pelo inglês, com proposta de até 14 idiomas.',
      ['Curso de inglês como ponto de partida', 'Proposta de expansão para até 14 idiomas', 'Trilhas por nível e acompanhamento do aluno', 'Aprendizado pelo celular'], 'phone', 'WhatSpeak · Idiomas'))
add(p('Venda de Empresas', 'mkt', 'Aplicativo para anunciar e vender empresas.',
      ['Anúncio de empresas à venda', 'Encontro entre vendedores e compradores interessados', 'Perfil do negócio com informações organizadas', 'Contato reservado e seguro'], 'cards', 'Venda de Empresas · Anúncios'), 'alt')
add(p('SpaceHour', 'neg', 'Locação de espaços compartilhados com outros profissionais: escritórios, salas, clínicas e mais.',
      ['Reserva de espaços por hora', 'Escritórios, salas e clínicas compartilhados', 'Anfitriões anunciam e profissionais reservam', 'Verificação de identidade e regras claras de uso'], 'space', 'SpaceHour · Espaços', logo='logo-spacehour.png'))
add(p('AllCollege', 'edu', 'Aplicativo de educação: reforço do ensino fundamental ao vestibular e preparatório para as principais provas.',
      ['Reforço escolar do ensino fundamental ao médio', 'Preparação para vestibulares e ENEM', 'ENAMED, ENADE e OAB', 'Concursos públicos', 'Plataforma de estudos com inteligência artificial'], 'edu', 'AllCollege · Estudos'), 'alt')
add(p('EduMaster Pro', 'edu', 'Gerenciador educacional completo: conteúdo acadêmico, AVA, administrativo e muito mais.',
      ['Conteúdo acadêmico e ambiente virtual de aprendizagem (AVA)', 'Gestão administrativa: matrículas, turmas e calendário', 'Financeiro e cobrança de mensalidades', 'Comunicação com alunos e responsáveis',
       'Os recursos do ecossistema WMundi em versão ampliada para instituições de ensino'], 'edu', 'EduMaster Pro · Gestão'))
add(p('Studio BB', 'neg', 'Gerenciador com marketing integrado e agendamento on-line para salões de beleza e barbearias.',
      ['Agendamento on-line por profissional', 'Marketing integrado e relacionamento com clientes', 'Programas de assinatura', 'Gestão do negócio em um só lugar'], 'agenda', 'Studio BB · Agenda'), 'alt')
add(p('Lavacar Smart', 'neg', 'Gestão de lava-car, com marketing e programa de assinatura integrados.',
      ['Semelhante ao sistema de salões e barbearias, adaptado ao lava-car', 'Agendamento de serviços', 'Marketing integrado', 'Programa de assinatura para clientes frequentes'], 'agenda', 'Lavacar Smart · Agenda'))
add(p('ClubeFaz', 'neg', 'Clube de profissionais prestadores de serviço.',
      ['Rede de profissionais prestadores de serviço', 'Perfil profissional para ser encontrado', 'Contratação de serviços de forma simples', 'Visibilidade para quem presta e conveniência para quem contrata'], 'cards', 'ClubeFaz · Profissionais'), 'alt')
add(p('Cashbacksmart', 'neg', 'Cashback para qualquer segmento.',
      ['Programa de cashback multiempresa', 'Lojistas de todos os segmentos podem aderir', 'Clientes acumulam e usam os benefícios', 'Fidelização e recompra'], 'cash', 'Cashbacksmart · Benefícios'))
add(p('EarlyCar', 'mob', 'Carona e compartilhamento de rotas entre usuários cadastrados, com endereço fixo.',
      ['Usuários cadastrados e identificados', 'Rotas e horários combinados', 'Endereço fixo de origem e destino', 'Carona corporativa e entre colegas'], 'map', 'EarlyCar · Rotas'), 'alt')
add(p('UrbanFlow', 'mob', 'Cobrança de estacionamento rotativo e localização de vagas para estacionar na rua.',
      ['Cobrança de estacionamento rotativo', 'Localização de vagas na rua', 'Menos tempo procurando vaga', 'Gestão para quem administra o estacionamento'], 'map', 'UrbanFlow · Vagas'))
add(p('MeuEmprego', 'car', 'Sistema de oferta e procura de vagas, regional ou municipal.',
      ['Empresas publicam vagas', 'Candidatos encontram oportunidades na sua região', 'Foco regional ou municipal', 'Contato direto entre candidato e empresa'], 'cards', 'MeuEmprego · Vagas'), 'alt')
add(p('Gerenciador de vendas', 'mod', 'Controle de vendedores, comissões, entregas de produtos e muito mais.',
      ['Gestão da equipe de vendedores', 'Controle de comissões', 'Acompanhamento de entregas de produtos', 'Funil de vendas, propostas e metas'], 'dash', 'Gerenciador de vendas'))
add(p('Gerenciador fiscal e contábil', 'mod', 'Toda a contabilidade da empresa, com cálculo de impostos e guias.',
      ['Escrituração e rotinas contábeis organizadas', 'Cálculo de impostos e geração de guias', 'Organização de notas, receitas e despesas', 'Integrado ao financeiro e ao RH'], 'doc', 'Fiscal e contábil',
      chips=['FGTS', 'ISS', 'IRPJ', 'IRPF', 'CSLL', 'PIS', 'COFINS', 'e outros'], nota='As obrigações seguem o regime tributário de cada empresa.'), 'alt')
add(p('Gerenciador de RH', 'mod', 'Controle de toda a jornada do funcionário, de ponta a ponta.',
      ['Cadastro de colaboradores e documentos', 'Férias, escalas e salário', 'Avaliação de desempenho', 'Indicadores de pessoas'], 'cards', 'Gerenciador de RH'))
add(p('Ponto por reconhecimento facial', 'mod', 'Cuida da jornada do funcionário e envia tudo para o RH.',
      ['Registro de entrada, intervalos e saída pelo rosto', 'Controle de faltas e atrasos', 'Sem relógio de ponto e com menos fraude', 'Envio automático para o RH e a folha'], 'face', 'Ponto facial'), 'alt')
add(p('Precificador', 'mod', 'Sugere o preço certo e mostra o ponto de equilíbrio para o seu negócio ter lucro.',
      ['Sugestão de preço com base em valores de mercado', 'Considera custo fixo, custo variável e impostos', 'Considera o pró-labore', 'Mostra o ponto de equilíbrio do faturamento, do produto ou do serviço'], 'calc', 'Precificador'))

# integração
add(f'''<div class="pad"><div class="eyebrow">Ecossistema</div><h2>Soluções que <em>conversam entre si</em>.</h2>
<p class="lead">O cliente começa por uma solução e amplia quando quiser, sem trocar de plataforma e sem cadastrar tudo de novo.</p>
<div class="cards" style="grid-template-columns:repeat(4,1fr)">
<div class="card"><h3><span class="dot"></span>Agenda e cadastro</h3><p>Compartilhados entre saúde, beleza, serviços e educação.</p></div>
<div class="card"><h3><span class="dot" style="--c:{CORAL}"></span>Marketing e mensageria</h3><p>REVAH e Mundi Business falam com os clientes do seu sistema.</p></div>
<div class="card"><h3><span class="dot" style="--c:{MINT}"></span>Gestão empresarial</h3><p>Financeiro, contabilidade, RH, ponto e precificação na mesma base.</p></div>
<div class="card"><h3><span class="dot" style="--c:{SUN}"></span>Agentes de IA</h3><p>Atendem, agendam, cobram e avaliam dentro de cada sistema.</p></div></div></div>''', 'alt')

# divisor gestores
add(f'''<div class="pad" style="display:flex;flex-direction:column;justify-content:center;--c:{CORAL}"><div class="eyebrow">Parte 3</div><h2 style="font-size:130px;max-width:1500px">Programa de <em>Gestores WMundi</em></h2><p class="lead" style="font-size:40px">Leve a WMundi para a sua região, com o apoio da matriz.</p></div>''', 'div')
add(f'''<div class="pad"><div class="eyebrow">A oportunidade</div><h2>Um negócio de tecnologia <em>com portfólio pronto</em>.</h2>
<p class="lead">Toda empresa precisa estar no digital: sistema de gestão, aplicativo, atendimento por WhatsApp, presença no Google. Como Gestor WMundi, você chega à sua região com a solução pronta e o respaldo de uma empresa que desenvolve, entrega e dá suporte.</p>
<div class="cards" style="grid-template-columns:repeat(3,1fr)"><div class="card"><h3><span class="dot"></span>Portfólio na prateleira</h3><p>23 soluções para você apresentar a clínicas, escolas, comércio e empresas.</p></div>
<div class="card"><h3><span class="dot" style="--c:{CORAL}"></span>Atuação em todo o Brasil</h3><p>Trabalhe na sua cidade ou atenda clientes em todo o território nacional.</p></div>
<div class="card"><h3><span class="dot" style="--c:{MINT}"></span>Flexibilidade</h3><p>Trabalhe no seu ritmo, de casa, sem exclusividade e sem metas impostas.</p></div></div></div>''')
add(f'''<div class="pad"><div class="eyebrow">Como funciona</div><h2>Você constrói a relação. <em>A matriz entrega.</em></h2>
<div class="cards" style="grid-template-columns:1fr 1fr;margin-top:50px">
<div class="card"><h3><span class="dot"></span>O papel do Gestor</h3><ul><li>Apresentar as soluções e identificar oportunidades</li><li>Construir relacionamento com os clientes da região</li><li>Acompanhar a carteira de clientes</li></ul></div>
<div class="card"><h3><span class="dot" style="--c:{CORAL}"></span>O papel da matriz</h3><ul><li>Desenvolvimento, implantação e manutenção dos sistemas</li><li>Suporte técnico e atualizações semanais</li><li>Materiais de divulgação e treinamento</li></ul></div></div></div>''', 'alt')
add(f'''<div class="pad"><div class="eyebrow">Perfil e documentação</div><h2>Quem pode ser <em>Gestor WMundi</em>.</h2>
<div class="cards" style="grid-template-columns:1fr 1fr;margin-top:50px">
<div class="card"><h3><span class="dot"></span>Perfil ideal</h3><ul><li>Empresários, consultores e profissionais com atuação local</li><li>Experiência em relacionamento e vendas consultivas</li><li>Interesse em tecnologia e em construir uma carteira de clientes</li><li>Parceria comercial entre empresas (pessoa jurídica ou MEI)</li></ul></div>
<div class="card"><h3><span class="dot" style="--c:{CORAL}"></span>Documentação</h3><ul><li>CNPJ ativo (MEI ou ME) com atividade de intermediação de negócios</li><li>Contrato social ou Certificado MEI (CCMEI)</li><li>Documento com foto e CPF do responsável</li><li>Comprovante de endereço da empresa</li><li>Dados bancários e contato atualizados</li></ul></div></div></div>''')
passos = [('Interesse', 'Você entra em contato pelo e-mail ou pelo WhatsApp e se apresenta.'), ('Apresentação', 'Reunião on-line para conhecer o programa, os produtos e tirar dúvidas.'), ('Proposta', 'Enviamos a proposta formal do programa.'),
          ('Documentação', 'Você envia os documentos da sua empresa.'), ('Aprovação', 'A matriz valida os documentos e conclui o seu cadastro.'), ('Contrato', 'Você recebe a minuta do contrato para ler com calma.'), ('Assinatura', 'Assinatura na sede, em Maringá-PR, com boas-vindas e treinamento.')]
add(f'''<div class="pad"><div class="eyebrow">Jornada de ingresso</div><h2>Do primeiro contato à <em>parceria formalizada</em>.</h2>
<div class="steps">{"".join(f'<div class="card"><div class="n">{i+1:02d}</div><h3>{e(t)}</h3><p>{e(d)}</p></div>' for i, (t, d) in enumerate(passos))}</div></div>''', 'alt')
add(f'''<div class="pad"><div class="eyebrow">O que a matriz oferece</div><h2>Apoio para você <em>começar bem</em>.</h2>
<div class="cards" style="grid-template-columns:repeat(3,1fr)">
<div class="card"><h3><span class="dot"></span>Portfólio completo</h3><p>Soluções prontas, com atualização semanal.</p></div>
<div class="card"><h3><span class="dot" style="--c:{CORAL}"></span>Treinamento</h3><p>Boas-vindas e capacitação sobre cada solução.</p></div>
<div class="card"><h3><span class="dot" style="--c:{MINT}"></span>Suporte técnico</h3><p>Implantação, suporte e manutenção ficam com a WMundi.</p></div>
<div class="card"><h3><span class="dot" style="--c:#7a4dff"></span>Materiais de divulgação</h3><p>Apresentações, cards e página para captar interessados.</p></div>
<div class="card"><h3><span class="dot" style="--c:#e08a00"></span>Agentes de IA</h3><p>Atendimento e automações para apoiar a sua carteira.</p></div>
<div class="card"><h3><span class="dot" style="--c:#0f9fc9"></span>Atendimento dedicado</h3><p>Uma equipe para tirar dúvidas e acompanhar a parceria.</p></div></div></div>''')

# contato (último)
add(f'''<div class="pad"><div class="eyebrow">Vamos conversar</div><h2>Faça parte da <em>WMundi</em>.</h2>
<p class="lead">Fale com a nossa equipe, conheça as soluções e receba a proposta do programa.</p>
<div class="ct">{"".join(f'<div class="card"><h3>{e(t)}</h3><p>{d}</p></div>' for t, d in CONTATO)}</div>
<div class="nota" style="bottom:130px">As condições do programa constam na proposta e no contrato de parceria.</div></div>''', 'alt')

# ---------- montagem ----------
corpo = ''
for i, (h, cls) in enumerate(SLIDES, 1):
    rodape = '' if i == 1 else foot(i)
    corpo += f'<section class="slide {cls}">{h}{rodape}</section>\n'
doc = f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>WMundi · Portfólio e Programa de Gestores</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;800&family=DM+Sans:wght@400;500;700&display=swap">
<style>{CSS}</style></head><body>{corpo}</body></html>'''
open(os.path.join(AQUI, 'apresentacao.html'), 'w', encoding='utf-8').write(doc)
print('slides:', len(SLIDES))
