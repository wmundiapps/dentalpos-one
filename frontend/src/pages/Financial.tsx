import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment, MenuItem, Paper, TextField, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlinedIcon from "@mui/icons-material/Delete";
import PaymentsIcon from "@mui/icons-material/Payments";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import PageHeader from "../components/PageHeader";
import { providerLabel } from "../utils/providerLabels";
import { isWmundiStaff } from "../components/WmundiStaffOnly";
import { readSessionUser } from "../services/DemoAccess";
import { enqueueCollection } from "../services/RevahQueueService";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  cancelFinancialEntry,
  createFinancialEntry,
  issuerEntityLabels,
  loadFinancialEntries,
  settleFinancialEntry,
  type FinancialEntry,
  type FinancialEntryType,
  type IssuerEntity,
  type PaymentMethod,
  type PaymentProvider,
} from "../services/FinancialApi";
import FinancialPlanningPanel from "../components/FinancialPlanningPanel";
import { createRecurringBill, frequencyLabels } from "../services/FinancialPlanningApi";

const money=(v:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v||0);
const brDate=(iso:string)=>iso?new Date(iso).toLocaleDateString("pt-BR"):"—";

type DisplayStatus = "Pago" | "Vencido" | "Pendente" | "Cancelado";

function displayStatus(entry: FinancialEntry): DisplayStatus {
  if (entry.status === "PAID") return "Pago";
  if (entry.status === "CANCELLED") return "Cancelado";
  const today = new Date().toISOString().slice(0, 10);
  return entry.dueDate.slice(0, 10) < today ? "Vencido" : "Pendente";
}

const statusColor=(s:DisplayStatus):"success"|"error"|"warning"|"default"=>s==="Pago"?"success":s==="Vencido"?"error":s==="Pendente"?"warning":"default";
const typeLabel=(t:FinancialEntryType)=>t==="INCOME"?"Receita":"Despesa";

