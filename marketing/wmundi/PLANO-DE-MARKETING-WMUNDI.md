# Plano de marketing WMundi: vender sem equipe

Data: 06/11/2026 · Dono: Robson · Suporte humano: **1 pessoa**. Princípio: tudo que se repete é automatizado; a pessoa cuida do que exige relacionamento.
Tom da marca: sofisticado, polido, prosperidade e exclusividade, **sem promessa de resultado**, sem preços e sem percentuais de parceiros em material público.

## 1. O que vendemos, em ordem de ataque
| Ordem | Oferta | Por quê | Como vende |
|---|---|---|---|
| 1 | **Sites e soluções personalizadas** | Demanda constante, entrega controlada, proposta rápida | Google Ads + Google Meu Negócio + landing `/proposta/` |
| 2 | **Automação de redes sociais** (Instagram, Facebook, Google, TikTok, LinkedIn, X): agendamento, conteúdo por IA com aprovação, respostas supervisionadas e relatórios. **A WMundi não administra as contas dos clientes** | Escalável e sem equipe: o cliente opera, a automação trabalha | Conteúdo orgânico + LinkedIn + indicação |
| 3 | **Agentes de IA** (5 prontos + sob medida) | Diferencial e margem; roda nos nossos aplicativos | Vitrine `/agentes/` + ícone "Peça o seu agente" |
| 4 | **Aplicativos** (iPhone, iPad e Android) | Ticket maior, ciclo mais longo | Proposta consultiva; cards de apps |
| 5 | **Portfólio de 30 soluções** (Completodonto, REVAH, SpaceHour, etc.) | Venda direta por produto quando houver preço e link de pagamento | `/produtos/` com `precos.json` |
| 6 | **Parceiros** | Alcance nacional sem contratar | Aba discreta no rodapé; condições só na proposta |

## 2. Público
Clínicas e consultórios (odontologia primeiro), pequenas e médias empresas locais (comércio e serviços), escolas e instituições de ensino, empresas que querem um aplicativo, profissionais liberais. Região inicial: Paraná, depois SP e SC e o Brasil.

## 3. Funil 100% automatizado
```
Atração  →  Captura  →  Resposta  →  Proposta  →  Pagamento  →  Onboarding  →  Retenção
```
1. **Atração:** orgânico nas 5 redes (cards em `cards/`), Google Ads (Pesquisa), Google Meu Negócio, parceiros.
2. **Captura:** landing `/proposta/` (formulário + origem do anúncio), ícone "Peça o seu agente", WhatsApp, vitrine de produtos.
3. **Resposta:** aviso imediato no info@wmundi.com; agente atendente responde dúvidas 24 horas (fase 1 do cronograma de agentes); e-mail de confirmação.
4. **Proposta:** modelo padrão por oferta, com link de pagamento (Asaas) quando o preço estiver definido.
5. **Pagamento (checkout):** link de pagamento Asaas com Pix, boleto e cartão; assinaturas recorrentes quando for mensalidade.
6. **Onboarding (check-in):** página de obrigado, e-mail e WhatsApp de boas-vindas, formulário de dados do projeto, liberação do produto.
7. **Retenção:** resumo e relatório mensal automáticos, cobrança de atraso pelo agente, pedido de avaliação no Google.
Detalhes técnicos e do suporte: `AUTOMACAO-VENDAS-E-SUPORTE.md`.

## 4. Canais: papel de cada um
| Canal | Papel | Formato | Frequência sugerida | Automação |
|---|---|---|---|---|
| **Instagram** | Vitrine da marca | Feed 4:5, Stories, Reels | 4 posts + 3 stories por semana | Meta Business Suite (agendar tudo) |
| **Facebook** | Alcance e anúncios | Post e anúncio | 3 por semana (mesmos cards) | Meta Business Suite |
| **TikTok** | Descoberta | Vídeo curto vertical | 3 por semana | TikTok Studio (agendar) |
| **LinkedIn** | Autoridade e vendas B2B | Texto + card | 3 por semana | Agendamento nativo |
| **X** | Presença e velocidade | Texto curto + card | 1 por dia útil | Agendamento nativo |
| **Google Ads** | Demanda ativa | Pesquisa; depois Performance Max | Contínuo | Lance automático por conversão |
| **Google Meu Negócio** | Busca local e confiança | Postagem semanal + avaliações | 1 por semana | Agente de pós-atendimento pede avaliação |
| **Site e landing** | Conversão | `/proposta/` com tema por anúncio (`?t=sites`, `redes`, `agentes`, `apps`) | Contínuo | Formulário, origem do lead e obrigado |

