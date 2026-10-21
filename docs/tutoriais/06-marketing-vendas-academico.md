# Tutoriais 06 — Marketing, Vendas, Estoque e Acadêmico (V60 a V96)

Observações para quem vai gravar (não fazem parte da narração):
- Nas telas CRM, Comunicações, Chatbot e IA, Leads, Recall, Disparos locais e Acadêmico, parte do conteúdo é de exemplo ou de "fluxo preparado". Onde isso muda o que o avatar pode prometer, o roteiro avisa e marca "(conferir na tela antes de gravar)".
- O cartão "Parcerias de reposição" do Estoque está na branch claude/parcerias-estoque (arquivos backend/src/services/stockPartnerService.ts e frontend/src/components/StockPartnersCard.tsx). Confirme que ela já foi incorporada à versão que será gravada.
- Perfis do sistema: Gestor, Recepção, Dentista, Auxiliar, Financeiro, Laboratório, Administração e Administrador (vê tudo). Existem ainda perfis de apoio (Marketing, Vendas, Compras, Marketplace, Educacional, Jurídico, RH, Contador) que o gestor pode usar.

---
## V60 — CRM
**Duração sugerida:** 4 a 6 minutos · **Onde fica no sistema:** Menu > Marketing > CRM

### Roteiro para narrar
**Cena 1 — Apresentação.** Olá! Neste vídeo você vai conhecer o CRM do CompletoDonto. CRM é a palavra usada para o controle de quem demonstrou interesse na sua clínica e em que ponto da conversa cada pessoa está. Aqui você acompanha cada interessado, do primeiro contato até a aprovação do tratamento.

**Cena 2 — Os três cartões do alto.** Ao abrir a tela, você vê três cartões. "Leads cadastrados" mostra quantos interessados existem. "Valor do funil" soma o valor estimado de todos que ainda não foram perdidos. "Valor aprovado" soma o que já foi aprovado. Toque num cartão para filtrar o quadro. Toque de novo para voltar a ver tudo.

**Cena 3 — O quadro por etapas.** Logo abaixo está o quadro, com uma coluna para cada etapa: Lead, Contato, Agendado, Consulta, Planejamento, Orçamento, Negociação, Aprovado e Perdido. Cada coluna mostra quantas pessoas estão nela e o valor somado. Se a coluna estiver vazia, aparece "Nenhum lead". Use a barra de rolagem para ver as colunas da direita.

**Cena 4 — Cadastrando um interessado.** Toque no botão "Novo lead", no alto da tela. Preencha o nome, a clínica ou empresa, o e-mail e o WhatsApp. Informe a origem, ou seja, de onde a pessoa veio, como Instagram ou indicação. Coloque o valor estimado do tratamento. Escolha a temperatura: Quente, Morno ou Frio. Quente é quem está pronto para fechar. Por fim, escreva a próxima ação, por exemplo "ligar na terça". Toque em "Salvar lead".

**Cena 5 — Movendo de etapa.** Cada cartão tem o nome, a origem, o valor, a temperatura e a próxima ação. No fim do cartão há o campo "Etapa". Toque nele e escolha a nova etapa. Assim que você muda, o cartão vai para a coluna certa e os valores são recalculados. Se o botão "Atualizar" estiver ao lado, use-o para recarregar a lista.

**Cena 6 — Um único funil.** O funil do CRM é o mesmo usado na tela Loja e Vendas. Não existe um segundo cadastro. O que você cadastra aqui aparece lá.

**Cena 7 — Resumo.** Para fechar: primeiro, cadastre todo interessado como lead. Segundo, mantenha a etapa e a próxima ação sempre atualizadas. Terceiro, use os cartões do alto para ver quanto dinheiro está no funil e quanto já foi aprovado. No próximo vídeo, vamos ver as Comunicações.

### Ficha rápida
- **O que faz:** Mostra, em quadro por etapas, todos os interessados (leads) da clínica, com valor estimado, temperatura e próxima ação.
- **Como aplicar (passo a passo):**
  1. Abra Menu > Marketing > CRM.
  2. Toque em "Novo lead".
  3. Preencha nome, contato, origem, valor estimado, temperatura e próxima ação.
  4. Toque em "Salvar lead".
  5. Quando houver novidade, abra o cartão e mude o campo "Etapa".
  6. Toque nos cartões do alto para filtrar funil ativo ou aprovados.
- **Com que frequência usar:** Todos os dias, por quem cuida da captação de pacientes.
- **Quem tem acesso:** O item aparece para departamentos com acesso ao módulo Marketing (Gestor, Administrador, Marketing e quem o gestor liberar). A Recepção vem só com "ver" Marketing. Os dados do funil vêm do módulo Vendas (permissões "sales.view" para ver e "sales.edit" para criar e mover). Sem a permissão de Vendas, a lista pode não carregar. O gestor libera ou bloqueia em Configurações > Permissões.
- **Com que frequência precisa ser alimentado:** A cada novo contato e a cada mudança de situação, de preferência no mesmo dia.
- **O que acontece se não for alimentado:** O funil fica velho. O "Valor do funil" e o "Valor aprovado" ficam errados. A tela Loja e Vendas, que usa os mesmos leads, mostra oportunidades paradas e perde a conta das "quentes". Não há bloqueio nem aviso vermelho por falta de uso.
- **Onde impacta (interação com outros itens):** Loja e Vendas (usa os mesmos leads), Leads (V63, entrada de novos contatos no CRM), Chatbot e IA (botão "Criar oportunidade"), Central de Marketing.
- **Erros comuns e dicas:** Esquecer de mudar a etapa depois de uma consulta. Deixar a próxima ação em branco. Cadastrar a mesma pessoa duas vezes. Use a temperatura para priorizar a ligação do dia.

### Abas e seções deste item
**Cartões de resumo.** Três cartões clicáveis: Leads cadastrados, Valor do funil e Valor aprovado. Servem de filtro do quadro.

**Botão Novo lead.** Abre a ficha de cadastro (nome, clínica/empresa, e-mail, WhatsApp, origem, valor estimado, temperatura e próxima ação).

**Botão Atualizar.** Recarrega a lista do servidor.

**Quadro de etapas.** Nove colunas: Lead, Contato, Agendado, Consulta, Planejamento, Orçamento, Negociação, Aprovado, Perdido. Mostram quantidade e valor de cada etapa.

**Cartão do lead.** Mostra nome, origem, valor, temperatura, próxima ação e o campo "Etapa" para mover o lead.

### Trilha de vídeos
- **Assistir antes:** V00 Visão geral do CompletoDonto, para entender onde o Marketing se encaixa. V05 Permissões, para saber quem pode ver e mover leads.
- **Assistir depois:** V63 Leads, para ver como novos contatos chegam ao CRM. V80 Loja e Vendas, que usa o mesmo funil.
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item, e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**CRM da clínica: organize seus interessados em um quadro**
Veja como cadastrar interessados, mudar de etapa e acompanhar quanto está no funil. Simples, para quem nunca usou.
#CompletoDonto #CRM #ClinicaOdontologica #GestaoOdontologica #Dentista
---

---
## V61 — Comunicações
**Duração sugerida:** 3 a 5 minutos · **Onde fica no sistema:** Menu > Marketing > Comunicações

### Roteiro para narrar
**Cena 1 — Apresentação.** Olá! Neste vídeo você vai conhecer a Central de Comunicação. É a tela que reúne, num só lugar, o histórico de mensagens da clínica por WhatsApp, SMS, e-mail, Telegram, Instagram e Facebook.

**Cena 2 — Os quatro números.** No alto aparecem quatro cartões: mensagens cadastradas, mensagens agendadas, mensagens entregues ou lidas e campanhas. Eles dão uma foto rápida do que foi enviado.

**Cena 3 — Canais.** Logo abaixo está o quadro "Canais conectados", com um ícone para cada canal e a quantidade de registros de cada um. Atenção: este quadro mostra o histórico por canal. Para ligar um canal de verdade, você usa a tela Canais de Envio, que veremos mais adiante.

**Cena 4 — A lista de mensagens.** Em seguida vem a lista. Cada linha mostra o destinatário, o status, o assunto, o canal, a campanha e a data. O status aparece em cores: verde para entregue ou lida, azul para enviada, amarelo para agendada e vermelho para falhou. Mensagens sem campanha aparecem como "Individual".

**Cena 5 — Botões do rodapé.** No fim da tela há os botões "Criar campanha" e "Programar disparo", e no alto o botão "Nova mensagem". (conferir na tela antes de gravar: nesta versão a lista usa dados de demonstração e esses botões ainda não abrem uma janela de envio. O envio e as campanhas reais são feitos em Disparos locais e na Central de Marketing.)

**Cena 6 — Resumo.** Para lembrar: a Central de Comunicação mostra o histórico por canal. As cores do status dizem se a mensagem chegou. Para enviar de verdade, use Disparos locais e Canais de Envio. No próximo vídeo, vamos ver o Chatbot e IA.

### Ficha rápida
- **O que faz:** Mostra o histórico de mensagens da clínica por canal, com status, campanha e data de envio.
- **Como aplicar (passo a passo):**
  1. Abra Menu > Marketing > Comunicações.
  2. Olhe os quatro cartões para ver o total geral.
  3. Confira no quadro "Canais conectados" quantos registros cada canal tem.
  4. Na lista, procure o paciente e veja o status da mensagem.
  5. Se houver "Falhou" em vermelho, confira o canal em Canais de Envio.