export default function Financial(){
 const navigate=useNavigate();
 const [searchParams]=useSearchParams();
 const initialType=searchParams.get("tipo");
 const initialPatient=searchParams.get("paciente")||"";
 const [entries,setEntries]=useState<FinancialEntry[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [open,setOpen]=useState(false);
 const [saving,setSaving]=useState(false);const [planKey,setPlanKey]=useState(0);
const [settleTarget,setSettleTarget]=useState<FinancialEntry|null>(null);
const [settleForm,setSettleForm]=useState({paymentMethod:"PIX",paidAt:"",paymentReceipt:"",note:""});
const [settleBusy,setSettleBusy]=useState(false);
const [settleError,setSettleError]=useState("");
const receiptOptional=["Dinheiro","Permuta"].includes(settleForm.paymentMethod);
const settleUser=readSessionUser();
const settleUserLabel=[settleUser?.firstName,settleUser?.lastName].filter(Boolean).join(" ")||settleUser?.email||"Usuário conectado";
 const [filter,setFilter]=useState(initialType==="Receita"||initialType==="Despesa"?initialType:"Todos");
 const [search,setSearch]=useState(initialPatient);
 const [quick,setQuick]=useState<string>(searchParams.get("situacao")||"");
 const [form,setForm]=useState({description:"",category:"",personName:"",type:"Despesa" as "Receita"|"Despesa",value:"",dueDate:"",competenceDate:"",paymentMethod:"Transferência" as PaymentMethod,provider:"Manual" as PaymentProvider,issuerEntity:"INSTITUTO_RAVEL" as IssuerEntity,notes:"",autoDebit:false,recurring:false,frequency:"MONTHLY",occurrences:"",endDate:"",amountIsVariable:false});

 const refresh=async()=>{
   setLoading(true);setError("");setPlanKey(k=>k+1);
   try{setEntries(await loadFinancialEntries())}
   catch(e){setError(e instanceof Error?e.message:"Erro ao carregar financeiro.")}
   finally{setLoading(false)}
 };
 useEffect(()=>{void refresh()},[]);
 useEffect(()=>{const type=searchParams.get("tipo");const patient=searchParams.get("paciente");if(type==="Receita"||type==="Despesa")setFilter(type);if(patient)setSearch(patient)},[searchParams]);

 const totals=useMemo(()=>{
   const valid=entries.filter(e=>e.status!=="CANCELLED");
   const paidIncome=valid.filter(e=>e.type==="INCOME"&&e.status==="PAID").reduce((a,e)=>a+e.amount,0);
   const paidExpense=valid.filter(e=>e.type==="EXPENSE"&&e.status==="PAID").reduce((a,e)=>a+e.amount,0);
   const receivable=valid.filter(e=>e.type==="INCOME"&&e.status!=="PAID").reduce((a,e)=>a+e.amount,0);
   const payable=valid.filter(e=>e.type==="EXPENSE"&&e.status!=="PAID").reduce((a,e)=>a+e.amount,0);
   const overdue=valid.filter(e=>displayStatus(e)==="Vencido").reduce((a,e)=>a+e.amount,0);
   return{receivable,payable,cash:paidIncome-paidExpense,overdue};
 },[entries]);

 const visible=useMemo(()=>entries.filter(e=>{
   const status=displayStatus(e);
   const matchesFilter=filter==="Todos"||status===filter||typeLabel(e.type)===filter;
   const matchesSearch=!search||`${e.description} ${e.personName} ${e.category} ${e.origin||""}`.toLowerCase().includes(search.toLowerCase());
   const matchesQuick=!quick||(quick==="RECEBER"?(e.type==="INCOME"&&e.status!=="PAID"&&e.status!=="CANCELLED"):quick==="PAGAR"?(e.type==="EXPENSE"&&e.status!=="PAID"&&e.status!=="CANCELLED"):quick==="CAIXA"?e.status==="PAID":quick==="VENCIDO"?status==="Vencido":true);
   return matchesFilter&&matchesSearch&&matchesQuick;
 }),[entries,filter,search,quick]);

 const parseBRL=(raw:string):number=>{const s=raw.replace(/[^\d.,]/g,"");if(!s)return NaN;const sep=Math.max(s.lastIndexOf(","),s.lastIndexOf("."));const tail=sep>=0?s.slice(sep+1):"";if(sep>=0&&tail.length>0&&tail.length<=2)return Math.round(Number(`${s.slice(0,sep).replace(/[.,]/g,"")}.${tail}`)*100)/100;return Number(s.replace(/[.,]/g,""));};
const formatBRL=(raw:string)=>{const n=parseBRL(raw);return n>0?n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}):raw;};
const add=async()=>{
   if(!form.description.trim()||!form.personName.trim()||!(parseBRL(form.value)>0)||!form.dueDate)return;
   setSaving(true);setError("");
   try{
     if(form.recurring){await createRecurringBill({type:form.type==="Receita"?"INCOME":"EXPENSE",description:form.description.trim(),category:form.category.trim()||"Geral",personName:form.personName.trim(),amount:parseBRL(form.value),dueDay:Number(form.dueDate.slice(8,10)),startDate:form.dueDate+"T12:00:00-03:00",frequency:form.frequency,occurrences:form.occurrences?Number(form.occurrences):null,endDate:form.endDate?form.endDate+"T12:00:00-03:00":null,autoDebit:form.autoDebit,amountIsVariable:form.amountIsVariable,paymentMethod:form.paymentMethod,notes:form.notes||undefined});}else await createFinancialEntry({
       description:form.description.trim(),
       category:form.category.trim()||"Geral",
       personName:form.personName.trim(),
       type:form.type==="Receita"?"INCOME":"EXPENSE",
       amount:parseBRL(form.value),
       dueDate:form.dueDate,
       competenceDate:form.competenceDate||undefined,
       paymentMethod:form.paymentMethod,
       provider:form.provider,
       issuerEntity:form.issuerEntity,...({autoDebit:form.autoDebit} as any),
       notes:form.notes||undefined,
     });
     await refresh();
     setOpen(false);
     setForm({description:"",category:"",personName:"",type:"Despesa",value:"",dueDate:"",competenceDate:"",paymentMethod:"Transferência",provider:"Manual",issuerEntity:"INSTITUTO_RAVEL",notes:"",autoDebit:false,recurring:false,frequency:"MONTHLY",occurrences:"",endDate:"",amountIsVariable:false});
   }catch(e){setError(e instanceof Error?e.message:"Erro ao salvar lançamento.")}
   finally{setSaving(false)}
 };
 const changeStatus=async(entry:FinancialEntry,status:"Pago"|"Cancelado")=>{
   try{
     if(status==="Pago"){openSettle(entry);return;}
     else await cancelFinancialEntry(entry.id);
     await refresh();
   }catch(e){setError(e instanceof Error?e.message:"Erro ao atualizar lançamento.")}
 };
 const openSettle=(entry:FinancialEntry)=>{setSettleTarget(entry);setSettleForm({paymentMethod:entry.paymentMethod||"PIX",paidAt:new Date().toLocaleDateString("sv-SE"),paymentReceipt:"",note:""});setSettleError("");};
