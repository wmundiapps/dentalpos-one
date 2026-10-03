import { useSyncExternalStore } from 'react'
import type { PhotoKind, PhotoMeta, Project, Variant } from '../core/types'
import { createProject, activeVariant, newVariant, PROJECT_VERSION } from '../core/project'
import { deepClone, uid } from '../core/math'
import { demoMarks, makeDemoPhoto, DEMO_H, DEMO_W } from '../render/demoFace'
import { PRESETS } from '../core/presets'
import { applyMode } from '../core/project'
import { deleteBlob, deleteProject, getBlob, listProjects, loadProject, putBlob, saveProject, type ProjectSummary } from './db'

export type Step = 'cases' | 'photos' | 'analysis' | 'design' | 'cad' | 'plan' | 'present' | 'export'

export type MarkTool =
  | null
  | 'pupilR'
  | 'pupilL'
  | 'midTop'
  | 'midBottom'
  | 'commR'
  | 'commL'
  | 'upMid'
  | 'lowMid'
  | 'alarR'
  | 'alarL'
  | 'zygR'
  | 'zygL'
  | 'calibA'
  | 'calibB'
  | 'profComm'
  | 'profTragus'

export interface HostInfo {
  embedded: boolean
  patientName?: string
  patientId?: string
  clinic?: string
}

export interface AppState {
  project: Project
  projects: ProjectSummary[]
  step: Step
  selected: number | null
  symmetric: boolean
  tool: MarkTool
  wizardIndex: number // >=0 = análise guiada em curso
  guides: { midline: boolean; pupil: boolean; incisal: boolean; grid: boolean; golden: boolean; arc: boolean; zenith: boolean; outline: boolean; mask: boolean; ruler: boolean; numbers: boolean; axes: boolean }
  compare: 'after' | 'before' | 'split'
  split: number
  zoomReset: number
  busy: string | null
  toast: { id: number; msg: string; kind: 'info' | 'ok' | 'err' } | null
  host: HostInfo
  help: boolean
  saved: boolean
  rev: number // incrementa a cada mudança do projeto
  photoRev: number
  viewPhoto: string | null
  v3d: { base: boolean; ghost: boolean; wire: boolean; section: boolean; sectionX: number; measure: boolean; gum: boolean; models: boolean; bg: 'dark' | 'light' }
  camCmd: { name: string; n: number }
  canUndo: boolean
  canRedo: boolean
}

const initialProject = createProject('Novo caso')

let state: AppState = {
  project: initialProject,
  projects: [],
  step: 'cases',
  selected: null,
  symmetric: true,
  tool: null,
  wizardIndex: -1,
  guides: { midline: true, pupil: true, incisal: true, grid: false, golden: false, arc: true, zenith: false, outline: false, mask: false, ruler: false, numbers: false, axes: true },
  compare: 'after',
  split: 0.5,
  zoomReset: 0,
  busy: null,
  toast: null,
  host: { embedded: false },
  help: false,
  saved: true,
  rev: 0,
  photoRev: 0,
  viewPhoto: null,
  v3d: { base: true, ghost: true, wire: false, section: false, sectionX: 0, measure: false, gum: true, models: true, bg: 'dark' },
  camCmd: { name: 'front', n: 0 },
  canUndo: false,
  canRedo: false,
}

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export const getState = () => state
export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const p = typeof patch === 'function' ? patch(state) : patch
  state = { ...state, ...p }
  emit()
}
export const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useApp<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state))
}

// ---- cache de fotos em memória ---------------------------------------------------------------------------------
const photoCache = new Map<string, ImageBitmap>()
export const getPhotoBitmap = (id: string | null | undefined) => (id ? photoCache.get(id) : undefined)

async function loadPhotosFor(p: Project) {
  photoCache.clear()
  for (const ph of p.photos) {
    try {
      const b = await getBlob(`${p.id}/photo/${ph.id}`)
      if (b instanceof Blob) photoCache.set(ph.id, await createImageBitmap(b))
    } catch (e) {
      console.warn('Falha ao carregar foto', ph.id, e)
    }
  }
  setState((s) => ({ photoRev: s.photoRev + 1 }))
}

// ---- histórico ---------------------------------------------------------------------------------------------------
const undoStack: string[] = []
const redoStack: string[] = []
let lastKey = ''
let lastAt = 0
const HISTORY_MAX = 80

function pushHistory(key?: string) {
  const now = Date.now()
  if (key && key === lastKey && now - lastAt < 900) {
    lastAt = now
    return
  }
  undoStack.push(JSON.stringify(state.project))
  if (undoStack.length > HISTORY_MAX) undoStack.shift()
  redoStack.length = 0
  lastKey = key ?? ''
  lastAt = now
}

function flagHistory() {
  setState({ canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 })
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSave() {
  setState({ saved: false })
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void saveNow(), 900)
}

