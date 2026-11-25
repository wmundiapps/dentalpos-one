#!/usr/bin/env python3
"""Gera /demos/ (galeria + uma página por produto) a partir de tools/products.json e tools/content/*.json."""
import json, html, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
prods = json.load(open(f"{ROOT}/tools/products.json"))
CATS = {"saude":"Saúde","mkt":"Marketing e vendas","edu":"Educação","neg":"Comércio e serviços","mob":"Mobilidade e automotivo","fin":"Financeiro","car":"Carreira","mod":"Automações e módulos integrados"}
E = lambda s: html.escape(str(s), quote=True)

# cabeçalho e rodapé copiados da página de produtos existente (mesmo visual do site)
src = open(f"{ROOT}/produtos/index.html", encoding="utf-8").read()
HEADER = re.search(r'<a class="skip".*?</header>', src, re.S).group(0).replace('class="cur"', '')
HEADER = HEADER.replace('<a href="/produtos/">Produtos</a>', '<a href="/produtos/">Produtos</a><a href="/demos/" class="cur">Demonstrações</a>')
FOOTER = re.search(r'<footer class="big-f">.*?</footer>', src, re.S).group(0)
HEAD = lambda title, desc: f'''<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{E(title)}</title><meta name="description" content="{E(desc)}"><meta name="robots" content="noindex,nofollow">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;800&family=DM+Sans:wght@400;500;700&display=swap">
<link rel="stylesheet" href="/assets/wmundi.css"><link rel="stylesheet" href="/assets/demo.css"></head><body>
'''
TAIL = '''<script src="/assets/rastreio.js" defer></script><script src="/assets/wmundi.js"></script>%s
<script src="/assets/wmundi-agentes.js" defer></script><wmundi-agentes app="site" endpoint="/"></wmundi-agentes></body></html>'''
BAR = '<div class="fict-bar" role="note"><b>MODELO DEMONSTRATIVO · TODOS OS DADOS SÃO FICTÍCIOS.</b> Nomes, valores e números abaixo são inventados, só para você simular.</div>'

def icon(p):
    if p.get("logo"): return f'<img class="plogo" src="{E(p["logo"])}" alt="" loading="lazy">'
    return f'<div class="ic" style="background:{E(p.get("color") or "#2f5bff")}">{E(p.get("ic") or p["nome"][:2])}</div>'

def badge(c):
    m = re.match(r"^(ok|warn|bad|info):(.*)$", str(c))
    return f'<span class="bd {m.group(1)}">{E(m.group(2))}</span>' if m else E(c)

