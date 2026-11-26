# RIPD — Verificação de identidade, documentos profissionais e uso de IA

> **DOCUMENTO INTERNO — NÃO PUBLICAR.** Relatório de Impacto à Proteção de Dados Pessoais elaborado para uso da Operadora, do Encarregado e da assessoria jurídica, e para apresentação à ANPD quando solicitado. Não integra os Termos de Uso nem a Política de Privacidade publicados.

| Item | Informação |
|---|---|
| Versão | 2026-10-12 (minuta para validação) |
| Controlador | Instituto Ravel de Ensino Superior Ltda. — CNPJ 03.162.275/0001-10 — Av. XV de Novembro, 255, Maringá/PR, CEP 87013-230 |
| Produto | SpaceHour (spacehour.com.br / space-hour.com) — operação exclusivamente brasileira |
| Encarregado (DPO) | Robson Ravel de Oliveira — info@wmundi.com |
| Atendimento | support@space-hour.com |
| Situação | Aguardando validação do Encarregado e da assessoria jurídica (seção 15) |
| Próxima revisão | Em até 12 meses ou antes, em caso de mudança relevante (novo fornecedor, novo modelo de IA, comparação facial, nova finalidade) |

## 1. Fundamento e escopo

1.1. **Fundamento.** Este relatório atende ao art. 5º, XVII, e ao art. 38 da LGPD (Lei nº 13.709/2018), ao art. 10, § 3º (legítimo interesse), e às orientações da ANPD sobre Relatório de Impacto à Proteção de Dados Pessoais, considerando os critérios de tratamento de alto risco do Regulamento de aplicação da LGPD para agentes de tratamento de pequeno porte (Resolução CD/ANPD nº 2/2022, art. 4º), em especial: uso de tecnologias emergentes (inteligência artificial), tratamento de dados pessoais sensíveis (imagem facial analisada por IA) e decisões tomadas com base em tratamento automatizado.

1.2. **Escopo.** Três tratamentos interligados:
- (A) **Verificação de identidade**: CPF ou CNPJ, foto do documento de identidade e selfie (`server/src/identity.ts`);
- (B) **Pré-triagem do registro profissional**: dados e documento do conselho ou da ordem profissional (`server/src/verification.ts`);
- (C) **Uso de inteligência artificial** nesses dois processos, por meio da API da Anthropic (modelos Claude).

1.3. Fora do escopo (tratados na Política de Privacidade, sem RIPD específico neste momento): assistente virtual do site e moderação de fotos de Anúncios, que também usam a API da Anthropic. Ver pendência P-12.

## 2. Descrição dos tratamentos

### 2.1. (A) Verificação de identidade

