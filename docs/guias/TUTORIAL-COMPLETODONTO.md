# Tutorial do CompletoDonto: o que cada função faz e como usar

Para quem é: dentistas, recepção, financeiro, RH, laboratório e gestor. Cada pessoa vê só o menu do seu setor (veja `docs/ACESSOS-POR-SETOR.md`).

## Como a tela funciona

- **Menu (hambúrguer, canto esquerdo):** abre a lista de setores. No computador ele fica na lateral; no celular, atrás do ícone de três linhas.
- **Triângulo amarelo (alertas críticos), em cima:** mostra quantos alertas o seu setor tem. Toque para ver por departamento. Tocando no problema, o sistema leva para a tela onde se resolve, com o que fazer e o procedimento (POP). Administrador e gestor veem todos os setores.
- **Lâmpada laranja (caixinha de sugestões):** conte a melhoria que você quer ou relate um erro. Escolha o departamento e envie.
- **Pesquisa:** digite o nome da tela para ir direto (atalho `/`).
- **Menu de três pontinhos (celular):** imprimir, relatar problema, modo escuro, notificações e sair.
- **Tela inicial:** calendário com um pontinho nos dias com consulta, agenda do dia só com o nome do paciente e os alertas por departamento.

## Rotina do dia, em 5 passos

1. Abra a **Tela inicial** e veja a agenda do dia e o triângulo amarelo.
2. Resolva os alertas do seu setor (toque no alerta).
3. Atenda pela **Agenda** e registre no **Prontuário**.
4. Gere o financeiro do que foi feito e confira o **Caixa diário**.
5. Antes de sair, veja de novo o triângulo: o que ficou pendente continua no dia seguinte.

---

## RECEPÇÃO

### Agenda
- **Celular:** o dia fica no topo; as setas simples andam **1 dia** e as duplas **1 semana**. O botão azul de três linhas, à direita, abre: Novo agendamento, Novo compromisso, Dia/Semana/Mês, Ir para hoje, Imprimir, Baixar e Busca/filtros.
- **Dentistas:** quadradinhos coloridos com as iniciais. Toque em um para ver só a agenda dele; toque em "Todos" para ver todos. Os nomes e as cores estão no menu da esquerda.
- **Por dia:** lista com horário, paciente, aviso de pendência (financeiro, laboratório, material) e procedimento.
- **Novo agendamento:** escolha o paciente (ou cadastre ali mesmo um paciente novo), o dentista, o procedimento, o dia e o horário. O sistema sugere a duração.
- **Remarcar:** arraste o agendamento (computador) ou abra e escolha outro horário. O sistema pede o motivo.
- **Duração:** no computador, arraste a borda de baixo do agendamento.
- **Almoço e bloqueios:** em *Mais opções > Jornada / bloqueios* ficam os horários de cada dentista. O horário de almoço aparece bloqueado, exceto se o dentista atender nele.
- **Compromisso:** reserva um horário que não é paciente (reunião, curso).
- **Imprimir ou baixar** a agenda por período (de/até).

### Agendamento online
Link para o paciente marcar sozinho. Copie em *Recepção > Agendamento online*. Veja o passo a passo em `INTEGRACOES-PASSO-A-PASSO.md`.

### Pacientes e Jornada do paciente
- **Cadastro:** nome, telefone, e-mail, CPF, endereço. Telefone e e-mail corretos fazem os avisos chegarem.
- **Ficha do paciente:** reúne prontuário, odontograma, orçamentos, financeiro, arquivos e escaneamentos.
- **Chave "só orçamento / tratamento confirmado":** na ficha, marca em que fase o paciente está. Ao confirmar o tratamento, o orçamento escolhido vira plano de tratamento.
- **Jornada do paciente:** mostra o caminho de cada paciente (agendado, atendido, orçamento, tratamento, retorno).

### Chegada por rosto e Painel de atendimentos
O paciente se identifica ao chegar; o painel mostra quem está na sala de espera e em atendimento.

### Avaliação do atendimento
Pesquisa de satisfação enviada ao paciente. As notas aparecem para o gestor.

### Clube da clínica (equipe)
Campanha da equipe, cashback e avaliações. Valores em reais só para o gestor.

---

## CLÍNICO

