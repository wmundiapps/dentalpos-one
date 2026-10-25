# Política de Privacidade
<!-- versao: 2026-10-26 -->
> MINUTA — aguardando aprovação do Robson e revisão da Dra. Roberta antes de entrar em vigor.

Versão 2026-10-26

## 1. Quem somos

1.1. Esta Política explica como a **[RAZÃO SOCIAL DA OPERADORA]**, CNPJ **[CNPJ]**, com sede em **[ENDEREÇO]** (a "Operadora"), trata dados pessoais no Vendeu, como **controladora**, conforme a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).

1.2. **Encarregado(a) pelo tratamento de dados:** **[ENCARREGADO(A) PELO TRATAMENTO DE DADOS]** — privacidade@vendeu.app. Suporte geral: suporte@vendeu.app.

1.3. Ela vale para vendedores, compradores, interessados em locação e visitantes do Vendeu. O uso do Vendeu **não é permitido a menores de 18 anos**; não coletamos dados de menores de forma intencional e eliminaremos qualquer cadastro assim identificado.

## 2. Quais dados coletamos

| Categoria | Exemplos | Origem |
|---|---|---|
| Cadastro de compradores | Nome, e-mail e telefone (verificados por código), CPF (opcional), senha (guardada só como *hash*) | Titular |
| Cadastro de vendedores | Nome completo, CPF ou CNPJ, data de nascimento, e-mail e telefone verificados, endereço com CEP | Titular |
| Verificação de identidade | Foto do RG ou CNH (frente e verso), selfie com o documento, comprovante de endereço, cartão CNPJ (empresas) | Titular |
| Anúncios | Título, descrição, categoria, preço, fotos, origem do bem, placa, matrícula, localização aproximada | Vendedor |
| Declarações e aceites | Texto aceito (com *hash*), nome digitado, IP, data e hora, versão | Titular e Vendeu |
| **Pedidos** | Anúncio, valor combinado, proposta, comissão, forma de entrega (envio ou retirada), código de rastreio, situação do pedido, prazos, recibo | Comprador, vendedor e Vendeu |
| **Histórico do pedido** | Cada etapa do pedido com data, hora e autor (proposta, pagamento, envio, recebimento, devolução, disputa, repasse), motivos informados de devolução e de disputa | Comprador, vendedor, moderação |
| **Endereço de entrega** | Endereço informado pelo comprador no pedido com envio. **Guardado cifrado** | Comprador |
| **Pagamento do pedido** | Identificador do pagamento no Mercado Pago, valor, situação (retido, liberado, devolvido). **Não recebemos nem guardamos número de cartão, CVV ou dados bancários** | Mercado Pago |
| **Conta Mercado Pago do vendedor** | Identificador da conta e *tokens* de acesso (**cifrados**) obtidos pela conexão por OAuth, data da conexão, IP e navegador da autorização. **Não vemos a senha nem os dados bancários** | Vendedor e Mercado Pago |
| **Contato liberado** | Nome, telefone e e-mail do comprador e do vendedor, mostrados um ao outro depois do recebimento | Cadastro |
| Mensagens | Conteúdo das conversas entre comprador e vendedor dentro do Vendeu, **já com telefone, e-mail, links e @usuário ocultados** quando escritos antes do recebimento | Usuários |
| Denúncias e disputas | Anúncio ou pedido, motivo, texto, provas anexadas (fotos, rastreio), decisão da moderação, identificação de quem denunciou | Usuários e moderação |
| Taxa de retirada | Valor, prazo, situação do pagamento, identificador do pagamento no Mercado Pago | Vendedor e Mercado Pago |
| **Registro de origem** | IP (e cadeia de proxies), e-mail, telefone, navegador (*user-agent*), idioma e identificador de dispositivo (*hash*), data e hora, ação realizada | Coleta automática |
| Técnicos e de segurança | Registros de acesso, tentativas de login, alertas de golpe e de palavras de risco | Coleta automática |

2.1. **Dados sensíveis.** A selfie e a foto do documento contêm imagem do rosto. Tratamos a selfie com as proteções reservadas a dado sensível. O Vendeu **não faz reconhecimento facial**, não cria nem guarda modelo biométrico e não consulta bases biométricas [confirmar com a implementação]. Não solicitamos dados de saúde, religião, opinião política ou outros dados sensíveis; evite incluí-los em mensagens, anúncios e provas de disputa.

