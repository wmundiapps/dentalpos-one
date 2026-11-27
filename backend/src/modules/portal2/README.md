# Módulo portal2 (prefixo Por): ambientes de ensino, portal do aluno, portal do professor e sala virtual EAD

Montado em `/api/edu/portal2` (autenticado) e `/api/public/edu/portal2` (validação pública da carteirinha).
Modelos em `prisma/edu/portal2.prisma` (24 tabelas `Por*`), migration aditiva no bloco `POR:BEGIN/END` de `prisma/manual-migrations/20261004_edumaster_pro.sql`.
Seed: `scripts/seeds/portal.ts` (`seedPortal(api, ctx)`). E2E: `scripts/e2e/portal2.ts` (330+ verificações).

## Ambientes de ensino
Ambiente = nível (GRADUACAO, POS_LATO, POS_STRICTO, CURSO_LIVRE) + modalidade (PRESENCIAL, EAD, HIBRIDO) + unidade/polo/variante (ex.: "+A") + cursos vinculados (`PorAmbienteCurso`).
- `GET /ambientes/meus` lista os que o usuário pode usar (aluno: cursos matriculados; professor: cursos das suas turmas; gestão: todos) com o atual marcado; `POST /ambientes/selecionar {ambienteId}` persiste em `PorContexto` (por usuário). `null` = todos (só gestão).
- Cabeçalho `X-Edu-Ambiente: <id|todos>` sobrescreve o contexto por requisição (o frontend o envia a partir de `sessionStorage`, por aba).
- **Middleware** `ambienteContext` (montado em `edu.routes.ts` logo após `eduContext`) coloca `req.ambiente`. **Helpers** para filtrar listas: `wherePrograma(req)`, `whereTurma(req)`, `whereAluno(req)` (ver `ambientes.ts`). Já aplicados em: `academico/programs`, `academico/class-sections`, `notas/turmas`, `secretaria/alunos` e em todo o portal2. Para respeitar o ambiente em outro módulo basta fazer `where: { ..., ...whereTurma(req) }`.
- Gestão: `GET/POST/PATCH /ambientes`, `PUT /ambientes/:id/cursos`, `POST /ambientes/bootstrap` (cria os 7 padrão).
- Frontend: `edu/ambiente/useAmbiente.tsx` (store + `AmbienteChip` na faixa do `EduShell` + diálogo que abre sozinho quando há 2+ ambientes sem escolha) e a tela `/edu/inicio`.

## Portal do aluno (`/aluno/*`; gestão consulta com `?studentId=`)
turmas, frequência/lista de chamadas, justificativa de faltas (prazo 30 dias, abona `Attendance.justificativa`), presença por QR, horário, **fluxograma curricular** (períodos por semestre/bimestre/trimestre/módulo/ano, pré-requisitos, status aprovada/cursando/reprovada/bloqueada/pendente), requerimentos e revisões (consolidado com prazo e resposta; criação continua em `/secretaria/portal` e `/notas/revisoes`), **processos internos** (`/aluno/processos`, `/processos/*`: trancamento, destrancamento, transferência, aproveitamento, cancelamento, com etapas, histórico e efeito na matrícula ao deferir), financeiro (parcelas com multa 2% + juros 1% a.m., 2ª via de boleto e Pix **simulados**, acordos com aprovação do financeiro), mensagens/avisos, carteirinha digital com QR (validação pública minimizada), privacidade LGPD (6 finalidades, histórico, exportação JSON auditada) e avaliação docente anônima. Boletim/histórico usam `/notas/meu/*`; biblioteca usa `/biblioteca/meus/*` e `/biblioteca/virtual/*`; documentos usam `/secretaria/portal/*`.

## Sala virtual / EAD (`/turmas/:id/*`, `/materiais/*`, `/forum/*`)
Materiais (arquivo, vídeo, link, texto, atividade, aula gravada, aula ao vivo por link) em trilhas, visibilidade por data, rascunho/arquivo, progresso e log de acessos, entrega de trabalhos (reenvio, atraso, correção, devolução, nota lançada no diário via `gravarNota` quando a atividade é ligada a um componente), fórum, recados à turma (avisam os alunos) e painel de progresso/acessos por aluno (inativos > 7 dias).

## Portal do professor (`/prof/*`)
painel, turmas, horário, diário (aulas, chamada em lista/manual/QR, conteúdo ministrado), desempenho da turma e **risco de evasão** (nota, frequência, acessos, atividades atrasadas, inadimplência), banco de questões e montagem de provas (módulo `provas-ia`; geração com IA via cliente existente, simulado sem chave), avaliações docentes anônimas (comentários só com 3+ respostas), disponibilidade e carga horária. Lançamento de notas e revisões recebidas reutilizam `/notas`.

## Limites
Boleto/Pix são gerados por provedor simulado (sem banco); anexos são links http(s) (sem upload de arquivo); a biblioteca física depende do acervo cadastrado; o QR da presença é lido pelo celular do aluno e o código é colado no portal (sem leitor de câmera embutido).
