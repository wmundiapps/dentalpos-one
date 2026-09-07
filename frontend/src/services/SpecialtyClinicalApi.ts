import type { ImplantRecord, ProsthesisRecord, SurgeryRecord } from '../types/specialtyClinical'
const API = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
function headers(json=false){ const token=localStorage.getItem('dentalpos.token')||''; const clinicId=localStorage.getItem('dentalpos.clinicId')||''; return {Authorization:`Bearer ${token}`,...(clinicId?{'X-Clinic-ID':clinicId}:{}),...(json?{'Content-Type':'application/json'}:{})} }
async function request<T>(path:string, init:RequestInit={}):Promise<T>{ const response=await fetch(`${API}/specialty-clinical${path}`,{...init,headers:{...headers(Boolean(init.body)),...(init.headers||{})}}); if(!response.ok){const body=await response.json().catch(()=>null);throw new Error(body?.error||`Erro HTTP ${response.status}`)} return response.json() }
export const SpecialtyClinicalApi = {
  surgeries:(patientId:string)=>request<SurgeryRecord[]>(`/patients/${patientId}/surgeries`),
  createSurgery:(patientId:string,input:Record<string,unknown>)=>request<SurgeryRecord>(`/patients/${patientId}/surgeries`,{method:'POST',body:JSON.stringify(input)}),
  updateSurgery:(id:string,input:Record<string,unknown>)=>request<SurgeryRecord>(`/surgeries/${id}`,{method:'PUT',body:JSON.stringify(input)}),
  addFollowUp:(id:string,input:Record<string,unknown>)=>request(`/surgeries/${id}/follow-ups`,{method:'POST',body:JSON.stringify(input)}),
  implants:(patientId:string)=>request<ImplantRecord[]>(`/patients/${patientId}/implants`),
  createImplant:(patientId:string,input:Record<string,unknown>)=>request<ImplantRecord>(`/patients/${patientId}/implants`,{method:'POST',body:JSON.stringify(input)}),
  updateImplant:(id:string,input:Record<string,unknown>)=>request<ImplantRecord>(`/implants/${id}`,{method:'PUT',body:JSON.stringify(input)}),
  trace:(code:string)=>request<ImplantRecord[]>(`/implants/traceability/${encodeURIComponent(code)}`),
  prostheses:(patientId:string)=>request<ProsthesisRecord[]>(`/patients/${patientId}/prostheses`),
  createProsthesis:(patientId:string,input:Record<string,unknown>)=>request<ProsthesisRecord>(`/patients/${patientId}/prostheses`,{method:'POST',body:JSON.stringify(input)}),
  updateProsthesis:(id:string,input:Record<string,unknown>)=>request<ProsthesisRecord>(`/prostheses/${id}`,{method:'PUT',body:JSON.stringify(input)}),
  addProsthesisHistory:(id:string,input:Record<string,unknown>)=>request(`/prostheses/${id}/history`,{method:'POST',body:JSON.stringify(input)}),
}
