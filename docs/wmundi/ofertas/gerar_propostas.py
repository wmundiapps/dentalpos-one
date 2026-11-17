"""Gera as propostas comerciais em HTML (A4). O PDF sai por pdf.mjs. Valores sugeridos: a aprovar pelo Robson."""
import base64, pathlib

a = pathlib.Path(__file__).parent
logo = "data:image/png;base64," + base64.b64encode((a.parent / "site-novo/assets/logo-wmundi.png").read_bytes()).decode()
brl = lambda v: "R$ " + f"{v:,.0f}".replace(",", ".")
brl2 = lambda v: "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
mes = lambda v: f"{v:.1f}".replace(".", ",")

CSS = """
@page{size:A4;margin:0}*{box-sizing:border-box}
body{margin:0;font:9.8pt/1.42 'DM Sans',system-ui,sans-serif;color:#14213d}
.pg{width:210mm;height:297mm;overflow:hidden;padding:11mm 14mm 18mm;position:relative;page-break-after:always}
.cap{background:#0b1b3f;color:#fff;padding:0}.cap .in{padding:22mm 18mm}.cap img{height:20mm}
.cap h1{font-size:30pt;line-height:1.1;margin:26mm 0 6mm}.cap p{color:#c9d3f0;font-size:13pt}.cap .bar{height:5mm;background:linear-gradient(90deg,#ffc94d,#ff5a4e,#2f5bff,#13b58f)}
h2{font-size:17pt;color:#0b1b3f;margin:0 0 4mm;border-bottom:3px solid #ffc94d;padding-bottom:2mm}h3{font-size:12pt;margin:5mm 0 2mm;color:#2f5bff}
table{width:100%;border-collapse:collapse;margin:2mm 0;font-size:9.5pt}th{background:#0b1b3f;color:#fff;text-align:left;padding:1.8mm}td{padding:1.8mm;border-bottom:1px solid #dfe5f3}
.box{background:#eef2ff;border-radius:3mm;padding:4mm;margin:3mm 0}.ok{background:#e4f8f1}.al{background:#fff3d1}.nt{font-size:9pt;color:#5b6785}
ul{margin:1mm 0 2mm 5mm;padding:0}li{margin:1mm 0}.ft{position:absolute;bottom:8mm;left:16mm;right:16mm;font-size:8.5pt;color:#5b6785;border-top:1px solid #dfe5f3;padding-top:2mm}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:4mm}.big{font-size:20pt;font-weight:700;color:#2f5bff}
"""
FT = '<div class="ft">WMundi · Instituto Ravel de Ensino Superior Ltda. · CNPJ 03.162.275/0001-10 · Av. XV de Novembro, 255, Sobreloja, Maringá-PR · info@wmundi.com · (44) 99946-6451 · wmundi.com</div>'


BASE = "https://wmundi-ofertas.netlify.app/"
LINKS = {
    "Ponto por Reconhecimento Facial": [("Testar a demonstração do Ponto Facial", BASE + "ponto/")],
    "Precificador": [("Testar a demonstração do Precificador", BASE + "precificador-8f3k/")],
    "UrbanFlow": [("Testar a demonstração do UrbanFlow", BASE + "urbanflow/")],
    "Guia do vendedor": [("Demo Ponto Facial", BASE + "ponto/"), ("Demo Precificador (não divulgar)", BASE + "precificador-8f3k/"), ("Demo UrbanFlow", BASE + "urbanflow/")],
}


def doc(titulo, sub, paginas, interno=False):
    if titulo in LINKS:
        itens = "".join(f'<p style="margin:1.5mm 0"><b>{t}:</b> <a href="{u}" style="color:#2f5bff">{u}</a></p>' for t, u in LINKS[titulo])
        paginas = paginas[:-1] + [paginas[-1] + f'<div class="box" style="margin-top:5mm"><b>Clique para abrir</b>{itens}</div>']
    cap = f'<div class="pg cap"><div class="in"><img src="{logo}" alt="WMundi"><h1>{titulo}</h1><p>{sub}</p><p style="margin-top:30mm;font-size:10pt">Novembro de 2026 · Proposta comercial{" · USO INTERNO, NÃO ENCAMINHAR AO CLIENTE" if interno else " · validade de 30 dias"}</p></div><div class="bar"></div></div>'
    corpo = "".join(f'<div class="pg">{p}{FT}</div>' for p in paginas)
    return f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>{titulo}</title><style>{CSS}</style></head><body>{cap}{corpo}</body></html>'


