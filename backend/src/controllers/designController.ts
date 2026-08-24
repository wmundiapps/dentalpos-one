import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

export async function index(req:AuthRequest,res:Response){ if(!req.user)return res.status(401).json({error:'Não autenticado.'}); return res.json(await prisma.dentalDesignCase.findMany({where:{clinicId:req.user.clinicId,tenantId:req.user.tenantId},include:{patient:true,laboratoryWork:true},orderBy:{updatedAt:'desc'}})) }
export async function update(req:AuthRequest,res:Response){ if(!req.user)return res.status(401).json({error:'Não autenticado.'}); const row=await prisma.dentalDesignCase.findFirst({where:{id:String(req.params.id),clinicId:req.user.clinicId,tenantId:req.user.tenantId}}); if(!row)return res.status(404).json({error:'Caso não encontrado.'}); const allowed=['selectedTooth','toothCharacter','archShape','primaryFileName','antagonistFileName','biteFileName','activeTool','brushStrength','marginPoints','occlusionState','status','notes']; const data:any={}; for(const k of allowed)if(req.body[k]!==undefined)data[k]=req.body[k]; return res.json(await prisma.dentalDesignCase.update({where:{id:row.id},data})) }
