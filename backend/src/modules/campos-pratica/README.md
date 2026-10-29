# Módulo Campos de prática (EduMaster Pro) — prefixo `Cpr`

Estágios, clínicas-escola e hospital veterinário, núcleo de agronomia (controle de culturas) e núcleo animal (pequenos e grandes animais).
Rotas: `/api/edu/campos-pratica/*` · Telas: `/edu/campos-pratica?secao=painel|estagios|convenios|agenda|pacientes|clinicas|agro|animal` ·
Modelos: `prisma/edu/cpr.prisma` (33 tabelas) · SQL aditivo: bloco `CPR:BEGIN/END` em `prisma/manual-migrations/20261004_edumaster_pro.sql` ·
Seed: `scripts/seeds/campos-pratica.ts` (`seedCamposPratica(api, ctx)`) · e2e: `scripts/e2e/campos-pratica.ts` (472 verificações).

## Perfis
`ADMIN/OWNER/RECTOR/BOARD` sempre; `COORDINATOR` = gestão; `SECRETARY` = secretaria (estágios, escalas, agenda); `STAFF` = recepção das clínicas (agenda e cadastro, **sem** conteúdo clínico);
`TEACHER` = orientador/supervisor (só vê o que orienta/supervisiona); `STUDENT` = só os próprios estágios, atendimentos, internações e aulas práticas. Demais perfis (FINANCE, LIBRARIAN…) recebem 403.

## 1) Estágios (`/estagios/*`)
Concedentes → **convênios com vigência** (`/convenios/situacao`: vigente/vencendo/vencido) → campos de estágio → **vagas por curso** (`/vagas/disponibilidade`).
`POST /estagios` valida: matrícula ativa no curso da vaga, vaga livre (409 `SEM_VAGA`), convênio vigente em todo o período (409 `SEM_CONVENIO`), jornada ≤ 30 h/semana e 6 h/dia (Lei 11.788/2008), não obrigatório ≤ 2 anos, sem sobreposição de estágios do aluno.
Fluxo: checklist documental (termo de compromisso, plano de atividades, seguro com validade que cubra o período, convênio automático) → orientador/secretaria **valida** → `ativar` (409 `DOCUMENTOS_PENDENTES`) →
**horas** lançadas pelo aluno (limites diário/semanal do termo e da carga total), **validadas pelo orientador** (aluno não valida as próprias) → **relatórios** parcial/final (final exige 90% das horas validadas; orientador aprova/devolve) →
**avaliações** (orientador, supervisor de campo, autoavaliação) → `encerrar` (exige horas completas, relatório final aprovado e as duas avaliações; nota = média; aprovado ≥ nota mínima configurável).
`/estagios/painel` (por curso: vagas, andamento, horas, progresso) e `/estagios/alertas` (convênio vencendo, seguro vencendo, estágio terminando, documentos pendentes, horas sem validação há mais de 7 dias).

## 2) Clínicas-escola e agendas (`/clinicas/*`)
Unidades (Psicologia, Biomedicina, Fonoaudiologia, Medicina Veterinária, Odontologia, Medicina) e consultórios. **Escalas** de supervisor com alunos: um supervisor por horário, aluno em uma escala por horário, capacidade de atendimentos simultâneos.
`POST /agenda`: **aluno só atende com supervisor escalado no mesmo horário** (409 `SEM_SUPERVISOR_ESCALADO` / `ALUNO_FORA_DA_ESCALA`), conflito de sala/supervisor/aluno/paciente → 409 (`CONFLITO_*`, serializado por unidade com lock transacional), paciente sem consentimento → 409, 3 faltas consecutivas → 409 até a coordenação liberar (`forcar`).
O aluno só **inicia** o atendimento depois que o supervisor registra presença na escala (`SUPERVISOR_AUSENTE`); só o supervisor finaliza (e revisa o registro do aluno). Confirmação, chegada, falta (justificada ou não), cancelamento (chama o primeiro da **fila de espera**), remarcação (mantém o original se falhar).
Lembretes: `scheduleReminder` para o supervisor, notificação (WhatsApp simulado via caixa de saída do módulo comunicação) ao paciente/aluno/supervisor no job `campos-pratica:lembretes-consultas`, e lembrete à secretaria para atendimentos sem desfecho.
Relatórios por curso (`/relatorios`, `?formato=csv`): atendimentos, faltas, taxa de falta, tempo médio de espera na fila e na sala.

