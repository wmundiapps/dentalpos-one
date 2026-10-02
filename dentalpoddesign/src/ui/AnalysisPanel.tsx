import { useMemo } from 'react'
import { activeVariant } from '../core/project'
import { computeLayout } from '../core/designEngine'
import { analyze, biometricSuggestion, type AnalysisResult } from '../core/analysis'
import { silhouetteOf } from '../render/silhouettes'
import { MARK_DEFS, WIZARD_ORDER } from '../core/marks'
import { mutate, setState, toast, useApp, getPhotoBitmap } from '../store/store'
import { pxPerMm } from '../render/overlay'
import { Field, Section, Seg, fmt } from './common'
import { finalizeMarks } from './PhotoStage'
import { autoDesign, fitArcToLip } from './actions'

export function useAnalysis(): AnalysisResult | null {
  const project = useApp((s) => s.project)
  const rev = useApp((s) => s.rev)
  const photoRev = useApp((s) => s.photoRev)
  return useMemo(() => {
    const b = getPhotoBitmap(project.basePhotoId)
    if (!b) return null
    const v = activeVariant(project)
    const layout = computeLayout(v.params, v.teeth)
    const sil = (fdi: number) => {
      const t = layout.byFdi.get(fdi)
      return t ? silhouetteOf(t.spec) : null
    }
    return analyze(project, v, layout, sil, b.width, b.height)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev, photoRev])
}

const GROUPS: { id: string; label: string }[] = [
  { id: 'facial', label: 'Face' },
  { id: 'dentolabial', label: 'Dento-labial' },
  { id: 'dental', label: 'Dental' },
  { id: 'gengival', label: 'Gengival' },
  { id: 'oclusao', label: 'Oclusão' },
]

export function ScoreBadge({ score }: { score: number | null }) {
  const c = score === null ? '#6d89b0' : score >= 80 ? 'var(--ok)' : score >= 60 ? 'var(--warn)' : 'var(--bad)'
  return (
    <div className="score" style={{ background: `conic-gradient(${c} ${(score ?? 0) * 3.6}deg, #223148 0)` }}>
      <div style={{ background: 'var(--panel)', width: 58, height: 58, borderRadius: '50%', display: 'grid', placeItems: 'center' }}>{score ?? '–'}</div>
    </div>
  )
}

export function AnalysisReport({ compact = false }: { compact?: boolean }) {
  const a = useAnalysis()
  if (!a) return <p className="hint">Adicione uma foto base.</p>
  return (
    <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6 }}>
        <ScoreBadge score={a.score} />
        <div>
          <b>Índice estético</b>
          <div className="hint">Soma ponderada dos critérios abaixo (referência: literatura DSD/estética dental). Não substitui o julgamento clínico.</div>
        </div>
      </div>
      {!a.ready && <div className="warnbox">Faltam marcas para análise completa: {a.missing.join(', ')}.</div>}
      {GROUPS.map((g) => {
        const items = a.items.filter((i) => i.group === g.id)
        if (!items.length) return null
        return (
          <div key={g.id}>
            <h4 style={{ margin: '12px 0 2px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)' }}>{g.label}</h4>
            {items.map((i) => (
              <div className="an-item" key={i.id}>
                <div className="l">
                  <span><span className={'lvl ' + i.level} />{i.label}</span>
                  <span className="v">{i.value}</span>
                </div>
                {!compact && <div className="t">Meta: {i.target} — {i.tip}</div>}
              </div>
            ))}
          </div>
        )
      })}
    </>
  )
}

