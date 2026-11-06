#!/usr/bin/env python3
"""Gera TEXTOS-POR-REDE.md e textos.json a partir deste arquivo e VERIFICA os limites de caracteres de cada rede.
Uso: python3 gerar-textos.py   (falha com lista de erros se algum texto passar do limite)"""
import json, sys, os
AQUI=os.path.dirname(os.path.abspath(__file__))

SITE='wmundi.com'
T={}  # tudo que será conferido: (rede, campo) -> (texto, limite)

# ---------- Perfis (bios) ----------
BIOS={
 'Instagram':("Tecnologia que faz o seu negócio prosperar. Sites, aplicativos, IA e redes sociais. Maringá-PR. Peça a sua proposta no link.",150),
 'Facebook (descrição curta)':("Sites, aplicativos, agentes de IA e gestão de redes sociais para negócios que querem prosperar. Maringá-PR.",255),
 'TikTok':("Sites, apps e IA para o seu negócio prosperar. Maringá-PR.",80),
 'LinkedIn (slogan)':("Sites, aplicativos e agentes de IA para negócios que querem crescer. Maringá-PR.",120),
 'X':("Sites, aplicativos, agentes de IA e gestão de redes sociais para o seu negócio prosperar. Maringá-PR. Peça a sua proposta.",160),
}
SOBRE=("A WMundi desenvolve sites, aplicativos e sistemas sob medida, gerencia redes sociais e cria agentes de inteligência artificial que atendem, agendam e cobram com supervisão humana. "
 "Nossa equipe, em Maringá-PR, cuida de todo o desenvolvimento e acompanha cada cliente do primeiro esboço à operação. "
 "Mantemos contas ativas na App Store (Apple) e no Google Play para publicar aplicativos para iPhone, iPad e Android. Peça a sua proposta em wmundi.com.")
T[('LinkedIn','Sobre a empresa')]=(SOBRE,2000)

# ---------- Posts (um por tema) ----------
TEMAS=[
 ('marca','Tecnologia que trabalha para o seu negócio prosperar',
  "Todo negócio ambicioso precisa de tecnologia à altura. Na WMundi, unimos sites, aplicativos, agentes de inteligência artificial e gestão de redes sociais em uma única equipe, para que a sua empresa cresça com organização e elegância.\n\nConheça as soluções e peça a sua proposta: wmundi.com",
  ['#WMundi','#TransformacaoDigital','#MarketingDigital','#InteligenciaArtificial','#DesenvolvimentoDeApps','#Maringa']),
 ('sites','O seu site e as suas soluções, sob medida',
  "O seu site é a sala de visitas do seu negócio. Criamos sites institucionais, lojas virtuais e landing pages sob medida, rápidos, elegantes e preparados para converter visitas em clientes. Tudo desenvolvido em Maringá-PR, com suporte contínuo.\n\nSolicite a sua proposta: wmundi.com",
  ['#CriacaoDeSites','#LojaVirtual','#LandingPage','#WebDesign','#WMundi','#Empreendedorismo']),
 ('redes','Presença digital que gera resultado',
  "Instagram, Facebook, Google, TikTok, LinkedIn e X: cuidamos da estratégia, do conteúdo e dos anúncios, com relatórios claros para você acompanhar cada resultado. Sua marca presente onde o seu público está, com consistência e sofisticação.\n\nPeça a sua proposta: wmundi.com",
  ['#GestaoDeRedesSociais','#MarketingDigital','#SocialMedia','#TrafegoPago','#WMundi','#Marca']),
 ('agentes','Agentes de IA que atendem enquanto você descansa',
  "Imagine clientes respondidos a qualquer hora, consultas confirmadas, cobranças de atraso feitas com educação e avaliações recebidas sem esforço. Os agentes de IA da WMundi fazem isso, sempre com supervisão humana nas decisões sensíveis e registro de cada ação.\n\nPeça o seu agente: wmundi.com/agentes",
  ['#InteligenciaArtificial','#AgentesDeIA','#AtendimentoAutomatizado','#WhatsAppBusiness','#WMundi','#Automacao']),
 ('apps','O seu aplicativo, do esboço à loja',
  "Do primeiro esboço à publicação, desenvolvemos aplicativos para iPhone, iPad e Android. A WMundi mantém contas ativas na App Store (Apple) e no Google Play, com manutenção e suporte contínuos.\n\nConte a sua ideia e peça a sua proposta: wmundi.com",
  ['#DesenvolvimentoDeApps','#AppStore','#GooglePlay','#iOS','#Android','#WMundi']),
]
X_POSTS={
 'marca':"Tecnologia que trabalha para o seu negócio prosperar: sites, aplicativos, agentes de IA e redes sociais em uma só equipe. Peça a sua proposta em wmundi.com",
 'sites':"O seu site é a sala de visitas do seu negócio. Criamos sites, lojas virtuais e landing pages sob medida, em Maringá-PR. Peça a sua proposta: wmundi.com",
 'redes':"Instagram, Facebook, Google, TikTok, LinkedIn e X: estratégia, conteúdo e anúncios com relatórios claros. Peça a sua proposta: wmundi.com",
 'agentes':"Agentes de IA que atendem, agendam e cobram com educação, sempre com supervisão humana. Conheça: wmundi.com/agentes",
 'apps':"Do esboço à loja: aplicativos para iPhone, iPad e Android, com manutenção e suporte contínuos. Peça a sua proposta: wmundi.com",
}
for chave,titulo,corpo,tags in TEMAS:
    T[('Instagram',f'Legenda: {titulo}')]=(corpo+"\n\n"+' '.join(tags),2200)
    T[('Facebook',f'Post: {titulo}')]=(corpo,63206)
    T[('LinkedIn',f'Post: {titulo}')]=(corpo+"\n\n"+' '.join(tags[:4]),3000)
    T[('X',f'Post: {titulo}')]=(X_POSTS[chave],280)
