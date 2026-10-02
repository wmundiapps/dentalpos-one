# Módulo reitoria (prefixo Rei) — `/api/edu/reitoria`

Visão executiva consolidada, central de pendências ("Minha mesa"), metas/OKRs, relatório executivo e assistente por IA.
Lê (read-only, com try/catch + timeout de 12 s por indicador) os demais módulos; falha/ausência de dados vira `erro`/`valor:null` no indicador, nunca derruba o painel.
Cache em memória de 60 s por tenant/escopo/indicador. Selftest: `npx tsx src/modules/reitoria/__selftest__.ts`.

## Modelos
ReiObjetivo, ReiResultadoChave, ReiCheckin (OKRs) · ReiSnapshot (valor diário por indicador → variação) · ReiRelatorio (relatórios salvos) · ReiConsultaIA (log do assistente).

## Endpoints (ADMIN/OWNER/RECTOR/BOARD sempre; "painel" = COORDINATOR, SECRETARY, FINANCE, TEACHER, LIBRARIAN, FACILITIES, SUPPLIES, MARKETING, ADMISSIONS)
- Painel: `GET /painel[?perfil=&programId=]` (perfil padrão pelo papel), `GET /painel/perfis`, `GET /painel/:perfil` (reitoria, administracao, coordenacao, secretaria, professor, biblioteca, infraestrutura, admissoes; cada papel só vê o seu), `POST /painel/atualizar` e `POST /painel/snapshot` (super).
  Indicador: `valor, anterior, variacaoPct, tendencia, favoravel, semaforo, meta, rota, detalhe, erro`. `programId` = filtro por curso; perfil professor = só suas turmas.
- Catálogo/histórico: `GET /indicadores/catalogo` (painel), `GET /indicadores/:chave/historico?dias=` (super).
- Minha mesa (qualquer autenticado): `GET /mesa[?tipo=&modulo=&severidade=&atrasados=true&horizonteDias=]`, `GET /mesa/resumo` (sino), `POST /mesa/lembretes/:id/concluir|adiar`, `POST /mesa/notificacoes/:id/lida`, `POST /mesa/notificacoes/lidas`; `GET /mesa/panorama` (COORDINATOR: vencidos por módulo/responsável).
  Fontes: EduReminder, aprovações (SupAprovacao, SecProtocolo, NtRevisao, GovCarreiraProgressao, CalReserva), tarefas (InfOrdemServico/InfChamado, AdmCandidato follow-up, NtDiario), JorEtapa, EduNotification.
- OKRs (leitura: papéis de gestão/staff; escrita: super; check-in: responsável/COORDINATOR/super): `GET /objetivos`, `POST /objetivos`, `GET|PATCH|DELETE /objetivos/:id`, `POST /objetivos/:id/ativar|concluir|cancelar|reabrir`, `POST /objetivos/:id/resultados-chave`, `PATCH|DELETE /resultados-chave/:id`, `POST|GET /resultados-chave/:id/checkins`, `GET /okr/painel`, `GET /okr/ciclos`, `POST /okr/sincronizar`.
- Relatório: `GET /relatorio/executivo?formato=html|json|csv&perfil=&programId=&ia=true`; `POST /relatorios` (salva), `GET /relatorios`, `GET /relatorios/:id`, `GET /relatorios/:id/html` (super).
- Assistente: `POST /assistente/perguntar {pergunta, perfil?, programId?}` (12/min/usuário), `GET /assistente/briefing`, `GET /assistente/historico` (super). Sem IA → resumo heurístico (`modo: HEURISTICO`).
- `POST /bootstrap` (super, idempotente): 5 objetivos-modelo em RASCUNHO (retenção, saúde financeira, qualidade regulatória, experiência, eficiência) com KRs ligados a indicadores.

## Jobs
`reitoria:snapshot-indicadores` (foto diária) · `reitoria:okr-manutencao` (sincroniza KRs de indicador, recalcula confiança, escala check-ins atrasados à reitoria).

## Lembretes
Check-in de cada KR manual (dedupeKey por data), fim de ciclo do objetivo (D-7), KR em risco (check-in vermelho).

## Exportado (`routes.ts`)
`calcularIndicadores`, `calcularTodos`, `coletarMesa`, `resumoSino`, `montarPainel`, `montarRelatorio`, `renderRelatorioHtml`, `okrManutencao`.

## Indicadores (43)
matriculas_ativas, novas_matriculas_30d, matriculas_trancadas, evasao, alunos_por_curso, alunos_por_modalidade, funil_admissoes, leads_30d, matriculas_admissao_pendentes, inadimplencia, receita_mes, despesa_mes, fluxo_caixa_mes, contas_pagar_vencidas, ocupacao_espacos, conflitos_calendario, reservas_pendentes, prof_aulas_semana, diarios_atrasados, revisoes_nota_abertas, reprovacao, prof_alunos_em_risco, requerimentos_abertos, requerimentos_sla_vencido, requerimentos_sla_cumprido, prazos_regulatorios, prontidao_regulatoria, pdi_execucao, risco_evasao, nps, ouvidoria, alertas_inatividade_ead, producao_cientifica, manutencao_os_atrasadas, chamados_infra, estoque_critico, requisicoes_aguardando, acervo, emprestimos_atrasados, emprestimos_30d, desempenho_exames, jornadas_atrasadas, lembretes_criticos.
