import type { Response } from 'express'
import type { AuthRequest } from '../middleware/auth'
import type { LaboratoryAlertKind } from '../types/laboratoryAlertResolution'
import { beginLaboratoryAlertTreatment, getLaboratoryPendingState, resolveLaboratoryAlert } from '../services/laboratoryAlertResolutionService'
import { validateLaboratoryResolution } from '../validation/laboratoryAlertResolutionValidation'
import { ValidationError } from '../validation/specialtyClinicalValidation'

const scope = (req: AuthRequest) => ({clinicId:req.user!.clinicId,tenantId:req.user!.tenantId,actorId:req.user!.id,ipAddress:req.ip,userAgent:req.get('user-agent')})
const fail = (res: Response, e: unknown) => e instanceof ValidationError ? res.status(400).json({error:e.message}) : (console.error('[lab-alert-resolution]',e),res.status(500).json({error:'Erro ao tratar pendência laboratorial'}))
const kind = (v: unknown): LaboratoryAlertKind => String(v||'LABORATORY_OVERDUE') === 'LABORATORY_AT_RISK' ? 'LABORATORY_AT_RISK' : 'LABORATORY_OVERDUE'

export async function pendingState(req:AuthRequest,res:Response){try{return res.json(await getLaboratoryPendingState(String(req.params.id),kind(req.query.kind),scope(req)))}catch(e){return fail(res,e)}}
export async function beginTreatment(req:AuthRequest,res:Response){try{return res.json(await beginLaboratoryAlertTreatment(String(req.params.id),kind(req.body?.alertKind),String(req.body?.note||'').trim()||null,scope(req)))}catch(e){return fail(res,e)}}
export async function resolvePending(req:AuthRequest,res:Response){try{return res.json(await resolveLaboratoryAlert(String(req.params.id),validateLaboratoryResolution(req.body),scope(req)))}catch(e){return fail(res,e)}}
