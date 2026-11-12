# Infraestrutura · Planejamento (prefixo `Ipl`) — `/api/edu/infraestrutura/planejamento`

Planos de obras e aquisições: **reformas, expansão, reposição de materiais, pinturas, plotagem/sinalização e equipamentos/materiais ligados aos cursos** (RX para Medicina Veterinária, divãs para a clínica de Psicologia, computadores para Engenharia da Computação, microscópios para Biomedicina, simuladores para Enfermagem/Medicina...). Camada de planejamento sobre o que já existia (patrimônio, manutenção/OS, melhorias 5W2H, adequação por curso, suprimentos).

## Diagnóstico (o que já existia e foi reaproveitado)
- Patrimônio (`InfBem`), manutenção/OS (`InfOrdemServico`), chamados, frota, termos de responsabilidade, projetos 5W2H (`InfProjeto`, sem cotação/alçada/conversão), checklist de exigências por curso (`InfRequisitoCurso` + `calcularAdequacao`), compras em Suprimentos (`SupRequisicao` → alçadas → cotação com mínimo de 3 → pedido).
- **Lacunas implementadas aqui**: plano com justificativa/indicador MEC/PDI, prioridade, orçamento, cotações com mínimo configurável acima de um limite, cronograma com marcos, fluxo de aprovação por alçada própria, conversão em requisição/OS/projeto, visões (kanban, Gantt, orçamento planejado x executado, necessidades por curso), alertas e sugestões automáticas revisáveis.

## Modelos (`prisma/edu/infra-planejamento.prisma`, todos novos)
`IplPolitica` (limite de cotação, mínimo, alçadas JSON, limiares de alerta, teto anual), `IplPlano`, `IplCotacao`, `IplMarco`, `IplAprovacao`, `IplSugestao`, `IplContador`. Tipo/status/prioridade são `String` validados com zod. Migration: bloco `IPL:BEGIN/END` em `prisma/manual-migrations/20261004_edumaster_pro.sql` (só `CREATE ... IF NOT EXISTS`).

## Papéis
Leitura: FACILITIES, COORDINATOR, FINANCE, SUPPLIES, SECRETARY (+ADMIN/OWNER/RECTOR/BOARD). Criar/editar/cotar/enviar: FACILITIES, COORDINATOR, SUPPLIES. Política: FACILITIES. Converter: FACILITIES, SUPPLIES. Decidir: o papel da etapa (COORDINATOR, BOARD = diretoria, RECTOR = reitoria...) ou ADMIN/OWNER/RECTOR/BOARD; o solicitante nunca aprova o próprio plano. Tudo filtrado por `tenantId`.

## Endpoints
- `GET /catalogo` · `GET|PUT /politica` (alçadas validadas: níveis 1..n, valores crescentes, nível 1 em R$ 0)
- `POST /planos` · `GET /planos?status&tipo&prioridade&programId&spaceId&ano&q&comAlerta` · `GET /planos/:id` · `PATCH /planos/:id` (rascunho/reprovado edita tudo; depois só cronograma/responsável/prioridade; aprovado congela escopo e orçamento)
- Cotações: `POST /planos/:id/cotacoes` (fornecedores distintos), `DELETE /planos/:id/cotacoes/:cid`, `POST /planos/:id/cotacoes/:cid/escolher` (se não for a de menor preço exige justificativa)
- Marcos: `POST /planos/:id/marcos`, `PATCH|DELETE /marcos/:mid`, `POST /marcos/:mid/concluir`
- Aprovação: `POST /planos/:id/enviar` (monta a cadeia pela alçada do valor), `POST /planos/:id/decidir {decisao, parecer}`, `POST /planos/:id/reabrir`
- Conversão: `POST /planos/:id/converter {destino?, centroCustoId?, justificativaExcecao?}`
  - REFORMA/PINTURA → `InfOrdemServico` (tipo MELHORIA); EXPANSAO → `InfProjeto` (marcos viram etapas); EQUIPAMENTO/MATERIAL/REPOSICAO/PLOTAGEM → `SupRequisicao` **já APROVADA** com a cadeia espelhada em `SupAprovacao` (segue para cotação formal/pedido em Suprimentos). Gasto apropriado ao curso/laboratório ou ao centro de custo informado.
  - Bloqueios: acima do limite faltam cotações (409) · sem cotação vencedora (409) · cotação escolhida >10% acima do orçamento aprovado (409, reenviar) · exceção só por ADMIN/OWNER/RECTOR/BOARD com justificativa ≥15 caracteres (auditada).
