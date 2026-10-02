import { useRef, useState } from 'react'
import type { PhotoKind } from '../core/types'
import { activeVariant } from '../core/project'
import {
  addPhotoFile, createDemo, exportProjectFile, getPhotoBitmap, importProjectFile, mutate, newProject, openProject, removePhoto, removeProject, saveNow, setState, setStep, useApp,
} from '../store/store'
import { Field, Section, downloadBlob } from './common'

const KINDS: { v: PhotoKind; label: string }[] = [
  { v: 'smile', label: 'Sorriso (frontal)' },
  { v: 'face', label: 'Face frontal' },
  { v: 'rest', label: 'Repouso' },
  { v: 'retracted', label: 'Afastador (intraoral)' },
  { v: 'profile', label: 'Perfil' },
  { v: 'occlusal', label: 'Oclusal' },
  { v: 'other', label: 'Outra' },
]

export function CasesPage() {
  const projects = useApp((s) => s.projects)
  const project = useApp((s) => s.project)
  const host = useApp((s) => s.host)
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  return (
    <div className="pagewrap">
      <h1>DentalPod Design</h1>
      <p className="hint" style={{ fontSize: 14, maxWidth: 780 }}>
        Planejamento digital do sorriso (DSD) com enceramento 3D paramétrico: análise facial e dentolabial, desenho sobre a foto com iluminação realista, propostas comparáveis e exportação para impressão 3D e fresagem
        (STL, OBJ, PLY e 3MF) de facetas, coroas, pontes, próteses parciais e totais.
      </p>
      <div className="grid3" style={{ margin: '18px 0' }}>
        <div className="card kpi"><b>1 · Fotos e análise</b><span>Calibração, linha média, plano incisal, lábios, corredor bucal, arco do sorriso, zênites.</span></div>
        <div className="card kpi"><b>2 · Desenho do sorriso</b><span>5 tamanhos, 6 formas, 5 sistemas de proporção, 8 estilos, cor A–D/BL e caracterização.</span></div>
        <div className="card kpi"><b>3 · CAD e produção</b><span>Modelo 3D fechado (watertight), bases e selas, grampos, conectores — pronto para STL/3MF.</span></div>
      </div>
      <div className="card">
        <div className="btns" style={{ alignItems: 'center' }}>
          <input style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', minWidth: 260 }} placeholder={host.patientName ? `Paciente: ${host.patientName}` : 'Nome do paciente / caso'} value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn primary" onClick={() => void newProject(name ? `Caso — ${name}` : 'Novo caso', name)}>Novo caso</button>
          <button className="btn" onClick={() => void createDemo()}>Abrir caso de demonstração</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Importar arquivo .dpd</button>
          <input ref={fileRef} type="file" accept=".dpd,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importProjectFile(f); e.target.value = '' }} />
        </div>
        {host.embedded && <p className="hint" style={{ marginTop: 8 }}>Integrado ao Dentalpos One{host.clinic ? ` · ${host.clinic}` : ''}. Os casos ficam salvos neste navegador.</p>}
      </div>
      <h2>Casos salvos</h2>
      {projects.length === 0 && <p className="hint">Nenhum caso salvo ainda. Abra o caso de demonstração para testar o fluxo completo.</p>}
      <div style={{ display: 'grid', gap: 8 }}>
        {projects.map((p) => (
          <div className="case" key={p.id}>
            <div className="grow">
              <b>{p.name}{p.id === project.id ? '  · aberto' : ''}</b>
              <small>{p.patient || 'Sem paciente'} · {p.variants} proposta(s) · {new Date(p.updatedAt).toLocaleString('pt-BR')}{p.demo ? ' · demonstração' : ''}</small>
            </div>
            <button className="btn sm" onClick={() => void openProject(p.id)}>Abrir</button>
            <button className="btn sm danger" onClick={() => { if (confirm('Excluir este caso permanentemente?')) void removeProject(p.id) }}>Excluir</button>
          </div>
        ))}
      </div>
      <h2>Caso atual</h2>
      <div className="card">
        <Field label="Nome do caso"><input type="text" value={project.name} onChange={(e) => mutate((p) => { p.name = e.target.value }, 'pname')} /></Field>
        <Field label="Paciente"><input type="text" value={project.patient.name} onChange={(e) => mutate((p) => { p.patient.name = e.target.value }, 'pat')} /></Field>
        <Field label="Idade"><input type="number" value={project.patient.age ?? ''} onChange={(e) => mutate((p) => { p.patient.age = e.target.value ? +e.target.value : undefined }, 'age')} /></Field>
        <Field label="Observações"><textarea rows={3} style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 6, padding: 8 }} value={project.notes} onChange={(e) => mutate((p) => { p.notes = e.target.value }, 'notes')} /></Field>
        <div className="btns">
          <button className="btn" onClick={() => void saveNow()}>Salvar agora</button>
          <button className="btn" onClick={async () => downloadBlob(await exportProjectFile(), `${project.name.replace(/[^\w\-]+/g, '_')}.dpd`)}>Exportar caso (.dpd)</button>
          <button className="btn primary" onClick={() => setStep('photos')}>Continuar → Fotos</button>
        </div>
      </div>
      <p className="hint" style={{ marginTop: 16 }}>Privacidade: fotos e casos são armazenados somente neste navegador (IndexedDB). Nada é enviado a servidores.</p>
    </div>
  )
}