# ---------- PONTO ----------
faixas = [("1 a 50", 297, 990), ("51 a 100", 497, 1490), ("101 a 150", 697, 1990), ("151 a 200", 897, 2490)]
rows = "".join(f"<tr><td>{f} funcionários</td><td>{brl(m)}/mês</td><td>{brl(i)}</td></tr>" for f, m, i in faixas)
rows += f"<tr><td>201 ou mais</td><td>{brl(897)}/mês + R$ 1,00 por funcionário acima de 200 (ou sob consulta)</td><td>{brl(2490)}</td></tr>"
eco = 30 * 0.7 * 35 + 400
liq = eco - 297
pay = 990 / liq
ponto = [
    f"""<h2>O que é</h2><p>Sistema de ponto por <b>reconhecimento facial</b>, ligado ao RH. O funcionário olha para a câmera de um terminal de ponto <b>da empresa</b> (tablet ou leitor fixo); o sistema confere o rosto com o cadastro, faz a <b>prova de vida</b> (barra foto e vídeo) e registra a batida. Tudo cai na folha de ponto, no banco de horas e no fechamento do mês.</p>
<h3>O que a demonstração mostra</h3><ul><li>Como é a batida facial, inclusive a tentativa de fraude com foto.</li><li>Como instalar, em 9 etapas.</li><li><b>Modo manual</b> para quando o rosto não é reconhecido (o gestor aprova) e <b>modo sem internet</b>: o terminal guarda a batida e envia sozinho quando a conexão volta, com a hora original.</li><li>Como integra com o RH: fechamento do mês e arquivo CSV para folha e contabilidade.</li><li>Como inserir atestado, com dias justificados e sem desconto.</li><li>Equipe e alertas: férias chegando e vencidas, fim da experiência e se já foi renovada, estagiário, freelancer, diretoria e cargos isentos de ponto.</li><li>E-mails automáticos ao dono ou gestor.</li></ul>
<h3>Quem fica isento</h3><p>Diretoria e cargos de confiança podem ser marcados como isentos de ponto; freelancers não têm ponto nem férias; estagiários têm regras próprias de contrato e recesso. O cargo é a função do funcionário.</p>
<h3>Equipamento da empresa</h3><p>O registro é feito somente em terminais da empresa. Não usamos o celular pessoal do funcionário, pois há decisões judiciais favoráveis a funcionários que processaram a empresa por isso (confirmar com o advogado da empresa). Em empresas com mais de um local, cada unidade recebe seus terminais, quantos forem necessários.</p><h3>Cuidados</h3><p class="nt">Biometria é dado pessoal sensível (LGPD): coleta com consentimento, finalidade definida e opção de registro alternativo (senha no terminal da empresa). Regras trabalhistas de referência devem ser validadas pelo contador/advogado da empresa.</p>""",
    f"""<h2>Investimento</h2><p>Mensalidade pela faixa de funcionários cadastrados, mais implantação única (cadastro, treinamento e acompanhamento da primeira semana).</p>
<table><tr><th>Faixa</th><th>Mensalidade</th><th>Implantação</th></tr>{rows}</table>
<p class="nt">Valores sugeridos, sujeitos a confirmação. Os terminais são equipamentos da empresa (tablet Android/iPad ou leitor fixo), do cliente ou fornecidos sob consulta. <b>Quantidade de terminais ilimitada, sem custo extra</b>, para empresas com locais de trabalho distantes entre si.</p>
<h2 style="margin-top:8mm">Retorno do investimento (payback)</h2>
<div class="box ok"><b>Exemplo: empresa com 42 funcionários</b> (faixa 1 a 50).<br>Horas do RH gastas hoje com folha de ponto: 30 h/mês, das quais 70% são eliminadas, a R$ 35 a hora; mais R$ 400/mês de horas extras e atrasos pagos por erro de controle.<br>
Economia estimada: <b>{brl(eco)}/mês</b> · Mensalidade: {brl(297)} · Economia líquida: <b>{brl(liq)}/mês</b><br>Implantação de {brl(990)} ÷ {brl(liq)} = <b>payback em cerca de {mes(pay)} mês</b>.</div>
<p class="nt">Exemplo ilustrativo, não é promessa de resultado. Na demonstração (aba “Planos e retorno”) você digita os números da sua empresa e o payback é recalculado.</p>
<h3>Condições</h3><ul><li>Contrato mensal, sem fidelidade no primeiro período (a definir).</li><li>Suporte por e-mail; queda de serviços de terceiros tratada com os fornecedores responsáveis, conforme cláusulas-padrão.</li><li>Atualizações semanais, que podem causar indisponibilidade temporária.</li></ul>
<h3>Próximos passos</h3><ol><li>Teste a demonstração.</li><li>Informe o número de funcionários.</li><li>Assinatura e agendamento da instalação.</li></ol>""",
]
(a / "pdf").mkdir(exist_ok=True)
(a / "pdf" / "proposta-ponto.html").write_text(doc("Ponto por Reconhecimento Facial", "Registro de jornada seguro, integrado ao RH, com alertas ao gestor", ponto))

