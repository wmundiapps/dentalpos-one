# Wmundi — Plano de execução de negócios

Versão 1 · 17/10/2026 · Dono: Robson · Status: **proposta para decisão**
Premissas marcadas com **(a confirmar)** não foram validadas; números são metas de planejamento, não promessas.

## 1. Visão em uma frase
**Wmundi é uma empresa global de software e inteligência artificial, movida por milhares de robôs e poucas pessoas, que constrói apps e sistemas para saúde, educação, serviços e empresas — do Brasil para o mundo.**

## 2. As quatro ambições e o que cada uma exige

| Ambição | Referência | O que significa na prática | Prova que vamos perseguir |
|---|---|---|---|
| Muito grande | TOTVS | Portfólio de sistemas de gestão por setor, rede de parceiros/revendas, receita recorrente, presença nacional | Receita recorrente (MRR) crescente e carteira diversificada: nenhum produto > 50% da receita em 3 anos |
| Empolgante | RD Station | Marca simpática, conteúdo, comunidade, eventos, "aprenda e venda com a Wmundi", onboarding que encanta | NPS, tamanho da comunidade, tráfego orgânico, indicações |
| IA em soluções | GitHub, Octadesk, Tolzz | Agentes de IA dentro de todo produto + plataforma de agentes vendida como produto próprio (atendimento, vendas, código) | % da receita que vem de IA; tarefas resolvidas por robô sem humano |
| Desenvolvedora de apps | Apple App Store, Google Play | Estúdio de apps próprios e para clientes, com conta de desenvolvedor da empresa, publicação padronizada | Nº de apps publicados, avaliações, instalações |

Ordem de prioridade (recomendada): **1) IA dentro dos produtos que já existem → 2) estúdio de apps → 3) marketing/conteúdo (empolgar) → 4) escala (muito grande).** Sem receita recorrente do que já existe, as outras três não se sustentam.

## 3. Ponto de partida (o que já existe no repositório)
- **DentalPos** — gestão odontológica (clínicas, laboratórios, acadêmicos). Planos Basic R$ 197, Intermedium R$ 397, Plenum R$ 597/mês.
- **REVAH** — marketing e vendas (produto independente da WMundi Technology & Co, revah.com.br).
- **SpaceHour** (`espacos/`) — gestão de espaços.
- **ClubeFaz** (repositório `wmundiapps/ifaco`) e **AlignSystem** — citados nas cláusulas-padrão.
- Cláusulas-padrão para todos os sistemas: `docs/legal/CLAUSULAS-PADRAO-WMUNDI.md`.
- Infra: Supabase + Vercel + Netlify, e-mails/WhatsApp/cobrança via provedores.
- Registros: Brasil e Europa vigentes; EUA possível.

## 4. Estrutura da empresa: holding + unidades de negócio

```
WMUNDI (marca-mãe / holding de propriedade intelectual)
├── Wmundi Brasil (operação nacional, vigente)
├── Wmundi Europe (operação europeia, vigente)
└── Wmundi USA (a abrir)
```
Recomendação **(a validar com contador e Dra. Roberta)**:
- Propriedade intelectual (código, marcas, modelos de agentes) concentrada em **uma** entidade, licenciada às demais — facilita investimento, venda de unidade e escala internacional.
- Cada país contrata só o que a lei local exige (dados, impostos, consumidor). LGPD (BR), GDPR (UE) e leis estaduais/federais (EUA) pedem versões regionais das cláusulas-padrão.
- Conta de desenvolvedor Apple e Google Play: **em nome da pessoa jurídica** (exige D-U-N-S para Apple). Fazer já, pois leva semanas.

### 4.1 As 7 áreas de atuação (os 7 "reinos" do site)
1. **Desenvolvimento de apps** — estúdio Wmundi (apps próprios + sob encomenda).
2. **Marketing digital para empresas** — REVAH + serviços geridos por robôs.
3. **Educação** — My Students, acadêmicos, cursos, certificação.
4. **Saúde** — DentalPos e extensões (laboratório, ortodontia, clínica geral, medicina).
5. **Serviços** — gestão de espaços, financeiro, jurídico-operacional, RH, atendimento terceirizado por IA.
6. **Automação** — fluxos, integrações, agentes sob medida.
7. **IA Wmundi** — plataforma transversal de agentes (a "fábrica de robôs"); alimenta as outras seis.

## 5. Modelo operacional: poucas pessoas, muitos robôs

Princípio: **toda tarefa repetível vira um agente; toda pessoa supervisiona agentes**.
- 1 setor = 1 **agente-gerente** + vários **agentes-operários**. Detalhes em `AGENTES-ROBOS-POR-SETOR.md`.
- Humanos ficam em quatro papéis: **decidir, relacionar, criar, auditar**.
- Regra de ouro de segurança (herdada do DentalPos): robô **propõe**, humano **aprova** tudo que mexe em **banco, cobrança, segredo, acesso/segurança, texto legal**. O resto o robô executa e registra.
- Todo robô: tem dono humano, tem painel de resultados, tem registro de ações (auditoria) e tem botão de desligar.
- "Milhares de robôs" é meta de **instâncias** (um robô de atendimento por cliente, um por clínica etc.), não de 1.000 programas diferentes. Cerca de 60–80 **tipos** de agente cobrem a empresa inteira.

