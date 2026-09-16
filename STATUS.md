# STATUS — DentalPos One — coordenação entre sessões

Este arquivo vive no repositório (raiz) e é a fonte de verdade de quem está fazendo o quê. Regra única: **sempre `git pull` antes de começar, sempre `git push` (incluindo a atualização deste arquivo) antes de terminar.** Nunca deixe mudança só local quando parar de trabalhar.

Ao pegar uma tarefa: mude o status pra `EM ANDAMENTO — <nome/sessão>`. Ao terminar: `CONCLUÍDA` + uma linha do que mudou + quais arquivos.

---

## Frente A — tarefas pequenas e isoladas (sessão com menos tokens)

### A1. Confirmar e-mail interno do demo — status: PENDENTE
Criar uma demo nova e confirmar se o e-mail de aviso chegou em `contato@dentalpos.com.br` (o de boas-vindas já foi confirmado; falta só esse). Se não chegar, olhar `backend/src/controllers/demoController.ts`, função de registro — o código do segundo e-mail é idêntico ao primeiro, então se um funciona o outro deveria também.

### A2. Corrigir `getOperationalAlerts` no OperationsHubService — status: PENDENTE
Arquivo: `frontend/src/services/OperationsHubService.ts`. Ainda lê o financeiro mock (`FinanceHubService`) em vez do real (`FinancialApi.ts`). Sem uso confirmado hoje (função parece não estar chamada em nenhuma tela agora), mas por segurança vale migrar pro mesmo padrão já usado em `Patients.tsx`/`Agenda.tsx` hoje: buscar via `loadFinancialEntries()` e computar os alertas a partir daí.

### A3. Validar Sala de Espera em tempo real — status: PENDENTE
Não é código novo, é QA: abrir a tela de Sala de Espera com dois usuários (ou duas abas) e confirmar que o painel atualiza sozinho conforme o paciente avança (check-in → aguardando → em atendimento → saída). Só reportar o que encontrar; corrigir só se achar bug concreto.

**Não mexer em:** Agenda.tsx, navigation.tsx, Financial.tsx, LeadDiscovery.tsx, backend/prisma/schema.prisma (Frente B pode estar mexendo nesses).

---

## Frente B — tarefas maiores (sessão com mais créditos)

### B1. Permissão real pra `/backup` e `/homologacao`
Hoje só saíram do menu; a URL ainda é acessível por qualquer usuário logado. Precisa de um conceito novo de papel "equipe WMundi" (hoje só existe papel por clínica: médico/recepção/admin), e bloquear essas duas rotas (frontend + idealmente backend também) pra só esse papel.

### B2. Feedback visual em botões de ação (sistema inteiro)
Todo botão de ação deve confirmar visualmente que o comando aconteceu (ex.: toast/snackbar "Mensagem enviada", "Salvo com sucesso"). Hoje os botões só piscam. Sugestão de abordagem: criar um utilitário global de notificação (ex.: um contexto React + Snackbar do MUI) e ir aplicando tela por tela, começando pelas mais usadas (Agenda, Pacientes, Financeiro).

### B3. Sistema de pendências com responsável + pontuação
Toda pendência/alerta do sistema (existem vários hoje, espalhados: alertas operacionais, obrigações fiscais, etc.) precisa de: responsável designado, botão "resolver" que registra quem resolveu, e isso alimentando pontos na avaliação do funcionário — 1 ponto se o responsável original resolve, mais de 1 se outra pessoa resolve (incentiva proatividade). Precisa de modelo novo no banco (histórico de resolução + pontuação por usuário) e uma tela de "minha pontuação"/ranking.

### B4. Contrato pago + cobrança pela extração de Leads
A tela `LeadDiscovery.tsx` já tem o checkbox de responsabilidade/LGPD. Falta: o contrato de fato (termo assinado, não só um checkbox) e a cobrança (depende de existir algum sistema de planos/add-ons — hoje os planos EXPERIENCE/BASIC/MEDIUM/PREMIUM existem só como conceito na landing page, não como paywall funcional).

### B5. Migrar telas de contabilidade mock pro backend real
`Accounting.tsx` ("Contábil e Fiscal", 999 linhas) e a tela "Automação Fiscal" ainda usam dado mock/estático (`AccountingService`), paralelo ao Backoffice (que já é real, migrado hoje). Mesmo padrão de investigação que foi usado pra migrar `Financial.tsx` hoje: primeiro mapear o que já existe de real no backend (`backofficeController.ts` já tem bastante coisa pronta) antes de decidir o que precisa ser construído.

### B6. Revisar as 3 telas financeiras não abertas ainda
`PaymentCenter.tsx`, `HumanResources.tsx`, `FinancialScanner.tsx` — ainda não foram sequer abertas hoje. Podem estar lendo o financeiro mock antigo (`FinanceHubService`), mesmo padrão de bug já corrigido em outros lugares.

### B7. Webhook de resposta do paciente via WhatsApp
Paciente confirmar/cancelar respondendo a mensagem do WhatsApp, e o sistema liberar o horário sozinho. Não existe nenhum webhook de entrada de mensageria hoje (só webhook de pagamento). Combinado fazer depois do módulo Paciente — já estamos depois, pode entrar na fila quando fizer sentido.

### B8. Resto do roadmap original do plano mestre
Design/CAD-CAM (revisão), Administrativo (permissões por cargo + biometria), Gestão (hora clínica/precificação), DentalPos Sales (loja virtual — projeto grande à parte, tratar isolado), Acadêmico, Configurações (importação de base externa), e a reorganização do menu em 4 grupos simplificados (nunca foi feita — hoje são ~40 itens em 9 grupos).

**Não mexer em:** os arquivos que a Frente A estiver com status EM ANDAMENTO (ver seção acima).

---

## Credenciais e acessos (não duplicar aqui — ver HANDOFF-DentalPos-One.md)

Toda credencial (GitHub, Vercel, Supabase, banco) está no `HANDOFF-DentalPos-One.md` já entregue separadamente. Este arquivo (`STATUS.md`) é só sobre divisão de tarefas — mantenha assim pra não vazar senha se este arquivo for compartilhado com mais gente no futuro.