| Etapa | O que acontece |
|---|---|
| 1. Envio | O usuário, logado, envia CPF ou CNPJ, uma foto do documento (JPEG, PNG, WebP ou PDF, até 6 MB) e uma selfie (JPEG, PNG ou WebP, até 6 MB). As imagens são regravadas no servidor (sem metadados, como GPS); PDF com conteúdo ativo é recusado. |
| 2. Validações locais | Dígitos verificadores do CPF/CNPJ; recusa se já houver verificação pendente. |
| 3. Armazenamento | Documento e selfie são **cifrados (AES-256-GCM) antes de gravar** na tabela `identity_verifications`, junto com CPF/CNPJ, tipo, IP e navegador do envio. Situação: `pending`. |
| 4. Consulta de CNPJ | Se for CNPJ, consulta à BrasilAPI (base pública da Receita Federal): situação cadastral, razão social e se o nome do usuário consta do quadro de sócios ou da razão social. Os nomes dos sócios são comparados em memória e **não são gravados**. |
| 5. Análise por IA | O servidor decifra os arquivos em memória e envia documento e selfie, com o nome e o CPF/CNPJ informados, à API da Anthropic. O modelo: (a) diz se a imagem 1 é documento oficial legível; (b) lê nome, CPF e data de nascimento; (c) compara nome e CPF lidos com os informados; (d) aponta sinais de adulteração; (e) **analisa a imagem do rosto na selfie para dizer se é foto real de pessoa tirada na hora** (não foto de documento, de tela ou de outra foto). O *prompt* proíbe comparar rostos ou identificar a pessoa pela aparência; a resposta segue esquema JSON fechado, sem campo de correspondência facial. Cada análise é registrada no log de acesso (`ai_analysis`). |
| 6. Decisão | **Aprovação automática** só se: CPF/CNPJ válido, confiança "alta", documento legível e oficial, sem adulteração, nome confere, CPF confere (quando consta), selfie de pessoa real e, para CNPJ, empresa ativa com o usuário no quadro societário. **Recusa automática** só com confiança "alta" de adulteração ou de que não é documento de identidade. Demais casos: `needs_review` (revisão humana). Sem chave de IA ou em erro, tudo vai para revisão humana. |
| 7. Revisão humana | Administrador vê a fila, abre os arquivos (cada abertura registrada) e decide aprovar ou recusar, com nota. Pode comparar visualmente documento e selfie. |
| 8. Resultado | Selo "identidade verificada" no perfil; CPF/CNPJ gravado na conta quando aprovado. Notificação ao usuário. |
| 9. Eliminação | Arquivos apagados automaticamente 90 dias após a decisão (`IDENTITY_DOC_RETENTION_DAYS`, padrão 90), com registro `deleted` no log. O registro da verificação (CPF/CNPJ, resultado e o JSON da análise) permanece. |

### 2.2. (B) Pré-triagem do registro profissional

| Etapa | O que acontece |
|---|---|
| 1. Envio | Nome completo, conselho/ordem, número, região, categoria do Espaço e documento (JPEG, PNG, WebP, GIF ou PDF, até 8 MB), cifrado (AES-256-GCM) antes de gravar em `license_verifications`. O usuário também pode informar o registro no checkout; nesse caso a Reserva pode seguir "em verificação" e o Anfitrião é avisado para conferir. |
| 2. Análise por IA | Documento e dados enviados à API da Anthropic, com o órgão esperado para a categoria. O modelo verifica se é registro profissional, se nome e número conferem, se o órgão corresponde à profissão, sinais de adulteração e validade. **Pode usar a ferramenta de busca na web** da Anthropic (até 5 buscas) para consultar cadastros públicos dos conselhos, o que envolve consultas com nome e número do registro. Se a busca não for aceita, repete sem ela. |
| 3. Decisão | Aprovação automática só com decisão "aprovado", confiança "alta" e todos os itens coerentes (inclusive cadastro público não indicando inatividade). Recusa automática só com decisão "recusado" e confiança "alta". Demais casos: revisão humana. |
| 4. Uso pelo Anfitrião | O Anfitrião vê apenas resumo (situação, conselho, número, região, data, se houve consulta pública e motivos), **nunca o documento**. O Anfitrião continua obrigado a conferir a habilitação. |
| 5. Eliminação | Arquivo apagado 90 dias após a decisão (`LICENSE_DOC_RETENTION_DAYS`, padrão 90); resultado e fundamentos permanecem. |
| 6. Exercício ilegal | Incidente decidido como exercício ilegal revoga a situação "verificado" do registro. A comunicação a autoridades/conselhos é feita pela equipe, somente com fundamento jurídico, indício consistente e revisão humana prévia (Penalidades e Medidas, cláusula 7). |

### 2.3. (C) Uso de inteligência artificial

