# Módulo `analise-docs` (prefixo Adc) — Agente de análise de documentos

Analisa documentos enviados à **Secretaria**, ao **Financeiro** e ao **Jurídico**: extrai campos, confere o checklist por tipo, detecta conflitos e indícios de falsidade, verifica a instituição de origem, sugere equivalência de disciplinas e **sempre** entrega o resultado a uma fila de **revisão humana**.
Montado em `/api/edu/analise-docs` (autenticado). Telas: `frontend/src/edu/analise-docs` e `frontend/src/pages/edu/EduAnaliseDocs.tsx` (menu **"Agente de documentos (IA)"**; atalhos "Analisar com o agente" nas telas de protocolos, contas a pagar, contratos e documentos jurídicos).

## O que é real e o que é simulado (honestidade)
| Parte | Situação |
|---|---|
| Regras (checklist, CPF/CNPJ, datas, carga horária, notas, conflitos entre documentos, equivalência) | **Real**, determinística e explicável |
| Extração de campos | Texto/OCR colado, campos digitados, `text/*` e **PDF com texto não comprimido** (regex). **Não há OCR de imagens/PDF digitalizado** — nesses casos o achado `EXTRACAO_VAZIA` pede digitação manual |
| Sinais de adulteração | Metadados do PDF (Producer/Creator/datas, assinatura `/ByteRange`) + sinais informados (`camposSobrepostos`, `qrConfere`, `assinaturaValida`). É **indício**, não perícia |
| Verificação da instituição (e-MEC / secretarias estaduais) | **SIMULADA** sobre uma base local de **demonstração (cadastro fictício)**. Toda consulta é gravada com `provedor` e `simulada: true` e a UI/laudo avisam isso. O ponto de integração real está pronto (abaixo), mas **não foi testado contra serviço oficial** |
| IA generativa | Opcional e só para redigir o resumo a partir de achados já calculados e mascarados (`services-ai/client.ts`). Sem chave: resumo por regras (`modoAnalise = REGRAS`) |

### Integração real (e-MEC / secretarias estaduais)
`provedores.ts` define `ProvedorInstituicoes` com `consultarIes` e `consultarEscola`. A implementação `ProvedorGatewayReal` chama um **gateway HTTP** configurado por `EMEC_API_URL` e `EMEC_API_TOKEN` (somente servidor; nunca no frontend) e a configuração do tenant `provedor = EMEC`. Contrato esperado (JSON):
`GET {EMEC_API_URL}/ies?codigo=&nome=` e `GET {EMEC_API_URL}/escolas?codigo=&nome=&uf=` → `404` se não existir; senão `{ codigo, nome, sigla?, uf, municipio?, situacao: REGULAR|DESCREDENCIADA|EM_EXTINCAO|SUSPENSA|EM_DILIGENCIA, secretariaEstadual?, cursos?: [{nome, grau?, reconhecido, portaria?}] }`.
Sem as variáveis, a consulta cai no provedor simulado e informa isso no achado e na resposta.

## Modelo de dados (migration `ADC` em `backend/prisma/manual-migrations/20261004_edumaster_pro.sql`)
`AdcCaso` (dossiê) · `AdcDocumento` (campos extraídos **cifrados** em `dadosCif`, resumo mascarado, metadados, checklist, hash SHA-256 do arquivo — o arquivo em si **não é guardado**) · `AdcAchado` · `AdcEquivalenciaSug` · `AdcConsulta` · `AdcInstituicao` (base de demonstração) · `AdcEvento` (histórico) · `AdcConfig` · `AdcContador`.

## Permissões
- Operam: **Secretaria** → `SECRETARY`, `COORDINATOR`, `ADMISSIONS`; **Financeiro** → `FINANCE`; **Jurídico** → `LEGAL`; `ADMIN/OWNER/RECTOR/BOARD` em todos os setores. Cada perfil só vê e cria casos do **seu** setor.
- Dados pessoais por extenso (`GET /casos/:id/campos?motivo=`): `SECRETARY`/`FINANCE`/`LEGAL` do próprio setor e administração, com **motivo obrigatório** e registro em `LgpAcessoSensivel`, no histórico do caso e na auditoria. Demais perfis veem só dados mascarados.
- Decidir caso **crítico**: reitoria/administração ou a **diretoria do setor** (`AdcConfig.diretoria*`, padrão `COORDINATOR`/`FINANCE`/`LEGAL`), por pessoa **diferente** de quem enviou (exceto administração), com justificativa de 20+ caracteres.
- Configuração e base de instituições: somente `ADMIN/OWNER/RECTOR/BOARD`.

## Endpoints (resumo)
`GET /meta` · `GET|PUT /config` · `GET|POST /instituicoes`, `PATCH|DELETE /instituicoes/:id`, `POST /instituicoes/bootstrap`, `GET /instituicoes-consulta` ·
`POST /casos` (cria e analisa) · `POST /casos/de-protocolo` (lê os anexos do protocolo) · `GET /casos` (filtros `fila`, `bloqueado`, `critico`, `atrasados`, `resultado`, `origem`, `q`) · `GET /casos/:id` · `GET /casos/:id/campos` · `GET /casos/:id/laudo` (HTML imprimível, só dados mascarados) ·
`POST /casos/:id/documentos|analisar|atribuir|comentarios|decisao` · `PATCH /casos/:id/documentos/:docId/campos` · `POST /casos/:id/achados/:aid/resolver` · `POST /casos/:id/equivalencias/:eid/decisao` ·
`POST /equivalencias/simular` · `GET /bloqueio?refType=&refId=` · `GET /painel` · `POST /retencao/executar`.

