import type { Project } from '../core/types'

/** Persistência local (IndexedDB). Nada sai do computador do usuário. */
const DB_NAME = 'dentalpoddesign'
const DB_VERSION = 1

let dbp: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB indisponível'))
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const r = fn(t.objectStore(store))
        r.onsuccess = () => resolve(r.result)
        r.onerror = () => reject(r.error)
      }),
  )
}

export interface ProjectSummary {
  id: string
  name: string
  patient: string
  updatedAt: number
  variants: number
  demo?: boolean
}

export const summarize = (p: Project): ProjectSummary => ({
  id: p.id,
  name: p.name,
  patient: p.patient.name,
  updatedAt: p.updatedAt,
  variants: p.variants.length,
  demo: p.demo,
})

export async function saveProject(p: Project): Promise<void> {
  await tx('projects', 'readwrite', (s) => s.put(p))
}
export async function loadProject(id: string): Promise<Project | undefined> {
  return tx<Project | undefined>('projects', 'readonly', (s) => s.get(id))
}
export async function listProjects(): Promise<ProjectSummary[]> {
  const all = await tx<Project[]>('projects', 'readonly', (s) => s.getAll())
  return all.map(summarize).sort((a, b) => b.updatedAt - a.updatedAt)
}
export async function deleteProject(id: string): Promise<void> {
  const p = await loadProject(id)
  await tx('projects', 'readwrite', (s) => s.delete(id))
  if (p) {
    for (const ph of p.photos) await deleteBlob(`${id}/photo/${ph.id}`)
    for (const m of p.models) await deleteBlob(`${id}/model/${m.id}`)
  }
}

export async function putBlob(key: string, b: Blob | ArrayBuffer): Promise<void> {
  await tx('blobs', 'readwrite', (s) => s.put(b, key))
}
export async function getBlob(key: string): Promise<Blob | ArrayBuffer | undefined> {
  return tx<Blob | ArrayBuffer | undefined>('blobs', 'readonly', (s) => s.get(key))
}
export async function deleteBlob(key: string): Promise<void> {
  await tx('blobs', 'readwrite', (s) => s.delete(key))
}
