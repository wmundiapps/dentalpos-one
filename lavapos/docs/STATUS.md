# Status do LavaPos (17/10/2026)

Legenda: ✅ pronto e testado · 🟡 pronto no código, depende de conta/chave/provedor para funcionar de verdade · 👤 depende de você

| Pedido | Situação | Observação |
|---|---|---|
| Categorias Carro, SUV, Utilitários, Vans, Caminhões | ✅ | renomeáveis |
| Check-in e check-out com checklist (estado do carro) | ✅ | marcação com ✕; na saída mostra o que mudou |
| Dados: proprietário, WhatsApp, e-mail, CPF p/ NF, placa, ano, marca, modelo | ✅ | listas de rolagem; categoria automática pelo modelo; CPF cifrado |
| Fotos de entrada e saída | ✅ | câmera do celular; regravadas sem GPS |
| Valores por categoria e por procedimento; itens configuráveis | ✅ | 9 serviços de exemplo (todos os que você listou) |
| Antes e depois em destaque + Google | ✅ / 🟡 | vitrine ✅; nota e avaliações do Google 🟡 precisam da chave `GOOGLE_PLACES_API_KEY` e do Place ID |
| Fidelização e cashback | ✅ | cashback próprio. **Cashbacksmart** ✅/🟡: botão de adesão para o gestor (painel e Fidelidade) e para o cliente (página pública e rodapé das confirmações por WhatsApp, SMS e e-mail) prontos e testados. 🟡 Falta o **endereço de cadastro da Cashbacksmart** (`CASHBACKSMART_URL`): sem ele o convite não sai. A sincronização do saldo via API deles depende da documentação e das credenciais |
| Clube de assinatura (semanal, quinzenal, trisemanal, mensal) | ✅ | "trisemanal" = a cada 21 dias (confirme) |
| Pagamentos Asaas com 10% para a plataforma | 🟡 | código pronto (divisão automática); **não testado no Asaas real** — precisa de conta/sandbox e `PLATFORM_ASAAS_WALLET_ID` |
| Marketing: lembrar de agendar; aviso de pronto; aviso de horário | ✅ / 🟡 | regras e fila ✅; envio real: e-mail (SMTP) e WhatsApp/SMS (provedor por webhook) 🟡 |
| Agenda inteligente (dias, horários, boxes, link para o cliente) | ✅ | |
| Oferta 30 dias grátis, depois R$ 119/mês | ✅ / 🟡 | teste de 30 dias ✅; cobrança da mensalidade 🟡 (Asaas da plataforma) |
| Financeiro com recebimento e nota fiscal automática | ✅ / 🟡 | recebimento ✅; **emissão de NF** 🟡 precisa de provedor fiscal e inscrição municipal (hoje a nota fica pronta na fila) |
| Estoque; fornecedores | ✅ | baixa automática por serviço |
| Lembretes de licenças, alvarás, aluguel, contratos | ✅ | e-mail ao dono |
| Precificação com margem, break even, lucro do mês | ✅ | |
| Segurança (hackers, vírus, phishing) | ✅ | `docs/SEGURANCA.md` + 👤 itens de DNS, chaves e teste de invasão |
| Contratos | ✅ minutas | 👤 aprovação do Robson e revisão da Dra. Roberta |
| Apple App Store e Google Play | 🟡 / 👤 | projetos, ícones, capturas e textos prontos (`docs/LOJAS-APP.md`); precisa de contas, Mac (iOS) e assinatura |
| Demonstrativo, nome, logomarca, cards Meta, Google Ads, landing page, e-mails | ✅ | `docs/DEMONSTRATIVO-LAVAPOS.pdf`, `marketing/`, `site/`, `brand/` |

## Antes de colocar no ar (👤, um passo por vez)
1. Criar o projeto **LavaPos** no Supabase (banco novo, separado do DentalPos) e passar a `DATABASE_URL` direto na Vercel.
2. Criar os dois projetos na Vercel (`lavapos` na raiz `lavapos/` e `lavapos-site` em `lavapos/site`) e os domínios `app.`/`api.`/`lavapos.com.br`.
3. Preencher as variáveis do `.env.example` (segredos gerados no terminal; cópia da `LAVAPOS_ENCRYPTION_KEY` guardada).
4. Criar conta Asaas da plataforma + subcontas; cadastrar o webhook; testar no sandbox.
5. Aprovar contratos (Robson + Dra. Roberta) e preencher razão social, CNPJ e e-mails.
6. Checar o nome (INPI, registro.br) e então liberar anúncios e lojas.
