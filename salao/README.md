# BeautyPos — salões de beleza e barbearias (by WMundi)

Produto novo do monorepo. **Nome provisório "BeautyPos"** — trocar em todos os arquivos se o Robson escolher outro.

| O quê | Onde |
|---|---|
| Demonstração interativa (abre direto no navegador) | `demo/index.html` |
| Landing page (Meta/Google Ads) | `landing/index.html` |
| Logomarca | `brand/logo.svg`, `brand/logo-icon.svg` |
| Cards Meta Ads (SVG 1080×1080 e stories) | `ads/meta-*.svg`, texto em `ads/META-ADS.md` |
| Google Ads | `ads/GOOGLE-ADS.md` |
| Robôs (14) | `robos/ROBOS.md`, `robos/robos.json` |
| Skills Facebook, Instagram, WhatsApp | `skills/*/SKILL.md` |
| Contratos (minutas) | `docs/contratos/` |

## Planos
Smart Individual R$ 59,90 · Pequeno R$ 129 · Médio R$ 249 · Grande R$ 559 · Sob demanda · ou R$ 10 por cliente atendido (sem mensalidade).

## Modos
♂ Barbearia (Masculino) · ♀ Studio Hair (Feminino) · ⚥ Misto — catálogo, tema e profissionais mudam pelo seletor.

## Próximos passos (implementação real)
1. Backend: tabelas de salão, serviço, profissional, agendamento, comanda, estoque, clube (SQL manual em `backend/prisma/manual-migrations/`, RLS ligado — vira PR para decisão).
2. Integrar WhatsApp Business API, Meta Graph, gateway de pagamento, emissor fiscal e Cashbacksmart (chaves digitadas pelo dono nas telas de integração).
3. Revisão jurídica das minutas (Dra. Roberta) antes de qualquer uso.
Valores e preços citados vêm do briefing; o motor de agenda da demo é um protótipo em JavaScript.