- **Com que frequência usar:** Uma vez por dia ou por semana, para conferir falhas.
- **Quem tem acesso:** Departamentos com acesso ao módulo Marketing (Gestor, Administrador, Marketing; Recepção apenas para ver). O gestor libera ou bloqueia em Configurações > Permissões.
- **Com que frequência precisa ser alimentado:** A tela só mostra o que existe. Não exige digitação.
- **O que acontece se não for alimentado:** A lista fica vazia e os quatro cartões mostram zero. Não há bloqueio nem aviso vermelho.
- **Onde impacta (interação com outros itens):** Canais de Envio (de onde saem as mensagens), Disparos locais, Central de Marketing e Recall e Reativação.
- **Erros comuns e dicas:** Achar que a tela envia mensagens sozinha. Esquecer de configurar o canal antes de esperar entregas. Em contas de demonstração, os registros são de exemplo.

### Abas e seções deste item
**Cartões de resumo.** Mensagens cadastradas, agendadas, entregues ou lidas e campanhas.

**Canais conectados.** Seis quadros (WhatsApp, SMS, E-mail, Telegram, Instagram, Facebook) com a contagem de registros.

**Lista de mensagens.** Destinatário, status colorido, assunto, canal, campanha e data de envio ou agendamento. Em telas pequenas, só destinatário e status aparecem.

**Botões Nova mensagem, Criar campanha e Programar disparo.** Atalhos de ação da tela (conferir na tela antes de gravar o que cada um abre).

### Trilha de vídeos
- **Assistir antes:** V60 CRM, para saber quem são os contatos. 
- **Assistir depois:** V68 Canais de Envio, para ligar os canais. V67 Disparos locais, para criar mensagens.
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item, e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**Central de Comunicação: veja tudo que a clínica enviou**
Entenda o histórico de WhatsApp, SMS e e-mail, as cores de status e onde configurar o envio.
#CompletoDonto #Comunicacao #WhatsAppClinica #ClinicaOdontologica #Dentista
---

---
## V62 — Chatbot e IA
**Duração sugerida:** 3 a 5 minutos · **Onde fica no sistema:** Menu > Marketing > Chatbot e IA (tela "REVAH Chatbot Omnichannel", endereço /revah-chatbot)

### Roteiro para narrar
**Cena 1 — Apresentação.** Olá! Neste vídeo vamos ver o Chatbot e IA. É uma caixa de entrada única, onde as conversas de WhatsApp, Instagram, Facebook, Telegram e voz ficam juntas. Um robô pode atender no começo e uma pessoa da equipe assume quando for preciso.

**Cena 2 — Aviso importante.** No alto da tela há um aviso amarelo. Ele diz que a tela está em modo de homologação, ou seja, em teste. Os canais reais só enviam e recebem depois de configurar as credenciais, o consentimento do paciente, o descadastro, os modelos de mensagem e a validação do provedor. Hoje as conversas que aparecem são de demonstração e nenhuma mensagem real é enviada. (conferir na tela antes de gravar)

**Cena 3 — Lista de conversas.** À esquerda fica a lista "Conversas". Cada linha mostra o contato, o canal e a última mensagem. Toque numa conversa para abri-la.

**Cena 4 — A conversa aberta.** À direita aparece o nome do contato, o canal e se o atendimento é automático ou humano. Abaixo, a última mensagem recebida.

**Cena 5 — Botões de ação.** Há quatro botões. "Assumir atendimento" passa a conversa do robô para uma pessoa. "Criar oportunidade" leva o contato para o CRM. "Sugerir resposta com IA" propõe um texto. "Enviar" manda a resposta que você escreveu no campo "Resposta". O botão Enviar só liga depois que você digita algo.

**Cena 6 — Resumo.** Para guardar: o chatbot reúne todas as conversas num lugar. Você pode assumir o atendimento quando quiser. E toda conversa boa pode virar uma oportunidade no CRM. Antes de usar com pacientes reais, configure os canais. Veja o vídeo seguinte, Leads.

### Ficha rápida
- **O que faz:** Reúne conversas de vários canais, com atendimento automático, transferência para humano e vínculo com o CRM.
- **Como aplicar (passo a passo):**
  1. Abra Menu > Marketing > Chatbot e IA.
  2. Leia o aviso de homologação no topo.
  3. Toque numa conversa na lista da esquerda.
  4. Leia a mensagem e veja se o atendimento é automático ou humano.
  5. Toque em "Assumir atendimento" se quiser responder pessoalmente.
  6. Escreva no campo "Resposta" e toque em "Enviar", ou use "Sugerir resposta com IA".
  7. Se a pessoa tiver interesse, toque em "Criar oportunidade".
- **Com que frequência usar:** Diariamente, quando os canais estiverem ativos.
- **Quem tem acesso:** Esta tela não está ligada a um módulo fixo no controle de menus. Fica liberada para todos, a menos que o departamento já tenha sido configurado em Permissões. Aí o gestor marca ou desmarca o item "Chatbot e IA". No servidor, ver conversas exige "marketing.view" e responder ou assumir exige "marketing.send" (Gestor, Administrador e Marketing).
- **Com que frequência precisa ser alimentado:** As conversas chegam dos canais. Mantenha os Canais de Envio configurados.
- **O que acontece se não for alimentado:** Sem canais ativos, não chegam conversas reais. Mensagens de demonstração não vão para pacientes. Não há bloqueio nem aviso vermelho.
- **Onde impacta (interação com outros itens):** CRM (Criar oportunidade), Canais de Envio, Assistente de IA, Central de Marketing.
- **Erros comuns e dicas:** Achar que a tela já responde pacientes sozinha sem configurar canais. Esquecer o consentimento do paciente (LGPD). Sempre se identifique como assistente virtual quando a IA responder.

### Abas e seções deste item
**Aviso de homologação.** Faixa amarela com as condições para enviar mensagens reais.

**Conversas.** Lista com selos dos canais (WhatsApp, Instagram, Facebook, Telegram, Voz) e as conversas.

**Painel da conversa.** Nome, canal, tipo de atendimento (automático ou humano) e última mensagem.

**Assumir atendimento / Criar oportunidade.** Passam a conversa para humano e levam o contato ao CRM.

**Resposta, Enviar e Sugerir resposta com IA.** Campo de texto e botões para responder. (conferir na tela antes de gravar se os botões já estão ligados aos canais reais)

### Trilha de vídeos
- **Assistir antes:** V68 Canais de Envio, para ligar os canais. V60 CRM, para entender a oportunidade.
- **Assistir depois:** V63 Leads, para captar novos contatos. V24 Assistente de IA, para conhecer a IA do sistema.
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item, e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**Chatbot com IA: todas as conversas em um só lugar**
Conheça a caixa de entrada que reúne WhatsApp, Instagram e mais, com robô, atendimento humano e ligação com o CRM.
#CompletoDonto #Chatbot #IAnaOdontologia #AtendimentoOnline #Dentista
---

---
## V63 — Leads
**Duração sugerida:** 3 a 4 minutos · **Onde fica no sistema:** Menu > Marketing > Leads (tela "REVAH Leads", endereço /revah-leads)

### Roteiro para narrar
**Cena 1 — Apresentação.** Olá! Neste vídeo vamos ver a tela Leads. Ela serve para pedir a captação de novos contatos, sempre com origem, consentimento e entrada no CRM.

**Cena 2 — Aviso.** No topo há um aviso azul. Ele explica que este é um recurso com contrato específico e que a captação real só acontece depois da liberação para a sua clínica.

**Cena 3 — Nova captação.** No quadro "Nova captação", escolha a categoria. As opções são: busca por região e especialidade, base de empresas verificada, redes sociais e campanhas autorizadas, ou arquivo próprio em CSV ou JSON. CSV é uma planilha simples. Depois preencha cidade ou região, segmento ou especialidade, palavra-chave e limite de resultados. Informe a referência da campanha ou do arquivo e, se quiser, uma observação para a equipe.

**Cena 4 — Termo de responsabilidade.** Leia o termo. Nele você declara que é responsável pelo uso ético e legal dos contatos, de acordo com a LGPD, a lei de proteção de dados. Marque a caixa para concordar. Sem marcar, o botão "Solicitar captação" fica desligado.

**Cena 5 — Solicitar.** Toque em "Solicitar captação". Aparece uma mensagem verde confirmando o registro. A equipe então confirma o contrato e libera a extração.

**Cena 6 — Fluxo do lead.** À direita, o quadro "Fluxo do lead" mostra o caminho: Captação, REVAH Leads, CRM, Qualificação, Automação, Atendimento humano e Conversão. Cada lead guarda data de entrada, responsável, etapa, histórico e regras de descadastro antes de qualquer campanha.

**Cena 7 — Resumo.** Em resumo: escolha a categoria e preencha os filtros. Aceite o termo de responsabilidade. Depois acompanhe os contatos no CRM. Próximo vídeo: Recall e Reativação.

### Ficha rápida
- **O que faz:** Registra o pedido de captação de leads (novos contatos) com termo de responsabilidade, para depois entrarem no CRM.
- **Como aplicar (passo a passo):**
  1. Abra Menu > Marketing > Leads.
  2. Escolha a categoria da captação.
  3. Preencha cidade, segmento, palavra-chave e limite de resultados.
  4. Escreva a referência da campanha e uma observação, se precisar.
  5. Marque a caixa do termo de responsabilidade.
  6. Toque em "Solicitar captação".
  7. Acompanhe os contatos no CRM depois da liberação.
