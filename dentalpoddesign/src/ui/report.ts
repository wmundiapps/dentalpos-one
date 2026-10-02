import { jsPDF } from 'jspdf'
import type { Project } from '../core/types'
import { activeVariant } from '../core/project'
import { computeLayout } from '../core/designEngine'
import { analyze } from '../core/analysis'
import { silhouetteOf } from '../render/silhouettes'
import { getPhotoBitmap } from '../store/store'
import { beforeAfterCanvas, renderVariant } from '../render/export2d'
import { statusLabel } from './DesignPanel'
import { toothLabel } from '../core/toothSpecs'
import { SHAPES, PROPORTIONS } from '../core/toothSpecs'

const clean = (s: string) => s.replace(/≤/g, '<=').replace(/→/g, '->').replace(/≈/g, '~').replace(/[–—]/g, '-').replace(/·/g, '|').replace(/°/g, ' graus')

/** Relatório PDF: antes/depois, análise, dimensões por dente, propostas e avisos. */
export async function buildReportPdf(project: Project): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const v = activeVariant(project)
  const b = getPhotoBitmap(project.basePhotoId)
  const layout = computeLayout(v.params, v.teeth)
  const date = new Date().toLocaleDateString('pt-BR')
  let y = 16
  doc.setFillColor(11, 17, 24)
  doc.rect(0, 0, W, 30, 'F')
  doc.setTextColor(61, 217, 197)
  doc.setFontSize(18)
  doc.text('DentalPod Design', 14, 14)
  doc.setTextColor(200, 210, 225)
  doc.setFontSize(10)
  doc.text('Relatorio de planejamento digital do sorriso', 14, 21)
  doc.text(date, W - 14, 14, { align: 'right' })
  doc.setTextColor(30, 30, 30)
  y = 40
  doc.setFontSize(13)
  doc.text(clean(project.name), 14, y)
  doc.setFontSize(10)
  y += 6
  doc.text(clean(`Paciente: ${project.patient.name || '-'}${project.patient.age ? `  |  ${project.patient.age} anos` : ''}`), 14, y)
  y += 6
  doc.text(clean(`Proposta: ${v.name}  |  Modo: ${v.params.mode}  |  Forma: ${SHAPES.find((s) => s.id === v.params.shape)?.label}  |  Cor: ${v.params.shade}`), 14, y)
  y += 5
  doc.text(clean(`Central: ${v.params.centralWidth.toFixed(1)} x ${(v.params.centralWidth / v.params.wl).toFixed(1)} mm  |  Proporcao: ${PROPORTIONS.find((p) => p.id === v.params.proportion)?.label ?? ''}`), 14, y)
  y += 6
  const ba = beforeAfterCanvas(project, v, Math.min(1, 1400 / Math.max(b?.width ?? 1400, 1)))
  if (ba) {
    const w = W - 28
    const h = (ba.height / ba.width) * w
    doc.addImage(ba.toDataURL('image/jpeg', 0.88), 'JPEG', 14, y, w, h)
    y += h + 6
  }
  // análise
  if (b) {
    const sil = (fdi: number) => {
      const t = layout.byFdi.get(fdi)
      return t ? silhouetteOf(t.spec) : null
    }
    const a = analyze(project, v, layout, sil, b.width, b.height)
    if (y > 200) {
      doc.addPage()
      y = 16
    }
    doc.setFontSize(12)
    doc.text(`Analise estetica${a.score !== null ? ` - indice ${a.score}/100` : ''}`, 14, y)
    y += 6
    doc.setFontSize(8.5)
    for (const it of a.items) {
      if (y > 280) {
        doc.addPage()
        y = 16
      }
      const col = it.level === 'ok' ? [20, 140, 90] : it.level === 'warn' ? [190, 130, 10] : it.level === 'bad' ? [200, 50, 60] : [90, 110, 140]
      doc.setTextColor(col[0], col[1], col[2])
      doc.text('*', 14, y)
      doc.setTextColor(30, 30, 30)
      doc.text(clean(it.label), 18, y)
      doc.text(clean(it.value), 120, y)
      doc.setTextColor(120, 120, 120)
      doc.text(clean(`meta: ${it.target}`), 18, y + 3.6)
      doc.setTextColor(30, 30, 30)
      y += 8
    }
  }
  // dentes
  doc.addPage()
  y = 16
  doc.setFontSize(12)
  doc.text('Dimensoes por dente (mm) - modelo CAD', 14, y)
  y += 6
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  const cols = [14, 54, 82, 102, 122, 142, 162]
  ;['Dente', 'Situacao', 'Largura', 'Altura', 'Espessura', 'Cor', 'Obs.'].forEach((t, i) => doc.text(t, cols[i], y))
  doc.setFont('helvetica', 'normal')
  y += 5
  for (const t of layout.all) {
    if (y > 282) {
      doc.addPage()
      y = 16
    }
    const row = [clean(toothLabel(t.fdi)), statusLabel(t.cfg.status), t.spec.W.toFixed(1), t.spec.H.toFixed(1), t.spec.BL.toFixed(1), t.cfg.shade ?? (t.arch === 'upper' ? v.params.shade : v.params.lowerShade), t.designed ? '' : 'nao desenhado']
    row.forEach((tx, i) => doc.text(tx, cols[i], y))
    y += 4.6
  }
  // propostas
  if (project.variants.length > 1) {
    doc.addPage()
    y = 16
    doc.setFontSize(12)
    doc.text('Propostas comparadas', 14, y)
    y += 6
    let i = 0
    for (const vr of project.variants) {
      const c = renderVariant(project, vr, Math.min(0.5, 900 / Math.max(b?.width ?? 900, 1)))
      if (!c) continue
      const w = 88
      const h = (c.height / c.width) * w
      const x = 14 + (i % 2) * 94
      if (i % 2 === 0 && i > 0) y += h + 12
      if (y + h > 280) {
        doc.addPage()
        y = 16
      }
      doc.addImage(c.toDataURL('image/jpeg', 0.85), 'JPEG', x, y, w, h)
      doc.setFontSize(8.5)
      doc.text(clean(vr.name), x, y + h + 4)
      i++
    }
  }
  doc.addPage()
  doc.setFontSize(12)
  doc.text('Observacoes e responsabilidade tecnica', 14, 18)
  doc.setFontSize(9)
  const notes = [
    'Este documento e um planejamento digital de apoio. A escala (mm) da foto e estimada pela calibracao informada; confirme medidas no modelo/escaneamento antes de fabricar.',
    'Os modelos 3D exportados sao enceramentos/pecas parametricas de diagnostico. Para pecas definitivas (coroas, facetas, proteses) valide margens, espessuras minimas do material, oclusao e adaptacao ao preparo/escaneamento no software CAD/CAM de producao.',
    'Cores A-D/BL exibidas na tela sao aproximacoes visuais; a escolha final deve ser feita com escala fisica sob iluminacao padronizada.',
    'Referencias: Coachman & Calamita (Digital Smile Design); Levin (proporcao aurea); Ward (proporcao RED); Preston; Chu (porcentagem aurea); Frush & Fisher (SPA); Gerber / Lombardi (biometria facial).',
  ]
  let ny = 26
  for (const n of notes) {
    const lines = doc.splitTextToSize(n, W - 28)
    doc.text(lines, 14, ny)
    ny += lines.length * 4.6 + 3
  }
  if (project.notes) {
    doc.setFontSize(10)
    doc.text('Notas do caso:', 14, ny + 4)
    doc.setFontSize(9)
    doc.text(doc.splitTextToSize(clean(project.notes), W - 28), 14, ny + 10)
  }
  return doc.output('blob')
}
