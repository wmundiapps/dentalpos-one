# Roteiros 04 — Financeiro (V40 a V47)

Observação geral para quem grava: "Cobrar" e "Gerar financeiro" são coisas diferentes. Em V41, V43 e V44 a explicação aparece na ficha rápida.
- **Gerar financeiro** = CRIAR a conta a receber do paciente (boleto, Pix, cartão, cheque pré-datado ou dinheiro). Fica na ficha do paciente e no menu Financeiro.
- **Cobrar** = COBRAR UMA CONTA QUE JÁ EXISTE e está pendente ou atrasada. No Contas a Receber, o botão "Cobrar online" gera o link/boleto/Pix daquela conta; o botão "REVAH" coloca a cobrança na fila de mensagens; e a régua de cobrança (Configurações) avisa sozinha o paciente em atraso.

---
## V40 — Financeiro: visão geral
**Duração sugerida:** 4 a 6 minutos · **Onde fica no sistema:** Menu > Financeiro > Visão geral (/financeiro). Na mesma tela: cartões de totais, barra de botões, painel com 4 abas (Lembretes, Quem está devendo, Previsão, Contas recorrentes) e a lista de lançamentos.

### Roteiro para narrar
**Cena 1 — Para que serve.** Olá! Neste vídeo você vai conhecer a Visão geral do Financeiro do CompletoDonto. É a tela onde ficam todas as contas da clínica: o que você tem para receber e o que você tem para pagar.

**Cena 2 — Os quatro cartões.** No alto da tela há quatro cartões: "A receber", "A pagar", "Caixa realizado" e "Total vencido". "A receber" é o dinheiro que os pacientes ainda vão pagar. "A pagar" são as contas da clínica ainda abertas. "Caixa realizado" é o que já entrou menos o que já saiu. "Total vencido" é tudo o que passou do vencimento sem baixa. Toque em qualquer cartão e a lista logo abaixo mostra só aqueles lançamentos. Para voltar, toque em "Mostrar todos".

**Cena 3 — Os botões de atalho.** Logo abaixo ficam cinco botões: "Gerar financeiro / emitir cobrança", "Central de cobrança", "Integrações", "Digitalizar conta/nota" e "Cobranças REVAH". Cada um leva para um vídeo desta série, e eu aviso quando chegarmos neles.

**Cena 4 — O painel de quatro abas.** A aba "Lembretes" mostra avisos, como conta recorrente que ainda não foi lançada neste mês, conta vencida sem baixa, conta que vence em breve e valor variável para confirmar. Os avisos graves ficam em vermelho. A aba "Quem está devendo" lista os pacientes com parcela vencida, o total, os dias de atraso e um botão de WhatsApp. A aba "Previsão" mostra mês a mês as receitas e despesas previstas e o saldo acumulado, para 3, 6 ou 12 meses. A aba "Contas recorrentes" mostra aluguel, energia e outras contas que se repetem.

**Cena 5 — A lista de lançamentos.** Mais abaixo está a lista. Use a busca para achar por nome ou descrição, e os filtros: Todos, Pendente, Vencido, Pago, Receita, Despesa e Cancelado. Receitas aparecem em verde com sinal de mais, despesas em vermelho com sinal de menos. O botão "Baixar / imprimir" exporta a lista por período de vencimento.

**Cena 6 — Novo lançamento.** Para lançar uma conta, toque em "Novo lançamento" no alto da tela. Preencha descrição, pessoa ou fornecedor, tipo (Receita ou Despesa), valor e vencimento. Escolha a forma e salve. O passo a passo completo está nos vídeos de Contas a Receber e Contas a Pagar.

**Cena 7 — Resumo.** Para fechar: primeiro, os quatro cartões mostram a saúde do caixa num relance. Segundo, o painel avisa o que está atrasado ou esquecido. Terceiro, a lista é onde você lança, cobra e dá baixa. No próximo vídeo, vamos entrar em Contas a Receber.

### Ficha rápida
- **O que faz:** Reúne todas as contas a receber e a pagar da clínica, mostra totais, atrasos, previsão dos próximos meses e permite lançar, editar, dar baixa e cancelar.
- **Como aplicar (passo a passo):**
  1. Abra Menu > Financeiro > Visão geral.
  2. Olhe os quatro cartões (A receber, A pagar, Caixa realizado, Total vencido).
  3. Abra a aba "Lembretes" e resolva o que estiver em vermelho.
  4. Use a busca e os filtros para achar um lançamento.
  5. Toque em "Novo lançamento" para incluir uma conta.
  6. Toque em "Baixar" quando a conta for paga ou recebida.
  7. Use "Baixar / imprimir" para exportar a lista.
- **Com que frequência usar:** Todos os dias (início do expediente) para ver vencidos e lembretes.
- **Quem tem acesso:** O item aparece no menu para quem tem a permissão "ver" do módulo Financeiro (ou o item liberado para o departamento em Permissões). Padrão do sistema: Gestor e Administrador veem tudo; Financeiro tem acesso completo; Recepção e Administração só consultam; o Contador também consulta. Ver a lista exige "finance.view"; criar lançamento exige "criar"; editar exige "editar"; dar baixa, cancelar e excluir exigem "aprovar" (no servidor). O gestor pode liberar ou bloquear cada item do menu e cada ação na tela Permissões.
- **Com que frequência precisa ser alimentado:** Diariamente (baixas) e a cada conta nova. Contas recorrentes são lançadas sozinhas todo mês depois de cadastradas.
- **O que acontece se não for alimentado:** Os cartões e a Previsão ficam errados; contas pagas continuam como vencidas e entram em "Total vencido"; aparece o aviso vermelho de recebimento vencido nas pendências e a régua de cobrança continua avisando o paciente que já pagou; pacientes podem ficar marcados como "Inadimplente" e ter novos agendamentos recusados (se a regra estiver ligada); os relatórios e a Inteligência Financeira ficam incompletos.
- **Onde impacta (interação com outros itens):** Pacientes e Ficha do paciente (selo "Inadimplente" e aba Financeiro), Agenda (bloqueio por pendência financeira), Orçamentos e Tratamentos (parcelas), Avisos de pendências, Régua de cobrança (Configurações), Recebimentos online, Inteligência Financeira, Relatórios, Painel Executivo e Contábil e Fiscal (notas ligadas aos lançamentos).
- **Erros comuns e dicas:** Esquecer de dar baixa e deixar a conta aparecendo como vencida. Cancelar em vez de dar baixa. Digitar o valor sem vírgula (use 1.250,90). Dica: clique nos cartões para filtrar rápido e comece o dia pela aba "Lembretes".

### Abas e seções deste item
**Cartões de totais.** Quatro cartões clicáveis que filtram a lista. Use para ver de relance o que está aberto e vencido.

**Barra de botões.** "Gerar financeiro / emitir cobrança" (V44), "Central de cobrança" (V43), "Integrações", "Digitalizar conta/nota" (V46) e "Cobranças REVAH". Use como atalho.