- **Com que frequência usar:** Quando a clínica fizer uma campanha de captação.
- **Quem tem acesso:** Esta tela não tem módulo fixo no controle de menus. Fica liberada a todos até o departamento ser configurado em Permissões, quando o gestor marca ou desmarca "Leads". Os dados no servidor usam as permissões de Vendas ("sales.view" e "sales.edit").
- **Com que frequência precisa ser alimentado:** A cada nova campanha de captação.
- **O que acontece se não for alimentado:** Nada trava. Sem captação, o CRM só recebe os leads cadastrados à mão.
- **Onde impacta (interação com outros itens):** CRM (entrada dos leads), Disparos locais e Central de Marketing (campanhas) e Loja e Vendas.
- **Erros comuns e dicas:** Esperar contatos na hora: a extração só acontece depois da liberação do contrato. Enviar mensagens sem consentimento. Respeitar sempre o pedido de descadastro. (conferir na tela antes de gravar se a lista de captações já aparece na tela)

### Abas e seções deste item
**Nova captação.** Formulário com categoria, cidade/região, segmento, palavra-chave, limite, referência e observação, mais o termo de responsabilidade e o botão "Solicitar captação".

**Fluxo do lead.** Sequência visual da jornada do lead, do primeiro contato à conversão.

### Trilha de vídeos
- **Assistir antes:** V60 CRM, para saber para onde os leads vão.
- **Assistir depois:** V65 Recall e Reativação, para reconquistar pacientes. V67 Disparos locais, para criar a mensagem.
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item, e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**Leads: peça a captação de novos contatos com segurança**
Veja o passo a passo, o termo de responsabilidade e como os contatos entram no CRM, respeitando a LGPD.
#CompletoDonto #Leads #LGPD #MarketingOdontologico #Dentista
---

---
## V65 — Recall e Reativação
**Duração sugerida:** 3 a 5 minutos · **Onde fica no sistema:** Menu > Marketing > Recall e Reativação

### Roteiro para narrar
**Cena 1 — Apresentação.** Olá! Neste vídeo vamos ver o Recall e Reativação. Recall é chamar o paciente de volta depois de um tempo, para revisão ou continuação do tratamento. Aqui você acompanha os pacientes depois de 1, 2, 3, 4, 5 e 6 meses e depois de 1 ano.

**Cena 2 — Os quatro cartões.** No alto, quatro cartões: pacientes em acompanhamento, contatos pendentes, retornos agendados e mensagens automáticas.

**Cena 3 — A lista.** A lista mostra, para cada paciente, o nome, o telefone, o código, o status, o tratamento, o período, a data do próximo contato e o profissional. Os status aparecem em cores. Verde é agendado. Azul é mensagem enviada. Amarelo é contato pendente ou programado. Vermelho é sem resposta ou recusado.

**Cena 4 — Como chamar.** Na coluna "Ações" há dois botões: "Ligar" e "WhatsApp". Escolha o jeito que o paciente prefere. Nas telas pequenas, essa coluna fica escondida. Use um computador ou tablet para ver tudo.

**Cena 5 — Botão Novo recall.** No alto, o botão "Novo recall" serve para incluir um acompanhamento. (conferir na tela antes de gravar: nesta versão a lista usa dados de demonstração e os botões ainda não disparam o envio.)

**Cena 6 — Outras ajudas.** Fora desta tela, o sistema também mostra avisos de faltas na Agenda e manda, toda segunda-feira, a lista de pacientes sem agendamento. Veja o vídeo V17 para isso.

**Cena 7 — Resumo.** Para guardar: o recall traz o paciente de volta na hora certa. Dê atenção aos contatos pendentes. Marque o status depois de cada contato. Próximo vídeo: Central de Marketing.

### Ficha rápida
- **O que faz:** Lista pacientes que precisam ser chamados de volta (1 a 6 meses e 1 ano) e mostra a situação de cada contato.
- **Como aplicar (passo a passo):**
  1. Abra Menu > Marketing > Recall e Reativação.
  2. Veja os cartões para saber quantos contatos estão pendentes.
  3. Procure os pacientes com status amarelo ou vermelho.
  4. Toque em "Ligar" ou "WhatsApp".
  5. Registre o resultado e confirme o agendamento na Agenda.
  6. Repita todas as semanas.
- **Com que frequência usar:** Toda semana.
- **Quem tem acesso:** Departamentos com acesso ao módulo Marketing (Gestor, Administrador, Marketing; Recepção vem só com "ver"). O gestor libera ou bloqueia em Configurações > Permissões.
- **Com que frequência precisa ser alimentado:** A cada atendimento concluído e a cada contato feito.
- **O que acontece se não for alimentado:** Os pacientes deixam de ser lembrados e não voltam. Os cartões mostram zero e a taxa de retorno cai nos relatórios. Não há bloqueio automático.
- **Onde impacta (interação com outros itens):** Agenda (retornos agendados e aviso de faltas), Pacientes, Retorno de pacientes (V17), Comunicações e Central de Marketing (mensagens automáticas).
- **Erros comuns e dicas:** Não registrar o resultado do contato. Ligar em horário ruim. Chamar paciente que pediu descadastro. Confirme sempre o telefone na ficha do paciente.

### Abas e seções deste item
**Cartões de resumo.** Pacientes em acompanhamento, contatos pendentes, retornos agendados e mensagens automáticas.

**Lista de recalls.** Paciente, status, tratamento, período, próximo contato, profissional e ações.

**Botões Ligar e WhatsApp.** Atalhos para chamar o paciente.

**Botão Novo recall.** Inclui um novo acompanhamento (conferir na tela antes de gravar).

### Trilha de vídeos
- **Assistir antes:** V14 Pacientes, para manter telefones em dia. V10 Agenda, para marcar o retorno.
- **Assistir depois:** V17 Retorno de pacientes (lista semanal), que complementa o recall. V66 Central de Marketing, que automatiza mensagens.
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item, e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**Recall: traga o paciente de volta na hora certa**
Acompanhe pacientes de 1 mês a 1 ano e saiba quem precisa de contato. Passo a passo simples.
#CompletoDonto #Recall #RetornoDePacientes #ClinicaOdontologica #Dentista
---

---
## V66 — Central de Marketing
**Duração sugerida:** 3 a 5 minutos · **Onde fica no sistema:** Menu > Marketing > Central de Marketing

### Roteiro para narrar
**Cena 1 — Apresentação.** Olá! Neste vídeo vamos conhecer a Central de Marketing. Ela reúne campanhas, conversas, CRM, chatbot com IA e ligações automáticas em um só lugar.

**Cena 2 — Abrindo a central.** Ao entrar, o sistema abre a central dentro da própria tela, já com o seu acesso. Você não precisa digitar outra senha. Se aparecer o botão "Tentar novamente", toque nele.

**Cena 3 — Se ainda não estiver ativa.** Dois avisos podem aparecer. Se a central ainda não foi configurada neste ambiente, fale com o suporte. Se ela não estiver ativa para a sua clínica, a tela explica o que ela faz: lembretes de consulta, recuperação de faltas, acompanhamento de orçamentos, cobranças e recall por WhatsApp, SMS, e-mail e ligação, com atendimento automático por IA.

**Cena 4 — Sincronizar.** Com a central ativa, aparecem dois botões no alto. "Sincronizar agenda e financeiro agora" envia para as automações os dados mais recentes da Agenda e do Financeiro. Ao terminar, uma frase informa quantos eventos foram enviados. Toque quando precisar que uma mudança chegue na hora.

**Cena 5 — Nova aba.** O botão "Abrir em nova aba" abre a central em tela cheia, o que ajuda em telas pequenas.

**Cena 6 — Resumo.** Para guardar: a central automatiza lembretes, recall e cobranças. Sincronize a agenda e o financeiro quando fizer mudanças grandes. Mantenha os canais configurados. Próximo vídeo: Disparos locais.

### Ficha rápida
- **O que faz:** Abre o módulo de campanhas, conversas, CRM, chatbot com IA e ligações automáticas, com os dados de Agenda e Financeiro da clínica.
- **Como aplicar (passo a passo):**
  1. Abra Menu > Marketing > Central de Marketing.
  2. Aguarde a central carregar.
  3. Se houver aviso de que não está ativa, fale com o suporte.
  4. Toque em "Sincronizar agenda e financeiro agora" depois de mudanças importantes.
  5. Use "Abrir em nova aba" para trabalhar em tela cheia.
  6. Crie e acompanhe campanhas dentro da central.
- **Com que frequência usar:** Diariamente, por quem cuida do marketing.
- **Quem tem acesso:** Departamentos com acesso ao módulo Marketing. No servidor, abrir exige "marketing.view" e sincronizar exige "marketing.send" (Gestor, Administrador, Marketing). O gestor libera ou bloqueia em Configurações > Permissões.
- **Com que frequência precisa ser alimentado:** Agenda e financeiro precisam estar sempre em dia, porque alimentam as automações.
- **O que acontece se não for alimentado:** Lembretes e cobranças automáticas saem com dados velhos ou deixam de sair. Pacientes faltam mais e inadimplentes não são avisados.
- **Onde impacta (interação com outros itens):** Agenda, Financeiro (Contas a Receber e Cobranças), Recall e Reativação, Canais de Envio, CRM e Chatbot e IA.
- **Erros comuns e dicas:** Esperar automação sem canais configurados. Esquecer de sincronizar depois de importar dados. Se a tela ficar em branco, tente "Abrir em nova aba".

### Abas e seções deste item
**Tela embutida da central.** Mostra o módulo de marketing dentro do CompletoDonto. As telas internas dela são do módulo e podem mudar (conferir na tela antes de gravar).

**Botão Sincronizar agenda e financeiro agora.** Envia eventos para as automações e mostra quantos foram enviados.

**Botão Abrir em nova aba.** Abre a central fora da moldura.