for k,(txt,lim) in BIOS.items(): T[(k.split(' ')[0],f'Bio/descrição ({k})')]=(txt,lim)

# ---------- TikTok / Reels: roteiros curtos ----------
ROTEIROS=[
 ('Antes e depois da presença digital (sem prometer resultado)','0–3s: "O seu negócio aparece quando o cliente procura?" | 3–10s: mostrar busca no Google e perfil abandonado | 10–20s: o que fazemos (site, Google Meu Negócio, redes) | 20–25s: "Peça a sua proposta em wmundi.com".'),
 ('Um dia dos agentes de IA','0–3s: "Enquanto você dormia, 3 clientes foram atendidos." (usar exemplo ilustrativo, sem número real) | 3–15s: tela do WhatsApp com a conversa | 15–25s: "Supervisão humana em tudo que é sensível. wmundi.com/agentes".'),
 ('Bastidores do desenvolvimento','0–3s: "Como nasce um aplicativo?" | 3–20s: esboço, protótipo, teste, publicação | 20–25s: "Do esboço à loja. wmundi.com".'),
 ('3 erros de um site que não vende','0–3s: "Seu site faz estes 3 erros?" | 3–20s: lentidão, falta de chamada para ação, sem versão para celular | 20–25s: "Peça uma análise. wmundi.com".'),
 ('Pergunta de cliente: preciso de aplicativo?','0–3s: "Será que o meu negócio precisa de aplicativo?" | 3–20s: quando vale a pena e quando um site basta | 20–25s: "Conte a sua ideia. wmundi.com".'),
]

