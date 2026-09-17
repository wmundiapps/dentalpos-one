import { useEffect, useMemo, useState } from "react";
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, MenuItem, Paper, TextField, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlinedIcon from "@mui/icons-material/Delete";
import PaymentsIcon from "@mui/icons-material/Payments";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import PageHeader from "../components/PageHeader";
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
 const [saving,setSaving]=useState(false);
 const [filter,setFilter]=useState(initialType==="Receita"||initialType==="Despesa"?initialType:"Todos");
 const [search,setSearch]=useState(initialPatient);
 const [form,setForm]=useState({description:"",category:"",personName:"",type:"Despesa" as "Receita"|"Despesa",value:"",dueDate:"",competenceDate:"",paymentMethod:"Transferência" as PaymentMethod,provider:"Manual" as PaymentProvider,issuerEntity:"INSTITUTO_RAVEL" as IssuerEntity,notes:""});

 const refresh=async()=>{
   setLoading(true);setError("");
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
   return matchesFilter&&matchesSearch;
 }),[entries,filter,search]);

 const parseBRL=(raw:string):number=>{const s=raw.replace(/[^\d.,]/g,"");if(!s)return NaN;const sep=Math.max(s.lastIndexOf(","),s.lastIndexOf("."));const tail=sep>=0?s.slice(sep+1):"";if(sep>=0&&tail.length>0&&tail.length<=2)return Math.round(Number(`${s.slice(0,sep).replace(/[.,]/g,"")}.${tail}`)*100)/100;return Number(s.replace(/[.,]/g,""));};
