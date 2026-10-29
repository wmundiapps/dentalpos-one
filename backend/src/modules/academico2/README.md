# Acadêmico avançado (prefixo Aca)

Estende `academico`, `calendario`, `desempenho`, `apoio` e `pesquisa` sem duplicá-los. Fragmento Prisma: `prisma/edu/academico2.prisma` (33 modelos); migration aditiva idempotente no bloco `ACA:BEGIN/END` de `prisma/manual-migrations/20261004_edumaster_pro.sql`.
Rotas em `/api/edu/academico/*` (secretaria, matrizes, salas, ligas) e `/api/edu/desenvolvimento/*`. ADMIN/OWNER/RECTOR/BOARD sempre; demais papéis conforme `common.ts`.

## Secretaria de alunos (`alunos.ts`)
- `GET /academico/alunos` — filtros: `ano, periodo, termId, programId, classSectionId, poloId, turno, statusCurso, statusMatricula, contratoStatus, novos, nee, inadimplente, semDocumentos, matriculaDe/Ate, q` (nome, RA, CPF, RG, telefone, e-mail; ignora máscara), paginação `page/pageSize`. `GET /academico/alunos/filtros` traz as opções.
- `GET /academico/alunos/exportar.xlsx` — xlsx real (gerador próprio em `xlsx.ts`, sem dependências; neutraliza fórmulas) com os mesmos filtros; auditado.
- `GET /academico/relatorios[/:codigo?formato=json|xlsx|html]` — lista de alunos, matriculados por curso/turma, novos, NEE, contratos, inadimplentes, aniversariantes (`mes`), carômetro (HTML imprimível), pendências de documentos.
- `GET /academico/alunos/:id/ficha` (dados, matrículas, contratos, notas, financeiro, documentos, ocorrências, horas). `PUT /alunos/:id/perfil`, `PUT /matriculas/:enrollmentId/ext`, `POST /alunos/:id/contratos`, `PATCH /contratos/:id`, `POST /alunos/:id/documentos`, `PATCH /documentos/:id`.
- LGPD: CPF mascarado exceto SECRETARY/administração; NEE e ocorrências só para SECRETARY/COORDINATOR/SUPPORT; NEE exige base legal; leituras/exportações com NEE entram em `LgpAcessoSensivel`.

## Matrizes e fluxograma (`matrizes.ts`, `matrizLogic.ts`)
`/academico/matrizes` (regimes seriado anual/semestral, bimestral, modular, créditos, livre), `/periodos`, `/itens`, `/prerequisitos` (PRE, CO, CARGA_MIN; bloqueia ciclo e pré-requisito em período posterior), `/equivalencias`, `/matrizes/:id/fluxograma` (colunas, arestas, caminho crítico), `/validar`, `/publicar` (arquiva a vigente), `/duplicar`, `/simular?studentId=&assumirAprovadas=&cargaMaxPeriodo=` (integralização, “e se eu passar?”, plano de períodos), `/academico/cursos` e `PUT /cursos/:id/perfil` (nível/regime).

## Salas e horários (`salas.ts`)
Reaproveita `CalSlot`/`EduSpace`/`CalEvento` (a grade aparece no módulo calendário). `/academico/salas/turnos` (manhã/tarde/noite/fins de semana), `PUT /salas/turmas/:id/perfil` (nível, turno, recursos), `GET /salas/cronograma?visao=sala|turma|professor|dia|turno|curso`, `POST /salas/sugerir` (sem gravar), `POST /salas/alocar` (409 com `conflitos`; `forcar` registra), `GET /salas/conflitos` (sala, professor, turma, capacidade, recurso, turno), `/salas/ocupacao`, `/salas/agenda` (datas concretas, feriados/recessos e eventos), `/salas/imprimir` (HTML/PDF).

## Desenvolvimento do aluno (`desenvolvimento.ts`, `devLogic.ts`)
Programas preparatórios (ENADE, ENAMED, OAB, mestrado, doutorado, concurso), didático, pedagógico, pessoal, mentoria: inscrição com lista de espera, cronograma (publica no calendário), painel por área, ranking opcional (só quem consentiu), simulado montado do banco `Des*` e importação de questões de `provas-ia`. Competências socioemocionais, plano individual com metas, acompanhamento didático/pedagógico, **avaliação global** (nota, frequência, engajamento, financeiro, ocorrências, pesquisa/extensão → score, faixa e alertas), **ações de orientação** com confidencialidade (NORMAL/RESTRITO/SIGILOSO), base legal LGPD, consentimento, registro de atendimento e log de acesso, e indicadores para coordenação e reitoria (agregados).

## Pesquisa, extensão, ligas (`ligas.ts`)
Ligas/centros acadêmicos (membros, plano de atividades com aprovação, atividades, presença → horas), extramuros (aprovação exige termo/seguro), horas complementares com teto por categoria e curso, visão dos projetos do módulo `pesquisa`, relatório consolidado (json/xlsx/html).

## Demonstração e testes
- Seed: `scripts/seeds/academico2.ts` (`seedAcademico2(api, ctx)`; também executável isolado após o `edu-demo-seed`).
- E2E: `DATABASE_URL=postgresql://... npx tsx scripts/e2e/academico2.ts` (≈470 verificações; conflitos de sala, filtros, xlsx, confidencialidade, isolamento entre instituições).
- Front: Acadêmico > Alunos · secretaria, Matrizes e fluxograma, Salas e horários, Programas de desenvolvimento, Pesquisa, extensão e ligas (`/edu/academico/*`).