# ---------- Google Ads ----------
GADS={
 'Criação de sites':{
  'palavras':['criação de sites','criar site para empresa','site profissional','desenvolvimento de sites','loja virtual','criação de loja virtual','landing page','site institucional','criação de sites maringá'],
  'titulos':['Criação de Sites Profissionais','Site Sob Medida para Empresas','Lojas Virtuais e Landing Pages','Peça Sua Proposta Hoje','Desenvolvimento em Maringá-PR','Seu Site Pronto para Vender','Sites Rápidos e Modernos','Do Briefing à Publicação','Suporte e Manutenção Contínuos','WMundi Marketing Digital','Sites com Atendimento por IA','Presença Digital Completa','Fale com a Nossa Equipe','Tecnologia que Faz Prosperar','Solicite uma Proposta'],
  'descricoes':['Sites, lojas virtuais e landing pages sob medida para o seu negócio. Peça a sua proposta.','Desenvolvimento próprio em Maringá-PR, com suporte contínuo e foco em resultado.','Do briefing à publicação, acompanhamos cada etapa do seu novo site.','Integre atendimento por IA ao seu site e atenda clientes a qualquer hora.']},
 'Aplicativos':{
  'palavras':['desenvolvimento de aplicativos','criar aplicativo para empresa','desenvolvedor de aplicativos','aplicativo para iphone e android','criação de app','empresa de desenvolvimento de apps','app sob medida','desenvolvimento de app maringá'],
  'titulos':['Desenvolvimento de Aplicativos','App para iPhone e Android','Do Esboço à Loja de Apps','Aplicativo Sob Medida','Conta Ativa na App Store','Conta Ativa no Google Play','Publicação nas Duas Lojas','Manutenção e Suporte de Apps','Desenvolvimento em Maringá-PR','Conte a Sua Ideia','Peça Sua Proposta Hoje','WMundi Marketing Digital','Apps com Agentes de IA','Equipe Própria de Devs','Solicite uma Proposta'],
  'descricoes':['Desenvolvemos aplicativos para iPhone, iPad e Android, do esboço à publicação.','Conta ativa na App Store e no Google Play. Manutenção e suporte contínuos.','Conte a sua ideia e receba uma proposta com escopo, prazo e investimento.','Aplicativos com agentes de IA integrados para atender e fidelizar clientes.']},
 'Gestão de redes sociais':{
  'palavras':['gestão de redes sociais','agência de marketing digital','gestão de instagram','social media','tráfego pago','marketing digital para empresas','gerenciamento de redes sociais','agência de social media'],
  'titulos':['Gestão de Redes Sociais','Instagram, Facebook e TikTok','LinkedIn e X para Empresas','Google Meu Negócio Otimizado','Anúncios no Google e Meta','Conteúdo com Estratégia','Relatórios Claros de Resultado','Marketing Digital Completo','Peça Sua Proposta Hoje','WMundi Marketing Digital','Presença Digital Consistente','Equipe e IA Trabalhando Juntas','Atendimento Rápido nas Redes','Fale com a Nossa Equipe','Solicite uma Proposta'],
  'descricoes':['Estratégia, conteúdo e anúncios para Instagram, Facebook, Google, TikTok, LinkedIn e X.','Relatórios claros e acompanhamento próximo. Peça a sua proposta.','Sua marca presente onde o público está, com consistência e sofisticação.','Atendimento nas redes com apoio de agentes de IA e supervisão humana.']},
 'Agentes de IA':{
  'palavras':['chatbot para whatsapp','atendimento automático whatsapp','agente de ia para empresas','automação de atendimento','robô de atendimento whatsapp','chatbot para empresas','automatizar atendimento ao cliente','inteligência artificial para atendimento'],
  'titulos':['Agentes de IA para Empresas','Atendimento Automático 24h','Chatbot para WhatsApp','Agenda e Confirmação Auto','Cobrança de Atraso Educada','Avaliação Automática no Google','Supervisão Humana Sempre','Cada Ação Fica Registrada','Peça o Seu Agente Sob Medida','WMundi Marketing Digital','Integrado aos Nossos Sistemas','Menos Tarefas Repetitivas','Fale com a Nossa Equipe','Solicite uma Proposta','Veja Exemplos de Conversa'],
  'descricoes':['Agentes de IA que atendem, agendam e cobram com educação, com supervisão humana.','Cinco agentes prontos e agentes sob medida para o seu negócio. Peça o seu.','O agente propõe, você decide: sem preço inventado, sem diagnóstico, sem promessa.','Atendimento a qualquer hora, com registro de tudo e botão para desligar.']},
}
NEG=['grátis','gratuito','curso','vaga','emprego','estágio','tutorial','como fazer','template pronto','pdf','download','crack','wordpress grátis','canva','faculdade','salário']
for camp,d in GADS.items():
    for i,t in enumerate(d['titulos']): T[('Google Ads',f'{camp} · título {i+1}')]=(t,30)
    for i,t in enumerate(d['descricoes']): T[('Google Ads',f'{camp} · descrição {i+1}')]=(t,90)