const formatBRL=(raw:string)=>{const n=parseBRL(raw);return n>0?n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}):raw;};
const add=async()=>{
   if(!form.description.trim()||!form.personName.trim()||!(parseBRL(form.value)>0)||!form.dueDate)return;
   setSaving(true);setError("");
   try{
     await createFinancialEntry({
       description:form.description.trim(),
       category:form.category.trim()||"Geral",
       personName:form.personName.trim(),
       type:form.type==="Receita"?"INCOME":"EXPENSE",
       amount:parseBRL(form.value),
       dueDate:form.dueDate,
       competenceDate:form.competenceDate||undefined,
       paymentMethod:form.paymentMethod,
       provider:form.provider,
       issuerEntity:form.issuerEntity,
       notes:form.notes||undefined,
     });
     await refresh();
     setOpen(false);
     setForm({description:"",category:"",personName:"",type:"Despesa",value:"",dueDate:"",competenceDate:"",paymentMethod:"Transferência",provider:"Manual",issuerEntity:"INSTITUTO_RAVEL",notes:""});
   }catch(e){setError(e instanceof Error?e.message:"Erro ao salvar lançamento.")}
   finally{setSaving(false)}
 };
 const changeStatus=async(entry:FinancialEntry,status:"Pago"|"Cancelado")=>{
   try{
     if(status==="Pago")await settleFinancialEntry(entry.id);
     else await cancelFinancialEntry(entry.id);
     await refresh();
   }catch(e){setError(e instanceof Error?e.message:"Erro ao atualizar lançamento.")}
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
   const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));a.download="dentalpos-financeiro.csv";a.click();URL.revokeObjectURL(a.href);
 };

 return <Box><PageHeader title="Financeiro" description="Contas a pagar/receber, caixa realizado, vencimentos e integração com orçamentos e recebimentos." actionLabel="Novo lançamento" actionIcon={<AddIcon/>} onAction={()=>setOpen(true)}/>
 {error&&<Paper variant="outlined" sx={{p:2,mb:2,borderColor:"error.main"}}><Typography color="error">{error}</Typography></Paper>}
 <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",md:"repeat(4,1fr)"},gap:2,mb:3}}>{[["A receber",totals.receivable,<PaymentsIcon key="i1"/>],["A pagar",totals.payable,<PaymentsIcon key="i2"/>],["Caixa realizado",totals.cash,<AccountBalanceWalletIcon key="i3"/>],["Total vencido",totals.overdue,<PaymentsIcon key="i4"/>]].map(([t,v,i])=><Paper key={String(t)} sx={{p:2.5,borderRadius:3}}><Box sx={{display:"flex",justifyContent:"space-between",gap:2}}><Box><Typography color="text.secondary">{t}</Typography><Typography variant="h5" sx={{fontWeight:900}}>{money(Number(v))}</Typography></Box>{i}</Box></Paper>)}</Box>
 <Paper variant="outlined" sx={{p:2,mb:2,borderRadius:3}}><Box sx={{display:"flex",gap:1,flexWrap:"wrap",alignItems:"center"}}><Button variant="contained" onClick={()=>navigate("/pagamentos")}>Central de cobrança</Button><Button onClick={()=>navigate("/integracoes")}>Integrações</Button><Button onClick={()=>navigate("/financeiro/digitalizar")}>Digitalizar conta/nota</Button><Button onClick={()=>navigate("/revah")}>Cobranças REVAH</Button></Box></Paper><Box sx={{display:"flex",gap:1,mb:2,flexWrap:"wrap",alignItems:"center"}}><TextField size="small" placeholder="Buscar lançamento..." value={search} onChange={e=>setSearch(e.target.value)} sx={{minWidth:280}}/>{["Todos","Pendente","Vencido","Pago","Receita","Despesa"].map(x=><Chip key={x} label={x} color={filter===x?"primary":"default"} onClick={()=>setFilter(x)}/>)}<Button onClick={exportCsv}>Exportar CSV</Button></Box>
 <Paper sx={{overflow:"hidden",borderRadius:3}}>{loading?<Typography sx={{p:3}} color="text.secondary">Carregando...</Typography>:visible.length===0?<Typography sx={{p:3}} color="text.secondary">Nenhum lançamento encontrado.</Typography>:visible.map(e=>{const status=displayStatus(e);return <Box key={e.id} sx={{display:"grid",gridTemplateColumns:{xs:"1fr",md:"2fr 1fr .8fr .8fr auto"},gap:2,p:2,borderBottom:"1px solid",borderColor:"divider",alignItems:"center"}}><Box><Typography sx={{fontWeight:800}}>{e.description}</Typography><Typography variant="body2" color="text.secondary">{e.personName} • {e.category} • {e.origin||"Manual"}{e.paymentMethod?` • ${e.paymentMethod}`:""}{e.provider?` / ${e.provider}`:""}{e.issuerEntity?` • ${issuerEntityLabels[e.issuerEntity]}`:""}</Typography></Box><Typography sx={{fontWeight:800}} color={e.type==="INCOME"?"success.main":"error.main"}>{e.type==="EXPENSE"?"− ":"+ "}{money(e.amount)}</Typography><Typography>{brDate(e.dueDate)}</Typography><Chip size="small" label={status} color={statusColor(status)}/><Box sx={{display:"flex",gap:.5,flexWrap:"wrap"}}>{e.type==="INCOME"&&status!=="Pago"&&status!=="Cancelado"&&<><Button size="small" onClick={()=>sendCollection(e)}>REVAH</Button>{e.provider==="Asaas"&&<><Button size="small" onClick={()=>paymentCode(e,"PIX")}>PIX</Button><Button size="small" onClick={()=>paymentCode(e,"Boleto")}>Boleto</Button></>}</>}{status!=="Pago"&&status!=="Cancelado"&&<Button size="small" onClick={()=>changeStatus(e,"Pago")}>Baixar</Button>}{status!=="Cancelado"&&status!=="Pago"&&<Button size="small" color="inherit" onClick={()=>changeStatus(e,"Cancelado")}>Cancelar</Button>}<Tooltip title="Excluir"><IconButton size="small" onClick={()=>remove(e)}><DeleteOutlinedIcon fontSize="small"/></IconButton></Tooltip></Box></Box>})}</Paper>
 <Dialog open={open} onClose={()=>setOpen(false)} fullWidth maxWidth="sm"><DialogTitle>Novo lançamento</DialogTitle><DialogContent sx={{display:"grid",gap:2,pt:"12px!important"}}><TextField required label="Descrição" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/><TextField required label="Pessoa / fornecedor / paciente" value={form.personName} onChange={e=>setForm({...form,personName:e.target.value})}/><TextField label="Categoria" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/><TextField select label="Tipo" value={form.type} onChange={e=>setForm({...form,type:e.target.value as "Receita"|"Despesa"})}><MenuItem value="Receita">Receita</MenuItem><MenuItem value="Despesa">Despesa</MenuItem></TextField><TextField required label="Valor (R$)" placeholder="Ex.: 1.250,90" value={form.value} onChange={e=>setForm({...form,value:e.target.value.replace(/[^\d.,]/g,"")})} onBlur={()=>setForm(f=>({...f,value:formatBRL(f.value)}))} error={form.value!==""&&!(parseBRL(form.value)>0)} helperText={form.value!==""&&!(parseBRL(form.value)>0)?"Informe um valor maior que zero":"Pode digitar com vírgula. Ex.: 1.250,90"} slotProps={{htmlInput:{inputMode:"decimal"},input:{startAdornment:<InputAdornment position="start">R$</InputAdornment>}}}/><Box sx={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:2}}><TextField required label="Vencimento" type="date" slotProps={{inputLabel:{shrink:true}}} value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})}/><TextField label="Competência" type="date" slotProps={{inputLabel:{shrink:true}}} value={form.competenceDate} onChange={e=>setForm({...form,competenceDate:e.target.value})}/></Box><Box sx={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:2}}><TextField select label="Forma" value={form.paymentMethod} onChange={e=>setForm({...form,paymentMethod:e.target.value as PaymentMethod})}>{["PIX","Cartão","Boleto","Transferência","Dinheiro","Promissória","Permuta","Cheque"].map(x=><MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField><TextField select label="Provedor" value={form.provider} onChange={e=>setForm({...form,provider:e.target.value as PaymentProvider})}>{["Asaas","Stripe","Banco / Open Finance","Manual"].map(x=><MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField></Box><TextField select label="Razão social emissora" value={form.issuerEntity} onChange={e=>setForm({...form,issuerEntity:e.target.value as IssuerEntity})} helperText="Consultas, tratamentos e assinaturas saem pelo Instituto Ravel. Venda de material (DentalPos Sales) sai pela Tecnoimplante.">{(Object.keys(issuerEntityLabels) as IssuerEntity[]).map(x=><MenuItem key={x} value={x}>{issuerEntityLabels[x]}</MenuItem>)}</TextField><TextField multiline minRows={2} label="Observações" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></DialogContent><DialogActions><Button onClick={()=>setOpen(false)}>Cancelar</Button><Button variant="contained" disabled={saving} onClick={add}>{saving?"Salvando...":"Salvar lançamento"}</Button></DialogActions></Dialog></Box>;
}