export async function saveNow() {
  if (saveTimer) clearTimeout(saveTimer)
  const p = { ...state.project, updatedAt: Date.now() }
  try {
    await saveProject(p)
    setState({ saved: true })
    void refreshProjects()
  } catch (e) {
    console.warn('Falha ao salvar', e)
    toast('Não foi possível salvar no navegador (armazenamento indisponível).', 'err')
  }
}

export async function refreshProjects() {
  try {
    setState({ projects: await listProjects() })
  } catch {
    /* sem IndexedDB */
  }
}

// ---- mutações do projeto -----------------------------------------------------------------------------------------
export function mutate(fn: (p: Project) => void, key?: string) {
  pushHistory(key)
  const next = deepClone(state.project)
  fn(next)
  next.updatedAt = Date.now()
  setState((s) => ({ project: next, rev: s.rev + 1 }))
  flagHistory()
  scheduleSave()
}

export function mutateVariant(fn: (v: Variant, p: Project) => void, key?: string) {
  mutate((p) => fn(activeVariant(p), p), key)
}

export function undo() {
  const prev = undoStack.pop()
  if (!prev) return
  redoStack.push(JSON.stringify(state.project))
  setState((s) => ({ project: JSON.parse(prev) as Project, rev: s.rev + 1 }))
  lastKey = ''
  flagHistory()
  scheduleSave()
}
export function redo() {
  const nxt = redoStack.pop()
  if (!nxt) return
  undoStack.push(JSON.stringify(state.project))
  setState((s) => ({ project: JSON.parse(nxt) as Project, rev: s.rev + 1 }))
  lastKey = ''
  flagHistory()
  scheduleSave()
}

let toastN = 0
export function toast(msg: string, kind: 'info' | 'ok' | 'err' = 'info') {
  const id = ++toastN
  setState({ toast: { id, msg, kind } })
  setTimeout(() => {
    if (state.toast?.id === id) setState({ toast: null })
  }, kind === 'err' ? 6000 : 3200)
}

export function setStep(step: Step) {
  setState({ step, tool: null })
}
export const select = (fdi: number | null) => setState({ selected: fdi })

// ---- projetos ----------------------------------------------------------------------------------------------------
function resetHistory() {
  undoStack.length = 0
  redoStack.length = 0
  lastKey = ''
  flagHistory()
}

export async function openProjectObj(p: Project) {
  resetHistory()
  setState((s) => ({ project: p, viewPhoto: null, selected: null, tool: null, wizardIndex: -1, rev: s.rev + 1, saved: true, compare: 'after', zoomReset: s.zoomReset + 1 }))
  await loadPhotosFor(p)
}

export async function newProject(name = 'Novo caso', patientName = '') {
  const p = createProject(name)
  p.patient.name = patientName
  if (state.host.patientName && !patientName) p.patient.name = state.host.patientName
  if (state.host.patientId) p.patient.hostId = state.host.patientId
  await openProjectObj(p)
  await saveNow()
  setStep('photos')
}

export async function openProject(id: string) {
  const p = await loadProject(id)
  if (!p) return toast('Caso não encontrado.', 'err')
  await openProjectObj(p)
  setStep(p.basePhotoId ? 'design' : 'photos')
}

export async function removeProject(id: string) {
  await deleteProject(id)
  await refreshProjects()
  if (state.project.id === id) await openProjectObj(createProject('Novo caso'))
}

export async function createDemo() {
  setState({ busy: 'Gerando caso de demonstração…' })
  try {
    const p = createProject('Caso demonstração — facetas 15 a 25')
    p.demo = true
    p.patient = { name: 'Paciente demonstração', age: 34, sex: 'F', notes: 'Foto ilustrativa gerada pelo sistema (não é uma pessoa real).' }
    const blob = await makeDemoPhoto()
    const id = uid('ph')
    const meta: PhotoMeta = { id, kind: 'smile', name: 'sorriso-demonstracao.jpg', width: DEMO_W, height: DEMO_H }
    p.photos.push(meta)
    p.basePhotoId = id
    const dm = demoMarks()
    p.marks = dm.marks
    p.calib = dm.calib
    p.face = { source: 'manual', shape: 'oval', label: 'Oval', lengthWidth: 1.3, jawCheek: 0.8, smile: 0.9 }
    const v = p.variants[0]
    Object.assign(v.params, PRESETS[0].params)
    v.params.upperTo = 5
    v.name = 'A · Natural jovem'
    const b = newVariant('B · Hollywood')
    Object.assign(b.params, PRESETS[3].params)
    b.params.upperTo = 5
    p.variants.push(b)
    const c = newVariant('C · Feminino suave')
    Object.assign(c.params, PRESETS[4].params)
    c.params.upperTo = 5
    p.variants.push(c)
    await putBlob(`${p.id}/photo/${id}`, blob)
    await openProjectObj(p)
    await saveNow()
    setStep('design')
  } finally {
    setState({ busy: null })
  }
}