export function AnalysisPanel() {
  const project = useApp((s) => s.project)
  const tool = useApp((s) => s.tool)
  const wizardIndex = useApp((s) => s.wizardIndex)
  const guides = useApp((s) => s.guides)
  const m = project.marks
  const s = pxPerMm(project, m)
  const sug = biometricSuggestion(project)
  const setGuide = (k: keyof typeof guides, v: boolean) => setState((st) => ({ guides: { ...st.guides, [k]: v } }))
  const startWizard = () => setState({ wizardIndex: 0, tool: WIZARD_ORDER[0] })
  return (
    <>
      <Section title="Análise facial guiada">
        <p className="hint">Marque os pontos de referência na foto. Cada ponto pode ser arrastado depois. O desenho usa estas marcas para alinhar o plano incisal, a linha média e a máscara dos lábios.</p>
        <div className="btns">
          <button className="btn primary" onClick={startWizard}>{wizardIndex >= 0 ? 'Reiniciar guia' : 'Iniciar análise guiada'}</button>
          <button className="btn" onClick={() => { finalizeMarks(); toast('Contorno dos lábios e âncora recalculados.', 'ok') }}>Recalcular lábios</button>
          <button className="btn" onClick={() => { mutate((p) => { p.marks = {} }); setState({ tool: null, wizardIndex: -1 }) }}>Limpar marcas</button>
        </div>
        <div style={{ marginTop: 10 }}>
          {MARK_DEFS.filter((d) => d.group !== 'calib').map((d) => {
            const has = Boolean(m[d.key])
            return (
              <div className="row" key={d.key} style={{ margin: '3px 0' }}>
                <span className="lvl" style={{ background: has ? d.color : '#33445c' }} />
                <span style={{ flex: 1, color: has ? 'var(--text)' : 'var(--muted)' }}>{d.label}</span>
                <button className={'btn sm ' + (tool === d.key ? 'primary' : '')} onClick={() => setState({ tool: tool === d.key ? null : d.key, wizardIndex: -1 })}>{has ? 'Refazer' : 'Marcar'}</button>
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="Calibração (escala em mm)" tag={`${fmt(s, 2)} px/mm`}>
        <Seg
          value={project.calib.method}
          options={[{ v: 'ipd', label: 'Dist. interpupilar' }, { v: 'twoPoints', label: 'Medida real' }, { v: 'manual', label: 'Manual' }]}
          onChange={(v) => mutate((p) => { p.calib.method = v })}
        />
        {project.calib.method === 'ipd' && (
          <Field label="IPD (mm)"><input type="number" step={0.5} value={project.calib.ipdMm} onChange={(e) => mutate((p) => { p.calib.ipdMm = +e.target.value }, 'ipd')} /></Field>
        )}
        {project.calib.method === 'twoPoints' && (
          <>
            <Field label="Medida (mm)"><input type="number" step={0.1} value={project.calib.refMm} onChange={(e) => mutate((p) => { p.calib.refMm = +e.target.value }, 'ref')} /></Field>
            <div className="btns">
              <button className={'btn sm ' + (tool === 'calibA' ? 'primary' : '')} onClick={() => setState({ tool: 'calibA', wizardIndex: -1 })}>Ponto A</button>
              <button className={'btn sm ' + (tool === 'calibB' ? 'primary' : '')} onClick={() => setState({ tool: 'calibB', wizardIndex: -1 })}>Ponto B</button>
            </div>
            <p className="hint">Use uma régua/sonda na foto ou a largura real de um dente conhecido (medida no modelo).</p>
          </>
        )}
        {project.calib.method === 'manual' && (
          <Field label="px por mm"><input type="number" step={0.1} value={project.calib.pxPerMm} onChange={(e) => mutate((p) => { p.calib.pxPerMm = +e.target.value }, 'pxmm')} /></Field>
        )}
        <div className="warnbox">A calibração pela distância interpupilar é uma estimativa (±5%). Para fabricação use medida real (régua na foto ou dimensões do modelo).</div>
      </Section>

      <Section title="Sugestões biométricas">
        {sug.fromFace || sug.fromNose ? (
          <>
            {sug.fromFace && <div className="row"><label style={{ flex: 1 }}>Bizigomática ÷ 16</label><b>{fmt(sug.fromFace, 2)} mm</b></div>}
            {sug.fromNose && <div className="row"><label style={{ flex: 1 }}>Interalar ÷ 4</label><b>{fmt(sug.fromNose, 2)} mm</b></div>}
            <p className="hint">Largura sugerida para o incisivo central. Aplique em Desenho → Tamanho.</p>
          </>
        ) : (
          <p className="hint">Marque os zigomas (largura facial) e/ou as asas nasais para obter sugestões do tamanho do incisivo central.</p>
        )}
        <div className="btns">
          <button className="btn sm" onClick={() => setState({ tool: 'zygR', wizardIndex: -1 })}>Zigomas e asas…</button>
        </div>
      </Section>

      <Section title="Linhas de referência">
        <div className="chips">
          {([['pupil', 'Bipupilar'], ['midline', 'Linha média'], ['incisal', 'Plano incisal'], ['arc', 'Arco do sorriso'], ['golden', 'Proporções'], ['zenith', 'Zênites']] as const).map(([k, l]) => (
            <button key={k} className={'chip ' + (guides[k] ? 'on' : '')} onClick={() => setGuide(k, !guides[k])}>{l}</button>
          ))}
        </div>
      </Section>

      <Section title="Análise estética">
        <div className="btns" style={{ marginBottom: 8 }}>
          <button className="btn primary sm" onClick={autoDesign}>Desenho automático</button>
          <button className="btn sm" onClick={() => fitArcToLip()}>Ajustar arco ao lábio</button>
        </div>
        <AnalysisReport />
      </Section>
    </>
  )
}
