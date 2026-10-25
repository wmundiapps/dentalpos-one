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

## Como a compra funciona (decisão do dono, 26/10/2026)
Tudo acontece dentro do Vendeu, sem contato entre comprador e vendedor até o produto ser recebido. Detalhes em `docs/MODELO-DE-NEGOCIO.md`.
1. Comprador clica **Comprar/Alugar** (ou faz proposta de no mínimo 50%) e escolhe envio ou retirada em mãos. O anúncio fica reservado.
2. Paga por Pix pelo Vendeu. O dinheiro fica **retido no Mercado Pago** (não passa por conta nossa).
3. Vendedor envia (rastreio) ou entrega em mãos (comprador passa um código de 6 dígitos só quando receber).
4. Recebido → **contatos liberados** → **7 dias para devolver**. Devolveu: dinheiro 100% de volta ao comprador, sem comissão. Não devolveu: repasse ao vendedor menos a comissão (tabela acima).
5. Sem pagamento em 24 h, sem envio em 5 dias, sem resposta do comprador 10 dias após o envio, sem confirmação de devolução em 10 dias: o sistema expira, devolve, considera recebido ou chama a moderação. Disputas: moderação decide (devolver ou liberar).
6. Vendedor precisa de **conta Mercado Pago conectada** para publicar. Retirar anúncio publicado sem vender custa **R$ 10**.
Mensagens do chat ocultam telefone, e-mail, links e @usuário até o recebimento.

## O que existe
- **Servidor** (`server/`): Express 5 + Postgres. Cadastro, verificação de e-mail/telefone, verificação de identidade (documentos cifrados), anúncios com fotos sem GPS e declaração de origem assinada, triagem de risco, foto repetida, pedidos com pagamento retido, devolução, disputas, repasse, taxa de retirada, moderação, LGPD, registro de origem imutável. Rotina periódica em `/api/cron/daily` (Vercel Cron; para prazos em horas, agende de hora em hora, o que exige plano Pro).
- **Web** (`web/`): React + Vite. **Textos legais** (`docs/legal/pt-BR`, `docs/lgpd`): minutas aguardando revisão. **Divulgação** (`site/`, `docs/marketing`).

## Produção — o que falta configurar (ver `.env.example`)
Domínio, projeto na Vercel, `DATABASE_URL` (Supabase novo projeto), chaves (`JWT_SECRET`, `DOCUMENT_ENCRYPTION_KEY`, `HASH_PEPPER`, `CRON_SECRET`), conta de marketplace do Mercado Pago (Pagamentos Avançados + aplicativo OAuth), SMTP e SMS, dados da operadora, criar o admin (`ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run create-admin` — a senha só no terminal local), aprovação dos textos legais.

## Limitações e pontos de atenção
- **Mercado Pago:** retenção/repasse/devolução usam a API de Pagamentos Avançados, implementada por REST e testada só com simulação. Precisa de habilitação pelo Mercado Pago e validação no sandbox; em produção, hoje só Pix para o comprador.
- **Regulatório:** o Vendeu não deve manter o dinheiro em conta própria; a retenção é do Mercado Pago. Enquadramento para validar com a advogada.
- **Vendas por fora:** com contato oculto até o recebimento e pagamento só pelo app, o risco cai muito, mas não zera (a taxa de retirada de R$ 10 cobre só quem desiste na plataforma).
- **Imóveis e automóveis** seguem o mesmo fluxo (7 dias de devolução e Pix têm limites práticos para valores altos): decisão pendente.
- Admin sem 2 etapas ainda; verificação de documento é humana; fotos ficam no banco (migrar para storage se crescer).
