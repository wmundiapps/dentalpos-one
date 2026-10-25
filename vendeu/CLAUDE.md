# Vendeu — regras para quem mexe neste código

Vendeu (nome provisório; troque em `shared/brand.ts`): classificados de Compra, Venda e Locação. **Compra toda pela plataforma: pagamento retido no Mercado Pago, contato só depois do recebimento, 7 dias de devolução, comissão só quando a venda se conclui, R$ 10 para retirar anúncio publicado sem vender.** Fonte: `docs/MODELO-DE-NEGOCIO.md`. Dono: Robson (não técnico: um passo curto por vez, com link/comando em bloco de copiar).

## Como rodar
- Banco local: `service postgresql start`; bancos `vendeu` e `vendeu_test` (role `vendeu`/`vendeu`).
- Testes: `cd vendeu/server && npm test` (roda contra `vendeu_test`; recusa banco que não termine em `_test`).
- Tipos: `cd vendeu/server && npx tsc --noEmit` e `cd vendeu/web && npm run typecheck`.
- Dev: `npm run migrate && npm run seed` em `server/`, depois `npm run dev` em `server/` (porta 4100) e em `web/`.
- Migrações: `server/migrations/NNN_nome.sql`, aplicadas no build (`vercel-build`). Nunca edite uma já publicada. Toda tabela nova nasce com RLS ligado e sem acesso para `anon`/`authenticated`.

## Regras que não mudam
- **Comissão/taxas:** única fonte em `shared/fees.ts` (centavos) e `REMOVAL_FEE_CENTS`. Mudou valor ou prazo → atualizar testes, `docs/MODELO-DE-NEGOCIO.md`, `docs/legal/pt-BR/politica-de-taxas.md`, landing (`site/`) e cards.
- **Dinheiro:** nunca passa por conta do Vendeu; retenção, repasse e devolução são do Mercado Pago (`payments.ts`). Contato (telefone/e-mail) só é mostrado depois de `received_at`.
- **Novos e usados nunca se misturam:** a API de vitrine exige `condition`.
- **Segredos:** nunca pedir/mostrar senha, chave ou token no chat. Variáveis em `.env.example`. Guarde cópia de `DOCUMENT_ENCRYPTION_KEY` (sem ela os documentos de verificação não abrem).
- **Texto legal** (`docs/legal`, `docs/lgpd`) só muda com aprovação do Robson e revisão da Dra. Roberta. Versão em `<!-- versao: -->`; mudou o texto → nova versão (gera novo aceite).
- **Registro de origem** (`origin_records`) é imutável por trigger; só a rotina de retenção apaga.
- **Documentos de verificação:** cifrados, vistos só pelo admin, cada acesso vai para `audit_log`.
- **Marketing:** sem lista de contatos de terceiros; nunca prometer "100% seguro"; o pagamento é processado e retido pelo Mercado Pago (o Vendeu não guarda o dinheiro); nada de "garantia absoluta".
- **Commits e PRs:** sem identificador de modelo de IA, em português.
- **O que depende do Robson:** SQL no Supabase, chaves (Mercado Pago, SMTP, SMS), domínio, textos jurídicos.