# ---------- PRECIFICADOR ----------
n_ap, ocup = 90, 0.65
dia_extra = 12
ganho = n_ap * 30 * ocup * dia_extra
pay_p = 4900 / (ganho - 297)
preci = [
    f"""<h2>O que é</h2><p>Ferramenta para <b>formar preço com cálculo real</b>: produtos, serviços, locação, hotelaria e consultórios. O resultado muda na hora conforme você ajusta custos, impostos, ocupação ou número de atendimentos.</p>
<h3>Hotéis e resorts</h3><ul><li>Diária por nível de apartamento, com fator de preço entre padrão, superior, luxo e suíte.</li><li>Hotel comum, 4 e 5 estrelas / resort.</li><li>Custos fixos e variáveis, impostos e comissão de reservas.</li><li>Lucro mensal desejado e sua distribuição.</li><li>Comparação com concorrentes e prestadores da região (média de mercado).</li><li><b>Ocupação mínima</b> e diárias vendidas para o ponto de equilíbrio.</li><li>Prazo de pagamento e correção, para não perder no financiamento.</li><li>Gráfico de lucro por ocupação (onde dá prejuízo).</li></ul>
<h3>Dentistas e médicos</h3><ul><li>Valor do atendimento para empatar e para atingir o lucro desejado.</li><li>Atendimentos necessários por mês.</li><li>Quanto o lucro aumenta se atender mais pacientes.</li></ul>
<h3>Produtos, serviços e locação</h3><ul><li>Preço pelo custo, impostos, comissões e margem.</li><li>Hora técnica e custo indireto.</li><li>Diária e mensalidade de bens locados, com depreciação e payback do bem.</li></ul>
<h3>Personalização</h3><p>Montamos a ferramenta com os campos, nomes e regras do seu negócio (temporada, pacotes, convênios, frota).</p>""",
    f"""<h2>Investimento</h2>
<table><tr><th>Opção</th><th>Mensalidade</th><th>Implantação</th></tr>
<tr><td>Padrão (um segmento: hotel, saúde, comércio, serviços ou locação)</td><td>{brl(197)}/mês</td><td>{brl(990)}</td></tr>
<tr><td>Personalizado para o seu negócio (campos, regras, marca)</td><td>{brl(297)}/mês</td><td>sob consulta (referência: a partir de {brl(4900)})</td></tr></table>
<p class="nt">Valores sugeridos, sujeitos a confirmação. Personalização é orçada após levantamento.</p>
<h2 style="margin-top:8mm">Retorno do investimento (payback)</h2>
<div class="box ok"><b>Exemplo ilustrativo: hotel com {n_ap} apartamentos, ocupação de 65%.</b><br>Ao corrigir a diária média em apenas {brl(dia_extra)} (por conhecer o ponto de equilíbrio e o preço da região), a receita sobe cerca de <b>{brl(ganho)}/mês</b>.<br>
Versão personalizada: implantação {brl(4900)} + mensalidade {brl(297)}.<br>Payback: {brl(4900)} ÷ ({brl(ganho)} − {brl(297)}) ≈ <b>{mes(pay_p)} mês</b>.</div>
<div class="box al"><b>Atenção:</b> o exemplo mostra o método; o ganho real depende do mercado e da gestão. Os cálculos são estimativas para apoiar decisões e não substituem contador.</div>
<h3>Próximos passos</h3><ol><li>Teste a demonstração com os números do seu negócio.</li><li>Reunião de 30 minutos para levantar custos e regras.</li><li>Proposta fechada e entrega em até 15 dias úteis (referência).</li></ol>""",
]
(a / "pdf" / "proposta-precificador.html").write_text(doc("Precificador", "Preço certo para produtos, serviços, locação, hotéis e consultórios", preci))

