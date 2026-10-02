# Manual de teste — DentalPos CAD

Pré-requisito: `cd dentalpos-cad && npm install && npm run dev` → abra http://localhost:5199 (Chrome/Edge/Firefox com WebGL).
Para a demonstração use a foto de exemplo (botão na aba **Sorriso / foto**) — não há necessidade de foto de paciente.

## 1. Primeiro contato (2 min)
1. O caso demonstração abre com 28 dentes harmonizados (Qualidade 100 na barra inferior).
2. Gire/zoom com o mouse; botões **Frontal / Esquerda / Direita / Oclusal / 3/4**; chips **Cor por alerta**, **Transparência**, **Linhas-guia**, **Gengiva**.
3. Menu esquerdo: 9 módulos. Ctrl+Z / Ctrl+Y desfazem/refazem.

## 2. Biblioteca e Wizard IA
1. **Caso e biblioteca** → mude o *Formato do rosto* para “Triangular invertido”, sexo “Masculino”.
2. Veja a recomendação (dente triangular/afunilado) e as miniaturas da biblioteca; clique em outra forma.
3. **✨ Desenhar automaticamente**: redesenha dentes, arco e proporções (toast informa as correções).
4. `/gallery.html` mostra todas as formas × tipos dentários em 3D.

## 3. Edição, regras e correção automática
1. Clique em um dente (3D ou odontograma) → aba **Dentes**. Mova *Mesio-distal* do 12 em 1,5 mm (ou use as setas ← →; “arrastar no 3D” permite arrastar).
2. A barra inferior e a aba **IA e alertas** mostram: *sobreposição 11–12*, *espaço 12–13* etc. Clique no alerta para destacar os dentes.
3. **Corrigir** (por achado) ou **✨ Corrigir tudo automaticamente** → qualidade volta a 100.
4. Teste outras violações: Overjet 6 mm / Overbite −1 mm (Caso), rotação 20° no 12, Spee raio 60, relação molar +4 mm, proporção “Áurea”.

## 4. Oclusão — 6 chaves de Andrews
Aba **Oclusão**: cartões das 6 chaves (OK/atenção/corrigir), tabela de medidas, tip/torque por dente (clique para selecionar),
**Mapa de contatos oclusais** (vermelho = contato) com a vista “Oclusal sup./inf.” (oculta a arcada oposta automaticamente).

## 5. Simulador de sorriso
Aba **Sorriso / foto** → *Usar foto de exemplo* (ou carregue uma foto e marque os pontos indicados; no contorno da boca, clique vários pontos e dê duplo clique).
Ajuste *Exibição incisal*, *Inclinação do plano incisal*, *Zoom*, ative **Comparador antes/depois**. Mude cor (aba Caso) e forma e veja a projeção mudar.
A análise facial mostra o formato do rosto detectado e o dente recomendado; **Salvar imagem (PNG)** exporta.

## 5b. Escaneamento (STL)
Aba **Escaneamento (STL)**: importe um STL (arcada de trabalho/antagonista), use **Diagnosticar/Reparar**, **Marcar 3 pontos** (molar D, molar E, incisal) para orientar o escaneamento e ajustar o arco, **Marcar término** clicando no modelo, **Calcular melhor eixo** e, com um dente do projeto selecionado, **Espessura**, **Contato c/ antagonista** e **Ajuste ao preparo**.

## 6. Enceramento e mockup
Aba **Enceramento / mockup** → *Gerar modelo + gengiva* (arcada superior), *Iniciar escultura* e clique sobre a cera com ＋/－/≈ (raio ajustável),
*Gerar bandeja de mockup* (espessura, folga, respiros) e **Exportar STL**. Processamentos pesados rodam em Web Worker (aparece “Gerando…”).

## 7. Guia cirúrgico
1. Aba **Guia cirúrgico** → selecione o dente 46 no odontograma → **Planejar implante**; repita no 36.
2. Altere diâmetro/comprimento/inclinação e preencha “Dados do CBCT” (ex.: largura óssea 5,5 mm, distância ao canal 1 mm) → surgem alertas de segurança (osso, canal, 3 mm entre implantes…).
3. **Gerar guia cirúrgico** (arcada Inferior) → casca azul com colares e mangas; exporte *Guia (STL)* e *Mangas (STL)*.

## 8. Materiais e CAM
Aba **Materiais / CAM** → “Posteriores superiores: coroas de zircônia” (ou defina tipo/material por dente), **Planejar fresagem**
(disco automático, fator de sinterização, pinos, alcance da fresa) e **Exportar pacote de produção (ZIP)**.
Na aba **Dentes**, com um dente restaurado: ajuste a redução do preparo e **Verificar espessura 3D**.

## 9. Relatório e projeto
**Relatório** → imprimir/PDF; **Salvar**/**Abrir…** gravam o projeto `.dpcad.json`.

## 10. Testes automatizados
`npm test` — cobertura: geração de dentes (estanques), arco/contatos/overjet/overbite, regras, autocorreção, SDF/voxel, enceramento/mockup,
guia, CAM, ICP/Kabsch, E/S (STL/OBJ/PLY/ZIP), coroa/espessura, smile (calibração mm→px).
