# Regras clínicas implementadas

Valores são padrões da literatura, **todos configuráveis** em `src/core/rules.ts` (`THRESHOLDS`) e `src/core/materials.ts`.

## 6 chaves da oclusão de Andrews (1972)
| Chave | O que é medido | Tolerância no software |
|---|---|---|
| 1 – Relação interarcos | Cúspide MV do 1º molar superior × sulco entre cúspides V e média do 1º molar inferior (distância ao longo do eixo MD do molar inferior); canino superior × ameia canino/1º PM inferior | ±1 mm (aviso), ±2,5 mm (erro) |
| 2 – Angulação (tip) | Desvio do tip efetivo à norma de Andrews por dente | ±3° aviso, ±6° erro |
| 3 – Inclinação (torque) | Idem para o torque | ±3° aviso, ±7° erro |
| 4 – Rotações | Rotação sobre o longo eixo | >3° aviso, >8° erro |
| 5 – Contatos | Lacuna/penetração entre pontos de contato vizinhos medida sobre os marcos reais | espaço >0,3 mm aviso, >0,8 mm erro; penetração >0,4 / >1,0 mm |
| 6 – Plano oclusal | Profundidade da curva de Spee (afastamento máximo à linha incisal→último molar) | 0–1,5 mm ideal; >2 mm aviso; >3 mm erro; reversa <−0,3 mm |

Normas de tip/torque (graus): superior — central 5/7, lateral 9/3, canino 11/−7, PM −7, 1º molar 5/−9;
inferior — central/lateral 2/−1, canino 5/−11, 1º PM 2/−17, 2º PM 2/−22, 1º molar 2/−30, 2º molar 2/−35.

## Oclusão
* **Overjet** 1–3 mm (aviso <0,5 ou >4; erro <0 ou >6). **Overbite** 1–3 mm / 20–30 % da coroa inferior (erro <−0,3 ou >6).
* **Curva de Wilson**: círculo de mínimos quadrados (Kåsa) pelas cúspides V/L dos 1ºs molares inferiores; aceito 60–250 mm.
* **Mordida cruzada posterior**: cúspide V superior mais interna que a inferior.
* **Bolton**: anterior 77,2 ± 1,65 % ; total 91,3 ± 1,91 %.
* **Linha média** superior × inferior: >1 mm aviso, >2 mm erro.

## Estética
* Largura aparente (projeção frontal) lateral/central e canino — **áurea** (1 : 0,618), **RED** 70 %/80 %, **Preston** (1 : 0,66 : 0,84), tolerância ±7 %.
* Largura/altura do incisivo central 75–85 %; lateral 0,5–1,5 mm mais curto; zênite do lateral ~0,5–1 mm incisal à linha central–canino.
* Simetria direita/esquerda (largura >0,3 mm; borda >0,4 mm).
* Foto: plano incisal paralelo à linha interpupilar (≤1,5°), exibição incisal em repouso (♀ 1,5–4 mm; ♂ 0,5–2,5 mm), linha média dentária × facial, arco do sorriso, corredor bucal (≤ ~15–18 %).
* Forma facial → forma dental (Williams; Frush & Fisher): ver `profiles.ts` — são **tendências estatísticas**.

## Materiais, preparo e CAM (referências genéricas — conferir IFU)
Espessuras mínimas e áreas de conector por material em `materials.ts` (zircônia monolítica posterior 1,0–1,5 mm; e.max oclusal 1,5 mm, faceta 0,3–0,6 mm;
conectores de zircônia ≥12 mm² anterior e ≥16 mm² posterior; ponte de e.max até 3 unidades terminando no 2º PM).
Espaço de cimento 0,05–0,10 mm; conicidade do preparo 6–12° (aviso >20° ou <4°); fator de sinterização 1,20–1,25 (lido do lote do disco).

## Guia cirúrgico
Entre implantes ≥3 mm; implante–dente ≥1,5 mm; osso V/L ≥2 mm por face; canal mandibular ≥2 mm; seio ≥1 mm; forame mentual (zona de segurança 4 mm anterior/8 mm inferior);
angulação ≤15° do eixo protético; parede de guia ≥2 mm e do colar da manga ≥1,5 mm; ≥4 dentes de apoio (2 por lado) em guias dentossuportados.