### Prontuário e odontograma
- **Anamnese:** preencha uma vez; fica salva com histórico de alterações.
- **Odontograma:** toque no dente para marcar procedimento. **Vários dentes ao mesmo tempo:** selecione os dentes e repita a marcação/planejamento.
- **Evolução:** a cada atendimento, registre o que foi feito. Ao registrar, o **estoque dá baixa** dos materiais ligados ao procedimento.
- **Assinatura da evolução:** o paciente e o dentista assinam eletronicamente.

### Orçamentos e tratamentos
1. Monte o orçamento com os procedimentos (lista em ordem alfabética; Ortodontia e Implantes têm todos os procedimentos).
2. Envie ao paciente.
3. Quando aprovar, marque **tratamento confirmado**. O sistema prepara o plano e o financeiro.
4. Procedimentos novos que não estavam no orçamento geram alerta "passar orçamento ao paciente".

### Documentos clínicos
Atestados, receitas, termos de consentimento, com papel timbrado da clínica. Escolha o modelo, preencha e imprima ou envie.

### Escaneamentos
Pastas por paciente, em ordem alfabética ou por data. Pesquise por nome, data ou ordem alfabética. Há atalho também dentro do prontuário do paciente.

### Kit da clínica, Equipe, IA
- **Kit da clínica:** materiais e kits por procedimento.
- **Equipe:** profissionais da clínica.
- **CompletoDonto AI / Assistente de IA:** perguntas sobre a clínica e apoio a textos. Usa créditos (veja *Configurações*).

---

## LABORATÓRIO

- **Laboratório / Ordens do laboratório:** abra uma ordem de serviço (paciente, trabalho, material, prazo). Acompanhe os status: recebido, em produção, pronto, entregue.
- **Data de pronto e andamento:** o laboratório atualiza; a clínica vê na agenda quando o trabalho está atrasado.
- **Fila do laboratório:** fica no alerta crítico até a entrega.
- **Etiquetas e impressão da ordem:** botões na própria ordem.

---

## MARKETING

- **CRM e Leads:** quadro de contatos interessados (funil). Arraste entre as etapas.
- **Comunicações e Chatbot e IA:** mensagens automáticas e atendimento por inteligência artificial.
- **Recall e Reativação:** convida pacientes ausentes para retorno, por e-mail e WhatsApp, com o link da agenda online. Configure o período (30, 60, 90 dias...) e o limite diário.
- **Campanha de final de ano:** lista pacientes sem consulta marcada com o botão **Enviar no WhatsApp** (abre a conversa com a mensagem pronta e o link da agenda). Marca quem já recebeu e baixa planilha. Escolha "Todos os pacientes" ou "mais de X dias".
- **Central de Marketing:** marca, textos e peças.
- **Canais de Envio:** onde ligar e-mail, WhatsApp, SMS e Telegram (veja o guia de integrações).
- **Indicador profissional:** o paciente encontra profissionais por cidade, sem ver o contato; o pedido vai por mensagem automática. O profissional só aparece se ligar e aceitar os termos.

---

## FINANCEIRO (só o setor Financeiro, administrador e gestor veem contas a pagar)

- **Visão geral:** resultado, a receber, a pagar, vencimentos dos próximos 7 dias.
- **Contas a receber:** lançamentos dos pacientes. Botão **Gerar financeiro** (cria Pix, boleto, cartão, cheque ou dinheiro). A palavra **Cobrar** é só para cobrança de atraso.
- **Contas a pagar:** despesas, boletos, fornecedores. Só o Financeiro enxerga.
- **Cobranças:** a régua de cobrança de atraso; pessoas em atraso, mensagens enviadas.
- **Recebimentos online:** conecta o Asaas (Pix/boleto/cartão), cadastra a carteira dos dentistas e mostra o extrato de repasses.
- **Assinatura do paciente:** o paciente paga uma mensalidade por Pix, ela vira **crédito**, e ao usar o crédito num tratamento ele ganha **desconto de 5% a 10%** (definido por plano).
  1. Aba **Planos:** crie o plano (nome, mensalidade, crédito, desconto de 5% a 10%).
  2. Aba **Assinantes > Nova assinatura:** escolha o paciente e o plano; o Pix da 1ª mensalidade é gerado.
  3. **Enviar Pix:** manda por e-mail e abre o WhatsApp com a mensagem pronta.
  4. **Pago na clínica:** baixa manual quando o paciente pagou direto na clínica.
  5. **Usar crédito:** informe o procedimento e o valor; o sistema mostra o desconto e quanto sai do saldo.
  6. **Extrato:** todos os movimentos do saldo.
  A cobrança dos meses seguintes é gerada sozinha 3 dias antes do vencimento. Atraso de mais de 5 dias marca "em atraso".
