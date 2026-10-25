# RIPD — Verificação de identidade e Registro de origem (Vendeu)

> MINUTA — aguardando aprovação do Robson e revisão da Dra. Roberta antes de entrar em vigor.

> **DOCUMENTO INTERNO — NÃO PUBLICAR.** Relatório de Impacto à Proteção de Dados Pessoais para uso da Operadora, do(a) Encarregado(a) e da assessoria jurídica, e para apresentação à ANPD quando solicitado.

| Item | Informação |
|---|---|
| Versão | 2026-10-25 (minuta) |
| Controlador | [RAZÃO SOCIAL DA OPERADORA] — CNPJ [CNPJ] — [ENDEREÇO] |
| Produto | Vendeu (nome provisório; vendeu.app) |
| Encarregado(a) | [ENCARREGADO(A) PELO TRATAMENTO DE DADOS] — privacidade@vendeu.app |
| Situação | Aguardando validação do(a) Encarregado(a) e da assessoria jurídica |
| Próxima revisão | Em até 12 meses ou antes, se houver mudança relevante (novo fornecedor, comparação facial, nova finalidade, mudança de prazo) |

## 1. Fundamento e escopo

1.1. Este relatório atende ao art. 5º, XVII, e ao art. 38 da LGPD e ao art. 10, § 3º (legítimo interesse). Há tratamento de dado pessoal sensível (selfie), de documentos de identificação em larga escala e de monitoramento de comportamento (registro de origem); por isso, o RIPD é feito antes do lançamento.

1.2. **Escopo.** Dois tratamentos:
- (A) **Verificação de identidade do anunciante**: RG/CNH (frente e verso), selfie com o documento, comprovante de endereço e cartão CNPJ (empresas);
- (B) **Registro de origem**: IP (e cadeia de proxies), e-mail, telefone, navegador, idioma e identificador de dispositivo (*hash*) a cada cadastro, login, criação/publicação de anúncio, mensagem, denúncia, envio de verificação e encerramento de venda; e as **declarações de origem** por anúncio.

1.3. Fora do escopo (tratados na Política de Privacidade e no ROPA): mensagens, vendas e taxas, cookies essenciais.

## 2. Descrição dos tratamentos

### 2.1. (A) Verificação de identidade

| Etapa | O que acontece |
|---|---|
| 1. Envio | O anunciante envia fotos do documento (frente e verso), selfie com o documento, comprovante de endereço e, se empresa, cartão CNPJ. As imagens são regravadas no servidor, sem metadados (como GPS). |
| 2. Armazenamento | Arquivos **cifrados com AES-256-GCM** antes de gravar. Registro do IP e do navegador do envio. |
| 3. Análise | **Moderação humana** confere a coerência de nome, CPF/CNPJ, data de nascimento e endereço com o cadastro, a legibilidade e sinais de adulteração, e se a selfie mostra a pessoa com o documento. [Se houver apoio automatizado, descrever aqui e no ROPA.] |
| 4. Acesso | Somente a moderação vê os arquivos. **Cada acesso é registrado** (log de auditoria). |
| 5. Resultado | Selo de identidade verificada; permissão de publicar anúncios. |
| 6. Eliminação | Arquivos eliminados quando a conta é eliminada [avaliar prazo menor, p. ex. 90 dias após a decisão]. |

### 2.2. (B) Registro de origem e declarações

| Etapa | O que acontece |
|---|---|
| 1. Coleta | Em cada ação relevante, o servidor registra IP, cadeia de proxies, e-mail, telefone, *user-agent*, idioma e *hash* de dispositivo, com data e hora. |
| 2. Armazenamento | Registro **imutável** (somente inserção). Acesso restrito à moderação, ao(à) Encarregado(a) e ao jurídico. |
| 3. Declaração por anúncio | O anunciante assina o texto de 7 itens com o nome idêntico ao cadastro. Guarda-se o texto (*hash*), nome, IP, data/hora e versão. |
| 4. Uso | Prevenção à fraude; apuração de denúncias; atendimento de ordem judicial/requisição legal (ver ATENDIMENTO-AUTORIDADES.md); defesa em processos. |
| 5. Retenção | Registros de origem: 5 anos (configurável). Aceites e declarações: 5 anos. |

## 3. Natureza dos dados