2.2. **Contatos.** O telefone e o e-mail do vendedor **não são exibidos** no anúncio. Antes do recebimento, a conversa ocorre pelas mensagens do Vendeu, com **ocultação automática** de telefone, e-mail, links e @usuário. Depois do recebimento, os contatos são liberados (cláusula 5.3).

2.3. **Fotos.** As fotos enviadas são regravadas no servidor, sem metadados (como localização GPS).

2.4. **Pagamento.** O pagamento do pedido é feito na tela do **Mercado Pago**, que trata os dados de pagamento do comprador. O Vendeu recebe apenas a confirmação e o identificador. O vendedor conecta a conta Mercado Pago pelo **login do próprio Mercado Pago (OAuth)**; o Vendeu guarda o identificador da conta e os *tokens* de acesso **cifrados**, para instruir o repasse. Conectar a conta não gera cobrança.

## 3. Para que usamos os dados e em qual base legal

| Finalidade | Base legal (LGPD) |
|---|---|
| Criar e manter a conta; publicar anúncios; permitir mensagens | Execução de contrato (art. 7º, V) |
| Verificar a identidade do vendedor (documentos, selfie, comprovante de endereço, CNPJ) e prevenir fraude, golpes e contas falsas | Legítimo interesse na prevenção à fraude e na segurança (art. 7º, IX); para a selfie, garantia da prevenção à fraude e da segurança do titular em processos de identificação e autenticação de cadastro (art. 11, II, "g") |
| **Processar o pedido**: proposta, pagamento retido, envio ou retirada, recebimento, prazo de devolução, repasse ou devolução do valor | Execução de contrato (art. 7º, V) |
| **Guardar o endereço de entrega** e mostrá-lo ao vendedor para o envio | Execução de contrato (art. 7º, V) |
| **Liberar nome, telefone e e-mail** do comprador ao vendedor e do vendedor ao comprador depois do recebimento, para devolução e garantia | Execução de contrato (art. 7º, V); exercício regular de direitos (art. 7º, VI) |
| **Conectar a conta Mercado Pago do vendedor** (exigida para publicar) e instruir o repasse | Execução de contrato (art. 7º, V) |
| **Ocultar contatos nas mensagens** antes do recebimento e alertar sobre golpes | Legítimo interesse na prevenção à fraude e na segurança do fluxo do pedido (art. 7º, IX); execução de contrato |
| **Analisar disputas e devoluções** e decidir sobre o valor retido | Execução de contrato; exercício regular de direitos (art. 7º, VI); legítimo interesse |
| **Registro de origem** das ações na plataforma, para segurança, prevenção à fraude e identificação de autor de anúncio ilícito | Legítimo interesse (art. 7º, IX); cumprimento de obrigação legal (Marco Civil da Internet, art. 15); exercício regular de direitos (art. 7º, VI); art. 11, II, "g", quando envolver dado sensível |
| Guardar aceites, declarações de origem e provas de manifestação de vontade | Execução de contrato (art. 7º, V); exercício regular de direitos (art. 7º, VI) |
| Triagem automática de palavras proibidas, detecção de fotos repetidas e alertas de golpe nas mensagens | Legítimo interesse (art. 7º, IX) |
| Analisar denúncias, retirar anúncios, bloquear contas | Execução de contrato; exercício regular de direitos; legítimo interesse |
| Descontar a comissão, cobrar e confirmar a taxa de retirada; tratar contestações; emitir recibos e documentos fiscais; guardar pedidos e pagamentos | Execução de contrato (art. 7º, V); cumprimento de obrigação legal (art. 7º, II) |
| Responder a ordens judiciais e requisições legais de autoridades | Cumprimento de obrigação legal ou regulatória (art. 7º, II); exercício regular de direitos (art. 7º, VI) |
| Enviar comunicações de serviço (códigos, avisos de pedido, prazos, avisos de segurança, taxas) | Execução de contrato (art. 7º, V) |
| Suporte e atendimento de pedidos do titular | Execução de contrato; cumprimento de obrigação legal (art. 7º, II) |
| Marketing e novidades, se houver | Consentimento (art. 7º, I), com opção de descadastro |

3.1. O legítimo interesse **nunca** é usado como base para dado pessoal sensível, que segue só as hipóteses do art. 11 da LGPD.