**Avisos de estado.** Erro com "Tentar novamente", "ainda não configurada" e "não está ativa para esta clínica".

### Trilha de vídeos
- **Assistir antes:** V68 Canais de Envio, para ter os canais prontos. V10 Agenda e V41 Contas a Receber, de onde vêm os dados.
- **Assistir depois:** V67 Disparos locais. V65 Recall e Reativação.
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item, e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**Central de Marketing: lembretes, recall e cobrança no automático**
Veja como abrir a central, sincronizar agenda e financeiro e automatizar o contato com pacientes.
#CompletoDonto #MarketingOdontologico #Automacao #ClinicaOdontologica #Dentista
---

---
## V67 — Disparos locais
**Duração sugerida:** 4 a 6 minutos · **Onde fica no sistema:** Menu > Marketing > Disparos locais (tela "REVAH", endereço /revah)

### Roteiro para narrar
**Cena 1 — Apresentação.** Olá! Neste vídeo vamos ver os Disparos locais. É onde você monta mensagens e campanhas para os pacientes e acompanha a fila de envios automáticos de lembretes e cobranças.

**Cena 2 — Aviso.** O aviso azul do topo diz que o envio é liberado depois que o canal for ativado pela equipe CompletoDonto e que o paciente precisa autorizar o contato, por causa da LGPD.

**Cena 3 — Escolha do canal.** Há cinco quadros: WhatsApp, SMS, E-mail, Telegram e Ligação. Toque no canal que quer usar. O quadro escolhido fica destacado. Todos mostram "Em ativação".

**Cena 4 — Nova automação ou campanha.** Preencha o nome, por exemplo "Lembrete de consulta". Confirme o canal. Em "Público / gatilho" diga quem recebe, como "Pacientes com consulta amanhã". No campo de mensagem, escreva o texto. Você pode usar quatro variáveis, que o sistema troca pelos dados reais: nome, clínica, data e hora. Elas são escritas entre chaves duplas, como {{nome}}.

**Cena 5 — Salvar.** Toque em "Salvar campanha versão 2.0". A campanha entra na lista "Campanhas salvas" com o status "SIMULAÇÃO ALPHA". Isso quer dizer que ainda é um teste e nada é enviado a pacientes. As campanhas ficam guardadas neste navegador, neste aparelho. (conferir na tela antes de gravar)

**Cena 6 — Fila automática.** O quadro "Fila automática (Agenda + Cobrança)" lista os lembretes de consulta, cobranças e recalls programados. Cada item mostra o tipo, o paciente, o canal, a data e a mensagem. Itens pendentes têm o botão "Marcar enviado", para você dar baixa depois de enviar por conta própria. Se não houver nada, aparece "Nenhum envio automático na fila".

**Cena 7 — Resumo.** Para guardar: escolha o canal, escreva a mensagem com as variáveis e salve. Confira a fila e marque o que já foi enviado. Só envie a quem autorizou o contato. Próximo vídeo: Canais de Envio.

### Ficha rápida
- **O que faz:** Monta campanhas e automações de mensagens e mostra a fila de lembretes e cobranças programados a partir da Agenda e do Financeiro.
- **Como aplicar (passo a passo):**
  1. Abra Menu > Marketing > Disparos locais.
  2. Toque no canal desejado.
  3. Preencha nome, público ou gatilho.
  4. Escreva a mensagem usando {{nome}}, {{clinica}}, {{data}} e {{hora}}.
  5. Toque em "Salvar campanha versão 2.0".
  6. Confira a "Fila automática".
  7. Toque em "Marcar enviado" nos itens que já foram enviados.
- **Com que frequência usar:** Sempre que houver campanha nova e, na rotina, uma vez por dia para a fila.
- **Quem tem acesso:** Departamentos com acesso ao módulo Marketing. No servidor, ver exige "marketing.view" e criar ou enviar exige "marketing.send" (Gestor, Administrador, Marketing). O gestor libera ou bloqueia em Configurações > Permissões.
- **Com que frequência precisa ser alimentado:** Os canais precisam estar ativos e a Agenda e o Financeiro em dia, porque a fila nasce deles.
- **O que acontece se não for alimentado:** A fila fica vazia. Pacientes não são lembrados das consultas e as cobranças não saem. Pacientes sem consentimento são bloqueados no envio.
- **Onde impacta (interação com outros itens):** Agenda (lembretes), Contas a Receber e Cobranças (avisos de vencimento), Recall e Reativação, Canais de Envio, Comunicações.
- **Erros comuns e dicas:** Esquecer as chaves entre chaves duplas nas variáveis. Achar que "SIMULAÇÃO ALPHA" já enviou. Limpar os dados do navegador e perder as campanhas salvas. Enviar para quem pediu descadastro.

### Abas e seções deste item
**Quadros de canal.** WhatsApp, SMS, E-mail, Telegram e Ligação. Tocar escolhe o canal da campanha.

**Nova automação / campanha.** Nome, canal, público ou gatilho e mensagem com variáveis. Botão "Salvar campanha versão 2.0".

**Fila automática (Agenda + Cobrança).** Lista de envios programados, com status e botão "Marcar enviado".

**Campanhas salvas.** Lista de campanhas criadas, com canal, público e status.

### Trilha de vídeos
- **Assistir antes:** V68 Canais de Envio, para ter o canal ativo. V10 Agenda, de onde vêm os lembretes.
- **Assistir depois:** V66 Central de Marketing, para automações completas. V43 Cobranças, para entender a fila de cobrança.
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item, e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**Disparos locais: monte campanhas e lembretes para seus pacientes**
Escolha o canal, escreva a mensagem com nome e horário do paciente e acompanhe a fila de envios.
#CompletoDonto #LembreteDeConsulta #WhatsAppClinica #MarketingOdontologico #Dentista
---

---
## V68 — Canais de Envio
**Duração sugerida:** 4 a 6 minutos · **Onde fica no sistema:** Menu > Marketing > Canais de Envio

### Roteiro para narrar
**Cena 1 — Apresentação.** Olá! Neste vídeo você vai aprender a configurar os Canais de Envio. São os caminhos pelos quais a clínica manda confirmações, lembretes e campanhas aos pacientes.

**Cena 2 — Cada clínica, seus canais.** O aviso azul do topo explica que cada clínica usa os próprios canais e que as chaves ficam guardadas com segurança no servidor. Depois de salvas, elas nunca voltam a aparecer na tela.

**Cena 3 — Os cinco canais.** Você vê cinco quadros: WhatsApp, SMS, E-mail, Telegram e Ligação. Cada um mostra o endereço configurado e uma etiqueta: "Ativo" em verde ou "Pendente" em cinza. Abaixo há uma explicação e um aviso sobre o custo.

**Cena 4 — Configurar.** Toque em "Configurar" no canal que quer ligar. Preencha o apelido e o endereço do canal: no WhatsApp, o número com DDD; no e-mail, o endereço remetente; no Telegram, o nome do bot. Depois preencha as chaves pedidas. Peça essas chaves a quem cuida da tecnologia da clínica e nunca as envie por mensagem. Toque em "Salvar". Para atualizar, toque em "Atualizar". Deixe as chaves em branco para manter as atuais.

**Cena 5 — Particularidades.** No WhatsApp, o número precisa ser registrado na plataforma da Meta e não pode estar em uso no WhatsApp comum nem no WhatsApp Business. A Meta cobra as mensagens direto no cartão da clínica. E-mail e Telegram não têm cobrança de mensagens. SMS e Ligação funcionam com pacote de créditos comprado no CompletoDonto: por isso o botão "Configurar" fica desligado e aparece "Comprar créditos".

**Cena 6 — Ajuda e teste.** O botão "Como configurar" abre o Assistente de IA já com a pergunta pronta para aquele canal. Depois de configurar, toque em "Enviar teste", digite o seu próprio número ou e-mail e confirme. Confira o aparelho. Se chegou, o canal está funcionando. O botão de teste só liga quando o canal está ativo.

**Cena 7 — Resumo.** Para guardar: configure o canal com o endereço e as chaves. Envie sempre um teste. Mantenha o canal ativo para lembretes e campanhas funcionarem. Próximo vídeo: Loja e Vendas.

### Ficha rápida
- **O que faz:** Cadastra e testa os canais de envio da clínica (WhatsApp, SMS, e-mail, Telegram e ligação).
- **Como aplicar (passo a passo):**
  1. Abra Menu > Marketing > Canais de Envio.
  2. Toque em "Configurar" no canal.
  3. Preencha apelido, endereço e chaves.
  4. Toque em "Salvar".
  5. Toque em "Enviar teste" e informe o seu contato.
  6. Confirme o recebimento e confira se a etiqueta está "Ativo".
  7. Para SMS e Ligação, toque em "Comprar créditos".
- **Com que frequência usar:** Na implantação e quando trocar de número, chave ou provedor.
- **Quem tem acesso:** Departamentos com acesso ao módulo Marketing. No servidor, ver exige "marketing.view" e salvar exige "marketing.send" (Gestor, Administrador, Marketing). O gestor libera ou bloqueia em Configurações > Permissões.
- **Com que frequência precisa ser alimentado:** Uma vez, e depois quando algo mudar ou a chave vencer.
- **O que acontece se não for alimentado:** O envio não funciona. A Central de Marketing, os Disparos locais e o Chatbot ficam sem canal ("Configure um remetente ativo para este canal"). Lembretes de consulta e cobranças não chegam e as faltas aumentam.
- **Onde impacta (interação com outros itens):** Disparos locais, Central de Marketing, Chatbot e IA, Comunicações, Recall, Agenda (lembretes), Cobranças e Créditos.
- **Erros comuns e dicas:** Usar número já ativo no WhatsApp comum. Colar a chave com espaços. Esquecer o teste. Compartilhar chaves por mensagem. No e-mail, o domínio precisa estar verificado no serviço de envio, ou a mensagem pode cair no spam.