| Dado | Tratamento | Classificação |
|---|---|---|
| Selfie (imagem do rosto) | A | **Sensível** (art. 5º, II) quando envolve características biométricas; tratada com proteção reforçada. Sem geração de *template* biométrico nem comparação facial automatizada [confirmar] |
| Foto de RG/CNH (inclui foto do rosto, filiação, número do documento) | A | Comum, com proteção equivalente à de sensível |
| CPF/CNPJ, nome, data de nascimento, endereço | A | Comum |
| Comprovante de endereço, cartão CNPJ | A | Comum |
| IP, cadeia de proxies, *user-agent*, idioma, *hash* de dispositivo | B | Comum |
| E-mail e telefone | B | Comum |
| Declaração assinada (nome, IP, data/hora, versão) | B | Comum |
| Logs de acesso aos documentos | A | Comum |

Titulares: anunciantes (pessoas físicas e representantes de empresas) e, no registro de origem, também compradores e interessados. **Não** há tratamento intencional de dados de crianças e adolescentes (idade mínima de 18 anos).

## 4. Finalidades

- Prevenir fraude de identidade, contas falsas, uso de documentos de terceiros e venda de bens de origem ilícita.
- Permitir a identificação do responsável por anúncio ilícito mediante ordem judicial ou requisição legal.
- Cumprir a guarda de registros de acesso (Marco Civil, art. 15).
- Defender direitos da Operadora e dos usuários.

**Não são finalidades:** publicidade, perfilamento comercial, venda de dados, reconhecimento facial para identificar pessoas, treinamento de modelos com dados dos usuários.

## 5. Bases legais

| Tratamento | Base legal |
|---|---|
| Documentos de identificação, comprovante de endereço, cartão CNPJ | Legítimo interesse na prevenção à fraude e na segurança (art. 7º, IX), com teste de balanceamento (seção 7); execução de contrato e procedimentos preliminares (art. 7º, V) |
| Selfie (dado sensível) | Garantia da prevenção à fraude e da segurança do titular, nos processos de identificação e autenticação de cadastro em sistemas eletrônicos (art. 11, II, "g") |
| Registro de origem | Legítimo interesse (art. 7º, IX); cumprimento de obrigação legal (Marco Civil, art. 15); exercício regular de direitos (art. 7º, VI) |
| Declarações e aceites | Execução de contrato; exercício regular de direitos |
| Fornecimento a autoridades | Cumprimento de obrigação legal ou regulatória (art. 7º, II) |

O legítimo interesse não é usado para dado sensível.

## 6. Necessidade e proporcionalidade

| Pergunta | Resposta |
|---|---|
| A coleta é necessária? | Sim. O Vendeu não intermedeia o pagamento nem entrega; a principal barreira contra bens ilícitos e golpes é saber quem é o anunciante e poder identificá-lo. |
| Há meio menos intrusivo? | Foram consideradas verificação só por e-mail/telefone (insuficiente contra contas falsas) e uso de bases oficiais de identidade (exigiria contrato e consulta biométrica, mais intrusivo). A solução escolhida é a de menor biometria possível: sem *template* e sem reconhecimento facial. |
| Minimização | Documentos só de anunciantes (não de compradores). CPF de compradores é opcional. Contatos não aparecem no anúncio. Metadados das fotos são removidos. |
| Retenção | Prazos definidos por finalidade (seção 8 e ROPA). Documentos cifrados e eliminados com a conta. |
| Transparência | Informado nos Termos, na Política de Privacidade, no Termo de Responsabilidade e na declaração por anúncio (item 6). |
| Direitos | Canal privacidade@vendeu.app; exportação JSON; correção; eliminação com limites legais (retenção por obrigação legal). |

## 7. Teste de legítimo interesse (art. 10)

7.1. **Interesse legítimo:** prevenir fraude e receptação em um marketplace sem intermediação de pagamento; proteger compradores; cumprir o dever de identificar autores de conteúdo ilícito quando houver ordem.

7.2. **Necessidade:** descrita na seção 6.

7.3. **Expectativa do titular:** quem anuncia bens para venda em plataforma aberta espera ser identificado; as regras são claras antes do cadastro e em cada anúncio.

7.4. **Impacto sobre o titular:** moderado (documento e selfie são dados delicados), mitigado por cifra, acesso restrito, log de auditoria, eliminação e ausência de reutilização.

