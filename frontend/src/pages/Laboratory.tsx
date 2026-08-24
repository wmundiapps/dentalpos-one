import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, MenuItem, Paper, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArchitectureIcon from "@mui/icons-material/Architecture";
import AssignmentLateIcon from "@mui/icons-material/AssignmentLate";
import EditIcon from "@mui/icons-material/Edit";
import HistoryIcon from "@mui/icons-material/History";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import PrecisionManufacturingIcon from "@mui/icons-material/PrecisionManufacturing";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import PageHeader from "../components/PageHeader";
import {
  createLaboratoryWork, getLaboratoryWorks, sendLaboratoryWorkToDesign,
  subscribeOperations, updateLaboratoryWork,
} from "../services/OperationsHubService";
import type { IntegratedLaboratoryWork } from "../types/operationsHub";
import type { LaboratoryPriority, LaboratoryWorkStatus } from "../types/laboratory";

const statuses: LaboratoryWorkStatus[] = ["Recebido","Triagem","Aguardando aprovação","Planejamento","CAD","CAM","Acabamento","Controle de qualidade","Liberado","Entregue","Refação","Atrasado"];
const shadeSystems = ["VITA Classical", "VITA 3D-Master", "Bleach", "Personalizada"] as const;
const analogItems = ["Molde superior","Molde inferior","Mordida em cera","Moldeira superior","Moldeira inferior"];
const digitalItems = ["Escaneamento superior","Escaneamento inferior","Registro de mordida"];

const blankForm = () => ({
  patientName:"", dentistName:"", workType:"", teeth:"", material:"", technician:"", dueDateISO:"", patientReturnDateISO:"",
  priority:"Normal" as LaboratoryPriority, nextAction:"", observations:"", impressionType:"Digital" as "Analógica"|"Digital",
  toothShade:"", shadeSystem:"VITA Classical" as typeof shadeSystems[number], shadeNotes:"", patientAge:"", patientSex:"Masculino" as "Masculino"|"Feminino"|"Outro",
  faceBiotype:"Mesocéfalo" as "Dolicocéfalo"|"Mesocéfalo"|"Braquicéfalo", faceShape:"Ovoide" as "Ovoide"|"Quadrado"|"Triangular"|"Outro",
  faceDescription:"", receivedItems:[] as string[],
});

type LabForm = ReturnType<typeof blankForm>;
const formatDate = (iso?:string) => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR") : "—";
const daysUntil = (iso?:string) => { if(!iso) return Number.POSITIVE_INFINITY; const a=new Date(); a.setHours(12,0,0,0); return Math.ceil((new Date(`${iso}T12:00:00`).getTime()-a.getTime())/86400000); };
const priorityColor = (p:LaboratoryPriority) => p==="Urgente" ? "error" as const : p==="Alta" ? "warning" as const : "default" as const;

