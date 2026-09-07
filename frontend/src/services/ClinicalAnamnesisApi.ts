import type { ClinicalRecordBundle, ClinicalRecordData, ClinicalRecordRevision, ClinicalRecordStatus } from "../types/clinicalAnamnesis";

const API=import.meta.env.VITE_API_URL||"http://localhost:3000/api";
function headers(json=false){const token=localStorage.getItem("dentalpos.token")||"";const clinicId=localStorage.getItem("dentalpos.clinicId")||"";return{Authorization:`Bearer ${token}`,...(clinicId?{"X-Clinic-ID":clinicId}:{}),...(json?{"Content-Type":"application/json"}:{})}}
async function parse<T>(response:Response):Promise<T>{const body=await response.json().catch(()=>null);if(!response.ok)throw new Error(body?.error||`Erro HTTP ${response.status}`);return body as T}

export function loadClinicalRecord(patientId:string){return fetch(`${API}/patients/${encodeURIComponent(patientId)}/clinical-record`,{headers:headers()}).then(parse<ClinicalRecordBundle>)}
export function loadClinicalRevision(patientId:string,revisionId:string){return fetch(`${API}/patients/${encodeURIComponent(patientId)}/clinical-record/revisions/${encodeURIComponent(revisionId)}`,{headers:headers()}).then(parse<ClinicalRecordRevision>)}
export function saveClinicalRecord(patientId:string,input:{data:ClinicalRecordData;expectedRevision:number;changeReason:string;responsibleProfessionalId?:string|null;responsibleProfessionalName:string;status:ClinicalRecordStatus}){return fetch(`${API}/patients/${encodeURIComponent(patientId)}/clinical-record`,{method:"PUT",headers:headers(true),body:JSON.stringify(input)}).then(parse<{record:ClinicalRecordBundle["record"];revision:ClinicalRecordRevision}>)}