def page(p, c):
    nome = p["nome"]
    kp = "".join(f'<div class="kpi"><small>{E(k["l"])}</small><b>{E(k["v"])}</b>{"<em>"+E(k["d"])+"</em>" if k.get("d") else ""}</div>' for k in c["kpis"])
    t = c["table"]
    th = "".join(f"<th>{E(x)}</th>" for x in t["cols"])
    tr = "".join("<tr>" + "".join(f"<td>{badge(x) if i == len(r)-1 else E(x)}</td>" for i, x in enumerate(r)) + "</tr>" for r in t["rows"])
    ch = c["chart"]; mx = max(ch["values"]) or 1
    bars = "".join(f'<div title="{E(l)}: {E(v)}"><span style="height:{max(2, round(v/mx*100))}%"></span><small>{E(l)}</small></div>' for l, v in zip(ch["labels"], ch["values"]))
    s = c["sim"]
    sl = "".join(f'<div class="sl"><label for="in-{i["id"]}"><span>{E(i["label"])}</span><output id="ov-{i["id"]}"></output></label><input type="range" id="in-{i["id"]}" min="{i["min"]}" max="{i["max"]}" step="{i["step"]}" value="{i["val"]}"></div>' for i in s["inputs"])
    rs = "".join(f'<div><small>{E(o["label"])}</small><b id="out-{k}">—</b></div>' for k, o in enumerate(s["outputs"]))
    steps = "".join(f"<li>{E(x)}</li>" for x in c["fluxo"])
    rec = "".join(f"<li>{E(x)}</li>" for x in c["recursos"])
    faq = "".join(f'<details class="q"><summary>{E(f["q"])}</summary><p>{E(f["a"])}</p></details>' for f in c["faq"])
    simdata = json.dumps({"inputs": s["inputs"], "outputs": s["outputs"]}, ensure_ascii=False).replace("</", "<\\/")
    opts = E(nome)
    return HEAD(f"Demonstração {nome} · WMundi®", f"Modelo demonstrativo do {nome} com dados fictícios. Simule e solicite a sua proposta.") + HEADER + BAR + f'''
<main id="conteudo">
<section class="dhero"><div class="w"><div class="crumb"><a href="/produtos/">Produtos</a> › <a href="/demos/">Demonstrações</a> › {E(nome)}</div>
<span class="eyebrow" style="color:var(--sun)">{E(CATS.get(p["cat"], ""))} · demonstração com dados fictícios</span>
<h1>{E(nome)}</h1><p class="lead">{E(c["tagline"])}</p>
<div class="cta"><a class="btn" href="#adquirir">Quero adquirir este sistema</a><a class="btn sec" href="#simulador">Ir para o simulador</a></div>
<span class="persona">{E(c["persona"])}</span></div></section>

<section class="dsec"><div class="w"><h2>Como o painel pode ficar</h2><p class="lead">Exemplo visual do sistema em uso. O desenho final e as funções são definidos na proposta.</p>
<div class="mock"><div class="mock-top"><i></i><i></i><i></i><span>{E(nome)} · painel de exemplo</span><span class="tag">FICTÍCIO</span></div>
<div class="mock-body"><div class="kpis">{kp}</div>
<div class="dgrid"><div class="box"><h3>{E(t["title"])}</h3><div class="tw"><table class="dt"><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table></div></div>
<div class="box"><h3>{E(ch["title"])}</h3><div class="bars" role="img" aria-label="{E(ch["title"])} (dados fictícios)">{bars}</div></div></div></div></div></div></section>

<section class="dsec" id="simulador"><div class="w"><div class="sim" id="sim"><h2>{E(s["title"])}</h2><p class="lead">{E(s["intro"])}</p>
<div class="sim-g"><div>{sl}</div><div class="res">{rs}</div></div>
<p class="simnote">Simulação ilustrativa com números fictícios. Não representa promessa de resultado nem proposta comercial.</p></div>
<script type="application/json" id="sim-data">{simdata}</script></div></section>

<section class="dsec"><div class="w"><h2>Como seria o uso, passo a passo</h2><p class="lead">Fluxo de exemplo.</p><ol class="steps">{steps}</ol></div></section>
<section class="dsec"><div class="w"><h2>Recursos de referência</h2><p class="lead">Lista ilustrativa. O escopo final consta na proposta.</p><ul class="rec">{rec}</ul></div></section>
<section class="dsec"><div class="w" style="max-width:820px"><h2>Perguntas rápidas</h2>{faq}</div></section>

<section class="dsec" id="adquirir"><div class="w" style="max-width:860px"><div class="buy"><span class="real">Este pedido é real</span><h2>Gostou? Solicite o {E(nome)}</h2>
<p class="lead">A demonstração usa dados fictícios, mas o seu pedido é de verdade: nossa equipe retorna por e-mail ou WhatsApp com proposta e implantação.</p>
<div class="formbox"><form data-wm-form method="POST" name="pedido-produto"><input type="hidden" name="form-name" value="pedido-produto">
<input type="hidden" name="pagina" data-utm="pagina"><input type="hidden" name="utm_source" data-utm="utm_source"><input type="hidden" name="utm_medium" data-utm="utm_medium"><input type="hidden" name="utm_campaign" data-utm="utm_campaign"><input type="hidden" name="utm_content" data-utm="utm_content"><input type="hidden" name="utm_term" data-utm="utm_term"><input type="hidden" name="gclid" data-utm="gclid"><input type="hidden" name="fbclid" data-utm="fbclid"><input type="hidden" name="ttclid" data-utm="ttclid">
<p class="hp"><label>Não preencha: <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>
<div class="two"><div class="f"><label for="nome">Seu nome</label><input id="nome" name="nome" type="text" required maxlength="120"></div><div class="f"><label for="email">E-mail</label><input id="email" name="email" type="email" required maxlength="120"></div></div>
<div class="two"><div class="f"><label for="whatsapp">WhatsApp (com DDD)</label><input id="whatsapp" name="whatsapp" type="tel" required maxlength="120"></div><div class="f"><label for="produto">Produto de interesse</label><input id="produto" name="produto" type="text" value="{opts}" readonly></div></div>
<div class="f"><label for="mensagem">Fale um pouco sobre o seu negócio</label><textarea id="mensagem" name="mensagem" maxlength="600"></textarea></div>
<label class="consent"><input type="checkbox" name="consentimento" value="sim" required> Concordo em ser contatado pela WMundi<sup>®</sup> sobre este pedido. Os dados são usados só para responder a você.</label>
<button class="btn" type="submit">Solicitar proposta</button><div class="errmsg" hidden>Não foi possível enviar agora. Escreva para info@wmundi.com e responderemos.</div></form>
<div class="okmsg" hidden>Solicitação recebida. Nossa equipe retornará em breve por e-mail ou WhatsApp.</div></div></div></div></section>
</main>
''' + FOOTER + TAIL % '<script src="/assets/demo.js"></script>'