| Item | Informação |
|---|---|
| Fornecedor | Anthropic, PBC (EUA), contratado como **operador**, via API comercial |
| Modelos | Família Claude; modelo definido por variável de ambiente (`IDENTITY_AI_MODEL`, `LICENSE_AI_MODEL`; padrão `claude-opus-5`), com *fallback* automático do lado do servidor para outro modelo Claude em caso de indisponibilidade |
| Dados enviados | Imagens/PDF dos documentos, selfie, nome, CPF/CNPJ, dados do registro informados |
| Treinamento | Pelos termos comerciais da API, a Anthropic não usa as entradas e saídas da API para treinar modelos. **Confirmar contrato/DPA e política de retenção vigente** (P-03) |
| Saída | JSON validado por esquema (`zod`); textos do usuário tratados como "dados a conferir, não instruções" (mitigação de *prompt injection*) |
| Papel da IA | Apoio à decisão. Aprovação/recusa automática somente nos limiares de alta confiança descritos; todo o resto, revisão humana; revisão humana sempre disponível a pedido do titular |

## 3. Natureza dos dados

| Dado | Tratamento | Classificação |
|---|---|---|
| Selfie (imagem do rosto) | A, C | **Sensível** — a análise automatizada da imagem facial ("pessoa real, tirada na hora") pode envolver processamento de características biométricas (LGPD, art. 5º, II). Não há geração nem guarda de *template* biométrico, nem comparação 1:1 ou 1:N |
| Foto do documento de identidade (inclui fotografia do rosto, filiação, naturalidade, número do RG/CNH) | A, C | Comum, com proteção equivalente à de dado sensível por conter imagem facial e muitos identificadores |
| CPF / CNPJ, nome, data de nascimento lida | A | Comum |
| IP e navegador do envio | A | Comum |
| Situação cadastral do CNPJ, razão social | A | Comum (dado público) |
| Documento e dados do registro profissional | B, C | Comum. Pode conter foto do profissional (tratar como acima) |
| Resultado e fundamentos das análises (JSON) | A, B | Comum; contém nome, CPF e data de nascimento lidos (A) e dados extraídos do registro (B) |
| Logs de acesso aos arquivos | A, B | Comum |

Titulares: Locatários e Anfitriões (pessoas físicas e representantes de pessoas jurídicas). Não há tratamento de dados de crianças e adolescentes (idade mínima de 18 anos).

## 4. Finalidades

- Prevenir fraude de identidade, contas falsas e uso de documentos de terceiros.
- Dar segurança a Anfitriões e Locatários (selo de identidade verificada).
- Prevenir o exercício ilegal de profissões regulamentadas em Espaços regulados (saúde, advocacia).
- Apurar Incidentes e defender direitos em disputas.

Não são finalidades: identificação de pessoas por reconhecimento facial, *marketing*, perfilamento comportamental, treinamento de modelos.

## 5. Bases legais

| Tratamento | Base legal |
|---|---|
| Selfie e análise da imagem facial (sensível) | Art. 11, II, "g" — garantia da prevenção à fraude e à segurança do titular, nos processos de identificação e autenticação de cadastro em sistemas eletrônicos, resguardados os direitos do art. 9º |
| CPF/CNPJ, dados do documento, consulta ao CNPJ, IP | Art. 7º, V (execução de contrato e procedimentos preliminares) e art. 7º, IX (legítimo interesse na prevenção à fraude, com teste de balanceamento — seção 6) |
| Registro profissional e documento | Art. 7º, V e IX |
| Guarda de resultados e logs após a eliminação dos arquivos | Art. 7º, VI (exercício regular de direitos) e art. 7º, IX |
| Comunicação a autoridades/conselhos | Art. 7º, II (quando houver dever legal), VI ou VII, somente nas condições de Penalidades e Medidas, cláusula 7 |

O legítimo interesse **não** é usado para dados sensíveis.

## 6. Necessidade, proporcionalidade e teste de legítimo interesse

6.1. **Necessidade.** O modelo de negócio coloca desconhecidos em espaços físicos com equipamentos de alto valor e, em saúde, expõe pacientes ao risco de atendimento por pessoa não habilitada. A verificação documental e a pré-triagem de registro são meios adequados e de baixo custo para o titular.

