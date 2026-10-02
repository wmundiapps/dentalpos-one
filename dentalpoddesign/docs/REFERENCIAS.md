# Base científica e valores usados

**Fluxo DSD** — Coachman C, Calamita M. *Digital Smile Design: a tool for treatment planning and communication in esthetic dentistry*. Quintessence Dent Technol, 2012;
Coachman C, Calamita MA, Sesma N. *Dynamic documentation of the smile and the 2D/3D digital smile design process*. Int J Periodontics Restorative Dent, 2017.
Passos: fotos padronizadas → linha bipupilar/linha média → calibração → proporções → arco do sorriso/zênites → desenho 2D/3D → mock-up.

**Proporções** — Levin EI (1978) proporção áurea 1 : 0,618 : 0,382 (larguras aparentes) · Ward DH (2001) proporção RED (razão recorrente, 62–80%; padrão 70%) ·
Preston JD (1993) lateral ≈ 66% do central, canino ≈ 84% do lateral · Chu SJ (2011) porcentagem áurea 25/15/10% da largura intercaninos.

**Dimensões de coroa** — Wheeler/Nelson (anatomia dental) — central superior ≈ 8,6 × 10,8 mm, lateral 6,6 × 9,2, canino 7,6 × 10,4, 1º PM 7,0 × 8,4, 1º molar 10 × 7,4 etc.
(`core/toothSpecs.ts`). Relação largura/altura do central 75–85%.

**SPA** — Frush JP, Fisher RD (1956): sexo (ângulos incisais arredondados × quadrados), personalidade (agudez do canino, laterais), idade (desgaste incisal).

**Biometria** — Gerber (largura do central ≈ largura bizigomática ÷ 16) · Lombardi (largura interalar ≈ distância intercaninos): central ≈ interalar ÷ 4.

**Linha do sorriso / arco do sorriso** — Tjan AHL et al. (1984); Sarver DM (2001) e Sarver & Ackerman (2003): arco consonante (bordos incisais paralelos ao lábio inferior),
exposição incisal 75–100%, exposição gengival ≤ 2 mm (3 mm limite estético). Corredor bucal ≈ 8–20% da largura do sorriso (faixa adotada).

**Angulação e torque** — Andrews LF (1972), seis chaves da oclusão: angulação de coroa (central 2–5°, lateral 5–9°, canino 8–11°) e torque (incisivos +, posteriores −) — valores atenuados em `designEngine.ts` para uso estético.

**Cores** — Escala clássica A–D e clareamento (BL1–BL4): valores sRGB **aproximados**; não substituem a escala física.

**Prótese removível** — selas em arco dos dentes de prótese, placa/barra palatina, barra/ferradura lingual, grampos circunferenciais: geometria diagnóstica parametrizada, não substitui o delineamento de estrutura metálica no CAD de PPR.

Os valores acima são referências de uso corrente na literatura; confira as fontes originais antes de adotá-los como protocolo institucional.
