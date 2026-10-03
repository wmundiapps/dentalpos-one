import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { encryptSecret } from '../services/secretVault'
import { providerFor, type RevahChannel } from '../services/revahProviderService'
const ctx=(req:AuthRequest)=>({clinicId:req.user!.clinicId,tenantId:req.user!.tenantId})
export async function index(req:AuthRequest,res:Response){res.json(await prisma.revahSender.findMany({where:ctx(req),select:{id:true,unitId:true,channel:true,provider:true,label:true,address:true,isDefault:true,isActive:true,settings:true,createdAt:true,updatedAt:true},orderBy:[{channel:'asc'},{label:'asc'}]}))}
export async function upsert(req:AuthRequest,res:Response){
 try{
  const c=ctx(req);const b=req.body||{}
  const channel=String(b.channel||'').toUpperCase(),address=String(b.address||'').trim()
  if(!['WHATSAPP','SMS','EMAIL','TELEGRAM','VOICE'].includes(channel))return res.status(400).json({error:'Canal inválido.'})
  if(!address)return res.status(400).json({error:'Informe o número ou endereço do canal.'})
  // O provedor sai do canal (a tela não envia): evita gravar "undefined".
  const provider=String(b.provider&&b.provider!=='undefined'?b.provider:providerFor(channel as RevahChannel))
  const label=String(b.label||'').trim()||`${channel} da clínica`
  const old=await prisma.revahSender.findUnique({where:{clinicId_channel_address:{clinicId:c.clinicId,channel,address}}})
  if(b.isDefault)await prisma.revahSender.updateMany({where:{...c,channel},data:{isDefault:false}})
  const encryptedCredentials=b.credentials?encryptSecret(b.credentials):undefined
  const row=old
   ?await prisma.revahSender.update({where:{id:old.id},data:{unitId:b.unitId||null,provider,label,isDefault:Boolean(b.isDefault),isActive:b.isActive!==false,settings:b.settings,...(encryptedCredentials?{encryptedCredentials}:{})}})
   :await prisma.revahSender.create({data:{...c,unitId:b.unitId||null,channel,provider,label,address,isDefault:Boolean(b.isDefault),isActive:b.isActive!==false,settings:b.settings,encryptedCredentials}})
  return res.json({...row,encryptedCredentials:undefined})
 }catch(error){
  console.error('Erro ao salvar canal de envio:',error)
  const message=error instanceof Error&&/TENANT_SECRET_MASTER_KEY/.test(error.message)?'A chave de segurança do servidor não está configurada.':'Não foi possível salvar o canal. Tente de novo em instantes.'
  return res.status(500).json({error:message})
 }
}
