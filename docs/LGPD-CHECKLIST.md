# Checklist de adequação à LGPD — EduMaster Pro

> Guia prático de implantação. Marque cada item; o que está **no sistema** indica onde operar. **Nada aqui substitui assessoria jurídica**: todos os textos e prazos são modelos a validar por advogado.

## A. Governança
- [ ] Designar o **encarregado (DPO)** e divulgar nome e contato (Central LGPD → Encarregado; página pública `/portal-titular`)
- [ ] Aprovar política interna de proteção de dados e de segurança da informação
- [ ] Treinar colaboradores (secretaria, apoio, financeiro, TI, docentes) — registrar presença
- [ ] Formalizar contrato/DPA com a WMundi e demais operadores (`LGPD-CONTRATO-DPA-modelo.md`)
- [ ] Mapear suboperadores e transferências internacionais (IA, mensageria, nuvem)

## B. Inventário e bases legais (art. 37)
- [ ] Revisar o ROPA pré-populado e marcar cada atividade como "Ativa" (Central LGPD → Inventário)
- [ ] Confirmar a base legal de cada atividade (dado sensível **não** pode usar legítimo interesse/execução de contrato)
- [ ] Registrar o teste de legítimo interesse (LIA) onde usado (ex.: risco de evasão, ouvidoria)
- [ ] Exportar o CSV do ROPA e arquivá-lo com a data

## C. Transparência
- [ ] Publicar **Política de Privacidade** (`/privacidade?i=<sigla>`) e **Termos de Uso** (`/termos?i=<sigla>`), ajustados pelo jurídico
- [ ] Colocar os links no site, na matrícula, no rodapé de e-mails e nos formulários
- [ ] Confirmar que o **aviso de cookies** aparece, sem opção pré-marcada, e que cookies opcionais só rodam após aceite
- [ ] Publicar os textos de consentimento próprios da instituição, versionados (Consentimentos → Publicar nova versão)

## D. Consentimento
- [ ] Marketing com aceite **separado e opcional**; opt-out sempre respeitado (já integrado à Comunicação)
- [ ] Uso de imagem, compartilhamento com parceiros e dados de saúde com consentimento específico
- [ ] **Menores de 18 anos**: coletar o consentimento do responsável legal; zerar o painel "menores sem responsável"
- [ ] Revisar periodicamente consentimentos revogados e garantir que os tratamentos cessaram

## E. Direitos dos titulares (art. 18)
- [ ] Divulgar o **Portal do Titular**; conferir o recebimento de solicitações na fila
- [ ] Definir quem atende a fila e o procedimento de **verificação de identidade**
- [ ] Responder em até **15 dias**; usar "prorrogar" só com justificativa
- [ ] Treinar o atendimento para negativas fundamentadas (art. 16): **histórico escolar, diplomas, notas, frequência e registros fiscais não são eliminados**
- [ ] Rodar sempre a **simulação (dry-run)** antes de executar anonimização/eliminação

## F. Retenção
- [ ] Validar com o jurídico os prazos de cada política (Central LGPD → Retenção)
- [ ] Manter o job em **dry-run** por pelo menos um ciclo e conferir os números
- [ ] Só então habilitar `LGPD_RETENCAO_EXECUTAR=true` no servidor
- [ ] Confirmar o prazo de guarda de prontuários/atendimentos de profissionais de saúde com o conselho profissional

## G. Dados sensíveis e menores
- [ ] Restringir quem acessa Atendimentos, AEE, Ocorrências e Bolsas ao mínimo necessário
- [ ] Revisar mensalmente "Quem viu o quê" (acessos a dados sensíveis)
- [ ] Marcar campos sensíveis adicionais da instituição (Encarregado e sensíveis → Marcar campo)

## H. Segurança
- [ ] Definir `SECURITY_ENC_KEY`, `LGPD_HASH_KEY` e `JWT_SECRET` fortes em produção
- [ ] Exigir 2FA para papéis administrativos (`REQUIRE_2FA_ROLES`)
- [ ] Configurar antivírus (ClamAV) e allowlist de origens
- [ ] Confirmar que logs não registram senha, token ou CPF completo (redação ativa por padrão)
- [ ] Backups testados e plano de continuidade

## I. Incidentes (art. 48)
- [ ] Aprovar e divulgar o `LGPD-PLANO-INCIDENTES.md`; saber onde registrar (Central LGPD → Incidentes)
- [ ] Fazer um simulado e medir o tempo até registrar a **ciência** (o prazo de **3 dias úteis** corre dela)
- [ ] Ter o contato da ANPD e o modelo de comunicação aos titulares à mão

## J. Avaliação de impacto
- [ ] Elaborar o RIPD (`LGPD-RIPD-modelo.md`) para dados sensíveis, menores e perfilamento
- [ ] Revisar o RIPD a cada 12 meses ou após mudança relevante

## K. Rotina contínua
| Frequência | Ação |
|---|---|
| Diária | fila de solicitações; alertas de prazo; incidentes |
| Mensal | acessos sensíveis; consentimentos revogados; resultados do dry-run de retenção |
| Trimestral | revisão de permissões; atividades novas no ROPA; menores sem responsável |
| Anual | revisão de política, termos, RIPD, DPA, treinamento e simulado de incidente |

## Limites (leia)
O sistema ajuda a **cumprir** e a **comprovar** a LGPD, mas conformidade depende de processos, pessoas e decisões jurídicas da instituição. O cálculo de dias úteis considera feriados nacionais (não locais). A identificação de pessoas para exportação/anonimização usa os vínculos existentes (aluno, candidato, egresso, conta); dados soltos em campos livres ou anexos podem não ser localizados automaticamente. Atividades com tabelas não classificadas aparecem como "mantidas" até o encarregado decidir.
