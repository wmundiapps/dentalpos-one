export type RevahChannel = 'WHATSAPP'|'SMS'|'EMAIL'|'TELEGRAM'|'VOICE'
export type ProviderResult = { provider:string; providerMessageId?:string; simulated:boolean; raw?:unknown }
export type SenderCredentials = Record<string,any>

export function providerFor(channel:RevahChannel){if(channel==='WHATSAPP')return'Z-API';if(channel==='SMS')return'COMTELE';if(channel==='EMAIL')return'RESEND';if(channel==='TELEGRAM')return'TELEGRAM';return'TWILIO'}
async function parse(r:Response){const t=await r.text();let d:any;try{d=t?JSON.parse(t):{}}catch{d={raw:t}}if(!r.ok)throw new Error(d?.message||d?.error?.message||`HTTP ${r.status}`);return d}
function digits(v:string){return v.replace(/\D/g,'')}
export async function dispatchRevah(channel:RevahChannel,destination:string,content:string,credentials:SenderCredentials={},senderAddress?:string):Promise<ProviderResult>{
 const provider=providerFor(channel); const simulate=credentials.simulated===true || Object.keys(credentials).length===0
 if(simulate)return{provider,simulated:true,providerMessageId:`sim-${Date.now()}`}
 if(channel==='WHATSAPP'){
  const {instanceId,token,clientToken}=credentials; if(!instanceId||!token)throw new Error('Credenciais Z-API incompletas.')
  const d=await parse(await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`,{method:'POST',headers:{'Content-Type':'application/json',...(clientToken?{'Client-Token':String(clientToken)}:{})},body:JSON.stringify({phone:digits(destination),message:content})}))
  return{provider,simulated:false,providerMessageId:d.messageId||d.zaapId||d.id,raw:d}
 }
 if(channel==='SMS'){
  const apiKey=credentials.apiKey; if(!apiKey)throw new Error('API Key Comtele não configurada.')
  const d=await parse(await fetch('https://api.comtele.com.br/messages/sms/send',{method:'POST',headers:{'x-api-key':String(apiKey),'Content-Type':'application/json'},body:JSON.stringify({receivers:[Number(digits(destination))],contactGroups:[],message:content,route:Number(credentials.route||17),tag:credentials.tag||'DentalPos-REVAH',custom:'DentalPos One'})}))
  return{provider,simulated:false,providerMessageId:String(d?.object?.id||d?.id||Date.now()),raw:d}
 }
 if(channel==='EMAIL'){
  const apiKey=credentials.apiKey; if(!apiKey)throw new Error('API Key Resend não configurada.')
  const d=await parse(await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':String(credentials.idempotencyKey||`dentalpos-${Date.now()}`)},body:JSON.stringify({from:senderAddress||credentials.from,to:[destination],subject:credentials.subject||'DentalPos',html:content.replace(/\n/g,'<br/>'),text:content})}))
  return{provider,simulated:false,providerMessageId:d.id,raw:d}
 }
 if(channel==='TELEGRAM'){
  const botToken=credentials.botToken; if(!botToken)throw new Error('Bot Token Telegram não configurado.')
  const d=await parse(await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:destination,text:content})}))
  return{provider,simulated:false,providerMessageId:String(d?.result?.message_id||Date.now()),raw:d}
 }
 const {accountSid,authToken,from}=credentials; if(!accountSid||!authToken||!(from||senderAddress))throw new Error('Credenciais Twilio incompletas.')
 const params=new URLSearchParams({To:destination,From:String(from||senderAddress),Twiml:`<Response><Say language="pt-BR">${content.replace(/[<>&]/g,' ')}</Say></Response>`})
 const d=await parse(await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:params}))
 return{provider,simulated:false,providerMessageId:d.sid,raw:d}
}