PMAX={'nome da empresa':("WMundi Marketing Digital",25),
 'título curto 1':("Sites, Apps e Agentes de IA",30),'título curto 2':("Tecnologia que Faz Prosperar",30),'título curto 3':("Peça Sua Proposta Hoje",30),
 'título longo 1':("Sites, aplicativos, agentes de IA e redes sociais em uma só equipe. Peça a sua proposta.",90),
 'título longo 2':("Tecnologia que trabalha para o seu negócio prosperar. Desenvolvimento em Maringá-PR.",90),
 'descrição 1':("Sites, lojas virtuais, aplicativos e agentes de IA sob medida. Peça a sua proposta.",90),
 'descrição 2':("Gestão de Instagram, Facebook, Google, TikTok, LinkedIn e X com relatórios claros.",90)}
for k,(t,l) in PMAX.items(): T[('Google Ads (Performance Max)',k)]=(t,l)

# ---------- Google Meu Negócio ----------
GMN_DESC=("A WMundi cria sites, lojas virtuais e landing pages sob medida, desenvolve aplicativos para iPhone, iPad e Android, gerencia redes sociais e constrói agentes de inteligência artificial para atendimento, agenda, cobrança de atraso e avaliação, sempre com supervisão humana. "
 "Todo o desenvolvimento é feito em Maringá-PR, com acompanhamento do primeiro esboço à operação. Mantemos contas ativas na App Store e no Google Play. Peça a sua proposta em wmundi.com.")
T[('Google Meu Negócio','Descrição da empresa')]=(GMN_DESC,750)
GMN_POSTS=[
 ('Novidade: agentes de IA','Conheça os agentes de IA da WMundi: atendimento, agenda, cobrança de atraso, avaliação e resumo diário do dono. Escolha um agente pronto ou peça um sob medida em wmundi.com/agentes.'),
 ('Sites e lojas virtuais sob medida','Criamos sites institucionais, lojas virtuais e landing pages sob medida, com suporte contínuo. Peça a sua proposta em wmundi.com.'),
 ('Aplicativos para iPhone e Android','Do esboço à publicação nas lojas de aplicativos. Conte a sua ideia e receba uma proposta em wmundi.com.'),
 ('Gestão de redes sociais','Estratégia, conteúdo e anúncios para Instagram, Facebook, Google, TikTok, LinkedIn e X. Peça a sua proposta em wmundi.com.'),
]
for t,c in GMN_POSTS: T[('Google Meu Negócio',f'Postagem: {t}')]=(c,1500)
GMN_SERV=['Criação de sites','Lojas virtuais','Landing pages','Desenvolvimento de aplicativos','Gestão de redes sociais','Anúncios no Google e na Meta','Agentes de IA e chatbots','Sistemas personalizados']
GMN_QA=[('Vocês desenvolvem aplicativos para iPhone e Android?','Sim. Desenvolvemos aplicativos para iPhone, iPad e Android e mantemos contas ativas na App Store e no Google Play.'),
 ('Como peço uma proposta?','Pelo site wmundi.com, pelo WhatsApp ou pelo e-mail info@wmundi.com. Retornamos com uma proposta personalizada.'),
 ('Vocês gerenciam quais redes sociais?','Instagram, Facebook, Google, TikTok, LinkedIn e X.')]

# ---------- Verificação ----------
erros=[]
for (rede,campo),(txt,lim) in T.items():
    if len(txt)>lim: erros.append(f'{rede} · {campo}: {len(txt)} > {lim}')
for camp,d in GADS.items():
    if len(d['titulos'])!=15 or len(d['descricoes'])!=4: erros.append(f'{camp}: precisa de 15 títulos e 4 descrições')
    if len(set(d['titulos']))!=len(d['titulos']): erros.append(f'{camp}: títulos repetidos')
if erros:
    print('LIMITES ESTOURADOS:'); [print(' -',e) for e in erros]; sys.exit(1)
print(f'ok: {len(T)} textos dentro dos limites')

# ---------- Saída ----------
json.dump({'bios':{k:v[0] for k,v in BIOS.items()},'sobre':SOBRE,'temas':[{'id':a,'titulo':b,'texto':c,'hashtags':d} for a,b,c,d in TEMAS],'x':X_POSTS,'roteiros':[{'titulo':a,'roteiro':b} for a,b in ROTEIROS],
  'google_ads':GADS,'negativas':NEG,'pmax':{k:v[0] for k,v in PMAX.items()},'gmn':{'descricao':GMN_DESC,'servicos':GMN_SERV,'postagens':[{'titulo':a,'texto':b} for a,b in GMN_POSTS],'perguntas':[{'p':a,'r':b} for a,b in GMN_QA]}},
  open(os.path.join(AQUI,'textos.json'),'w',encoding='utf-8'),ensure_ascii=False,indent=2)