7.5. **Conclusão:** o interesse da Operadora e dos usuários prevalece, com as salvaguardas da seção 9.

## 8. Fluxo, compartilhamento e retenção

| Dado | Quem acessa | Compartilhamento | Retenção |
|---|---|---|---|
| Documentos de verificação | Moderação (com log) | Suboperador de hospedagem e banco (cifrados); autoridades mediante ordem | Até a eliminação da conta |
| Registro de origem | Moderação, jurídico, Encarregado(a) | Autoridades mediante ordem/requisição | 5 anos (configurável) |
| Declarações e aceites | Idem | Idem | 5 anos |
| Logs de acesso aos documentos | Encarregado(a), jurídico | Autoridades mediante ordem | 5 anos |

Suboperadores: Vercel (hospedagem), Supabase (banco de dados). Verificar localização dos servidores e cláusulas de transferência internacional (pendência P-02).

## 9. Riscos e medidas

| # | Risco | Prob. | Impacto | Medida | Risco residual |
|---|---|---|---|---|---|
| R1 | Vazamento de documentos/selfie | Média | Alto | Cifra AES-256-GCM; chave fora do banco; acesso só da moderação; log de cada acesso; eliminação com a conta; plano de incidentes | Baixo/Médio |
| R2 | Acesso indevido por funcionário | Média | Alto | Perfis restritos; log de auditoria; revisão periódica dos logs; termo de confidencialidade | Baixo |
| R3 | Uso dos dados para finalidade diversa | Baixa | Alto | Finalidades limitadas e vedadas (seção 4); política interna | Baixo |
| R4 | Retenção excessiva | Média | Médio | Prazos e rotinas de eliminação; revisão anual | Baixo |
| R5 | Fornecimento indevido a terceiros/autoridade sem base | Baixa | Alto | Procedimento de ATENDIMENTO-AUTORIDADES; só com ordem judicial/requisição legal; aprovação do jurídico; registro | Baixo |
| R6 | Falso positivo bloqueia pessoa honesta | Média | Médio | Revisão humana de toda suspensão; canal de contestação | Baixo |
| R7 | Alteração/fraude dos registros de origem | Baixa | Alto | Registro imutável (somente inserção); acesso restrito | Baixo |
| R8 | Uso de documento de terceiro (identidade falsa) | Média | Médio | Conferência de nome, selfie com documento, comprovante de endereço; detecção de padrões | Médio |
| R9 | Vazamento por suboperador | Baixa | Alto | Contratos com cláusulas de proteção; escolha de provedores com certificações | Baixo |
| R10 | Dados de menores | Baixa | Alto | Idade mínima de 18 anos; data de nascimento no cadastro; verificação documental | Baixo |
| R11 | Fotos de anúncios expondo dados de terceiros | Média | Médio | Regras de foto; remoção; regravação sem metadados | Baixo |
| R12 | Mensagens com dados sensíveis dos usuários | Média | Médio | Orientação aos usuários; acesso às mensagens só em denúncia/ordem; anonimização na eliminação | Baixo |

## 10. Direitos dos titulares e transparência

- Informação clara sobre cada coleta antes do envio.
- Pedidos do art. 18: ver CANAL-DO-TITULAR.md, resposta em até 15 dias.
- Revisão humana de decisões que afetem a conta.

## 11. Pendências

| # | Pendência |
|---|---|
| P-01 | Definir se haverá qualquer apoio automatizado na análise da selfie/documento; se sim, atualizar este RIPD, a Política e o ROPA |
| P-02 | Confirmar localização dos servidores (Vercel/Supabase), DPA e cláusulas de transferência internacional |
| P-03 | Definir prazo de retenção dos documentos (com a conta ou prazo menor após a decisão) |
| P-04 | Definir provedores de e-mail/SMS e incluí-los na Política |
| P-05 | Nomear Encarregado(a) e publicar o canal |
| P-06 | Validar o prazo de 5 anos dos registros de origem (proporcionalidade) |
| P-07 | Confirmar com o jurídico o enquadramento do art. 11, II, "g" para a selfie |

## 12. Parecer e aprovação

| Papel | Nome | Data | Parecer |
|---|---|---|---|
| Encarregado(a) | [ENCARREGADO(A) PELO TRATAMENTO DE DADOS] | | |
| Assessoria jurídica | Dra. Roberta | | |
| Responsável pelo produto | Robson | | |
