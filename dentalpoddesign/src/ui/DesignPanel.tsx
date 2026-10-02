import { useMemo } from 'react'
import type { ArchFormId, DesignParams, ProportionId, RestorationMode, ShapeId, ToothStatus } from '../core/types'
import { activeVariant, teethForMode } from '../core/project'
import { PRESETS } from '../core/presets'
import { PROPORTIONS, SHAPES, SHAPE_ADJ, SIZE_SETS, archFdiList, defaultWL, moldCatalog, toothLabel } from '../core/toothSpecs'
import { SHADES } from '../core/shades'
import { computeLayout } from '../core/designEngine'
import { addVariant, getState, mutateVariant, removeVariant, select, setActiveVariant, setMode, setState, useApp } from '../store/store'
import { Check, Field, Section, Seg, Slider, fmt } from './common'
import { applyPreset, autoDesign, fitArcToLip, generateProposals, resetTooth } from './actions'
import { biometricSuggestion } from '../core/analysis'

const STATUS_LABEL: Record<ToothStatus, string> = {
  natural: 'Natural',
  veneer: 'Faceta',
  crown: 'Coroa',
  pontic: 'Pôntico',
  implant: 'Implante',
  denture: 'Prótese',
  missing: 'Ausente',
  extraction: 'Extração',
}
export const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as ToothStatus[]).map((v) => ({ v, label: STATUS_LABEL[v] }))
export const statusLabel = (s: ToothStatus) => STATUS_LABEL[s]

export function shapePath(shape: ShapeId): string {
  const a = SHAPE_ADJ[shape]
  const top = 14 * a.cerv + 2
  const half = 15
  const r = Math.min(9, 3 + a.corner * 2.2)
  const cx = 18
  return `M ${cx - top} 4 L ${cx + top} 4 C ${cx + top + 4} 12, ${cx + half} 20, ${cx + half} 28 L ${cx + half} ${36 - r} Q ${cx + half} 38, ${cx + half - r} 38 L ${cx - half + r} 38 Q ${cx - half} 38, ${cx - half} ${36 - r} L ${cx - half} 28 C ${cx - half} 20, ${cx - top - 4} 12, ${cx - top} 4 Z`
}

function useP() {
  const v = activeVariant(useApp((s) => s.project))
  const set = (patch: Partial<DesignParams>, key?: string) =>
    mutateVariant((vv) => {
      Object.assign(vv.params, patch)
    }, key ?? 'p-' + Object.keys(patch).join(','))
  return { v, p: v.params, set }
}

const MODES: { v: RestorationMode; label: string }[] = [
  { v: 'veneers', label: 'Facetas' },
  { v: 'crowns', label: 'Coroas' },
  { v: 'partial', label: 'PPR' },
  { v: 'complete', label: 'Total' },
  { v: 'custom', label: 'Livre' },
]

export function ToothBar() {
  const project = useApp((s) => s.project)
  const selected = useApp((s) => s.selected)
  const v = activeVariant(project)
  const up = archFdiList('upper', v.params.upperTo)
  const lo = v.params.lowerEnabled ? archFdiList('lower', v.params.lowerTo) : []
  const chip = (f: number, gap = false) => {
    const st = v.teeth[f]?.status ?? 'natural'
    const des = ['veneer', 'crown', 'pontic', 'implant', 'denture'].includes(st)
    return (
      <button key={f} className={`tbtn ${selected === f ? 'sel' : ''} ${des ? 'des' : ''} ${gap ? 'gap' : ''}`} onClick={() => select(f)} title={toothLabel(f)}>
        <div className="n">{f}</div>
        <div className="s">{STATUS_LABEL[st]}</div>
      </button>
    )
  }
  const mid = Math.floor(up.length / 2)
  return (
    <>
      {up.map((f, i) => chip(f, i === mid))}
      {lo.length > 0 && <div className="tsep" />}
      {lo.map((f, i) => chip(f, i === Math.floor(lo.length / 2)))}
    </>
  )
}

