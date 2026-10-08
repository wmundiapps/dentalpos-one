# Landing page do DentalPos One

**Versão atual:** `landing-dentalpos-one-v3.html`, publicada em `https://one.dentalpos.com.br/landingpage` (projeto Vercel `dentalpos-landing`). A página principal (`/`) foi atualizada com a mesma política (cópia em `pagina-principal-www-dentalpos.html`); o formulário de contato (`api/contato.js`) não mudou.
`landing-dentalpos-one-v1.html` é o rascunho original (artefato https://claude.ai/artifact/MqEQR3z6hwDpRX6j9Q3nyo), mantido só como histórico.

## Política de atratividade e lançamento (definida em 03/10/2026)
- **Promoção de lançamento:** 30 dias grátis, sem cartão de crédito, e **50% de desconto nos 12 meses seguintes**.
- **Planos:** Basic R$ 197/mês, Intermedium R$ 397/mês, Plenum R$ 597/mês (com 50% no 1º ano: R$ 98,50, R$ 198,50 e R$ 298,50).
- **Acadêmicos de odontologia:** acesso gratuito durante o último ano da graduação e por mais 90 dias depois da formatura (carência); depois, mensalidade reduzida (50% de desconto) nos 12 meses seguintes. Profissionais: 30 dias grátis e 50% de desconto nos 12 meses seguintes. Estudantes de outros períodos: My Students, R$ 23/mês.
- **Instalação:** em destaque apenas a instalação gratuita feita pelo próprio assinante (passo a passo + IA integrada). Discretas: assistida remota R$ 499 em 5x no cartão; feita pela equipe R$ 2.000 em 10x no cartão.
- **Cobrança:** sem cartão no teste; depois, cobrança por Asaas ou Mercado Pago (a implementar em até 30 dias).

## Domínio
`one.dentalpos.com.br` aponta para a Vercel (registro A 76.76.21.21). `www.dentalpos.com.br` e o domínio raiz ainda estão no DNS do Wix (nameservers wixdns.net) e mostram o site do Wix, não a landing. Para usar o `www`, aponte o CNAME de `www` para `cname.vercel-dns.com` no painel do Wix (isso substitui o site atual do Wix).

## Como publicar uma nova versão
O projeto `dentalpos-landing` não está ligado ao GitHub (deploy manual). Publicar novo deployment mantendo `index.html` e `api/contato.js` e trocando `landingpage/index.html`.

## Reverter
A versão anterior da página principal (50% só nos 3 primeiros meses) é o deployment `dpl_3YsvqnfLRR3tiFTBwUNgNkECZbv5` do projeto `dentalpos-landing` na Vercel (Promote to Production).
