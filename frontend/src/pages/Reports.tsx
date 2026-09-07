import { useMemo, useState } from "react";
import { Box, Button, Card, CardContent, Chip, Grid, MenuItem, Stack, TextField, Typography } from "@mui/material";
import AssessmentIcon from "@mui/icons-material/Assessment";
import DownloadIcon from "@mui/icons-material/Download";
import PageHeader from "../components/PageHeader";

type ReportDef={key:string;title:string;description:string;group:string};
const reportDefs:ReportDef[]=[
  {key:"financial",title:"Financeiro",group:"Financeiro",description:"Receitas, despesas, saldo, vencidos e projeção do período."},
  {key:"fiscal",title:"Fiscal",group:"Financeiro",description:"Tributos, obrigações, guias, vencimentos e previsão fiscal."},
  {key:"patient-flow",title:"Entrada e saída de pacientes",group:"Pacientes",description:"Pacientes que iniciaram e concluíram atendimento/tratamento no período."},
  {key:"average-ticket",title:"Ticket médio",group:"Comercial",description:"Valor médio dos orçamentos, aprovações e conversão."},
  {key:"comparison",title:"Comparativo entre meses e anos",group:"Gestão",description:"Receitas, despesas e resultado por competência mensal."},
  {key:"active-patients",title:"Pacientes ativos e desistentes",group:"Pacientes",description:"Total de ativos e pacientes marcados como inativos/desistentes."},
  {key:"consultations-no-close",title:"Consultas que não fecharam",group:"Comercial",description:"Paciente atendido sem orçamento aceito/fechamento identificado."},
  {key:"no-show",title:"Consultas agendadas e faltas",group:"Agenda",description:"Agendamentos, comparecimento, faltas e taxa de no-show."},
  {key:"collections",title:"Cobranças e eficácia",group:"Financeiro",description:"Número de cobranças por paciente, entregas e títulos pagos."},
  {key:"reactivation",title:"Retorno de pacientes antigos",group:"REVAH",description:"Pacientes que retornaram após intervalo de 30 dias ou mais."},
  {key:"origin",title:"Origem dos pacientes",group:"REVAH",description:"Internet, indicação, convênio, panfleto e demais origens registradas."},
];

export default function Reports(){
  const [group,setGroup]=useState("Todos");
  const [from,setFrom]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().slice(0,10));
  const [to,setTo]=useState(()=>new Date().toISOString().slice(0,10));
  const filtered=useMemo(()=>group==="Todos"?reportDefs:reportDefs.filter(r=>r.group===group),[group]);

  const exportCsv=(key:string)=>{
    const base=import.meta.env.VITE_API_URL||"http://localhost:3000/api";
    const token=localStorage.getItem("dentalpos.token")||localStorage.getItem("token")||"";
    const clinicId=localStorage.getItem("dentalpos.clinicId")||localStorage.getItem("clinicId")||"";
    fetch(`${base}/reports/${key}?from=${from}&to=${to}&format=csv`,{headers:{Authorization:`Bearer ${token}`,"X-Clinic-ID":clinicId}})
      .then(async r=>{if(!r.ok)throw new Error(await r.text());return r.blob()})
      .then(blob=>{const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${key}-${from}-${to}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)})
      .catch((e)=>alert(`Não foi possível gerar o relatório: ${e instanceof Error?e.message:"erro desconhecido"}`));
  };

  return <Box>
    <PageHeader title="Relatórios" description="Escolha o relatório, defina o período e gere o arquivo. Todas as opções ficam visíveis nesta tela."/>
    <Stack direction={{xs:"column",md:"row"}} spacing={1.5} sx={{mb:3}}>
      <TextField select size="small" label="Categoria" value={group} onChange={e=>setGroup(e.target.value)} sx={{minWidth:220}}>
        {["Todos","Financeiro","Pacientes","Comercial","Gestão","Agenda","REVAH"].map(v=><MenuItem key={v} value={v}>{v}</MenuItem>)}
      </TextField>
      <TextField size="small" type="date" label="De" value={from} onChange={e=>setFrom(e.target.value)} InputLabelProps={{shrink:true}}/>
      <TextField size="small" type="date" label="Até" value={to} onChange={e=>setTo(e.target.value)} InputLabelProps={{shrink:true}}/>
    </Stack>
    <Grid container spacing={2}>
      {filtered.map(r=><Grid key={r.key} size={{xs:12,md:6,lg:4}}>
        <Card sx={{height:"100%"}}><CardContent>
          <Stack direction="row" spacing={1} alignItems="center"><AssessmentIcon color="primary"/><Typography variant="h6" sx={{fontWeight:850}}>{r.title}</Typography></Stack>
          <Chip size="small" label={r.group} sx={{my:1}}/>
          <Typography variant="body2" color="text.secondary" sx={{minHeight:64}}>{r.description}</Typography>
          <Button variant="contained" startIcon={<DownloadIcon/>} onClick={()=>exportCsv(r.key)} sx={{mt:2}}>Gerar relatório CSV</Button>
        </CardContent></Card>
      </Grid>)}
    </Grid>
  </Box>
}
