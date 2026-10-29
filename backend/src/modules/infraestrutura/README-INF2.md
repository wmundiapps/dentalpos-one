# Infraestrutura 2 (prefixo `Inf2`) — `/api/edu/infraestrutura`

Extensão do módulo infraestrutura: **agenda**, **solicitações/OS com fotos**, **frota**, **segurança patrimonial** e **indicadores de pessoas para o RH**.
Código em `inf2/` e `seguranca-patrimonial/`; modelos em `prisma/edu/infra2.prisma`; SQL aditivo no bloco `INF2:BEGIN/END` de `prisma/manual-migrations/20261004_edumaster_pro.sql` (idempotente).
Não toca em patrimônio/etiquetas (outro agente): só convive no mesmo router. Referências a User, EduSpace, CppDepartamento e RheColaborador são ids sem `@relation`.

Papéis: **G** = FACILITIES (+ADMIN/OWNER/RECTOR/BOARD); **L** = G + COORDINATOR, FINANCE, SUPPLIES, SECRETARY, SUPPORT, STAFF; **OP** = FACILITIES, STAFF, SUPPORT, COORDINATOR; **AUTH** = qualquer autenticado (inclusive aluno); **RH** = `HR` + administração.

## 1. Agenda de infraestrutura — `/agenda/*`
Tipos: PREVENTIVA, EVENTUAL, AQUISICAO, EXPANSAO, SEGURANCA, AVISO, SINALIZACAO, IDENTIDADE_VISUAL, MOBILIARIO. Áreas: EQUIPAMENTOS, TELHADO, BANHEIRO, JARDIM, ELETRICA, HIDRAULICA, PINTURA, CALCAMENTO, INSPECAO, EXTINTOR, CIPA, EPI, SIMULADO, COMUNICACAO, MOBILIARIO, OUTRO. Departamento e sala opcionais.
- `GET /agenda/catalogo`, `/agenda/itens` (filtros tipo, area, status, responsavelUserId, departamentoId, de/ate, atrasados, q), `/agenda/resumo`, `/agenda/itens/:id` (L); `POST/PATCH/DELETE /agenda/itens` (G, exclui só PLANEJADO); `POST /agenda/itens/:id/{iniciar,concluir,cancelar}` (G); `POST /agenda/itens/:id/notas` (L = anotações).
- **Recorrência** (`recorrenciaDias`, só PREVENTIVA e SEGURANCA — CIPA, extintores, simulados): ao concluir, cria a próxima ocorrência com o mesmo responsável. Lembretes por `scheduleReminder`; job `infra2.agenda`.
- `GET /pessoas` (G/COORDINATOR/HR): id, nome e perfil (sem e-mail/telefone) para escolher responsáveis.