L=[]; w=L.append
w('# Textos por rede: WMundi\n\nTodos os textos foram verificados pelo script `gerar-textos.py` (limites de caracteres de cada plataforma). Tom: sofisticado, polido, prosperidade, sem promessas de resultado, sem preços e sem percentuais de parceiros.\nPara editar, altere o script e rode `python3 gerar-textos.py`.\n')
w('## 1. Perfis (bio e descrição)\n'); [w(f'- **{k}** ({len(v[0])}/{v[1]}): {v[0]}') for k,v in BIOS.items()]
w(f'\n**Sobre (LinkedIn, {len(SOBRE)}/2000):** {SOBRE}\n')
w('## 2. Posts por tema (cards em `cards/`)\n')
for chave,titulo,corpo,tags in TEMAS:
    w(f'### {titulo}\n- **Card:** `cards/{chave}-*.png`\n- **Instagram / Facebook / LinkedIn:**\n\n> '+corpo.replace('\n','\n> ')+f'\n\n- **Hashtags:** {" ".join(tags)}\n- **X ({len(X_POSTS[chave])}/280):** {X_POSTS[chave]}\n')
w('## 3. Roteiros curtos (TikTok, Reels, Stories)\n'); [w(f'- **{a}:** {b}') for a,b in ROTEIROS]
w('\nRegras dos vídeos: nada de números inventados nem depoimentos; usar sempre exemplos ilustrativos e dizer que são exemplos.\n')
w('## 4. Google Ads (campanhas de Pesquisa, uma por serviço)\n')
w('Configuração comum: rede de Pesquisa apenas (sem parceiros no início), Brasil com foco em PR, SP e SC nos primeiros 14 dias, idioma português, correspondência de frase e exata, lance "Maximizar conversões", conversão = envio de formulário no site, URL final `https://wmundi.com/proposta/` com parâmetros UTM. **Orçamento diário: a definir pelo Robson** (começar com limite baixo e subir só com conversões).\n')
for camp,d in GADS.items():
    w(f'### Campanha: {camp}\n- **Palavras-chave:** '+'; '.join(f'"{p}"' for p in d['palavras']))
    w('- **Títulos (até 30 caracteres):** '+' | '.join(d['titulos'])); w('- **Descrições (até 90):** '+' | '.join(d['descricoes'])+'\n')
w('### Palavras-chave negativas (todas as campanhas)\n'+', '.join(NEG)+'\n')
w('### Performance Max / Display (ativos de texto)\n'); [w(f'- **{k}** ({len(v[0])}/{v[1]}): {v[0]}') for k,v in PMAX.items()]
w('\nImagens: `cards/*-google-ads-horizontal.png` (1200×628), `cards/*-google-ads-quadrado.png` (1200×1200) e o logo em `docs/wmundi/site-novo/assets/logo-wmundi.png`.\n')
w('## 5. Google Meu Negócio\n- **Categoria principal:** Empresa de software (alternativas: Agência de marketing, Web designer). Empresa com endereço em Maringá-PR; confirmar o tipo (local ou "atende em outras áreas") e a verificação.\n'+f'- **Descrição ({len(GMN_DESC)}/750):** {GMN_DESC}\n- **Serviços:** '+'; '.join(GMN_SERV)+'\n- **Postagens (1 por semana, com card `google-meu-negocio`):**')
for t,c in GMN_POSTS: w(f'  - **{t}** ({len(c)}/1500): {c}')
w('- **Perguntas e respostas (publicar você mesmo):**'); [w(f'  - **{a}** {b}') for a,b in GMN_QA]
w('- **Fotos:** logo, fachada/sede, equipe, telas dos aplicativos (sem dados de clientes). Responder todas as avaliações em até 2 dias úteis (o agente de pós-atendimento ajuda a pedir a avaliação).\n')
open(os.path.join(AQUI,'TEXTOS-POR-REDE.md'),'w',encoding='utf-8').write('\n'.join(L)+'\n')
print('gerado: TEXTOS-POR-REDE.md e textos.json')
