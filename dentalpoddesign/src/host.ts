import { getState, newProject, openProject, setState, subscribe, toast } from './store/store'

/**
 * Integração com o Dentalpos One (ou outro host) via postMessage quando o app roda dentro de um iframe.
 *
 *  host → app:  { type: 'dpd:init', patient: { id, name, age }, clinic, caseName }
 *  app → host:  { type: 'dpd:ready' } · { type: 'dpd:saved', project: {...resumo} }
 */
export function setupHost(): () => void {
  const embedded = window.parent !== window || new URLSearchParams(location.search).get('embedded') === '1'
  if (!embedded) return () => undefined
  setState({ host: { embedded: true } })
  const onMsg = async (e: MessageEvent) => {
    const d = e.data
    if (!d || typeof d !== 'object' || d.source === 'react-devtools-bridge') return
    if (d.type === 'dpd:init') {
      const patient = d.patient ?? {}
      setState({ host: { embedded: true, patientName: patient.name, patientId: patient.id, clinic: d.clinic } })
      // reabre o caso existente do paciente, se houver
      const existing = getState().projects.find((p) => p.patient === (patient.name ?? '') && patient.name)
      if (existing) await openProject(existing.id)
      else if (patient.name) {
        await newProject(d.caseName || `Caso — ${patient.name}`, patient.name)
        toast(`Caso criado para ${patient.name}.`, 'ok')
      }
    }
  }
  window.addEventListener('message', onMsg)
  window.parent.postMessage({ type: 'dpd:ready' }, '*')
  let last = 0
  const unsub = subscribe(() => {
    const s = getState()
    if (s.saved && s.project.updatedAt !== last) {
      last = s.project.updatedAt
      window.parent.postMessage(
        { type: 'dpd:saved', project: { id: s.project.id, name: s.project.name, patient: s.project.patient, variants: s.project.variants.length, updatedAt: s.project.updatedAt } },
        '*',
      )
    }
  })
  return () => {
    window.removeEventListener('message', onMsg)
    unsub()
  }
}
