# Vendeu: material de divulgação

Nome e domínio provisórios (Vendeu, vendeu.app). Tudo foi feito só com os fatos do produto (`shared/brand.ts`, `fees.ts`, `catalog.ts` e `docs/legal`).

## O que tem aqui

| Arquivo / pasta | Conteúdo |
|---|---|
| `cards/carrossel-anunciar-gratis/` | 8 cards 1080×1350 |
| `cards/carrossel-quanto-custa/` | 5 cards 1080×1350 (R$ 120, R$ 800, R$ 3.500) |
| `cards/carrossel-5-dicas-anti-golpe/` | 6 cards 1080×1350 |
| `cards/posts-categorias/` | 6 posts 1080×1080 |
| `cards/stories/` | 4 stories 1080×1920 |
| `cards/og-image.png`, `cards/capa-facebook.png`, `cards/foto-perfil.png` | 1200×630, 1640×624, 1080×1080 |
| `impressos/` | `cartaz-a4.png` (2480×3508), `santinho-a6-frente.png` e `-verso.png` (1240×1748), `selo-vendedor-verificado.png` (transparente) |
| `REDES-SOCIAIS.md` | legendas, ganchos A/B, bio, anúncios Meta, roteiros de Reels, respostas, calendário de 30 dias |
| `KIT-LANCAMENTO.md` | WhatsApp, e-mail, release, Google Ads, LinkedIn, grupos de bairro, parcerias, FAQ, glossário, checklist |
| `../site/` | landing page (um `index.html`, `assets/`, `vercel.json`, `sitemap.xml`, `robots.txt`) |
| `landing-preview-*.png` | capturas da landing (mobile, desktop, mobile escuro) |

## Como regerar os cards e impressos

Precisa de Node, do `playwright` (já instalado no ambiente) e de uma pasta com `@fontsource/poppins` e `qrcode`:

```bash
mkdir -p /tmp/vendeu-fontes && cd /tmp/vendeu-fontes && npm init -y && npm i @fontsource/poppins qrcode
cd /home/user/dentalpos-one/vendeu/docs/marketing
export VENDEU_FONTS=/tmp/vendeu-fontes
node gerar-cards.cjs        # cards/
node gerar-impressos.cjs    # impressos/ (cartaz, santinho, selo)
node testar-landing.cjs     # testa a calculadora e regera landing-preview-*.png
```

- Textos e cores ficam em `gerar-cards.cjs`, `gerar-impressos.cjs` e `lib.cjs` (CSS da marca). O logo e o símbolo vêm de `vendeu/brand/` (a versão branca só troca a cor do texto).
- Se mudar o nome ou o domínio: `lib.cjs` (`URL_SITE`, `SHOW_URL`), os textos dos geradores, `site/index.html` e os `.md`.
- Depois de regerar `og-image.png`, copie para a landing: `cp cards/og-image.png ../../site/assets/og-image.png`.

## Landing page

- `site/index.html` tem no topo do script a constante `APP_URL` (troque para mudar todos os links do app).
- A calculadora usa a mesma regra de `shared/fees.ts`. O teste `testar-landing.cjs` confere 150, 150,01, 500, 501, 1000, 1500, 2000, 3000, 3001, 4000 e 4000,01 digitando no campo. Também roda com `?selftest` (resultado no console).
- Sem cookies, sem scripts de terceiros, sem CDN (fontes locais em `assets/fonts`). Tema escuro automático (e botão para alternar, sem salvar nada).
- Para publicar na Vercel, use `site/` como diretório raiz do projeto.

## Afirmações que merecem revisão jurídica (Dra. Roberta)

1. "Anunciar é grátis" em todas as peças e nos anúncios pagos: precisa vir sempre junto de "você só paga quando vende" e do acesso à tabela de taxas (CDC, CONAR: clareza de preço).
2. "Anunciantes verificados" e o selo "Vendedor verificado Vendeu": confirmar o que exatamente a verificação garante e quando o selo pode ser usado.
3. "Mais segurança", "alertas automáticos", "orientações anti-golpe": confirmar que o texto não induz a promessa de proteção; manter sempre o aviso de que o Vendeu não participa da negociação nem recebe o dinheiro da compra.
4. Taxa na locação "sobre o valor mensal, uma única vez" (vem da minuta da Política de Taxas, ainda não aprovada). Os documentos legais estão como MINUTA.
5. "Sobra para você" (valor menos taxa) nos cards e na calculadora: é só simulação, mas confirmar se o termo é adequado.
6. Pagamento "em até 7 dias" por Pix ou cartão (Mercado Pago): confirmar com a política final.
7. "Sem cookies de publicidade no app" e "esta página não usa cookies": manter verdadeiro; se for ligar pixel Meta/Google Ads, é preciso aviso de cookies, consentimento e atualização da Política de Cookies.
8. Fotos "sem dados de localização (GPS)" e "registro de origem (IP, e-mail e telefone)": conferir a redação com a Política de Privacidade.
9. E-mail e WhatsApp: só com opt-in documentado, identificação do controlador e descadastro; os textos têm campos [COLCHETES] para razão social, CNPJ e endereço.
10. Release: sem declaração de porta-voz até ser escrita e aprovada; "Chegou"/"já está no ar" só quando for verdade; anúncios de imóveis podem ter restrições de segmentação na Meta.
11. Exemplos de preço (R$ 120, R$ 800, R$ 3.500) são ilustrativos da tabela, não promessa de venda.
12. Uso da marca: verificar disponibilidade do nome "Vendeu" (INPI) antes de investir em mídia paga.