**Aba Lembretes.** Avisos do que falta lançar ou baixar, com botão "Ver" que filtra a lista pela pessoa. Use todo dia.

**Aba Quem está devendo.** Pacientes com parcela vencida: total, número de parcelas, dias de atraso, botão "Lançamentos" e botão "WhatsApp" com mensagem pronta. Use para ligar ou escrever para quem está em atraso.

**Aba Previsão.** Tabela de receitas previstas, despesas previstas, saldo do mês e saldo acumulado, com horizonte de 3, 6 ou 12 meses. Passe o mouse no valor para ver a composição (em aberto, recorrente, estimado). Use para planejar o caixa.

**Aba Contas recorrentes.** Lista de contas que se repetem, com os botões "Alterar valor", "Débito autom." e "Encerrar" (detalhes no V42).

**Filtros e busca.** Chips de situação e de tipo, mais a busca por texto. Contas canceladas só aparecem no filtro "Cancelado".

**Lista de lançamentos.** Cada linha mostra descrição, pessoa, categoria, forma, valor, vencimento e situação, com os botões de ação. Use para o trabalho do dia a dia.

### Trilha de vídeos
- **Assistir antes:** V14 Pacientes (os lançamentos ficam ligados ao paciente); V05 Permissões (para saber quem enxerga o Financeiro).
- **Assistir depois:** V41 Contas a Receber (como receber e cobrar); V42 Contas a Pagar (contas da clínica); V74 Inteligência Financeira (olhar os números).
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item (perto do botão de acessibilidade), e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**Título:** Financeiro da clínica em uma tela
Veja como usar a Visão geral do Financeiro do CompletoDonto: quanto você tem a receber, a pagar, o caixa e o que está vencido, com avisos e previsão dos próximos meses.
#financeiro #clinicaodontologica #gestaodeclinica #CompletoDonto #odontologia
---

---
## V41 — Contas a Receber
**Duração sugerida:** 5 a 7 minutos · **Onde fica no sistema:** Menu > Financeiro > Contas a Receber (abre /financeiro já filtrado em Receita). Botões na linha: Cobrar online, REVAH, Editar, Baixar, Cancelar.

### Roteiro para narrar
**Cena 1 — Para que serve.** Neste vídeo você aprende a usar as Contas a Receber: tudo o que os pacientes devem à clínica. Aqui você confere, cobra e dá baixa quando o dinheiro entra.

**Cena 2 — Abrir a tela.** Vá em Financeiro e toque em Contas a Receber. A lista já aparece filtrada só com receitas. Use a busca para achar o paciente pelo nome e os filtros Pendente, Vencido e Pago para ver cada situação.

**Cena 3 — Lançar uma receita.** Toque em "Novo lançamento". Escreva a descrição, o nome do paciente, a categoria, deixe o tipo como Receita, digite o valor e o vencimento. Em "Forma" escolha Pix, Cartão, Boleto, Transferência, Dinheiro, Promissória, Permuta ou Cheque. Em "Recebimento via" escolha Asaas, Stripe, Banco ou Manual. Toque em "Salvar lançamento". Se a receita vai se repetir, veja o vídeo de Contas a Pagar, que explica a opção de conta recorrente.

**Cena 4 — Cobrar online.** Numa conta pendente ou vencida, toque em "Cobrar online". Escolha a forma: o paciente escolhe entre Pix, boleto ou cartão; ou só Pix; ou só boleto; ou cartão em até 12 vezes. Confira o vencimento e toque em "Gerar cobrança". O sistema mostra o link de pagamento, o Pix copia e cola e a linha do boleto. Você pode copiar, enviar por WhatsApp, abrir a fatura ou enviar por e-mail. Se faltar CPF ou e-mail do paciente, o sistema pede na hora. Quando o paciente pagar, a conta é baixada sozinha. Atenção: para isso a conta Asaas da clínica precisa estar conectada, o que é explicado no vídeo de Recebimentos online.

**Cena 4b — Cobrar é diferente de Gerar financeiro.** Guarde esta diferença. "Cobrar" é para uma conta que já existe: você gera o link, manda mensagem, lembra o paciente. "Gerar financeiro" é para criar a conta nova do paciente, com boleto, Pix, cartão, cheque ou dinheiro. Esse é o assunto do vídeo 44.

**Cena 5 — REVAH.** O botão "REVAH" coloca a cobrança na fila de mensagens da clínica. As mensagens param quando a parcela for baixada.

**Cena 6 — Dar baixa.** Quando o dinheiro entrar de outro jeito, toque em "Baixar". Escolha a forma de pagamento, confira a data (não pode ser futura) e informe o número do comprovante, como o código do Pix ou o NSU do cartão. Para dinheiro e permuta o comprovante é opcional. A tela mostra quem está registrando a baixa. Toque em "Confirmar baixa". A linha passa a mostrar "Pago em..." com o comprovante.

**Cena 7 — Editar e cancelar.** "Editar" corrige os dados de uma conta aberta. "Cancelar" tira a conta da lista. Contas canceladas ficam no filtro "Cancelado", onde podem ser excluídas de vez. Isso não tem volta, então confira antes.

**Cena 8 — Resumo.** Resumindo: lance a receita, cobre o paciente com "Cobrar online" ou REVAH e dê baixa quando pagar. Não deixe conta paga como vencida. No próximo vídeo, as Contas a Pagar.

### Ficha rápida
- **O que faz:** Lista o que os pacientes devem à clínica e permite lançar, cobrar (link, Pix, boleto, cartão, REVAH), editar, dar baixa e cancelar.
- **Como aplicar (passo a passo):**
  1. Abra Menu > Financeiro > Contas a Receber.
  2. Busque o paciente ou use os filtros Pendente, Vencido, Pago.
  3. Para uma conta nova, toque em "Novo lançamento", preencha e salve.
  4. Numa conta em aberto, toque em "Cobrar online", escolha a forma e toque em "Gerar cobrança".
  5. Copie o link ou o Pix, ou toque em "Enviar por WhatsApp" ou envie por e-mail.
  6. Se o pagamento entrar por fora do sistema, toque em "Baixar", informe forma, data e comprovante e confirme.
  7. Corrija com "Editar" ou desista com "Cancelar".
