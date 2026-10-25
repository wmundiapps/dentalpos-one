# Vendeu

Classificados com abas **Compra · Venda · Locação**, categorias (Móveis, Imóveis, Brinquedos, Automóveis, Utilidades para o lar, Outros), vitrines **Novos** e **Usados** separadas e monetização por **taxa de sucesso**: anunciar é grátis, paga-se só ao vender e retirar o anúncio.

## Tabela de taxas (fonte: `shared/fees.ts`)
| Valor fechado | Taxa |
|---|---|
| até R$ 150,00 | R$ 15 |
| R$ 150,01 a 500 | R$ 20 |
| R$ 500,01 a 1.000 | R$ 30 |
| R$ 1.000,01 a 1.500 | R$ 50 |
| R$ 1.500,01 a 2.000 | R$ 80 |
| R$ 2.000,01 a 3.000 | R$ 100 |
| acima de R$ 3.000 | R$ 100 + R$ 50 a cada R$ 1.000 (ou fração) |

Locação: taxa sobre o aluguel mensal fechado, uma vez. Teto opcional: `FEE_CAP_CENTS`.

## O que existe
- **Servidor** (`server/`): Express 5 + Postgres. Cadastro de anunciantes e compradores, verificação de e-mail/telefone por código, verificação de identidade (documento frente/verso, selfie, comprovante de endereço, cartão CNPJ; CPF/CNPJ validados e únicos), anúncios com fotos regravadas (sem GPS) e declaração de origem lícita assinada por anúncio, triagem automática de risco, detecção de foto repetida, mensagens com alertas anti-golpe, denúncias (3 tiram do ar), checkout da taxa (Pix/cartão via Mercado Pago, webhook conferido no provedor), travamento por taxa vencida, grupos automáticos de "Outros", painel de moderação, LGPD (exportar, corrigir, revogar, eliminar), registro de origem imutável (IP, e-mail, telefone, dispositivo).
- **Web** (`web/`): React + Vite.
- **Textos legais** (`docs/legal/pt-BR`, `docs/lgpd`): minutas aguardando revisão.
- **Divulgação** (`site/` landing, `docs/marketing`): cards, textos de Facebook/Instagram, kit de lançamento.

## Checkout: como funciona
1. Anunciante clica **Vendi/Aluguei** e informa o valor fechado → anúncio sai do ar na hora, taxa calculada.
2. Paga por Pix ou cartão (prazo 7 dias). Pago → anúncio `sold`, recibo.
3. Atraso > 3 dias → novos anúncios bloqueados até pagar. Retirar sem vender é grátis.
4. Proteções contra fuga da taxa: valor < 70% do anunciado exige justificativa e vai para análise; comprador pode confirmar/contestar; máx. 2 desistências em 90 dias.

## Produção — o que falta configurar (ver `.env.example`)
Domínio, projeto na Vercel, `DATABASE_URL` (Supabase novo projeto), chaves (`JWT_SECRET`, `DOCUMENT_ENCRYPTION_KEY`, `HASH_PEPPER`, `CRON_SECRET`), Mercado Pago, SMTP e SMS, dados da operadora, criar o admin (`ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run create-admin` — a senha só no terminal local), aprovação dos textos legais.

## Limitações conhecidas
- Admin sem 2 etapas ainda; limite de tentativas em banco (ok para serverless, não substitui WAF).
- A verificação de documento é humana (sem consulta automática à Receita/biometria).
- Fotos ficam no banco (bytea); migrar para Vercel Blob/Supabase Storage se o volume crescer.
- O Mercado Pago foi implementado por REST e testado com simulação; falta teste com credenciais reais (sandbox).