- **Digitalizar Financeiro:** fotografe ou envie boleto/nota; o sistema lê os dados.
- **Fechamento de caixa (Caixa diário):** cada linha mostra quem pagou, a forma, quem recebeu e se o valor ficou no **caixa** ou foi para uma **conta**. Dinheiro fica no caixa por padrão; o resto vai para conta; recebimentos do Asaas vão para a "Conta Asaas".
- **Rateio do condomínio:** divide custos de um espaço entre usuários.
- **Lembretes de vencimento:** e-mail 10, 7 e 1 dia antes e no dia, para contas a pagar, impostos, validade de produtos e documentos. Configure em *Configurações > Lembretes de vencimento*.

---

## ADMINISTRATIVO

- **Backoffice, Contábil e Fiscal, Automação Fiscal:** recibos, Receita Saúde, portal do contador.
- **Evidências operacionais e Gestão operacional:** fotos e registros do que foi feito (auditoria).
- **Corpo clínico:** cadastro e documentos dos dentistas.
- **RH e Gestão de Pessoas (só Financeiro, RH, administrador e gestor):** colaboradores, salários, folha de pagamento, ponto e documentos. Tem **cofre do RH com login próprio**.
- **Ponto por rosto / Meu ponto:** ponto da equipe pelo aparelho da clínica; cada colaborador vê só o próprio.

---

## GESTÃO

- **Dashboard e Painel executivo:** números do dia, do mês e da clínica.
- **Centro de comando e Centro de inteligência:** alertas e recomendações.
- **Inteligência financeira, Índice de saúde da clínica, Benchmark, Relatórios.**
- **Alertas críticos:** são os mesmos do triângulo amarelo; aqui o gestor vê todos os setores.

---

## ESTOQUE (CompletoDonto Sales)

- **Estoque:** produtos, quantidade, mínimo, validade.
- **Consumo por procedimento:** envie a planilha (modelo para baixar) ligando cada procedimento aos materiais. Modo **baixa** tira a quantidade; modo **contagem** só conta o uso (ex.: uma bisnaga de resina serve para várias restaurações).
- **Histórico de duração:** a cada reposição o sistema guarda quantos procedimentos o produto durou e **avisa antes de acabar**.
- **Reposição / terminou uma unidade:** registre quando chegou produto novo ou quando uma unidade acabou.
- **Loja e vendas:** venda de produtos da clínica.

---

## ACADÊMICO

Alunos, cursos, professores, turmas, financeiro acadêmico e frequência/documentos. Acadêmicos têm regras próprias de gratuidade.

---

## CONFIGURAÇÕES

- **Configurações:** dados da clínica, logo, horários, lembretes, assinatura do sistema (Minha assinatura: cartão, cancelar, reativar).
- **Permissões:** quem vê o quê. Atribua cada usuário ao **seu setor** (perfil). Veja `docs/ACESSOS-POR-SETOR.md`.
- **Integrações / Importar dados / Importar pacientes:** veja `INTEGRACOES-PASSO-A-PASSO.md`.
- **Clínicas e unidades:** várias unidades na mesma conta.
- **Sugestões e problemas:** lista do que a equipe enviou pela caixinha.
- **Créditos:** saldo para IA, SMS e voz; compre pacotes quando acabar.

---

## Dúvidas rápidas

- **Não vejo um menu:** seu setor não tem acesso. Peça ao administrador ou ao gestor em *Configurações > Permissões*.
- **Contas a pagar sumiu:** é só do Financeiro, administrador e gestor.
- **Pix pago e não baixou:** veja o passo do webhook em `INTEGRACOES-PASSO-A-PASSO.md`.
- **Mensagem não chegou:** confira telefone/e-mail do paciente e o canal em Canais de Envio.
- **Algo errado na tela:** use a lâmpada laranja (caixinha de sugestões), escolha "Relatar erro".