- **Diferença entre "Cobrar" e "Gerar financeiro":** "Cobrar" (Cobrar online, REVAH e a régua de cobrança) age sobre uma conta que JÁ EXISTE e está pendente ou atrasada, para o paciente pagar. "Gerar financeiro" CRIA a conta nova a partir do paciente, com boleto, Pix, cartão, cheque pré-datado ou dinheiro (vídeo V44). Dica: para criar o boleto de uma conta nova, o caminho natural é Gerar financeiro; para lembrar quem está devendo, é Cobrar.
- **Com que frequência usar:** Todo dia: cobrar vencidos e dar baixa nos recebimentos.
- **Quem tem acesso:** Ver a lista: Gestor, Financeiro, Recepção, Administração e Contador (consulta). Criar lançamento e gerar cobrança exigem a permissão "criar" do Financeiro (Gestor e Financeiro). Editar exige "editar". Baixar, cancelar e excluir exigem "aprovar" (Gestor e Financeiro). Recepção, no padrão, só consulta; o gestor pode liberar ou bloquear cada ação em Permissões.
- **Com que frequência precisa ser alimentado:** Todo dia, a cada recebimento (a baixa é automática só para cobrança online paga).
- **O que acontece se não for alimentado:** Contas pagas continuam vencidas; "Total vencido" e "Quem está devendo" ficam errados; a régua de cobrança envia aviso a quem já pagou; o paciente fica marcado como "Inadimplente" e pode ter novo agendamento recusado; aparece o aviso vermelho de recebimentos vencidos para Recepção, Financeiro, Dentista e Gestor; relatórios e caixa saem incorretos.
- **Onde impacta (interação com outros itens):** Ficha do paciente (aba Financeiro e selo de inadimplência), Agenda (bloqueio de novos horários), Régua de cobrança, Recebimentos online (repasse ao dentista), Avisos de pendências, Orçamentos e Tratamentos, Inteligência Financeira, Relatórios e Contábil e Fiscal.
- **Erros comuns e dicas:** Gerar cobrança sem a conta Asaas conectada (a tela avisa e oferece o botão "Conectar"). Faltar CPF ou e-mail do paciente (o sistema pede e salva no cadastro). Se o vencimento já passou, o sistema ajusta para hoje. Dica: informe sempre o comprovante na baixa, para conferência.

### Abas e seções deste item
**Cartões e filtros.** Os mesmos da Visão geral, já filtrados em Receita. Use "A receber" e "Total vencido" para priorizar.

**Novo lançamento.** Janela com descrição, pessoa, categoria, tipo, valor, vencimento, competência, forma, recebimento via, débito automático, conta recorrente e observações. Use para receitas avulsas.

**Cobrar online.** Janela para gerar a cobrança no Asaas: forma (paciente escolhe, Pix, boleto, cartão até 12x), vencimento e, se quiser, repasse a um dentista (regra do cadastro, percentual do líquido ou valor fixo). Depois de gerada, mostra link, Pix copia e cola, linha do boleto, e-mail, WhatsApp, abrir fatura e cancelar cobrança.

**Botão REVAH.** Coloca a cobrança na fila de mensagens do Revah.

**Baixar.** Janela de baixa com forma, data, comprovante e observação.

**Editar e Cancelar.** Corrigem ou cancelam a conta. Cancelados podem ser excluídos em definitivo (contas com nota fiscal ligada são mantidas).

**Aba Quem está devendo.** Lista de inadimplentes com WhatsApp pronto (ver V40).

### Trilha de vídeos
- **Assistir antes:** V40 Financeiro: visão geral (conhecer a tela e os cartões); V14 Pacientes (os dados do paciente alimentam a cobrança).
- **Assistir depois:** V44 Gerar financeiro (criar a conta nova do paciente); V43 Cobranças (régua e central); V45 Recebimentos online (conectar o Asaas para a baixa automática).
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item (perto do botão de acessibilidade), e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**Título:** Contas a Receber: cobre e dê baixa
Aprenda a lançar, cobrar por link, Pix, boleto ou WhatsApp e dar baixa nas contas dos pacientes no CompletoDonto. Menos atraso, caixa em dia.
#contasareceber #cobranca #clinicaodontologica #CompletoDonto #financeiro
---

---
## V42 — Contas a Pagar
**Duração sugerida:** 5 a 7 minutos · **Onde fica no sistema:** Menu > Financeiro > Contas a Pagar (abre /financeiro filtrado em Despesa). Na janela "Novo lançamento": conta recorrente e débito automático. No painel: aba "Contas recorrentes".

### Roteiro para narrar
**Cena 1 — Para que serve.** Este vídeo mostra as Contas a Pagar: aluguel, energia, fornecedores, laboratório e tudo o que a clínica precisa pagar. Aqui você lança, acompanha o vencimento e dá baixa.

**Cena 2 — Lançar uma despesa.** Vá em Financeiro e toque em Contas a Pagar. Toque em "Novo lançamento". Escreva a descrição, o fornecedor, a categoria, deixe o tipo como Despesa, digite o valor e o vencimento. A competência é opcional e indica o mês a que a conta se refere. Escolha a forma e salve.

**Cena 3 — Conta que se repete.** Para aluguel, energia ou sistemas, marque "Conta recorrente". Escolha a periodicidade, quantas vezes ela se repete (deixe vazio para não ter fim) e, se quiser, uma data final. O sistema cria a conta de cada mês sozinho. Se o valor muda todo mês, como energia e água, marque "Valor variável": o sistema lembra você de confirmar o valor.

**Cena 4 — Débito automático.** Se a conta é debitada direto da conta bancária, marque "Débito automático". Ela continua aparecendo no relatório do mês e recebe baixa automática no dia do vencimento. Use só quando o débito realmente existir, porque o sistema não confere o banco.

**Cena 5 — Gerenciar as recorrentes.** No painel acima da lista, abra a aba "Contas recorrentes". Ali você vê cada conta, a periodicidade e o dia. Toque em "Alterar valor" para atualizar o valor das próximas contas em aberto. Toque em "Débito autom." para ligar ou desligar. Toque em "Encerrar" para parar: a conta deste mês continua, as dos próximos meses em aberto são canceladas.

**Cena 6 — Dar baixa.** Quando pagar uma conta, toque em "Baixar", escolha a forma, a data e informe o comprovante, e confirme. Contas de débito automático não precisam de baixa.

**Cena 7 — Lembretes.** Na aba "Lembretes" o sistema avisa: conta recorrente que não foi lançada no mês, conta vencida sem baixa, conta que vence em breve e valor variável para confirmar.

**Cena 8 — Resumo.** Resumindo: lance a despesa, use recorrente para o que se repete e dê baixa quando pagar. Os lembretes avisam o que ficou para trás. No próximo vídeo, as Cobranças.

### Ficha rápida
- **O que faz:** Controla as despesas da clínica: lançamento avulso, contas recorrentes (mensal etc.), débito automático, baixa, edição e cancelamento.
- **Como aplicar (passo a passo):**
  1. Abra Menu > Financeiro > Contas a Pagar.
  2. Toque em "Novo lançamento" e preencha descrição, fornecedor, valor e vencimento (tipo Despesa).
  3. Se repete, marque "Conta recorrente" e escolha periodicidade, quantidade e data final.
  4. Se o valor muda todo mês, marque "Valor variável".
  5. Se é debitada no banco, marque "Débito automático".
  6. Acompanhe pela aba "Lembretes" e pela aba "Contas recorrentes".
  7. Ao pagar, toque em "Baixar", informe forma, data e comprovante.
