# ROPA — Registro das Operações de Tratamento de Dados Pessoais (Vendeu)

> MINUTA — aguardando aprovação do Robson e revisão da Dra. Roberta antes de entrar em vigor.

Documento interno (LGPD, art. 37). Versão 2026-10-26.

| Item | Informação |
|---|---|
| Controlador | [RAZÃO SOCIAL DA OPERADORA] — CNPJ [CNPJ] — [ENDEREÇO] |
| Encarregado(a) | [ENCARREGADO(A) PELO TRATAMENTO DE DADOS] — privacidade@vendeu.app |
| Suboperadores | Vercel (hospedagem); Supabase (banco de dados); **Mercado Pago** (pagamento do pedido, retenção, repasse, devolução, conta do vendedor e taxa de retirada); provedores de e-mail/SMS (a definir) |
| Revisão | A cada 12 meses ou em mudança relevante |

## Operações de tratamento

| # | Operação / finalidade | Titulares | Dados | Base legal | Retenção | Compartilhamento |
|---|---|---|---|---|---|---|
| 1 | Cadastro de comprador | Compradores | Nome, e-mail e telefone (verificados), CPF (opcional), senha (*hash* bcrypt) | Execução de contrato (art. 7º, V) | Enquanto a conta existir | Hospedagem e banco (suboperadores) |
| 2 | Cadastro de anunciante | Anunciantes | Nome completo, CPF/CNPJ, nascimento, e-mail, telefone, endereço com CEP | Execução de contrato; legítimo interesse (verificação) | Enquanto a conta existir; dados fiscais 5 anos | Suboperadores |
| 3 | Verificação de identidade | Anunciantes | Foto de RG/CNH (frente e verso), selfie com documento, comprovante de endereço, cartão CNPJ | Legítimo interesse (art. 7º, IX); selfie: art. 11, II, "g" | Cifrados (AES-256-GCM); eliminados com a conta [prazo a confirmar] | Suboperadores (cifrado); autoridades mediante ordem |
| 4 | Verificação por código de e-mail e telefone | Todos os usuários | E-mail, telefone, código | Execução de contrato; legítimo interesse | Código: curto prazo; contato: enquanto a conta existir | Provedor de e-mail/SMS |
| 5 | Publicação de anúncios | Anunciantes | Título, descrição, preço, fotos (sem metadados), origem do bem, placa, matrícula | Execução de contrato | Enquanto a conta existir; anúncio encerrado: 5 anos (prova) | Suboperadores; público (conteúdo do anúncio) |
| 6 | Declaração de origem por anúncio e aceite de termos | Anunciantes, compradores (aceite de termos) | Texto aceito (*hash*), nome digitado, IP, data/hora, versão | Execução de contrato; exercício regular de direitos | 5 anos | Autoridades mediante ordem |
| 7 | **Registro de origem** (cadastro, login, criação/publicação de anúncio, mensagem, denúncia, verificação, ações do pedido) | Todos os usuários | IP e cadeia de proxies, e-mail, telefone, *user-agent*, idioma, *hash* de dispositivo, data/hora, ação | Legítimo interesse (art. 7º, IX); obrigação legal (Marco Civil, art. 15); exercício regular de direitos | 5 anos (configurável); mínimo legal 6 meses | Autoridades mediante ordem/requisição |
| 8 | Mensagens entre comprador e vendedor, com **ocultação** de telefone, e-mail, links e @usuário | Compradores, vendedores | Conteúdo das mensagens (já com contatos ocultados), marcação de ocultação/alerta, data/hora | Execução de contrato; legítimo interesse (ocultação) | Enquanto a conta existir; anonimizadas na eliminação | Suboperadores; moderação (em denúncia ou disputa); autoridades mediante ordem |
| 9 | Alertas automáticos de golpe nas mensagens | Compradores, anunciantes | Trechos que casam com padrões (pagamento antecipado, pedido de código, link externo, conversa fora da plataforma) | Legítimo interesse (prevenção à fraude) | Junto da mensagem | Sem compartilhamento |
| 10 | Triagem de palavras proibidas e de risco e detecção de foto repetida | Anunciantes | Texto e fotos do anúncio, *hash* de imagem | Legítimo interesse | Enquanto o anúncio existir; *hash* 5 anos | Sem compartilhamento |
| 11 | Denúncias e moderação | Denunciantes, anunciantes | Denúncia, motivo, decisão, anúncio | Exercício regular de direitos; legítimo interesse; execução de contrato | 5 anos | Autoridades mediante ordem |
| 12 | Retirada de anúncio e taxa de retirada (R$ 10,00) | Vendedores | Anúncio, valor da taxa, prazo, situação do pagamento, ID do Mercado Pago | Execução de contrato; obrigação legal (fiscal) | 5 anos | Mercado Pago; contabilidade; Fisco |
| 13 | Emissão de recibo e documento fiscal (comissão e taxa de retirada) | Vendedores | Nome, CPF/CNPJ, endereço, valor, nº do recibo | Obrigação legal (art. 7º, II) | 5 anos | Contabilidade; autoridades fiscais |
| 14 | Bloqueio e suspensão de contas | Anunciantes, compradores | Registros do caso, motivo, decisão | Exercício regular de direitos; legítimo interesse | 5 anos | Autoridades mediante ordem |
| 15 | Atendimento a autoridades | Titulares investigados | Dados de origem, cadastro e anúncios solicitados | Obrigação legal (art. 7º, II); exercício regular de direitos | 5 anos (registro do atendimento) | Autoridade requisitante |
| 16 | Atendimento a direitos do titular | Titulares | Dados do pedido, comprovação de identidade, resposta | Obrigação legal (art. 7º, II) | 5 anos | Sem compartilhamento |
| 17 | Segurança da informação e logs de auditoria de acesso a documentos | Equipe, titulares | ID do agente, data/hora, ação, documento acessado | Legítimo interesse; obrigação legal (segurança) | 5 anos | Sem compartilhamento |
| 18 | Suporte | Todos os usuários | E-mail, descrição do problema, anexos | Execução de contrato | 5 anos | Sem compartilhamento |
| 19 | Cookies essenciais (sessão, CSRF, preferências) | Todos os usuários | Identificador de sessão, token CSRF | Execução de contrato; legítimo interesse (segurança) | Sessão / até 12 meses | Sem compartilhamento |
| 20 | Comunicações de serviço (avisos de pedido, prazos, recebimento, devolução) | Todos os usuários | E-mail, telefone, tipo de aviso | Execução de contrato | Junto do cadastro | Provedor de e-mail/SMS |
| 21 | **Pedido e proposta** (preço cheio ou proposta, reserva do anúncio, prazos de 48 h, 24 h, 5 dias, 10 dias e 7 dias) | Compradores, vendedores | Anúncio, valores, comissão, forma de entrega, situação, datas, nº do recibo | Execução de contrato; obrigação legal (fiscal) | 5 anos | Mercado Pago; contabilidade; Fisco |
| 22 | **Histórico do pedido** (trilha de eventos) | Compradores, vendedores, moderação | Evento, data/hora, autor, observação (rastreio, motivo de devolução ou de disputa, justificativa da moderação) | Execução de contrato; exercício regular de direitos | 5 anos | Autoridades mediante ordem |
| 23 | **Endereço de entrega** | Compradores | Endereço informado no pedido com envio (**cifrado**) | Execução de contrato | Apagado no repasse, na devolução ou no cancelamento após o pagamento, e na eliminação da conta do comprador [confirmar apagamento em pedido expirado ou recusado] | Vendedor (até o recebimento); suboperadores (cifrado) |
| 24 | **Pagamento retido, repasse e devolução** | Compradores, vendedores | Identificador do pagamento, valor, situação (retido, liberado, devolvido), identificador do repasse e da devolução. Sem dados de cartão ou bancários | Execução de contrato; obrigação legal | 5 anos | **Mercado Pago**; contabilidade; Fisco |
| 25 | **Código de retirada em mãos** | Compradores, vendedores | Código de 6 dígitos derivado do pedido, número de tentativas | Execução de contrato; legítimo interesse (segurança) | Junto do pedido (5 anos) | Sem compartilhamento |
| 26 | **Contato liberado após o recebimento** | Compradores, vendedores | Nome, telefone e e-mail do outro lado, na tela do pedido | Execução de contrato; exercício regular de direitos | Conforme o cadastro; não copiado para outros sistemas | Comprador e vendedor do pedido |
| 27 | **Conexão da conta Mercado Pago do vendedor (OAuth)** | Vendedores | Identificador da conta, *tokens* de acesso e renovação (**cifrados**), hash e versão do texto de autorização, IP, navegador, data | Execução de contrato | *Tokens*: até a desconexão ou eliminação da conta; identificador e registro da autorização: 5 anos | **Mercado Pago** |
| 28 | **Disputas** (abertura, provas, decisão) | Compradores, vendedores | Motivo, texto, anexos (fotos, prints), rastreio, mensagens, decisão e justificativa da moderação, quem decidiu | Execução de contrato; exercício regular de direitos; legítimo interesse | 5 anos | Mercado Pago (instrução de liberação ou devolução); autoridades mediante ordem |
| 29 | **Devolução** (pedido, motivo, confirmação) | Compradores, vendedores | Motivo, datas, confirmação de retorno | Execução de contrato | 5 anos | Mercado Pago (devolução do valor) |

## Transferência internacional

Suboperadores de hospedagem e banco podem manter dados fora do Brasil. Medidas: contratos com cláusulas de proteção e, quando exigido, cláusulas-padrão da ANPD. Conferir regiões dos servidores (pendência P-02 do RIPD).

## Medidas de segurança

Endereço de entrega e *tokens* da conta Mercado Pago cifrados; senhas com bcrypt; bloqueio por tentativas; CSRF; cookies *httpOnly*; fotos regravadas sem metadados/GPS; documentos cifrados (AES-256-GCM); acesso de moderação com log de auditoria; registro de origem imutável; plano de resposta a incidentes (RESPOSTA-A-INCIDENTES.md).

## Controle de alterações

| Data | Alteração | Responsável |
|---|---|---|
| 2026-10-25 | Versão inicial (minuta) | |
| 2026-10-26 | Novo modelo de negócio: pedido, pagamento retido no Mercado Pago, endereço de entrega, contato liberado após o recebimento, conta Mercado Pago (OAuth), disputas e devoluções; fim da taxa de sucesso cobrada do vendedor (agora comissão descontada do repasse) | |