# ---------- URBANFLOW (prefeitura) ----------
def cenario(vagas, ocup, horas, tarifa, dias, efet):
    return vagas * ocup * horas * tarifa * dias * efet

base = cenario(800, .60, 10, 3, 26, .85)
cons = cenario(800, .40, 10, 3, 26, .70)
pil_base = cenario(80, .60, 10, 3, 26, .85)
pil_cons = cenario(80, .40, 10, 3, 26, .70)
inv_pil = 4 * 4500 + 2 * 9000 + 4 * 800 + 38000
inv_cid = 40 * 4500 + 20 * 9000 + 40 * 800 + 38000
urb = [
    f"""<h2>A proposta</h2><p>O <b>UrbanFlow</b> organiza o estacionamento rotativo da cidade: o motorista vê onde há vaga e paga pelo celular; a prefeitura acompanha ocupação, tempo de permanência e arrecadação em tempo real, com fiscalização mais eficiente.</p>
<h3>Como funciona</h3><ul><li><b>Aplicativo do motorista:</b> mapa de vagas livres por quadra, pagamento por tempo exato (Pix e cartão), aviso antes de vencer e prorrogação pelo celular.</li><li><b>Contagem de vagas:</b> contadores nos postes registram entradas e saídas da quadra; câmeras conferem e corrigem periodicamente (exemplo: 80 vagas, 500 entradas e 495 saídas = 5 ocupadas).</li><li><b>Câmeras de placa:</b> leem a placa, lançam o tempo de quem não usa o aplicativo e notificam somente os irregulares.</li><li><b>Painel da prefeitura:</b> ocupação, rotatividade, tempo médio, arrecadação e irregularidades.</li></ul>
<h3>Divisão da receita</h3><div class="box"><b>50% para a prefeitura</b> sobre toda a arrecadação do rotativo. Os outros 50% cobrem tecnologia, operação, fiscalização, atendimento e manutenção.</div>
<h3>Implantação</h3><ol><li><b>Mês 0:</b> contrato/licença e regras da lei municipal, com tratamento de dados (LGPD).</li><li><b>Meses 1–2:</b> piloto em 4 quadras (80 vagas).</li><li><b>Mês 3:</b> avaliação com números reais.</li><li><b>Meses 4–9:</b> expansão pelas quadras de maior movimento.</li><li><b>Mês 10 em diante:</b> cidade completa.</li></ol>""",
    f"""<h2>Investimento e retorno (estimativas)</h2>
<p>Referência de cidade com <b>800 vagas</b> de rotativo e tarifa de R$ 3,00 por hora. Cenário base: ocupação de 60% e 85% de pagamento efetivo. Cenário conservador: 40% e 70%.</p>
<table><tr><th></th><th>Piloto (4 quadras)</th><th>Cidade (800 vagas)</th></tr>
<tr><td>Investimento inicial (referência)</td><td>{brl(inv_pil)}</td><td>{brl(inv_cid)}</td></tr>
<tr><td>Arrecadação bruta/mês · base</td><td>{brl(pil_base)}</td><td>{brl(base)}</td></tr>
<tr><td>Parte da prefeitura (50%) · base</td><td>{brl(pil_base/2)}</td><td>{brl(base/2)}</td></tr>
<tr><td><b>Payback · base</b></td><td><b>{mes(inv_pil/(pil_base/2))} meses</b></td><td><b>{mes(inv_cid/(base/2))} meses</b></td></tr>
<tr><td>Arrecadação bruta/mês · conservador</td><td>{brl(pil_cons)}</td><td>{brl(cons)}</td></tr>
<tr><td>Parte da prefeitura (50%) · conservador</td><td>{brl(pil_cons/2)}</td><td>{brl(cons/2)}</td></tr>
<tr><td><b>Payback · conservador</b></td><td><b>{mes(inv_pil/(pil_cons/2))} meses</b></td><td><b>{mes(inv_cid/(cons/2))} meses</b></td></tr></table>
<p class="nt">Composição do investimento (referência, a confirmar com fornecedores): contador por quadra R$ 4.500; câmera de placa R$ 9.000 (2 no piloto, 20 na cidade); sinalização e QR R$ 800 por quadra; aplicativo e painel R$ 38.000. Payback = investimento ÷ parte mensal da prefeitura.</p>
<div class="box ok"><b>Sem custo inicial para a prefeitura:</b> no modelo de concessão, o investimento é da operadora e a prefeitura recebe 50% desde o primeiro mês. O formato (concessão, credenciamento ou contratação) depende da lei municipal e do processo licitatório.</div>
<div class="box al"><b>Premissas:</b> tarifa, número de vagas e ocupação são exemplos e serão substituídos pelos dados da cidade. Contrato e processo devem ser revisados pela procuradoria do município.</div>
<h3>Próximos passos</h3><ol><li>Teste a demonstração interativa.</li><li>Levantamento: vagas, tarifa atual e arrecadação do rotativo.</li><li>Desenho do piloto e minuta de contrato.</li></ol>""",
]
(a / "pdf" / "proposta-urbanflow.html").write_text(doc("UrbanFlow", "Estacionamento rotativo inteligente: vaga visível, pagamento pelo celular, arrecadação transparente", urb))