- **Com que frequência usar:** Diariamente para vencimentos; uma vez por mês para conferir valores variáveis.
- **Quem tem acesso:** Ver: Gestor, Financeiro, Administração, Recepção (só consulta) e Contador (consulta). Lançar e criar recorrente exigem "criar"; editar e alterar valor exigem "editar"; baixar, cancelar, encerrar recorrência e excluir exigem "aprovar" (Gestor e Financeiro). O gestor pode liberar ou bloquear em Permissões.
- **Com que frequência precisa ser alimentado:** A cada conta nova ou, se recorrente, uma vez só (depois o sistema lança). Valores variáveis, todo mês. Baixas, quando pagar.
- **O que acontece se não for alimentado:** Aparece o aviso vermelho "Conta recorrente não lançada neste mês" e "Conta vencida sem baixa"; "A pagar" e "Total vencido" ficam errados; a Previsão de caixa e a Inteligência Financeira ficam incompletas; despesas esquecidas podem faltar para a contabilidade e no Rateio do condomínio.
- **Onde impacta (interação com outros itens):** Visão geral (cartões e Previsão), Inteligência Financeira, Relatórios, Contábil e Fiscal, Painel Executivo e Avisos de pendências.
- **Erros comuns e dicas:** Marcar débito automático em conta que não é debitada (ela será baixada sozinha como paga). Esquecer de confirmar o valor da conta variável. Cancelar uma conta recorrente do mês achando que para a recorrência (para parar, use "Encerrar" na aba Contas recorrentes). Lançamentos recorrentes cancelados ficam guardados e ocultos.

### Abas e seções deste item
**Novo lançamento (despesa).** Mesma janela da receita, com opções de débito automático, conta recorrente, periodicidade, quantas vezes, data final e valor variável.

**Aba Contas recorrentes.** Lista as contas que se repetem com valor, tipo, periodicidade, dia, "sem fim" ou número de vezes, e marcas de Débito automático, Valor variável e Encerrada. Botões: Alterar valor, Débito autom., Encerrar.

**Aba Lembretes e aba Previsão.** Avisos do mês e projeção de caixa que já inclui as contas recorrentes.

**Lista de despesas.** Selo "Débito automático" e "Recorrente" em cada linha; botões Editar, Baixar e Cancelar. O botão "Cobrar online" não aparece em despesas.

### Trilha de vídeos
- **Assistir antes:** V40 Financeiro: visão geral (conhecer a tela); V41 Contas a Receber (a baixa funciona igual).
- **Assistir depois:** V47 Rateio do condomínio (dividir despesas do prédio); V74 Inteligência Financeira (ver o peso das despesas); V51 Contábil e Fiscal (enviar os dados ao contador).
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item (perto do botão de acessibilidade), e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**Título:** Contas a Pagar sem esquecer nenhuma
Lance despesas, crie contas recorrentes como aluguel e energia, use débito automático e dê baixa no CompletoDonto. O sistema avisa o que está vencendo.
#contasapagar #gestaofinanceira #clinicaodontologica #CompletoDonto #odontologia
---

---
## V43 — Cobranças
**Duração sugerida:** 5 a 7 minutos · **Onde fica no sistema:** Menu > Financeiro > Cobranças (/pagamentos, tela "Pagamentos e Recebimentos"). A régua de cobrança fica em Menu > Configurações > "Régua de cobrança do paciente".

### Roteiro para narrar
**Cena 1 — Para que serve.** Neste vídeo você vai conhecer duas coisas que ajudam a receber em dia: a tela de Cobranças, também chamada de Pagamentos e Recebimentos, e a régua de cobrança, que avisa sozinha o paciente em atraso.

**Cena 2 — A tela Cobranças.** Abra Financeiro e toque em Cobranças. No alto aparecem dois totais: "Recebimentos em aberto" e "Recebido / baixado". Abaixo há um cartão para cada meio de pagamento: o Asaas (Pix, cartão e boleto), o Stripe (cartões e pagamentos internacionais) e a conexão com banco (Pix, transferências e conciliação). Cada cartão tem uma chave para ligar ou desligar.

**Cena 3 — Atenção ao aviso.** A tela mostra um aviso amarelo: os meios de pagamento são ativados pela equipe CompletoDonto e, enquanto não estiverem ativos, as cobranças desta tela são apenas simuladas. Existe o "Simulador de cobrança": você digita um valor, escolhe a forma e o provedor, e o sistema só prepara uma cobrança de teste. Nenhum dinheiro é movimentado. Para cobrar de verdade, use "Cobrar online" nas Contas a Receber.

**Cena 4 — A régua de cobrança.** Abra Configurações e procure o cartão "Régua de cobrança do paciente". Ela envia avisos automáticos para o paciente com pagamento em atraso: todo dia do primeiro ao décimo quinto dia, depois no vigésimo e no trigésimo dia. A partir do trigésimo primeiro dia, o aviso diz que a cobrança foi encaminhada ao departamento jurídico. Quando a conta é baixada, os avisos param.

**Cena 5 — Ligar a régua.** Ligue a chave "Régua ligada". Marque os canais de envio que quiser, um ou mais, ou toque em "Marcar todos". Decida se quer incluir dívidas que já estavam vencidas antes de ligar. Se não incluir, só entram contas com vencimento a partir da data em que você ligou. As mensagens saem a partir das 9 horas, horário de Brasília.

**Cena 6 — Conferir antes de enviar.** O cartão mostra exemplos da mensagem, a lista dos "Avisos que sairiam hoje", com o canal e se o paciente está sem contato, e os últimos avisos enviados. Se algum aviso falhar, aparece um alerta amarelo com o motivo.

**Cena 7 — Regra da agenda.** Logo acima, em Configurações, existe a regra "Agenda e pendência financeira": paciente com cobrança vencida pode marcar só um horário, e novos agendamentos são recusados até regularizar. Você liga ou desliga e define a carência em dias.

**Cena 8 — Resumo.** Resumindo: a tela Cobranças mostra os meios de pagamento e um simulador; a régua avisa sozinha quem está em atraso; e a regra da agenda evita novos horários para quem deve. No próximo vídeo, como criar o financeiro do paciente.

### Ficha rápida
- **O que faz:** Reúne os meios de pagamento (Asaas, Stripe, banco), mostra os totais de recebimentos e tem um simulador de cobrança. A régua de cobrança (em Configurações) avisa automaticamente o paciente em atraso.
- **Como aplicar (passo a passo):**
  1. Abra Menu > Financeiro > Cobranças e confira "em aberto" e "recebido".
  2. Veja quais meios de pagamento estão ligados (a ativação real é feita pela equipe CompletoDonto).
  3. Use o simulador só para testar o fluxo (nada é cobrado de verdade).
  4. Abra Menu > Configurações e vá ao cartão "Régua de cobrança do paciente".
  5. Ligue a régua e marque os canais de envio.
  6. Decida se inclui dívidas antigas e confira os "Avisos que sairiam hoje".
  7. Opcional: ligue a regra "Agenda e pendência financeira" e defina a carência.
