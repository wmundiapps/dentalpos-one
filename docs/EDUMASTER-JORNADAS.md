# EduMaster Pro — Fluxogramas de Jornadas

Gerado por `npx tsx src/modules/jornadas/exportMermaid.ts` a partir dos templates padrão (`backend/src/modules/jornadas/templates.ts`).
Legenda: retângulo = tarefa; hexágono = aprovação; paralelogramo = espera por evento; losango = gateway; círculo = marco; estádio = início/fim; linha tracejada = transição condicional. As raias agrupam as etapas por responsável.

## Índice

- [Jornada do aluno: do vestibular ao diploma](#aluno-padrao)
- [Jornada do candidato](#candidato-padrao)
- [Jornada do professor](#professor-padrao)
- [Jornada do coordenador de curso](#coordenador-padrao)
- [Jornada do funcionário](#funcionario-padrao)
- [Jornada da diretoria](#diretoria-padrao)
- [Jornada da reitoria](#reitoria-padrao)
- [Jornada do egresso](#egresso-padrao)

<a id="aluno-padrao"></a>
## Jornada do aluno: do vestibular ao diploma

Captação, ingresso, matrícula, vida acadêmica por período, rematrícula, estágio/TCC, ENADE, colação e diploma.

- Persona: **ALUNO** · Chave: `aluno-padrao` · 38 nós · 43 transições
- Responsáveis: Marketing, Admissões, Secretaria, Financeiro, Aluno, Apoio/Suporte, Coordenação, Professor, Biblioteca

```mermaid
flowchart TD
  n_inicio(["Interesse do futuro aluno"])
  n_gw_aprovado{"Candidato aprovado?"}
  n_marco_matriculado(("Matrícula efetivada"))
  n_gw_situacao{"Situação ao fim do período"}
  n_gw_ultimo{"Último período do curso?"}
  n_gw_enade{"Estudante habilitado ao ENADE?"}
  n_marco_egresso(("Aluno concluinte tornou-se egresso"))
  n_fim_concluido(["Jornada do aluno concluída"])
  n_fim_nao_aprovado(["Encerrada: candidato não aprovado"])
  n_fim_evasao(["Encerrada: evasão/cancelamento"])
  subgraph raia_MARKETING["Marketing"]
    n_captacao["Captação e atendimento do lead<br/><i>SLA 7d</i>"]
  end
  subgraph raia_ADMISSIONS["Admissões"]
    n_inscricao["Inscrição no processo seletivo<br/><i>SLA 3d</i>"]
    n_prova[/"Prova / avaliação de ingresso<br/><i>SLA 30d</i>"/]
    n_resultado["Apuração e divulgação do resultado<br/><i>SLA 5d</i>"]
    n_convocacao["Convocação e proposta de matrícula<br/><i>SLA 2d</i>"]
  end
  subgraph raia_SECRETARY["Secretaria"]
    n_matricula["Matrícula e contrato educacional<br/><i>SLA 5d</i>"]
    n_conferencia_docs{{"Conferência documental<br/><i>SLA 5d</i>"}}
    n_fechamento["Fechamento do período letivo<br/><i>SLA 15d</i>"]
    n_enade_inscricao["Inscrição/regularização no ENADE<br/><i>SLA 30d</i>"]
    n_enade_prova[/"Aguardando realização do ENADE<br/><i>SLA 90d</i>"/]
    n_auditoria{{"Auditoria de integralização curricular<br/><i>SLA 15d</i>"}}
    n_colacao["Colação de grau<br/><i>SLA 30d</i>"]
    n_diploma["Expedição e registro do diploma<br/><i>SLA 60d</i>"]
  end
  subgraph raia_FINANCE["Financeiro"]
    n_pagamento_1a["Pagamento da 1ª parcela / financiamento<br/><i>SLA 5d</i>"]
    n_adimplencia{{"Verificação de adimplência<br/><i>SLA 5d</i>"}}
    n_negociacao["Negociação financeira<br/><i>SLA 7d</i>"]
    n_nada_consta_fin["Nada consta financeiro<br/><i>SLA 5d</i>"]
  end
  subgraph raia_STUDENT["Aluno"]
    n_documentos["Entrega de documentos de matrícula<br/><i>SLA 15d</i>"]
    n_rematricula["Rematrícula semestral<br/><i>SLA 20d</i>"]
    n_regularizar["Regularização de pendências acadêmicas<br/><i>SLA 30d</i>"]
  end
  subgraph raia_SUPPORT["Apoio/Suporte"]
    n_acesso_ava["E-mail institucional e acesso ao AVA<br/><i>SLA 3d</i>"]
  end
  subgraph raia_COORDINATOR["Coordenação"]
    n_integracao["Integração e acolhimento de calouros<br/><i>SLA 7d</i>"]
    n_frequencia["Acompanhamento de frequência e evasão<br/><i>SLA 90d</i>"]
    n_plano_dp["Plano de dependência / adaptação<br/><i>SLA 10d</i>"]
    n_estagio["Estágio supervisionado<br/><i>SLA 180d</i>"]
  end
  subgraph raia_TEACHER["Professor"]
    n_notas["Avaliações e lançamento de notas<br/><i>SLA 120d</i>"]
    n_tcc["TCC: orientação e banca<br/><i>SLA 120d</i>"]
  end
  subgraph raia_LIBRARIAN["Biblioteca"]
    n_nada_consta_bib["Nada consta da biblioteca<br/><i>SLA 5d</i>"]
  end
  n_inicio --> n_captacao
  n_captacao --> n_inscricao
  n_inscricao --> n_prova
  n_prova --> n_resultado
  n_resultado --> n_gw_aprovado
  n_gw_aprovado -.->|"Não aprovado"| n_fim_nao_aprovado
  n_gw_aprovado --> n_convocacao
  n_convocacao --> n_matricula
  n_matricula --> n_pagamento_1a
  n_pagamento_1a --> n_documentos
  n_documentos --> n_conferencia_docs
  n_conferencia_docs -.->|"Reprovado"| n_documentos
  n_conferencia_docs --> n_marco_matriculado
  n_marco_matriculado --> n_acesso_ava
  n_acesso_ava --> n_integracao
  n_integracao --> n_frequencia
  n_frequencia --> n_notas
  n_notas --> n_fechamento
  n_fechamento --> n_gw_situacao
  n_gw_situacao -.->|"Dependência"| n_plano_dp
  n_gw_situacao -.->|"Evasão/cancelamento"| n_fim_evasao
  n_gw_situacao --> n_rematricula
  n_plano_dp --> n_rematricula
  n_rematricula --> n_adimplencia
  n_adimplencia -.->|"Reprovado"| n_negociacao
  n_adimplencia --> n_gw_ultimo
  n_negociacao --> n_adimplencia
  n_gw_ultimo -.->|"Sim"| n_estagio
  n_gw_ultimo -->|"Próximo período"| n_frequencia
  n_estagio --> n_tcc
  n_tcc --> n_gw_enade
  n_gw_enade -.->|"Habilitado"| n_enade_inscricao
  n_gw_enade --> n_auditoria
  n_enade_inscricao --> n_enade_prova
  n_enade_prova --> n_auditoria
  n_auditoria -.->|"Reprovado"| n_regularizar
  n_auditoria --> n_nada_consta_bib
  n_regularizar --> n_auditoria
  n_nada_consta_bib --> n_nada_consta_fin
  n_nada_consta_fin --> n_colacao
  n_colacao --> n_diploma
  n_diploma --> n_marco_egresso
  n_marco_egresso --> n_fim_concluido
  classDef inicio fill:#e0f2fe,stroke:#0369a1;
  classDef fim fill:#dcfce7,stroke:#15803d;
  classDef gw fill:#fef9c3,stroke:#a16207;
  classDef apr fill:#fae8ff,stroke:#a21caf;
  classDef marco fill:#ffedd5,stroke:#c2410c;
  class n_inicio inicio;
  class n_fim_concluido,n_fim_nao_aprovado,n_fim_evasao fim;
  class n_gw_aprovado,n_gw_situacao,n_gw_ultimo,n_gw_enade gw;
  class n_conferencia_docs,n_adimplencia,n_auditoria apr;
  class n_marco_matriculado,n_marco_egresso marco;
```

| Etapa | Responsável | SLA | Destino |
|---|---|---|---|
| Captação e atendimento do lead | Marketing | 7 d | admissoes /admissoes/leads |
| Inscrição no processo seletivo | Admissões | 3 d | admissoes /admissoes/inscricoes |
| Prova / avaliação de ingresso | Admissões | 30 d | admissoes /admissoes/provas |
| Apuração e divulgação do resultado | Admissões | 5 d | admissoes /admissoes/resultados |
| Convocação e proposta de matrícula | Admissões | 2 d | admissoes /admissoes/convocacoes |
| Matrícula e contrato educacional | Secretaria | 5 d | secretaria /secretaria/matriculas |
| Pagamento da 1ª parcela / financiamento | Financeiro | 5 d | financeiro /financeiro/mensalidades |
| Entrega de documentos de matrícula | Aluno | 15 d | secretaria /secretaria/documentos |
| Conferência documental | Secretaria | 5 d | secretaria /secretaria/documentos |
| E-mail institucional e acesso ao AVA | Apoio/Suporte | 3 d | conteudo /suporte/acessos |
| Integração e acolhimento de calouros | Coordenação | 7 d | academico /academico/integracao |
| Acompanhamento de frequência e evasão | Coordenação | 90 d | academico /academico/frequencia |
| Avaliações e lançamento de notas | Professor | 120 d | notas /notas/diario |
| Fechamento do período letivo | Secretaria | 15 d | secretaria /secretaria/fechamento |
| Plano de dependência / adaptação | Coordenação | 10 d | academico /academico/dependencias |
| Rematrícula semestral | Aluno | 20 d | secretaria /secretaria/rematricula |
| Verificação de adimplência | Financeiro | 5 d | financeiro /financeiro/inadimplencia |
| Negociação financeira | Financeiro | 7 d | financeiro /financeiro/negociacao |
| Estágio supervisionado | Coordenação | 180 d | academico /academico/estagios |
| TCC: orientação e banca | Professor | 120 d | academico /academico/tcc |
| Inscrição/regularização no ENADE | Secretaria | 30 d | regulatorio /regulatorio/enade |
| Aguardando realização do ENADE | Secretaria | 90 d | regulatorio /regulatorio/enade |
| Auditoria de integralização curricular | Secretaria | 15 d | secretaria /secretaria/integralizacao |
| Regularização de pendências acadêmicas | Aluno | 30 d | secretaria /secretaria/pendencias |
| Nada consta da biblioteca | Biblioteca | 5 d | biblioteca /biblioteca/nada-consta |
| Nada consta financeiro | Financeiro | 5 d | financeiro /financeiro/nada-consta |
| Colação de grau | Secretaria | 30 d | secretaria /secretaria/colacao |
| Expedição e registro do diploma | Secretaria | 60 d | secretaria /secretaria/diplomas |

<a id="candidato-padrao"></a>
## Jornada do candidato

Funil de admissão do primeiro contato à matrícula, com reengajamento.

- Persona: **CANDIDATO** · Chave: `candidato-padrao` · 15 nós · 16 transições
- Responsáveis: Admissões, Financeiro, Secretaria, Marketing

```mermaid
flowchart TD
  n_inicio(["Candidato captado"])
  n_gw_aprovado{"Aprovado?"}
  n_gw_decisao{"Candidato decidiu matricular?"}
  n_marco_matriculado(("Candidato convertido em aluno"))
  n_fim_matriculado(["Concluída: matriculado"])
  n_fim_perdido(["Encerrada: candidato não convertido"])
  subgraph raia_ADMISSIONS["Admissões"]
    n_contato["Primeiro contato (até 1 dia útil)<br/><i>SLA 1d</i>"]
    n_visita["Visita guiada / aula experimental<br/><i>SLA 7d</i>"]
    n_inscricao["Inscrição no processo seletivo<br/><i>SLA 5d</i>"]
    n_prova[/"Aguardando prova / análise de nota<br/><i>SLA 30d</i>"/]
    n_resultado["Resultado do processo seletivo<br/><i>SLA 5d</i>"]
    n_proposta["Proposta comercial e bolsas<br/><i>SLA 3d</i>"]
  end
  subgraph raia_FINANCE["Financeiro"]
    n_aprovacao_desconto{{"Aprovação de desconto/bolsa<br/><i>SLA 2d</i>"}}
  end
  subgraph raia_SECRETARY["Secretaria"]
    n_matricula["Matrícula<br/><i>SLA 5d</i>"]
  end
  subgraph raia_MARKETING["Marketing"]
    n_reengajamento["Reengajamento (cadência de follow-up)<br/><i>SLA 15d</i>"]
  end
  n_inicio --> n_contato
  n_contato --> n_visita
  n_visita --> n_inscricao
  n_inscricao --> n_prova
  n_prova --> n_resultado
  n_resultado --> n_gw_aprovado
  n_gw_aprovado -.->|"Não aprovado"| n_reengajamento
  n_gw_aprovado --> n_proposta
  n_proposta --> n_aprovacao_desconto
  n_aprovacao_desconto -.->|"Reprovado"| n_proposta
  n_aprovacao_desconto --> n_gw_decisao
  n_gw_decisao -.->|"Não"| n_reengajamento
  n_gw_decisao --> n_matricula
  n_matricula --> n_marco_matriculado
  n_marco_matriculado --> n_fim_matriculado
  n_reengajamento --> n_fim_perdido
  classDef inicio fill:#e0f2fe,stroke:#0369a1;
  classDef fim fill:#dcfce7,stroke:#15803d;
  classDef gw fill:#fef9c3,stroke:#a16207;
  classDef apr fill:#fae8ff,stroke:#a21caf;
  classDef marco fill:#ffedd5,stroke:#c2410c;
  class n_inicio inicio;
  class n_fim_matriculado,n_fim_perdido fim;
  class n_gw_aprovado,n_gw_decisao gw;
  class n_aprovacao_desconto apr;
  class n_marco_matriculado marco;
```

| Etapa | Responsável | SLA | Destino |
|---|---|---|---|
| Primeiro contato (até 1 dia útil) | Admissões | 1 d | admissoes /admissoes/leads |
| Visita guiada / aula experimental | Admissões | 7 d | admissoes /admissoes/agenda |
| Inscrição no processo seletivo | Admissões | 5 d | admissoes /admissoes/inscricoes |
| Aguardando prova / análise de nota | Admissões | 30 d | - |
| Resultado do processo seletivo | Admissões | 5 d | admissoes /admissoes/resultados |
| Proposta comercial e bolsas | Admissões | 3 d | admissoes /admissoes/propostas |
| Aprovação de desconto/bolsa | Financeiro | 2 d | financeiro /financeiro/bolsas |
| Matrícula | Secretaria | 5 d | secretaria /secretaria/matriculas |
| Reengajamento (cadência de follow-up) | Marketing | 15 d | admissoes /admissoes/leads |

<a id="professor-padrao"></a>
## Jornada do professor

Recrutamento, contratação, onboarding, ciclo semestral, avaliação e progressão de carreira.

- Persona: **PROFESSOR** · Chave: `professor-padrao` · 24 nós · 28 transições
- Responsáveis: Coordenação, Diretoria, Marketing, Equipe administrativa, Apoio/Suporte, Professor

```mermaid
flowchart TD
  n_inicio(["Necessidade de docente identificada"])
  n_gw_candidato{"Candidato selecionado?"}
  n_gw_ciclo{"Próximo passo do ciclo docente"}
  n_marco_progressao(("Progressão concedida"))
  n_fim_vaga_negada(["Encerrada: vaga não aprovada"])
  n_fim_desligado(["Encerrada: docente desligado"])
  subgraph raia_COORDINATOR["Coordenação"]
    n_requisicao["Requisição de vaga docente<br/><i>SLA 5d</i>"]
    n_entrevista["Entrevista e aula teste<br/><i>SLA 10d</i>"]
    n_onboarding["Integração institucional<br/><i>SLA 7d</i>"]
    n_capacitacao["Capacitação docente (metodologias, AVA, avaliação)<br/><i>SLA 30d</i>"]
    n_aprovacao_planos{{"Aprovação dos planos de ensino<br/><i>SLA 7d</i>"}}
    n_avaliacao["Avaliação docente (alunos, coordenação, CPA)<br/><i>SLA 15d</i>"]
  end
  subgraph raia_BOARD["Diretoria"]
    n_aprovacao_vaga{{"Aprovação da vaga<br/><i>SLA 7d</i>"}}
    n_comissao{{"Comissão de avaliação da progressão<br/><i>SLA 30d</i>"}}
  end
  subgraph raia_MARKETING["Marketing"]
    n_divulgacao["Divulgação da vaga / edital<br/><i>SLA 10d</i>"]
  end
  subgraph raia_STAFF["Equipe administrativa"]
    n_triagem["Triagem de currículos (Lattes)<br/><i>SLA 10d</i>"]
    n_proposta["Proposta e aceite<br/><i>SLA 5d</i>"]
    n_docs_contratacao["Documentos de contratação<br/><i>SLA 7d</i>"]
    n_contrato["Contrato de trabalho e eSocial<br/><i>SLA 3d</i>"]
  end
  subgraph raia_SUPPORT["Apoio/Suporte"]
    n_cadastro_sistema["Cadastro no sistema, e-mail e AVA<br/><i>SLA 3d</i>"]
  end
  subgraph raia_TEACHER["Professor"]
    n_planejamento["Planejamento semestral: planos de ensino<br/><i>SLA 15d</i>"]
    n_diario["Diário de classe: aulas e frequência<br/><i>SLA 120d</i>"]
    n_notas["Lançamento e fechamento de notas<br/><i>SLA 10d</i>"]
    n_progressao["Pedido de progressão de carreira<br/><i>SLA 20d</i>"]
  end
  n_inicio --> n_requisicao
  n_requisicao --> n_aprovacao_vaga
  n_aprovacao_vaga -.->|"Reprovado"| n_fim_vaga_negada
  n_aprovacao_vaga --> n_divulgacao
  n_divulgacao --> n_triagem
  n_triagem --> n_entrevista
  n_entrevista --> n_gw_candidato
  n_gw_candidato -.->|"Nenhum aprovado"| n_triagem
  n_gw_candidato --> n_proposta
  n_proposta --> n_docs_contratacao
  n_docs_contratacao --> n_contrato
  n_contrato --> n_onboarding
  n_onboarding --> n_cadastro_sistema
  n_cadastro_sistema --> n_capacitacao
  n_capacitacao --> n_planejamento
  n_planejamento --> n_aprovacao_planos
  n_aprovacao_planos -.->|"Reprovado"| n_planejamento
  n_aprovacao_planos --> n_diario
  n_diario --> n_notas
  n_notas --> n_avaliacao
  n_avaliacao --> n_gw_ciclo
  n_gw_ciclo -.->|"Desligamento"| n_fim_desligado
  n_gw_ciclo -.->|"Elegível à progressão"| n_progressao
  n_gw_ciclo -->|"Novo semestre"| n_planejamento
  n_progressao --> n_comissao
  n_comissao -.->|"Reprovado"| n_planejamento
  n_comissao --> n_marco_progressao
  n_marco_progressao --> n_planejamento
  classDef inicio fill:#e0f2fe,stroke:#0369a1;
  classDef fim fill:#dcfce7,stroke:#15803d;
  classDef gw fill:#fef9c3,stroke:#a16207;
  classDef apr fill:#fae8ff,stroke:#a21caf;
  classDef marco fill:#ffedd5,stroke:#c2410c;
  class n_inicio inicio;
  class n_fim_vaga_negada,n_fim_desligado fim;
  class n_gw_candidato,n_gw_ciclo gw;
  class n_aprovacao_vaga,n_aprovacao_planos,n_comissao apr;
  class n_marco_progressao marco;
```

| Etapa | Responsável | SLA | Destino |
|---|---|---|---|
| Requisição de vaga docente | Coordenação | 5 d | desempenho /rh/vagas |
| Aprovação da vaga | Diretoria | 7 d | - |
| Divulgação da vaga / edital | Marketing | 10 d | - |
| Triagem de currículos (Lattes) | Equipe administrativa | 10 d | - |
| Entrevista e aula teste | Coordenação | 10 d | - |
| Proposta e aceite | Equipe administrativa | 5 d | - |
| Documentos de contratação | Equipe administrativa | 7 d | - |
| Contrato de trabalho e eSocial | Equipe administrativa | 3 d | - |
| Integração institucional | Coordenação | 7 d | - |
| Cadastro no sistema, e-mail e AVA | Apoio/Suporte | 3 d | academico /academico/professores |
| Capacitação docente (metodologias, AVA, avaliação) | Coordenação | 30 d | - |
| Planejamento semestral: planos de ensino | Professor | 15 d | conteudo /conteudo/planos-ensino |
| Aprovação dos planos de ensino | Coordenação | 7 d | - |
| Diário de classe: aulas e frequência | Professor | 120 d | notas /notas/diario |
| Lançamento e fechamento de notas | Professor | 10 d | notas /notas/lancamento |
| Avaliação docente (alunos, coordenação, CPA) | Coordenação | 15 d | desempenho /desempenho/avaliacao-docente |
| Pedido de progressão de carreira | Professor | 20 d | - |
| Comissão de avaliação da progressão | Diretoria | 30 d | - |

<a id="coordenador-padrao"></a>
## Jornada do coordenador de curso

Ciclo do curso: PPC/NDE, oferta, horários, acompanhamento, regulatório, ENADE e relatórios.

- Persona: **COORDENADOR** · Chave: `coordenador-padrao` · 19 nós · 22 transições
- Responsáveis: Coordenação, Diretoria, Secretaria, Reitoria

```mermaid
flowchart TD
  n_inicio(["Início do ciclo do curso"])
  n_marco_inicio(("Início do semestre"))
  n_gw_enade{"Curso no ciclo ENADE?"}
  n_gw_ciclo{"Continuar ciclo do curso?"}
  n_fim_ciclo(["Ciclo do curso encerrado"])
  subgraph raia_COORDINATOR["Coordenação"]
    n_ppc_nde["Revisão do PPC com o NDE<br/><i>SLA 30d</i>"]
    n_oferta["Oferta de disciplinas e vagas<br/><i>SLA 20d</i>"]
    n_alocacao_docentes["Alocação de docentes<br/><i>SLA 15d</i>"]
    n_horarios["Horários e salas<br/><i>SLA 10d</i>"]
    n_acomp_freq["Acompanhamento de frequência e evasão<br/><i>SLA 30d</i>"]
    n_acomp_notas["Acompanhamento de diários e notas<br/><i>SLA 60d</i>"]
    n_reuniao_nde["Reunião periódica do NDE<br/><i>SLA 30d</i>"]
    n_regulatorio["Dados regulatórios do curso (e-MEC, Censo)<br/><i>SLA 30d</i>"]
    n_enade_prep["Preparação para o ENADE<br/><i>SLA 60d</i>"]
    n_enade_resultado["Análise do conceito ENADE/CPC<br/><i>SLA 45d</i>"]
    n_relatorio["Relatório semestral do curso (indicadores)<br/><i>SLA 15d</i>"]
  end
  subgraph raia_BOARD["Diretoria"]
    n_aprov_colegiado{{"Aprovação no colegiado de curso<br/><i>SLA 15d</i>"}}
  end
  subgraph raia_SECRETARY["Secretaria"]
    n_publicacao["Publicação de horários e calendário<br/><i>SLA 5d</i>"]
  end
  subgraph raia_RECTOR["Reitoria"]
    n_aprov_relatorio{{"Validação do relatório pela direção<br/><i>SLA 10d</i>"}}
  end
  n_inicio --> n_ppc_nde
  n_ppc_nde --> n_aprov_colegiado
  n_aprov_colegiado -.->|"Reprovado"| n_ppc_nde
  n_aprov_colegiado --> n_oferta
  n_oferta --> n_alocacao_docentes
  n_alocacao_docentes --> n_horarios
  n_horarios --> n_publicacao
  n_publicacao --> n_marco_inicio
  n_marco_inicio --> n_acomp_freq
  n_acomp_freq --> n_acomp_notas
  n_acomp_notas --> n_reuniao_nde
  n_reuniao_nde --> n_regulatorio
  n_regulatorio --> n_gw_enade
  n_gw_enade -.->|"Sim"| n_enade_prep
  n_gw_enade --> n_relatorio
  n_enade_prep --> n_enade_resultado
  n_enade_resultado --> n_relatorio
  n_relatorio --> n_aprov_relatorio
  n_aprov_relatorio -.->|"Reprovado"| n_relatorio
  n_aprov_relatorio --> n_gw_ciclo
  n_gw_ciclo -.->|"Encerrar"| n_fim_ciclo
  n_gw_ciclo -->|"Novo semestre"| n_oferta
  classDef inicio fill:#e0f2fe,stroke:#0369a1;
  classDef fim fill:#dcfce7,stroke:#15803d;
  classDef gw fill:#fef9c3,stroke:#a16207;
  classDef apr fill:#fae8ff,stroke:#a21caf;
  classDef marco fill:#ffedd5,stroke:#c2410c;
  class n_inicio inicio;
  class n_fim_ciclo fim;
  class n_gw_enade,n_gw_ciclo gw;
  class n_aprov_colegiado,n_aprov_relatorio apr;
  class n_marco_inicio marco;
```

| Etapa | Responsável | SLA | Destino |
|---|---|---|---|
| Revisão do PPC com o NDE | Coordenação | 30 d | academico /academico/ppc |
| Aprovação no colegiado de curso | Diretoria | 15 d | governanca /governanca/reunioes |
| Oferta de disciplinas e vagas | Coordenação | 20 d | academico /academico/ofertas |
| Alocação de docentes | Coordenação | 15 d | academico /academico/turmas |
| Horários e salas | Coordenação | 10 d | calendario /calendario/horarios |
| Publicação de horários e calendário | Secretaria | 5 d | calendario /calendario |
| Acompanhamento de frequência e evasão | Coordenação | 30 d | academico /academico/frequencia |
| Acompanhamento de diários e notas | Coordenação | 60 d | notas /notas/acompanhamento |
| Reunião periódica do NDE | Coordenação | 30 d | governanca /governanca/reunioes |
| Dados regulatórios do curso (e-MEC, Censo) | Coordenação | 30 d | regulatorio /regulatorio/cursos |
| Preparação para o ENADE | Coordenação | 60 d | regulatorio /regulatorio/enade |
| Análise do conceito ENADE/CPC | Coordenação | 45 d | regulatorio /regulatorio/enade |
| Relatório semestral do curso (indicadores) | Coordenação | 15 d | desempenho /desempenho/relatorios |
| Validação do relatório pela direção | Reitoria | 10 d | - |

<a id="funcionario-padrao"></a>
## Jornada do funcionário

Admissão, onboarding, rotinas, férias, avaliações e desligamento.

- Persona: **FUNCIONARIO** · Chave: `funcionario-padrao` · 23 nós · 25 transições
- Responsáveis: Coordenação, Diretoria, Equipe administrativa, Apoio/Suporte, Financeiro

```mermaid
flowchart TD
  n_inicio(["Necessidade de contratação"])
  n_gw_ciclo{"Continuidade do vínculo"}
  n_fim_desligado(["Vínculo encerrado"])
  n_fim_nao_admitido(["Encerrada: admissão não aprovada"])
  n_fim_nao_efetivado(["Encerrada: não efetivado"])
  subgraph raia_COORDINATOR["Coordenação"]
    n_requisicao["Requisição de pessoal<br/><i>SLA 5d</i>"]
    n_rotinas["Rotinas e metas do período<br/><i>SLA 30d</i>"]
    n_aval_experiencia{{"Avaliação de experiência (45/90 dias)<br/><i>SLA 45d</i>"}}
    n_ferias_aprov{{"Aprovação das férias<br/><i>SLA 5d</i>"}}
    n_avaliacao["Avaliação anual de desempenho<br/><i>SLA 20d</i>"]
    n_deslig_solic["Solicitação de desligamento<br/><i>SLA 2d</i>"]
  end
  subgraph raia_BOARD["Diretoria"]
    n_aprov_admissao{{"Aprovação da admissão<br/><i>SLA 5d</i>"}}
    n_deslig_aprov{{"Aprovação do desligamento<br/><i>SLA 3d</i>"}}
  end
  subgraph raia_STAFF["Equipe administrativa"]
    n_exames["Exames admissionais (ASO)<br/><i>SLA 7d</i>"]
    n_docs["Documentos de admissão<br/><i>SLA 7d</i>"]
    n_contrato["Contrato e eSocial<br/><i>SLA 3d</i>"]
    n_onboarding["Integração e entrega de crachá/equipamentos<br/><i>SLA 5d</i>"]
    n_treinamento["Treinamentos obrigatórios (LGPD, ética, segurança)<br/><i>SLA 15d</i>"]
    n_ferias_prog["Programação de férias<br/><i>SLA 30d</i>"]
    n_exames_dem["Exame demissional<br/><i>SLA 5d</i>"]
  end
  subgraph raia_SUPPORT["Apoio/Suporte"]
    n_acessos["Acessos a sistemas e e-mail<br/><i>SLA 2d</i>"]
    n_baixa_acessos["Revogação de acessos e devolução de bens<br/><i>SLA 1d</i>"]
  end
  subgraph raia_FINANCE["Financeiro"]
    n_rescisao["Rescisão e acerto financeiro<br/><i>SLA 10d</i>"]
  end
  n_inicio --> n_requisicao
  n_requisicao --> n_aprov_admissao
  n_aprov_admissao -.->|"Reprovado"| n_fim_nao_admitido
  n_aprov_admissao --> n_exames
  n_exames --> n_docs
  n_docs --> n_contrato
  n_contrato --> n_onboarding
  n_onboarding --> n_acessos
  n_acessos --> n_treinamento
  n_treinamento --> n_rotinas
  n_rotinas --> n_aval_experiencia
  n_aval_experiencia -.->|"Reprovado"| n_fim_nao_efetivado
  n_aval_experiencia --> n_ferias_prog
  n_ferias_prog --> n_ferias_aprov
  n_ferias_aprov -.->|"Reprovado"| n_ferias_prog
  n_ferias_aprov --> n_avaliacao
  n_avaliacao --> n_gw_ciclo
  n_gw_ciclo -.->|"Desligamento"| n_deslig_solic
  n_gw_ciclo -->|"Novo ciclo"| n_rotinas
  n_deslig_solic --> n_deslig_aprov
  n_deslig_aprov -.->|"Reprovado"| n_rotinas
  n_deslig_aprov --> n_exames_dem
  n_exames_dem --> n_rescisao
  n_rescisao --> n_baixa_acessos
  n_baixa_acessos --> n_fim_desligado
  classDef inicio fill:#e0f2fe,stroke:#0369a1;
  classDef fim fill:#dcfce7,stroke:#15803d;
  classDef gw fill:#fef9c3,stroke:#a16207;
  classDef apr fill:#fae8ff,stroke:#a21caf;
  classDef marco fill:#ffedd5,stroke:#c2410c;
  class n_inicio inicio;
  class n_fim_desligado,n_fim_nao_admitido,n_fim_nao_efetivado fim;
  class n_gw_ciclo gw;
  class n_aprov_admissao,n_aval_experiencia,n_ferias_aprov,n_deslig_aprov apr;
```

| Etapa | Responsável | SLA | Destino |
|---|---|---|---|
| Requisição de pessoal | Coordenação | 5 d | - |
| Aprovação da admissão | Diretoria | 5 d | - |
| Exames admissionais (ASO) | Equipe administrativa | 7 d | - |
| Documentos de admissão | Equipe administrativa | 7 d | - |
| Contrato e eSocial | Equipe administrativa | 3 d | - |
| Integração e entrega de crachá/equipamentos | Equipe administrativa | 5 d | - |
| Acessos a sistemas e e-mail | Apoio/Suporte | 2 d | - |
| Treinamentos obrigatórios (LGPD, ética, segurança) | Equipe administrativa | 15 d | - |
| Rotinas e metas do período | Coordenação | 30 d | - |
| Avaliação de experiência (45/90 dias) | Coordenação | 45 d | - |
| Programação de férias | Equipe administrativa | 30 d | - |
| Aprovação das férias | Coordenação | 5 d | - |
| Avaliação anual de desempenho | Coordenação | 20 d | desempenho /desempenho/avaliacoes |
| Solicitação de desligamento | Coordenação | 2 d | - |
| Aprovação do desligamento | Diretoria | 3 d | - |
| Exame demissional | Equipe administrativa | 5 d | - |
| Rescisão e acerto financeiro | Financeiro | 10 d | - |
| Revogação de acessos e devolução de bens | Apoio/Suporte | 1 d | - |

<a id="diretoria-padrao"></a>
## Jornada da diretoria

Ciclo anual da unidade: planejamento, orçamento, PDI, CPA, conselhos e prestação de contas.

- Persona: **DIRETORIA** · Chave: `diretoria-padrao` · 15 nós · 17 transições
- Responsáveis: Diretoria, Financeiro, Equipe administrativa, Reitoria

```mermaid
flowchart TD
  n_inicio(["Início do ciclo anual da diretoria"])
  n_gw_ciclo{"Novo ciclo?"}
  n_fim(["Ciclo encerrado"])
  subgraph raia_BOARD["Diretoria"]
    n_diagnostico["Diagnóstico do ano anterior e SWOT<br/><i>SLA 30d</i>"]
    n_planejamento["Planejamento anual da unidade<br/><i>SLA 30d</i>"]
    n_aprov_orcamento{{"Aprovação do orçamento<br/><i>SLA 15d</i>"}}
    n_pdi["Alinhamento ao PDI<br/><i>SLA 30d</i>"]
    n_acomp_trimestral["Acompanhamento trimestral de metas<br/><i>SLA 90d</i>"]
    n_conselho["Reunião do conselho/colegiado<br/><i>SLA 15d</i>"]
    n_relatorio_gestao["Relatório de gestão<br/><i>SLA 30d</i>"]
  end
  subgraph raia_FINANCE["Financeiro"]
    n_orcamento["Proposta orçamentária<br/><i>SLA 30d</i>"]
    n_prestacao_contas["Prestação de contas<br/><i>SLA 30d</i>"]
  end
  subgraph raia_STAFF["Equipe administrativa"]
    n_cpa["Ciclo da CPA e plano de melhorias<br/><i>SLA 60d</i>"]
    n_regulatorio["Acompanhamento regulatório (e-MEC, MEC)<br/><i>SLA 30d</i>"]
  end
  subgraph raia_RECTOR["Reitoria"]
    n_aprov_contas{{"Aprovação das contas pela reitoria<br/><i>SLA 15d</i>"}}
  end
  n_inicio --> n_diagnostico
  n_diagnostico --> n_planejamento
  n_planejamento --> n_orcamento
  n_orcamento --> n_aprov_orcamento
  n_aprov_orcamento -.->|"Reprovado"| n_orcamento
  n_aprov_orcamento --> n_pdi
  n_pdi --> n_acomp_trimestral
  n_acomp_trimestral --> n_cpa
  n_cpa --> n_regulatorio
  n_regulatorio --> n_conselho
  n_conselho --> n_relatorio_gestao
  n_relatorio_gestao --> n_prestacao_contas
  n_prestacao_contas --> n_aprov_contas
  n_aprov_contas -.->|"Reprovado"| n_prestacao_contas
  n_aprov_contas --> n_gw_ciclo
  n_gw_ciclo -.->|"Encerrar"| n_fim
  n_gw_ciclo -->|"Novo ano"| n_diagnostico
  classDef inicio fill:#e0f2fe,stroke:#0369a1;
  classDef fim fill:#dcfce7,stroke:#15803d;
  classDef gw fill:#fef9c3,stroke:#a16207;
  classDef apr fill:#fae8ff,stroke:#a21caf;
  classDef marco fill:#ffedd5,stroke:#c2410c;
  class n_inicio inicio;
  class n_fim fim;
  class n_gw_ciclo gw;
  class n_aprov_orcamento,n_aprov_contas apr;
```

| Etapa | Responsável | SLA | Destino |
|---|---|---|---|
| Diagnóstico do ano anterior e SWOT | Diretoria | 30 d | desempenho /desempenho/painel |
| Planejamento anual da unidade | Diretoria | 30 d | - |
| Proposta orçamentária | Financeiro | 30 d | financeiro /financeiro/orcamento |
| Aprovação do orçamento | Diretoria | 15 d | - |
| Alinhamento ao PDI | Diretoria | 30 d | governanca /governanca/pdi |
| Acompanhamento trimestral de metas | Diretoria | 90 d | desempenho /desempenho/metas |
| Ciclo da CPA e plano de melhorias | Equipe administrativa | 60 d | governanca /governanca/cpa |
| Acompanhamento regulatório (e-MEC, MEC) | Equipe administrativa | 30 d | regulatorio /regulatorio |
| Reunião do conselho/colegiado | Diretoria | 15 d | governanca /governanca/reunioes |
| Relatório de gestão | Diretoria | 30 d | - |
| Prestação de contas | Financeiro | 30 d | - |
| Aprovação das contas pela reitoria | Reitoria | 15 d | - |

<a id="reitoria-padrao"></a>
## Jornada da reitoria

Ciclo institucional: planejamento, orçamento, PDI, CPA, CONSUP, regulatório e prestação de contas.

- Persona: **REITORIA** · Chave: `reitoria-padrao` · 16 nós · 18 transições
- Responsáveis: Reitoria, Financeiro, Diretoria, Equipe administrativa, Coordenação

```mermaid
flowchart TD
  n_inicio(["Início do ciclo anual institucional"])
  n_marco_ano(("Ano institucional encerrado"))
  n_gw_ciclo{"Novo ciclo anual?"}
  n_fim(["Ciclo encerrado"])
  subgraph raia_RECTOR["Reitoria"]
    n_planejamento["Planejamento anual institucional<br/><i>SLA 30d</i>"]
    n_pdi["Monitoramento e revisão do PDI<br/><i>SLA 60d</i>"]
    n_indicadores["Indicadores institucionais (IGC, CPC, evasão)<br/><i>SLA 30d</i>"]
    n_prestacao["Prestação de contas à comunidade e mantenedora<br/><i>SLA 30d</i>"]
  end
  subgraph raia_FINANCE["Financeiro"]
    n_orcamento["Elaboração do orçamento anual<br/><i>SLA 45d</i>"]
    n_balanco["Balanço e auditoria<br/><i>SLA 45d</i>"]
  end
  subgraph raia_BOARD["Diretoria"]
    n_aprov_orcamento{{"Aprovação do orçamento (mantenedora/CONSUP)<br/><i>SLA 15d</i>"}}
    n_consup1["Reunião do conselho superior (1º semestre)<br/><i>SLA 30d</i>"]
    n_consup2["Reunião do conselho superior (2º semestre)<br/><i>SLA 30d</i>"]
    n_aprov_contas{{"Aprovação das contas pelo conselho<br/><i>SLA 15d</i>"}}
  end
  subgraph raia_STAFF["Equipe administrativa"]
    n_cpa["Relatório da CPA e plano de melhorias<br/><i>SLA 60d</i>"]
  end
  subgraph raia_COORDINATOR["Coordenação"]
    n_regulatorio["Gestão regulatória (recredenciamento, cursos)<br/><i>SLA 45d</i>"]
  end
  n_inicio --> n_planejamento
  n_planejamento --> n_orcamento
  n_orcamento --> n_aprov_orcamento
  n_aprov_orcamento -.->|"Reprovado"| n_orcamento
  n_aprov_orcamento --> n_pdi
  n_pdi --> n_cpa
  n_cpa --> n_consup1
  n_consup1 --> n_regulatorio
  n_regulatorio --> n_indicadores
  n_indicadores --> n_consup2
  n_consup2 --> n_balanco
  n_balanco --> n_prestacao
  n_prestacao --> n_aprov_contas
  n_aprov_contas -.->|"Reprovado"| n_balanco
  n_aprov_contas --> n_marco_ano
  n_marco_ano --> n_gw_ciclo
  n_gw_ciclo -.->|"Encerrar"| n_fim
  n_gw_ciclo -->|"Novo ano"| n_planejamento
  classDef inicio fill:#e0f2fe,stroke:#0369a1;
  classDef fim fill:#dcfce7,stroke:#15803d;
  classDef gw fill:#fef9c3,stroke:#a16207;
  classDef apr fill:#fae8ff,stroke:#a21caf;
  classDef marco fill:#ffedd5,stroke:#c2410c;
  class n_inicio inicio;
  class n_fim fim;
  class n_gw_ciclo gw;
  class n_aprov_orcamento,n_aprov_contas apr;
  class n_marco_ano marco;
```

| Etapa | Responsável | SLA | Destino |
|---|---|---|---|
| Planejamento anual institucional | Reitoria | 30 d | reitoria /reitoria/planejamento |
| Elaboração do orçamento anual | Financeiro | 45 d | financeiro /financeiro/orcamento |
| Aprovação do orçamento (mantenedora/CONSUP) | Diretoria | 15 d | - |
| Monitoramento e revisão do PDI | Reitoria | 60 d | governanca /governanca/pdi |
| Relatório da CPA e plano de melhorias | Equipe administrativa | 60 d | governanca /governanca/cpa |
| Reunião do conselho superior (1º semestre) | Diretoria | 30 d | governanca /governanca/reunioes |
| Gestão regulatória (recredenciamento, cursos) | Coordenação | 45 d | regulatorio /regulatorio/processos |
| Indicadores institucionais (IGC, CPC, evasão) | Reitoria | 30 d | desempenho /desempenho/painel |
| Reunião do conselho superior (2º semestre) | Diretoria | 30 d | governanca /governanca/reunioes |
| Balanço e auditoria | Financeiro | 45 d | - |
| Prestação de contas à comunidade e mantenedora | Reitoria | 30 d | - |
| Aprovação das contas pelo conselho | Diretoria | 15 d | - |

<a id="egresso-padrao"></a>
## Jornada do egresso

Acompanhamento, pesquisa de inserção, educação continuada, pós-graduação e relacionamento Alumni.

- Persona: **EGRESSO** · Chave: `egresso-padrao` · 14 nós · 15 transições
- Responsáveis: Secretaria, Marketing, Aluno, Coordenação, Admissões

```mermaid
flowchart TD
  n_inicio(["Diploma entregue: novo egresso"])
  n_gw_pos{"Egresso interessado em pós-graduação?"}
  n_marco_pos(("Encaminhado para jornada de candidato (pós)"))
  n_gw_continua{"Continuar relacionamento?"}
  n_fim(["Relacionamento encerrado"])
  subgraph raia_SECRETARY["Secretaria"]
    n_cadastro["Atualização cadastral do egresso<br/><i>SLA 7d</i>"]
    n_atualizacao_anual["Atualização cadastral anual<br/><i>SLA 365d</i>"]
  end
  subgraph raia_MARKETING["Marketing"]
    n_boas_vindas["Boas-vindas e carteirinha de ex-aluno<br/><i>SLA 7d</i>"]
    n_educacao_continuada["Convite a cursos de extensão e educação continuada<br/><i>SLA 30d</i>"]
    n_eventos["Eventos e networking Alumni<br/><i>SLA 90d</i>"]
    n_depoimento["Depoimento / case de sucesso<br/><i>SLA 30d</i>"]
  end
  subgraph raia_STUDENT["Aluno"]
    n_pesquisa_aguarda[/"Pesquisa de inserção profissional (6 meses)<br/><i>SLA 180d</i>"/]
  end
  subgraph raia_COORDINATOR["Coordenação"]
    n_analise["Análise dos resultados da pesquisa<br/><i>SLA 15d</i>"]
  end
  subgraph raia_ADMISSIONS["Admissões"]
    n_oferta_pos["Oferta de pós-graduação com benefício de egresso<br/><i>SLA 7d</i>"]
  end
  n_inicio --> n_cadastro
  n_cadastro --> n_boas_vindas
  n_boas_vindas --> n_pesquisa_aguarda
  n_pesquisa_aguarda --> n_analise
  n_analise --> n_gw_pos
  n_gw_pos -.->|"Sim"| n_oferta_pos
  n_gw_pos --> n_educacao_continuada
  n_oferta_pos --> n_marco_pos
  n_marco_pos --> n_educacao_continuada
  n_educacao_continuada --> n_eventos
  n_eventos --> n_depoimento
  n_depoimento --> n_atualizacao_anual
  n_atualizacao_anual --> n_gw_continua
  n_gw_continua -.->|"Encerrar"| n_fim
  n_gw_continua -->|"Novo ano"| n_educacao_continuada
  classDef inicio fill:#e0f2fe,stroke:#0369a1;
  classDef fim fill:#dcfce7,stroke:#15803d;
  classDef gw fill:#fef9c3,stroke:#a16207;
  classDef apr fill:#fae8ff,stroke:#a21caf;
  classDef marco fill:#ffedd5,stroke:#c2410c;
  class n_inicio inicio;
  class n_fim fim;
  class n_gw_pos,n_gw_continua gw;
  class n_marco_pos marco;
```

| Etapa | Responsável | SLA | Destino |
|---|---|---|---|
| Atualização cadastral do egresso | Secretaria | 7 d | secretaria /secretaria/egressos |
| Boas-vindas e carteirinha de ex-aluno | Marketing | 7 d | - |
| Pesquisa de inserção profissional (6 meses) | Aluno | 180 d | desempenho /desempenho/egressos |
| Análise dos resultados da pesquisa | Coordenação | 15 d | desempenho /desempenho/egressos |
| Oferta de pós-graduação com benefício de egresso | Admissões | 7 d | admissoes /admissoes/leads |
| Convite a cursos de extensão e educação continuada | Marketing | 30 d | - |
| Eventos e networking Alumni | Marketing | 90 d | - |
| Depoimento / case de sucesso | Marketing | 30 d | - |
| Atualização cadastral anual | Secretaria | 365 d | - |