### Equipe-alvo (humanos)
| Fase | Pessoas | Quem |
|---|---|---|
| Hoje | 1–3 | Robson (visão/decisão), apoio jurídico (Dra. Roberta) |
| Mês 6 | 5–7 | + Engenharia/IA (1–2), Customer Success (1), Comercial (1) |
| Mês 12 | 10–15 | + Design de produto, Parcerias, Financeiro/Contábil, segundo dev mobile |
| Mês 36 | 40–60 | Líderes de setor + liderança regional (EUA, Europa) |

## 6. Receita: como a Wmundi ganha dinheiro
1. **Assinaturas SaaS** (DentalPos e novos sistemas) — base recorrente.
2. **Agentes de IA por assinatura** — "contrate um funcionário-robô": atendimento, vendas, cobrança de atraso, agenda. Preço por agente/mês + volume.
3. **Apps sob encomenda** (projeto + manutenção mensal).
4. **Marketing gerenciado por robôs** (pacotes mensais, via REVAH).
5. **Educação** (My Students, cursos, certificados, acadêmicos pós-formatura).
6. **Marketplace e parceiros** — revendas, integradores, comissão sobre vendas de terceiros (caminho TOTVS).
7. **API e white-label** — outras empresas usam a plataforma de agentes com a própria marca.
8. **Apps na loja** — assinaturas in-app, anúncios, venda.

Preços de referência já decididos no DentalPos estão em `CLAUDE.md`. Preços novos: **a definir** após piloto (não inventar tabela agora).

## 7. Roadmap

### Fase 0 — Fundação (dias 0–30)
- [ ] Formalizar a estrutura Brasil/Europa e decidir o caminho EUA (contador + jurídico).
- [ ] Abrir contas **Apple Developer** e **Google Play Console** da empresa.
- [ ] Publicar o **novo site** (`docs/wmundi/site/`) com as 7 áreas e captura de contatos.
- [ ] Padronizar marca Wmundi (nome, logo, tom de voz, e-mails: contato@, suporte@, comercial@).
- [ ] Aplicar cláusulas-padrão em todos os sistemas (texto legal só com aprovação do Robson e revisão da Dra. Roberta).
- [ ] Painel único de métricas (MRR, clientes, chamados, tarefas feitas por robô).

### Fase 1 — Tração (dias 31–120)
- [ ] **Agente de atendimento** (e-mail + WhatsApp) no DentalPos: primeiro "funcionário-robô" vendido.
- [ ] **Agente de cobrança de atraso** e **agente de agenda** (confirmação, remarcação, lista de espera).
- [ ] Primeiro **app mobile** (DentalPos Paciente ou Agenda) em TestFlight e teste fechado no Google Play.
- [ ] Programa de **parceiros** (indique e ganhe; revendas de dentistas e laboratórios).
- [ ] Conteúdo semanal gerado e agendado por robôs (blog, vídeos curtos, e-mail) — marca "empolgante".
- Meta: primeiros clientes pagantes de agentes de IA; app em loja.

### Fase 2 — Plataforma (meses 5–12)
- [ ] **Plataforma Wmundi IA**: criar/contratar agentes por painel (modelo Octadesk/Tolzz), com biblioteca de agentes por setor.
- [ ] Segundo e terceiro vertical de **Saúde/Serviços** reaproveitando o núcleo (agenda, financeiro, RH, prontuário/cadastro).
- [ ] Estúdio de apps com **esteira padrão** (template, CI, publicação nas lojas, política de privacidade, análise de risco).
- [ ] Lançar **Wmundi Academy** (educação + certificação + comunidade).
- [ ] Idiomas: PT/EN/ES e primeiras versões jurídicas EUA/UE.

### Fase 3 — Escala (meses 13–36)
- [ ] Marketplace de agentes e apps (parceiros publicam, Wmundi cobra comissão).
- [ ] Operação regional nos EUA e Europa, com preço local.
- [ ] Revendas por estado e países vizinhos (América Latina).
- [ ] Avaliar captação de investimento ou aquisições de produtos pequenos.

## 8. Indicadores (painel semanal, preenchido por robô)
Receita recorrente mensal · clientes ativos por produto · churn · CAC e payback · NPS · tempo médio de resposta · % de chamados resolvidos por robô · custo de IA por cliente · apps publicados e nota média · conteúdos publicados · parceiros ativos.

## 9. Riscos e como tratar
| Risco | Tratamento |
|---|---|
| Dispersão (7 áreas ao mesmo tempo) | Ordem de prioridade da seção 2; cada área só avança com o gatilho da anterior |
| Robô errar com dado sensível (saúde) | Humano aprova ação de risco; log de auditoria; LGPD/GDPR por design; dados de saúde segregados |
| Custo de IA corroer margem | Medir custo por cliente; cache; modelos menores para tarefas simples; preço por uso |
| Dependência de poucos fornecedores | Provedores plugáveis (já é regra no DentalPos); plano B documentado |
| Regras de loja (Apple/Google) | Esteira padrão e revisão de conformidade antes de cada envio |
| Regulação de saúde/dados em cada país | Jurídico regional antes de abrir cada mercado |
| Concentração no fundador | Documentar processos como agentes e rotinas; segundo sócio/diretor técnico no mês 12 |

## 10. Decisões que preciso do Robson
1. Confirma a **ordem de prioridade** (IA nos produtos → apps → marketing → escala)?
2. **Nome da holding** e onde fica a propriedade intelectual?
3. EUA: abrir agora ou depois do primeiro cliente americano?
4. Preço do primeiro **agente de IA** (sugestão: testar R$ 97 a R$ 297/mês com 10 clientes-piloto) **(a confirmar)**.
5. Primeiro app: **DentalPos Paciente** ou **Agenda**?