### Abas e seções deste item
**Quadros dos canais.** WhatsApp, SMS, E-mail, Telegram e Ligação, cada um com etiqueta Ativo ou Pendente, nota e aviso de custo.

**Botão Configurar / Atualizar.** Abre a janela de apelido, endereço e chaves. Desligado em SMS e Ligação.

**Botão Comprar créditos.** Aparece em SMS e Ligação e leva à tela de Créditos.

**Botão Como configurar.** Abre o Assistente de IA com a pergunta do canal.

**Botão Enviar teste.** Envia uma mensagem de teste para o seu contato. Só liga com o canal ativo.

### Trilha de vídeos
- **Assistir antes:** V04 Integrações, para entender o que é conectar sistemas. V24 Assistente de IA, usado no botão "Como configurar".
- **Assistir depois:** V67 Disparos locais e V66 Central de Marketing, que usam os canais.
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item, e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**Canais de Envio: configure WhatsApp, e-mail e SMS da clínica**
Passo a passo para ligar os canais, testar e deixar lembretes e campanhas funcionando.
#CompletoDonto #WhatsAppBusiness #ConfiguracaoDoSistema #ClinicaOdontologica #Dentista
---

---
## V80 — Loja e Vendas
**Duração sugerida:** 5 a 7 minutos · **Onde fica no sistema:** Menu > CompletoDonto Sales > Loja e Vendas (tela "CompletoDonto Sales", endereço /sales; abas Oportunidades, Recuperação, Pedidos, Automação, Loja virtual e Fornecedores afiliados)

### Roteiro para narrar
**Cena 1 — Apresentação.** Olá! Neste vídeo vamos conhecer a Loja e Vendas. Esta tela reúne a visão comercial, a loja, os fornecedores e o funil de interessados, usando o mesmo CRM que você já viu.

**Cena 2 — Topo da tela.** No alto, o botão "Novo lead" cadastra um interessado. O aviso azul mostra quantas oportunidades quentes precisam de ação. Em seguida há quatro cartões: pipeline aberto, leads cadastrados, oportunidades quentes e valor fechado. Pipeline é o valor das oportunidades em andamento.

**Cena 3 — Canais e origem.** Um quadro explica que a comunicação fica no REVAH e que a Loja e Vendas só reaproveita os registros, sem criar um funil paralelo.

**Cena 4 — Aba Oportunidades.** Lista todos os leads, com nome, origem, temperatura, etapa, próxima ação e valor. Toque em "Atualizar" para recarregar.

**Cena 5 — Aba Recuperação.** Mostra três fluxos: conversas interrompidas, recall e reativação e reposição prevista. Um aviso lembra que recuperações automáticas só disparam depois de regras, horários e consentimentos configurados. As barras indicam o quanto cada fluxo já está estruturado. (conferir na tela antes de gravar)

**Cena 6 — Aba Pedidos.** Explica o caminho do pedido em três passos: pedido, fiscal e expedição. O texto informa que fiscal e entrega dependem das integrações estarem ativas. (conferir na tela antes de gravar)

**Cena 7 — Aba Automação.** Traz as regras do vendedor digital: a IA se identifica como assistente virtual, limites de preço e desconto são respeitados, dúvidas técnicas vão para um especialista e toda interação relevante atualiza o CRM.

**Cena 8 — Aba Loja virtual.** Aqui você liga ou desliga a "Loja própria habilitada", define o desconto da loja própria e a comissão de afiliados, ambos em porcentagem, e toca em "Salvar configuração". Os valores ficam salvos por clínica.

**Cena 9 — Aba Fornecedores afiliados.** Formulário para cadastrar um fornecedor parceiro: nome ou razão social, CNPJ ou CPF, responsável, e-mail, WhatsApp e link da loja dele. Marque a caixa de aceite das condições e salve.

**Cena 10 — Resumo.** Para guardar: cadastre os interessados e acompanhe as oportunidades quentes. Configure a loja própria na aba Loja virtual. Cadastre fornecedores na aba Fornecedores afiliados. Próximo vídeo: Estoque.

### Ficha rápida
- **O que faz:** Reúne o funil comercial, a configuração da loja da clínica e o cadastro de fornecedores afiliados.
- **Como aplicar (passo a passo):**
  1. Abra Menu > CompletoDonto Sales > Loja e Vendas.
  2. Toque em "Novo lead" para cadastrar um interessado.
  3. Veja os quatro cartões e a aba Oportunidades.
  4. Na aba "Loja virtual", ligue a loja própria, ajuste os percentuais e salve.
  5. Na aba "Fornecedores afiliados", preencha os dados, aceite as condições e salve.
  6. Confira as abas Recuperação, Pedidos e Automação para entender as regras.
- **Com que frequência usar:** Uma vez por semana para acompanhar. A configuração da loja, só quando mudar.
- **Quem tem acesso:** Departamentos com acesso ao módulo Vendas (Gestor, Administrador, Vendas, Compras, Marketplace). No servidor: "sales.view" para ver e "sales.edit" para criar leads, configurar a loja e cadastrar fornecedores. O gestor libera ou bloqueia em Configurações > Permissões.
- **Com que frequência precisa ser alimentado:** Leads a cada novo contato. Loja e fornecedores quando houver mudança.
- **O que acontece se não for alimentado:** Os cartões ficam em zero e o aviso de oportunidades quentes some. A loja própria fica desligada. Sem fornecedores cadastrados, não há para quem direcionar a reposição. Não há bloqueio nem aviso vermelho.
- **Onde impacta (interação com outros itens):** CRM (mesmos leads), Estoque (produtos e reposição), Chatbot e IA, Central de Marketing, Financeiro.
- **Erros comuns e dicas:** Achar que Pedidos e Expedição já funcionam sem integração. Criar o mesmo lead aqui e no CRM (é o mesmo cadastro). Marcar a loja como habilitada sem estar pronta para atender.

### Abas e seções deste item
**Topo e cartões.** Botão "Novo lead", aviso de oportunidades quentes e quatro cartões de resumo.

**Oportunidades.** Lista dos leads com origem, temperatura, etapa, próxima ação e valor.

**Recuperação.** Três fluxos de reconquista, com barra de progresso.

**Pedidos.** Pedido, fiscal e expedição, em três cartões.

**Automação.** Regras do vendedor digital.

**Loja virtual.** Interruptor da loja própria, percentuais e botão "Salvar configuração".

**Fornecedores afiliados.** Formulário de cadastro com aceite das condições.

### Trilha de vídeos
- **Assistir antes:** V60 CRM, pois é o mesmo funil.
- **Assistir depois:** V81 Estoque, que alimenta os produtos. V66 Central de Marketing, que automatiza contatos.
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item, e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**Loja e Vendas: funil, loja própria e fornecedores no mesmo lugar**
Veja as seis abas da tela de vendas e como configurar a loja da clínica.
#CompletoDonto #VendasOdonto #GestaoDeClinica #Fornecedores #Dentista
---

---
## V81 — Estoque
**Duração sugerida:** 5 a 7 minutos · **Onde fica no sistema:** Menu > CompletoDonto Sales > Estoque

### Roteiro para narrar
**Cena 1 — Apresentação.** Olá! Neste vídeo vamos ver o Estoque. É onde a clínica controla os materiais, define o mínimo de cada item e recebe o alerta de reposição antes de faltar.

**Cena 2 — Alerta de reposição.** Se algum item estiver no mínimo ou abaixo, aparece um aviso vermelho dizendo quantos itens precisam de reposição. O alerta é automático, conforme o mínimo que você definiu.

**Cena 3 — Cartões.** Quatro cartões: itens cadastrados, reposição necessária, fornecedores e valor em estoque.

**Cena 4 — Novo item.** Toque em "Novo item". Preencha o código, também chamado de SKU, que é o código do produto, e o nome. Informe a categoria, o fornecedor, a quantidade atual e o estoque mínimo. Escolha a unidade: unidades, caixas, pacotes, frascos, seringas ou kits. Informe o custo unitário. Se o item tem lote e validade, preencha o lote, a validade e a localização, por exemplo "armário 2". Toque em "Salvar".

**Cena 5 — A lista.** Cada linha mostra o nome, o código, a categoria, o fornecedor, a quantidade com a unidade e o mínimo. A etiqueta indica a situação: verde para normal, amarelo para estoque baixo e vermelho para crítico.

**Cena 6 — Entradas e saídas.** No fim da linha há dois botões. "-1 saída" tira uma unidade. "+1 entrada" soma uma unidade. Use depois de usar ou receber material.

**Cena 7 — Reposição.** O botão "Abrir loja e vendas", no fim da tela, leva à Loja e Vendas e só liga quando há item crítico.

**Cena 8 — Parcerias de reposição.** No alto da tela há o cartão "Parcerias de reposição". Aqui o dentista decide se quer ou não que o CompletoDonto avise empresas parceiras quando o estoque ficar baixo. Funciona assim: quando um item chega ao mínimo, o sistema envia um e-mail às empresas parceiras ativas e em dia, para elas oferecerem reposição direto à sua clínica. O aviso leva o nome da clínica, o telefone e o e-mail de contato e os itens com estoque baixo: nome, saldo e mínimo. Nenhum dado de paciente é compartilhado. Por padrão está desligado. Para ligar, toque em "Autorizar avisos a empresas parceiras". O cartão passa a mostrar quem autorizou, a data e quantos avisos foram enviados nos últimos 30 dias. Para desligar, toque em "Revogar autorização", a qualquer momento. Um mesmo item não gera novo aviso para o mesmo parceiro por sete dias. (conferir na tela antes de gravar)

