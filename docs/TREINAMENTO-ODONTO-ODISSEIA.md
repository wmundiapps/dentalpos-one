# Treinamento: Odonto Odisseia

Jogo de treinamento dentro do DentalPos One, com um módulo por departamento.

| Módulo | Rota | Permissão | Perfis que recebem por padrão |
|---|---|---|---|
| Carreira do dentista | `/treinamento/carreira` | `training.clinical` | DENTISTA, GESTOR |
| Job Rotation da equipe | `/treinamento/job-rotation` | `training.jobrotation` | RECEPCAO, AUXILIAR, LABORATORIO, FINANCEIRO, ADMINISTRACAO, GESTOR |
| Gestão do treinamento | `/treinamento/gestao` | `training.manage` | GESTOR |

ADMIN vê tudo. O menu "Treinamento" mostra só os itens que o perfil do usuário libera.

## Como funciona

- O jogo é o arquivo estático `frontend/public/treinamento/odonto-odisseia.html`. A página `Training.tsx` abre esse arquivo num iframe (`?host=dentalpos&modulo=carreira|jobrotation`) e conversa com ele por `postMessage` (mesma origem).
- O progresso fica salvo por usuário em `TrainingProgress` (`PUT /api/training/progress/:module`).
- O limite diário é contado no servidor (`TrainingUsage`). A página manda um sinal a cada 15 s enquanto está visível. Cada sinal soma no máximo 20 s.
- O prêmio é registrado em `TrainingPrize` (`POST /api/training/prizes/claim`). O servidor confere no progresso salvo se a pessoa chegou ao topo exigido. Cada usuário ganha uma vez por módulo e recebe um código (`OD-…` ou `JR-…`).
- O gestor configura prêmio, nível mínimo dos dentistas, minutos por dia e setores do Job Rotation, e marca os prêmios entregues (`/api/training/settings`, `/api/training/prizes`, `/api/training/overview`).
- Padrão de cada clínica: prêmio "Meio período de folga", nível mínimo Mediano, 5 minutos por dia, os 5 setores.

## Permissões em clínicas que já existem

`createDefaultProfiles` preserva perfis que já têm permissões. Por isso, na primeira vez que alguém da clínica abre o treinamento, `getTrainingSettings` adiciona as permissões `training.*` aos perfis de sistema da tabela acima e marca `TrainingSettings.permissionsSeededAt`. Isso acontece uma vez só: depois o gestor ajusta em Configurações → Permissões e a escolha dele é mantida.

## Deploy

Migration: `backend/prisma/migrations/20261010120000_training_game`. Seguir o processo de `deploy/environments/README.md` (backup, staging, smoke test, `prisma migrate deploy`).

## Atualizar o jogo

O protótipo é desenvolvido como página única. Para atualizar, substitua `frontend/public/treinamento/odonto-odisseia.html` mantendo o bloco "ponte com o DentalPos One" no início do script.
