import type { OperationalAlert } from '../types/operationsHub'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
const CACHE_KEY = 'dentalpos.operational.alert.resolutions.v1'
export const OPERATIONAL_RESOLUTION_EVENT = 'dentalpos:operational-alert-resolution'

export interface OperationalAlertResolutionRecord {
  id: string
  protocol?: string | null
  alertKey?: string | null
  area: string
  sourceEntityType?: string | null
  sourceEntityId?: string | null
  status: 'RESOLVED' | 'DISMISSED'
  action: string
  reason?: string | null
  note?: string | null
  resolvedById: string
  resolvedAt: string
}

function headers(json=false) {
  const token=localStorage.getItem('dentalpos.token')||''
  const clinicId=localStorage.getItem('dentalpos.clinicId')||''
  return {Authorization:`Bearer ${token}`,...(clinicId?{'X-Clinic-ID':clinicId}:{}),...(json?{'Content-Type':'application/json'}:{})}
}

export function cachedOperationalResolutions(): OperationalAlertResolutionRecord[] {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)||'[]') as OperationalAlertResolutionRecord[] } catch { return [] }
}

function saveCache(rows: OperationalAlertResolutionRecord[]) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(rows))
  window.dispatchEvent(new CustomEvent(OPERATIONAL_RESOLUTION_EVENT))
}

export async function refreshOperationalResolutions() {
  const response=await fetch(`${API}/operational-alert-resolutions`,{headers:headers()})
  if(!response.ok) throw new Error(`Erro HTTP ${response.status}`)
  const rows=await response.json() as OperationalAlertResolutionRecord[]
  saveCache(rows)
  return rows
}

export function isOperationalAlertResolved(alert: OperationalAlert, rows=cachedOperationalResolutions()) {
  return rows.some(row =>
    (row.alertKey && row.alertKey===alert.id) ||
    (row.sourceEntityType && row.sourceEntityId && row.sourceEntityType===alert.sourceEntityType && row.sourceEntityId===alert.sourceEntityId)
  )
}

export async function dismissOperationalAlert(alert: OperationalAlert, reason: string, note?: string) {
  const response=await fetch(`${API}/operational-alert-resolutions/dismiss`,{
    method:'POST',headers:headers(true),body:JSON.stringify({alertKey:alert.id,area:alert.area,sourceEntityType:alert.sourceEntityType,sourceEntityId:alert.sourceEntityId,reason,note})
  })
  const body=await response.json().catch(()=>null)
  if(!response.ok) throw new Error(body?.error||`Erro HTTP ${response.status}`)
  const next=[body as OperationalAlertResolutionRecord,...cachedOperationalResolutions().filter(row=>row.id!==body.id)]
  saveCache(next)
  return body as OperationalAlertResolutionRecord
}