**Cena 9 — Resumo.** Para guardar: cadastre cada item com o mínimo certo. Dê entrada e saída para o saldo ficar real. Decida com calma se autoriza as parcerias de reposição. Próximo vídeo: o módulo Acadêmico.

### Ficha rápida
- **O que faz:** Controla itens, quantidades, mínimos, lotes e validade, avisa quando é hora de repor e permite autorizar avisos a empresas parceiras.
- **Como aplicar (passo a passo):**
  1. Abra Menu > CompletoDonto Sales > Estoque.
  2. Toque em "Novo item" e preencha código, produto, quantidade e estoque mínimo.
  3. Informe fornecedor, custo, lote, validade e localização, se houver.
  4. Toque em "Salvar".
  5. Use "-1 saída" e "+1 entrada" para ajustar o saldo.
  6. Olhe o aviso vermelho e os itens críticos para decidir a compra.
  7. No cartão "Parcerias de reposição", toque em "Autorizar avisos a empresas parceiras" se quiser receber ofertas. Use "Revogar autorização" para desligar.
- **Com que frequência usar:** Diariamente para dar saída e entrada. Conferir a reposição uma vez por semana.
- **Quem tem acesso:** Departamentos com acesso ao módulo Vendas (Gestor, Administrador, Vendas, Compras, Marketplace). No servidor: "sales.view" para ver e "sales.edit" para cadastrar e ajustar. Ver a situação das parcerias exige "sales.view"; autorizar ou revogar exige "settings.edit", ou seja, só Gestor e Administrador. O gestor libera ou bloqueia em Configurações > Permissões.
- **Com que frequência precisa ser alimentado:** A cada uso ou recebimento de material.
- **O que acontece se não for alimentado:** O saldo fica errado. O aviso vermelho de reposição não aparece quando deveria (ou aparece sem necessidade), o "Valor em estoque" fica incorreto e as parcerias não têm o que avisar. Falta de material pode parar atendimentos.
- **Onde impacta (interação com outros itens):** Loja e Vendas (produtos e reposição), Avisos de pendências e Gestão Operacional (alertas de estoque crítico), Financeiro (valor em estoque) e Parcerias de reposição (e-mail às empresas parceiras).
- **Erros comuns e dicas:** Mínimo zero (nunca avisa). Esquecer de dar saída. Cadastrar o mesmo material com códigos diferentes. Lembre que a autorização das parcerias está desligada até você ligar e que é possível revogar a qualquer hora.

### Abas e seções deste item
**Cartão Parcerias de reposição.** Mostra se está autorizado ou desligado, quem autorizou, a data e os avisos dos últimos 30 dias. Botões "Autorizar avisos a empresas parceiras" e "Revogar autorização".

**Aviso de reposição.** Faixa vermelha com a quantidade de itens a repor.

**Cartões de resumo.** Itens cadastrados, reposição necessária, fornecedores e valor em estoque.

**Lista de itens.** Nome, código, categoria, fornecedor, saldo, mínimo, situação e botões "-1 saída" e "+1 entrada".

**Botão Novo item.** Janela com código, produto, categoria, fornecedor, quantidade, mínimo, unidade, custo, lote, validade e localização.

**Botão Abrir loja e vendas.** Leva à tela de vendas quando há item crítico.

### Trilha de vídeos
- **Assistir antes:** V80 Loja e Vendas, que usa o mesmo cadastro de produtos.
- **Assistir depois:** V54 Gestão Operacional, onde aparecem alertas operacionais. V90 Acadêmico: visão geral, o próximo módulo.
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item, e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**Estoque da clínica: nunca mais fique sem material**
Cadastre itens, defina o mínimo, receba o alerta de reposição e escolha se quer avisar empresas parceiras.
#CompletoDonto #EstoqueOdontologico #GestaoDeClinica #Materiais #Dentista
---

---
## V90 — Acadêmico: visão geral
**Duração sugerida:** 3 a 5 minutos · **Onde fica no sistema:** Menu > Acadêmico > Visão geral (tela "CompletoDonto Academy", endereço /academico)

### Roteiro para narrar
**Cena 1 — Apresentação.** Olá! Neste vídeo vamos conhecer o módulo Acadêmico. Ele serve para a clínica ou instituição que oferece cursos e tem alunos. Reúne cursos, professores, turmas, alunos, frequência, documentos e financeiro em um só ambiente.

**Cena 2 — As sete seções.** No alto da tela há uma faixa de botões com as sete seções: Visão geral, Alunos, Cursos, Professores, Turmas, Financeiro acadêmico e Frequência e documentos. A seção aberta fica destacada. Você também chega a cada uma pelo menu lateral, no grupo Acadêmico.

**Cena 3 — Cartões da visão geral.** Na Visão geral há quatro cartões: cursos publicados, alunos matriculados, cursos de parceiros e vendas internacionais.

**Cena 4 — Central acadêmica.** Um quadro explica a jornada do aluno: captação e matrícula, operação acadêmica (cursos, professores, turmas, frequência e documentos) e financeiro integrado (mensalidades, recebimentos e visão por curso e turma). Os fluxos regulatórios avançados ainda estão em etapa de homologação, ou seja, de validação. (conferir na tela antes de gravar)

**Cena 5 — Catálogo.** Mais abaixo está o "Catálogo de cursos". Cada cartão mostra a categoria, o título, a descrição, o professor, a nota, o número de alunos, a duração do teaser, que é um trecho de apresentação, e a duração do curso completo. Há os botões "Ver teaser" e "Ver curso". O botão "Ver todos" abre a seção Cursos. O botão "Cadastrar curso" fica no alto da tela. (conferir na tela antes de gravar: nesta versão o catálogo usa dados de exemplo e os botões ainda não abrem janelas de cadastro.)

**Cena 6 — Resumo.** Para guardar: o Acadêmico organiza a jornada do aluno. Use as sete seções para navegar. Comece pelos cursos e professores. Próximo vídeo: Alunos.

### Ficha rápida
- **O que faz:** Reúne a gestão de cursos e alunos da própria clínica ou instituição, com sete seções e uma visão geral.
- **Como aplicar (passo a passo):**
  1. Abra Menu > Acadêmico > Visão geral.
  2. Veja os quatro cartões.
  3. Leia o quadro da central acadêmica para entender a jornada.
  4. Role até o "Catálogo de cursos".
  5. Use a faixa de botões ou o menu lateral para ir às outras seções.
- **Com que frequência usar:** Semanalmente, por quem coordena os cursos.
- **Quem tem acesso:** Departamentos com acesso ao módulo Documentos (Gestor, Administrador, Administração, RH, Jurídico e Educacional). No servidor, as permissões do módulo são "documents.view" e "documents.edit". O gestor libera ou bloqueia em Configurações > Permissões. Dentista, Auxiliar, Laboratório e Financeiro não vêm com acesso por padrão.
- **Com que frequência precisa ser alimentado:** A cada novo curso, turma ou aluno.
- **O que acontece se não for alimentado:** Os cartões mostram zero e o catálogo fica vazio. Não há bloqueio nem aviso vermelho.
- **Onde impacta (interação com outros itens):** Financeiro (mensalidades), Evidências Operacionais e Documentos (documentos acadêmicos), Equipe e RH (professores).
- **Erros comuns e dicas:** Achar que todas as rotinas já estão ativas: algumas seções são estrutura preparada. Confirmar o que está liberado antes de prometer a alunos.

### Abas e seções deste item
**Faixa de seções.** Sete botões para navegar entre as seções do módulo.

**Cartões de resumo.** Cursos publicados, alunos matriculados, cursos de parceiros e vendas internacionais.

**Central acadêmica integrada.** Três quadros: captação e matrícula, operação acadêmica e financeiro integrado.

**Catálogo de cursos.** Cartões com informações de cada curso e botões "Ver teaser" e "Ver curso".

**Botão Cadastrar curso.** No alto da tela (conferir na tela antes de gravar o que ele abre).

### Trilha de vídeos
- **Assistir antes:** V05 Permissões, para liberar o acesso à equipe.
- **Assistir depois:** V91 Alunos e V92 Cursos, para começar o cadastro.
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item, e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**Módulo Acadêmico: cursos e alunos da sua clínica**
Conheça as sete seções do Acadêmico e a jornada do aluno, da matrícula ao financeiro.
#CompletoDonto #Academico #CursosOdontologia #GestaoDeCursos #Dentista
---

---
## V91 — Alunos
**Duração sugerida:** 2 a 4 minutos · **Onde fica no sistema:** Menu > Acadêmico > Alunos (/academico?secao=alunos)

### Roteiro para narrar
**Cena 1 — Apresentação.** Olá! Neste vídeo vamos ver a seção Alunos do módulo Acadêmico. Ela organiza o cadastro e a vida acadêmica de cada aluno.

**Cena 2 — Como abrir.** Toque em Acadêmico no menu e depois em Alunos, ou use o botão "Alunos" da faixa no alto da tela.

**Cena 3 — Os três blocos.** A tela mostra três blocos, cada um com a etiqueta "Fluxo preparado". O primeiro, "Cadastro acadêmico central", reúne dados do aluno, contatos, documentos e vínculo com cursos e turmas numa única ficha. O segundo, "Matrícula e situação acadêmica", é a estrutura para ingresso, rematrícula, trancamento, cancelamento e acompanhamento. O terceiro, "Histórico e pendências", organiza histórico, documentos pendentes, situação financeira e atividades.

