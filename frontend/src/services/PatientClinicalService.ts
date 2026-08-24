import type {
  ClinicalEvolutionEntry,
  OdontogramMark,
  PatientProfile,
  PlannedTreatmentItem,
} from "../types/patientClinical";

const PATIENTS_KEY = "dentalpos.clinical.patients.v2";
const patientKey = (id: string, suffix: string) => `dentalpos.clinical.${id}.${suffix}.v2`;

const seedPatients: PatientProfile[] = [
  { id:"p-joao", fullName:"João da Silva", phone:"(44) 99999-0001", treatment:"Implantodontia", lastAppointment:"01/08/2026", status:"Ativo", gender:"Masculino", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() },
  { id:"p-maria", fullName:"Maria Oliveira", phone:"(44) 99999-0002", treatment:"Ortodontia", lastAppointment:"30/07/2026", status:"Em acompanhamento", gender:"Feminino", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() },
  { id:"p-carlos", fullName:"Carlos Pereira", phone:"(44) 99999-0003", treatment:"Prótese Dentária", lastAppointment:"25/07/2026", status:"Ativo", gender:"Masculino", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() },
  { id:"p-ana", fullName:"Ana Costa", phone:"(44) 99999-0004", treatment:"Harmonização Orofacial", lastAppointment:"10/05/2026", status:"Inativo", gender:"Feminino", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() },
];

function read<T>(key:string, fallback:T):T { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } }
function write<T>(key:string, value:T) { localStorage.setItem(key, JSON.stringify(value)); window.dispatchEvent(new CustomEvent("dentalpos:clinical-data-changed")); }

export function listPatients(): PatientProfile[] {
  const rows = read<PatientProfile[]>(PATIENTS_KEY, []);
  if (rows.length) return rows;
  write(PATIENTS_KEY, seedPatients);
  return seedPatients;
}

export function getPatient(idOrName:string):PatientProfile|undefined {
  const v = decodeURIComponent(idOrName).toLowerCase();
  return listPatients().find(p=>p.id.toLowerCase()===v || p.fullName.toLowerCase()===v);
}

export function savePatient(input: Omit<PatientProfile,"id"|"createdAt"|"updatedAt"> & {id?:string}):PatientProfile {
  const rows=listPatients(); const now=new Date().toISOString();
  const existing=input.id ? rows.find(p=>p.id===input.id) : undefined;
  const row:PatientProfile={...input,id:input.id||`p-${Date.now()}`,createdAt:existing?.createdAt||now,updatedAt:now};
  const next=existing?rows.map(p=>p.id===row.id?row:p):[row,...rows]; write(PATIENTS_KEY,next); return row;
}

export function listOdontogram(patientId:string):OdontogramMark[]{ return read(patientKey(patientId,"odontogram"),[]); }
export function saveOdontogram(patientId:string, marks:OdontogramMark[]){ write(patientKey(patientId,"odontogram"),marks); }
export function listEvolutions(patientId:string):ClinicalEvolutionEntry[]{ return read(patientKey(patientId,"evolutions"),[]); }
export function saveEvolution(patientId:string, evolution:ClinicalEvolutionEntry){ const next=[evolution,...listEvolutions(patientId)]; write(patientKey(patientId,"evolutions"),next); }
export function listTreatmentItems(patientId:string):PlannedTreatmentItem[]{ return read(patientKey(patientId,"treatment-items"),[]); }
export function saveTreatmentItems(patientId:string, items:PlannedTreatmentItem[]){ write(patientKey(patientId,"treatment-items"),items); }

export function syncTreatmentFromOdontogram(patientId:string, marks:OdontogramMark[]) {
  const existing=listTreatmentItems(patientId);
  const byMark=new Map(existing.filter(x=>x.origin==="Odontograma").map(x=>[x.id,x]));
  const manual=existing.filter(x=>x.origin!=="Odontograma");
  const generated=marks.map(m=>{
    const id=`odontogram-${m.id}`; const previous=byMark.get(id);
    return { id, patientId, tooth:m.tooth, surfaces:m.surface?[m.surface]:undefined, procedure:m.finding, status:m.state==="done"?"Concluído":(previous?.status==="Em tratamento"?"Em tratamento":"Planejado"), origin:"Odontograma", createdAt:previous?.createdAt||m.createdAt, completedAt:m.state==="done"?(m.completedAt||new Date().toISOString()):undefined } as PlannedTreatmentItem;
  });
  saveTreatmentItems(patientId,[...generated,...manual]);
}

export function completeMarksForEvolution(patientId:string, markIds:string[], evolutionId:string):OdontogramMark[]{
  const now=new Date().toISOString();
  const marks=listOdontogram(patientId).map(m=>markIds.includes(m.id)?{...m,state:"done" as const,updatedAt:now,completedAt:now,sourceEvolutionId:evolutionId}:m);
  saveOdontogram(patientId,marks); syncTreatmentFromOdontogram(patientId,marks); return marks;
}
