import { useEffect, type ReactElement } from 'react'
import { activeVariant } from './core/project'
import { getState, init, mutateVariant, newProject, redo, saveNow, select, setState, setStep, subscribe, undo, useApp, type Step } from './store/store'
import { Icons, Section } from './ui/common'
import { CasesPage, PhotosPanel } from './ui/CasesPhotos'
import { PhotoStage } from './ui/PhotoStage'
import { AnalysisPanel } from './ui/AnalysisPanel'
import { DesignPanel, ToothBar, VariantBar } from './ui/DesignPanel'
import { CadPanel } from './ui/CadPanel'
import { Viewer3D } from './ui/Viewer3D'
import { ExportPage, PlanPage, PresentPanel } from './ui/PresentExport'
import { setupHost } from './host'
import { HelpDialog } from './ui/Help'

const STEPS: { id: Step; label: string; icon: ReactElement }[] = [
  { id: 'cases', label: 'Casos', icon: Icons.cases },
  { id: 'photos', label: 'Fotos', icon: Icons.photo },
  { id: 'analysis', label: 'Análise', icon: Icons.analysis },
  { id: 'design', label: 'Desenho', icon: Icons.design },
  { id: 'cad', label: 'CAD 3D', icon: Icons.cad },
  { id: 'plan', label: 'Plano', icon: Icons.plan },
  { id: 'present', label: 'Apresentar', icon: Icons.present },
  { id: 'export', label: 'Exportar', icon: Icons.export },
]

const Logo = () => (
  <svg viewBox="0 0 64 64">
    <defs>
      <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5ee0d0" /><stop offset="1" stopColor="#3b82f6" /></linearGradient>
    </defs>
    <rect width="64" height="64" rx="14" fill="#0b1320" />
    <path d="M32 12c-7 0-13 2-15 8-2 7 2 12 3 20 1 6 3 12 6 12s3-8 6-8 3 8 6 8 5-6 6-12c1-8 5-13 3-20-2-6-8-8-15-8z" fill="url(#lg)" />
  </svg>
)

export default function App() {
  const step = useApp((s) => s.step)
  const project = useApp((s) => s.project)
  const saved = useApp((s) => s.saved)
  const toast = useApp((s) => s.toast)
  const busy = useApp((s) => s.busy)
  const canUndo = useApp((s) => s.canUndo)
  const canRedo = useApp((s) => s.canRedo)
  const host = useApp((s) => s.host)

  useEffect(() => {
    void init()
    return setupHost()
  }, [])

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault()
        redo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveNow()
      } else if (e.key === 'Escape') {
        setState({ tool: null, wizardIndex: -1 })
      } else if (!typing && getState().step === 'design' && getState().selected && e.key.startsWith('Arrow')) {
        e.preventDefault()
        const f = getState().selected!
        const k = e.shiftKey ? 0.5 : 0.1
        mutateVariant((v) => {
          const t = v.teeth[f]
          if (e.key === 'ArrowUp') t.dy += k
          if (e.key === 'ArrowDown') t.dy -= k
          if (e.key === 'ArrowLeft') t.dx -= k * (Math.floor(f / 10) % 2 === 1 ? -1 : 1) * -1
          if (e.key === 'ArrowRight') t.dx += k * (Math.floor(f / 10) % 2 === 1 ? -1 : 1) * -1
        }, 'nudge' + f)
      } else if (!typing && e.key === 'Delete' && getState().selected && getState().step === 'design') {
        mutateVariant((v) => { v.teeth[getState().selected!].status = 'natural' })
      }
    }
    window.addEventListener('keydown', kd)
    return () => window.removeEventListener('keydown', kd)
  }, [])

  const hasSide = step !== 'cases' && step !== 'plan' && step !== 'export'
  const hasTooth = step === 'design' || step === 'cad'
  const v = activeVariant(project)
  void v

  let main: ReactElement
  let side: ReactElement | null = null
  switch (step) {
    case 'cases':
      main = <CasesPage />
      break
    case 'photos':
      main = <PhotoStageHolder mode="photos" />
      side = <PhotosPanel />
      break
    case 'analysis':
      main = <PhotoStageHolder mode="analysis" />
      side = <AnalysisPanel />
      break
    case 'design':
      main = <PhotoStageHolder mode="design" />
      side = <DesignPanel />
      break
    case 'cad':
      main = <Viewer3D />
      side = <CadPanel />
      break
    case 'plan':
      main = <PlanPage />
      break
    case 'present':
      main = <PhotoStageHolder mode="present" />
      side = <PresentPanel />
      break
    default:
      main = <ExportPage />
  }

  return (
    <div className={`app ${hasSide ? '' : 'nosidebar'} ${hasTooth ? '' : 'notooth'}`}>
      <header className="topbar">
        <div className="brand">
          <Logo />
          <span>DentalPod Design</span>
          {host.embedded && <small>Dentalpos One</small>}
        </div>
        <input className="proj-name" value={project.name} onChange={(e) => setState((s) => ({ project: { ...s.project, name: e.target.value } }))} onBlur={() => void saveNow()} />
        {(step === 'design' || step === 'cad' || step === 'present') && <VariantBar />}
        <div className="grow" />
        <button className="btn sm" disabled={!canUndo} onClick={undo} title="Desfazer (Ctrl+Z)">{Icons.undo}</button>
        <button className="btn sm" disabled={!canRedo} onClick={redo} title="Refazer (Ctrl+Y)">{Icons.redo}</button>
        <button className="btn sm" onClick={() => setState({ help: true })} title="Ajuda e atalhos">?</button>
        <span className={'saved ' + (saved ? '' : 'dirty')}>{saved ? 'Salvo' : 'Salvando…'}</span>
      </header>
      <nav className="nav">
        {STEPS.map((s, i) => (
          <button key={s.id} className={step === s.id ? 'on' : ''} onClick={() => setStep(s.id)} title={s.label}>
            {s.icon}
            <span className="t">{s.label}</span>
            <span className="num">{i + 1}</span>
          </button>
        ))}
      </nav>
      <main className={'main ' + (hasSide ? '' : 'page')}>{main}</main>
      {hasSide && <aside className="side" key={step}>{side}{step === 'photos' && <Section title="Dica"><p className="hint">Para o melhor resultado use fotos nítidas, sem distorção de lente e com a cabeça alinhada.</p></Section>}</aside>}
      {hasTooth && (
        <footer className="tooth">
          <ToothBar />
        </footer>
      )}
      <HelpDialog />
      {toast && <div className={'toast ' + toast.kind}>{toast.msg}</div>}
      {busy && <div className="busy"><div>{busy}</div></div>}
    </div>
  )
}

function PhotoStageHolder({ mode }: { mode: 'photos' | 'analysis' | 'design' | 'present' }) {
  const viewPhoto = useApp((s) => s.viewPhoto)
  return <PhotoStage mode={mode} photoId={mode === 'photos' || mode === 'analysis' ? viewPhoto : null} />
}

export { newProject, select, subscribe }
