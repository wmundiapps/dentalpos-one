"""Gera o CSV de produtos da loja (WooCommerce > Produtos > Importar).
Preços: os mesmos oferecidos ao parceiro (Silvio Breda) e as regras de CLAUDE.md. O que não tem preço aprovado fica "sob consulta".
Todos os produtos são do tipo 'externo': o botão leva ao pedido de proposta, sem carrinho (cobrança recorrente e implantação são fechadas na proposta)."""
import csv, pathlib

aqui = pathlib.Path(__file__).parent
URL = "https://wmundi.com/portfolio/#pedido"
CONSULTA = "<p><b>Valor sob consulta.</b> Solicite a sua proposta.</p>"
R = "WMundi<sup>®</sup>"


def ul(itens):
    return "<ul>" + "".join(f"<li>{i}</li>" for i in itens) + "</ul>"


P = [
    ("WM-REVAH", "REVAH", "Marketing e vendas", "", "Mensageria multicanal com CRM e inteligência artificial.",
     ul(["WhatsApp, SMS, e-mail e voz em um só lugar", "CRM com o histórico completo de cada contato", "Campanhas e automações de relacionamento", "Robô de atendimento com IA e transferência para a equipe"]) + CONSULTA),
    ("WM-COMPLETODONTO", "Completodonto", "Saúde", "197", "Gestão odontológica completa: agenda, prontuário, financeiro e marketing em um só lugar.",
     ul(["Agenda inteligente, com agendamento on-line e confirmação automática", "Prontuário digital, odontograma e plano de tratamento", "Financeiro, cobrança e recebimentos (Pix, boleto e cartão)", "Recall, marketing e relacionamento com o paciente"])
     + "<p><b>Planos mensais:</b> Basic R$ 197 · Intermedium R$ 397 · Plenum R$ 597.</p><p>Profissionais: 30 dias grátis, sem cartão.</p>"),
    ("WM-STUDIOBB", "Studio BeautyBarber", "Comércio e serviços", "", "Gerenciador com marketing integrado e agendamento on-line para salões de beleza e barbearias.",
     ul(["Agendamento on-line por profissional", "Marketing integrado e relacionamento com clientes", "Programas de assinatura", "Gestão do negócio em um só lugar"]) + CONSULTA),
    ("WM-MEDICINAONLINE", "MedicinaOnline", "Saúde", "", "Consultas on-line e tratamentos híbridos.",
     ul(["Teleconsultas com agendamento on-line", "Tratamentos híbridos: remoto e presencial combinados", "Cadastro de pacientes e agenda integrados", "Lembretes e confirmação automáticos"]) + CONSULTA),
    ("WM-WHATSPEAK", "WhatSpeak", "Educação", "", "Cursos de idiomas, começando pelo inglês.",
     ul(["Curso de inglês como ponto de partida", "Trilhas por nível e acompanhamento do aluno", "Aprendizado pelo celular"]) + CONSULTA),
    ("WM-ALLCOLLEGE", "AllCollege", "Educação", "", "Reforço do ensino fundamental ao vestibular e preparatório para as principais provas.",
     ul(["Reforço escolar do ensino fundamental ao médio", "Preparação para vestibulares e ENEM", "ENAMED, ENADE e OAB", "Concursos públicos"]) + CONSULTA),
    ("WM-LAVACAR", "Lavacar Smartwash", "Comércio e serviços", "", "Gestão de lava-car, com marketing e programa de assinatura integrados.",
     ul(["Agendamento de serviços", "Marketing integrado", "Programa de assinatura para clientes frequentes"]) + CONSULTA),
    ("WM-MEUEMPREGO", "MeuEmprego, assinatura para empresas", "Carreira", "", "Sistema de oferta de vagas, em assinatura para empresas.",
     ul(["Empresas publicam e gerenciam as suas vagas", "Divulgação da vaga na região ou no município", "Contato direto com os candidatos"]) + CONSULTA),
    ("WM-ESTOQUE", "Controle de estoque", "Gestão empresarial", "", "Controle de entradas, saídas e reposição, integrado ao restante do sistema.",
     ul(["Cadastro de produtos e movimentações", "Alertas de reposição", "Integrado ao financeiro e às vendas"]) + CONSULTA),
    ("WM-HOTELARIA", "Gerenciador de Hotelaria", "Hotelaria", "", "Gestão para hotéis, pousadas e resorts, com o precificador e o ponto integrados.",
     ul(["Gestão da operação do hotel em um só lugar", "Integração com o Precificador de Hotelaria", "Integração com o ponto por reconhecimento facial", "Personalizado para o seu hotel"]) + CONSULTA),
    ("WM-RH", "Gerenciador de RH", "Gestão empresarial", "", "Controle de toda a jornada do funcionário, de ponta a ponta.",
     ul(["Cadastro de colaboradores e documentos", "Férias, escalas e salário", "Avaliação de desempenho", "Indicadores de pessoas"]) + CONSULTA),
    ("WM-PONTO", "Ponto por Reconhecimento Facial", "Gestão empresarial", "297", "Registro da jornada pelo rosto, com prova de vida, em terminais da empresa, integrado ao RH.",
     ul(["Prova de vida: foto e vídeo não passam", "Modo manual com aprovação do gestor e modo sem internet", "Atestados, banco de horas e fechamento do mês no RH", "Alertas ao gestor: férias, experiência, estagiários, freelancers e isentos de ponto", "Quantos terminais precisar, sem custo extra, em locais diferentes"])
     + "<p><b>Mensalidade por faixa de funcionários</b> (mais implantação única):</p>"
       "<table><tr><th>Faixa</th><th>Mensalidade</th><th>Implantação</th></tr>"
       "<tr><td>1 a 50</td><td>R$ 297</td><td>R$ 990</td></tr><tr><td>51 a 100</td><td>R$ 497</td><td>R$ 1.490</td></tr>"
       "<tr><td>101 a 150</td><td>R$ 697</td><td>R$ 1.990</td></tr><tr><td>151 a 200</td><td>R$ 897</td><td>R$ 2.490</td></tr>"
       "<tr><td>201 ou mais</td><td>R$ 897 + R$ 1,00 por funcionário acima de 200</td><td>R$ 2.490</td></tr></table>"
       "<p>Os terminais são equipamentos da empresa. A " + R + " não recomenda o uso de celulares pessoais ou de máquinas do funcionário, para minimizar riscos trabalhistas.</p>"),
    ("WM-PRECIFICADOR", "Precificador de Hotelaria", "Hotelaria", "197", "Diária certa por nível de apartamento, com ponto de equilíbrio e lucro desejado. Personalizável para qualquer segmento.",
     ul(["Hotel comum, 4 estrelas e resort, com níveis de apartamento", "Custos fixos e variáveis, impostos e lucro mensal desejado", "Comparação com concorrentes e prestadores da região", "Ocupação mínima, prazos de pagamento e correção"])
     + "<p><b>Versão pronta:</b> R$ 197 por mês + implantação de R$ 990.</p><p><b>Personalizado para o seu negócio (qualquer segmento):</b> R$ 297 por mês + implantação a partir de R$ 4.900.</p>"),
]

cols = ["Type", "SKU", "Name", "Published", "Is featured?", "Visibility in catalog", "Short description", "Description", "Tax status", "In stock?", "Regular price", "Categories", "Product URL", "Button text"]
saida = aqui / "loja" / "produtos-loja-wmundi.csv"
saida.parent.mkdir(exist_ok=True)
with open(saida, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    for sku, nome, cat, preco, curta, desc in P:
        w.writerow({"Type": "external", "SKU": sku, "Name": nome, "Published": 1, "Is featured?": 0, "Visibility in catalog": "visible",
                    "Short description": curta + (" A partir de R$ " + preco + " por mês." if preco else " Valor sob consulta."),
                    "Description": desc, "Tax status": "taxable", "In stock?": 1, "Regular price": preco, "Categories": cat,
                    "Product URL": URL, "Button text": "Solicitar proposta"})
print(len(P), "produtos em", saida)