3.2. **Triagem automática.** Sistemas automáticos podem sinalizar anúncios e mensagens (palavras de risco, foto repetida, tentativa de conversa fora da plataforma) e ocultar contatos escritos nas mensagens. Esses sinais **não bloqueiam contas sozinhos de forma definitiva** e **não decidem disputas**: a suspensão ou o bloqueio de conta e a decisão sobre o valor retido passam por revisão de uma pessoa da moderação. O titular pode pedir revisão e informações sobre os critérios (art. 20 da LGPD) em privacidade@vendeu.app.

## 4. Registro de origem

4.1. A cada **cadastro, login, criação ou publicação de anúncio, mensagem, denúncia, envio de verificação e ação relevante do pedido**, o Vendeu registra, de forma que não possa ser alterada: **IP (e a cadeia de proxies), e-mail, telefone, navegador, idioma e identificador do dispositivo (código *hash*)**.

4.2. Finalidades: segurança, prevenção à fraude, defesa de direitos e identificação do responsável por anúncio ou conduta ilícita, quando houver ordem judicial ou requisição legal.

4.3. **Prazo:** 5 anos (configurável) para os registros de origem. Os registros de acesso a aplicações de internet são guardados por, no mínimo, 6 meses, conforme o art. 15 do Marco Civil da Internet.

## 5. Com quem compartilhamos

5.1. **Suboperadores (prestadores que tratam dados em nosso nome):**
- hospedagem: Vercel;
- banco de dados: Supabase;
- **Mercado Pago**: processamento e retenção do pagamento do pedido, repasse ao vendedor, devolução ao comprador, conexão da conta do vendedor e pagamento da taxa de retirada;
- envio de e-mail e SMS: provedores a definir [atualizar quando contratados].

Eles só tratam os dados para prestar o serviço, sob contrato. O Mercado Pago, além de suboperador, é instituição de pagamento independente, com política de privacidade própria. Alguns suboperadores podem armazenar dados fora do Brasil; nesse caso, a transferência observa o Capítulo V da LGPD e as salvaguardas contratuais [confirmar cláusulas e localização dos servidores].

5.2. **Autoridades.** Fornecemos dados mediante **ordem judicial ou requisição legal** válida, na medida exigida, conforme nosso procedimento interno de atendimento a autoridades. Podemos comunicar de ofício fatos que a lei obrigue.

5.3. **Entre comprador e vendedor.** Esta é uma transferência feita pelo próprio Vendeu, com regras:
- **Antes do recebimento:** o vendedor vê o primeiro nome do comprador, a forma de entrega e, no pedido com envio, o **endereço de entrega** (só o necessário para enviar). Comprador e vendedor **não veem** o telefone nem o e-mail um do outro.
- **Depois do recebimento** (confirmação do comprador, código de retirada ou 10 dias sem resposta após o envio): o Vendeu mostra a cada um o **nome, telefone e e-mail** do outro, na tela do pedido. **Finalidade:** executar o contrato, em especial combinar a **devolução** dentro dos 7 dias e exercer a **garantia**. **Base legal:** execução de contrato (art. 7º, V) e exercício regular de direitos (art. 7º, VI). O uso dos contatos para outra finalidade (publicidade, assédio, venda de listas) é proibido pelos Termos.
- O **endereço de entrega** deixa de ser mostrado ao vendedor com o recebimento e é **apagado** quando o pedido termina por repasse ou devolução.

5.4. **Outros.** Em caso de reorganização societária, os dados podem ser transferidos ao sucessor, que seguirá esta Política. Não vendemos dados pessoais.

## 6. Por quanto tempo guardamos