- Execução: `POST /planos/:id/execucao {valor}` (lançamento manual) · `POST /planos/:id/status {EM_EXECUCAO|CONCLUIDO|CANCELADO, motivo}`. **Executado = maior entre o lançamento manual e o apurado nos registros vinculados** (pedidos emitidos/recebidos da requisição, custo da OS, gasto do projeto).
- Visões: `GET /kanban`, `/cronograma` (barras e marcos em %, linha de hoje), `/orcamento?ano` (por ano com teto, por curso, por tipo; planejado x aprovado x executado), `/necessidades?programId&vagas` (checklist MEC por curso: exigido/existente/falta/planos que cobrem/"sem plano"), `/alertas`, `/painel`, `/relatorio?ano&format=html`.
- Sugestões: `POST /sugestoes/gerar {programId?}`, `GET /sugestoes`, `POST /sugestoes/:id/aceitar` (vira plano em rascunho, editável), `POST /sugestoes/:id/rejeitar {motivo}`.

## Alertas e job
Prazo final vencido/próximo, início atrasado sem conversão, marco atrasado/próximo, orçamento estourado ou ≥ limiar. Job `infra.planejamento-prazos` (via `/api/cron/edu`) agenda lembretes (`scheduleReminder`) de prazo e marcos; idempotente por `dedupeKey`.

## Sugestão automática (explicável e sempre revisável)
1. **Checklist**: cada lacuna de `calcularAdequacao` sem plano em andamento vira sugestão (prioridade CRITICA se obrigatória e sem cobertura; estimativa = valor médio dos bens da categoria x lacuna).
2. **Manutenção**: bem com ≥2 OS corretivas em 12 meses (ou estado RUIM/INSERVIVEL) → reposição; espaço com ≥3 ocorrências → reforma (estimativa = 2x o custo corretivo, a refinar).
Cada sugestão traz as evidências (`explicacao`). `services-ai/client.ts` só é usado, se configurado, para **redigir a justificativa** a partir das mesmas evidências; sem chave o texto vem das regras (`motor: REGRAS`). Sugestão rejeitada não volta; sugestão cuja lacuna foi coberta é encerrada.

## Limites conhecidos
Sem upload de PDF/anexo da proposta de cotação; cotações são lançadas à mão (podem apontar `fornecedorId` do cadastro). Gantt é simples (sem dependências entre planos). A estimativa de lacunas sem bem similar cadastrado fica R$ 0 e é sinalizada. Não há aprovação delegada/ausência de aprovador. O executado vinculado só enxerga pedidos com `requisicaoId` do plano.

## Seed e testes
`scripts/seeds/infra-planejamento.ts` → `seedInfraPlanejamento(api, ctx)` (≈25 planos em todos os status/tipos, cursos Veterinária, Psicologia, Eng. da Computação, Biomedicina, Enfermagem, Medicina; checklist, patrimônio, OS reincidentes e sugestões). `ctx` aceita `apiAs(role)` ou `mk` + `loginAs` para criar coordenação/diretoria/reitoria que aprovam. Não editamos `edu-demo-seed.ts`; para integrar: `await seedInfraPlanejamento(c.api, c)` após o seed de infraestrutura.
E2E: `DATABASE_URL=postgresql://USUARIO:SENHA@127.0.0.1:5432/BANCO_LOCAL npx tsx scripts/e2e/infra-planejamento.ts` (233 verificações; banco Postgres local com `prisma db push`).
Telas: `frontend/src/edu/infraestrutura/PlanejamentoTab.tsx` (menu "Infraestrutura · Planejamento" → `/edu/infraestrutura?secao=planejamento`).
