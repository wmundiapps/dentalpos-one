# DentalPos CAD

Módulo **independente** de desenho dental digital (CAD) da WMundi — coroas, facetas, enceramento (wax-up), mockup,
simulador de sorriso sobre foto, guias cirúrgicos para implantes e preparação CAM.
Roda 100 % no navegador (sem servidor, sem enviar dados do paciente). **Não faz parte do DentalPos One**: pode ser
integrado a qualquer sistema (iframe, componente React ou biblioteca ES) e comercializado separadamente.

> Ferramenta de apoio à decisão. Valores de referência (literatura/fabricantes) devem ser confirmados pelo profissional
> responsável; todo parâmetro é configurável. Não é dispositivo médico certificado.

## Como rodar

```bash
cd dentalpos-cad
npm install
npm run dev          # http://localhost:5199
npm test             # 17 testes do núcleo clínico/geométrico e do motor portado (vitest)
npm run build        # app (dist/) — inclui /gallery.html (biblioteca de dentes em 3D)
npm run build:lib    # biblioteca embutível (dist-lib/dentalpos-cad.js + cad.css)
```

Roteiro de teste passo a passo: [`docs/MANUAL-DE-TESTE.md`](docs/MANUAL-DE-TESTE.md).

## O que o sistema faz

| Módulo | Recursos |
|---|---|
| **Caso e biblioteca** | Perfil do paciente (formato do rosto, sexo, etnia, idade, personalidade, estilo). Biblioteca de ≈ 60 formas por rosto × sexo × forma (quadrado, ovoide, triangular, retangular, redondo…) + estilos (Hollywood, jovem, maduro). **Wizard IA** desenha o caso inteiro. Forma/largura do arco, overjet, overbite, Spee, Wilson, classe molar, regra de proporção (áurea, RED 70/80 %, Preston) e cor (VITA/Bleach). |
| **Dentes** | Edição por dente: posição (sliders, setas do teclado ou arrastar no 3D), tip/torque/rotação sobre a norma de Andrews, largura/altura, espelhamento, tipo de restauração e material, redução do preparo, **mapa de espessura 3D**, importação de STL/OBJ/PLY de dente (biblioteca própria). |
| **Oclusão (Andrews)** | As **6 chaves de Andrews** (relação molar/canina, angulação, inclinação, rotações, contatos, plano oclusal), overjet/overbite (mm e %), curva de Spee, raio de Wilson, linha média, Bolton, mordida cruzada, **mapa de contatos oclusais**. |
| **Sorriso / foto** | Calibração pela distância interpupilar, marcos faciais, contorno da boca, projeto dos dentes sobre a foto (cor, brilho, corredor bucal), grade (linha interpupilar, média, plano incisal, proporções), antes/depois, zoom, PNG. **Classifica o formato do rosto** pelos pontos e recomenda a forma dental. |
| **Escaneamento (STL)** | Motor **portado do DentalPos One** (`src/scan/`): importa arcada de trabalho, antagonista e registro de mordida; diagnóstico e reparo de malha; orientação ao projeto por 3 pontos (ajusta largura/profundidade do arco); linha de término; eixo de inserção e áreas em sombra; espessura, contato com antagonista e ajuste ao preparo do dente do projeto; exportação STL. |
| **Enceramento / mockup** | Modelo + gengiva por campo de distância (SDF), **escultura de cera** (adicionar/remover/alisar), **bandeja de mockup** com espessura/folga/respiros, exportação STL. |
| **Guia cirúrgico** | Planejamento de implantes (kits configuráveis), dados de CBCT opcionais, regras de segurança (≥ 3 mm entre implantes, ≥ 1,5 mm de dente, osso V-L, canal 2 mm, seio, forame mentual, ≤ 15° do eixo protético, suporte do guia), **geração da guia** (casca, colar, furos, mangas) em STL. |
| **Materiais / CAM** | Biblioteca de materiais (zircônia, e.max, PMMA…) com espessuras/conectores mínimos, compensação de sinterização, pinos de fresagem, **nesting em disco**, checagem de alcance da fresa, **pacote ZIP** (STL + projeto + relatório). |
| **IA e alertas** | Motor de regras (≈ 50 verificações) com mensagem, meta, dica e **correção automática** por achado; **“Corrigir tudo”** itera até convergir; revisão opcional por LLM (chave do próprio usuário). |
| **Relatório** | Pontuação por categoria, medidas, restaurações, implantes, achados — imprimir/PDF/HTML. |