def gallery(have):
    cards = []
    for p in prods:
        if p["slug"] not in have: continue
        c = have[p["slug"]]
        cards.append(f'<article class="dc" data-cat="{p["cat"]}"><span class="fx">DADOS FICTÍCIOS</span><div class="row1">{icon(p)}<div><span class="cat">{E(CATS.get(p["cat"], ""))}</span><h3>{E(p["nome"])}</h3></div></div><p>{E(c["tagline"])}</p><div class="btns"><a class="btn sm" href="/demos/{p["slug"]}/">Abrir demonstração</a><a class="btn sm line" href="/demos/{p["slug"]}/#adquirir">Adquirir</a></div></article>')
    flt = '<button type="button" data-c="todos" aria-pressed="true">Todos</button>' + "".join(f'<button type="button" data-c="{k}" aria-pressed="false">{v}</button>' for k, v in CATS.items() if any(have.get(p["slug"]) and p["cat"] == k for p in prods))
    return HEAD("Demonstrações dos sistemas · WMundi®", "Teste modelos demonstrativos, com dados fictícios, dos sistemas da WMundi e solicite o seu.") + HEADER + BAR + f'''
<main id="conteudo"><section class="dhero"><div class="w"><span class="eyebrow" style="color:var(--sun)">Demonstrações</span><h1>Simule antes de adquirir</h1>
<p class="lead">Um modelo demonstrativo de cada sistema da WMundi<sup>®</sup>. Mexa nos números, veja o painel e, se gostar, solicite o seu. <b>Todos os dados exibidos são fictícios.</b></p>
<div class="cta"><a class="btn" href="#lista">Ver as demonstrações</a><a class="btn sec" href="/produtos/">Voltar ao catálogo</a></div></div></section>
<section class="dsec" id="lista"><div class="w"><div class="filters" role="group" aria-label="Filtrar por área">{flt}</div><div class="dcards">{"".join(cards)}</div></div></section></main>
''' + FOOTER + TAIL % '''<script>(function(){var b=document.querySelectorAll(".filters button");Array.prototype.forEach.call(b,function(x){x.addEventListener("click",function(){var c=x.getAttribute("data-c");Array.prototype.forEach.call(b,function(y){y.setAttribute("aria-pressed",y===x)});Array.prototype.forEach.call(document.querySelectorAll(".dc"),function(d){d.hidden=!(c==="todos"||d.getAttribute("data-cat")===c)})})})})();</script>'''

have = {}
for p in prods:
    f = f'{ROOT}/tools/content/{p["slug"]}.json'
    if os.path.exists(f): have[p["slug"]] = json.load(open(f, encoding="utf-8"))
for p in prods:
    if p["slug"] in have:
        os.makedirs(f'{ROOT}/demos/{p["slug"]}', exist_ok=True)
        open(f'{ROOT}/demos/{p["slug"]}/index.html', "w", encoding="utf-8").write(page(p, have[p["slug"]]))
os.makedirs(f"{ROOT}/demos", exist_ok=True)
open(f"{ROOT}/demos/index.html", "w", encoding="utf-8").write(gallery(have))
print(len(have), "demos geradas;", "faltam:", [p["slug"] for p in prods if p["slug"] not in have])
