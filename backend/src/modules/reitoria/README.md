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

---

# Reitoria — parte 2 (agenda, DOU, convênios, painéis, comparativo)

Modelos novos com prefixo `Rei` em `prisma/edu/reitoria2.prisma` (SQL aditivo no bloco `REI:BEGIN/REI:END` de `prisma/manual-migrations/20261004_edumaster_pro.sql`).
Código: `agenda*.ts`, `dou*.ts`, `convenios.ts`, `investimentos.ts`, `pessoas.ts`, `comparativo.ts`, `csvIes.ts`, `paineis.ts`, `niveis.ts`, `routes2.ts` (registro). Selftest puro: `npx tsx src/modules/reitoria/__selftest2__.ts`.
Seed: `scripts/seeds/reitoria.ts` (`seedReitoria(api, ctx)`, idempotente, só API). E2E: `scripts/e2e/reitoria2.ts` (banco local próprio, sem rede).

**Acesso**: ADMIN/OWNER/RECTOR/BOARD em tudo. COORDINATOR lê painéis, comparativo, convênios e DOU. FACILITIES/SUPPLIES lançam investimentos. Qualquer usuário autenticado convidado responde ao próprio convite.

## 1. Agenda executiva (`/agenda`, `/compromissos`)
- `GET /agenda?visao=dia|semana|mes&data=AAAA-MM-DD[&origem=&tipo=&formato=csv]` consolida (cada fonte em try/catch; falha vira `fontesIndisponiveis`, módulo opcional ausente vira `modulosOpcionaisAusentes`):
  compromissos próprios (com recorrência SEMANAL/MENSAL/ANUAL), calendário acadêmico (`CalEvento`, prazos de notas), regulatório (`RegAto.vencimento`, diligências, prazos de processos), DOU (prazos de ação), convênios (fim da vigência), colegiados e CIPA,
  **Jurídico** (`JurPrazo`, `JurAudiencia`, `JurContrato` — via `prisma.jur*` se existir) e **RH** (aniversariantes de `RheColaborador`, só nome e dia/mês).
  Outros módulos podem plugar fontes sem editar a agenda: `registrarFonteAgenda(nome, async ({tenantId,userId,de,ate}) => ItemAgenda[])`.
- `GET /agenda/proximos`, `/agenda/ics` (iCalendar), `/agenda/aniversariantes?mes=`, `POST /agenda/efemerides/bootstrap` (10 datas acadêmicas), `GET /agenda/meus-convites` (qualquer usuário).
- Compromissos: `GET|POST /compromissos`, `GET|PATCH|DELETE /compromissos/:id`, `POST /:id/{confirmar,concluir,cancelar,adiar}`; aviso de conflito de horário na resposta (`conflitos`, não bloqueia). `privado` só para organizador e convidados.
- Convites: `POST /:id/convites`, `DELETE /:id/convites/:cid`, `POST /:id/responder` (o próprio convidado; recusar exige justificativa), `POST /:id/presenca`.
- Pauta e ata: `PUT /:id/pauta`, `POST /:id/ata` (decisões com prazo viram lembretes), `POST /:id/ata/aprovar` (depois disso a ata é imutável), `GET /:id/documento` (HTML imprimível, escapado).
- Lembretes: `lembretesMin` (ex.: `[60,1440]`) gera `EduReminder` (Minha mesa). Job `reitoria:agenda-lembretes` reagenda os próximos/recorrentes.

## 2. Monitor do Diário Oficial da União (`/dou`)
- **Palavras-chave** da instituição (`/dou/palavras`: INSTITUICAO, CNPJ, EMEC, CURSO, ORGAO, OUTRO, com peso 1–10; `POST /dou/palavras/sugerir` monta a partir da Identidade e dos cursos). CNPJ casa só por dígitos; e-MEC só como número inteiro; texto sem acento/caixa.
- **Provedores** (`douLogic.ts`, interface `DouProvider`): `INLABS_XML` (artigos `<article>` do INLABS), `RSS` (RSS 2.0/Atom) e `MANUAL` (colagem de texto; blocos separados por `---`).
  `POST /dou/importar {formato: XML|RSS|TEXTO, conteudo | url, fonteId?, dryRun?, guardarTudo?}`; `POST /dou/coletar {fonteId}` e o job `reitoria:dou-coleta` (fontes ativas com URL).
  Por URL: somente `https`, host público (bloqueia localhost/IP/host interno — SSRF), timeout de 20 s, máx. 15 MB; falha da fonte = **424** (não 5xx) e o status fica na fonte. Nos testes o `fetch` é trocado por `definirFetcherDou()`.