## 2. Solicitações (problemas/implementações), triagem e OS — `/solicitacoes`, `/os`, `/qr-locais`
Fluxo: NOVA → EM_TRIAGEM (responsável, prazo, custo estimado, prioridade) → OS_GERADA → EM_ANDAMENTO → RESOLVIDA → FECHADA (avaliação 1–5 do solicitante); REJEITADA (motivo obrigatório); CANCELADA. Prazo padrão por prioridade (URGENTE 1 d, ALTA 3, MEDIA 7, BAIXA 15).
- `POST /solicitacoes` (AUTH): `tipo, categoria, titulo, relatorio (≥10), local, spaceId, qrToken, prioridade, fotos[≤6]`. `GET /solicitacoes/minhas` (AUTH), `GET /solicitacoes` e `/solicitacoes/painel` (L), `GET /solicitacoes/:id` (dono ou L; comentários internos só para G).
- `POST /solicitacoes/:id/{triagem,gerar-os,resolver}` (G); `/avaliar` (só o solicitante, após RESOLVIDA); `/reabrir` (dono/G); `/cancelar` (dono/G, antes da execução); `/comentarios` (dono/G).
- **OS** `POST/GET/PATCH /os`, `POST /os/:id/{iniciar,concluir,cancelar}` (G; L lê). Concluir exige **relatório de execução**, registra custo real e `noPrazo`; ao concluir a última OS aberta, a solicitação passa a RESOLVIDA com custo somado e o solicitante é notificado.
- **QR da sala**: `POST/GET/DELETE /qr-locais` (G); `GET /qr/:token` (AUTH) devolve o local. O QR aponta para `/edu/infraestrutura?secao=solicitacoes&qr=<token>` (login obrigatório; a abertura fica rastreada ao usuário).
- **Fotos/anexos** `GET|POST /anexos-infra`, `GET /anexos-infra/:id/download`, `DELETE /anexos-infra/:id`: `refType` ∈ Solicitacao, Ordem, Agenda, Veiculo, Multa, Seguro, FrotaDoc, FrotaManutencao, OcorrenciaSeg, Reserva. Todo corpo JSON passa pelo **upload guard** global (`seguranca/uploadGuard.ts`: tipo real por magic bytes, malware, moderação de imagem); `dataUrl` até ~2,8 MB ou link https; download com `nosniff`. Dono da solicitação anexa/baixa; terceiros leem só com papel L.

## 3. Frota — `/frota/*`
Veículos (placa Mercosul/antiga normalizada, odômetro que não regride), **motoristas** (CNH **cifrada**; só 3 últimos dígitos voltam; alerta de validade), `registros` de quilometragem/abastecimento (qualquer OP; km monotônico), **multas** (`/frota/multas`: responsável = condutor por padrão; `POST …/tratamento` define INSTITUICAO | RESSARCIMENTO | DESCONTO_FOLHA com responsável e valor; `…/ressarcir` registra pagamentos parciais; `…/pagar|recurso|cancelar`), **seguros** (apólice única por tenant), **manutenções/revisões** (atualizam o odômetro e agendam lembrete da próxima), **documentos** (CRLV, licenciamento, IPVA…), **reservas/viagens** (`POST /frota/reservas` por qualquer não-aluno; aprovação com motorista de CNH válida, conflito de horário 409, `iniciar`/`concluir` com km, atualiza o odômetro).
- `GET /frota/alertas?dias=90` (documentos, seguros, CNH, revisões e multas por vencer/vencidos, com faixa 30/60/90), `GET /frota/painel`, `GET /frota/veiculos/:id/{ficha,custo-km}`, `GET /frota/relatorios/multas[?format=csv]`.
- **Custo por km** = (combustível + manutenção + multas líquidas do ressarcimento + seguro rateado por dia) ÷ km rodados no período (padrão 12 meses); consumo km/l pelos abastecimentos. Funções puras em `inf2/frotaCalc.ts`. Job `infra2.frota` cria lembretes de vencimento.
- Todos os registros carregam o **nome dos responsáveis** (responsável do veículo, motorista, registrado por, decidido por, responsável da multa/revisão).

## 4. Segurança patrimonial — `/seguranca-patrimonial/*`
Cargos: SEGURANCA, PORTEIRO, COORDENADOR_SALAS, COORDENADOR_PATIO, COORDENADOR_ESTACIONAMENTO, COORDENADOR_PORTARIA. **Postos** (PORTARIA, PATIO, ESTACIONAMENTO, SALAS, RONDA_MOVEL) com efetivo mínimo.
- `postos`, `agentes` (CRUD, G escreve; L lê). **Vínculo com o RH**: `colaboradorId` = `RheColaborador.id` (validado quando o módulo RH existe; sem RH vale como referência) e/ou `userId` do sistema; terceirizados informam a empresa.
- **Escalas**: `POST /escalas`, `POST /escalas/lote` (dias da semana ou plantão 12x36), conflito de horário do mesmo agente = 409 (inclui turno noturno que cruza a meia-noite), `GET /escalas`, `GET /escalas/cobertura?data=` (posto descoberto), `POST /escalas/:id/ponto` (o próprio agente: ENTRADA/SAIDA, ATRASO após 10 min), `/falta` e `/troca` (G).
- **Rondas com QR**: `POST /checkpoints` (token no QR), `POST /rondas` (OP; uma em andamento por agente), `POST /rondas/:id/leitura {token, observacao, anormalidade}` (anormalidade gera ocorrência), `POST /rondas/:id/encerrar` → CONCLUIDA ou INCOMPLETA.
- **Ocorrências** `POST/GET /ocorrencias`, `POST /ocorrencias/:id/status` (encerrar exige encaminhamento; ALTA/CRITICA notificam a gestão). **Passagem de serviço** `POST/GET /passagens`, `POST /passagens/:id/ciencia` (só quem assume). `GET /eu`, `GET /painel`.

