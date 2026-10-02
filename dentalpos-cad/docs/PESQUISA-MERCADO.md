# Pesquisa de Mercado: Sistemas CAD Odontologicos

Objetivo: embasar o escopo do DentalPos CAD. Legenda de confianca: **[W]** = confirmado em fonte web citada;
**[C]** = conhecimento geral da area / documentacao de fabricantes, nao reconfirmado nesta pesquisa (validar antes de fixar em codigo).
Parametros reais variam por material, lote e fabricante: sempre devem ser **configuraveis**, nunca fixos.

## 1. Comparativo de sistemas

| Sistema | Tipo / arquitetura | Indicacoes principais | Pontos fortes | Formatos / abertura |
|---|---|---|---|---|
| exocad DentalCAD (+ Smile Creator, Guide Creator/exoplan, Model Creator, Provisional, Full Denture) | CAD aberto, modular (licencas por modulo), Windows | Coroa, ponte, inlay/onlay, faceta, provisorio, barra, protocolo, protese total, guia, modelo | Muito aberto (STL/PLY/OBJ), bibliotecas de dentes, parametros por material, integra com muitos CAMs e scanners | `dentalProject` XML (+ `constructionInfo`), STL, PLY, OBJ |
| 3Shape Dental System | CAD semi-fechado, ecossistema (TRIOS, Unite) | Coroa, ponte, faceta, implantes, protese, ortodontia, Smile Design | Fluxo integrado scanner-CAD-CAM, automacao de desenho, "Unite" colaborativo | `.dentalproject`/DCM proprietario, exporta STL/PLY; SDK/Unite apps |
| Amann Girrbach Ceramill Mind / Matik / Zolid | CAD+CAM+materiais de um fabricante (Ceramill) | Coroa, ponte, estrutura, protese, zirconia Zolid | Cadeia fechada com parametros validados por material, Matik = fresadora c/ troca automatica | Importa STL; formato proprio de projeto |
| Dentsply Sirona CEREC / inLab (Primescan) | Chairside (CEREC) e laboratorio (inLab); fechado | Coroa, inlay/onlay, faceta, ponte, guias (SICAT/CEREC Guide) | Fluxo em consulta unica, biogenerica (biocopia/biogeneric), bloco + fresadora integrados | Formatos proprios (SDT), exporta STL/PLY (Open) |
| Align iTero (+ Exocad Insights / iTero Design) | Scanner intraoral + software de ortodontia/restauradora | Aligners, coroa/ponte via parceiros, simulacao de resultado | Escaneamento + simulacao ao paciente, integracao a laboratorios | STL/OBJ/PLY exportaveis; fluxo em nuvem |
| Straumann CARES / coDiagnostiX | CARES Visual (CAD) e coDiagnostiX (planejamento de implantes guiados) | Pilares/coroas implantossuportadas, guias cirurgicos | Biblioteca de implantes/pilares Straumann, DICOM+STL, guia nativo | DICOM, STL; projeto proprio |
| Dental Wings (DWOS) | CAD aberto-ish, historico em scanners | Coroa, ponte, implante, guias, ortodontia | Biblioteca implantar, integracao scanner | STL/PLY, projeto proprio |
| Medit (Medit Link / Scan for Clinician / ClinicCAD) | Scanner + hub de apps (Medit Link) | Coroa, ponte, inlay (apps), alinhadores, modelo, smile | Hub aberto de apps de terceiros, scanner acessivel | STL, PLY, OBJ |
| Bioparts (Brasil) | Fabricante nacional de implantes/componentes e solucoes digitais | Componentes de implante, fluxo digital (guias/CAD-CAM via parceiros) | Biblioteca de componentes locais, ecossistema nacional | [C] STL; bibliotecas de implantes proprias |
| Similares: Zirkonzahn Modellier, Blue Sky Plan, 3Diemme/Planmeca Romexis, DentalCAD 3rd-party (Dentalcad Brasil), SprintRay Studio, Meshmixer/Blender (smile) | Variados | Variados | Blue Sky Plan = guias gratuito/barato; Romexis = integrado a CBCT | STL/DICOM |