### LGPD (dado de saúde é sensível, art. 11)
- Cadastro exige **consentimento** (finalidade + versão do termo); menor exige responsável (art. 14); base legal registrada; revogação cancela atendimentos futuros e a fila; **anonimização** (art. 18) remove identificadores.
- **Minimização e cifra**: CPF, telefone, e-mail, CPF do responsável, resumo de saúde e **resumo do atendimento** ficam cifrados com o cofre do módulo `seguranca` (AES-256-GCM, `seguranca/cripto.ts`); o CPF só aparece mascarado; aluno/professor veem o nome abreviado e só de quem atendem; recepção não vê conteúdo clínico.
- **Confidencialidade do registro**: `NORMAL` (supervisor, autor, coordenação), `RESTRITO` (supervisor e autor; coordenação só com justificativa), `SIGILOSO` (somente o supervisor; coordenação só com justificativa ≥ 15 caracteres = “quebra de sigilo” registrada). Aluno não define `SIGILOSO`.
- **Log de acesso**: toda leitura/escrita/negativa vira `CprAcessoLog` (consulta em `GET /clinicas/acessos`, só coordenação) e também a trilha central `LgpAcessoSensivel` do módulo LGPD.

## 3) Agronomia (`/agro/*`)
Áreas e talhões (soma dos talhões ≤ área), culturas com **janela de plantio** e cultivares. Ciclos (safra, talhão, cultura, cultivar, turma/disciplina da aula prática): plantio fora da janela exige confirmação, talhão não aceita ciclos sobrepostos, `plantar` → `EM_MANEJO` → `colher` (produtividade kg/ha).
Atividades de campo (preparo, adubação, plantio, defensivo, irrigação, capina, colheita) com insumo, custo (quantidade × unitário), responsável e referência opcional a item do **suprimentos**. Defensivo exige dose e **carência**; **colheita bloqueada durante a carência** (409 `CARENCIA_DEFENSIVO`).
Monitoramento (praga, doença, daninha, fenologia…) com foto por **link https** (URL validada, sem rede interna); infestação alta vira lembrete crítico. Aluno matriculado na turma do ciclo registra atividades e monitoramento nas aulas práticas.
Calendário agrícola, produtividade por talhão/safra/cultura (custo por ha e por kg), aulas práticas por turma, alertas (plantio atrasado/próximo, colheita, carência, infestação) e job diário que cria lembretes.

## 4) Núcleo animal (`/animal/*`)
Tutores (`CprPaciente` tipo `TUTOR`, com consentimento) e propriedades; animais **pequenos** (cão, gato, coelho, ave) e **grandes** (bovino, equino, ovino, caprino, suíno) — espécie validada pelo porte. Atendimentos no hospital veterinário-escola usam a mesma agenda/escala das clínicas (unidade `HOSPITAL_VET`, sala “a campo” para grandes animais).
Baias/piquetes/canis/gatil: internação respeita porte, capacidade (409 `BAIA_LOTADA`) e escala (aluno só com supervisor escalado); alta/óbito/transferência. Vacinação e vermifugação com **próxima dose e lembrete automático** (supervisor + notificação ao tutor, job `campos-pratica:lembretes-vacinas`), pendências atrasadas/próximas.
Manejo e pesagem (peso plausível por porte, ganho médio diário). Medicamentos: **somente referência** ao item do módulo suprimentos (`supItemId`), com saldo e alerta de mínimo — o estoque é movimentado no suprimentos.

## Jobs (`/api/cron/edu`, ou `POST /jobs/executar`)
`campos-pratica:alertas-estagios`, `:lembretes-consultas`, `:alertas-agro`, `:lembretes-vacinas`. Idempotentes (chaves de deduplicação `cpr:*`).

## Testes e demonstração
`DATABASE_URL=postgresql://… npx tsx scripts/e2e/campos-pratica.ts` (permissões por perfil, isolamento entre tenants, LGPD/cifra/log, conflitos de agenda, regras de supervisão, lembretes, carência, baias). Seed: `seedCamposPratica(api, ctx)`; ver comentário no topo do arquivo.

## Limites
Integração real de WhatsApp/SMS é da caixa de saída do módulo comunicação (simulada sem credencial). Não há app de confirmação pelo paciente (só o lembrete). Fotos do monitoramento são links (sem upload). O estoque veterinário não é baixado automaticamente. Conteúdo clínico não substitui o prontuário oficial do conselho profissional; a retenção/guarda legal de prontuário deve ser definida com o DPO.
