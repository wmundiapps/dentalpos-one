# Caixa de boletos (DDA e e-mail dedicado) — EduMaster Pro

Recebe boletos por **DDA** e por **e-mail exclusivo** (ex.: `boletos@<domínio da instituição>`), faz um **check-up interno de autenticidade** em cada um e
leva ao fluxo existente de **contas a pagar** da Tesouraria (`TesTitulo`, alçadas `TesAlcada`, dupla aprovação, segregação, 2FA). Não duplica o fluxo de pagamento:
**autorizar** cria/atualiza o `TesTitulo` e chama `autorizarTitulo`. Prefixo de modelos `Bol` (`prisma/edu/boletos.prisma`; SQL aditivo no bloco `BOL:BEGIN/END`
de `prisma/manual-migrations/20261004_edumaster_pro.sql`). Rotas: **`/api/edu/boletos`**; webhook público: **`POST /api/public/edu/boletos/webhook/email/:tenantId`**.
Tela: **/edu/financeiro?secao=boletos** (também `?aba=boletos`; `&sub=caixa|emails|lotes|recorrentes|config`, `&boleto=<id>`, `&lote=<id>`).

## Fluxo
`RECEBIDO` (DDA/e-mail/manual) → **Conferir** (devolve com observação → `A_CONFERIR`) → **Autorizar** (`EM_APROVACAO` se faltar 2ª aprovação → `AUTORIZADO`, com título criado) ou **Refutar** (motivo obrigatório → `REFUTADO`).
Papéis: `FINANCE` lança/sincroniza/monta lotes; `FINANCE` e `COORDINATOR` conferem/autorizam/refutam/decidem lotes; `ADMIN/OWNER/RECTOR/BOARD` tudo e as configurações; demais perfis 403.
Quem **lançou** (manual ou e-mail simulado) não autoriza o mesmo boleto (`SEGREGACAO`); quem **enviou** o lote não o decide. Alçada e dupla aprovação vêm da Tesouraria.
Boletos que chegam por DDA/webhook não têm “lançador” (são do sistema). `DUPLICADO` não pode ser autorizado enquanto o original estiver ativo; `SUSPEITO` exige `confirmarRisco` + justificativa (mín. 10 caracteres).

## Check-up (resultado `OK | ATENCAO | SUSPEITO | DUPLICADO` + score 0–100 + motivos legíveis)
(a) linha digitável 47/48 e código de barras 44: DV módulo 10 de cada campo, DV geral módulo 11 (bancário) / 10 ou 11 (arrecadação), moeda, **valor e vencimento embutidos × campos** (fator de vencimento com o reinício de 22/02/2025);
(b) beneficiário × cadastro de fornecedores (CNPJ, razão social, CNPJ parecido com nome igual = crítico), **banco diferente do histórico** do fornecedor, valor muito fora da mediana, beneficiário desconhecido, vencido há muito;
(c) nota fiscal de entrada compatível (valor total/líquido/parcela, prazo) — sem nota = pendência “sem nota fiscal”; chave de NF-e (DV, CNPJ da chave);
(d) duplicidade: mesmo código de barras ou mesmo fornecedor + valor + vencimento próximo em outro boleto/título (ligado ao original).
`SUSPEITO` = qualquer motivo crítico ou score ≥ 50. **É verificação interna: não consulta banco/CIP e não substitui a conferência no banco** (aviso fixo nas telas e no relatório).

## Avisos (LGPD)
Boleto `SUSPEITO`/`DUPLICADO` e conta recorrente não lançada → `notify` ao financeiro (e à diretoria `RECTOR/BOARD` nos boletos de risco) + `scheduleReminder` escalonado (financeiro agora; diretoria depois, severidade crítica). Mensagens mínimas: só número interno e situação (sem CNPJ, linha digitável nem valores). CPF de beneficiário pessoa física é mascarado na API.

## Entrada de e-mail
`PUT /config` (administração) ativa a caixa e gera o **segredo do webhook** (mostrado uma única vez; só o hash é guardado; `POST /config/token` rotaciona). O domínio vem de `BolConfig.dominioEmail` ou da variável `BOLETOS_DOMINIO_EMAIL` (padrão fictício `instituicao-exemplo.edu.br`).
Webhook: `Authorization: Bearer <segredo>` (ou `x-boletos-token`), JSON `{messageId, from, to, subject, text, html, attachments:[{filename, contentType, contentBase64}]}`. Tenant inexistente, token errado e canal desligado respondem igual (401). Cada anexo passa pelo `scanUpload`; o e-mail é idempotente por `messageId`.
Leitura: texto, **PDF com texto embutido**, XML de NF-e (chave, emitente, valor, duplicatas) e texto do corpo. **Sem OCR**: PDF digitalizado/imagem fica guardado e a tela diz isso; nada é inventado (sem linha digitável o boleto entra com alerta e não pode ser autorizado). Tamanho: o limite de corpo do servidor (`API_BODY_LIMIT`, padrão 2 MB) vale para o JSON em base64.
Tela “Simular recebimento de e-mail” = mesmo processamento, autenticada.

## DDA
Interface `ProvedorDda` em `provedorDda.ts` (**ponto de extensão para banco/CIP real**: implementar `listarBoletos` e `registrarProvedorDda`). Só existe o provedor **SIMULADO** (sem rede/credencial): 6 boletos por dia coerentes com o cadastro (3 normais, 1 duplicado, 1 suspeito, 1 com DV inválido); a sincronização é idempotente (`origemRef = dda:<id>`).

## Lote do dia, recorrências e cron
* **Lote**: `POST /lotes` agrupa os boletos do dia → `/enviar` → `/decidir {decisao: TOTAL|PARCIAL|REPROVAR, itens?, motivo?, confirmarRisco?}` (auditado: quem/quando). Relatório imprimível: `GET /lotes/relatorio?loteId|data` + tela com `@media print` e PDF/planilha (`ExportMenu`).
* **Recorrências**: cadastro (fornecedor + valor aproximado + periodicidade + dia), **aprendizado** (≥ 3 meses encerrados seguidos com valores parecidos → *sugestão*, nunca criação automática), `POST /recorrencias/verificar` (“Verificar agora”) e `GET /planilha-do-dia`; justificar/dispensar com texto.
* **Cron** (`/api/cron/edu`, registrados em `core/jobs`): `boletos.dda-sincronizar` e `boletos.recorrencias`.

## Testes e seed
`scripts/e2e/boletos.ts` (≥ 250 verificações: DVs com casos reais conhecidos, extração, check-up, API, isolamento) e `scripts/seeds/boletos.ts` (`seedBoletos(api, ctx)`). Rodar com Postgres local próprio:
`DATABASE_URL=postgresql://postgres:pg@127.0.0.1:5432/boletos_e2e npx tsx scripts/e2e/boletos.ts` (após `prisma db push`).

## Limites honestos
DDA e caixa de e-mail reais dependem de banco/CIP e de um provedor de e-mail de entrada contratados pela instituição; não há OCR; o check-up é interno; o DV/valor/vencimento só detectam adulteração do código, não golpes com boleto legítimo de outro beneficiário (por isso a checagem de CNPJ/banco/histórico).