- **Diferença entre "Cobrar" e "Gerar financeiro":** "Cobrar" é lembrar ou receber uma conta já existente: botão "Cobrar online", botão REVAH e a régua automática. "Gerar financeiro" cria a conta nova do paciente (V44). A tela Cobranças (/pagamentos) não gera cobrança real; ela mostra os meios de pagamento e um teste.
- **Com que frequência usar:** Configurar a régua uma vez e revisar de tempos em tempos; olhar os avisos previstos quando houver muitos atrasos.
- **Quem tem acesso:** A tela Cobranças aparece para quem tem o módulo Financeiro (Gestor, Financeiro, Recepção, Administração e Contador consultam). Ligar ou desligar meios de pagamento exige "aprovar" no servidor. A régua de cobrança e a regra da agenda exigem a permissão "aprovar" do Financeiro (Gestor e Financeiro) e ficam em Configurações, item que depende do módulo Configurações. Conferir em Permissões.
- **Com que frequência precisa ser alimentado:** A régua depende de a baixa ser feita sempre que houver pagamento. As contas devem estar lançadas com o paciente e com telefone ou e-mail atualizados.
- **O que acontece se não for alimentado:** Se o paciente não tem telefone ou e-mail, o aviso aparece como "sem contato" e não chega. Se a baixa não for dada, o paciente continua recebendo avisos mesmo depois de pagar e pode receber a mensagem de encaminhamento ao jurídico. Se a régua estiver desligada, nenhuma mensagem é enviada. Se a conta Asaas não estiver conectada, a cobrança online não funciona.
- **Onde impacta (interação com outros itens):** Contas a Receber, Ficha do paciente, Agenda (bloqueio), Canais de Envio e Revah (remetente), Avisos de pendências, Comunicações e Relatórios.
- **Erros comuns e dicas:** Achar que a tela Cobranças gera boleto real (é simulada, o boleto real sai por "Cobrar online" ou por "Gerar financeiro"). Esquecer de escolher o canal de envio. Esquecer de revisar os avisos de hoje antes de ligar. Se a tela da régua avisar que falta uma atualização no banco, peça ajuda ao suporte (conferir na tela antes de gravar).

### Abas e seções deste item
**Totais.** "Recebimentos em aberto" e "Recebido / baixado".

**Cartões dos meios de pagamento.** Asaas, Stripe e Banco, cada um com chave liga/desliga.

**Simulador de cobrança.** Valor, forma e provedor; gera só uma mensagem de teste.

**Régua de cobrança do paciente (em Configurações).** Chave ligar/desligar, canais de envio, incluir dívidas anteriores, exemplos de mensagem, avisos previstos para hoje e histórico recente.

**Agenda e pendência financeira (em Configurações).** Bloqueio de novos agendamentos para quem está em atraso e carência em dias.

### Trilha de vídeos
- **Assistir antes:** V41 Contas a Receber (a régua age sobre essas contas); V68 Canais de Envio (para os avisos saírem).
- **Assistir depois:** V44 Gerar financeiro (criar boleto, Pix ou cartão); V45 Recebimentos online (conectar o Asaas); V78 Avisos de pendências.
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item (perto do botão de acessibilidade), e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**Título:** Régua de cobrança automática
Veja como funcionam as Cobranças do CompletoDonto e como ligar a régua que avisa sozinha o paciente em atraso, sem constrangimento para a recepção.
#reguadecobranca #inadimplencia #clinicaodontologica #CompletoDonto #gestao
---

---
## V44 — Gerar financeiro
**Duração sugerida:** 5 a 7 minutos · **Onde fica no sistema:** Menu > Financeiro > Gerar financeiro (abre /pacientes?acao=financeiro). Também em Pacientes (botão "Gerar financeiro"), na ficha do paciente > aba "Financeiro" e na Visão geral do Financeiro (botão "Gerar financeiro / emitir cobrança").

### Roteiro para narrar
**Cena 1 — Para que serve.** Neste vídeo você aprende a Gerar financeiro: criar a cobrança de um paciente, com boleto, Pix, cartão, cheque pré-datado ou dinheiro.

**Cena 2 — Por onde começar.** Vá em Financeiro e toque em Gerar financeiro. Abre a lista de Pacientes com um aviso explicando o passo. Toque em "Gerar financeiro (buscar paciente)", digite o nome, o telefone ou o CPF, e escolha o paciente na lista. Se preferir, abra a ficha do paciente e entre na aba "Financeiro".

**Cena 3 — Escolha a forma.** Abre a janela "Gerar financeiro" com o nome do paciente. Em "Forma de cobrança", escolha: Boleto, Pix, Cartão com link online, Cartão na maquininha, Cheque pré-datado ou Dinheiro.

**Cena 4 — Preencha.** Em "O que está sendo cobrado", descreva, por exemplo, "Tratamento odontológico". Digite o valor total e, nas formas que têm vencimento, a data.

**Cena 5 — Boleto, Pix e cartão online.** Toque em "Continuar". O sistema cria a conta a receber e abre a janela de cobrança. Confirme e toque em "Gerar cobrança". Para boleto, você recebe a linha digitável; para Pix, o código copia e cola; para cartão, o link, com parcelamento em até 12 vezes. Envie ao paciente por WhatsApp ou e-mail. Quando ele pagar, a conta é baixada sozinha. Para isso a conta Asaas da clínica precisa estar conectada.

**Cena 6 — Maquininha e dinheiro.** Nessas duas formas o valor é lançado como já recebido, hoje. Toque em "Registrar recebimento".

**Cena 7 — Cheque pré-datado.** Informe o valor total, o vencimento do primeiro cheque, a quantidade de cheques e o intervalo entre eles: 7, 15 ou 30 dias. Cada cheque vira um lançamento a receber. Quando o cheque for compensado, dê baixa no Contas a Receber.

**Cena 8 — Na ficha do paciente.** Na aba "Financeiro" da ficha você vê o histórico do paciente: recebido, atrasado, a vencer e a pagar. Em cada conta em aberto há "Gerar boleto / Pix / cartão" e "Receber agora", com dinheiro, maquininha, Pix, transferência ou cheque compensado.

**Cena 9 — Gerar financeiro é diferente de Cobrar.** Lembre: "Gerar financeiro" cria a conta nova. "Cobrar" é para uma conta que já existe e está em atraso.

**Cena 10 — Resumo.** Resumindo: escolha o paciente, escolha a forma e gere. Boleto, Pix e cartão online passam pelo Asaas; dinheiro, maquininha e cheque entram direto no caixa. No próximo vídeo, Recebimentos online.

