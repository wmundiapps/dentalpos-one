# Manual do usuário — DentalPod Design

## 1. Começando
1. Abra o app e clique em **Abrir caso de demonstração** para ver tudo funcionando, ou **Novo caso**.
2. Cada alteração é salva automaticamente neste navegador (indicador *Salvo* no topo). **Ctrl+Z / Ctrl+Y** desfazem/refazem.
3. **Exportar caso (.dpd)** gera um arquivo com fotos e desenho para backup ou envio a um colega; **Importar arquivo .dpd** restaura.

## 2. Fotos
Protocolo recomendado (Coachman — DSD): face frontal com sorriso, face em repouso, afastador (intraoral), perfil.
Câmera na altura dos olhos, cabeça nivelada, pupilas visíveis, luz frontal difusa, foto nítida (≥ 12 MP).
Marque uma foto como **base** (a que receberá o desenho).

## 3. Análise facial
1. **Iniciar análise guiada**: clique, na ordem, em pupila direita, pupila esquerda, glabela, mento, comissura direita, comissura esquerda,
   borda inferior do lábio superior e borda superior do lábio inferior (linha média). O contorno interno dos lábios é gerado e
   pode ser ajustado arrastando os pontos brancos.
2. **Calibração**: por distância interpupilar (padrão 63 mm — ajuste), por **medida real** (clique em dois pontos de distância conhecida)
   ou manual. Para fabricar use medida real.
3. Marque (opcional) zigomas e asas nasais para sugestões biométricas do tamanho do central.
4. O **Índice estético** lista cada critério com meta, valor e dica.

## 4. Desenho
* **Tipo**: Facetas, Coroas, PPR (parcial removível), Total, Livre. Define a situação inicial dos dentes.
* **Desenho automático**: alinha linha média, plano incisal à linha bipupilar, tamanho pela biometria e arco do sorriso ao lábio.
* **Estilos**: 8 combinações prontas. **Tamanho**: PP a GG, largura do central e relação L/A; **Proporção**: Natural, Áurea,
  RED, Preston, Chu. **Forma**: natural, ovoide, quadrado, triangular, retangular, arredondado. **Catálogo de moldes** lista 30 combinações.
* **SPA**: sexo, idade e personalidade modulam ângulos incisais, desgaste e agudez do canino.
* **Cor**: 20 cores (BL1–C4), translucidez, mamelões, textura e brilho.
* **Posição**: plano incisal (°), linha média (mm), altura incisal, giro/inclinação e distância da câmera (perspectiva da foto).
* **Edição por dente**: clique no dente (foto ou barra inferior); arraste para mover; alças: laterais = largura, topo/base = comprimento,
  círculo amarelo = angulação. O losango ciano move todo o desenho. Setas movem 0,1 mm.
* **Propostas**: duplique, gere 3 propostas automáticas e compare em *Apresentar*.
* **Linhas DSD**: linha média, bipupilar, plano incisal, arco do sorriso (branco) × lábio inferior (rosa), proporções, grade 5 mm, régua, zênites.
* **Integração com a foto**: exposição, sombra bucal, suavização e “escurecer dentes originais ao redor”.

## 5. CAD 3D
Gire (botão esquerdo), mova (direito) e dê zoom (roda). Botões de vistas frontal/laterais/oclusais/3-4.
* **Oclusão**: inclua os dentes inferiores, sobremordida e sobressaliência.
* **Próteses removíveis**: dentes marcados *Prótese* geram selas (PPR) ou bases completas (todos os dentes do arco). Configure espessura, flange, festonamento, placa/barra palatina, ferradura/barra lingual e grampos.
* **Modelos digitais**: importe escaneamentos STL/OBJ/PLY e alinhe manualmente.
* **Medição**: ative e clique em dois pontos.

## 6. Plano → Apresentar → Exportar
* **Plano**: situação, cor e materiais por dente.
* **Apresentar**: antes/depois (barra deslizante), propostas, **PDF**.
* **Exportar**: escolha produto (enceramento, faceta casca fina, coroa oca, sólido), qualidade, orientação, base, monobloco e folga; **Gerar modelos 3D**;
  baixe **ZIP de STL por peça**, STL único, **3MF (cores)**, OBJ, PLY e relatório de fabricação. A tabela mostra dimensões, volume e verificação de malha fechada.

## 7. Impressão 3D e fresagem
* **Impressão**: camada 25–50 µm; dentes com a face incisal/oclusal para cima (*bandeja de impressão*); resinas biocompatíveis conforme a indicação; pós-cura do fabricante. Bases e dentes de prótese são exportados separados, com encaixes (folga configurável) para colagem — ou use *monobloco*.
* **Fresagem**: use STL/3MF no CAM do disco (zircônia, PMMA, dissilicato, resina multicamadas); verifique espessura mínima, margem e eixo de inserção.