## 5. Orçamento (a definir pelo Robson)
Sem valores inventados. Regra: começar com **limite diário baixo** no Google Ads (uma campanha por serviço, 14 dias de teste), anúncios em Meta com orçamento pequeno nos 2 cards de melhor desempenho, e só aumentar quando houver conversão. Parar qualquer anúncio sem conversão após o período de teste.

## 6. Medição (toda semana, segunda-feira, 30 minutos)
Cinco números: **visitas**, **pedidos de proposta** (por origem), **propostas enviadas**, **fechamentos** e **receita recorrente**. Origem de cada pedido vem automática dos parâmetros UTM (`utm_source`, `utm_medium`, `utm_campaign`) e do clique do anúncio (`gclid`, `fbclid`, `ttclid`). **Metas só após 2 semanas de linha de base**, para não chutar números.
Padrão de UTM: `?utm_source=google&utm_medium=cpc&utm_campaign=sites` (rede: `instagram`, `facebook`, `tiktok`, `linkedin`, `x`, `gmn`; mídia: `organico` ou `cpc`; campanha: `sites`, `redes`, `agentes`, `apps`).
Medição de acesso (GA4 e conversão do Google Ads) está **pronta e desligada**: falta o Robson criar as contas e informar os IDs em `assets/rastreio.js`; ela só carrega depois que o visitante aceita os cookies.

## 7. Conformidade (não negociável)
- **LGPD:** consentimento nos formulários e nos cookies; só mensagem a quem pediu contato ou tem base legal; opção de sair; sem dados de pacientes.
- **Saúde:** sem diagnóstico, sem "antes e depois" e sem promessa em anúncios; seguir as regras do conselho profissional.
- **Marca:** usar ® em WMundi e AlignSystem conforme o Robson afirmou; confirmar os registros com a Dra. Roberta.
- **App Store e Google Play:** dizer "conta ativa", não "homologado" nem "parceiro Apple/Google"; sem logos das lojas até haver app publicado.
- **Anúncios:** sem superlativos ("o melhor"), sem garantias, sem preços não confirmados. Seguir as políticas da Google, da Meta, do TikTok, do LinkedIn e do X.
- **Parceiros:** nenhuma menção a percentuais, comissões ou taxas em material público.

## 8. Checklist de lançamento (cada item é um passo curto)
- [ ] Publicar o site no wmundi.com (snippet no WordPress).
- [ ] Criar/verificar perfis: Instagram, Facebook (página), TikTok, LinkedIn (página da empresa), X, Google Meu Negócio (verificação por carta, telefone ou vídeo). Conferir disponibilidade do nome de usuário "wmundi".
- [ ] Criar conta Google Ads e GA4; informar os IDs.
- [ ] Postar o primeiro lote (calendário de 30 dias).
- [ ] Ligar os links de pagamento (Asaas) aos produtos que já têm preço.
- [ ] Conferir se os avisos de formulário chegam ao info@wmundi.com.
- [ ] Revisão da Dra. Roberta: política de privacidade, termos e texto de cookies.

## 9. Decisões que dependem do Robson
1. Orçamento diário de anúncios.
2. Preços e links de pagamento de cada produto (hoje: "valor sob consulta").
3. Quais redes primeiro (sugestão: Instagram, LinkedIn, Google Meu Negócio e Google Ads).
4. Quem é a pessoa de suporte e qual o horário de atendimento.
5. Política de privacidade e termos públicos (texto legal com revisão).
