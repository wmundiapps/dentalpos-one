import { setState, useApp } from '../store/store'

export function HelpDialog() {
  const open = useApp((s) => s.help)
  if (!open) return null
  return (
    <div className="busy" onClick={() => setState({ help: false })}>
      <div style={{ maxWidth: 760, maxHeight: '85vh', overflow: 'auto', textAlign: 'left', fontWeight: 400 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Como usar o DentalPod Design</h2>
        <ol style={{ lineHeight: 1.6, paddingLeft: 18 }}>
          <li><b>Casos</b> — crie um caso ou abra a demonstração.</li>
          <li><b>Fotos</b> — importe a foto frontal com sorriso (e, se quiser, face em repouso, afastador, perfil). Defina a foto base.</li>
          <li><b>Análise</b> — “Iniciar análise guiada”: pupilas, linha média facial, comissuras e lábios (8 cliques). Calibre a escala (mm). Veja o índice estético (linha média, plano incisal, corredor bucal, arco do sorriso, proporções, zênites).</li>
          <li><b>Desenho</b> — escolha o tipo (facetas, coroas, prótese parcial/total), estilo, tamanho (PP–GG), forma, proporção (áurea, RED, Preston, Chu), arco, cor e caracterização (SPA). Clique/arraste os dentes, ajuste pelas alças. Crie propostas A/B/C.</li>
          <li><b>CAD 3D</b> — visualize o enceramento em 3D, configure oclusão, bases, selas, conectores, grampos; importe escaneamentos STL/OBJ/PLY; meça em mm.</li>
          <li><b>Plano</b> — defina a situação de cada dente, cores e materiais.</li>
          <li><b>Apresentar</b> — antes/depois, comparação de propostas, PDF e imagens.</li>
          <li><b>Exportar</b> — gere malhas fechadas para impressão 3D e fresagem: STL, OBJ, PLY e 3MF, com relatório de fabricação.</li>
        </ol>
        <h3>Atalhos</h3>
        <p className="hint">
          <kbd>Ctrl</kbd>+<kbd>Z</kbd>/<kbd>Y</kbd> desfazer/refazer · <kbd>Ctrl</kbd>+<kbd>S</kbd> salvar · <kbd>Esc</kbd> cancelar marcação · setas = mover o dente selecionado (0,1 mm; <kbd>Shift</kbd> 0,5 mm) · <kbd>Del</kbd> volta o dente a “natural” · roda do mouse = zoom · arrastar o fundo (ou <kbd>Espaço</kbd>+arrastar) = mover a foto · duplo clique = foto inteira.
        </p>
        <h3>Importante</h3>
        <p className="hint">
          Os modelos exportados são enceramentos paramétricos de diagnóstico/mock-up e peças base. Para trabalhos definitivos valide margens, espessuras mínimas do material, oclusão e adaptação ao escaneamento/preparo no CAD/CAM de produção. A escala da foto é estimada; calibre com medida real antes de fabricar.
        </p>
        <button className="btn primary" onClick={() => setState({ help: false })}>Fechar</button>
      </div>
    </div>
  )
}