**Cena 4 — Aviso.** Um texto no alto explica que as rotinas que dependem de regras acadêmicas, documentos oficiais ou integrações externas serão validadas antes de ir para produção. Hoje a seção descreve a estrutura. (conferir na tela antes de gravar o que já permite digitar)

**Cena 5 — Resumo.** Para guardar: uma ficha única por aluno, matrícula e situação acompanhadas, histórico e pendências sempre à vista. Próximo vídeo: Cursos.

### Ficha rápida
- **O que faz:** Organiza o cadastro do aluno, a matrícula e as pendências em uma ficha única.
- **Como aplicar (passo a passo):**
  1. Abra Menu > Acadêmico > Alunos.
  2. Leia os três blocos.
  3. Confira o que já está liberado para digitação (conferir na tela antes de gravar).
  4. Mantenha documentos e situação do aluno atualizados.
  5. Consulte pendências antes de cada turma começar.
- **Com que frequência usar:** Semanalmente, e a cada matrícula.
- **Quem tem acesso:** Departamentos com acesso ao módulo Documentos (Gestor, Administrador, Administração, RH, Jurídico, Educacional). O gestor libera ou bloqueia em Configurações > Permissões.
- **Com que frequência precisa ser alimentado:** A cada matrícula, mudança de situação ou documento recebido.
- **O que acontece se não for alimentado:** O cadastro e as pendências ficam desatualizados. Turmas, frequência e financeiro acadêmico ficam sem base para cruzar. Não há bloqueio nem aviso vermelho.
- **Onde impacta (interação com outros itens):** Cursos, Turmas, Frequência e documentos, Financeiro acadêmico e Pacientes (cadastro geral).
- **Erros comuns e dicas:** Cadastrar o mesmo aluno duas vezes. Deixar documento pendente sem data. Confirmar o que a tela já faz antes de orientar a equipe.

### Abas e seções deste item
**Cadastro acadêmico central.** Ficha única do aluno.

**Matrícula e situação acadêmica.** Ingresso, rematrícula, trancamento, cancelamento e acompanhamento.

**Histórico e pendências.** Histórico, documentos pendentes, situação financeira e atividades.

### Trilha de vídeos
- **Assistir antes:** V90 Acadêmico: visão geral.
- **Assistir depois:** V92 Cursos e V94 Turmas, para ligar o aluno ao curso.
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item, e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**Alunos no Acadêmico: uma ficha para cada aluno**
Veja como o módulo organiza cadastro, matrícula e pendências dos seus alunos.
#CompletoDonto #Alunos #GestaoAcademica #CursosOdontologia #Dentista
---

---
## V92 — Cursos
**Duração sugerida:** 3 a 5 minutos · **Onde fica no sistema:** Menu > Acadêmico > Cursos (/academico?secao=cursos)

### Roteiro para narrar
**Cena 1 — Apresentação.** Olá! Neste vídeo vamos ver a seção Cursos. É o catálogo dos cursos oferecidos pela clínica ou instituição.

**Cena 2 — O catálogo.** Cada curso aparece num cartão com a categoria, o título, a descrição, o nome do professor, a nota e a quantidade de alunos. Os cursos em destaque ganham um selo e um fundo colorido. Só aparecem os cursos com situação "Publicado".

**Cena 3 — Duração e acesso.** No cartão você vê a duração do teaser, que é um trecho de apresentação aberto a quem quer conhecer o curso, e a duração do curso completo em horas. Uma etiqueta mostra o tipo de acesso.

**Cena 4 — Botões.** Cada cartão tem "Ver teaser" e "Ver curso". No alto da tela, "Cadastrar curso". (conferir na tela antes de gravar: nesta versão os botões ainda não abrem o cadastro nem o player, e o catálogo mostra cursos de exemplo.)

**Cena 5 — Pagamentos.** No fim da tela, um quadro lembra que a estrutura aceita várias moedas, PIX e cartão, com botão "Configurar pagamentos". Veja detalhes no vídeo de Financeiro acadêmico.

**Cena 6 — Resumo.** Para guardar: cada curso tem professor, duração e situação. Só cursos publicados aparecem no catálogo. Use o teaser para apresentar o curso. Próximo vídeo: Professores.

### Ficha rápida
- **O que faz:** Mostra o catálogo dos cursos publicados, com professor, avaliação, duração e acesso.
- **Como aplicar (passo a passo):**
  1. Abra Menu > Acadêmico > Cursos.
  2. Veja os cartões dos cursos publicados.
  3. Confira professor, duração e tipo de acesso.
  4. Use "Ver teaser" para a apresentação.
  5. Use "Ver curso" para abrir o conteúdo.
  6. Use "Cadastrar curso" no alto para incluir um novo (conferir na tela antes de gravar).
- **Com que frequência usar:** Sempre que lançar ou atualizar um curso.
- **Quem tem acesso:** Departamentos com acesso ao módulo Documentos (Gestor, Administrador, Administração, RH, Jurídico, Educacional). O gestor libera ou bloqueia em Configurações > Permissões.
- **Com que frequência precisa ser alimentado:** A cada curso novo ou alterado.
- **O que acontece se não for alimentado:** O catálogo fica vazio e os cartões da Visão geral ficam em zero. Não há bloqueio nem aviso vermelho.
- **Onde impacta (interação com outros itens):** Visão geral (cartões), Professores, Turmas, Alunos e Financeiro acadêmico.
- **Erros comuns e dicas:** Deixar o curso sem professor. Não marcar como publicado e estranhar a ausência no catálogo. Escrever descrição longa demais.

### Abas e seções deste item
**Catálogo de cursos.** Cartões com categoria, título, descrição, professor, nota, alunos, duração e acesso.

**Botões Ver teaser e Ver curso.** Abrem a apresentação e o curso.

**Botão Cadastrar curso.** Inclui um novo curso.

**Quadro de pagamentos.** Estrutura para várias moedas, PIX e cartão, com botão "Configurar pagamentos".

### Trilha de vídeos
- **Assistir antes:** V90 Acadêmico: visão geral.
- **Assistir depois:** V93 Professores e V94 Turmas.
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item, e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**Cursos no CompletoDonto: seu catálogo organizado**
Conheça o catálogo de cursos, com professor, duração e teaser.
#CompletoDonto #Cursos #EducacaoOdontologica #GestaoAcademica #Dentista
---

---
## V93 — Professores
**Duração sugerida:** 2 a 4 minutos · **Onde fica no sistema:** Menu > Acadêmico > Professores (/academico?secao=professores)

### Roteiro para narrar
**Cena 1 — Apresentação.** Olá! Neste vídeo vamos ver a seção Professores do módulo Acadêmico.

**Cena 2 — Três blocos.** A tela mostra três blocos com a etiqueta "Fluxo preparado". "Cadastro de professores" reúne dados profissionais, documentos, especialidades, cursos e turmas ligadas a cada um. "Agenda docente" dá a visão de módulos, aulas, horários e compromissos. "Documentação" é a base para contratos, documentos acadêmicos, certificados e comprovações.

**Cena 3 — Aviso.** Um texto explica que rotinas que dependem de regras acadêmicas ou documentos oficiais serão validadas antes de ir para produção. (conferir na tela antes de gravar o que já permite digitar)

**Cena 4 — Professores da equipe.** Para quem é funcionário da clínica, o cadastro de pessoas continua no RH e na Equipe. Veja os vídeos V55 e V08.

**Cena 5 — Resumo.** Para guardar: um cadastro por professor, agenda de aulas e documentos em ordem. Próximo vídeo: Turmas.

### Ficha rápida
- **O que faz:** Organiza o cadastro, a agenda e os documentos dos professores.
- **Como aplicar (passo a passo):**
  1. Abra Menu > Acadêmico > Professores.
  2. Leia os três blocos.
  3. Confira o que já está liberado para digitação (conferir na tela antes de gravar).
  4. Mantenha documentos e especialidades atualizados.
  5. Vincule cada professor aos cursos e turmas.
- **Com que frequência usar:** A cada novo professor ou novo semestre.
- **Quem tem acesso:** Departamentos com acesso ao módulo Documentos (Gestor, Administrador, Administração, RH, Jurídico, Educacional). O gestor libera ou bloqueia em Configurações > Permissões.
- **Com que frequência precisa ser alimentado:** A cada contratação, troca de curso ou documento novo.
- **O que acontece se não for alimentado:** Cursos e turmas ficam sem professor definido e a agenda docente fica vazia. Não há bloqueio nem aviso vermelho.
- **Onde impacta (interação com outros itens):** Cursos, Turmas, Frequência e documentos, RH e Equipe.
- **Erros comuns e dicas:** Cadastrar o professor sem as especialidades. Esquecer contratos e comprovações. Duplicar cadastros.

### Abas e seções deste item
**Cadastro de professores.** Dados, documentos, especialidades e vínculos.

**Agenda docente.** Módulos, aulas, horários e compromissos.

**Documentação.** Contratos, documentos acadêmicos, certificados e comprovações.

### Trilha de vídeos
- **Assistir antes:** V92 Cursos.
- **Assistir depois:** V94 Turmas. V55 RH e Gestão de Pessoas, para o cadastro de funcionários.
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item, e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**Professores no Acadêmico: cadastro, agenda e documentos**
Veja como organizar seus professores e as aulas de cada um.
#CompletoDonto #Professores #GestaoAcademica #EducacaoOdontologica #Dentista
---

---
## V94 — Turmas
**Duração sugerida:** 2 a 4 minutos · **Onde fica no sistema:** Menu > Acadêmico > Turmas (/academico?secao=turmas)