// ---- fotos -------------------------------------------------------------------------------------------------------
const MAX_SIDE = 3000

export async function addPhotoFile(file: File, kind: PhotoKind = 'smile') {
  setState({ busy: 'Importando foto…' })
  try {
    let bmp = await createImageBitmap(file)
    let blob: Blob = file
    const side = Math.max(bmp.width, bmp.height)
    if (side > MAX_SIDE || !/jpe?g|png|webp/i.test(file.type)) {
      const k = Math.min(1, MAX_SIDE / side)
      const c = document.createElement('canvas')
      c.width = Math.round(bmp.width * k)
      c.height = Math.round(bmp.height * k)
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
      blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('falha ao converter'))), 'image/jpeg', 0.93))
      bmp.close?.()
      bmp = await createImageBitmap(blob)
    }
    const id = uid('ph')
    await putBlob(`${state.project.id}/photo/${id}`, blob)
    photoCache.set(id, bmp)
    mutate((p) => {
      p.photos.push({ id, kind, name: file.name, width: bmp.width, height: bmp.height })
      if (!p.basePhotoId && (kind === 'smile' || kind === 'face')) p.basePhotoId = id
    })
    setState((s) => ({ photoRev: s.photoRev + 1 }))
    toast('Foto adicionada.', 'ok')
  } catch (e) {
    console.error(e)
    toast('Não foi possível ler a imagem. Use JPG, PNG ou WebP.', 'err')
  } finally {
    setState({ busy: null })
  }
}

export async function removePhoto(id: string) {
  await deleteBlob(`${state.project.id}/photo/${id}`)
  photoCache.delete(id)
  mutate((p) => {
    p.photos = p.photos.filter((x) => x.id !== id)
    if (p.basePhotoId === id) p.basePhotoId = p.photos.find((x) => x.kind === 'smile' || x.kind === 'face')?.id ?? p.photos[0]?.id ?? null
  })
  setState((s) => ({ photoRev: s.photoRev + 1 }))
}

// ---- variantes ---------------------------------------------------------------------------------------------------
export function addVariant(copy = true) {
  mutate((p) => {
    const cur = activeVariant(p)
    const letter = String.fromCharCode(65 + p.variants.length)
    const v: Variant = copy ? { ...deepClone(cur), id: uid('var'), name: `Proposta ${letter}` } : newVariant(`Proposta ${letter}`)
    p.variants.push(v)
    p.activeVariant = v.id
  })
}
export function removeVariant(id: string) {
  mutate((p) => {
    if (p.variants.length <= 1) return
    p.variants = p.variants.filter((v) => v.id !== id)
    if (p.activeVariant === id) p.activeVariant = p.variants[0].id
  })
}
export function setActiveVariant(id: string) {
  mutate((p) => {
    p.activeVariant = id
  })
}

export function setMode(mode: Variant['params']['mode']) {
  mutateVariant((v) => applyMode(v, mode))
}

// ---- arquivo do caso (.dpd) --------------------------------------------------------------------------------------
const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = () => rej(r.error)
    r.readAsDataURL(b)
  })

export async function exportProjectFile(): Promise<Blob> {
  const p = state.project
  const photos: Record<string, string> = {}
  for (const ph of p.photos) {
    const b = await getBlob(`${p.id}/photo/${ph.id}`)
    if (b instanceof Blob) photos[ph.id] = await blobToDataUrl(b)
  }
  const models: Record<string, string> = {}
  for (const m of p.models) {
    const b = await getBlob(`${p.id}/model/${m.id}`)
    if (b instanceof ArrayBuffer) models[m.id] = btoa(String.fromCharCode(...new Uint8Array(b)))
  }
  return new Blob([JSON.stringify({ format: 'dentalpoddesign', version: PROJECT_VERSION, project: p, photos, models })], { type: 'application/json' })
}

export async function importProjectFile(file: File) {
  try {
    const data = JSON.parse(await file.text())
    if (data.format !== 'dentalpoddesign' || !data.project) throw new Error('arquivo inválido')
    const p = data.project as Project
    p.id = uid('prj')
    for (const ph of p.photos) {
      const url = data.photos?.[ph.id] as string | undefined
      if (url) await putBlob(`${p.id}/photo/${ph.id}`, await (await fetch(url)).blob())
    }
    for (const m of p.models) {
      const b64 = data.models?.[m.id] as string | undefined
      if (b64) {
        const bin = atob(b64)
        const u = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
        await putBlob(`${p.id}/model/${m.id}`, u.buffer)
      }
    }
    await openProjectObj(p)
    await saveNow()
    setStep('design')
    toast('Caso importado.', 'ok')
  } catch (e) {
    console.error(e)
    toast('Arquivo .dpd inválido.', 'err')
  }
}

export async function init() {
  await refreshProjects()
}
