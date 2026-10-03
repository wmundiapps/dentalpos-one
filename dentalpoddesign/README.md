# DentalPod Design

Sistema de **simulação digital do sorriso (DSD)** com **CAD 3D paramétrico** para planejar e fabricar
**facetas, coroas, pontes, próteses parciais removíveis e próteses totais** — tudo no navegador, sem enviar
dados do paciente a nenhum servidor.

Pode ser usado **separadamente** (aplicativo web estático, vendável como produto próprio) ou **integrado ao Dentalpos One**
(menu *Clínico → DentalPod Design*, paciente vinculado por `postMessage`).

## O que ele faz

| Etapa | Recursos |
|---|---|
| **Fotos** | Importa fotos (JPG/PNG/WebP), protocolo de fotos DSD (sorriso, face, repouso, afastador, perfil), foto base. |
| **Análise** | **IA de pontos faciais (MediaPipe, 100% no navegador)**: pupilas, linha média, comissuras, contorno interno dos lábios, asas nasais e zigomas em ~1 s, mais **forma do rosto** (quadrado/arredondado/oval/triangular). Também: análise facial guiada manual (pupilas, linha média, comissuras, lábios, asas nasais, zigomas), calibração em mm (distância interpupilar, medida real ou manual), **índice estético** com 15+ critérios: linha média, plano incisal × bipupilar, corredor bucal, exposição incisal/gengival, **arco do sorriso × lábio inferior**, relação L/A, proporções áurea/RED/Preston/Chu, simetria, bordos incisais e zênites, biometria facial (Gerber/Lombardi). |
| **Desenho** | **Desenho automático natural** (regras clínicas abaixo) e dentes **3D realistas** (esmalte com translucidez, mamelões, textura, brilho, luz) projetados sobre a foto com perspectiva calibrada e máscara labial; **5 tamanhos (PP–GG)**, catálogo de 30 moldes, **6 formas**, **5 sistemas de proporção**, **8 estilos**, SPA (sexo/idade/personalidade), 20 cores A–D + clareamento, arco (cônico/ovoide/quadrado), arco do sorriso, angulação/torque, edição individual por dente (arrastar, alças de largura/comprimento/angulação), simetria espelhada, **propostas A/B/C**, antes/depois, linhas DSD (grade, régua, zênites, proporções). |
| **CAD 3D** | Enceramento 3D com oclusão (arcada inferior, sobremordida/sobressaliência), **bases e selas de prótese**, placa/barra palatina, ferradura/barra lingual, **grampos circunferenciais**, importação de escaneamentos **STL/OBJ/PLY** com alinhamento manual, corte sagital, medição em mm. |
| **Plano** | Situação por dente (faceta, coroa, pôntico, implante, prótese, ausente, extração), cores e materiais sugeridos. |
| **Apresentar** | Comparação de propostas, imagem antes/depois, simulação em alta resolução, **relatório PDF**. |
| **Exportar** | **STL (binário/ASCII), OBJ+MTL, PLY e 3MF (com cores)**; faceta em casca fina, coroa oca, dente sólido, monobloco (união booleana), encaixes (sockets) nas bases com folga, bandeja de impressão ou orientação clínica, relatório de fabricação (JSON/CSV). Todas as malhas são verificadas como **fechadas (watertight)**. |

### Regras clínicas incorporadas ao motor
* **Seis chaves de Andrews**: relação molar/canino classe I (o motor alinha o arco inferior), angulação positiva, inclinação (anteriores superiores para vestibular; PM/molares para palatina progressivamente; inferiores com inclinação lingual progressiva = **curva de Wilson**), sem rotações, **contatos justos**, **curva de Spee** plana a 1,5 mm.
* **Zênites / contorno gengival**: central = canino (X+0,5), lateral = pré-molar (X), molares X−0,5 e X−1; inferiores: incisivos = pré-molares (X), canino X+0,5, molares X−0,5.
* **Linha do sorriso**: gengiva levemente visível (≈0,7 mm), bordos de incisivos e caninos tocando levemente o lábio inferior, arco do sorriso acompanhando o lábio, corredor bucal reduzido (inclui mais dentes/alarga o arco).
* **Posições artísticas**: *in-set* dos laterais, *off-set* dos caninos e dos molares (superiores e inferiores); ângulos incisais **mesiais mais retos e distais mais arredondados**; cúspides vestibulares maiores que as linguais/palatinas; **equador vestibular mais volumoso** nos posteriores superiores; **cristas marginais** acompanham a altura do dente vizinho.
* **Arcos**: superior ovoide com arredondamento posterior discreto; inferior arredondado na região anterior e **retilíneo** nos posteriores (sem lingualizar). **Sobremordida e sobressaliência 1–2 mm**.
* **Biometria**: forma do dente pela forma do rosto, largura do central por biometria facial, **proporção áurea** (ajustada) e **eixo do canino apontando para a pupila**; plano oclusal comissura→trágus (foto de perfil).