## 5. Contrato com o módulo RH — indicadores por pessoa (`infra-rh-v1`)
O RH (`modules/rh`) **consome**, sem alterar este código. Dois caminhos equivalentes:
1. Função: `import { indicadoresPessoaInfra, indicadoresInfraLote } from '../infraestrutura/routes'` → `indicadoresPessoaInfra(tenantId, { userId? , colaboradorId? }, de, ate)` e `indicadoresInfraLote(tenantId, de, ate)`.
2. HTTP (apenas `HR` e administração; auditado): `GET /rh/indicadores?userId=|colaboradorId=&de=&ate=` · `GET /rh/indicadores/lote?perfil=` · `GET /rh/indicadores/meus` (qualquer funcionário vê os próprios).

Resposta (resumo): `pessoa {userId, colaboradorId, nome, perfil}`, `manutencao {solicitacoesAtribuidas, resolvidas, noPrazo, vencidasAbertas, cumprimentoPrazoPct, avaliacaoMediaDosSolicitantes, osAtribuidas/Concluidas/NoPrazo/Atrasadas, osCumprimentoPrazoPct, custoOs, agendaItens/Concluidos/NoPrazo/Atrasados}`, `solicitante {abertas, avaliou}`, `frota {ehMotorista, viagensConcluidas, kmEmViagens, multas, multasValor, pontosCnh, multasEmAberto, cnhValidade}`, `segurancaPatrimonial {escalas, cumpridas, faltas, atrasos, assiduidadePct, rondas, rondasCompletas, rondasPct, ocorrenciasRegistradas, passagensDeServico}`, `componentes {pontualidadePct, satisfacaoPct, assiduidadePct, rondasPct, conformidadeFrotaPct}` e `indiceInfra` (média 0–100 dos componentes disponíveis). Cobre administrativo, técnico, professores e diretoria (qualquer usuário não aluno). É **subsídio objetivo**; a decisão avaliativa é humana (LGPD art. 20). Período padrão: 12 meses.

## LGPD
Sem CPF/e-mail/telefone em listagens de pessoas; CNH cifrada e mascarada; indicadores por pessoa só para RH/administração com `audit()`; fotos passam pelo upload guard; autoria de solicitação visível apenas à gestão e ao próprio.

## Jobs (`/api/cron/edu`)
`infra2.agenda`, `infra2.solicitacoes` (avisa prazos vencidos), `infra2.frota`.

## Limites
Sem GPS/telemetria nem integração com Detran/seguradora (cadastro manual). O QR é lido pela câmera do celular (leitor nativo); a leitura de checkpoint também aceita digitar o código. Desconto em folha é **registrado** (tratamento + valor): o RH/Financeiro efetiva o lançamento. Valores e prazos padrão são modelos a validar pela instituição.

## Testes
`DATABASE_URL=postgresql://… npx tsx scripts/e2e/infra2.ts` (≥280 verificações; banco local próprio). Seed: `scripts/seeds/infra2.ts` (`seedInfra2`, `seedFeedback`).
