# Relatório de Impacto à Proteção de Dados Pessoais (RIPD) — MODELO

> **Modelo de apoio, não é parecer jurídico.** Deve ser preenchido pela instituição (controladora), com o encarregado (DPO), as áreas responsáveis e revisão de advogado. Base: LGPD, art. 5º, XVII e art. 38; orientações da ANPD. Campos entre `[colchetes]` são para preencher.

| Campo | Conteúdo |
|---|---|
| Instituição (controladora) | [razão social, CNPJ, endereço] |
| Encarregado (DPO) | [nome, e-mail, telefone] |
| Operadora da plataforma | WMundi (EduMaster Pro) — ver `LGPD-CONTRATO-DPA-modelo.md` |
| Versão / data / responsável pela elaboração | [v1.0, dd/mm/aaaa, nome] |
| Próxima revisão | [máx. 12 meses ou a cada mudança relevante] |

## 1. Descrição do tratamento avaliado
Gestão acadêmica, financeira e de apoio ao estudante por meio da plataforma EduMaster Pro. O inventário completo (finalidades, bases legais, retenção, compartilhamento e operadores) está na **Central LGPD → Inventário (ROPA)**; exporte o CSV e anexe a este relatório.

- **Atividades de maior risco** (marque as que se aplicam e detalhe nas seções 4 e 5):
  - [ ] Dados sensíveis de saúde/deficiência (Atendimento NAE/NAPNE, Plano AEE) — `APO-ATENDIMENTO`, `APO-AEE`
  - [ ] Dados de crianças e adolescentes (alunos < 18 anos) — art. 14
  - [ ] Perfilamento / indicador de risco de evasão — `APO-RISCO` (art. 20)
  - [ ] Correção assistida por IA e moderação de imagens (possível transferência internacional) — `NOT-AVALIACOES`, `SEG-UPLOADS`
  - [ ] Dados socioeconômicos (renda familiar para bolsas) — `APO-BOLSAS`
  - [ ] Ocorrências disciplinares — `APO-OCORRENCIAS`
  - [ ] Larga escala de titulares: [nº de alunos/candidatos/egressos]

## 2. Natureza, escopo, contexto e finalidade
| Item | Preencher |
|---|---|
| Categorias de titulares | alunos, candidatos, egressos, responsáveis, docentes, colaboradores, fornecedores |
| Categorias de dados | identificação, contato, acadêmicos, financeiros, saúde/deficiência (sensível), socioeconômicos, imagens |
| Volume e frequência | [nº de registros; atualização contínua] |
| Origem dos dados | titular, responsável legal, órgãos reguladores, sistemas integrados |
| Finalidades | ver ROPA (matrícula, histórico, cobrança, apoio, comunicação, regulatório…) |
| Retenção | ver ROPA e **Central LGPD → Retenção** (política com dry-run) |
| Exceção do art. 16 | histórico escolar, diplomas, notas, frequência e registros fiscais **não são eliminados** a pedido |

## 3. Necessidade e proporcionalidade
Para cada atividade de alto risco, responda: (a) há base legal adequada (art. 7º / art. 11)? (b) os dados são **o mínimo necessário** (art. 6º, III)? (c) o titular é informado de forma clara (Política de Privacidade, Portal do Titular)? (d) há como exercer os direitos do art. 18 em 15 dias? (e) há controle sobre operadores?

| Atividade | Base legal | Minimização | Transparência | Direitos | Observações |
|---|---|---|---|---|---|
| [ex.: APO-ATENDIMENTO] | Tutela da saúde / consentimento destacado | relato restrito à equipe; acesso registrado | Política §7 | Portal do Titular | [..] |

## 4. Identificação e avaliação de riscos
Escala sugerida: **Probabilidade** (1 baixa – 3 alta) × **Impacto** (1 baixo – 3 alto) = **Nível** (1–2 baixo; 3–4 médio; 6–9 alto).

| # | Risco ao titular | P | I | Nível | Origem |
|---|---|---|---|---|---|
| R1 | Acesso indevido a relatos de atendimento psicológico/social | 2 | 3 | 6 | falha de permissão / abuso interno |
| R2 | Vazamento de planilhas com CPF e notas | 2 | 3 | 6 | exportação e envio por e-mail |
| R3 | Discriminação por perfil de risco de evasão | 2 | 2 | 4 | indicador usado como decisão única |
| R4 | Retenção excessiva de dados de candidatos e mensagens | 3 | 1 | 3 | ausência de expurgo |
| R5 | Tratamento de dados de menores sem consentimento do responsável | 2 | 3 | 6 | cadastro sem coleta do responsável |
| R6 | Transferência internacional sem salvaguardas (IA, mensageria) | 2 | 2 | 4 | contratos de terceiros |
| R7 | Resposta fora do prazo ou entrega de dados a terceiro que se passa pelo titular | 2 | 3 | 6 | fluxo sem verificação de identidade |
| R8 | Indisponibilidade/perda de dados | 1 | 3 | 3 | falha de infraestrutura |
| R9 | Incidente não comunicado no prazo de 3 dias úteis | 2 | 3 | 6 | detecção tardia |

## 5. Medidas para tratar os riscos
| Risco | Medida (existente no sistema → **negrito**; a implementar → [ ]) | Responsável | Prazo | Risco residual |
|---|---|---|---|---|
| R1 | **Perfis de acesso por papel; log "quem viu o quê" (LgpAcessoSensivel); 2FA obrigatório por papel (`REQUIRE_2FA_ROLES`); campos sensíveis marcados** · [revisão trimestral de acessos] | [ ] | [ ] | baixo |
| R2 | **Varredura de uploads; mascaramento de CPF em listagens e logs; pacote do titular só após verificação de identidade** · [DLP no e-mail institucional] | [ ] | [ ] | médio |
| R3 | **Indicador apenas aciona atendimento humano; revisão a pedido (art. 20); retenção de 24 meses; teste de legítimo interesse (LIA) registrado no ROPA** | [ ] | [ ] | baixo |
| R4 | **Política de retenção com job (dry-run → execução) e registro do expurgo** · [validar prazos com o jurídico e habilitar `LGPD_RETENCAO_EXECUTAR`] | [ ] | [ ] | baixo |
| R5 | **Consentimento do responsável legal para menores; painel de menores sem responsável** | [ ] | [ ] | baixo |
| R6 | [mapear provedores no exterior; cláusulas-padrão/DPA; avaliar anonimização antes do envio à IA] | [ ] | [ ] | médio |
| R7 | **Protocolo + código; verificação de identidade obrigatória; prazo de 15 dias com alerta; trilha de auditoria** | [ ] | [ ] | baixo |
| R8 | [política de backup e testes de restauração; plano de continuidade] | [ ] | [ ] | médio |
| R9 | **Registro de incidentes com relógio de 3 dias úteis, checklist e alertas**; ver `LGPD-PLANO-INCIDENTES.md` · [treinamento e simulado anual] | [ ] | [ ] | baixo |

## 6. Consulta às partes interessadas
[Registrar consultas: DPO, TI, jurídico, coordenação, representantes de alunos/responsáveis, operadora (WMundi).]

## 7. Conclusão e aprovação
- [ ] Riscos residuais aceitos pela direção · [ ] Plano de ação aprovado · [ ] Revisão agendada
- Parecer do encarregado: [ ]
- Aprovação da direção: [nome, cargo, data, assinatura]
- Revisão jurídica: [advogado(a), OAB, data]

> Guarde este RIPD com o ROPA; a ANPD pode solicitá-lo (art. 38). Atualize sempre que houver novo tratamento de alto risco, novo operador ou incidente relevante.