### Diferenciais em relação a ferramentas de DSD 2D

* O desenho **não é um desenho plano**: é o mesmo modelo 3D que vai para a impressora/fresadora, projetado na foto.
* Dimensões reais em **mm** (calibração da foto) — o que você vê é o que é exportado.
* Análise estética quantitativa com sugestões e **desenho automático** (linha média, plano incisal, tamanho por biometria, arco ao lábio).
* Facetas, coroas, pontes e próteses (parcial/total) no **mesmo fluxo**.
* Propostas comparáveis lado a lado e relatório PDF.
* 100% local (IndexedDB): privacidade por padrão (LGPD).

## Executar

```bash
cd dentalpoddesign
npm install
npm run dev            # desenvolvimento  → http://localhost:5173
npm run build          # build estático em dist/ (base relativa: serve na raiz ou em subpasta)
npm run preview        # serve o build em http://localhost:4173
```

Abra **Casos → Abrir caso de demonstração** para testar o fluxo completo sem fotos reais.

### Verificações automáticas

```bash
npm run typecheck                      # TypeScript estrito
npm run test:auto                      # desenho automático + análise (6 chaves) sobre o caso demo
npm run verify                         # 392 coroas + cascas + coroas ocas + bases/selas/conectores/grampos: todas watertight
npx tsx scripts/test-boolean.ts        # união e encaixes por booleana (manifold)
npx tsx scripts/test-production.ts     # 24 combinações modo × produto × monobloco; STL/OBJ/PLY/3MF
npm run test:e2e                       # (precisa de Chromium) fluxo completo no navegador + downloads + PDF
node scripts/e2e-wizard.mjs            # análise guiada do zero + ponte de integração (iframe/postMessage)
node scripts/e2e-ai.mjs foto.jpg       # IA de pontos faciais + desenho automático com a SUA foto
```

`npm run test:e2e` espera o app em `http://127.0.0.1:4173/` (rode `npm run preview`). Defina `CHROMIUM_PATH` se o
Chromium não estiver em `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

## Integração com o Dentalpos One

Veja [`docs/INTEGRACAO.md`](docs/INTEGRACAO.md). Resumo: `npm run build:integrado` gera o build e o copia para
`frontend/public/dentalpoddesign/`; a página `frontend/src/pages/SmileDesign.tsx` (rota `/smile-design`) embute o módulo e
envia o paciente selecionado.

## Documentação

* [`docs/MANUAL.md`](docs/MANUAL.md) — manual do usuário (passo a passo clínico).
* [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — como o motor funciona (geometria, layout, render, exportação).
* [`docs/INTEGRACAO.md`](docs/INTEGRACAO.md) — embutir no Dentalpos One ou em outro host; protocolo `postMessage`.
* [`docs/REFERENCIAS.md`](docs/REFERENCIAS.md) — base científica e valores usados.

## Limites e responsabilidade técnica (leia)

* Os dentes são **gerados por parametrização anatômica** (sem malhas de terceiros): servem como **enceramento diagnóstico /
  mock-up / provisório** e como base de prótese. Para trabalhos **definitivos** valide margens, espessuras mínimas do material,
  oclusão e adaptação ao escaneamento/preparo no software CAD/CAM de produção.
* A escala da foto pela distância interpupilar é **estimada (±5%)**; para fabricar calibre com **medida real**.
* As cores A–D/BL na tela são **referências visuais aproximadas**; confirme com escala física.
* A IA de pontos faciais (MediaPipe, modelo de ~4 MB e WASM de ~12 MB servidos junto do app, sem internet) funciona melhor com foto frontal nítida, olhos abertos e sorriso; sempre revise os pontos (todos são arrastáveis) e use a análise guiada se o rosto não for detectado.
* Produto não é dispositivo médico certificado; o uso clínico é de responsabilidade do cirurgião-dentista.
