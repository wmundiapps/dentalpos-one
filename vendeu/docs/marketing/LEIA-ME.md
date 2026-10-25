# Vendeu: material de divulgação

Nome e domínio provisórios (Vendeu, vendeu.app). **Fonte de verdade: `docs/MODELO-DE-NEGOCIO.md`** (inclui o que pode e o que não pode ser dito). Taxas: `shared/fees.ts`.

Mensagem-mestra: compra protegida pela plataforma. Tudo acontece dentro do Vendeu, sem contato entre comprador e vendedor até o produto ser recebido; o pagamento fica retido no Mercado Pago; o comprador tem 7 dias para devolver; anunciar não custa nada e a comissão só existe quando a venda se conclui; retirar anúncio publicado sem vender custa R$ 10.

> Atenção: `shared/brand.ts` (campo `tagline`) e a seção de marketing do `vendeu/CLAUDE.md` ainda trazem a frase antiga "Anunciar é grátis. Você só paga quando vende." e "Vendeu não participa do pagamento da compra". Esses arquivos estão fora do escopo deste material; atualize-os.

## O que tem aqui

| Arquivo / pasta | Conteúdo |
|---|---|
| `cards/carrossel-compra-protegida/` | 8 cards 1080×1350 (gancho, problema, como funciona, dinheiro retido, contato só depois, 7 dias, quanto custa, chamada) |
| `cards/carrossel-quanto-custa/` | 6 cards 1080×1350 (comissão com R$ 120, R$ 800 e R$ 3.500, com "você recebe"; retirar sem vender R$ 10) |
| `cards/carrossel-5-dicas-anti-golpe/` | 6 cards 1080×1350 |
| `cards/posts-categorias/` | 6 posts 1080×1080 |
| `cards/stories/` | 4 stories 1080×1920 (`lancamento`, `dinheiro-retido`, `contato-depois`, `sete-dias`) |
| `cards/og-image.png`, `cards/capa-facebook.png`, `cards/foto-perfil.png` | 1200×630, 1640×624, 1080×1080 |
| `impressos/` | `cartaz-a4.png` (2480×3508), `santinho-a6-frente.png` e `-verso.png` (1240×1748), `selo-vendedor-verificado.png` (transparente) |
| `REDES-SOCIAIS.md` | legendas com hashtags, 3 ganchos A/B, bio, Meta Ads, 3 roteiros de Reels, respostas-padrão, calendário de 30 dias |
| `KIT-LANCAMENTO.md` | WhatsApp (opt-in), e-mail, release, Google Ads, LinkedIn, grupos de bairro, parcerias, FAQ de suporte, glossário, checklist |
| `../site/` | landing page (um `index.html`, `assets/`, `vercel.json`, `sitemap.xml`, `robots.txt`) |
| `landing-preview-*.png` | capturas da landing (mobile 390 px, desktop 1280 px, mobile escuro) |

## Como regerar os cards e impressos

Precisa de Node, do `playwright` (já instalado no ambiente) e de uma pasta com `@fontsource/poppins` e `qrcode`:

```bash
mkdir -p /tmp/vendeu-fontes && cd /tmp/vendeu-fontes && npm init -y && npm i @fontsource/poppins qrcode
cd /home/user/dentalpos-one/vendeu/docs/marketing
export VENDEU_FONTS=/tmp/vendeu-fontes
node gerar-cards.cjs        # cards/
node gerar-impressos.cjs    # impressos/ (cartaz, santinho, selo)
node testar-landing.cjs     # testa a landing e regera landing-preview-*.png
cp cards/og-image.png ../../site/assets/og-image.png
```

- Textos e cores ficam em `gerar-cards.cjs`, `gerar-impressos.cjs` e `lib.cjs` (CSS da marca). O logo e o símbolo vêm de `vendeu/brand/`.
- Se mudar o nome ou o domínio: `lib.cjs` (`URL_SITE`, `SHOW_URL`), os textos dos geradores, `site/index.html` e os `.md`.
- Ao regerar, apague antes pastas de cards que deixaram de existir (os scripts só escrevem, não removem).

## Landing page