# ---------- COMPARATIVO URBANFLOW (para o Robson) ----------
comp = [
    """<h2>Sua ideia x uma implantação mais simples</h2>
<p><b>Sua ideia:</b> contadores nos postes contam entradas e saídas da quadra; vagas livres = capacidade − (entradas − saídas); câmeras leem a placa de quem não tem o aplicativo.</p>
<table><tr><th>Opção</th><th>Mede vaga livre?</th><th>Mede tempo por veículo?</th><th>Custo inicial</th><th>Prazo</th><th>Principal risco</th></tr>
<tr><td><b>A. Contadores nos postes</b> (sua ideia)</td><td>Sim, por quadra, com erro que cresce</td><td>Não (não sabe quem é cada carro)</td><td>Médio</td><td>3–6 meses</td><td>Acumula erro: carro que passa sem parar, moto, ruas com várias entradas. Exige recalibrar</td></tr>
<tr><td><b>B. Pagamento digital + fiscal com câmera no carro</b></td><td>Estimada (pagamentos + histórico)</td><td>Sim, por placa (duas passagens)</td><td><b>Baixo</b></td><td><b>30–60 dias</b></td><td>Não mostra vaga livre exata em tempo real</td></tr>
<tr><td><b>C. Câmeras de placa nas esquinas da quadra</b></td><td>Sim, exata (placas dentro da quadra)</td><td>Sim, entrada e saída</td><td>Médio/alto</td><td>3–6 meses</td><td>Custo por quadra; luz e ângulo; LGPD</td></tr>
<tr><td><b>D. Sensor em cada vaga</b></td><td>Sim, exata</td><td>Sim (com pagamento)</td><td>Alto</td><td>6–12 meses</td><td>Obras, manutenção e vandalismo</td></tr></table>
<h3>Minha recomendação: começar simples e juntar as ideias</h3>
<ol><li><b>Fase 1 (B):</b> aplicativo + Pix/QR + um carro de fiscalização com leitura de placa. Já arrecada, mede o tempo de permanência por placa e gera os primeiros dados. Quase sem obra.</li><li><b>Fase 2 (A + C nos pontos críticos):</b> sua ideia dos contadores entra como camada de “vaga livre” nas quadras de maior procura, e câmeras de placa só nas esquinas das quadras principais para <b>recalibrar o contador automaticamente</b>.</li><li><b>Fase 3:</b> expandir onde os números do piloto mostrarem retorno.</li></ol>
<div class="box"><b>Por que não só contadores:</b> contar carros mostra quantas vagas estão ocupadas, mas não diz <i>quem</i> está estacionado, nem <i>há quanto tempo</i>, nem se pagou. Para cobrar e fiscalizar, a placa é necessária. E a conta “entrou menos saiu” erra um pouco a cada passagem; sem conferência por câmera, em poucos dias o número deixa de bater.</div>
<h3>Cuidados</h3><ul><li>Leitura de placa e dados de localização exigem tratamento de dados (LGPD), com prazo de guarda e finalidade definidos.</li><li>Cobrança de rotativo depende de lei municipal e de licitação/concessão: consultar a Dra. Roberta e a procuradoria do município.</li><li>Preços dos equipamentos são referências e precisam de cotação de fornecedores.</li></ul>""",
]
(a / "pdf" / "comparativo-urbanflow.html").write_text(doc("UrbanFlow: comparativo de soluções", "Sua ideia x implantação mais simples · para o Robson decidir", comp, interno=True))

