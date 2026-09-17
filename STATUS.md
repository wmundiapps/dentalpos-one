# STATUS — DentalPos One — pendências

Lista única de pendências, trabalhadas em sequência nesta sessão. Ao terminar uma: marcar CONCLUÍDA + o que mudou + quais arquivos, `git pull`, commit, push.

---

### 1. Confirmar e-mail interno do demo — status: **CONCLUÍDA** (testado em 16/09/2026)
Criar uma demo nova e confirmar se o e-mail de aviso chegou em `contato@dentalpos.com.br` (o de boas-vindas já foi confirmado).

### 2. Corrigir `getOperationalAlerts` no OperationsHubService — status: **CONCLUÍDA**
Revisado em 16/09/2026: o código ainda usava o financeiro mock (Dashboard e Agenda chamavam `getOperationalAlerts()` sem dados reais). Corrigido só em `frontend/src/services/OperationsHubService.ts`: os alertas financeiros passam a usar `loadFinancialEntries()` (memória com atualização a cada 30s, descartada ao trocar de login), com conversão dos campos reais e correção da comparação de datas no alerta "Conferir cobrança". Modo demo continua usando o mock.

_Registro anterior (não correspondia ao código):_ `getOperationalAlerts()` agora aceita lançamentos financeiros reais como parâmetro opcional; `Dashboard.tsx` e `Agenda.tsx` já buscam e passam o dado real. Arquivos: `frontend/src/services/OperationsHubService.ts`, `frontend/src/pages/Agenda.tsx`, `frontend/src/pages/Dashboard.tsx`.

### 3. Validar Sala de Espera em tempo real — status: PENDENTE (depende de teste manual do Robson)
Abrir com duas abas e confirmar que o painel atualiza sozinho conforme o paciente avança.

### 4. Permissão real pra `/backup` e `/homologacao` — status: **CONCLUÍDA** (testado na pratica em 16/09/2026)
Nova trava (`requireWmundiStaff`) que nem o papel ADMIN da clínica ultrapassa — só e-mails da equipe WMundi (hoje: `contato@dentalpos.com.br`, configurável via `WMUNDI_STAFF_EMAILS`). Aplicada na rota real do backend e nas duas rotas do frontend. Arquivos: `backend/src/middleware/permission.ts`, `backend/src/routes/index.ts`, `frontend/src/routes/AppRoutes.tsx`, `frontend/src/components/WmundiStaffOnly.tsx` (novo).

### 5. Feedback visual em botões de ação (sistema inteiro) — status: PENDENTE

### 6. Sistema de pendências com responsável + pontuação — status: PENDENTE

### 7. Contrato pago + cobrança pela extração de Leads — status: PENDENTE

### 8. Migrar telas de contabilidade mock pro backend real (Contábil e Fiscal, Automação Fiscal) — status: PENDENTE

### 9. Revisar as 3 telas financeiras não abertas ainda (PaymentCenter.tsx, HumanResources.tsx, FinancialScanner.tsx) — status: PENDENTE

### 10. Webhook de resposta do paciente via WhatsApp — status: PENDENTE

### 11. Resto do roadmap original do plano mestre — status: PENDENTE
Design/CAD-CAM, Administrativo (permissões + biometria), Gestão (hora clínica/precificação), DentalPos Sales, Acadêmico, Configurações, reorganização do menu em 4 grupos.

### 12. Etapa final de segurança — status: PENDENTE
- Verificação em duas etapas: GitHub, Vercel, Supabase, Resend e Claude.
- Limite de tentativas de login; regra de senha forte; expiração de sessão por inatividade.
- Restringir conexões ao banco Supabase; conferir e testar backup automático.
- Auditoria de acesso/alteração de dados de pacientes (LGPD).
- Unificar a lista de e-mails da equipe WMundi (hoje duplicada em `permission.ts` e `WmundiStaffOnly.tsx`).
- Revisar 1 vulnerabilidade alta do `npm audit` no frontend (não rodar `npm audit fix` sem revisão).

---

## Credenciais e acessos

Ver `HANDOFF-DentalPos-One.md`, entregue separadamente e **nunca commitado neste repositório** (confirmado via `git log --all -- "HANDOFF*"`). O `.gitignore` também bloqueia `HANDOFF*.md`.