6.2. **Minimização já adotada.** Sem comparação facial nem *template* biométrico; nomes de sócios do CNPJ não são gravados; Anfitrião não vê documentos; arquivos eliminados em 90 dias; aprovação automática só com alta confiança.

6.3. **Alternativas consideradas.** Comparação biométrica com base governamental (por exemplo, Serpro Datavalid) aumentaria a precisão, mas ampliaria o tratamento biométrico; não adotada neste momento. Verificação apenas humana: mais lenta e com mais pessoas acessando imagens.

6.4. **Expectativa do titular e transparência.** Processo descrito na Política de Privacidade (cláusulas 2.1, 3.3 e 3.2), na tela de envio e na resposta ao titular; revisão humana disponível.

6.5. **Pontos em aberto:** obrigatoriedade ou não da verificação para usar a Plataforma (P-01) e minimização do JSON guardado (P-06).

## 7. Compartilhamento e operadores

| Destinatário | Papel | Dados | Local |
|---|---|---|---|
| Anthropic, PBC | Operador (IA) | Imagens, selfie, nome, CPF/CNPJ, dados do registro | EUA |
| Mecanismo de busca usado pela ferramenta de busca da Anthropic | Terceiro, via operador | Termos de busca (nome e número do registro) | A confirmar (P-04) |
| BrasilAPI | Fonte pública/serviço de consulta | Número do CNPJ | A confirmar |
| Provedores de hospedagem e banco de dados | Operadores | Todos os dados armazenados (arquivos cifrados) | A confirmar (P-05) |
| Administradores da Operadora | Pessoal interno | Fila de revisão e arquivos | Brasil |
| Anfitrião | Usuário | Apenas resumo da pré-triagem de registro; nunca documentos ou selfie | — |

## 8. Transferência internacional

Envio à API da Anthropic (EUA) e, eventualmente, a provedores de nuvem fora do Brasil. Base pretendida: art. 33 da LGPD, com cláusulas-padrão contratuais da ANPD (Resolução CD/ANPD nº 19/2024). Ver pendência P-03 e P-05.

## 9. Retenção

| Dado | Prazo | Mecanismo |
|---|---|---|
| Documento e selfie (identidade) | 90 dias após a decisão (aprovada ou recusada) | Rotina `identityJobs`, campo `files_deleted_at`, log `deleted` |
| Documento de registro profissional | 90 dias após a decisão | Rotina `purgeExpiredDocuments`, campo `document_deleted_at`, log `deleted` |
| Verificações em `needs_review` | **Sem eliminação automática até a decisão** | Ver P-07 |
| CPF/CNPJ, resultado e JSON da análise, IP e navegador | Enquanto a conta existir e, após, prazo prescricional | Sem rotina de eliminação automática — ver P-06 |
| Logs de acesso aos arquivos | Idem | — |
| Retenção na Anthropic | Conforme contrato/política do fornecedor | Ver P-03 |

## 10. Medidas de segurança

