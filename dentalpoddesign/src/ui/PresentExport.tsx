import { useEffect, useMemo, useState } from 'react'
import { activeVariant } from '../core/project'
import { addVariant, mutate, mutateVariant, setActiveVariant, setState, toast, useApp, removeVariant } from '../store/store'
import { Check, Field, Section, Seg, Slider, downloadBlob, fmt } from './common'
import { AnalysisReport } from './AnalysisPanel'
import { beforeAfterCanvas, canvasBlob, renderVariant } from '../render/export2d'
import { buildReportPdf } from './report'
import { buildProduction, type Production } from '../geometry/production'
import { reportParts, safeName, to3mf, toObj, toPly, toStlAscii, toStlBinary, zipStore } from '../geometry/exporters'
import { meshStats } from '../geometry/mesh'
import { DESIGNED_STATUS, type ToothStatus } from '../core/types'
import { archFdiList, makeFdi, toothLabel } from '../core/toothSpecs'
import { computeLayout } from '../core/designEngine'
import { statusLabel, STATUS_OPTIONS, ToothEditor } from './DesignPanel'
import { getPhotoBitmap } from '../store/store'
import { setStatusMany, generateProposals } from './actions'
import { SHADES } from '../core/shades'

// ---------------------------------------------------------------------------------------------------------------
export function PresentPanel() {
  const project = useApp((s) => s.project)
  const compare = useApp((s) => s.compare)
  const rev = useApp((s) => s.rev)
  const photoRev = useApp((s) => s.photoRev)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const b = getPhotoBitmap(project.basePhotoId)
    if (!b) return
    const t = setTimeout(() => {
      const out: Record<string, string> = {}
      for (const v of project.variants) {
        const c = renderVariant(project, v, Math.min(0.3, 520 / Math.max(b.width, b.height)))
        if (c) out[v.id] = c.toDataURL('image/jpeg', 0.8)
      }
      setThumbs(out)
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev, photoRev])
  const v = activeVariant(project)
  const name = safeName(project.name)
  return (
    <>
      <Section title="Apresentação ao paciente">
        <Seg value={compare} options={[{ v: 'after' as const, label: 'Depois' }, { v: 'before' as const, label: 'Antes' }, { v: 'split' as const, label: 'Antes/Depois' }]} onChange={(c) => setState({ compare: c })} />
        <p className="hint">No modo Antes/Depois arraste a barra branca sobre a foto. Alterne as propostas abaixo para o paciente escolher.</p>
      </Section>
      <Section title="Propostas" tag={`${project.variants.length}`}>
        <div style={{ display: 'grid', gap: 8 }}>
          {project.variants.map((x) => (
            <div key={x.id} className="case" style={{ padding: 6, borderColor: x.id === project.activeVariant ? 'var(--accent)' : undefined, cursor: 'pointer' }} onClick={() => setActiveVariant(x.id)}>
              {thumbs[x.id] ? <img src={thumbs[x.id]} style={{ width: 96, borderRadius: 6 }} alt="" /> : <div style={{ width: 96, height: 64, background: '#000' }} />}
              <div className="grow">
                <b>{x.name}</b>
                <small>{x.params.shape} · {fmt(x.params.centralWidth)} mm · {x.params.shade}</small>
              </div>
            </div>
          ))}
        </div>
        <div className="btns" style={{ marginTop: 8 }}>
          <button className="btn sm" onClick={() => addVariant(true)}>Duplicar</button>
          <button className="btn sm" onClick={generateProposals}>Gerar 3 propostas</button>
          <button className="btn sm danger" disabled={project.variants.length <= 1} onClick={() => removeVariant(project.activeVariant)}>Excluir</button>
        </div>
      </Section>
      <Section title="Exportar apresentação">
        <div className="btns">
          <button className="btn primary" disabled={busy} onClick={async () => {
            const c = beforeAfterCanvas(project, v, 0.6)
            if (c) downloadBlob(await canvasBlob(c, 'image/jpeg'), `${name}_antes-depois_${safeName(v.name)}.jpg`)
          }}>Imagem antes/depois</button>
          <button className="btn" onClick={async () => {
            const c = renderVariant(project, v, 1)
            if (c) downloadBlob(await canvasBlob(c), `${name}_${safeName(v.name)}.png`)
          }}>Simulação (PNG em alta)</button>
          <button className="btn" disabled={busy} onClick={async () => {
            setBusy(true)
            try {
              downloadBlob(await buildReportPdf(project), `${name}_relatorio.pdf`)
            } catch (e) {
              console.error(e)
              toast('Falha ao gerar o PDF.', 'err')
            } finally {
              setBusy(false)
            }
          }}>{busy ? 'Gerando…' : 'Relatório PDF'}</button>
        </div>
      </Section>
      <Section title="Análise da proposta atual">
        <AnalysisReport compact />
      </Section>
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------
const MATERIALS: Record<ToothStatus, string> = {
  natural: 'Mantido. Sem fabricação.',
  veneer: 'Faceta: cerâmica feldspática ou dissilicato de lítio (0,5–0,7 mm); alternativa: resina composta nanohíbrida impressa (provisório/mock-up).',
  crown: 'Coroa: zircônia monolítica ou dissilicato de lítio (espessura mínima 1,0–1,5 mm oclusal); provisórios em PMMA/resina impressa.',
  pontic: 'Pôntico: parte da ponte fixa; zircônia/metalocerâmica; conectores ≥ 4 mm² (anterior) / 9 mm² (posterior).',
  implant: 'Coroa sobre implante: zircônia ou dissilicato cimentado/parafusado; confirmar emergência no software de implantes.',
  denture: 'Dente de prótese: resina acrílica/PMMA multicamadas; base em PMMA rosa (impressa ou fresada).',
  missing: 'Ausente sem reposição.',
  extraction: 'Extração prevista antes da reabilitação.',
}

export function PlanPage() {
  const project = useApp((s) => s.project)
  const rev = useApp((s) => s.rev)
  const selected = useApp((s) => s.selected)
  const v = activeVariant(project)
  const layout = useMemo(() => computeLayout(v.params, v.teeth), [v.params, v.teeth, rev])
  const counts: Partial<Record<ToothStatus, number>> = {}
  for (const t of layout.all) counts[t.cfg.status] = (counts[t.cfg.status] ?? 0) + 1
  const anterior = (arch: 'upper' | 'lower') => [-1, 1].flatMap((s) => [1, 2, 3].map((n) => makeFdi(arch, s as -1 | 1, n)))
  const up = (n: number) => archFdiList('upper', n)
  const lo = (n: number) => archFdiList('lower', n)
  const all = layout.all
  return (
    <div className="pagewrap">
      <h1>Planejamento de tratamento</h1>
      <p className="hint">Defina a situação de cada dente da proposta “{v.name}”. Somente dentes com faceta, coroa, pôntico, implante ou prótese são desenhados e exportados.</p>
      <div className="card" style={{ margin: '14px 0' }}>
        <div className="btns">
          <span className="hint" style={{ alignSelf: 'center' }}>Marcação rápida:</span>
          <button className="btn sm" onClick={() => setStatusMany(anterior('upper'), 'veneer')}>6 anteriores sup. → faceta</button>
          <button className="btn sm" onClick={() => setStatusMany(up(5), 'veneer')}>Sup. 15–25 → faceta</button>
          <button className="btn sm" onClick={() => setStatusMany(anterior('upper'), 'crown')}>6 anteriores → coroa</button>
          <button className="btn sm" onClick={() => setStatusMany(up(v.params.upperTo), 'denture')}>Superior → prótese</button>
          {v.params.lowerEnabled && <button className="btn sm" onClick={() => setStatusMany(lo(v.params.lowerTo), 'denture')}>Inferior → prótese</button>}
          <button className="btn sm" onClick={() => setStatusMany(all.map((t) => t.fdi), 'natural')}>Todos naturais</button>
        </div>
      </div>
      <div className="grid2">
        <div className="card" style={{ maxHeight: 520, overflow: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr><th>Dente</th><th>Situação</th><th>L × A × E (mm)</th><th>Cor</th></tr>
            </thead>
            <tbody>
              {all.map((t) => (
                <tr key={t.fdi} className={selected === t.fdi ? 'sel' : ''} onClick={() => setState({ selected: t.fdi })}>
                  <td>{toothLabel(t.fdi)}</td>
                  <td>
                    <select value={t.cfg.status} onChange={(e) => mutateVariant((vv) => { vv.teeth[t.fdi].status = e.target.value as ToothStatus; vv.params.mode = 'custom' })}>
                      {STATUS_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                    </select>
                  </td>
                  <td>{fmt(t.spec.W)} × {fmt(t.spec.H)} × {fmt(t.spec.BL)}</td>
                  <td>
                    <select value={t.cfg.shade ?? ''} onChange={(e) => mutateVariant((vv) => { vv.teeth[t.fdi].shade = e.target.value || undefined })}>
                      <option value="">{t.arch === 'upper' ? v.params.shade : v.params.lowerShade}</option>
                      {SHADES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Resumo</h3>
            <div className="chips">
              {(Object.keys(counts) as ToothStatus[]).map((k) => <span key={k} className={'chip ' + (DESIGNED_STATUS.includes(k) ? 'on' : '')}>{statusLabel(k)}: {counts[k]}</span>)}
            </div>
            <h4>Materiais e fabricação sugeridos</h4>
            {(Object.keys(counts) as ToothStatus[]).filter((k) => DESIGNED_STATUS.includes(k)).map((k) => (
              <p key={k} className="hint"><b style={{ color: 'var(--text)' }}>{statusLabel(k)}.</b> {MATERIALS[k]}</p>
            ))}
            {!all.some((t) => t.designed) && <div className="warnbox">Nenhum dente marcado para reabilitação.</div>}
            {all.some((t) => t.cfg.status === 'denture') && !all.every((t) => t.arch !== 'upper' || t.cfg.status === 'denture' || t.n > v.params.upperTo) && (
              <div className="okbox">Prótese parcial removível: selas e conectores configuráveis em CAD 3D → Próteses removíveis.</div>
            )}
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <ToothEditor />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------
export function ExportPage() {
  const project = useApp((s) => s.project)
  const rev = useApp((s) => s.rev)
  const [prod, setProd] = useState<Production | null>(null)
  const [busy, setBusy] = useState(false)
  const [stale, setStale] = useState(false)
  const v = activeVariant(project)
  const ex = project.export
  const setEx = (patch: Partial<typeof ex>) => mutate((p) => { Object.assign(p.export, patch) }, 'ex-' + Object.keys(patch).join(','))
  const name = safeName(project.name) + '_' + safeName(v.name)
  useEffect(() => {
    if (prod) setStale(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev])

  const generate = async () => {
    setBusy(true)
    setStale(false)
    try {
      await new Promise((r) => setTimeout(r, 30))
      const r = await buildProduction(project, v, ex)
      setProd(r)
      if (r.warnings.length) toast(r.warnings[0], 'err')
      else toast(`${r.parts.length} peça(s) gerada(s) e verificada(s).`, 'ok')
    } catch (e) {
      console.error(e)
      toast('Falha ao gerar os modelos 3D.', 'err')
    } finally {
      setBusy(false)
    }
  }
  const report = useMemo(() => (prod ? reportParts(prod.parts) : []), [prod])
  const totalVol = report.reduce((a, r) => a + r.volumeMm3, 0)

  const dl = {
    zip: () => {
      if (!prod) return
      const files = prod.parts.map((p) => ({ name: `${name}/${safeName(p.name)}.stl`, data: new Uint8Array(toStlBinary([p], p.name)) }))
      downloadBlob(new Blob([zipStore(files) as BlobPart], { type: 'application/zip' }), `${name}_stl.zip`)
    },
    stl: () => prod && downloadBlob(ex.binary ? new Blob([toStlBinary(prod.parts)], { type: 'model/stl' }) : new Blob([toStlAscii(prod.parts)], { type: 'model/stl' }), `${name}.stl`),
    obj: () => {
      if (!prod) return
      const o = toObj(prod.parts, `${name}.mtl`)
      const enc = new TextEncoder()
      downloadBlob(new Blob([zipStore([{ name: `${name}.obj`, data: enc.encode(o.obj) }, { name: `${name}.mtl`, data: enc.encode(o.mtl) }]) as BlobPart], { type: 'application/zip' }), `${name}_obj.zip`)
    },
    ply: () => prod && downloadBlob(new Blob([toPly(prod.parts)], { type: 'application/octet-stream' }), `${name}.ply`),
    mf: () => prod && downloadBlob(new Blob([to3mf(prod.parts) as BlobPart], { type: 'model/3mf' }), `${name}.3mf`),
    json: () => {
      if (!prod) return
      const data = {
        sistema: 'DentalPod Design',
        caso: project.name,
        paciente: project.patient.name,
        proposta: v.name,
        data: new Date().toISOString(),
        unidades: 'mm',
        configuracao: ex,
        calibracao: project.calib.method,
        pecas: report,
        volumeTotalMm3: +totalVol.toFixed(1),
        avisos: prod.warnings,
      }
      downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${name}_fabricacao.json`)
    },
    csv: () => {
      const lines = ['peca;triangulos;x_mm;y_mm;z_mm;volume_mm3;area_mm2;estanque', ...report.map((r) => `${r.name};${r.triangles};${r.size.join(';')};${r.volumeMm3};${r.areaMm2};${r.watertight ? 'sim' : 'nao'}`)]
      downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv' }), `${name}_pecas.csv`)
    },
  }

  return (
    <div className="pagewrap">
      <h1>Exportação para impressão 3D e fresagem</h1>
      <p className="hint">Gera malhas fechadas (watertight) em milímetros a partir da proposta “{v.name}”. Formatos: STL, OBJ, PLY e 3MF.</p>
      {project.calib.method === 'ipd' && <div className="warnbox">A escala da foto foi estimada pela distância interpupilar. Para fabricar, calibre com uma medida real (Análise → Calibração) e confira as dimensões das peças abaixo.</div>}
      <div className="grid2" style={{ marginTop: 12 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Configuração</h3>
          <Field label="Produto">
            <select value={ex.product} onChange={(e) => setEx({ product: e.target.value as typeof ex.product })}>
              <option value="wax">Enceramento diagnóstico (sólido)</option>
              <option value="veneerShell">Facetas — casca fina (espessura configurável)</option>
              <option value="hollowCrown">Coroas ocas (com cavidade)</option>
              <option value="solid">Dentes sólidos (provisório / mock-up)</option>
            </select>
          </Field>
          {(ex.product === 'veneerShell' || ex.product === 'hollowCrown') && <Slider label="Espessura" value={ex.shellThickness} min={0.3} max={1.5} step={0.05} digits={2} unit=" mm" onChange={(x) => setEx({ shellThickness: x })} />}
          <Field label="Qualidade da malha">
            <Seg value={ex.quality} options={[{ v: 'draft' as const, label: 'Rascunho' }, { v: 'standard' as const, label: 'Padrão' }, { v: 'high' as const, label: 'Alta' }]} onChange={(x) => setEx({ quality: x })} />
          </Field>
          <Field label="Orientação">
            <Seg value={ex.orientation} options={[{ v: 'print' as const, label: 'Bandeja de impressão' }, { v: 'clinical' as const, label: 'Clínica (arco)' }]} onChange={(x) => setEx({ orientation: x })} />
          </Field>
          <Check label="Incluir bases / selas / conectores / grampos" value={ex.includeBase} onChange={(x) => setEx({ includeBase: x })} />
          <Check label="Dentes separados (uma peça por dente)" value={ex.splitTeeth} onChange={(x) => setEx({ splitTeeth: x })} />
          <Check label="Monobloco (união booleana de tudo)" value={ex.merge} onChange={(x) => setEx({ merge: x })} />
          <Slider label="Folga de encaixe" value={ex.gap} min={0} max={0.4} step={0.01} digits={2} unit=" mm" onChange={(x) => setEx({ gap: x })} />
          <Check label="STL binário (recomendado)" value={ex.binary} onChange={(x) => setEx({ binary: x })} />
          <div className="btns" style={{ marginTop: 10 }}>
            <button className="btn primary" disabled={busy} onClick={() => void generate()}>{busy ? 'Gerando…' : stale ? 'Regerar modelos 3D' : 'Gerar modelos 3D'}</button>
          </div>
          {stale && prod && <div className="warnbox">O desenho mudou desde a última geração. Gere novamente antes de baixar.</div>}
          <p className="hint" style={{ marginTop: 8 }}>
            <b>Impressão 3D:</b> camada 25–50 µm; dentes com a face oclusal/incisal para cima; resinas biocompatíveis classe II/IIa conforme a indicação (provisório, modelo, base de prótese). Pós-cura conforme o fabricante.
            <br />
            <b>Fresagem:</b> use STL/3MF no CAM do fabricante do disco (zircônia, PMMA, dissilicato, resina multicamadas); verifique espessuras mínimas e eixo de inserção.
          </p>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Resultado</h3>
          {!prod && <p className="hint">Clique em “Gerar modelos 3D” para criar as peças.</p>}
          {prod && (
            <>
              {prod.warnings.map((w, i) => <div className="warnbox" key={i}>{w}</div>)}
              {prod.warnings.length === 0 && <div className="okbox">Todas as peças são malhas fechadas válidas (sem arestas abertas ou não-manifold).</div>}
              <div className="btns" style={{ margin: '8px 0' }}>
                <button className="btn primary" onClick={dl.zip}>ZIP (1 STL por peça)</button>
                <button className="btn" onClick={dl.stl}>STL único</button>
                <button className="btn" onClick={dl.mf}>3MF (cores)</button>
                <button className="btn" onClick={dl.obj}>OBJ + MTL</button>
                <button className="btn" onClick={dl.ply}>PLY</button>
                <button className="btn" onClick={dl.json}>Relatório JSON</button>
                <button className="btn" onClick={dl.csv}>CSV</button>
              </div>
              <div style={{ maxHeight: 360, overflow: 'auto' }}>
                <table className="tbl">
                  <thead><tr><th>Peça</th><th>Dimensões (mm)</th><th>Vol. (mm³)</th><th>Tri.</th><th /></tr></thead>
                  <tbody>
                    {report.map((r) => (
                      <tr key={r.name}>
                        <td>{r.name}</td>
                        <td>{r.size.map((x) => fmt(x)).join(' × ')}</td>
                        <td>{fmt(r.volumeMm3, 0)}</td>
                        <td>{r.triangles.toLocaleString('pt-BR')}</td>
                        <td><span className={'lvl ' + (r.watertight ? 'ok' : 'bad')} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="hint">Volume total ≈ {fmt(totalVol / 1000, 2)} mL de material (sem suportes). Peças: {report.length}.</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export { meshStats }
