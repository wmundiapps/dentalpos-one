import type { ImplantInput, ProsthesisInput, SurgeryInput } from '../types/specialtyClinical'

export class ValidationError extends Error {}
const text = (v: unknown, name: string, required = false) => {
  if (v == null || v === '') { if (required) throw new ValidationError(`${name} é obrigatório`); return null }
  if (typeof v !== 'string') throw new ValidationError(`${name} inválido`)
  const out = v.trim(); if (required && !out) throw new ValidationError(`${name} é obrigatório`)
  return out || null
}
const num = (v: unknown, name: string, min: number, max: number, required = false) => {
  if (v == null || v === '') { if (required) throw new ValidationError(`${name} é obrigatório`); return null }
  const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) throw new ValidationError(`${name} fora do intervalo permitido`)
  return n
}
const tooth = (v: unknown) => v == null || v === '' ? null : num(v, 'Dente', 11, 85) as number
const date = (v: unknown, name: string) => {
  if (v == null || v === '') return null
  const d = new Date(String(v)); if (Number.isNaN(d.getTime())) throw new ValidationError(`${name} inválida`)
  return d.toISOString()
}
const arr = <T>(v: unknown, name: string): T[] => { if (v == null) return []; if (!Array.isArray(v)) throw new ValidationError(`${name} deve ser uma lista`); return v as T[] }

export function validateSurgery(body: Record<string, unknown>, partial = false): Partial<SurgeryInput> {
  const out: Record<string, unknown> = {}
  const put = (k: string, v: unknown) => { if (!partial || Object.prototype.hasOwnProperty.call(body, k)) out[k] = v }
  put('surgeryType', text(body.surgeryType, 'Tipo de cirurgia', !partial)); put('tooth', tooth(body.tooth)); put('region', text(body.region, 'Região'))
  put('diagnosis', text(body.diagnosis, 'Diagnóstico', !partial)); put('planning', text(body.planning, 'Planejamento', !partial)); put('technique', text(body.technique, 'Técnica', !partial))
  for (const k of ['anesthesia','anesthetic','graft','membrane','suture','complications','instructions','professionalId','professionalName','treatmentItemId','clinicalEvolutionId','status','notes']) put(k, text(body[k], k))
  if (!partial || 'medications' in body) put('medications', arr(body.medications, 'Medicamentos')); if (!partial || 'biomaterials' in body) put('biomaterials', arr(body.biomaterials, 'Biomateriais')); if (!partial || 'materialLots' in body) put('materialLots', arr(body.materialLots, 'Lotes'))
  if (!partial || 'surgeryDate' in body) put('surgeryDate', date(body.surgeryDate, 'Data cirúrgica')); if (!partial || 'returnAt' in body) put('returnAt', date(body.returnAt, 'Retorno'))
  if (!partial && out.tooth == null && !out.region) throw new ValidationError('Informe dente ou região')
  return out as Partial<SurgeryInput>
}

export function validateImplant(body: Record<string, unknown>, partial = false): Partial<ImplantInput> {
  const out: Record<string, unknown> = {}; const put = (k:string,v:unknown)=>{ if(!partial || k in body) out[k]=v }
  put('tooth', tooth(body.tooth)); put('region', text(body.region,'Região')); put('brand', text(body.brand,'Marca',!partial)); put('productLine',text(body.productLine,'Linha')); put('connection',text(body.connection,'Conexão',!partial)); put('platform',text(body.platform,'Plataforma'))
  put('diameterMm',num(body.diameterMm,'Diâmetro',1,20,!partial)); put('lengthMm',num(body.lengthMm,'Comprimento',1,40,!partial)); put('lot',text(body.lot,'Lote',!partial)); put('serialNumber',text(body.serialNumber,'Número de série'))
  for(const [k,min,max] of [['insertionTorqueNcm',0,250],['isq',0,100],['transmucosalHeightMm',0,30],['componentTorqueNcm',0,250]] as const) put(k,num(body[k],k,min,max))
  for(const k of ['surgeryCaseId','treatmentItemId','primaryStability','graft','prostheticComponent','healingAbutment','miniPillar','professionalId','professionalName','laboratoryWorkId','notes','complications','traceabilityCode','barcodeValue','qrValue','scanSource']) put(k,text(body[k],k))
  if(!partial || 'installationDate' in body) put('installationDate',date(body.installationDate,'Data de instalação')); if(!partial || 'prostheticDate' in body) put('prostheticDate',date(body.prostheticDate,'Data protética'))
  if(!partial || 'radiographRefs' in body) put('radiographRefs',arr(body.radiographRefs,'Radiografias')); if(!partial || 'traceabilityPayload' in body) put('traceabilityPayload',body.traceabilityPayload && typeof body.traceabilityPayload==='object' ? body.traceabilityPayload : {})
  if(!partial && out.tooth==null && !out.region) throw new ValidationError('Informe dente ou região')
  return out as Partial<ImplantInput>
}

export function validateProsthesis(body: Record<string, unknown>, partial = false): Partial<ProsthesisInput> {
  const out: Record<string, unknown>={}; const put=(k:string,v:unknown)=>{if(!partial || k in body) out[k]=v}
  put('prosthesisType',text(body.prosthesisType,'Tipo de prótese',!partial)); put('material',text(body.material,'Material',!partial)); put('region',text(body.region,'Região'))
  if(!partial || 'teeth' in body) put('teeth',arr<number>(body.teeth,'Dentes').map(v=>tooth(v)).filter(Boolean));
  for(const k of ['treatmentItemId','implantRecordId','laboratoryWorkId','shade','shadeGuide','impressionNotes','scanSystem','provisional','tryIn','framework','ceramic','adjustment','cementation','screw','warrantyTerms','maintenancePlan','status','notes']) put(k,text(body[k],k))
  if(!partial || 'conventionalImpression' in body) put('conventionalImpression',Boolean(body.conventionalImpression)); if(!partial || 'intraoralScan' in body) put('intraoralScan',Boolean(body.intraoralScan)); if(!partial || 'stlFileRefs' in body) put('stlFileRefs',arr(body.stlFileRefs,'Arquivos STL'))
  put('torqueNcm',num(body.torqueNcm,'Torque',0,250)); if(!partial || 'deliveryDate' in body) put('deliveryDate',date(body.deliveryDate,'Data de entrega')); if(!partial || 'warrantyUntil' in body) put('warrantyUntil',date(body.warrantyUntil,'Garantia'))
  if(!partial && (!Array.isArray(out.teeth) || !out.teeth.length) && !out.region) throw new ValidationError('Informe dentes ou região')
  return out as Partial<ProsthesisInput>
}