# ---------- GUIA INTERNO DO VENDEDOR ----------
guia = [
    f"""<h2>Guia do vendedor (interno)</h2>
<p class="nt">Documento interno. Não encaminhar ao cliente.</p>
<h3>O que vender</h3><table><tr><th>Oferta</th><th>Cliente ideal</th><th>Demo</th></tr><tr><td>Ponto Facial</td><td>Empresas com 10 a 200 funcionários, clínicas, lojas, indústrias</td><td>/ponto</td></tr><tr><td>Precificador</td><td>Hotéis, pousadas, clínicas, comércio, locadoras</td><td>/precificador</td></tr><tr><td>UrbanFlow</td><td>Prefeituras e concessionárias de estacionamento</td><td>/urbanflow</td></tr></table>
<h3>Divisão de receita do UrbanFlow (interna)</h3>
<div class="box">Arrecadação bruta: <b>50% prefeitura</b>. Dos 50% restantes: <b>parceiro 30%</b> e <b>WMundi 70%</b>.<br>
Ou seja, sobre a arrecadação bruta: prefeitura 50% · parceiro <b>15%</b> · WMundi <b>35%</b>.</div>
<table><tr><th>Cenário (800 vagas)</th><th>Bruto/mês</th><th>Prefeitura</th><th>Parceiro</th><th>WMundi</th></tr>
<tr><td>Base</td><td>{brl(base)}</td><td>{brl(base*.5)}</td><td>{brl(base*.15)}</td><td>{brl(base*.35)}</td></tr>
<tr><td>Conservador</td><td>{brl(cons)}</td><td>{brl(cons*.5)}</td><td>{brl(cons*.15)}</td><td>{brl(cons*.35)}</td></tr></table>
<p class="nt">Os 35% da WMundi ainda pagam tecnologia, nuvem, suporte e manutenção; no modelo de concessão também o investimento inicial. A margem líquida deve ser calculada antes de fechar. Percentuais do parceiro nunca aparecem na proposta nem na demonstração do cliente.</p>
""",
    """<h2>Conduzindo a venda</h2><h3>Como conduzir a conversa</h3><ol><li>Mostrar a demonstração (10 minutos) e deixar o cliente mexer.</li><li>Perguntar o número de vagas, a tarifa atual e a arrecadação do rotativo (UrbanFlow); número de funcionários (ponto); tipo de negócio e custos (precificador).</li><li>Enviar a proposta em PDF e combinar uma reunião de decisão em até 7 dias.</li></ol>
<h3>O que não prometer</h3><ul><li>Resultado financeiro garantido: os paybacks são exemplos.</li><li>Exatidão de 100% na contagem de vagas: o sistema calibra por câmera, mas há margem de erro.</li><li>Conformidade jurídica: lei municipal, licitação e LGPD são revisadas pela assessoria jurídica.</li><li>Prazos e valores além das propostas sem aprovação do Robson.</li></ul>
<h3>Perguntas frequentes</h3><ul><li><b>Posso testar?</b> Sim, a demonstração é livre e usa dados fictícios.</li><li><b>Dados dos funcionários ficam seguros?</b> Consentimento, finalidade definida e alternativa de registro; regras detalhadas no contrato.</li><li><b>E se a internet cair?</b> O aplicativo guarda a batida e envia quando a conexão volta.</li></ul>
<h3>Contato</h3><p>Robson · (44) 99946-6451 · info@wmundi.com</p>""",
]
(a / "pdf" / "guia-vendedor-INTERNO.html").write_text(doc("Guia do vendedor", "Ponto Facial · Precificador · UrbanFlow", guia, interno=True))
print("propostas ok", brl(base), brl(inv_cid), mes(inv_pil / (pil_base / 2)))
