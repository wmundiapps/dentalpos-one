import type {
  ClinicalState, DentalChartEntry, DentalFinding, Dentition,
  PeriodontalExam, PeriodontalSiteRecord, ToothSurface
} from '../types/dentalChart'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

function headers() {
  const token = localStorage.getItem('dentalpos.token') || ''
  const clinicId = localStorage.getItem('dentalpos.clinicId') || ''
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...(clinicId ? { 'X-Clinic-ID': clinicId } : {})
  }
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${url}`, { ...init, headers: { ...headers(), ...(init?.headers || {}) } })
  if (!response.ok) {
    let message = 'Erro na operação.'
    try { message = (await response.json()).error || message } catch {}
    throw new Error(message)
  }
  if (response.status === 204) return undefined as T
  return response.json()
}
export const DentalChartService = {
  chart(patientId: string) {
    return request<{entries: DentalChartEntry[], adultTeeth: number[], childTeeth: number[], surfaces: ToothSurface[]}>(
      `/patients/${encodeURIComponent(patientId)}/dental-chart`
    )
  },
  saveEntry(patientId: string, entry: {
    id?: string; dentition: Dentition; tooth: number; surface?: ToothSurface | null;
    findingCode: string; findingLabel: string; clinicalState: ClinicalState; notes?: string;
    evolutionNotes?: string; professionalId?: string; professionalName?: string; nextProcedure?: string;
  }) {
    return request<{id:string}>(`/patients/${encodeURIComponent(patientId)}/dental-chart/entries`, {
      method: 'PUT', body: JSON.stringify(entry)
    })
  },
  removeEntry(patientId: string, id: string) {
    return request<void>(`/patients/${encodeURIComponent(patientId)}/dental-chart/entries/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  findings() { return request<DentalFinding[]>('/dental-findings') },
  createFinding(input: { code: string; label: string; category?: string; color?: string }) {
    return request<DentalFinding>('/dental-findings', { method: 'POST', body: JSON.stringify(input) })
  },
  periodontalHistory(patientId: string) {
    return request<{exams: PeriodontalExam[], sites: string[], adultTeeth: number[], childTeeth: number[]}>(
      `/patients/${encodeURIComponent(patientId)}/periodontal-exams`
    )
  },
  savePeriodontalExam(patientId: string, input: {
    dentition: Dentition; examinedAt?: string; professionalId?: string; professionalName?: string; notes?: string; records: PeriodontalSiteRecord[]
  }) {
    return request<{id:string}>(`/patients/${encodeURIComponent(patientId)}/periodontal-exams`, {
      method: 'POST', body: JSON.stringify(input)
    })
  },
  compare(patientId: string, examA: string, examB: string) {
    return request<any[]>(`/patients/${encodeURIComponent(patientId)}/periodontal-comparison?examA=${encodeURIComponent(examA)}&examB=${encodeURIComponent(examB)}`)
  }
}
