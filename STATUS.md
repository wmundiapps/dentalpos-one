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

### 5. Feedback visual em botões de ação (sistema inteiro) — status: **CONCLUÍDA** (07/10/2026)
Barra de progresso no topo + aviso de sucesso/erro em toda gravação na API (`ActionFeedback.ts`, `ActionFeedbackHost.tsx`); efeito de clique e foco nos botões (tema). Erros 4xx continuam explicados pela própria tela.

### 6. Sistema de pendências com responsável + pontuação — status: **CONCLUÍDA** (07/10/2026; falta rodar o SQL)
Tela `/pendencias`, ranking semana/mês, pontos por prioridade (+50% no prazo, 0 se atrasada). **Você:** rodar `backend/prisma/manual-migrations/20261007_pendencias.sql`. Usa a permissão `dashboard.view` (criar uma específica se quiser restringir).

### 7. Contrato pago + cobrança pela extração de Leads — status: PENDENTE

### 8. Migrar telas de contabilidade mock pro backend real — status: **CONCLUÍDA em parte** (07/10/2026)
Contábil e Fiscal agora usa `GET /accounting/overview` (receitas, despesas, resultado, obrigações, pendências de documento fiscal, bloqueios de fechamento). Automação Fiscal já era real. **Pendente (depende de terceiros):** conciliação bancária (não há modelo de extrato), simulação de regime tributário (precisa do contador), emissão de notas (certificado digital + provedor fiscal).

### 9. Revisar as 3 telas financeiras — status: **CONCLUÍDA** (07/10/2026)
PaymentCenter e FinancialScanner ligados ao backend real (modo demo continua local); HumanResources com validações e avisos. **RISCO ABERTO:** os dados de RH (salário, CPF, PIX) ainda ficam só no navegador (localStorage), sem permissão `hr.sensitive` nem sincronização. Migrar o RH para o backend é tarefa própria (precisa definir o modelo de dados e a regra de fechamento da folha).

### 10. Webhook de resposta do paciente via WhatsApp — status: PENDENTE

### 11. Resto do roadmap original do plano mestre — status: PENDENTE
Design/CAD-CAM, Administrativo (permissões + biometria), Gestão (hora clínica/precificação), DentalPos Sales, Acadêmico, Configurações, reorganização do menu em 4 grupos.

### 12. Etapa final de segurança — status: EM ANDAMENTO (parte de código feita em 04/10/2026; ver `SECURITY.md`)
- **FEITO (código):** 2FA TOTP + tela Segurança da conta; limite de tentativas por conta; senha forte; expiração por inatividade; JWT HS256 fixo; upload clínico endurecido; DentalPod com trava de domínio, filtro de malware/NSFW, ofuscação e CSP.
- **PENDENTE (você):** ativar verificação em duas etapas no GitHub, Vercel, Supabase, Resend e Claude; restringir conexões ao banco Supabase; conferir e testar backup automático; aplicar a migração `20261004_seguranca_2fa.sql`; ligar `requireHostToken` após o deploy do backend.
- **FEITO (07/10/2026):** auditoria de LEITURA de paciente/prontuário/arquivo clínico (LGPD); lista da equipe WMundi unificada no servidor (`WMUNDI_STAFF_EMAILS`; usuários logados antes precisam entrar de novo); `npm audit` do frontend zerado (só patch de nanoid/source-map-js, build verificado); `REQUIRE_2FA_ADMIN=true` leva administradores sem 2FA direto para ativá-la.
- **PENDENTE:** moderação de imagem e antivírus no servidor (exigem serviço contratado); migrar RH para o backend (ver item 9).

### 13. Pesquisa de satisfação pós-atendimento — status: **CONCLUÍDA em parte** (07/10/2026; falta rodar o SQL)
Página pública `/pesquisa-satisfacao?t=...` (LGPD, descadastro), relatório `/satisfacao` (NPS, por profissional, motivos, conversão, alertas nota 0–6), link de uso único (14 dias), 1 pesquisa/semana. **Você:** rodar `20261007_pesquisa_satisfacao.sql`; configurar remetente em Canais de Envio; definir `PUBLIC_APP_URL`. **Decisão de risco:** NÃO liguei o disparo automático ao 'Finalizar' da Agenda nem cron, para não enviar mensagens a pacientes sem sua autorização; hoje o envio é pelo botão 'Enviar pesquisas agendadas' e a criação via `POST /satisfaction/surveys`.

### 14. Remover nomes de fornecedores das telas (segredo comercial) — status: **CONCLUÍDA no frontend** (07/10/2026)
Telas de cobrança/recebimentos agora dizem 'gateway de pagamento'/'conta de recebimentos'. Restam só identificadores internos (valores de dados e rotas), não visíveis. Revisar o backend se mensagens de erro chegarem à tela com nomes de fornecedor.

### 15. Entregar o sistema limpo (sem exemplos nem números carregados) — status: PENDENTE
- Contas novas e demos começam do zero. NÃO apagar dados reais existentes; qualquer dado de exemplo misturado no banco deve ser mostrado ao Robson antes.

### 16. Tutorial das funcionalidades — status: **CONCLUÍDA** (07/10/2026)
Ícone '?' no cabeçalho abre o guia da tela atual (`config/tutorials.ts`, ~20 módulos + guia geral). Complementar os módulos novos (Pendências, Satisfação) quando quiser.

### 17. Canal de feedback visível em todas as telas — status: **CONCLUÍDA** (07/10/2026)
Botão fixo 'Feedback' em todas as telas (`FeedbackFab`), registra a tela de origem e usa a central 'Sugestões e Problemas'.