export function ToothEditor() {
  const project = useApp((s) => s.project)
  const selected = useApp((s) => s.selected)
  const symmetric = useApp((s) => s.symmetric)
  const v = activeVariant(project)
  const layout = useMemo(() => computeLayout(v.params, v.teeth), [v.params, v.teeth])
  if (!selected || !v.teeth[selected]) {
    return (
      <Section title="Dente selecionado">
        <p className="hint">Selecione um dente na foto ou na barra inferior para ajustar posição, tamanho e forma individualmente.</p>
      </Section>
    )
  }
  const c = v.teeth[selected]
  const pl = layout.byFdi.get(selected)
  const set = (patch: Partial<typeof c>) =>
    mutateVariant((vv) => {
      Object.assign(vv.teeth[selected], patch)
      if (getState().symmetric && (patch.dx !== undefined || patch.w !== undefined || patch.h !== undefined || patch.dy !== undefined || patch.bl !== undefined || patch.tip !== undefined || patch.torque !== undefined || patch.dz !== undefined)) {
        const q = Math.floor(selected / 10)
        const mq = q === 1 ? 2 : q === 2 ? 1 : q === 3 ? 4 : 3
        const m = mq * 10 + (selected % 10)
        if (vv.teeth[m] && vv.teeth[m].status === vv.teeth[selected].status) Object.assign(vv.teeth[m], patch)
      }
    }, 'tooth-' + selected + Object.keys(patch).join(','))
  return (
    <Section title={`Dente ${toothLabel(selected)}`} tag={pl ? `${fmt(pl.spec.W)} × ${fmt(pl.spec.H)} × ${fmt(pl.spec.BL)} mm` : ''}>
      <Field label="Situação">
        <select value={c.status} onChange={(e) => mutateVariant((vv) => { vv.teeth[selected].status = e.target.value as ToothStatus; vv.params.mode = 'custom' })}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.v} value={o.v}>{o.label}</option>
          ))}
        </select>
      </Field>
      <Check label="Espelhar ajustes no dente homólogo" value={symmetric} onChange={(x) => setState({ symmetric: x })} />
      <Slider label="Largura ×" value={c.w} min={0.6} max={1.6} step={0.01} digits={2} onChange={(x) => set({ w: x })} />
      <Slider label="Comprimento ×" value={c.h} min={0.6} max={1.6} step={0.01} digits={2} onChange={(x) => set({ h: x })} />
      <Slider label="Espessura ×" value={c.bl} min={0.6} max={1.5} step={0.01} digits={2} onChange={(x) => set({ bl: x })} />
      <Slider label="Mésio-distal" value={c.dx} min={-4} max={4} step={0.05} digits={2} unit=" mm" onChange={(x) => set({ dx: x })} />
      <Slider label="Altura (borda)" value={c.dy} min={-4} max={4} step={0.05} digits={2} unit=" mm" onChange={(x) => set({ dy: x })} />
      <Slider label="Vestibular" value={c.dz} min={-4} max={4} step={0.05} digits={2} unit=" mm" onChange={(x) => set({ dz: x })} />
      <Slider label="Angulação" value={c.tip} min={-20} max={20} step={0.5} unit="°" onChange={(x) => set({ tip: x })} />
      <Slider label="Torque" value={c.torque} min={-20} max={20} step={0.5} unit="°" onChange={(x) => set({ torque: x })} />
      <Slider label="Rotação" value={c.rot} min={-40} max={40} step={0.5} unit="°" onChange={(x) => set({ rot: x })} />
      <Field label="Forma">
        <select value={c.shape ?? ''} onChange={(e) => set({ shape: (e.target.value || undefined) as ShapeId | undefined })}>
          <option value="">Padrão do desenho</option>
          {SHAPES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Cor">
        <select value={c.shade ?? ''} onChange={(e) => set({ shade: e.target.value || undefined })}>
          <option value="">Padrão do desenho</option>
          {SHADES.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </Field>
      <div className="btns">
        <button className="btn sm" onClick={() => resetTooth(selected)}>Redefinir dente</button>
        <button className="btn sm" onClick={() => select(null)}>Desmarcar</button>
      </div>
    </Section>
  )
}

export function VariantBar() {
  const project = useApp((s) => s.project)
  return (
    <div className="varbar">
      {project.variants.map((v) => (
        <button key={v.id} className={'vartab ' + (v.id === project.activeVariant ? 'on' : '')} onClick={() => setActiveVariant(v.id)} title={v.name}>
          {v.name}
        </button>
      ))}
      <button className="btn sm" title="Duplicar a proposta atual" onClick={() => addVariant(true)}>＋</button>
    </div>
  )
}

