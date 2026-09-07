import type { FinancialAlertAction, FinancialAlertResolution, FinancialSourceEntity } from '../types/financialAlertResolution'

const API=import.meta.env.VITE_API_URL||'http://localhost:3000/api'
function headers(json=false){const token=localStorage.getItem('dentalpos.token')||'';const clinicId=localStorage.getItem('dentalpos.clinicId')||'';return{Authorization:`Bearer ${token}`,...(clinicId?{'X-Clinic-ID':clinicId}:{}),...(json?{'Content-Type':'application/json'}:{})}}
async function parse<T>(r:Response):Promise<T>{const b=await r.json().catch(()=>null);if(!r.ok)throw new Error(b?.error||`Erro HTTP ${r.status}`);return b as T}

export async function listFinancialAlertResolutionStates(ids?:string[]){const q=ids?.length?`?ids=${encodeURIComponent(ids.join(','))}`:'';return fetch(`${API}/financial-alert-resolutions${q}`,{headers:headers()}).then(parse<FinancialAlertResolution[]>)}
export async function markFinancialAlertInProgress(input:{sourceEntityType:FinancialSourceEntity;sourceEntityId:string}){return fetch(`${API}/financial-alert-resolutions/in-progress`,{method:'POST',headers:headers(true),body:JSON.stringify(input)}).then(parse<FinancialAlertResolution>)}
export async function resolveFinancialAlertFromOperation(input:{sourceEntityType:FinancialSourceEntity;sourceEntityId:string;action:Exclude<FinancialAlertAction,'MARK_IN_PROGRESS'>;reason?:string;replacementEntityType?:FinancialSourceEntity;replacementEntityId?:string;metadata?:Record<string,unknown>}){return fetch(`${API}/financial-alert-resolutions/resolve`,{method:'POST',headers:headers(true),body:JSON.stringify(input)}).then(parse<FinancialAlertResolution>)}
