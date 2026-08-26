# Bloco 18 — Agenda Inteligente: frontend conectado ao backend

Este bloco conecta o assistente visual da Agenda Inteligente ao motor multi-tenant persistido no PostgreSQL.

## Fluxo

1. A Agenda recebe paciente, procedimento, data e laboratório.
2. Se houver `patientId`, o frontend envia os dados para `POST /smart-scheduling/suggest`.
3. O backend aplica política clínica, regra do procedimento, laboratório, preferência do paciente e fatores financeiros permitidos.
4. A decisão é persistida em `SmartSchedulingDecision`.
5. O frontend mostra a recomendação retornada pelo servidor.
6. Ao usar o retorno sugerido, o frontend registra a aceitação em `/smart-scheduling/decisions/:id/accept`.
7. Se a API estiver temporariamente indisponível, a agenda mantém o cálculo local do Bloco 16 como fallback operacional.

## Regra de segurança funcional

A lógica financeira não bloqueia atendimento e não pode empurrar o retorno para fora da necessidade clínica. O backend permanece como fonte de decisão quando disponível.

## Observação

O editor visual de regras ainda mantém compatibilidade com a configuração anterior. A sincronização completa do editor de regras com as tabelas específicas do Bloco 17 pode ser tratada em etapa própria sem quebrar o fluxo da agenda.