Pesquisa de mercado (exocad, 3Shape, Amann Girrbach, Sirona, iTero, Straumann, Dental Wings, Medit, Bioparts…): [`docs/PESQUISA-MERCADO.md`](docs/PESQUISA-MERCADO.md).
Regras e referências clínicas: [`docs/REGRAS-CLINICAS.md`](docs/REGRAS-CLINICAS.md).

## Arquitetura

```
src/core/   núcleo sem dependência de UI (roda em Node e no navegador)
  anatomy · profiles · toothMesh · arch · project   → dentes paramétricos, arco, poses (Andrews/Spee/Wilson/overjet/overbite)
  measure · rules · ai · smile                      → medições, regras clínicas, autocorreção, análise facial/foto
  voxel · wax · crown · guide · cam · scan          → SDF/surface-nets, enceramento/mockup, coroa/espessura, guia, CAM, ICP/Kabsch
  materials · library · io · primitives · worker    → materiais, STL próprio, E/S (STL/OBJ/PLY/ZIP/JSON), jobs em Web Worker
src/scan/   motor de escaneamento portado do DentalPos One (STL, diagnóstico/reparo, preparo, contato, espessura…)
src/ui/     interface React + three.js
src/index.ts  API pública do núcleo      src/embed.tsx  montagem embutida
```

Convenções: milímetros e graus; mundo X = direita→esquerda do paciente (+esquerda), Y = anterior, Z = cranial;
dente local x = distal, y = vestibular, z = oclusal; numeração FDI.

## Integração com outros sistemas

* **iframe** (zero acoplamento): `https://…/index.html?embed=1&origin=https://seu-sistema` —
  `postMessage({type:"dpcad:load", project})` → módulo; recebe `dpcad:ready` e `dpcad:change` (com o projeto JSON).
  Só mensagens da origem informada são aceitas.
* **Biblioteca ES**: `npm run build:lib` e `import { mountDentalPosCad } from "./dentalpos-cad.js"` (+ `cad.css`).
* **Somente núcleo** (headless, p.ex. backend Node): `import { createProject, analyze, autoCorrect, evaluate } from "@dentalpos/cad"`.
* Projeto = JSON (`.dpcad.json`), versionado (`version: 1`).

## Limitações conhecidas (v0.1)

* A morfologia dentária é **paramétrica** (gerada por código), não escaneada: serve para planejar, simular e prototipar;
  para acabamento final use a importação de STL de dente (sua biblioteca licenciada).
* Não lê DICOM nem faz segmentação óssea: os dados de CBCT (largura/altura óssea, distâncias a canal/seio) são digitados.
* O repositório do DentalPos One traz o **catálogo** de dentes por FDI (`tooth-library`), mas nenhum arquivo STL de dente; por isso a biblioteca em uso aqui é a paramétrica. Coloque seus STLs e importe por dente na aba Dentes.
* Ainda não portado do DentalPos One: a Fila de Design ↔ Laboratório e o painel de caso (dependem do `OperationsHubService`); entram na integração.
* Os marcos faciais da foto são marcados manualmente (sem detecção automática por visão computacional).
* Parâmetros de kits de implante e de materiais são **genéricos**; confira a IFU do fabricante/lote.
* O formato `dentalProject` do exocad não é reproduzido (esquema proprietário não documentado).

## Arquivo único (sem instalar nada)
`npm run build:single` gera `dist-single/dentalpos-cad.html`: um único HTML que abre com duplo clique no Chrome/Edge/Firefox
(sem servidor e sem Web Worker; os cálculos pesados rodam na tela principal).
