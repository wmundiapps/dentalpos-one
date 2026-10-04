import { getSecurityConfig } from '../security/config'
import { SecurityError, validateModelFile } from '../security/files'
import { useRef } from 'react'
import { Check, Field, Section, Seg, Slider, fmt } from './common'
import { ToothEditor } from './DesignPanel'
import { activeVariant } from '../core/project'
import { mutate, mutateVariant, setState, toast, useApp } from '../store/store'
import { parseMesh } from '../geometry/importers'
import { putBlob, deleteBlob } from '../store/db'
import { uid } from '../core/math'
import { meshStats } from '../geometry/mesh'
import { forgetModel } from './Viewer3D'
import type { ImportedModel } from '../core/types'

export function CadPanel() {
  const project = useApp((s) => s.project)
  const v3d = useApp((s) => s.v3d)
  const v = activeVariant(project)
  const p = v.params
  const dn = project.denture
  const fileRef = useRef<HTMLInputElement>(null)
  const archRef = useRef<ImportedModel['arch']>('upper')
  const setV3 = (patch: Partial<typeof v3d>) => setState((s) => ({ v3d: { ...s.v3d, ...patch } }))
  const cam = (name: string) => setState((s) => ({ camCmd: { name, n: s.camCmd.n + 1 } }))
  const set = (patch: Partial<typeof p>) => mutateVariant((vv) => { Object.assign(vv.params, patch) }, 'cad-' + Object.keys(patch).join(','))
  const setDen = (patch: Partial<typeof dn>) => mutate((pr) => { Object.assign(pr.denture, patch) }, 'den-' + Object.keys(patch).join(','))

  const importModel = async (file: File, arch: ImportedModel['arch']) => {
    try {
      const buf = await validateModelFile(file, getSecurityConfig())
      const mesh = parseMesh(file.name, buf)
      const st = meshStats(mesh)
      const id = uid('mdl')
      await putBlob(`${project.id}/model/${id}`, buf)
      const c = st.bbox
      mutate((pr) => {
        pr.models.push({
          id,
          name: file.name,
          arch,
          triangles: st.triangles,
          tx: -((c.min[0] + c.max[0]) / 2),
          ty: -((c.min[1] + c.max[1]) / 2) + (arch === 'lower' ? -6 : 8),
          tz: -((c.min[2] + c.max[2]) / 2) - 14,
          rx: 0, ry: 0, rz: 0, scale: 1, opacity: 0.85, visible: true,
        })
      })
      toast(`Modelo importado: ${st.triangles.toLocaleString('pt-BR')} triângulos. Ajuste a posição com os controles.`, 'ok')
    } catch (e) {
      console.error(e)
      toast(e instanceof SecurityError ? e.message : 'Não foi possível ler o modelo (use STL, OBJ ou PLY).', 'err')
    }
  }
  return (
    <>
      <Section title="Visualização 3D">
        <div className="btns" style={{ marginBottom: 8 }}>
          {[['front', 'Frontal'], ['left', 'Lateral E'], ['right', 'Lateral D'], ['top', 'Oclusal sup.'], ['bottom', 'Oclusal inf.'], ['oblique', '3/4']].map(([k, l]) => (
            <button key={k} className="btn sm" onClick={() => cam(k)}>{l}</button>
          ))}
        </div>
        <Check label="Mostrar bases / selas / conectores" value={v3d.base} onChange={(x) => setV3({ base: x })} />
        <Check label="Dentes naturais (fantasma)" value={v3d.ghost} onChange={(x) => setV3({ ghost: x })} />
        <Check label="Modelos importados" value={v3d.models} onChange={(x) => setV3({ models: x })} />
        <Check label="Malha (wireframe)" value={v3d.wire} onChange={(x) => setV3({ wire: x })} />
        <Check label="Corte sagital" value={v3d.section} onChange={(x) => setV3({ section: x })} />
        {v3d.section && <Slider label="Posição do corte" value={v3d.sectionX} min={-30} max={30} step={0.1} unit=" mm" onChange={(x) => setV3({ sectionX: x })} />}
        <Check label="Ferramenta de medição (mm)" value={v3d.measure} onChange={(x) => setV3({ measure: x })} />
        <Seg value={v3d.bg} options={[{ v: 'dark' as const, label: 'Fundo escuro' }, { v: 'light' as const, label: 'Fundo claro' }]} onChange={(x) => setV3({ bg: x })} />
      </Section>

      <Section title="Oclusão (arcada inferior)">
        <Check label="Incluir dentes inferiores" value={p.lowerEnabled} onChange={(x) => set({ lowerEnabled: x })} />
        {p.lowerEnabled && (
          <>
            <Slider label="Dentes inf." value={p.lowerTo} min={3} max={7} step={1} digits={0} onChange={(x) => set({ lowerTo: x })} />
            <Slider label="Sobremordida" value={p.overbite} min={-1} max={6} step={0.1} unit=" mm" onChange={(x) => set({ overbite: x })} />
            <Slider label="Sobressaliência" value={p.overjet} min={-1} max={6} step={0.1} unit=" mm" onChange={(x) => set({ overjet: x })} />
          </>
        )}
      </Section>

      <Section title="Próteses removíveis (base e conectores)">
        <Slider label="Espessura base" value={dn.baseThickness} min={1.5} max={4} step={0.1} unit=" mm" onChange={(x) => setDen({ baseThickness: x })} />
        <Slider label="Altura do flange" value={dn.flangeHeight} min={5} max={16} step={0.5} unit=" mm" onChange={(x) => setDen({ flangeHeight: x })} />
        <Slider label="Festonamento" value={dn.festoon} min={0} max={2.5} step={0.1} unit=" mm" onChange={(x) => setDen({ festoon: x })} />
        <Field label="Superior">
          <select value={dn.palatal} onChange={(e) => setDen({ palatal: e.target.value as typeof dn.palatal })}>
            <option value="plate">Placa palatina</option>
            <option value="strap">Barra palatina</option>
            <option value="none">Somente selas</option>
          </select>
        </Field>
        <Field label="Inferior">
          <select value={dn.lowerConnector} onChange={(e) => setDen({ lowerConnector: e.target.value as typeof dn.lowerConnector })}>
            <option value="horseshoe">Ferradura lingual</option>
            <option value="lingualBar">Barra lingual</option>
            <option value="none">Somente selas</option>
          </select>
        </Field>
        <Check label="Grampos circunferenciais nos dentes pilares" value={dn.clasps} onChange={(x) => setDen({ clasps: x })} />
        <Field label="Cor da base"><input type="color" value={dn.baseColor} onChange={(e) => setDen({ baseColor: e.target.value })} style={{ height: 28 }} /></Field>
        <p className="hint">Selas são geradas nos dentes marcados como “Prótese”. Prótese total: todos os dentes de um arco como “Prótese” (modo Total).</p>
      </Section>

      <Section title="Modelos digitais (STL/OBJ/PLY)" tag={`${project.models.length}`}>
        <p className="hint">Importe o escaneamento do arco para posicionar o desenho sobre ele (arco superior, inferior ou registro de mordida). Ajuste manualmente a posição.</p>
        <div className="btns">
          {(['upper', 'lower', 'bite'] as const).map((a) => (
            <button key={a} className="btn sm" onClick={() => { archRef.current = a; fileRef.current?.click() }}>+ {a === 'upper' ? 'Superior' : a === 'lower' ? 'Inferior' : 'Mordida'}</button>
          ))}
          <input ref={fileRef} type="file" accept=".stl,.obj,.ply" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importModel(f, archRef.current); e.target.value = '' }} />
        </div>
        {project.models.map((m) => (
          <div key={m.id} style={{ borderTop: '1px solid var(--line)', marginTop: 8, paddingTop: 6 }}>
            <div className="row" style={{ margin: 0 }}>
              <b style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</b>
              <button className="btn sm" onClick={() => mutate((pr) => { const x = pr.models.find((q) => q.id === m.id)!; x.visible = !x.visible })}>{m.visible ? 'ocultar' : 'mostrar'}</button>
              <button className="btn sm danger" onClick={async () => { await deleteBlob(`${project.id}/model/${m.id}`); forgetModel(project.id, m.id); mutate((pr) => { pr.models = pr.models.filter((q) => q.id !== m.id) }) }}>✕</button>
            </div>
            {(['tx', 'ty', 'tz'] as const).map((k) => (
              <Slider key={k} label={k === 'tx' ? 'Posição X' : k === 'ty' ? 'Posição Y' : 'Posição Z'} value={m[k]} min={-60} max={60} step={0.1} unit=" mm" onChange={(x) => mutate((pr) => { const q = pr.models.find((z) => z.id === m.id)!; q[k] = x }, 'm' + m.id + k)} />
            ))}
            {(['rx', 'ry', 'rz'] as const).map((k) => (
              <Slider key={k} label={'Rotação ' + k[1].toUpperCase()} value={m[k]} min={-180} max={180} step={0.5} unit="°" onChange={(x) => mutate((pr) => { const q = pr.models.find((z) => z.id === m.id)!; q[k] = x }, 'm' + m.id + k)} />
            ))}
            <Slider label="Escala" value={m.scale} min={0.5} max={1.5} step={0.005} digits={3} onChange={(x) => mutate((pr) => { pr.models.find((z) => z.id === m.id)!.scale = x }, 'm' + m.id + 's')} />
            <Slider label="Opacidade" value={m.opacity} min={0.1} max={1} step={0.05} digits={2} onChange={(x) => mutate((pr) => { pr.models.find((z) => z.id === m.id)!.opacity = x }, 'm' + m.id + 'o')} />
            <div className="hint">{m.triangles.toLocaleString('pt-BR')} triângulos · {fmt(m.scale, 3)}×</div>
          </div>
        ))}
      </Section>
      <ToothEditor />
    </>
  )
}
