export type RevahQueueChannel="WhatsApp"|"SMS"|"E-mail";
export type RevahQueueStatus="Pendente"|"Enviado"|"Cancelado";
export interface RevahQueueItem{ id:string; kind:"Lembrete de consulta"|"Cobrança"|"Recall"; patientName:string; destination?:string; channel:RevahQueueChannel; message:string; scheduledAtISO:string; status:RevahQueueStatus; originId?:string; createdAtISO:string; }
const KEY="dentalpos.revah.queue.v1";
export function listRevahQueue():RevahQueueItem[]{try{return JSON.parse(localStorage.getItem(KEY)||"[]")}catch{return[]}}
export function saveRevahQueue(rows:RevahQueueItem[]){localStorage.setItem(KEY,JSON.stringify(rows));window.dispatchEvent(new CustomEvent("dentalpos:revah-queue-changed"))}
export function enqueueRevah(input:Omit<RevahQueueItem,"id"|"createdAtISO"|"status">){const rows=listRevahQueue();const duplicate=rows.some(x=>x.originId&&x.originId===input.originId&&x.scheduledAtISO===input.scheduledAtISO&&x.kind===input.kind);if(duplicate)return;saveRevahQueue([{...input,id:crypto.randomUUID(),createdAtISO:new Date().toISOString(),status:"Pendente"},...rows])}
export function setRevahQueueStatus(id:string,status:RevahQueueStatus){saveRevahQueue(listRevahQueue().map(x=>x.id===id?{...x,status}:x))}
export function enqueueAppointmentReminders(input:{appointmentId:number;patientName:string;phone?:string;dateISO:string;time:string;channel:"WhatsApp"|"SMS";reminders?:{onBooking:boolean;oneDayBefore:boolean;onDay:boolean}}){
 const appt=new Date(`${input.dateISO}T${input.time}:00`); const oneDay=new Date(appt);oneDay.setDate(oneDay.getDate()-1);oneDay.setHours(9,0,0,0); const day=new Date(appt);day.setHours(Math.max(7,appt.getHours()-3),0,0,0); const now=new Date();
 const enabled=input.reminders||{onBooking:true,oneDayBefore:true,onDay:true};
 const message=`Olá ${input.patientName}, lembramos sua consulta na clínica em ${input.dateISO.split("-").reverse().join("/")} às ${input.time}.`;
 [{date:now,enabled:enabled.onBooking,index:0},{date:oneDay,enabled:enabled.oneDayBefore,index:1},{date:day,enabled:enabled.onDay,index:2}]
  .filter(item=>item.enabled&&(item.index===0||item.date.getTime()>now.getTime()))
  .forEach(item=>enqueueRevah({kind:"Lembrete de consulta",patientName:input.patientName,destination:input.phone,channel:input.channel,message,scheduledAtISO:item.date.toISOString(),originId:`agenda-${input.appointmentId}-${item.index}`}));
}export function enqueueCollection(input:{financeId:number;patientName:string;phone?:string;amount:number;dueDate:string;channel?:RevahQueueChannel;paymentMethod?:string}){const message=`Olá ${input.patientName}. Há uma parcela de R$ ${input.amount.toLocaleString("pt-BR",{minimumFractionDigits:2})} com vencimento em ${input.dueDate.split("-").reverse().join("/")}. A clínica pode reenviar boleto atualizado ou PIX para pagamento.`;[0,2,5].forEach((days,i)=>{const d=new Date();d.setDate(d.getDate()+days);enqueueRevah({kind:"Cobrança",patientName:input.patientName,destination:input.phone,channel:input.channel||"WhatsApp",message,scheduledAtISO:d.toISOString(),originId:`finance-${input.financeId}-${i}`})})}