| Dado | Prazo |
|---|---|
| Registros de origem | 5 anos (configurável) |
| Registros de acesso a aplicações (Marco Civil, art. 15) | no mínimo 6 meses (cobertos pelo prazo de 5 anos acima) |
| Aceites de termos e declarações por anúncio | 5 anos |
| **Pedidos, histórico do pedido, pagamentos, comissões e taxas** | 5 anos (obrigação fiscal e defesa de direitos), mesmo depois da eliminação da conta, com acesso restrito |
| **Endereço de entrega** | Cifrado; **apagado** quando o pedido termina por repasse ao vendedor, devolução ao comprador ou cancelamento depois do pagamento, e na eliminação da conta do comprador [confirmar com a implementação o apagamento em pedido expirado, recusado ou cancelado antes do pagamento] |
| **Contato liberado** (nome, telefone, e-mail) | Fica no cadastro de cada um, pelo prazo da conta; não é copiado para o pedido além do necessário |
| **Conta Mercado Pago (identificador e *tokens* cifrados)** | Enquanto a conta estiver conectada. Ao desconectar ou eliminar a conta, os *tokens* são apagados; o identificador pode ser mantido nos registros de pedidos e pagamentos (5 anos) |
| Documentos de verificação (documento, selfie, comprovante, cartão CNPJ) | cifrados (AES-256-GCM); eliminados quando a conta é eliminada [ou em prazo menor a definir] |
| Dados de cadastro e anúncios | enquanto a conta existir |
| Mensagens | enquanto a conta existir; anonimizadas quando a conta é eliminada |
| Denúncias, disputas e decisões de moderação | 5 anos |

6.1. Dados que a lei obriga a guardar, ou que sejam necessários para o exercício regular de direitos, são mantidos pelo prazo legal, mesmo depois da eliminação da conta, com acesso restrito.

6.2. A conta **não pode ser eliminada enquanto houver pedido em andamento**.

## 7. Segurança

7.1. Adotamos medidas técnicas e administrativas, entre elas:
- senhas guardadas com *hash* (bcrypt) e bloqueio por tentativas;
- proteção contra CSRF e cookies de sessão *httpOnly*;
- fotos regravadas sem metadados e sem GPS;
- número do cartão, CVV e dados bancários **não passam nem são guardados** pelo Vendeu (ficam no Mercado Pago);
- *tokens* da conta Mercado Pago e endereços de entrega **cifrados**;
- documentos de verificação **cifrados** (AES-256-GCM);
- documentos vistos **somente pela moderação**, com **registro de auditoria de cada acesso**;
- registros de origem que não podem ser alterados;
- controle de acesso por função na equipe.

7.2. Nenhum sistema é totalmente seguro. Se houver incidente de segurança que possa causar risco ou dano relevante, comunicaremos a **ANPD** e os titulares afetados em prazo razoável (como referência interna, **3 dias úteis** do conhecimento do incidente).

## 8. Seus direitos (art. 18 da LGPD)

8.1. Você pode pedir: **confirmação** do tratamento; **acesso**; **correção**; **anonimização**, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade; **portabilidade**; **eliminação** dos dados tratados com consentimento; **informação** sobre com quem compartilhamos; informação sobre a possibilidade de não consentir e suas consequências; e **revogação do consentimento**.

8.2. **No aplicativo** você pode: exportar seus dados em **JSON** (inclusive seus pedidos); fazer pedidos de correção, informação e revogação; e **eliminar sua conta** (com confirmação por senha e sem pedido em andamento).

8.3. Também pode escrever para **privacidade@vendeu.app**. Respondemos em até **15 dias**. Podemos pedir confirmação de identidade para proteger seus dados.

8.4. **Limites.** A eliminação não alcança dados que devemos guardar por lei ou para defesa de direitos (cláusula 6.1), como pedidos e pagamentos. Informaremos o motivo da recusa, quando for o caso. Você também pode reclamar à ANPD (www.gov.br/anpd).

## 9. Cookies

9.1. Usamos **apenas cookies essenciais** (sessão e segurança). **Não usamos cookies de publicidade.** A tela de pagamento do Mercado Pago pode usar identificador antifraude próprio [a confirmar com o Mercado Pago]. Veja a Política de Cookies.

## 10. Links e serviços de terceiros

10.1. O **Mercado Pago** atua como instituição de pagamento independente e suboperador quando você conecta a conta, paga um pedido ou paga uma taxa, e tem política de privacidade própria; leia-a antes de conectar sua conta ou pagar. Links para sites externos também têm regras próprias.

## 11. Alterações

11.1. Esta Política pode ser atualizada. Mudanças relevantes serão avisadas no aplicativo e por e-mail, e a data da versão será atualizada.

## 12. Contato

- Privacidade e direitos do titular: privacidade@vendeu.app
- Suporte: suporte@vendeu.app
- Encarregado(a): [ENCARREGADO(A) PELO TRATAMENTO DE DADOS]
- Controladora: [RAZÃO SOCIAL DA OPERADORA], CNPJ [CNPJ], [ENDEREÇO]
