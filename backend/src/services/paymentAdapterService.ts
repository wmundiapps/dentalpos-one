import { decryptSecret } from './secretVault'

export type PaymentConfig = {
  provider: string
  environment: string
  encryptedCredentials?: string | null
  settings?: unknown
}

export type ChargeInput = {
  amount: number
  method: string
  description: string
  dueDate?: string
  customer: { name: string; email?: string; phone?: string; cpfCnpj?: string }
  installments?: number
  metadata?: Record<string, string>
}

export type ChargeResult = {
  provider: string
  externalId: string
  status: string
  invoiceUrl?: string
  pixQrCode?: string
  pixCopyPaste?: string
  barcode?: string
  digitableLine?: string
  clientSecret?: string
  raw: unknown
}

async function jsonFetch(url:string, init:RequestInit){
  const response=await fetch(url,init)
  const text=await response.text()
  let data:any
  try{data=text?JSON.parse(text):{}}catch{data={raw:text}}
  if(!response.ok) throw new Error(data?.errors?.[0]?.description || data?.error?.message || data?.message || `HTTP ${response.status}`)
  return data
}

export async function createAsaasCharge(config:PaymentConfig,input:ChargeInput):Promise<ChargeResult>{
  const creds=decryptSecret<any>(config.encryptedCredentials) || {}
  const apiKey=creds.apiKey || creds.accessToken
  if(!apiKey) throw new Error('API Key Asaas não configurada.')
  const base=config.environment==='PRODUCTION'?'https://api.asaas.com/v3':'https://api-sandbox.asaas.com/v3'
  const headers={'Content-Type':'application/json','access_token':String(apiKey)}
  const customer=await jsonFetch(`${base}/customers`,{method:'POST',headers,body:JSON.stringify({name:input.customer.name,email:input.customer.email,mobilePhone:input.customer.phone,cpfCnpj:input.customer.cpfCnpj})})
  const map:Record<string,string>={PIX:'PIX',BOLETO:'BOLETO',CARD:'CREDIT_CARD','CARTÃO':'CREDIT_CARD',CARTAO:'CREDIT_CARD'}
  const billingType=map[input.method.toUpperCase()]||'UNDEFINED'
  const body:any={customer:customer.id,billingType,value:input.amount,dueDate:input.dueDate || new Date().toISOString().slice(0,10),description:input.description,externalReference:input.metadata?.originId}
  if((input.installments||1)>1){body.installmentCount=input.installments;body.totalValue=input.amount;delete body.value}
  const payment=await jsonFetch(`${base}/payments`,{method:'POST',headers,body:JSON.stringify(body)})
  let pix:any=null
  if(billingType==='PIX') pix=await jsonFetch(`${base}/payments/${payment.id}/pixQrCode`,{method:'GET',headers})
  let identification:any=null
  if(billingType==='BOLETO'){
    try{identification=await jsonFetch(`${base}/payments/${payment.id}/identificationField`,{method:'GET',headers})}catch{}
  }
  return {provider:'ASAAS',externalId:payment.id,status:payment.status||'PENDING',invoiceUrl:payment.invoiceUrl,pixQrCode:pix?.encodedImage,pixCopyPaste:pix?.payload,barcode:identification?.barCode,digitableLine:identification?.identificationField,raw:{payment,pix,identification}}
}

export async function createStripeCharge(config:PaymentConfig,input:ChargeInput):Promise<ChargeResult>{
  const creds=decryptSecret<any>(config.encryptedCredentials) || {}
  const secretKey=creds.secretKey || creds.apiKey
  if(!secretKey) throw new Error('Secret Key Stripe não configurada.')
  const params=new URLSearchParams()
  params.set('amount',String(Math.round(input.amount*100)))
  params.set('currency',String((creds.currency||'brl')).toLowerCase())
  params.append('payment_method_types[]','card')
  params.set('description',input.description)
  if(input.customer.email) params.set('receipt_email',input.customer.email)
  Object.entries(input.metadata||{}).forEach(([k,v])=>params.set(`metadata[${k}]`,v))
  const payment=await jsonFetch('https://api.stripe.com/v1/payment_intents',{method:'POST',headers:{Authorization:`Bearer ${secretKey}`,'Content-Type':'application/x-www-form-urlencoded'},body:params})
  return {provider:'STRIPE',externalId:payment.id,status:payment.status,clientSecret:payment.client_secret,raw:payment}
}

export async function createCharge(config:PaymentConfig,input:ChargeInput){
  if(config.provider==='ASAAS') return createAsaasCharge(config,input)
  if(config.provider==='STRIPE') return createStripeCharge(config,input)
  throw new Error(`Adapter ${config.provider} ainda não configurado para cobrança automática.`)
}
