# DentalPos One — Handoff v22 (01/10/2026)

Continuação do v21. Tudo abaixo está na branch `claude/friendly-carson-vvmpo4` (ainda NÃO está no `main`, NÃO foi feito deploy e o SQL NÃO foi rodado em produção).

## Ordem para publicar (regra de ouro do projeto)
1. **SQL** no Supabase, projeto **DentalPos One** (ref `lfeqfzvmasqnnmqvkjyg`): rodar `backend/prisma/manual-migrations/20261001_equipe_auxiliares.sql` inteiro. É idempotente (`IF NOT EXISTS`), só adiciona; foi testado em Postgres local duas vezes seguidas.
2. **Merge** da branch no `main` (publica o frontend sozinho).
3. `vercel deploy --prod` do backend, **da raiz** do repositório.
4. Rodar o SQL ANTES do deploy é obrigatório: o backend novo lê `Patient.recordNumber` e `Appointment.assistantId`; sem as colunas, as telas de pacientes e agenda quebram.

## O que foi feito (itens do v21)
- **2 Sugestões e problemas**: usuário vê só o agradecimento; lista/contadores/status só para a equipe WMundi (`contato@dentalpos.com.br`).
- **3 Painel de atendimentos** (`pages/PatientFlow.tsx`): agora com dados reais do dia. Botões Confirmar chegada → Sala em preparação → Iniciar atendimento → Atendimento finalizado (`PUT /appointment/:id/flow`). Fila separada por consultório quando há mais de uma sala/profissional. Modo TV oculta nomes. Atualiza a cada 30 s.
- **4 Avisos em vermelho** (`components/PendingAlertsBar.tsx`, `controllers/pendingAlertController.ts`): fonte das pendências = agendamentos de dias anteriores sem desfecho (últimos 30 dias), recebimentos vencidos há +3 dias, trabalhos de laboratório vencidos (banco). Configuração em Configurações (só quem tem `settings.edit`): liga/desliga e modo "só alerta" ou "bloqueio real" (diálogo que trava a tela; só o gestor destrava, até o fim do dia). Guardado em `TenantFeatureFlag` chave `PENDING_ALERTS` (sem SQL). O bloqueio é da interface, não do servidor.
- **5 Equipe** (`/equipe`, nas abas Recepção e Clínico): ASB, TSB e laboratório de prótese (tabela `TeamMember`); dentistas listados com atalho para o Corpo Clínico. ASB/TSB marcados "na agenda" podem ser escolhidos como Auxiliar no agendamento (`Appointment.assistantId`).
- **6 Permissões** (`/permissoes`): matriz de caixas por perfil + perfis de cada usuário. Novos perfis: Auxiliares, Administração, Jurídico (RH já existia). `createDefaultProfiles` agora PRESERVA perfis já existentes (antes apagava e recriava; isso desfaria a personalização). Quem não é ADMIN só concede permissões que ele mesmo tem; perfil ADMIN é imutável.
- **7 Avisos do laboratório de prótese**: na ordem de serviço (Laboratório → Novo trabalho) escolher o laboratório (cadastrado na Equipe) e os canais WhatsApp (API oficial da Meta), SMS, Telegram. Mensagens: ao salvar; 2 dias depois; **1 dia antes** da entrega ("amanhã"); no dia (08:00 Brasília). `BEFORE_DUE_DAYS` em `services/labNotificationService.ts` muda para 2 se preferirem. Envio pelo cron `/cron/reminders` (já existente) e pelo worker. Precisa de remetente ativo por canal em Revah. ATENÇÃO: a tela de Laboratório guarda as ordens só no navegador (localStorage), por isso os avisos usam o resumo da ordem enviado no momento de salvar.
- **8 Importação de pacientes** (`/importar-pacientes`, Configurações, só Admin/Gestor): Excel (.xlsx) ou CSV, correspondência de colunas editável, prévia, importação em lotes. Duplicidade: mesmo nome+telefone ou mesmo CPF (famílias dividem telefone). Sem telefone com DDD não importa. Só cadastro (financeiro/agenda ficam no sistema de origem).
- **Fase 2 do agendamento**: número de cadastro automático do paciente (`Patient.recordNumber`, por clínica, pesquisável por `#12` ou `12`); tempos por procedimento valem para a clínica toda (`TenantFeatureFlag` `PROCEDURE_DURATIONS`); agendamento online só com nome + telefone com DDD (nascimento e cidade opcionais; mesmo telefone com nome diferente vira outro paciente).
- Cadastro manual com CPF repetido agora responde 409 "Já existe um paciente com este CPF".

## Pendências que continuam
- 9: pedir ao Robson o comando de diagnóstico do `DEMO_DATA_ON` (handoff v19) e decidir por tela.
- 10 a 16 do v21 (resumos clicáveis, assinatura recorrente Asaas, CPF/CNPJ na compra, **RLS em Patient/Doctor/FinancialEntry antes de clínicas reais**, preços/Asaas, WABA, limpeza dos `.bak`, widget de avaliação).
- Testar em produção: e-mail de avaliação; avisos do laboratório com remetente real; importação com um CSV pequeno antes da base inteira.

## Financeiro (pedido de 01/10, tarde)
- **Data errada (30/09 em vez de 01/10)**: o formulário enviava só `AAAA-MM-DD`; o servidor gravava meia-noite UTC e o Brasil mostrava o dia anterior (recorrentes eram gravados ao meio-dia, por isso saíam certos). Agora `parseDay` grava meio-dia de Brasília e a tela trata os lançamentos antigos como data pura. SQL opcional para corrigir o banco: `backend/prisma/manual-migrations/20261001_financeiro_datas.sql` (idempotente).
- **Editar lançamento**: botão Editar nas linhas pendentes/vencidas (usa o `PUT /financial-entries/:id` que já existia).
- **Cancelados**: ocultos da lista; chip "Cancelado" mostra e permite "Excluir cancelados definitivamente" (`POST /financial-entries/purge-cancelled`, auditado). Recorrentes cancelados e lançamentos com nota fiscal são mantidos.
- **Exportar com período**: menu Baixar pergunta De/Até (por vencimento) respeitando o filtro da tela.