- `site/index.html` é um arquivo único. No topo do script há a constante `APP_URL` (troque para mudar todos os links do app).
- Seção "Como funciona a compra protegida": 7 passos e um diagrama SVG inline (onde está o dinheiro e quando o contato é liberado). O FAQ tem 12 perguntas, com o mesmo texto no JSON-LD (FAQPage).
- A calculadora usa a mesma regra de `shared/fees.ts` e mostra comissão e "você recebe" (preço menos comissão), além da linha "retirar anúncio publicado sem vender: R$ 10". O `testar-landing.cjs` confere 150, 150,01, 500, 501, 1000, 1500, 2000, 3000, 3001, 4000 e 4000,01 digitando no campo; confere "você recebe", as 12 perguntas do FAQ, o JSON-LD, a ausência de termos proibidos e a rolagem horizontal em 390 px e 1280 px.
- Sem cookies, sem scripts de terceiros, sem CDN (fontes locais em `assets/fonts`). Tema escuro automático, com botão para alternar (sem salvar nada).
- Para publicar na Vercel, use `site/` como diretório raiz do projeto.

## Afirmações para revisão jurídica (Dra. Roberta)

1. **"Compra protegida"** (nome do carrossel, do diferencial e da seção da landing). Confirmar se o termo pode ser usado como título sem induzir garantia absoluta (CDC art. 37, CONAR). Todas as peças trazem o aviso de que o Vendeu é plataforma de anúncios, que o pagamento é processado pelo Mercado Pago e que a moderação decide disputas. Nunca usamos "100% seguro", "compra garantida", "sem golpes".
2. **"Pagamento retido" / "o dinheiro fica retido no Mercado Pago".** Confirmar com o contrato e a habilitação "Pagamentos Avançados" do Mercado Pago que a descrição (retenção até o recebimento e o prazo de 7 dias; repasse ao vendedor) é fiel, e que o Vendeu não é instituição de pagamento nem "custodia" valores. O repasse automático ainda depende de habilitação e de validação no sandbox.
3. **"7 dias para devolver" e "devolveu = dinheiro integral de volta, ninguém paga nada".** Conferir com o direito de arrependimento do CDC (art. 49, 7 dias para compras à distância), com o caso de produtos usados entre particulares e com a locação, e com o texto dos Termos. Verificar a frase "devolução integral" quando houver custo de frete e a regra de 10 dias para o vendedor confirmar o retorno (depois, a moderação decide).
4. **"Anunciar não custa nada" x comissão e taxa de R$ 10.** A frase vem sempre junto de "comissão só quando a venda se conclui", e "retirar anúncio publicado sem vender custa R$ 10" aparece na landing, na tabela, nos cards e nos impressos (clareza de preço, CDC art. 31 e 37, CONAR). Evitamos "grátis" sozinho. Confirmar também a redação "comissão descontada do repasse" e a locação "sobre o valor do aluguel combinado, uma única vez".
5. **"Contato só depois do recebimento" e a liberação de dados** (nome, telefone, e-mail) entre as partes após o recebimento: conferir base legal e aviso na Política de Privacidade (LGPD).
6. **"Vendedor verificado" e o selo.** Definir o que a verificação garante e quando o selo pode ser usado; manter "Nenhuma plataforma elimina todos os riscos".
7. **"Você recebe" (preço menos comissão)** nos cards e na calculadora: é simulação ilustrativa, sem promessa de venda.
8. **Disputas decididas pela moderação**: confirmar o texto dos Termos sobre critérios, prazos e eventual recurso.
9. **Exemplos de preço** (R$ 120, R$ 800, R$ 3.500) ilustrativos da tabela. Imóveis e automóveis: nenhuma promessa específica, pendente de decisão do Robson sobre valores altos.
10. **Cookies e anúncios:** "esta página não usa cookies" deve continuar verdadeiro; para ligar pixel Meta/Google é preciso aviso, consentimento e atualização da Política de Cookies. Anúncios de imóveis e automóveis podem ter restrições de segmentação.
11. **E-mail e WhatsApp:** só com opt-in documentado, identificação do controlador e descadastro; os textos têm campos [COLCHETES] para razão social, CNPJ e endereço.
12. **Release:** sem declaração de porta-voz até ser escrita e aprovada; "chegou"/"no ar" só quando for verdade.
13. **Marca:** verificar a disponibilidade do nome "Vendeu" (INPI) antes de investir em mídia paga.
14. **Pendências técnicas que as peças não prometem:** pagamento por cartão do comprador (hoje só Pix) e repasse automático.
