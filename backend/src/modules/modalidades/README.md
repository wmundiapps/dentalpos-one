# Módulo modalidades (prefixo Mod)

Presencial/semipresencial/EAD/híbrido, polos, tutoria, engajamento AVA, práticas/estágios e pós-graduação.
Montado em `/api/edu/modalidades`. Papéis: M = ADMIN/OWNER/RECTOR/BOARD + COORDINATOR/SECRETARY; T = M + TEACHER (leitura); S = STUDENT.

## Modelos
ModConfig, ModVerificacao, ModOferta, ModEncontro, ModAulaLive, ModLiveEvento, ModLivePresenca, ModPolo, ModPoloChecklistItem,
ModPoloOferta, ModPoloAluno, ModTutor, ModTutorAlocacao, ModAtendimento, ModAtendimentoMensagem, ModTutorAvaliacao,
ModEngajamentoEvento, ModEngajamentoResumo, ModAlertaInatividade, ModAgendaPratica, ModPraticaInscricao, ModEstagio, ModHoraPratica,
ModPosPrograma, ModPosArea, ModPosLinha, ModPosModulo, ModPosTurma, ModPosDocente, ModPosDisciplina, ModPosColegiado, ModPosAluno,
ModPosBanca, ModPosBolsa, ModPosOferta.

## Endpoints (prefixo /api/edu/modalidades)
- Config/regras: GET /config (T), PUT /config (M)
- Conformidade: GET /conformidade (T), GET /conformidade/programas/:programId (T, ?registrar=true), POST /conformidade/simular (T), GET /relatorios/conformidade (HTML, T), GET /painel (T), POST /bootstrap (M)
- Ofertas/encontros/lives (CRUD /ofertas, /encontros, /lives): leitura T+S, escrita M (encontros/lives: + TEACHER)
  POST /encontros/:id/cancelar|realizar; POST /lives/:id/iniciar|encerrar|consolidar-presenca|gravacao; POST /lives/:id/eventos (ENTRADA/SAIDA; aluno ou staff);
  GET /lives/:id/presencas (T); PUT /lives/:id/presencas/:studentId (M/TEACHER); GET /lives/:id/minha-presenca (S); GET /minha-agenda (S)
- Polos: CRUD /polos (leitura T+S, escrita M); POST /polos/:id/credenciar|suspender (M); GET /polos/:id/checklist (T); PUT /polos/:id/checklist/:chave (M);
  CRUD /polo-ofertas (T/M); GET|POST /polos/:id/alunos, DELETE /polos/:id/alunos/:studentId; GET /polos/:id/indicadores, GET /polos-indicadores (T)
- Tutoria: CRUD /tutores, /alocacoes (T/M); GET /relacao-aluno-tutor (T); POST|GET /atendimentos, GET /atendimentos/:id, POST /atendimentos/:id/mensagens|encerrar (S+T),
  POST /atendimentos/:id/reatribuir (M); POST /tutores/:id/avaliacoes (S); GET /tutores/:id/desempenho (T)
- Engajamento (/engajamento): POST /eventos (S ou staff; aceita lote), GET /alunos/:studentId (S próprio/T), GET /turmas/:classSectionId (T), GET /alertas (T), GET /resumos (T)
- Práticas/estágios: CRUD /agendas-praticas (T+S/M+TEACHER); POST /agendas-praticas/:id/inscrever|cancelar-inscricao (S/M)|fechar (M/TEACHER);
  CRUD /estagios (T/M); GET|POST /estagios/:id/horas (S/M); POST /horas/:id/validar (M/TEACHER); POST /estagios/:id/concluir (M); GET /alunos/:studentId/horas
- Pós: CRUD /pos/programas, /pos/areas, /pos/linhas, /pos/modulos, /pos/disciplinas, /pos/docentes, /pos/turmas, /pos/colegiado, /pos/ofertas (T/M);
  GET /pos/programas/:id/conformidade|producao; POST /pos/alunos; GET /pos/alunos(/:id); PATCH /pos/alunos/:id; POST /pos/alunos/:id/prorrogar|situacao|depositar|titular;
  GET /pos/alunos/:id/certificado (HTML com logomarca); POST|GET /pos/bancas, POST /pos/bancas/:id/resultado; POST|GET /pos/bolsas, POST /pos/bolsas/:id/situacao;
  POST /pos/ofertas/:id/publicar|encerrar; GET /pos/ofertas-publicadas
- Público (/api/public/edu/modalidades): GET /polos?tenantId= (polos credenciados)

## Jobs (registerEduJob)
modalidades.sla-tutoria, modalidades.inatividade-ava, modalidades.prazos-pos, modalidades.atos-polos, modalidades.lives-pendentes

## Exportado para outros módulos (import de `../modalidades/routes`)
conformidadeCurso, avaliarConformidade, relacaoAlunoTutor, calcularRiscoEngajamento, calcularPresencaLive, validarLato, calcularPrazosStricto,
resumoHorasPraticas, getRiscoEvasaoEngajamento(tenantId, studentId), calcularMetricasAluno, listarOfertasPosPublicadas(tenantId).
Selftest: `npx tsx src/modules/modalidades/__selftest__.ts`.