- **Classificação**: órgão (MEC/INEP/CNE/SERES/CAPES), tipo do ato, tema (autorização, reconhecimento, renovação, credenciamento, ENADE/CPC, FIES/ProUni, EAD, supervisão, penalidade, regulamentação), relevância (ALTA/MEDIA/BAIXA/NENHUMA), score e palavras encontradas. Publicações sem relevância não são gravadas (contadas em `descartadas`). Deduplicação por id externo ou hash.
- **Prazo de ação**: extraído do texto ("prazo de 30 (trinta) dias") ou padrão por tema; gera lembrete (ALTA = CRITICO). **Tratamento**: status NOVA → EM_ANALISE → EM_TRATAMENTO → CONCLUIDA/DESCARTADA, responsável, observações (obrigatórias para concluir ALTA).
- **Vínculo com RegAto**: automático quando já existe ato com mesmo tipo+número (e preenche `RegAto.referenciaDou`); `POST /dou/publicacoes/:id/{vincular-ato,criar-ato}`.
- `GET /dou/publicacoes` (filtros status/relevancia/tema/orgao/tipoAto/de/ate/q/semResponsavel/atrasadas, `formato=csv`), `GET /dou/painel`, `GET /dou/coletas`, `POST /dou/reclassificar`.

## 3. Painéis executivos (`GET /paineis`, `GET /paineis/:id[?meses=&formato=csv]`)
`financeiro` (receita, inadimplência, DRE gerencial por caixa, fluxo realizado e projetado), `infraestrutura`, `implantacao` (funil de processos de curso), `investimentos` (por disciplina), `cipa`, `convenios`, `pessoas`, `professores`, `provas`, `vestibular`, `publicacoes`, `niveis`, `graduacao`, `pos-lato`, `pos-stricto`.
Formato único `{kpis, series, tabelas, avisos}`; o CSV traz os KPIs e todas as tabelas.
- **Investimentos por disciplina** (`/investimentos`): melhoria/equipamento/reforma/software com rateio percentual entre disciplinas (sem percentual = divisão igual; soma ≤ 100%); `GET /investimentos/por-disciplina` (inclui R$/aluno); `POST /investimentos/importar-infra` traz `InfProjeto` e `InfBem` (idempotente).
- **Pessoas** (`/pessoas/avaliacoes`, `PUT /pessoas/resumos`, `POST /pessoas/sincronizar-rh`): apenas resumos **agregados** por setor/grupo/ciclo (nunca nota individual). Grupos com menos de 3 avaliados são suprimidos. Consome `RheCiclo/RheAvaliacao` (agrupado por departamento) quando o RH existe.

## 4. Acordos e convênios (`/convenios`)
Cadastro executivo (tipo, parte/CNPJ, objeto, vigência, indeterminada, renovação automática, valor, responsável, `juridicoRef`). Situação calculada: VIGENTE, VENCENDO (faixas por `avisoDias`, padrão 90/60/30), VENCIDO, SEM_PRAZO, INATIVO. Aditivos/renovações em `POST /:id/eventos` (renovação exige nova data maior), `POST /:id/encerrar`, painel e alertas (`EduReminder`, job `reitoria:convenios-alertas`).
Integrações: `POST /convenios/importar-juridico` (JurContrato de convênio/cooperação/parceria) e `/importar-estagio` (ApoEmpresa com convênio) — idempotentes; sem o módulo, respondem `disponivel:false`.

## 5. Comparativo com outras IES (`/comparativo`)
IES concorrentes/referência (CNPJ validado, código e-MEC, UF) + a própria (`POST /comparativo/ies/propria`). Indicadores: CPC, CC, IGC, ENADE, IDD (0–5), MENSALIDADE, NUM_CURSOS, NUM_ALUNOS, NUM_DOCENTES, PCT_DOUTORES, INGRESSANTES, CONCLUINTES, por ano e opcionalmente por curso.
`POST /comparativo/importar-csv {conteudo, dryRun?, criarIes?, anoPadrao?}` aceita os microdados públicos do INEP (delimitador `;`, `,` ou tab; vírgula decimal; formato largo `CO_IES;NO_IES;NU_ANO_CENSO;CPC_CONTINUO;IGC_CONTINUO;QT_CURSO;QT_MAT…` ou longo `codigo_ies,ano,indicador,valor,curso`); reimportar atualiza sem duplicar; linhas inválidas voltam explicadas.
`GET /comparativo/painel[?ano=&curso=&iesIds=&formato=csv]` (ranking, posição da própria IES, diferença para a média dos concorrentes e para o melhor; a própria IES é completada com cursos, alunos e mensalidade internos quando faltam) e `GET /comparativo/evolucao?indicador=`.

## Limites conhecidos
- O INLABS entrega ZIP: a coleta automática lê o **XML já descompactado** (por URL ou colagem); não há login/download do ZIP.
- A classificação é por palavras-chave e regras (não é interpretação jurídica): revisão humana obrigatória no tratamento.
- O DRE é gerencial (regime de caixa sobre contas a pagar/receber), não contábil.
- Microdados do INEP: o parser reconhece os nomes de colunas mais comuns; arquivos com layout diferente voltam 422 com os cabeçalhos lidos.
