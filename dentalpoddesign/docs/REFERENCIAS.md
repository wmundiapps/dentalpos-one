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

**IA de pontos faciais** — MediaPipe Face Landmarker (Google, licença Apache-2.0): 468 pontos de malha facial + 10 de íris; executado localmente via WebAssembly.
Pontos usados: íris 468/473 (pupilas), 61/291 (comissuras), 13/14 (lábios), contorno interno 78…308, 129/358 (asas), 234/454 (zigomas), 168/152 (linha média).

**Regras de zênite/altura** — contorno gengival: centrais = caninos; laterais = pré-molares (≈0,5 mm mais coronais); molares seguem os pré-molares. Seis chaves da oclusão (Andrews, 1972) e curvas de Spee (≤1,5 mm) e de Wilson.
**Forma do rosto × forma do dente** — Frush & Fisher (1956), Lombardi (1973), Williams (1914, teoria de harmonia).