### Roteiro para narrar
**Cena 1 — Apresentação.** Olá! Neste vídeo vamos ver a seção Turmas. Turma é o grupo de alunos que faz um curso junto, num período e horário definidos.

**Cena 2 — Três blocos.** "Turmas e períodos" é a estrutura para turmas, módulos, calendários, horários e situação. "Alunos por turma" organiza as matrículas e a composição de cada turma. "Aulas e frequência" é a base para registrar presença, reposições, conteúdo e carga horária.

**Cena 3 — Aviso.** Como nas outras seções, as rotinas que dependem de regras acadêmicas ou integrações serão validadas antes de ir para produção. (conferir na tela antes de gravar o que já permite digitar)

**Cena 4 — Resumo.** Para guardar: monte a turma com curso, professor e horário. Matricule os alunos. Registre as aulas e a frequência. Próximo vídeo: Financeiro acadêmico.

### Ficha rápida
- **O que faz:** Organiza turmas, períodos, alunos de cada turma e aulas.
- **Como aplicar (passo a passo):**
  1. Abra Menu > Acadêmico > Turmas.
  2. Leia os três blocos.
  3. Defina curso, professor, calendário e horário (conferir na tela antes de gravar).
  4. Vincule os alunos matriculados.
  5. Registre as aulas e a presença.
- **Com que frequência usar:** A cada novo período e a cada aula.
- **Quem tem acesso:** Departamentos com acesso ao módulo Documentos (Gestor, Administrador, Administração, RH, Jurídico, Educacional). O gestor libera ou bloqueia em Configurações > Permissões.
- **Com que frequência precisa ser alimentado:** A cada nova turma e a cada aula dada.
- **O que acontece se não for alimentado:** A frequência e a carga horária não podem ser consolidadas, e o financeiro acadêmico não consegue separar por turma. Não há bloqueio nem aviso vermelho.
- **Onde impacta (interação com outros itens):** Alunos, Cursos, Professores, Frequência e documentos e Financeiro acadêmico.
- **Erros comuns e dicas:** Turma sem professor. Aluno matriculado em duas turmas do mesmo horário. Esquecer de fechar a turma ao fim do período.

### Abas e seções deste item
**Turmas e períodos.** Turmas, módulos, calendários, horários e situação.

**Alunos por turma.** Matrículas e composição.

**Aulas e frequência.** Presença, reposições, conteúdo e carga horária.

### Trilha de vídeos
- **Assistir antes:** V91 Alunos e V93 Professores.
- **Assistir depois:** V95 Financeiro acadêmico e V96 Frequência e documentos.
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item, e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**Turmas no Acadêmico: organize períodos, alunos e aulas**
Entenda como montar turmas e acompanhar aulas e carga horária.
#CompletoDonto #Turmas #GestaoAcademica #CursosOdontologia #Dentista
---

---
## V95 — Financeiro acadêmico
**Duração sugerida:** 2 a 4 minutos · **Onde fica no sistema:** Menu > Acadêmico > Financeiro acadêmico (/academico?secao=financeiro)

### Roteiro para narrar
**Cena 1 — Apresentação.** Olá! Neste vídeo vamos ver o Financeiro acadêmico. Ele cuida das mensalidades e dos recebimentos dos cursos.

**Cena 2 — Três blocos.** "Mensalidades e parcelas" é a integração planejada com o Financeiro central, para contas a receber, inadimplência e baixa de pagamentos. "PIX, boleto e cartão" é a estrutura compatível com os meios de pagamento já preparados no CompletoDonto. "Visão acadêmico-financeira" separa os números por curso, turma, aluno e centro de resultado.

**Cena 3 — Aviso.** Os blocos têm a etiqueta "Fluxo preparado". A integração com o financeiro está descrita como planejada. Por isso, hoje, lance as mensalidades pelo Financeiro (Contas a Receber). (conferir na tela antes de gravar)

**Cena 4 — Resumo.** Para guardar: mensalidades ligadas ao Contas a Receber, formas de pagamento já conhecidas e análise por curso e turma. Próximo vídeo: Frequência e documentos.

### Ficha rápida
- **O que faz:** Prepara a cobrança de mensalidades e a análise financeira por curso, turma e aluno.
- **Como aplicar (passo a passo):**
  1. Abra Menu > Acadêmico > Financeiro acadêmico.
  2. Leia os três blocos.
  3. Lance as mensalidades em Financeiro > Contas a Receber.
  4. Use as formas de pagamento já configuradas (PIX, boleto, cartão).
  5. Acompanhe a inadimplência no Financeiro.
- **Com que frequência usar:** Mensalmente, e a cada vencimento.
- **Quem tem acesso:** O item de menu é do módulo Documentos (Gestor, Administrador, Administração, RH, Jurídico, Educacional). Para lançar valores é preciso também acesso ao módulo Financeiro. O gestor libera ou bloqueia em Configurações > Permissões.
- **Com que frequência precisa ser alimentado:** A cada mensalidade e a cada pagamento recebido.
- **O que acontece se não for alimentado:** Mensalidades não cobradas, inadimplência sem controle e relatórios por curso incompletos. O Financeiro central mostra avisos de contas vencidas.
- **Onde impacta (interação com outros itens):** Contas a Receber, Cobranças, Recebimentos online, Alunos, Cursos e Turmas.
- **Erros comuns e dicas:** Lançar mensalidade sem identificar o aluno ou a turma. Esquecer de dar baixa. Misturar o dinheiro dos cursos com o do consultório sem separar o centro de resultado.

### Abas e seções deste item
**Mensalidades e parcelas.** Integração planejada com Contas a Receber.

**PIX, boleto e cartão.** Meios de pagamento compatíveis.

**Visão acadêmico-financeira.** Análise por curso, turma, aluno e centro de resultado.

### Trilha de vídeos
- **Assistir antes:** V41 Contas a Receber, onde as mensalidades são lançadas. V94 Turmas.
- **Assistir depois:** V96 Frequência e documentos. V43 Cobranças, para cobrar atrasos.
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item, e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**Financeiro acadêmico: mensalidades dos seus cursos sob controle**
Veja como o módulo se liga ao financeiro e à cobrança dos alunos.
#CompletoDonto #FinanceiroAcademico #Mensalidades #GestaoDeCursos #Dentista
---

---
## V96 — Frequência e documentos
**Duração sugerida:** 2 a 4 minutos · **Onde fica no sistema:** Menu > Acadêmico > Frequência e documentos (/academico?secao=documentos)

### Roteiro para narrar
**Cena 1 — Apresentação.** Olá! Este é o último vídeo do módulo Acadêmico: Frequência e documentos. Ele cuida da presença dos alunos e dos documentos do curso.

**Cena 2 — Três blocos.** "Frequência" é a estrutura para chamada, faltas, reposições e consolidação da carga horária. Carga horária é o total de horas cursadas. "Documentos acadêmicos" organiza documentos do aluno, do professor, do curso e da turma, com a situação de cada um. "Assinaturas e certificados" é o ponto de ligação futuro para assinatura eletrônica, certificados e fluxos exigidos por órgãos reguladores.

**Cena 3 — Aviso.** Os blocos têm a etiqueta "Fluxo preparado". A assinatura e os certificados são integrações futuras. (conferir na tela antes de gravar)

**Cena 4 — Resumo.** Para guardar: registre a presença em cada aula, mantenha os documentos em dia e acompanhe a carga horária. Com isso você conclui o módulo Acadêmico. Para dúvidas e ideias, use Sugestões e Problemas.

### Ficha rápida
- **O que faz:** Prepara o registro de presença, o controle de carga horária e a organização dos documentos do curso.
- **Como aplicar (passo a passo):**
  1. Abra Menu > Acadêmico > Frequência e documentos.
  2. Leia os três blocos.
  3. Registre a presença de cada aula (conferir na tela antes de gravar).
  4. Organize os documentos de alunos, professores, cursos e turmas.
  5. Confira a carga horária antes de encerrar a turma.
- **Com que frequência usar:** A cada aula, para a frequência. Documentos, a cada novo item.
- **Quem tem acesso:** Departamentos com acesso ao módulo Documentos (Gestor, Administrador, Administração, RH, Jurídico, Educacional). O gestor libera ou bloqueia em Configurações > Permissões.
- **Com que frequência precisa ser alimentado:** A cada aula dada e a cada documento recebido ou emitido.
- **O que acontece se não for alimentado:** A carga horária não fecha e o aluno pode ficar sem certificado ou comprovante. Documentos ficam sem situação definida. Não há bloqueio nem aviso vermelho.
- **Onde impacta (interação com outros itens):** Turmas, Alunos, Professores, Evidências Operacionais e Documentos Clínicos (documentos do consultório), Financeiro acadêmico.
- **Erros comuns e dicas:** Deixar a chamada para o fim do mês. Perder o documento original. Prometer certificado automático antes de a função estar ativa.

### Abas e seções deste item
**Frequência.** Chamada, faltas, reposições e carga horária.

**Documentos acadêmicos.** Documentos de aluno, professor, curso e turma, com situação.

**Assinaturas e certificados.** Ponto de ligação futuro para assinatura eletrônica e certificados.

### Trilha de vídeos
- **Assistir antes:** V94 Turmas e V91 Alunos.
- **Assistir depois:** V53 Evidências Operacionais, para guardar comprovações. V99 Sugestões e Problemas, para enviar ideias.
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item, e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**Frequência e documentos: o fechamento do curso em dia**
Entenda como acompanhar presença, carga horária e documentos acadêmicos.
#CompletoDonto #Frequencia #DocumentosAcademicos #GestaoAcademica #Dentista
---
