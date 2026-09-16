# STATUS — DentalPos One — pendências

Lista única de pendências, trabalhadas em sequência nesta sessão. Ao terminar uma: marcar CONCLUÍDA + o que mudou + quais arquivos, `git pull`, commit, push.

---

### 1. Confirmar e-mail interno do demo — status: PENDENTE (depende de teste manual do Robson)
Criar uma demo nova e confirmar se o e-mail de aviso chegou em `contato@dentalpos.com.br` (o de boas-vindas já foi confirmado).

### 2. Corrigir `getOperationalAlerts` no OperationsHubService — status: **CONCLUÍDA**
`getOperationalAlerts()` agora aceita lançamentos financeiros reais como parâmetro opcional; `Dashboard.tsx` e `Agenda.tsx` já buscam e passam o dado real. Arquivos: `frontend/src/services/OperationsHubService.ts`, `frontend/src/pages/Agenda.tsx`, `frontend/src/pages/Dashboard.tsx`.

### 3. Validar Sala de Espera em tempo real — status: PENDENTE (depende de teste manual do Robson)
Abrir com duas abas e confirmar que o painel atualiza sozinho conforme o paciente avança.

### 4. Permissão real pra `/backup` e `/homologacao` — status: **CONCLUÍDA**
Nova trava (`requireWmundiStaff`) que nem o papel ADMIN da clínica ultrapassa — só e-mails da equipe WMundi (hoje: `contato@dentalpos.com.br`, configurável via `WMUNDI_STAFF_EMAILS`). Aplicada na rota real do backend e nas duas rotas do frontend. Arquivos: `backend/src/middleware/permission.ts`, `backend/src/routes/index.ts`, `frontend/src/routes/AppRoutes.tsx`, `frontend/src/components/WmundiStaffOnly.tsx` (novo).

### 5. Feedback visual em botões de ação (sistema inteiro) — status: PENDENTE

### 6. Sistema de pendências com responsável + pontuação — status: PENDENTE

### 7. Contrato pago + cobrança pela extração de Leads — status: PENDENTE

### 8. Migrar telas de contabilidade mock pro backend real (Contábil e Fiscal, Automação Fiscal) — status: PENDENTE

### 9. Revisar as 3 telas financeiras não abertas ainda (PaymentCenter.tsx, HumanResources.tsx, FinancialScanner.tsx) — status: PENDENTE

### 10. Webhook de resposta do paciente via WhatsApp — status: PENDENTE

### 11. Resto do roadmap original do plano mestre — status: PENDENTE
Design/CAD-CAM, Administrativo (permissões + biometria), Gestão (hora clínica/precificação), DentalPos Sales, Acadêmico, Configurações, reorganização do menu em 4 grupos.

---

## Credenciais e acessos

Ver `HANDOFF-DentalPos-One.md`, entregue separadamente e **nunca commitado neste repositório** (confirmado via `git log --all -- "HANDOFF*"`). O `.gitignore` também bloqueia `HANDOFF*.md`.