Fontes gerais: wiki oficial exocad (https://wiki.exocad.com), paginas de produto dos fabricantes. Linhas sem [W] sao de conhecimento geral.

## 2. Fluxos de trabalho tipicos

### 2.1 Coroa unitaria / copings (exocad, 3Shape, CEREC)
1. Cadastro do caso: dente (FDI), tipo de restauracao, material, implante ou dente natural, cor.
2. Importar scans: preparo, antagonista, registro de mordida (STL/PLY/OBJ). Alinhamento por oclusao.
3. Delinear **margem** (spline automatico + ajuste manual por pontos).
4. Definir **eixo de insercao** e detectar **undercuts** (blockout automatico).
5. Parametros: espaco de cimento, espessura minima, offset marginal, espessura de margem.
6. Posicionar **dente da biblioteca** (morfologia) ou **biocopia/espelhamento** do contralateral/pre-op.
7. Ajustar forma: escala, rotacao, contatos proximais e oclusais (mapa de distancia/contato).
8. Verificar espessura minima (mapa colorido) e **conector/margem**.
9. Exportar estrutura/coroa (STL) + `constructionInfo` para CAM.

### 2.2 Ponte
Como coroa, mais: definir **pônticos** (tipo: higienico, ovoide, sela), **conectores** (altura, largura, area de secao), pesquisa de espaco interproximal, estrutura anatomica reduzida (cutback) para estratificacao.

### 2.3 Faceta / inlay / onlay
Faceta: margem em esmalte, espessura minima tipicamente baixa (0,3-0,5 mm no material de e.max/LS2) [C]; design com biblioteca + smile design. Inlay/onlay: margem e eixo de insercao criticos, caixa proximal, contato oclusal, material em blocos (e.max CAD, resina nanoceramica, hibrida).

### 2.4 Enceramento (wax-up), mockup e Smile Design
- Importar fotos (face/sorriso) + scan: alinhar foto ao 3D (Smile Creator exocad; 3Shape Smile Design) [W: wiki exocad "Place Model Tooth"].
- Desenhar linha do sorriso, linha media, corredor bucal; templates de dentes (Smile library).
- Gerar **wax-up virtual**; exportar como **modelo para impressao** (mockup/guia de silicone) usando **Model Creator** (base, pinos, ID).
- Mockup e provisorio: usar material PMMA/resina (provisorio em bloco ou impresso).

### 2.5 Guia cirurgico (exoplan / Guide Creator, coDiagnostiX, Blue Sky Plan)
1. DICOM (CBCT) + scan intraoral/modelo + registro (fiduciais ou best-fit de dentes).
2. Segmentacao de osso, marcar nervo mandibular (canal), seio.
3. Planejamento do implante (marca/diametro/comprimento, biblioteca) usando proposta prostetica (wax-up) como guia.
4. Verificacao de distancias de seguranca (secao 3.4).
5. Desenho do guia: area de apoio (dente/mucosa/osso), espessura, janelas de irrigacao/inspecao, **sleeves** (posicao, offset, altura).
6. Exportar STL do guia para impressao 3D + relatorio de planejamento (kit/chave de broca).

### 2.6 Protese total / provisoria (Full Denture, Provisional)
Importar scans (maxila, mandibula, registro), definir plano oclusal/linha media, montar dentes de biblioteca (set por marca), ajustar flange e base; exportar base + dentes separados (impressao/fresagem) ou monobloco.

## 3. Ferramentas tipicas e parametros numericos

### 3.1 Ferramentas de modelagem
Margem (spline), eixo de insercao, blockout/undercut, espaco de cimento, offset marginal, espessura minima, conectores/pônticos, ajuste oclusal (articulador virtual/colisao dinamica), contatos proximais (mapa de distancia), biblioteca morfologica, espelhamento, mapa de espessura, cutback, selecao de sprues/pinos.

### 3.2 Defaults de CAD (exocad) [W]
Fonte: Kulzer cara Setting Parameter exocad (https://www.kulzer.de/DE/downloads/cara_11/downloads_8/setting_parameter/en_7/cara_Print_Setting_Parameter_exocad_EN_10_2020.pdf) e Ivoclar Digital Software Parameter Chart exocad.

| Parametro | Valor tipico | Fonte |
|---|---|---|
| Espessura minima (crowns & bridges) | 0,5 mm | [W] Kulzer cara/exocad |
| Espaco de cimento (gap width) | 0,08 mm (80 µm) | [W] Kulzer cara/exocad |
| Inicio do cement gap (distancia da margem) | 1 mm | [W] idem |
| Fim do cement gap | 0 mm | [W] idem |
| Espacamento adicional axial / radial | 0,02 mm / 0,02 mm | [W] idem |
| Margem crown horizontal | 0,2 mm | [W] idem |
| Margem angulada | 0,3 mm a 60° | [W] idem |
| Margem vertical | 0 mm | [W] idem |
| Faixa tipica de espaco de cimento | 50-100 µm (exocad usa 70-120 µm em alguns perfis) | [C] |
| Espaco extra para zirconia em coping (pos-sinterizacao) | 0,02-0,05 mm | [C] |

Pagina de referencia exocad: https://wiki.exocad.com/wiki/index.php/Set_Minimum_Thickness

### 3.3 Espessuras minimas por material (restauracao, mm)
| Material / local | Anterior | Posterior | Fonte |
|---|---|---|---|
| Zirconia monolitica (alta resistencia) - paredes axiais | 0,8-1,0 gengival; 1,0-1,2 incisal; 1,2 palatino | 1,2-1,5 (axial, ponta de cuspide, sulco central) | [W] Spear Education https://www.speareducation.com/spear-review/2016/06/recommendations-for-monolithic-translucent-zirconia-restorations |
| Zirconia monolitica - oclusal (estudos) | -- | 0,5 pode resistir cargas (5558 N em estudo in vitro) | [W] https://munin.uit.no/handle/10037/7699 |
| Zirconia estrutura (coping, p/ estratificar) | 0,4-0,5 | 0,5-0,6 | [C] fabricantes (Ivoclar ZirCAD, Zolid) |
| Dissilicato de litio (e.max) | 1,0 gengival; 1,2-1,5 incisal; 1,2 palatino | 1,0 gengival; 1,5 axial/cuspide/sulco | [W] Spear (mesma pagina) |
| e.max faceta | 0,3-0,6 | -- | [C] |
| PMMA (provisorio fresado, duracao ate ~12 meses) | 0,7-1,0 | 1,0-1,5 | [C] fabricantes |
| Resina impressa permanente (ex.: nanocerâmica) | 1,0 | 1,0-1,5 | [C] |
| Titanio (estrutura/barra) | 0,4-0,5 parede; barra >= 3x3 mm secao | idem | [C] |

### 3.4 Conectores de ponte (area minima de secao)
| Material | Anterior | Posterior | Fonte |
|---|---|---|---|
| Zirconia KATANA (3 unidades) | >= 12 mm² (2-3 unid.) | >= 16 mm² (2-3 unid.) | [W] Kuraray Noritake https://www.kuraraynoritake.eu/file/brochure-katanatm-zirconia-block-en-7 |
| Zirconia 3M Chairside | >= 12 mm² | >= 14 mm² | [W] https://multimedia.3m.com/mws/media/1665576O/3m-chairside-zirconia-quick-start-guide.pdf |
| Zirconia generica (valores comuns do mercado) | 7-9 mm² | 9-12 mm² (3 un.) | [C] varia; manter por material |
| e.max ponte anterior 3 un. (ate 2o pre-molar) | ~16 mm² [C] | nao indicado alem do 2o PM | [C] Ivoclar IFU |
| Altura minima do conector (zirconia) | 4 mm | 4-5 mm | [C] |
| Largura minima conector | 3 mm | 3-4 mm | [C] |

Regra: area = largura x altura, avaliar na regiao de menor secao; cantilever = reduzir indicacao e aumentar secao.

### 3.5 Sinterizacao e CAM
| Parametro | Valor | Fonte |
|---|---|---|
| Contracao de sinterizacao (zirconia) | 20-25% (fator linear de escala 1,20-1,25, lote especifico no bloco, formato 1,XXXX) | [W] Ivoclar/ZirCAD https://www.kuraraynoritake.eu/en/files/index/index/id/7489 (tambem Glidewell) |
| Fator de escala por lote | Lido do codigo/QR do disco, insercao manual | [W] idem |
| Diametro de fresas (zirconia, secagem) | 0,6 mm (detalhe fino), 1,0 mm, 2,0 mm (desbaste); 0,3-0,5 para margens finas | [C] Zolid / Ceramill / Roland |
| Diametro de fresas (vidro-ceramica, e.max CAD) | 0,5 / 1,0 / 2,5 mm diamantadas [C] | [C] |
| Sprues (pinos de fixacao) | 1,5-2,5 mm diam., posicao em area nao oclusal/margem | [C] |
| Offset marginal para compensar raio da fresa | >= raio da fresa (~0,3 mm p/ fresa 0,6 mm) | [C] |
| Espessura minima de margem p/ fresagem | 0,2-0,3 mm em faceta; 0,3 mm em coroa | [C] |
| Distancia entre pecas no disco | >= 2-3 mm, borda >= 5 mm | [C] |
| Angulo minimo de parede interna (taper/convergencia) | 4-6° por parede | [C] |

### 3.6 Guia cirurgico (distancias de seguranca)
| Parametro | Valor tipico | Fonte |
|---|---|---|
| Implante - nervo alveolar inferior (canal mandibular) | >= 2 mm | [W] https://bmcoralhealth.biomedcentral.com/articles/10.1186/s12903-022-02057-w e outros |
| Zona segura do forame mentoniano | 4 mm anterior; 8 mm inferior (planejamento) | [W] resultados de busca (journals.sbmu.ac.ir) |
| Imprecisao CBCT na distancia implante-canal | subestima 0,2-0,3 mm; nao confiavel <= 0,4 mm | [W] ddsgadget / literatura |
| Distancia implante - implante | >= 3 mm (borda a borda) | [C] literatura classica (Tarnow); amplamente aceita |
| Distancia implante - dente adjacente | >= 1,5 mm | [C] idem |
| Osso vestibular remanescente | >= 2 mm | [C] idem |
| Osso lingual | >= 1-1,5 mm | [C] |
| Distancia ao seio maxilar / assoalho | >= 1-2 mm | [C] |
| Offset sleeve (folga entre sleeve e guia) | 0,05-0,1 mm | [C] |
| Diametro interno sleeve | 5 mm a 6 mm tipico (depende da chave de broca/ kit) | [C] Straumann/Nobel/Bioparts kits |
| Altura sleeve | 5-6 mm ou 3-4 mm; altura ate dente para broca 4-6 mm | [C] |
| Espessura minima da parede do guia | 2-3 mm; sobre sleeve >= 1,5 mm | [C] |
| Folga entre broca e guia (tolerancia) | 0,05-0,2 mm | [C] |

Observacao: os valores de 3 mm / 1,5 mm / 2 mm de osso nao apareceram diretamente como defaults de software na busca web; sao padroes classicos da literatura implantodontica e devem ficar configuraveis.

## 4. Formatos de arquivo
| Formato | Uso | Observacoes |
|---|---|---|
| STL | Malha triangular, sem cor, unidade mm | Universal; ASCII ou binario. |
| PLY | Malha com cor/vertices (scanners intraorais) | Cores por vertice; usado em Medit, 3Shape. |
| OBJ | Malha + textura (.mtl) | Util para foto+3D (smile). |
| DICOM | CBCT | Necessario para guias; fatias 0,1-0,3 mm. |
| exocad `dentalProject` (.dentalProject) | XML do caso | Lista dentes (FDI), indicacao, material, scans, parametros. |
| exocad `constructionInfo` | XML com resultados e parametros do desenho | Margens, eixo, espaco de cimento, id do material; lido por CAM. |
| 3Shape `.dentalproject`/`.dcm` | Projeto proprietario | Acesso via Unite / exportacao STL. |

Fontes: wiki exocad (https://wiki.exocad.com); detalhes completos do XML (campos exatos) nao foram reconfirmados na web nesta pesquisa; usar exemplos reais de casos para engenharia reversa do esquema.

## 5. O que o DentalPos CAD deve ter

### 5.1 Fundacao (MVP)
- Importar/exportar STL, PLY, OBJ (binario + ASCII, unidade mm); leitura de DICOM em fase 2.
- Ler/escrever `dentalProject` e `constructionInfo` (compatibilidade com exocad) com versao do esquema.
- Visualizador 3D: orbita, corte, medicoes, mapa de cores (distancia, espessura), antagonista, articulador estatico.
- Perfis de material configuraveis (JSON): espessura minima, espaco de cimento, area de conector, fator de sinterizacao, diametro de fresa, sprue.

### 5.2 Restauradora
- Margem (spline + snap em curvatura), eixo de insercao com undercut/blockout, espaco de cimento (gap, inicio, fim, radial/axial).
- Biblioteca morfologica (anterior/posterior, FDI), posicionamento, escala, espelhamento, biocopia.
- Contatos proximais (mapa de distancia, alvo 0-50 µm de contato, 50-100 µm de folga visual) e oclusais [C], com mapa de espessura.
- Coroa, ponte (pônticos, conectores com area mm² validada), inlay/onlay, faceta, cutback, provisorio.
- Validacoes automaticas com alerta por material (secoes 3.3, 3.4).

### 5.3 Smile Design / Mockup / Enceramento
- Alinhar foto 2D ao scan 3D, linhas guia (media, sorriso, incisais), template de dentes, wax-up virtual, exportar modelo (Model Creator: base, pinos, ID) para impressao.

### 5.4 Guia cirurgico
- DICOM + STL, registro, segmentacao, nervo mandibular, biblioteca de implantes/sleeves (incluindo componentes **Bioparts**), verificacao de distancias (2 mm canal, 3 mm entre implantes, 1,5 mm dente, 2 mm osso vestibular), geracao do guia com janelas, relatorio PDF.

### 5.5 CAM/Exportacao
- Escala por fator de sinterizacao do lote, nesting em disco, sprues automaticos, compensacao de fresa; exportar STL/ `constructionInfo`.
- Impressao 3D: base e suportes opcionais, orientacao.

### 5.6 Qualidade, seguranca e conformidade
- Todos os valores numericos configuraveis e versionados; registrar parametros usados em cada projeto (auditoria).
- Testes com casos reais e comparacao com exocad; abertura via API/plugin para integracao com Bioparts e CAMs brasileiros.

## 6. Fontes consultadas (resumo)
- Kulzer cara/exocad parametros: https://www.kulzer.de/DE/downloads/cara_11/downloads_8/setting_parameter/en_7/cara_Print_Setting_Parameter_exocad_EN_10_2020.pdf
- Spear Education, zirconia monolitica: https://www.speareducation.com/spear-review/2016/06/recommendations-for-monolithic-translucent-zirconia-restorations
- Kuraray Noritake KATANA zirconia (conectores): https://www.kuraraynoritake.eu/file/brochure-katanatm-zirconia-block-en-7
- 3M Chairside Zirconia: https://multimedia.3m.com/mws/media/1665576O/3m-chairside-zirconia-quick-start-guide.pdf
- exocad wiki: https://wiki.exocad.com/wiki/index.php/Set_Minimum_Thickness
- BMC Oral Health (distancias implante): https://bmcoralhealth.biomedcentral.com/articles/10.1186/s12903-022-02057-w
- Fracture resistance zirconia 0,5 mm: https://munin.uit.no/handle/10037/7699