export function DesignPanel() {
  const { v, p, set } = useP()
  const project = useApp((s) => s.project)
  const sug = biometricSuggestion(project)
  const molds = useMemo(() => moldCatalog(), [])
  const archOptions: { v: ArchFormId; label: string }[] = [
    { v: 'tapered', label: 'Cônico' },
    { v: 'ovoid', label: 'Ovoide' },
    { v: 'square', label: 'Quadrado' },
  ]
  const guides = useApp((s) => s.guides)
  const setGuide = (k: keyof typeof guides, val: boolean) => setState((s) => ({ guides: { ...s.guides, [k]: val } }))
  const nameRef = v.name
  return (
    <>
      <Section title="Propostas" tag={`${project.variants.length}`}>
        <div className="chips" style={{ marginBottom: 8 }}>
          {project.variants.map((x) => (
            <button key={x.id} className={'chip ' + (x.id === project.activeVariant ? 'on' : '')} onClick={() => setActiveVariant(x.id)}>
              {x.name}
            </button>
          ))}
        </div>
        <Field label="Nome">
          <input type="text" value={nameRef} onChange={(e) => mutateVariant((vv) => { vv.name = e.target.value }, 'vname')} />
        </Field>
        <div className="btns">
          <button className="btn sm" onClick={() => addVariant(true)}>Duplicar</button>
          <button className="btn sm" onClick={generateProposals}>Gerar 3 propostas</button>
          <button className="btn sm danger" disabled={project.variants.length <= 1} onClick={() => removeVariant(project.activeVariant)}>Excluir</button>
        </div>
      </Section>

      <Section title="Tipo de reabilitação">
        <Seg value={p.mode} options={MODES} onChange={(m) => setMode(m)} />
        <div className="row">
          <label>Dentes (por lado)</label>
          <input type="range" min={3} max={7} step={1} value={p.upperTo} onChange={(e) => mutateVariant((vv) => { vv.params.upperTo = +e.target.value; if (vv.params.mode !== 'custom' && vv.params.mode !== 'veneers') syncStatuses(vv); else if (vv.params.mode === 'veneers') syncStatuses(vv) }, 'upTo')} />
          <span className="val">{p.upperTo}</span>
        </div>
        <p className="hint">3 = até o canino · 5 = até o 2º pré-molar · 7 = até o 2º molar.</p>
        <div className="btns" style={{ marginTop: 8 }}>
          <button className="btn primary sm" onClick={autoDesign}>Desenho automático</button>
          <button className="btn sm" onClick={() => fitArcToLip()}>Ajustar arco ao lábio</button>
        </div>
      </Section>

      <Section title="Estilos prontos">
        <div className="presets">
          {PRESETS.map((x) => (
            <button key={x.id} className="preset" onClick={() => applyPreset(x.id)} title={x.desc}>
              <b>{x.name}</b>
              <span>{x.desc}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Tamanho dos dentes" tag={`central ${fmt(p.centralWidth)} × ${fmt(p.centralWidth / p.wl)} mm`}>
        <Seg value={p.sizeSet} options={SIZE_SETS.map((s) => ({ v: s.id, label: s.id, title: `${s.label} — ${s.hint}` }))} onChange={(id) => set({ sizeSet: id, centralWidth: SIZE_SETS.find((s) => s.id === id)!.centralWidth })} />
        <Slider label="Largura central" value={p.centralWidth} min={6.8} max={10.4} step={0.05} digits={2} unit=" mm" onChange={(x) => set({ centralWidth: x, sizeSet: 'custom' })} />
        <Slider label="Largura/altura" value={p.wl * 100} min={62} max={98} step={0.5} unit=" %" onChange={(x) => set({ wl: x / 100 })} />
        <Field label="Proporção">
          <select value={p.proportion} onChange={(e) => set({ proportion: e.target.value as ProportionId })}>
            {PROPORTIONS.map((x) => (
              <option key={x.id} value={x.id}>{x.label}</option>
            ))}
          </select>
        </Field>
        {p.proportion === 'red' && <Slider label="RED %" value={p.redPct * 100} min={60} max={85} step={1} unit=" %" onChange={(x) => set({ redPct: x / 100 })} />}
        <p className="hint">{PROPORTIONS.find((x) => x.id === p.proportion)?.desc}</p>
        {(sug.fromFace || sug.fromNose) && (
          <div className="btns">
            {sug.fromFace && <button className="btn sm" onClick={() => set({ centralWidth: +sug.fromFace!.toFixed(2), sizeSet: 'custom' })}>Biometria facial: {fmt(sug.fromFace)} mm</button>}
            {sug.fromNose && <button className="btn sm" onClick={() => set({ centralWidth: +sug.fromNose!.toFixed(2), sizeSet: 'custom' })}>Largura nasal: {fmt(sug.fromNose)} mm</button>}
          </div>
        )}
        <details style={{ marginTop: 8 }}>
          <summary className="hint" style={{ cursor: 'pointer' }}>Catálogo de moldes ({molds.length})</summary>
          <div style={{ maxHeight: 180, overflow: 'auto', marginTop: 6 }}>
            <table className="tbl">
              <thead>
                <tr><th>Molde</th><th>Central</th><th>6 ant.</th><th /></tr>
              </thead>
              <tbody>
                {molds.map((m) => (
                  <tr key={m.key}>
                    <td>{m.label}</td>
                    <td>{fmt(m.centralW)}×{fmt(m.centralH)}</td>
                    <td>{fmt(m.anteriorSix)}</td>
                    <td>
                      <button className="btn sm" onClick={() => set({ shape: m.shape, sizeSet: m.size, centralWidth: m.centralW, wl: m.centralW / m.centralH })}>Usar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Section>

      <Section title="Forma dental">
        <div className="shapegrid">
          {SHAPES.map((s) => (
            <button key={s.id} className={'shapebtn ' + (p.shape === s.id ? 'on' : '')} onClick={() => set({ shape: s.id, wl: +defaultWL(s.id, p.age, p.sex).toFixed(2) })} title={s.hint}>
              <svg viewBox="0 0 36 42"><path d={shapePath(s.id)} fill="#e9dcc3" stroke="#6c5b3c" strokeWidth="1" /></svg>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Arco dentário e sorriso">
        <Seg value={p.archForm} options={archOptions} onChange={(a) => set({ archForm: a })} />
        <Slider label="Largura do arco" value={p.archScale} min={0.85} max={1.15} step={0.005} digits={2} unit="×" onChange={(x) => set({ archScale: x })} />
        <Slider label="Profundidade" value={p.archDepth} min={0.8} max={1.2} step={0.005} digits={2} unit="×" onChange={(x) => set({ archDepth: x })} />
        <Slider label="Arco do sorriso" value={p.smileArc} min={0} max={2.5} step={0.05} digits={2} onChange={(x) => set({ smileArc: x })} title="0 = plano · 1 = padrão · 2 = acentuado" />
        <Slider label="Angulação ×" value={p.tipScale} min={0} max={1.8} step={0.05} digits={2} onChange={(x) => set({ tipScale: x })} />
        <Slider label="Torque ×" value={p.torqueScale} min={0} max={1.8} step={0.05} digits={2} onChange={(x) => set({ torqueScale: x })} />
      </Section>

      <Section title="Personalidade (SPA)">
        <Slider label="Sexo" value={p.sex} min={-1} max={1} step={0.05} digits={2} onChange={(x) => set({ sex: x })} title="−1 feminino · +1 masculino" />
        <Slider label="Idade" value={p.age} min={0} max={1} step={0.01} digits={2} onChange={(x) => set({ age: x })} title="0 jovem · 1 idoso (desgaste incisal)" />
        <Slider label="Personalidade" value={p.personality} min={-1} max={1} step={0.05} digits={2} onChange={(x) => set({ personality: x })} title="−1 suave · +1 vigorosa" />
        <p className="hint">Frush &amp; Fisher: o gênero define ângulos incisais, a idade o desgaste e a personalidade a agudez do canino.</p>
      </Section>

      <Section title="Cor e caracterização" tag={`escala ${p.shade}`}>
        <div className="swatches">
          {SHADES.map((s) => (
            <button key={s.id} className={'sw ' + (p.shade === s.id ? 'on' : '')} style={{ background: s.hex }} title={s.name} onClick={() => set({ shade: s.id })}>
              <span>{s.name}</span>
            </button>
          ))}
        </div>
        <Slider label="Translucidez" value={p.translucency} min={0} max={1} step={0.01} digits={2} onChange={(x) => set({ translucency: x })} />
        <Slider label="Mamelões" value={p.mamelons} min={0} max={1} step={0.01} digits={2} onChange={(x) => set({ mamelons: x })} />
        <Slider label="Textura" value={p.texture} min={0} max={1} step={0.01} digits={2} onChange={(x) => set({ texture: x })} />
        <Slider label="Brilho" value={p.gloss} min={0} max={1} step={0.01} digits={2} onChange={(x) => set({ gloss: x })} />
        <p className="hint">Cores de referência visual aproximada; confirme sempre com escala física.</p>
      </Section>

      <Section title="Posição e fotografia">
        <Slider label="Plano incisal" value={p.rollOffset} min={-8} max={8} step={0.1} unit="°" onChange={(x) => set({ rollOffset: x })} title="Desvio em relação à linha bipupilar" />
        <Slider label="Linha média" value={p.midlineShift} min={-5} max={5} step={0.05} digits={2} unit=" mm" onChange={(x) => set({ midlineShift: x })} />
        <Slider label="Altura incisal" value={p.incisalOffset} min={-4} max={6} step={0.05} digits={2} unit=" mm" onChange={(x) => set({ incisalOffset: x })} />
        <Slider label="Giro (yaw)" value={p.yaw} min={-20} max={20} step={0.5} unit="°" onChange={(x) => set({ yaw: x })} />
        <Slider label="Inclinação (pitch)" value={p.pitch} min={-20} max={20} step={0.5} unit="°" onChange={(x) => set({ pitch: x })} />
        <Slider label="Distância da câmera" value={p.cameraDistance} min={250} max={2000} step={10} digits={0} unit=" mm" onChange={(x) => set({ cameraDistance: x })} />
      </Section>

      <Section title="Arcada inferior">
        <Check label="Mostrar dentes inferiores (oclusão)" value={p.lowerEnabled} onChange={(x) => set({ lowerEnabled: x })} />
        {p.lowerEnabled && (
          <>
            <Slider label="Dentes inf." value={p.lowerTo} min={3} max={7} step={1} digits={0} onChange={(x) => set({ lowerTo: x })} />
            <Slider label="Sobremordida" value={p.overbite} min={-1} max={6} step={0.1} unit=" mm" onChange={(x) => set({ overbite: x })} />
            <Slider label="Sobressaliência" value={p.overjet} min={-1} max={6} step={0.1} unit=" mm" onChange={(x) => set({ overjet: x })} />
            <Field label="Cor inferior">
              <select value={p.lowerShade} onChange={(e) => set({ lowerShade: e.target.value })}>
                {SHADES.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
          </>
        )}
      </Section>

      <Section title="Integração com a foto">
        <LookControls />
        <div className="chips" style={{ marginTop: 6 }}>
          {(
            [
              ['midline', 'Linha média'],
              ['pupil', 'Bipupilar'],
              ['incisal', 'Plano incisal'],
              ['arc', 'Arco do sorriso'],
              ['golden', 'Proporções'],
              ['grid', 'Grade 5 mm'],
              ['ruler', 'Régua DSD'],
              ['zenith', 'Zênites'],
              ['outline', 'Contornos'],
              ['numbers', 'Numeração FDI'],
              ['mask', 'Máscara labial'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={'chip ' + (guides[k] ? 'on' : '')} onClick={() => setGuide(k, !guides[k])}>
              {l}
            </button>
          ))}
        </div>
      </Section>
      <ToothEditor />
    </>
  )
}

function syncStatuses(vv: ReturnType<typeof activeVariant>) {
  const fresh = teethForMode(vv.params)
  for (const k of Object.keys(fresh)) vv.teeth[+k].status = fresh[+k].status
}

export function LookControls() {
  const v = activeVariant(useApp((s) => s.project))
  const l = v.look
  const set = (patch: Partial<typeof l>) => mutateVariant((vv) => { Object.assign(vv.look, patch) }, 'look-' + Object.keys(patch).join(','))
  return (
    <>
      <Slider label="Exposição" value={l.exposure} min={0.6} max={1.4} step={0.01} digits={2} onChange={(x) => set({ exposure: x })} />
      <Slider label="Sombra bucal" value={l.mouthShadow} min={0} max={1} step={0.01} digits={2} onChange={(x) => set({ mouthShadow: x })} />
      <Slider label="Suavização" value={l.feather} min={0} max={6} step={0.1} unit=" px" onChange={(x) => set({ feather: x })} />
      <Slider label="Opacidade" value={l.opacity} min={0.2} max={1} step={0.01} digits={2} onChange={(x) => set({ opacity: x })} />
      <Check label="Escurecer dentes originais ao redor" value={l.eraseOld} onChange={(x) => set({ eraseOld: x })} />
      <Check label="Somente contorno (sem preenchimento)" value={l.outline} onChange={(x) => set({ outline: x, showTeeth: !x })} />
    </>
  )
}
