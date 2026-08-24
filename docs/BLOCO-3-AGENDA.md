# Bloco 3 — Agenda Inteligente

## Objetivo
Transformar a Agenda em tela operacional da recepção, com visão semanal, profissionais configuráveis, histórico auditável, situação financeira, inteligência de ocupação e integração automática com o Laboratório.

## Frontend
- Visão semanal por profissional ou todos os profissionais.
- Intervalos de 10, 15 ou 30 minutos.
- Configuração de profissional: nome, especialidade, sala, início/fim, dias de atendimento e intervalo padrão.
- Situação financeira do paciente visível no cartão do agendamento.
- Próximo procedimento visível na própria agenda.
- Histórico de remarcação, cancelamento, falta e alteração.
- Motivo obrigatório em alterações relevantes.
- Registro de quem solicitou: paciente, clínica, dentista ou outro.
- Indicadores de ocupação e capacidade livre com cálculo baseado na disponibilidade configurada.
- Estimativa de receita potencial não ocupada, explicitamente identificada como estimativa gerencial.
- Sugestões de pacientes para preencher horários, usando procedimentos pendentes do plano clínico/odontograma.
- Procedimentos protéticos/laboratoriais criam automaticamente um trabalho na Fila do Laboratório.
- Ao remarcar consulta vinculada ao Laboratório, o retorno do paciente no trabalho laboratorial também é atualizado.
- Lembretes previstos no agendamento: no momento da marcação, um dia antes e no dia.

## Backend / Prisma
- Appointment endurecido para multi-tenant.
- Campos adicionados: nextProcedure, room e source.
- AppointmentHistory: histórico imutável de alterações/remarcações/cancelamentos/faltas.
- AppointmentReminder: fila persistente de lembretes por canal.
- Reagendamento recria os lembretes pendentes com as novas datas.
- Cancelamento preserva o registro e cancela lembretes pendentes; não apaga o histórico.
- Controllers de Appointment e Schedule agora filtram por clinicId + tenantId e não aceitam clinic/tenant arbitrários do corpo da requisição.
- Horários dos profissionais validados para intervalos 10/15/30 minutos.
- Auditoria integrada a criação, alteração, cancelamento e configuração de horários.
- Rotas da Agenda protegidas por permissões `agenda.view`, `agenda.create`, `agenda.edit` e `agenda.cancel`.

## Integrações já estabelecidas
Prontuário/Plano de Tratamento → sugestão de paciente → Agenda

Agenda (procedimento protético) → Fila do Laboratório

Remarcação na Agenda → nova data de retorno no Laboratório

Financeiro → indicador de pendência na Agenda

Agenda → fila de lembretes → futuro REVAH

## Validação técnica
- Verificação sintática TypeScript executada nos arquivos alterados: OK.
- O build completo do frontend não foi concluído neste ambiente porque o checkpoint não contém a instalação completa das dependências (`vite/client` e `@types/node` ausentes). O build completo será validado no ambiente Windows/piloto.
- O schema Prisma deverá receber `prisma generate`/migração quando o backend for instalado no ambiente de integração.
