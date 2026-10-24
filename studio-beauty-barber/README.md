# Studio Beauty Barber
Gestão para salões e barbearias: agenda, clientes, caixa/comissões, funil de leads, caixa de entrada com robô (WhatsApp, Instagram, Facebook), campanhas, cobrança (Asaas/Stripe) e segurança.

Sem dependências npm (Node >= 22.5). Banco: SQLite (piloto) ou Postgres (`DATABASE_URL`).

## Rodar local
```
npm run seed      # cria o salão piloto + conta HQ; mostra a senha UMA vez
npm start         # http://localhost:3000   (landing em /site/, agendamento em /s/<slug>)
npm test          # 20 testes ponta a ponta
npm run ads       # gera cards e textos de anúncio (precisa de playwright)
```
## Pastas
`server/` API e regras · `web/` painel e página de agendamento · `landing/` site de vendas · `ads/` criativos Meta/Google · `security/` checklists · `tests/`.
Publicação: veja `DEPLOY.md`. Segurança: `security/`. Anúncios: `ads/meta_ads.md`, `ads/google_ads.md`.

Créditos de WhatsApp, SMS e ligações são pagos pelo salão direto às operadoras; nada passa pela WMundi.

## Atualização: reserva paga, clube e site de demonstração (18/10/2026)
- **Planos:** Smart Individual R$ 59,90 (1 profissional), Pequeno R$ 129 (até 3), Médio R$ 249 (até 8), Grande R$ 559 (até 20), Sob demanda. Limite de profissionais aplicado por plano (teste grátis libera o do Médio). Em `server/config.js`.
- **Reserva paga** (`server/payments.js`, `/api/public/salons/:slug/book`): pagamento antecipado por Pix/cartão no Asaas do salão, aceite da política, horário segurado por 15 min, confirmação pelo webhook `/webhooks/asaas/:salonId`. Falta: retém 30% e devolve 70% (estorno parcial). Cancelou no prazo: devolve 100%. Percentual e prazo configuráveis em Configurações.
- **Clube de assinatura** (`server/club.js`, tela "Clube de assinatura"): horário fixo semanal, 15, 30, 45 ou 60 dias; mantém 6 visitas reservadas, cobra 7 dias antes, libera o horário se não pagar.
- **Testes:** `npm test` roda 25 testes (`tests/e2e.test.js` e `tests/payments.test.js`, este com Asaas simulado). Nada foi testado contra o Asaas real: usar o sandbox primeiro.
- **Site público** (landing + demonstração + cards): `node scripts/build-site.mjs` gera `dist/`. Demonstração interativa em `demo/`, capturas do painel real em `demo/painel/`.
- **Divulgação:** `ads/` (cards, Meta, Google), `marketing/WHATSAPP.md`, `marketing/EMAIL.md`, `marketing/email/prospeccao.html`.
- **Documentos:** `docs/contratos/`, `docs/INTEGRACAO-ASAAS.md`, `docs/robos/`, `skills/` (Instagram, Facebook, WhatsApp).
- Cards: `python3 ads/build_ads.py --html-only` e `node ads/shoot.cjs` (precisa de Playwright em Node).

## Atualização de 24/10/2026 — identidade visual, recall, Cashbacksmart, captação e conta vitalícia
- **Identidade visual** (Configurações): tipo de espaço (Barbearia = preto e ouro, Studio feminino = rosa claro, Barbearia e Studio = grafite com rosé), cores do menu, destaque e fundo, logo, frase de destaque, sobre, WhatsApp, Instagram, Facebook, site, endereço. Vale para o painel e para a página pública de agendamento. Botão para cadastrar os serviços sugeridos do tipo (`server/brand.js`).
- **Recall** (retorno por serviço, campo "dias" em Serviços), **confirmação na hora do agendamento** (cliente responde 1 ou 2), **recorrência/clube** (com opção de cobrar ou só repetir o horário).
- **Cashbacksmart:** adesão do dono (Configurações) e do cliente (cadastro e página de agendamento), registradas com data. A integração para liberar saldo depende da documentação/credenciais do Cashbacksmart.
- **Captação** (só no salão comercial, definido por `HQ_SLUG`): busca na base de CNPJ da Receita por segmento e local, funil, planilha com link de WhatsApp, bloqueio de quem pediu para sair e convite por e-mail agendado (dias úteis, 8h–18h, com link para sair). Carga da base: `node tools/receita-import/importar.mjs --ufs=PR` (rodar de um computador no Brasil).
- **Conta vitalícia:** coluna `salons.lifetime` (sem teste, sem limite de profissionais, nunca suspensa por cobrança). Liga-se direto no banco.
- Testes: 43 (`npm test` em SQLite; `npm run test:pg` com `TEST_DATABASE_URL` em PostgreSQL).