## Regras principais (códigos dos achados)
Conformidade: `CAMPO_OBRIGATORIO_AUSENTE`, `ASSINATURA_QR_AUSENTE`, `CPF_INVALIDO`, `CNPJ_INVALIDO`, `CHAVE_ACESSO_INVALIDA`, `DOCUMENTO_VENCIDO`, `EXTRACAO_VAZIA` · Conflitos: `DATA_FUTURA`, `DATAS_INCOERENTES`, `IDADE_INCOMPATIVEL`, `CARGA_HORARIA_NAO_FECHA`, `NOTA_INVALIDA`, `SITUACAO_INCOERENTE`, `CONFLITO_CPF` (crítico), `CONFLITO_NOME`, `CONFLITO_NASCIMENTO`, `NOME_GRAFIA_DIFERENTE` · Autenticidade: `INDICIO_ADULTERACAO` (1 sinal = média, 2 = alta, ≥3 pontos ou assinatura/QR inválidos = **crítica**) · Instituição: `INSTITUICAO_INEXISTENTE` e `INSTITUICAO_DESCREDENCIADA` (críticas), `INSTITUICAO_SUSPENSA`, `INSTITUICAO_EM_EXTINCAO`, `CURSO_NAO_RECONHECIDO`, `INSTITUICAO_CODIGO_DIVERGENTE`, `UF_DIVERGENTE` · Duplicidade: `DIPLOMA_DUPLICADO` (crítico se for outra pessoa), `ARQUIVO_REAPROVEITADO` · Equivalência: `EQUIV_REPROVACAO`, `EQUIV_PRAZO_VALIDADE`, `EQUIV_PRE_REQUISITO`, `EQUIV_EM_CURSO`, `EQUIV_JA_CURSADA`, `EQUIV_NOTA_ABAIXO_MINIMO`.
Pontuação de risco 0–100 (baixa 3, média 10, alta 25, crítica 60). Resultado: `OK` / `ATENCAO` / `CRITICO`.

## Equivalência de disciplinas
Compara cada disciplina do histórico de origem com a **matriz vigente** do curso (`AcaMatriz` → itens; sem matriz, usa o currículo do núcleo) por nome + ementa (similaridade) e carga horária (`percentualAproveitamento`, padrão 75%, configurável). Reaproveita `AcaEquivalencia` (equivalências já cadastradas), `AcaPreRequisito` e o histórico local do aluno (`montarHistorico` da secretaria). Avisa: reprovação, nota abaixo do mínimo, prazo de validade (`validadeAproveitamentoAnos`), pré-requisito, disciplina já cursada/em curso, carga insuficiente e destino duplicado. A decisão final é do coordenador (`ACEITA`/`REJEITADA`); avisos de gravidade alta exigem justificativa.

## Críticos: aviso e bloqueio
Resultado `CRITICO` (falsidade, instituição inexistente/descredenciada, conflito de identidade, diploma duplicado): **imediatamente** (1) `notify` aos usuários `RECTOR` e da diretoria do setor (fallback `OWNER/ADMIN/BOARD` se não houver reitor), sem dados pessoais na mensagem; (2) lembrete `CRITICO` por papel (aparece na Mesa/Minha mesa e nos indicadores da reitoria); (3) trilha de auditoria + evento no caso; (4) `bloqueado = true`. O bloqueio é aplicado em: conclusão/deferimento de **protocolo** (`secretaria/protocolos.ts`), registro de **diploma** do aluno (`secretaria/diplomas.ts`), ativação de **contrato** (`juridico/ciclo.ts`), pagamento de **conta a pagar** (`financeiro/payable.ts`) e autorização/baixa de **título da tesouraria** (`tesouraria/titulos.ts`) via `bloqueio.ts` (`exigirSemBloqueio`). Só é liberado por **decisão humana registrada**; `REJEITAR` e `SOLICITAR_NOVO_DOCUMENTO` mantêm o processo travado até novo caso favorável. Indeferir/cancelar continua permitido.

## LGPD
Minimização (arquivo não armazenado; só hash e resumo mascarado), campos pessoais cifrados (AES-256-GCM do módulo `seguranca/cripto`), CPF só como HMAC no caso (detecção de duplicidade), log de acesso, retenção configurável (`retencaoDias` após a decisão; job `analise-docs.retencao` e `POST /retencao/executar` apagam `dadosCif` e o nome) e `uploadGuard` global para arquivos.

## Seed e testes
- Seed: `backend/scripts/seeds/analise-docs.ts` → `seedAnaliseDocs(api, ctx)` (≈22 casos: conformes, conflitos, falsos, instituição inexistente/descredenciada, diploma duplicado, equivalências, financeiro e jurídico). Não altera `edu-demo-seed.ts`; para integrar: `['analise-docs', (c) => seedAnaliseDocs(c.api, sCtx(c))]`.
- E2E: `DATABASE_URL=postgresql://usuario:senha@127.0.0.1:5432/banco_local npx tsx scripts/e2e/analise-docs.ts` (≈280 verificações; banco local, sem rede).
