# Módulo apoio (prefixo Apo)

Apoio discente (NAE/NAPNE), risco de evasão, apoio docente, ouvidoria, pesquisas/NPS e egressos.
Autenticado: `/api/edu/apoio` · Público: `/api/public/edu/apoio`. Equipe de apoio = papel `SUPPORT`
(+ ADMIN/OWNER/RECTOR/BOARD automáticos). Lógica pura em `logic.ts` (teste: `npx tsx src/modules/apoio/__selftest__.ts`).

## Models (41)
Infra: ApoContador, ApoAndamento · Atendimento: ApoAtendimento · AEE: ApoPlanoAee, ApoAdaptacao · Bolsas: ApoProgramaBolsa,
ApoInscricaoBolsa, ApoConcessaoBolsa · Monitoria: ApoMonitoriaVaga/Candidatura, ApoMonitor, ApoMonitoriaFrequencia ·
ApoTurmaApoio(+Participante), ApoMentoria(+Encontro) · Empregabilidade: ApoEmpresa, ApoVaga, ApoCandidaturaVaga, ApoTermoEstagio,
ApoRelatorioEstagio · ApoOcorrencia · Risco: ApoRiscoSnapshot, ApoPlanoAcao, ApoContatoEvasao · Docente: ApoFormacao(+Inscricao),
ApoMaterial, ApoChamado · Pesquisas: ApoInstrumento, ApoAplicacao, ApoParticipacao, ApoResposta, ApoDevolutiva ·
Ouvidoria: ApoSetorOuvidoria, ApoManifestacao, ApoEncaminhamento · Egressos: ApoEgresso, ApoEgressoTrajetoria, ApoEventoEgresso, ApoEventoParticipante.

## Endpoints (prefixo /api/edu/apoio)
- `POST /bootstrap` (SUPPORT, COORDINATOR) — setores de ouvidoria, programas de bolsa e instrumentos padrão (idempotente).
- Atendimentos: `GET/POST /atendimentos` (SUPPORT, COORDINATOR), `GET /atendimentos/agenda`, `GET /atendimentos/meus` (STUDENT),
  `POST /atendimentos/solicitar` (STUDENT), `GET/PATCH /atendimentos/:id`. Sigilo: NORMAL / RESTRITO (SUPPORT) / SIGILOSO (só quem atendeu).
- AEE: `GET/POST /aee/planos`, `GET/PATCH /aee/planos/:id`, `POST .../adaptacoes|ativar|renovar|encerrar` (SUPPORT),
  `DELETE /aee/adaptacoes/:id`, `GET /aee/minhas-adaptacoes` + `POST /aee/adaptacoes/:id/ciencia` (TEACHER),
  `GET /aee/alunos/:studentId/adaptacoes-vigentes`.
- Bolsas: CRUD `/bolsas/programas` (SUPPORT, FINANCE), `GET /bolsas/programas-abertos`, `POST /bolsas/inscricoes` (STUDENT/SUPPORT/FINANCE),
  `GET /bolsas/inscricoes|minhas|concessoes|resumo`, `POST /bolsas/inscricoes/:id/decidir`, `POST /bolsas/programas/:id/classificar`,
  `POST /bolsas/concessoes/:id/renovar|encerrar|reativar`.
- Monitoria: CRUD `/monitoria/vagas`, `POST .../abrir|candidatar|selecionar`, `GET .../candidaturas`, `POST /monitoria/candidaturas/:id/entrevista`,
  `POST /monitoria/monitores/:id/frequencia|concluir`, `POST /monitoria/frequencias/:id/validar`, `GET /monitoria/monitores`.
- Nivelamento/tutoria: CRUD `/turmas-apoio`, `POST .../inscrever|encerrar`, `GET .../participantes`. Mentoria: `GET/POST /mentorias`, `POST /mentorias/:id/encontros|encerrar`.
- Empregabilidade: CRUD `/empregabilidade/empresas|vagas`, `GET /empregabilidade/mural`, `POST .../vagas/:id/candidatar`, `GET .../candidaturas`,
  `PATCH /empregabilidade/candidaturas/:id`; estágio: `GET/POST /estagio/termos`, `POST /estagio/termos/validar`,
  `POST /estagio/termos/:id/enviar-assinatura|assinar|aditivo|rescindir`, `POST /estagio/relatorios/:id/entregar|avaliar`, `GET /estagio/resumo`.