export default function Laboratory(){
  const navigate=useNavigate();
  const [works,setWorks]=useState<IntegratedLaboratoryWork[]>(getLaboratoryWorks);
  const [open,setOpen]=useState(false); const [editing,setEditing]=useState<IntegratedLaboratoryWork|null>(null); const [historyWork,setHistoryWork]=useState<IntegratedLaboratoryWork|null>(null);
  const [search,setSearch]=useState(""); const [form,setForm]=useState<LabForm>(blankForm());
  useEffect(()=>subscribeOperations(()=>setWorks(getLaboratoryWorks())),[]);

  const delayedWorks=works.filter(w=>!["Entregue","Liberado"].includes(w.status)&&((w.dueDateISO&&daysUntil(w.dueDateISO)<0)||w.status==="Atrasado")).length;
  const riskWorks=works.filter(w=>!["Entregue","Liberado"].includes(w.status)&&(daysUntil(w.patientReturnDateISO)<=2||daysUntil(w.dueDateISO)<=2)).length;
  const visible=useMemo(()=>{ const q=search.trim().toLowerCase(); return !q?works:works.filter(w=>`${w.patientName} ${w.workType} ${w.trackingCode} ${w.dentistName} ${w.responsibleTechnician} ${w.teeth||""} ${w.toothShade||""}`.toLowerCase().includes(q)); },[works,search]);

  const loadForm=(w?:IntegratedLaboratoryWork):LabForm => w ? ({ patientName:w.patientName,dentistName:w.dentistName,workType:w.workType,teeth:w.teeth||"",material:w.material,technician:w.responsibleTechnician,dueDateISO:w.dueDateISO||"",patientReturnDateISO:w.patientReturnDateISO||"",priority:w.priority,nextAction:w.nextAction||"",observations:w.observations||"",impressionType:w.impressionType||"Digital",toothShade:w.toothShade||"",shadeSystem:w.shadeSystem||"VITA Classical",shadeNotes:w.shadeNotes||"",patientAge:w.patientAge?String(w.patientAge):"",patientSex:w.patientSex||"Masculino",faceBiotype:w.faceBiotype||"Mesocéfalo",faceShape:w.faceShape||"Ovoide",faceDescription:w.faceDescription||"",receivedItems:w.receivedItems||[] }) : blankForm();
  const openNew=()=>{setEditing(null);setForm(blankForm());setOpen(true)};
  const openEdit=(w:IntegratedLaboratoryWork)=>{setEditing(w);setForm(loadForm(w));setOpen(true)};
  const payload=()=>({patientName:form.patientName.trim(),dentistName:form.dentistName.trim()||"A definir",clinicName:"DentalPos",workType:form.workType.trim(),teeth:form.teeth.trim()||undefined,material:form.material.trim()||"A definir",responsibleTechnician:form.technician.trim()||"A definir",entryDateISO:editing?.entryDateISO||new Date().toISOString().slice(0,10),dueDateISO:form.dueDateISO||undefined,patientReturnDateISO:form.patientReturnDateISO||undefined,status:editing?.status||"Recebido" as LaboratoryWorkStatus,priority:form.priority,hasCadCamFile:editing?.hasCadCamFile||false,observations:form.observations.trim()||undefined,source:editing?.source||"Laboratório" as const,nextAction:form.nextAction.trim()||"Realizar triagem do trabalho",impressionType:form.impressionType,toothShade:form.toothShade.trim(),shadeSystem:form.shadeSystem,shadeNotes:form.shadeNotes.trim()||undefined,patientAge:form.patientAge?Number(form.patientAge):undefined,patientSex:form.patientSex,faceBiotype:form.faceBiotype,faceShape:form.faceShape,faceDescription:form.faceDescription.trim()||undefined,receivedItems:form.receivedItems,designStatus:editing?.designStatus||"Não enviado" as const,designJobId:editing?.designJobId,history:editing?.history,upperScanFileName:editing?.upperScanFileName,lowerScanFileName:editing?.lowerScanFileName,biteFileName:editing?.biteFileName});
  const save=()=>{ if(!form.patientName.trim()||!form.workType.trim()||!form.toothShade.trim()) return; if(editing) updateLaboratoryWork(editing.id,payload(),"Ficha laboratorial corrigida/atualizada."); else createLaboratoryWork(payload()); setOpen(false); setEditing(null); setForm(blankForm()); };
  const sendDesign=(w:IntegratedLaboratoryWork)=>{sendLaboratoryWorkToDesign(w.id);navigate("/design")};

  return <Box>
    <PageHeader title="Laboratório" description="Fila clínica integrada à Agenda e ao DentalPos Design, com rastreabilidade e conferência de entrada." actionLabel="Novo trabalho" actionIcon={<AddIcon/>} onAction={openNew}/>
    <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",md:"repeat(2,1fr)",xl:"repeat(5,1fr)"},gap:2,mb:3}}>
      <Summary title="Trabalhos ativos" value={String(works.filter(w=>w.status!=="Entregue").length)} icon={<PrecisionManufacturingIcon/>}/><Summary title="No Design" value={String(works.filter(w=>w.designStatus&&w.designStatus!=="Não enviado").length)} icon={<ArchitectureIcon/>}/><Summary title="Atrasados" value={String(delayedWorks)} icon={<AssignmentLateIcon/>}/><Summary title="Em risco" value={String(riskWorks)} icon={<WarningAmberIcon/>}/><Summary title="Liberados/entregues" value={String(works.filter(w=>["Liberado","Entregue"].includes(w.status)).length)} icon={<LocalShippingIcon/>}/>
    </Box>
    <TextField size="small" placeholder="Buscar paciente, trabalho, código, dentes, cor, dentista ou técnico..." value={search} onChange={e=>setSearch(e.target.value)} sx={{mb:2,minWidth:{xs:"100%",md:500}}}/>
    <Paper elevation={0} sx={{borderRadius:3,border:"1px solid",borderColor:"divider",overflow:"hidden"}}>
      {visible.map(w=>{const delayed=!["Entregue","Liberado"].includes(w.status)&&daysUntil(w.dueDateISO)<0;const risk=!delayed&&!["Entregue","Liberado"].includes(w.status)&&(daysUntil(w.patientReturnDateISO)<=2||daysUntil(w.dueDateISO)<=2);return <Box key={w.id} sx={{p:2,borderBottom:"1px solid",borderColor:"divider",bgcolor:delayed?"rgba(239,68,68,.045)":risk?"rgba(245,158,11,.045)":"transparent"}}>
        <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",xl:"1.15fr 1.3fr 1fr 1fr 190px"},gap:2,alignItems:"center"}}>
          <Box><Typography sx={{fontWeight:900}}>{w.patientName}</Typography><Typography variant="body2" color="text.secondary">{w.trackingCode} • {w.source}</Typography><Box sx={{display:"flex",gap:.6,mt:.6,flexWrap:"wrap"}}><Chip size="small" label={w.priority} color={priorityColor(w.priority)}/>{delayed&&<Chip size="small" label="ATRASADO" color="error"/>}{risk&&<Chip size="small" label="EM RISCO" color="warning"/>}<Chip size="small" label={w.designStatus||"Não enviado"}/></Box></Box>
          <Box><Typography sx={{fontWeight:800}}>{w.workType}</Typography><Typography variant="body2" color="text.secondary">Dentes: {w.teeth||"—"} • {w.material}</Typography><Typography variant="body2" sx={{fontWeight:700}}>Cor: {w.toothShade||"NÃO INFORMADA"} {w.shadeSystem?`(${w.shadeSystem})`:""}</Typography><Typography variant="caption" color="text.secondary">{w.impressionType||"—"} • {(w.receivedItems||[]).join(" • ")||"Itens não conferidos"}</Typography></Box>
          <Box><Typography variant="caption" color="text.secondary">Dentista / Técnico</Typography><Typography>{w.dentistName}</Typography><Typography variant="body2" color="text.secondary">{w.responsibleTechnician}</Typography></Box>
          <Box><Typography variant="caption" color="text.secondary">Prazo / Retorno</Typography><Typography sx={{fontWeight:700}}>Lab: {formatDate(w.dueDateISO)}</Typography><Typography sx={{fontWeight:700}}>Paciente: {formatDate(w.patientReturnDateISO)}</Typography><Typography variant="caption" color="text.secondary">Próxima ação: {w.nextAction||"Definir"}</Typography></Box>
          <TextField select size="small" label="Status" value={w.status} onChange={e=>updateLaboratoryWork(w.id,{status:e.target.value as LaboratoryWorkStatus})}>{statuses.map(s=><MenuItem key={s} value={s}>{s}</MenuItem>)}</TextField>
        </Box>
        <Box sx={{display:"flex",gap:1,mt:1.4,flexWrap:"wrap"}}><Button size="small" startIcon={<EditIcon/>} onClick={()=>openEdit(w)}>Editar</Button><Button size="small" startIcon={<HistoryIcon/>} onClick={()=>setHistoryWork(w)}>Histórico</Button><Button size="small" variant="contained" startIcon={<ArchitectureIcon/>} disabled={!w.toothShade} onClick={()=>sendDesign(w)}>Abrir no DentalPos Design</Button></Box>
      </Box>})}
    </Paper>

    <Dialog open={open} onClose={()=>setOpen(false)} fullWidth maxWidth="md"><DialogTitle>{editing?"Editar trabalho laboratorial":"Novo trabalho laboratorial"}</DialogTitle><DialogContent sx={{display:"grid",gridTemplateColumns:{xs:"1fr",md:"1fr 1fr"},gap:2,pt:"12px!important"}}>
      <TextField required label="Paciente" value={form.patientName} onChange={e=>setForm({...form,patientName:e.target.value})}/><TextField label="Dentista" value={form.dentistName} onChange={e=>setForm({...form,dentistName:e.target.value})}/><TextField required label="Tipo de trabalho" value={form.workType} onChange={e=>setForm({...form,workType:e.target.value})}/><TextField label="Dentes envolvidos" placeholder="Ex.: 11, 12, 21 ou 14-16" value={form.teeth} onChange={e=>setForm({...form,teeth:e.target.value})}/>
      <TextField select label="Tipo de moldagem" value={form.impressionType} onChange={e=>setForm({...form,impressionType:e.target.value as LabForm["impressionType"],receivedItems:[]})}>{["Analógica","Digital"].map(v=><MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField><TextField label="Material" value={form.material} onChange={e=>setForm({...form,material:e.target.value})}/>
      <TextField required label="Cor do dente" helperText="Obrigatória para encaminhar ao Design/produção" value={form.toothShade} onChange={e=>setForm({...form,toothShade:e.target.value})}/><TextField select label="Sistema de cor" value={form.shadeSystem} onChange={e=>setForm({...form,shadeSystem:e.target.value as LabForm["shadeSystem"]})}>{shadeSystems.map(v=><MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField><TextField label="Observação da cor / caracterização" value={form.shadeNotes} onChange={e=>setForm({...form,shadeNotes:e.target.value})} sx={{gridColumn:{md:"1/-1"}}}/>
      <Box sx={{gridColumn:{md:"1/-1"}}}><Typography variant="body2" sx={{fontWeight:800,mb:1}}>Conferência do material recebido</Typography><Box sx={{display:"flex",gap:1,flexWrap:"wrap"}}>{(form.impressionType==="Analógica"?analogItems:digitalItems).map(v=><Chip key={v} clickable color={form.receivedItems.includes(v)?"primary":"default"} label={v} onClick={()=>setForm({...form,receivedItems:form.receivedItems.includes(v)?form.receivedItems.filter(x=>x!==v):[...form.receivedItems,v]})}/>)}</Box></Box>
      <Divider sx={{gridColumn:{md:"1/-1"}}}/><TextField label="Idade" type="number" value={form.patientAge} onChange={e=>setForm({...form,patientAge:e.target.value})}/><TextField select label="Sexo" value={form.patientSex} onChange={e=>setForm({...form,patientSex:e.target.value as LabForm["patientSex"]})}>{["Masculino","Feminino","Outro"].map(v=><MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField><TextField select label="Biotipo facial" value={form.faceBiotype} onChange={e=>setForm({...form,faceBiotype:e.target.value as LabForm["faceBiotype"]})}>{["Dolicocéfalo","Mesocéfalo","Braquicéfalo"].map(v=><MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField><TextField select label="Formato do rosto" value={form.faceShape} onChange={e=>setForm({...form,faceShape:e.target.value as LabForm["faceShape"]})}>{["Ovoide","Quadrado","Triangular","Outro"].map(v=><MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField><TextField label="Descrição facial" value={form.faceDescription} onChange={e=>setForm({...form,faceDescription:e.target.value})} sx={{gridColumn:{md:"1/-1"}}}/>
      <TextField label="Técnico responsável" value={form.technician} onChange={e=>setForm({...form,technician:e.target.value})}/><TextField select label="Prioridade" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value as LaboratoryPriority})}>{["Normal","Alta","Urgente"].map(v=><MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField><TextField label="Prazo do laboratório" type="date" slotProps={{inputLabel:{shrink:true}}} value={form.dueDateISO} onChange={e=>setForm({...form,dueDateISO:e.target.value})}/><TextField label="Retorno do paciente" type="date" slotProps={{inputLabel:{shrink:true}}} value={form.patientReturnDateISO} onChange={e=>setForm({...form,patientReturnDateISO:e.target.value})}/><TextField label="Próxima ação" value={form.nextAction} onChange={e=>setForm({...form,nextAction:e.target.value})} sx={{gridColumn:{md:"1/-1"}}}/><TextField label="Observações" multiline rows={3} value={form.observations} onChange={e=>setForm({...form,observations:e.target.value})} sx={{gridColumn:{md:"1/-1"}}}/>
    </DialogContent><DialogActions><Button onClick={()=>setOpen(false)}>Cancelar</Button><Button variant="contained" onClick={save}>Salvar trabalho</Button></DialogActions></Dialog>

    <Dialog open={Boolean(historyWork)} onClose={()=>setHistoryWork(null)} fullWidth maxWidth="sm"><DialogTitle>Histórico do trabalho</DialogTitle><DialogContent>{historyWork&&<><Typography sx={{fontWeight:900,mb:2}}>{historyWork.patientName} • {historyWork.trackingCode}</Typography>{(historyWork.history||[]).length===0?<Typography color="text.secondary">Sem histórico registrado nesta versão.</Typography>:(historyWork.history||[]).map(h=><Box key={h.id} sx={{pb:1.5,mb:1.5,borderBottom:"1px solid",borderColor:"divider"}}><Typography sx={{fontWeight:800}}>{h.action}</Typography><Typography variant="body2">{h.description}</Typography><Typography variant="caption" color="text.secondary">{new Date(h.atISO).toLocaleString("pt-BR")}</Typography></Box>)}</>}</DialogContent><DialogActions><Button onClick={()=>setHistoryWork(null)}>Fechar</Button></DialogActions></Dialog>
  </Box>
}

function Summary({title,value,icon}:{title:string;value:string;icon:ReactNode}){return <Paper elevation={0} sx={{p:2.2,borderRadius:3,border:"1px solid",borderColor:"divider"}}><Box sx={{display:"flex",gap:1.2,alignItems:"center",mb:1}}><Box sx={{color:"primary.main"}}>{icon}</Box><Typography color="text.secondary">{title}</Typography></Box><Typography variant="h4" sx={{fontWeight:900}}>{value}</Typography></Paper>}