function Thumb({ id }: { id: string }) {
  const b = getPhotoBitmap(id)
  const ref = (el: HTMLCanvasElement | null) => {
    if (!el || !b) return
    el.width = 200
    el.height = 150
    const g = el.getContext('2d')!
    const k = Math.max(200 / b.width, 150 / b.height)
    g.drawImage(b, (200 - b.width * k) / 2, (150 - b.height * k) / 2, b.width * k, b.height * k)
  }
  return <canvas ref={ref} />
}

export function PhotosPanel() {
  const project = useApp((s) => s.project)
  const viewPhoto = useApp((s) => s.viewPhoto)
  const photoRev = useApp((s) => s.photoRev)
  const [over, setOver] = useState(false)
  const [kind, setKind] = useState<PhotoKind>('smile')
  const fileRef = useRef<HTMLInputElement>(null)
  void photoRev
  const current = viewPhoto ?? project.basePhotoId
  const addFiles = async (files: FileList | null) => {
    if (!files) return
    for (const f of Array.from(files)) await addPhotoFile(f, kind)
  }
  const v = activeVariant(project)
  void v
  return (
    <>
      <Section title="Fotografias">
        <div
          className={'dropzone ' + (over ? 'over' : '')}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void addFiles(e.dataTransfer.files) }}
        >
          Arraste fotos aqui ou
          <div style={{ marginTop: 8 }}>
            <button className="btn primary" onClick={() => fileRef.current?.click()}>Escolher arquivos</button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = '' }} />
        </div>
        <Field label="Tipo"><select value={kind} onChange={(e) => setKind(e.target.value as PhotoKind)}>{KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}</select></Field>
        <p className="hint">Protocolo recomendado: face frontal com sorriso, câmera na altura dos olhos, cabeça nivelada, pupilas visíveis, luz frontal difusa e boa nitidez dos dentes. Use fotos de 12 MP ou mais.</p>
      </Section>
      <Section title="Fotos do caso" tag={`${project.photos.length}`}>
        {project.photos.length === 0 && <p className="hint">Nenhuma foto ainda.</p>}
        <div className="grid2">
          {project.photos.map((ph) => (
            <div key={ph.id}>
              <div className={'thumb ' + (current === ph.id ? 'on' : '')} onClick={() => setState({ viewPhoto: ph.id })}>
                <Thumb id={ph.id} />
                <div className="cap"><span>{KINDS.find((k) => k.v === ph.kind)?.label ?? ph.kind}</span><span>{ph.width}×{ph.height}</span></div>
              </div>
              <div className="btns" style={{ marginTop: 4 }}>
                <button className={'btn sm ' + (project.basePhotoId === ph.id ? 'primary' : '')} onClick={() => mutate((p) => { p.basePhotoId = ph.id })}>{project.basePhotoId === ph.id ? 'Foto base ✓' : 'Usar como base'}</button>
                <button className="btn sm danger" onClick={() => void removePhoto(ph.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Próximo passo">
        <button className="btn primary" disabled={!project.basePhotoId} onClick={() => setStep('analysis')}>Análise facial →</button>
      </Section>
    </>
  )
}