### Ficha rápida
- **O que faz:** Cria o financeiro (conta a receber) do paciente e já emite boleto, Pix ou link de cartão; ou registra cheque pré-datado, dinheiro e cartão da maquininha.
- **Como aplicar (passo a passo):**
  1. Abra Menu > Financeiro > Gerar financeiro (ou a ficha do paciente > aba Financeiro).
  2. Toque em "Gerar financeiro (buscar paciente)" e escolha o paciente.
  3. Escolha a forma: Boleto, Pix, Cartão (link), Cartão (maquininha), Cheque pré-datado ou Dinheiro.
  4. Descreva o que está cobrando e digite o valor.
  5. Informe o vencimento (e, no cheque, quantidade e intervalo).
  6. Toque em "Continuar" (boleto, Pix, cartão online), "Lançar cheque(s)" ou "Registrar recebimento".
  7. Em boleto, Pix e cartão online, toque em "Gerar cobrança" e envie o link ao paciente.
- **Diferença entre "Cobrar" e "Gerar financeiro":** "Gerar financeiro" CRIA a conta a receber e a forma de pagamento (boleto, Pix, cartão, cheque, dinheiro). "Cobrar" (Cobrar online, REVAH, régua) trabalha sobre uma conta que JÁ EXISTE e está pendente ou atrasada. Em resumo: primeiro se gera, depois, se atrasar, se cobra.
- **Com que frequência usar:** Sempre que o paciente fechar tratamento ou precisar pagar uma parcela.
- **Quem tem acesso:** Quem tem o módulo Financeiro e a permissão "criar" (Gestor e Financeiro, no padrão); o botão aparece também para quem vê Pacientes, mas o servidor recusa a gravação sem a permissão. A Recepção, no padrão, só consulta o Financeiro; o gestor pode liberar "criar" em Permissões.
- **Com que frequência precisa ser alimentado:** A cada novo tratamento ou parcela.
- **O que acontece se não for alimentado:** O paciente não tem conta a receber no sistema: o caixa, a previsão e os relatórios ficam sem essa receita; a régua de cobrança não tem o que cobrar; o selo "Financeiro OK" na lista de Pacientes não reflete a realidade.
- **Onde impacta (interação com outros itens):** Contas a Receber, Ficha do paciente (selo de inadimplência e histórico), Régua de cobrança, Recebimentos online (repasse), Agenda (bloqueio), Relatórios e Inteligência Financeira.
- **Erros comuns e dicas:** Tentar gerar boleto, Pix ou cartão online sem a conta Asaas conectada (a tela avisa e oferece conectar). Faltar CPF ou e-mail do paciente (o sistema pede). Cheque: lembrar de dar baixa quando compensar. Dica: o valor pode ser digitado com vírgula.

### Abas e seções deste item
**Lista de Pacientes com aviso.** Tela aberta pelo menu, com o botão "Gerar financeiro (buscar paciente)".

**Busca do paciente.** Janela "Gerar financeiro: de quem é?" com busca por nome, telefone ou CPF.

**Janela "Gerar financeiro".** Forma de cobrança, descrição, valor, vencimento, e quantidade e intervalo no cheque.

**Janela "Cobrar online".** Aberta em seguida para boleto, Pix e cartão: gera o link e permite WhatsApp, e-mail e divisão com o dentista.

**Aba Financeiro na ficha do paciente.** Botões por forma de cobrança, cartões Recebido, Atrasado, A vencer e A pagar ao paciente, histórico com selos "Recibo emitido" e nota fiscal, e botão "Abrir financeiro completo".

### Trilha de vídeos
- **Assistir antes:** V14 Pacientes (cadastro do paciente); V22 Orçamentos e Tratamentos (de onde vem o valor).
- **Assistir depois:** V45 Recebimentos online (conectar o Asaas); V41 Contas a Receber (acompanhar e dar baixa); V43 Cobranças (régua).
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item (perto do botão de acessibilidade), e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**Título:** Gere boleto, Pix e cartão do paciente
Passo a passo para criar o financeiro do paciente no CompletoDonto: boleto, Pix, cartão, cheque pré-datado ou dinheiro, em poucos toques.
#boleto #pix #clinicaodontologica #CompletoDonto #financeiro
---

---
## V45 — Recebimentos online
**Duração sugerida:** 5 a 7 minutos · **Onde fica no sistema:** Menu > Financeiro > Recebimentos online (/recebimentos-online). Seções: 1. Conta Asaas da clínica · 2. Carteira dos dentistas · 3. Extrato de repasses.

### Roteiro para narrar
**Cena 1 — Para que serve.** Neste vídeo você vai conectar a conta de recebimentos online da clínica e acompanhar o que é repassado aos dentistas.

**Cena 2 — Como funciona.** A clínica recebe na própria conta do Asaas, um serviço de pagamentos. O dinheiro cai direto nessa conta. O CompletoDonto só gera a cobrança e dá baixa quando o pagamento é confirmado.

**Cena 3 — Passo 1, conectar a conta.** Crie a conta no site do Asaas. Para testar sem dinheiro de verdade, use o ambiente de teste, chamado sandbox. No Asaas, gere a chave de API na área de Integrações. Volte ao CompletoDonto, cole a chave em "Chave de API do Asaas", escolha o ambiente (Teste ou Produção) e deixe ligada a chave "Cobranças online ativas". Toque em "Conectar".

**Cena 4 — O aviso automático.** Depois de conectar, o sistema tenta cadastrar um aviso automático, chamado webhook, para o Asaas informar cada pagamento. Se aparecer a mensagem verde, tudo certo: quando o paciente pagar, a conta é baixada sozinha. Se o cadastro automático falhar, a tela mostra a URL e o token para você cadastrar no Asaas em Integrações, Webhooks, e marcar os eventos de cobrança.

**Cena 5 — Passo 2, carteira dos dentistas.** Se a clínica divide o pagamento com os dentistas, cada dentista precisa de conta no Asaas. Cole o Wallet ID dele em "Wallet ID do Asaas" e toque em "Salvar carteira". A regra de repasse vem do cadastro do dentista no Corpo Clínico. Quando tudo está certo, aparece "Pronto para dividir".

**Cena 6 — Gerar cobrança com repasse.** Na janela "Cobrar online", escolha "Repassar parte a um dentista". Você pode usar a regra do cadastro, um percentual do valor líquido ou um valor fixo. O Asaas faz a divisão e o dentista recebe direto na carteira dele.

**Cena 7 — Passo 3, extrato de repasses.** Em "Extrato de repasses" filtre por dentista e por período de vencimento. Os cartões mostram, por dentista, o total confirmado, a receber e estornado. A lista indica cada repasse com a situação: aguardando pagamento, confirmado, estornado ou cancelado. Use o menu de exportar para baixar ou imprimir.

**Cena 8 — Resumo.** Resumindo: conecte a chave do Asaas, cadastre a carteira dos dentistas e acompanhe o extrato. Assim as cobranças online baixam sozinhas. No próximo vídeo, Digitalizar Financeiro.