const confirmSettle=async()=>{
  if(!settleTarget)return;
  const today=new Date().toLocaleDateString("sv-SE");
  if(!settleForm.paidAt){setSettleError("Informe a data do pagamento.");return;}
  if(settleForm.paidAt>today){setSettleError("A data do pagamento não pode ser futura.");return;}
  if(!receiptOptional&&!settleForm.paymentReceipt.trim()){setSettleError("Informe o número do comprovante.");return;}
  setSettleBusy(true);setSettleError("");
  try{
    await settleFinancialEntry(settleTarget.id,{paymentMethod:settleForm.paymentMethod,paidAt:`${settleForm.paidAt}T12:00:00-03:00`,paymentReceipt:settleForm.paymentReceipt.trim()||undefined,settlementNote:settleForm.note.trim()||undefined});
    setSettleTarget(null);
    await refresh();
  }catch(e){setSettleError(e instanceof Error?e.message:"Erro ao dar baixa.")}
  finally{setSettleBusy(false)}
};
const remove=async(entry:FinancialEntry)=>{
   if(!window.confirm("Cancelar este lançamento?"))return;
   try{await cancelFinancialEntry(entry.id);await refresh()}
   catch(e){setError(e instanceof Error?e.message:"Erro ao cancelar lançamento.")}
 };
 const sendCollection=(e:FinancialEntry)=>{enqueueCollection({financeId:e.id,patientName:e.personName,amount:e.amount,dueDate:e.dueDate,paymentMethod:e.paymentMethod||undefined});alert("Cobrança adicionada à fila do REVAH. As mensagens serão interrompidas quando a parcela for baixada no fluxo de integração.")};
 const paymentCode=(e:FinancialEntry,kind:"PIX"|"Boleto")=>{const code=`DENTALPOS-${kind}-${e.id}-${Math.round(e.amount*100)}`;navigator.clipboard?.writeText(code);alert(`${kind} preparado para integração com ${e.provider||"provedor"}. Código de teste copiado: ${code}`)};
 const exportCsv=()=>{
   const head=["Paciente/Pessoa","Descrição","Tipo","Status","Valor","Vencimento","Forma","Provedor","Razão social"];
   const rows=visible.map(e=>[e.personName,e.description,typeLabel(e.type),displayStatus(e),e.amount,e.dueDate,e.paymentMethod||"",e.provider||"",e.issuerEntity?issuerEntityLabels[e.issuerEntity]:""]);
   const csv=[head,...rows].map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(";")).join("\n");
   const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["﻿"+csv],{type:"text/csv;charset=utf-8"}));a.download="dentalpos-financeiro.csv";a.click();URL.revokeObjectURL(a.href);
 };

 return <Box><PageHeader title="Financeiro" description="Contas a pagar/receber, caixa realizado, vencimentos e integração com orçamentos e recebimentos." actionLabel="Novo lançamento" actionIcon={<AddIcon/>} onAction={()=>setOpen(true)}/>
 {error&&<Paper variant="outlined" sx={{p:2,mb:2,borderColor:"error.main"}}><Typography color="error">{error}</Typography></Paper>}
 <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",md:"repeat(4,1fr)"},gap:2,mb:3}}>{[["A receber",totals.receivable,<PaymentsIcon key="i1"/>,"RECEBER"],["A pagar",totals.payable,<PaymentsIcon key="i2"/>,"PAGAR"],["Caixa realizado",totals.cash,<AccountBalanceWalletIcon key="i3"/>,"CAIXA"],["Total vencido",totals.overdue,<PaymentsIcon key="i4"/>,"VENCIDO"]].map(([t,v,i,k])=><Paper key={String(t)} onClick={()=>{const nk=quick===k?"":String(k);setQuick(nk);setFilter("Todos");if(nk)setTimeout(()=>document.getElementById("lista-lancamentos")?.scrollIntoView({behavior:"smooth",block:"start"}),60);}} sx={{p:2.5,borderRadius:3,cursor:"pointer",border:"2px solid",borderColor:quick===k?"primary.main":"transparent"}}><Box sx={{display:"flex",justifyContent:"space-between",gap:2}}><Box><Typography color="text.secondary">{t}</Typography><Typography variant="h5" sx={{fontWeight:900}}>{money(Number(v))}</Typography></Box>{i}</Box></Paper>)}</Box>
 <Paper variant="outlined" sx={{p:2,mb:2,borderRadius:3}}><Box sx={{display:"flex",gap:1,flexWrap:"wrap",alignItems:"center"}}><Button variant="contained" onClick={()=>navigate("/pagamentos")}>Central de cobrança</Button><Button onClick={()=>navigate("/integracoes")}>Integrações</Button><Button onClick={()=>navigate("/financeiro/digitalizar")}>Digitalizar conta/nota</Button><Button onClick={()=>navigate("/revah")}>Cobranças REVAH</Button></Box></Paper><FinancialPlanningPanel reloadKey={planKey} onChanged={()=>void refresh()}/><Box sx={{display:"flex",gap:1,mb:2,flexWrap:"wrap",alignItems:"center"}}><TextField size="small" placeholder="Buscar lançamento..." value={search} onChange={e=>setSearch(e.target.value)} sx={{minWidth:280}}/>{["Todos","Pendente","Vencido","Pago","Receita","Despesa"].map(x=><Chip key={x} label={x} color={filter===x?"primary":"default"} onClick={()=>setFilter(x)}/>)}<Button onClick={exportCsv}>Exportar CSV</Button></Box>
 <Box id="lista-lancamentos" sx={{scrollMarginTop:80}}/>{quick&&<Alert severity="info" sx={{mb:1,borderRadius:3}} action={<Button color="inherit" size="small" onClick={()=>setQuick("")}>Mostrar todos</Button>}><b>{({RECEBER:"A receber",PAGAR:"A pagar",CAIXA:"Caixa realizado",VENCIDO:"Total vencido"} as Record<string,string>)[quick]||quick}</b>{` \u2014 ${visible.length} lan\u00e7amento(s) \u2022 ${money(visible.reduce((a,e)=>a+(quick==="CAIXA"&&e.type==="EXPENSE"?-e.amount:e.amount),0))}${quick==="CAIXA"?" (recebido menos pago)":""}`}</Alert>}<Paper sx={{overflow:"hidden",borderRadius:3}}>{loading?<Typography sx={{p:3}} color="text.secondary">Carregando...</Typography>:visible.length===0?<Typography sx={{p:3}} color="text.secondary">Nenhum lançamento encontrado.</Typography>:visible.map(e=>{const status=displayStatus(e);return <Box key={e.id} sx={{display:"grid",gridTemplateColumns:{xs:"1fr",md:"2fr 1fr .8fr .8fr auto"},gap:2,p:2,borderBottom:"1px solid",borderColor:"divider",alignItems:"center"}}><Box><Typography sx={{fontWeight:800}}>{e.description}</Typography>{((e as any).autoDebit||(e as any).recurringBillId)&&<Box sx={{display:"flex",gap:.5,my:.5,flexWrap:"wrap"}}>{(e as any).autoDebit&&<Chip size="small" label={"D\u00e9bito autom\u00e1tico"}/>}{(e as any).recurringBillId&&<Chip size="small" variant="outlined" label="Recorrente"/>}</Box>}<Typography variant="body2" color="text.secondary">{e.personName} • {e.category} • {e.origin||"Manual"}{e.paymentMethod?` • ${e.paymentMethod}`:""}{e.provider?` / ${providerLabel(e.provider)}`:""}{isWmundiStaff()&&e.issuerEntity?` • ${issuerEntityLabels[e.issuerEntity]}`:""}</Typography>{e.status==="PAID"&&<Typography variant="caption" color="success.main" sx={{display:"block",fontWeight:700}}>{`Pago em ${e.paidAt?new Date(e.paidAt).toLocaleDateString("pt-BR"):"-"}${e.paymentMethod?` via ${e.paymentMethod}`:""}${e.settledByName?` por ${e.settledByName}`:""}${e.paymentReceipt?` • comprovante ${e.paymentReceipt}`:""}`}</Typography>}</Box><Typography sx={{fontWeight:800}} color={e.type==="INCOME"?"success.main":"error.main"}>{e.type==="EXPENSE"?"− ":"+ "}{money(e.amount)}</Typography><Typography>{brDate(e.dueDate)}</Typography><Chip size="small" label={status} color={statusColor(status)}/><Box sx={{display:"flex",gap:.5,flexWrap:"wrap"}}>{e.type==="INCOME"&&status!=="Pago"&&status!=="Cancelado"&&<><Button size="small" onClick={()=>sendCollection(e)}>REVAH</Button>{e.provider==="Asaas"&&<><Button size="small" onClick={()=>paymentCode(e,"PIX")}>PIX</Button><Button size="small" onClick={()=>paymentCode(e,"Boleto")}>Boleto</Button></>}</>}{status!=="Pago"&&status!=="Cancelado"&&<Button size="small" onClick={()=>changeStatus(e,"Pago")}>Baixar</Button>}{status!=="Cancelado"&&status!=="Pago"&&<Button size="small" color="inherit" onClick={()=>changeStatus(e,"Cancelado")}>Cancelar</Button>}<Tooltip title="Excluir"><IconButton size="small" onClick={()=>remove(e)}><DeleteOutlinedIcon fontSize="small"/></IconButton></Tooltip></Box></Box>})}</Paper>
 <Dialog open={open} onClose={()=>setOpen(false)} fullWidth maxWidth="sm"><DialogTitle>Novo lançamento</DialogTitle><DialogContent sx={{display:"grid",gap:2,pt:"12px!important"}}><TextField required label="Descrição" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/><TextField required label="Pessoa / fornecedor / paciente" value={form.personName} onChange={e=>setForm({...form,personName:e.target.value})}/><TextField label="Categoria" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/><TextField select label="Tipo" value={form.type} onChange={e=>setForm({...form,type:e.target.value as "Receita"|"Despesa"})}><MenuItem value="Receita">Receita</MenuItem><MenuItem value="Despesa">Despesa</MenuItem></TextField><TextField required label="Valor (R$)" placeholder="Ex.: 1.250,90" value={form.value} onChange={e=>setForm({...form,value:e.target.value.replace(/[^\d.,]/g,"")})} onBlur={()=>setForm(f=>({...f,value:formatBRL(f.value)}))} error={form.value!==""&&!(parseBRL(form.value)>0)} helperText={form.value!==""&&!(parseBRL(form.value)>0)?"Informe um valor maior que zero":"Pode digitar com vírgula. Ex.: 1.250,90"} slotProps={{htmlInput:{inputMode:"decimal"},input:{startAdornment:<InputAdornment position="start">R$</InputAdornment>}}}/><Box sx={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:2}}><TextField required label="Vencimento" type="date" slotProps={{inputLabel:{shrink:true}}} value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})}/><TextField label="Competência" type="date" slotProps={{inputLabel:{shrink:true}}} value={form.competenceDate} onChange={e=>setForm({...form,competenceDate:e.target.value})}/></Box><Box sx={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:2}}><TextField select label="Forma" value={form.paymentMethod} onChange={e=>setForm({...form,paymentMethod:e.target.value as PaymentMethod})}>{["PIX","Cartão","Boleto","Transferência","Dinheiro","Promissória","Permuta","Cheque"].map(x=><MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField><TextField select label="Recebimento via" value={form.provider} onChange={e=>setForm({...form,provider:e.target.value as PaymentProvider})}>{["Asaas","Stripe","Banco / Open Finance","Manual"].map(x=><MenuItem key={x} value={x}>{providerLabel(x)}</MenuItem>)}</TextField></Box>{isWmundiStaff()&&<TextField select label="Razão social emissora" value={form.issuerEntity} onChange={e=>setForm({...form,issuerEntity:e.target.value as IssuerEntity})} helperText="Consultas, tratamentos e assinaturas saem pelo Instituto Ravel. Venda de material (DentalPos Sales) sai pela Tecnoimplante.">{(Object.keys(issuerEntityLabels) as IssuerEntity[]).map(x=><MenuItem key={x} value={x}>{issuerEntityLabels[x]}</MenuItem>)}</TextField>}<FormControlLabel control={<Checkbox checked={form.autoDebit} onChange={e=>setForm({...form,autoDebit:e.target.checked})}/>} label={"D\u00e9bito autom\u00e1tico: continua no relat\u00f3rio do m\u00eas e recebe baixa autom\u00e1tica no vencimento"}/><FormControlLabel control={<Checkbox checked={form.recurring} onChange={e=>setForm({...form,recurring:e.target.checked})}/>} label={"Conta recorrente (repete a partir do vencimento informado)"}/>{form.recurring&&<Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",sm:"1fr 1fr 1fr"},gap:2}}><TextField select label="Periodicidade" value={form.frequency} onChange={e=>setForm({...form,frequency:e.target.value})}>{Object.entries(frequencyLabels).map(([v,l])=><MenuItem key={v} value={v}>{l}</MenuItem>)}</TextField><TextField label="Quantas vezes" value={form.occurrences} onChange={e=>setForm({...form,occurrences:e.target.value.replace(/\D/g,"")})} helperText="Vazio = sem fim" slotProps={{htmlInput:{inputMode:"numeric"}}}/><TextField label={"At\u00e9 (opcional)"} type="date" slotProps={{inputLabel:{shrink:true}}} value={form.endDate} onChange={e=>setForm({...form,endDate:e.target.value})}/></Box>}{form.recurring&&<FormControlLabel control={<Checkbox checked={form.amountIsVariable} onChange={e=>setForm({...form,amountIsVariable:e.target.checked})}/>} label={"Valor vari\u00e1vel (energia, \u00e1gua): lembrar de confirmar o valor todo m\u00eas"}/>}<TextField multiline minRows={2} label="Observações" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></DialogContent><DialogActions><Button onClick={()=>setOpen(false)}>Cancelar</Button><Button variant="contained" disabled={saving} onClick={add}>{saving?"Salvando...":"Salvar lançamento"}</Button></DialogActions></Dialog>
<Dialog open={Boolean(settleTarget)} onClose={()=>{if(!settleBusy)setSettleTarget(null)}} fullWidth maxWidth="xs">
<DialogTitle>{"Dar baixa no lançamento"}</DialogTitle>
<DialogContent sx={{display:"grid",gap:2,pt:"12px!important"}}>
{settleTarget&&<Box sx={{p:1.5,borderRadius:2,bgcolor:"action.hover"}}><Typography sx={{fontWeight:800}}>{settleTarget.description}</Typography><Typography variant="body2" color="text.secondary">{`${settleTarget.personName} • ${money(settleTarget.amount)}`}</Typography></Box>}
<TextField label="Baixa registrada por" value={settleUserLabel} slotProps={{input:{readOnly:true}}} helperText={"Preenchido automaticamente com o usuário conectado."}/>
<TextField select label="Forma de pagamento" value={settleForm.paymentMethod} onChange={e=>setSettleForm({...settleForm,paymentMethod:e.target.value})}>{["PIX","Cartão","Boleto","Transferência","Dinheiro","Promissória","Permuta","Cheque"].map(x=><MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField>
<TextField required label="Data do pagamento" type="date" value={settleForm.paidAt} onChange={e=>setSettleForm({...settleForm,paidAt:e.target.value})} slotProps={{inputLabel:{shrink:true},htmlInput:{max:new Date().toLocaleDateString("sv-SE")}}}/>
<TextField required={!receiptOptional} label={"Número do comprovante"} placeholder={"Ex.: ID da transação PIX, NSU do cartão"} value={settleForm.paymentReceipt} onChange={e=>setSettleForm({...settleForm,paymentReceipt:e.target.value})} helperText={receiptOptional?"Opcional para dinheiro e permuta.":"Obrigatório para conferência."}/>
<TextField multiline minRows={2} label={"Observação (opcional)"} value={settleForm.note} onChange={e=>setSettleForm({...settleForm,note:e.target.value})}/>
{settleError&&<Alert severity="error">{settleError}</Alert>}
</DialogContent>
<DialogActions><Button disabled={settleBusy} onClick={()=>setSettleTarget(null)}>Cancelar</Button><Button variant="contained" color="success" disabled={settleBusy} onClick={()=>void confirmSettle()}>{settleBusy?"Salvando...":"Confirmar baixa"}</Button></DialogActions>
</Dialog>
</Box>;
}
