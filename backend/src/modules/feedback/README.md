# Caixa de sugestões e bugs (prefixo `Fbk`) — `/api/edu/feedback`

Botão flutuante discreto (`frontend/src/edu/feedback/FeedbackButton.tsx`, montado no `Layout` global ⇒ **todas** as telas autenticadas; atalho Alt+Shift+F) para relatar sugestões, melhorias, erros, bugs e dúvidas. Central do administrador em `/edu/feedback`.
Modelos: `prisma/edu/feedback.prisma` (FbkItem, FbkComentario, FbkVoto, FbkAnexo, FbkContador); SQL no bloco `INF2:BEGIN/END` da migration manual.

## Captura automática (opcional e transparente ao usuário)
Rota/tela (`document.title`), versão (`VITE_APP_VERSION`), **perfil (vem do token, nunca do corpo)**, navegador resumido, viewport, idioma e **últimos erros/avisos do console** (anel de 40 entradas). O usuário vê o que será enviado, pode desmarcar o contexto e os logs, anexar **captura de tela** (arquivo ou `getDisplayMedia`) e enviar **anonimamente** (a equipe não vê o nome; a resposta chega por userId).

## Sanitização (LGPD — minimização)
Feita no navegador (`edu/feedback/sanitize.ts`) **e repetida no servidor** (`feedback/sanitize.ts`): JWT, Bearer, `senha=/token=`, chaves de API, CPF, e-mail, telefone, cartão, UUID, hashes, base64 longo, data URLs e query strings viram marcadores. Rota sem host/hash/valores de query; `:id` no lugar de ids. Capturas passam pelo **upload guard** e só aceitam imagem. Limite de 15 envios/hora/usuário (429). Retenção: job `feedback.retencao` apaga logs e capturas de itens encerrados há > 180 dias. Exportação e visualização pela triagem são auditadas; CSV neutraliza fórmulas.

## Endpoints
| Rota | Quem |
|---|---|
| `POST /itens` (tipo, categoria, prioridade, titulo, descricao, passosReproduzir, anonimo, contexto{…}, capturas[≤3]) → número `FBK-AAAA-NNNNN` + `similares` | qualquer autenticado |
| `GET /itens/meus`, `GET /itens/:id` (só o próprio; sem logs; comentários públicos) | autor |
| `GET /sugestoes`, `POST /itens/:id/votar` (alterna; não vota na própria; só SUGESTAO/MELHORIA abertas) | qualquer autenticado |
| `GET /fila` (status, tipo, categoria, prioridade, responsavelUserId, perfil, abertos, q, de/ate, ordem=prioridade\|votos), `GET /painel`, `GET /exportar[?format=csv]`, `GET /responsaveis` | **ADMIN/OWNER/RECTOR/BOARD e SUPPORT** |
| `PATCH /itens/:id` (classificar/atribuir), `POST /itens/:id/{status,responder,duplicado,comentarios,encaminhar-atendimento}`, `GET /itens/:id/anexos/:anexoId` | triagem |
Status: NOVO → EM_TRIAGEM → PLANEJADO → EM_ANDAMENTO → RESOLVIDO; RECUSADO (exige resposta); DUPLICADO (por `/duplicado`: os votos migram para o item principal). Cada mudança de status/resposta gera notificação ao autor (`EduNotification`); bugs/itens críticos notificam administração e suporte.

## Integração com Atendimento
`POST /itens/:id/encaminhar-atendimento` abre um protocolo na **Central de Atendimento** (`modules/atendimento`, `ATD-…`, canal CHAT_PORTAL, origem FEEDBACK, SLA do setor; importação dinâmica, sem dependência rígida). Se a Central não estiver instalada, abre um chamado em **Apoio > chamados** (`CHD-…`, categoria TECNOLOGIA). O número fica em `atendimentoRef`.

## Testes
`DATABASE_URL=postgresql://… npx tsx scripts/e2e/feedback.ts` (≥125 verificações). Seed: `seedFeedback` em `scripts/seeds/infra2.ts`.