### Ficha rápida
- **O que faz:** Conecta a conta Asaas da clínica (para boleto, Pix e cartão online), cadastra a carteira dos dentistas para divisão automática e mostra o extrato de repasses.
- **Como aplicar (passo a passo):**
  1. Abra Menu > Financeiro > Recebimentos online.
  2. Crie a conta no Asaas (use o ambiente de teste se quiser ensaiar) e gere a chave de API.
  3. Cole a chave, escolha o ambiente, deixe "Cobranças online ativas" ligada e toque em "Conectar".
  4. Confira se o aviso de pagamentos (webhook) ficou verde; se não, cadastre a URL e o token no Asaas.
  5. Cadastre o Wallet ID de cada dentista e toque em "Salvar carteira".
  6. Gere cobranças em Contas a Receber ("Cobrar online") escolhendo o repasse.
  7. Acompanhe o "Extrato de repasses" por dentista e período.
- **Com que frequência usar:** A conexão é feita uma vez (e quando trocar a chave). O extrato, toda semana ou conforme o acerto com os dentistas.
- **Quem tem acesso:** Item do menu para quem tem o módulo Financeiro. Ver o status da conta, conectar e salvar carteira exigem "aprovar" no servidor (Gestor e Financeiro); ver o extrato e a lista de dentistas exige "ver". Quem não tem a permissão vê uma mensagem de "Sem permissão". O gestor libera ou bloqueia em Permissões.
- **Com que frequência precisa ser alimentado:** Chave e webhook: uma vez. Carteira: uma vez por dentista. O extrato se alimenta sozinho conforme as cobranças com divisão são geradas e pagas.
- **O que acontece se não for alimentado:** Sem a conta Asaas conectada, "Cobrar online" e "Gerar financeiro" por boleto, Pix e cartão avisam que a conta não está conectada e não emitem cobrança. Sem o webhook, os pagamentos não baixam sozinhos e as contas ficam vencidas, a régua continua cobrando e o paciente aparece como inadimplente. Dentista sem carteira não recebe divisão ("sem carteira Asaas").
- **Onde impacta (interação com outros itens):** Contas a Receber (baixa automática), Gerar financeiro, Corpo Clínico (regra de repasse do dentista), Régua de cobrança, Relatórios e Inteligência Financeira.
- **Erros comuns e dicas:** Deixar no ambiente de teste e achar que o dinheiro é real (o sistema mostra "Teste (sandbox)" ou "Produção (dinheiro real)"). Colar a chave errada. Esquecer a regra de repasse no cadastro do dentista. Dica: teste primeiro no ambiente de teste. Para trocar a chave, cole a nova; deixando vazio, mantém a atual.

### Abas e seções deste item
**1. Conta Asaas da clínica.** Situação (Conectada, Desativada, Não conectada), ambiente, chave de API, chave "Cobranças online ativas", botão Conectar/Salvar e situação do webhook.

**2. Carteira dos dentistas.** Para cada dentista: situação, regra de repasse e campo Wallet ID com botão "Salvar carteira".

**3. Extrato de repasses.** Filtros por dentista e datas, totais por dentista, lista de repasses e exportação.

### Trilha de vídeos
- **Assistir antes:** V41 Contas a Receber (onde a cobrança nasce); V07 Corpo Clínico (regra de repasse do dentista); V04 Integrações.
- **Assistir depois:** V44 Gerar financeiro (usar o Asaas na prática); V43 Cobranças (régua); V74 Inteligência Financeira.
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item (perto do botão de acessibilidade), e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**Título:** Receba online e divida com o dentista
Conecte a conta de recebimentos da clínica ao CompletoDonto, receba por Pix, boleto e cartão com baixa automática e acompanhe os repasses aos dentistas.
#pixonline #recebimentos #clinicaodontologica #CompletoDonto #odontologia
---

---
## V46 — Digitalizar Financeiro
**Duração sugerida:** 3 a 5 minutos · **Onde fica no sistema:** Menu > Financeiro > Digitalizar Financeiro (/financeiro/digitalizar). Também no botão "Digitalizar conta/nota" da Visão geral.

### Roteiro para narrar
**Cena 1 — Para que serve.** Neste vídeo você aprende a Digitalizar Financeiro: registrar boletos, notas, recibos e comprovantes tirando uma foto ou anexando o arquivo.

**Cena 2 — Capturar o documento.** Abra Financeiro e toque em Digitalizar Financeiro. Toque em "Capturar foto / arquivo". No celular, a câmera abre; no computador, você escolhe uma imagem ou um PDF. O nome do arquivo aparece na tela.

**Cena 3 — Classificar.** Escolha o "Tipo de documento": Boleto, Nota fiscal, Recibo, Comprovante ou Outro. Em "Escrituração" escolha Livro Caixa ou Empresa. Em "Natureza" escolha se é conta ou despesa, ou recebimento ou receita.

**Cena 4 — Preencher os dados.** Digite o código de barras ou a linha digitável, se houver, a descrição, a pessoa ou fornecedor, o valor e o vencimento. A tela avisa que o sistema captura a foto ou arquivo e você confere os dados antes de lançar. A leitura automática do texto da foto ainda não está ligada, então você mesmo digita os dados.

**Cena 5 — Lançar.** Toque em "Conferir e lançar". Aparece "Documento registrado no financeiro". Descrição, pessoa, valor e vencimento são obrigatórios.

**Cena 6 — Atenção.** Confira no sistema, depois de lançar, se o lançamento aparece na lista da Visão geral do Financeiro (conferir na tela antes de gravar: nesta versão, o registro feito aqui é salvo no próprio navegador e pode não aparecer na lista principal do Financeiro).

**Cena 7 — Resumo.** Resumindo: tire a foto, classifique o documento e preencha os dados. Escolha Livro Caixa ou Empresa. Confira antes de lançar. No próximo vídeo, o Rateio do condomínio.

### Ficha rápida
- **O que faz:** Registra boletos, notas, recibos e comprovantes a partir de foto ou arquivo, com classificação por tipo de documento e por Livro Caixa ou Empresa.
- **Como aplicar (passo a passo):**
  1. Abra Menu > Financeiro > Digitalizar Financeiro.
  2. Toque em "Capturar foto / arquivo" e escolha a foto ou o PDF.
  3. Escolha o tipo de documento (Boleto, Nota fiscal, Recibo, Comprovante, Outro).
  4. Escolha a escrituração (Livro Caixa ou Empresa) e a natureza (conta/despesa ou recebimento/receita).
  5. Preencha código de barras (opcional), descrição, pessoa, valor e vencimento.
  6. Toque em "Conferir e lançar".
  7. Confira se o lançamento ficou correto.
