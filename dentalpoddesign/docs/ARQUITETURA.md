# Arquitetura — DentalPod Design

Pilha: **TypeScript estrito · React 19 · Vite · three.js · manifold-3d (WASM) · jsPDF**. Sem back-end; persistência em IndexedDB.

```
src/
  core/        modelo de dados e regras (puro, testável em Node)
    types.ts        Project, Variant, DesignParams, ToothCfg, Marks…
    toothSpecs.ts   dimensões médias (Wheeler/Nelson), formas, sistemas de proporção, catálogo de moldes
    archForm.ts     curva do arco  z(x) = −D·(|x|/a)^p  (cônico p=2,35 · ovoide 3,0 · quadrado 4,0)
    designEngine.ts layout: larguras (reais ou aparentes), posição no arco, angulação, torque, arco do sorriso, sobremordida
    analysis.ts     índice estético, biometria, ajuste do arco ao lábio, altura incisal
    shades.ts       escala BL/A/B/C/D → cores do esmalte (corpo, cervical, incisal)
    presets.ts      parâmetros padrão e 8 estilos
  geometry/    malhas (puro, sem DOM)
    toothMesh.ts    gerador paramétrico de coroas; cascas de faceta; coroa oca; silhueta
    denture.ts      bases/selas (laje fechada), placa palatina, barras, grampos (tubo), conectores de ponte
    boolean.ts      união/subtração (manifold) e folga
    production.ts   monta as peças de fabricação (produto, orientação, bandeja, encaixes, monobloco)
    exporters.ts    STL bin/ASCII · OBJ+MTL · PLY · 3MF (zip) · relatório
    importers.ts    STL/OBJ/PLY → malha
  render/      three.js / canvas
    toothScene.ts   cena (luzes, IBL, cache de geometria)    overlay.ts  composição foto + 3D + máscara labial
    materials.ts    esmalte físico (clearcoat, sheen, bump)    demoFace.ts  foto de demonstração procedural
  store/       estado global (useSyncExternalStore), histórico (undo/redo), IndexedDB, arquivo .dpd
  ui/          painéis por etapa, PhotoStage (canvas interativo), Viewer3D, relatório PDF
```

## Geração do dente
Sistema local: +X distal · +Y incisal/oclusal (origem na borda incisal / centro da mesa) · +Z vestibular; coroa em Y ∈ [−H, 0].

A superfície é uma pilha de **anéis** (cortes axiais, super-elipses) cujas dimensões vêm de curvas anatômicas:
largura de contato mesial/distal em alturas diferentes, razão cervical, perfis vestibular e lingual (cíngulo, fossa), curvatura da junção
cemento-esmalte, ângulos incisais, cúspide do canino (braços mesial/distal) e mesa oclusal de pré-molares/molares (sulcos, cúspides, cristas marginais).
Calotas cervical e superior fecham a malha, que é **idêntica em topologia** para todos os dentes ⇒ facetas (casca), coroas ocas e booleanas
são derivadas sem remalhar. Cada vértice recebe cor (corpo→cervical→incisal translúcido, mamelões, ruído orgânico), UV e alfa (fade cervical para
fundir com a gengiva da foto).

## Layout no arco
Largura de cada dente = arco sobre a curva. Para Áurea/RED/Preston/Chu os 3 anteriores usam **larguras aparentes** (vista frontal): o motor
procura o ponto da curva em que a projeção frontal atinge a largura-alvo, de modo que a proporção vista na foto é a escolhida, e a largura real
(maior no canino) é consequência da curvatura. Bordos: curva do sorriso (`EDGE_OFFSET × smileArc`), laterais mais curtos (sexo), sobremordida/sobressaliência
com decaimento para posteriores.

## Composição na foto
Câmera em perspectiva casada com a foto: o plano z=0 (bordo incisal) mapeia exatamente para px/mm calibrados; FOV e distância configuráveis.
O render 3D (WebGL, ACES desligado, luzes + IBL) é recortado pela **máscara labial** (spline fechada), recebe sombra de corredor bucal, ajuste de exposição e
“apagamento” dos dentes originais por halo escuro. Seleção por raycast; contornos pela silhueta projetada.

## Fabricação
`production.ts`: dentes → (sólido | casca | oca) → matriz do arco → peças. Bases/selas via lajes fechadas A/B com bordas arredondadas; encaixes por
subtração booleana dos dentes dilatados pela folga; monobloco por união; pontes unem unidades+conectores. Exportação em Z-para-cima (clínica) ou bandeja
(dentes com face oclusal para cima, empacotados em prateleiras). Toda peça é checada: cada aresta compartilhada por exatamente 2 faces com sentidos opostos.

## Testes
`scripts/verify-geometry.ts` (watertight de 392 coroas × 3 variantes + bases), `test-boolean.ts`, `test-production.ts`, `e2e.mjs` e `e2e-wizard.mjs` (Playwright).