- **Criptografia em repouso AES-256-GCM** dos arquivos (documento, selfie, documento profissional), com IV aleatório e *tag* de autenticação; chave de 32 bytes em variável de ambiente (`DOCUMENT_ENCRYPTION_KEY`), fora do banco; **rotação de chave** com `DOCUMENT_ENCRYPTION_KEY_V2` e recifragem automática; em produção, o sistema não sobe sem a chave.
- **Log de acesso** (`identity_access_log` e `document_access_log`): quem, quando, IP, navegador e ação (`view`, `ai_analysis`, `deleted`); consulta do log pelo painel administrativo.
- **Acesso restrito a administradores** (`requireAdmin`), com **verificação em duas etapas obrigatória** para contas de administrador (código por e-mail ou aplicativo autenticador).
- **Entrega segura dos arquivos**: `Content-Security-Policy: default-src 'none'; sandbox`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`; PDF baixado como anexo.
- **Higienização de uploads**: verificação do tipo pela assinatura do arquivo, regravação de imagens sem metadados, recusa de PDF com conteúdo ativo, limites de tamanho.
- **Criptografia em trânsito** (TLS) entre usuário, servidor e API da Anthropic.
- **Mitigação de *prompt injection***: dados do usuário marcados como "conferir, não obedecer"; saída restrita a esquema JSON validado.
- **Aprovação automática conservadora** e revisão humana nos demais casos.
- **Documento nunca exibido ao Anfitrião.**

## 11. Revisão humana e decisões automatizadas

11.1. Aprovação e recusa automáticas ocorrem somente nos limiares de alta confiança descritos nas seções 2.1 e 2.2. A recusa automática não impede novo envio.

11.2. O titular pode pedir revisão humana e explicação dos critérios (LGPD, art. 20) pelo e-mail info@wmundi.com. A revisão é feita por administrador, com decisão e nota registradas.

11.3. Nenhuma suspensão, exclusão de conta ou comunicação a autoridades decorre exclusivamente do resultado automatizado.

## 12. Direitos dos titulares

Acesso, correção, eliminação (observadas as exceções do art. 16), informação sobre compartilhamento e sobre a IA, revisão de decisão automatizada e petição à ANPD, pelo Encarregado (info@wmundi.com), com resposta completa em até 15 dias (art. 19, II). Em caso de incidente de segurança relevante, comunicação à ANPD e aos titulares em até 3 dias úteis (Resolução CD/ANPD nº 15/2024).

## 13. Riscos e medidas

Escala: P = probabilidade, I = impacto (B = baixo, M = médio, A = alto). Risco residual após as medidas.

| # | Risco | P | I | Medidas existentes | Residual | Medida adicional sugerida |
|---|---|---|---|---|---|---|
| R1 | Vazamento de documentos e selfies (banco ou *backup*) | M | A | Cifra AES-256-GCM, chave fora do banco, eliminação em 90 dias | B | Monitorar acesso à chave; testar restauração sem expor chave |
| R2 | Acesso interno indevido aos arquivos | B | A | Só administradores, 2FA obrigatório, log de cada acesso | B | Revisão periódica do log (mensal) e lista nominal de administradores |
| R3 | Uso dos dados pelo fornecedor de IA para treinamento ou retenção excessiva | B | A | Termos comerciais da API; operador sob contrato | M | Confirmar DPA e retenção; avaliar retenção zero (P-03) |
| R4 | Erro da IA que recusa ou atrasa verificação legítima (falso negativo) | M | M | Recusa automática só com alta confiança; revisão humana; reenvio | B | Medir taxa de revisões revertidas |
| R5 | Erro da IA que aprova documento falso (falso positivo) | B | A | Aprovação só com todos os itens e alta confiança; Anfitrião confere registro | M | Amostragem humana periódica de aprovações automáticas |
| R6 | Viés na análise de "foto real" (iluminação, tom de pele, deficiência, idade) | M | M | Sem recusa automática por esse critério isolado (vai a revisão humana) | B | Monitorar e documentar casos; P-09 |
| R7 | Tratamento biométrico além do declarado (comparação facial) | B | A | *Prompt* proíbe comparação; esquema sem campo de correspondência; sem *template* | B | Teste periódico de conformidade do *prompt*/saída |
| R8 | *Prompt injection* via texto no documento | M | M | Instrução "conferir, não obedecer"; esquema JSON; aprovação conservadora | B | — |
| R9 | Retenção excessiva (JSON com CPF e data de nascimento; casos em `needs_review`) | A | M | — | M | P-06 e P-07 |
| R10 | Transferência internacional sem instrumento adequado | M | M | — | M | P-03 e P-05 |
| R11 | Comunicação indevida a autoridades/conselhos | B | A | Regra contratual: fundamento jurídico, indício consistente, revisão humana | B | Procedimento interno escrito e registro de cada comunicação (P-10) |
| R12 | Exposição de nome/número de registro a terceiros na busca web | M | B | Dados de registro profissional costumam ser públicos nos conselhos | B | P-04 |
| R13 | Perda ou comprometimento da chave de cifra | B | A | Cópia da chave guardada (CLAUDE.md); rotação disponível | B | Procedimento formal de custódia da chave |
| R14 | Falta de transparência ao titular | B | M | Política de Privacidade cláusulas 2.1, 3.2, 3.3; textos na tela | B | Revisar texto da tela de envio (P-11) |

## 14. Conclusão preliminar

Com as medidas existentes, o risco residual é considerado **aceitável**, condicionado à resolução das pendências marcadas como prioritárias (P-03, P-06, P-07). O tratamento da selfie deve continuar sem comparação facial; qualquer mudança nesse ponto (por exemplo, contratação de serviço de biometria) exige revisão deste RIPD antes da implantação.

## 15. Pendências — confirmar com o Encarregado e a assessoria jurídica

| # | Pendência | Responsável | Prioridade |
|---|---|---|---|
| P-01 | Confirmar se a verificação de identidade é opcional (selo) ou condição para alguma funcionalidade; ajustar necessidade e textos | DPO / produto | Média |
| P-02 | Validar o enquadramento da selfie como dado sensível com base no art. 11, II, "g", e a classificação da foto do documento | Assessoria jurídica | Alta |
| P-03 | Confirmar contrato com a Anthropic: DPA, cláusulas-padrão da ANPD para transferência internacional, não uso para treinamento, prazo de retenção de entradas/saídas e possibilidade de retenção zero | DPO | **Alta** |
| P-04 | Confirmar onde e por quem são executadas as buscas web da pré-triagem de registro; avaliar desativar a busca ou limitar a sites oficiais dos conselhos | DPO / técnico | Média |
| P-05 | Identificar provedores de hospedagem e banco de dados, regiões dos servidores e instrumentos de transferência | Técnico / DPO | Alta |
| P-06 | Definir prazo e rotina de eliminação/minimização do JSON da análise (nome, CPF, data de nascimento lidos), de IP/navegador do envio e dos registros após encerramento da conta; avaliar cifrar o JSON | DPO / técnico | **Alta** |
| P-07 | Criar eliminação automática para verificações paradas em `needs_review` ou `pending` (hoje só apagam após decisão) | Técnico | **Alta** |
| P-08 | Formalizar a guarda além de 90 dias quando houver disputa (hoje não há mecanismo técnico de "retenção legal" que suspenda a eliminação) | DPO / técnico | Média |
| P-09 | Definir amostragem humana periódica das aprovações automáticas e métricas de erro/viés | DPO / operação | Média |
| P-10 | Escrever procedimento interno para comunicação a autoridades e conselhos (quem decide, critérios, registro) | Assessoria jurídica | Média |
| P-11 | Revisar textos da tela de envio de documentos e selfie (aviso de dado sensível, IA, prazo de eliminação, revisão humana) | Produto / DPO | Média |
| P-12 | Avaliar RIPD ou registro próprio para o assistente virtual e a moderação de imagens por IA | DPO | Baixa |
| P-13 | Confirmar se a Operadora se enquadra como agente de pequeno porte (Resolução CD/ANPD nº 2/2022) e efeitos sobre prazos e obrigações | Assessoria jurídica | Baixa |
| P-14 | Registrar este tratamento no Registro das Operações de Tratamento (LGPD, art. 37) | DPO | Média |

## 16. Aprovação

| Função | Nome | Data | Assinatura |
|---|---|---|---|
| Encarregado (DPO) | Robson Ravel de Oliveira | | |
| Assessoria jurídica | | | |
| Responsável técnico | | | |