- **Com que frequência usar:** Sempre que chegar um boleto, nota ou comprovante para registrar.
- **Quem tem acesso:** Item do menu para quem tem o módulo Financeiro (Gestor, Financeiro, Recepção, Administração e Contador consultam). Esta tela guarda os dados no navegador e não passa por permissão de gravação do servidor (conferir na tela antes de gravar). O gestor pode liberar ou bloquear o item em Permissões.
- **Com que frequência precisa ser alimentado:** A cada documento recebido.
- **O que acontece se não for alimentado:** Contas e comprovantes ficam fora do sistema: o caixa e a previsão não refletem esses valores, o aviso de conta vencida não aparece para o que não foi lançado, e o contador recebe informações incompletas.
- **Onde impacta (interação com outros itens):** Visão geral do Financeiro, Contas a Pagar e a Receber, Contábil e Fiscal e Relatórios (conferir na tela antes de gravar se o registro entra nesses módulos).
- **Erros comuns e dicas:** Esperar que o sistema leia a foto sozinho (a leitura automática não está ligada). Esquecer de escolher Livro Caixa ou Empresa. Lançar o mesmo documento duas vezes. Dica: se o documento é uma conta comum, também dá para lançar direto em "Novo lançamento" nas Contas a Pagar.

### Abas e seções deste item
**Capturar foto / arquivo.** Abre a câmera ou o seletor de arquivo (imagem ou PDF).

**Classificação.** Tipo de documento, escrituração (Livro Caixa ou Empresa) e natureza.

**Dados do lançamento.** Código de barras ou linha digitável, descrição, pessoa, valor e vencimento.

**Conferir e lançar.** Registra o documento e mostra a mensagem de confirmação.

### Trilha de vídeos
- **Assistir antes:** V42 Contas a Pagar (lançar contas sem foto); V40 Financeiro: visão geral.
- **Assistir depois:** V51 Contábil e Fiscal (o que o contador usa); V47 Rateio do condomínio.
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item (perto do botão de acessibilidade), e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**Título:** Tire foto da conta e lance no sistema
Aprenda a digitalizar boletos, notas e comprovantes no CompletoDonto e classificar em Livro Caixa ou Empresa.
#digitalizar #boleto #clinicaodontologica #CompletoDonto #organizacaofinanceira
---

---
## V47 — Rateio do condomínio
**Duração sugerida:** 4 a 6 minutos · **Onde fica no sistema:** Menu > Financeiro > Rateio do condomínio (/rateio-condominio). Blocos: Mês e condôminos · Funcionários · Despesas do mês · Resumo e rateio.

### Roteiro para narrar
**Cena 1 — Para que serve.** Neste vídeo você aprende o Rateio do condomínio. É para clínicas que dividem o espaço e as despesas com outros profissionais, os condôminos. O sistema soma tudo, calcula 13º, férias e encargos e diz quanto cada um paga.

**Cena 2 — Mês e condôminos.** Abra Financeiro e toque em Rateio do condomínio. Escolha o mês. Digite o número de condôminos, isto é, em quantas partes a conta será dividida. Se o mês ainda não foi salvo, o sistema copia os valores do mês anterior para você só ajustar.

**Cena 3 — Funcionários.** No bloco Funcionários, toque em "Adicionar funcionário", digite o nome e o salário. Repita para cada um. O lixo à direita remove. Depois digite o percentual de encargos, que incide sobre a folha somada com o 13º e as férias. A previsão de 13º é a folha dividida por 12. A previsão de férias é a folha dividida por 12 mais um terço. O sistema calcula tudo sozinho.

**Cena 4 — Despesas do mês.** No bloco Despesas do mês preencha o que houver: água, luz, telefone, internet, IPTU, condomínio do prédio, material de limpeza, contador, síndico, fundo de reserva, gastos bancários, consertos e outros. Em "Outros" você pode escrever uma descrição.

**Cena 5 — Resumo e rateio.** O bloco final mostra a folha de salários, a previsão de 13º, a previsão de férias, os encargos, as demais despesas, o total do mês e o valor por condômino. Se você ainda não informou o número de condôminos, a tela avisa.

**Cena 6 — Salvar e imprimir.** Toque em "Salvar rateio" para guardar o mês. Toque em "Imprimir" para entregar aos condôminos.

**Cena 7 — Resumo.** Resumindo: informe o mês e o número de condôminos, lance funcionários e despesas e salve. O sistema devolve o total e o valor de cada um. Este foi o último vídeo do Financeiro. Para olhar os números, veja a Inteligência Financeira.

### Ficha rápida
- **O que faz:** Calcula o rateio mensal de despesas compartilhadas: folha de funcionários, 13º, férias, encargos e despesas fixas, dividindo pelo número de condôminos.
- **Como aplicar (passo a passo):**
  1. Abra Menu > Financeiro > Rateio do condomínio.
  2. Escolha o mês.
  3. Informe o número de condôminos.
  4. Adicione os funcionários com nome e salário e informe o percentual de encargos.
  5. Preencha as despesas do mês (água, luz, IPTU etc.).
  6. Confira o "Resumo e rateio" (total do mês e valor por condômino).
  7. Toque em "Salvar rateio" e, se quiser, em "Imprimir".
- **Com que frequência usar:** Uma vez por mês.
- **Quem tem acesso:** Item do menu para quem tem o módulo Financeiro. Ver exige "ver" e salvar exige "editar" do Financeiro (Gestor e Financeiro); Recepção e Administração só consultam. O gestor libera ou bloqueia em Permissões.
- **Com que frequência precisa ser alimentado:** Todo mês (o sistema copia o mês anterior para facilitar).
- **O que acontece se não for alimentado:** O mês fica sem rateio salvo e sem valor por condômino; se o número de condôminos não for informado, o valor por cada um não aparece; valores copiados do mês anterior podem ficar desatualizados se você não ajustar e salvar.
- **Onde impacta (interação com outros itens):** Esta tela guarda o próprio cálculo. Conferir na tela antes de gravar se ela gera lançamentos automáticos em Contas a Pagar ou a Receber (no código lido, ela só calcula e salva o rateio do mês).
- **Erros comuns e dicas:** Esquecer o número de condôminos. Digitar salário sem vírgula. Esquecer de salvar antes de trocar de mês. Dica: ao abrir um mês novo, confira os valores copiados antes de salvar.

### Abas e seções deste item
**Mês e condôminos.** Seleção do mês e número de condôminos.

**Funcionários.** Tabela de nome e salário, botão de adicionar e remover, e campo de encargos em percentual.

**Despesas do mês.** Treze campos de despesas e descrição de "Outros".

**Resumo e rateio.** Tabela com folha, 13º, férias, encargos, demais despesas, total, condôminos e valor por condômino; botões "Salvar rateio" e "Imprimir".

### Trilha de vídeos
- **Assistir antes:** V42 Contas a Pagar (para ter as despesas organizadas).
- **Assistir depois:** V74 Inteligência Financeira (ver o peso das despesas); V77 Relatórios.
- **Onde encontrar:** Dentro do sistema, no ícone de vídeo no canto da tela de cada item (perto do botão de acessibilidade), e na playlist com o mesmo título.

### Texto para publicar (YouTube, Instagram e TikTok)
**Título:** Rateio do condomínio sem planilha
Divida as despesas do espaço compartilhado: o CompletoDonto calcula 13º, férias, encargos e o valor de cada condômino.
#rateio #condominio #clinicaodontologica #CompletoDonto #gestao
---