- Ocorrências (COORDINATOR/SUPPORT; TEACHER/SECRETARY registram; STUDENT vê as suas): `POST/GET /ocorrencias`, `GET /ocorrencias/:id`,
  `POST /ocorrencias/:id/notificar|defesa|julgamento|decidir|recurso|concluir|arquivar`.
- Risco de evasão (SUPPORT, COORDINATOR): `GET /risco/alunos/:studentId`, `POST /risco/alunos/:studentId/avaliar`, `GET /risco/lista`,
  `POST /risco/recalcular`, `GET/POST /risco/planos`, `PATCH /risco/planos/:id`, `POST /risco/planos/:id/contatos|encerrar`, `GET /risco/efetividade`.
- Docente: CRUD `/formacoes`, `POST /formacoes/:id/inscrever|cancelar-inscricao|concluir`, `GET /formacoes/:id/inscricoes`, `GET /formacoes-minhas`,
  `GET /formacoes/inscricoes/:id/certificado` (HTML com logomarca); materiais `GET/POST/DELETE /materiais`, `POST /materiais/:id/moderar|acessar|avaliar`;
  helpdesk `GET/POST /chamados`, `GET /chamados/:id`, `POST /chamados/:id/comentar|atribuir|status|avaliar`, `GET /chamados-relatorio`.
- Pesquisas/NPS/avaliação docente: CRUD `/pesquisas/instrumentos`, `POST/GET /pesquisas/aplicacoes`, `POST .../:id/abrir|encerrar|publicar|devolutiva`,
  `GET .../:id/resultados|adesao`, `GET /pesquisas/pendentes` + `POST /pesquisas/aplicacoes/:id/responder` (STUDENT), `GET /pesquisas/minhas-devolutivas` (TEACHER),
  `GET /pesquisas/painel-docente`, `GET /pesquisas/nps`.
- Ouvidoria: CRUD `/ouvidoria/setores`; `POST /ouvidoria/manifestacoes` (qualquer autenticado), `GET /ouvidoria/minhas`, `POST /ouvidoria/manifestacoes/:id/avaliar`;
  gestão (SUPPORT; leitura COORDINATOR): `GET /ouvidoria/manifestacoes[/:id]`, `POST .../:id/triar|encaminhar|responder|prorrogar|arquivar|reabrir|nota-interna`,
  `GET /ouvidoria/encaminhamentos/meus`, `POST /ouvidoria/encaminhamentos/:id/responder` (responsável do setor), `GET /ouvidoria/relatorio`, `GET /ouvidoria/relatorio-anual?ano=` (HTML).
- Egressos (SUPPORT, COORDINATOR, MARKETING): `GET/POST /egressos`, `GET/PATCH /egressos/:id`, `POST /egressos/importar-concluintes`, `GET /egressos/indicadores`,
  `GET /egressos/recall`, `POST /egressos/recall/solicitar-atualizacao`, `POST /egressos/:id/trajetoria|anonimizar`, `GET/PUT /egressos/meu-perfil` (STUDENT),
  CRUD `/egressos-eventos`, `POST /egressos-eventos/:id/participantes|presenca`.

## Públicos (/api/public/edu/apoio) — `:tenant` = tenantId ou sigla da instituição
- `POST /ouvidoria/:tenant/manifestacoes` (anônima ou identificada; devolve protocolo + senha), `POST /ouvidoria/:tenant/consulta|avaliar|complementar` (protocolo + senha; bloqueio após 5 falhas; rate limit).
- `GET|POST /pesquisa-egresso/:tenant/:aplicacaoId?egressoId=&codigo=` (convite HMAC).

## Jobs (registerEduJob)
apoio:ouvidoria-sla, apoio:bolsas, apoio:estagios, apoio:ocorrencias, apoio:risco-evasao, apoio:pesquisas, apoio:chamados, apoio:mentorias, apoio:egressos-sync, apoio:planos-aee.

## Exportado para outros módulos (`exports.ts`)
`calcularRisco`, `avaliarAluno`, `recalcularRiscoTenant`, `coletarMetricasAluno`, `adaptacoesVigentesDoAluno` (notas/provas: tempo extra etc.), `listarEgressosParaCampanha` (comunicacao),
`sincronizarConcluintes`, `calcularNps`, `agregarRespostas`, `calcularIndicadoresEgressos`, `relatorioOuvidoria`, `renderRelatorioAnualOuvidoria`, `bootstrapApoio`.

## Leituras tolerantes a outros módulos
NtResultado (notas/frequência), Attendance, AssessmentAttempt, ContentProgress, StudentFlashcardState, AccountReceivable, SecProtocolo/SecTipoRequerimento (trancamento). Cada fonte em try/catch.
