import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, TextField, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import LocalPrintshopIcon from '@mui/icons-material/LocalPrintshop'
import PageHeader from '../components/PageHeader'
import { createClinicalDocument, issueClinicalDocument, listClinicalDocuments, listClinicalDocumentTemplates } from '../services/ClinicalDocumentService'
import type { ClinicalDocument, ClinicalDocumentTemplate, ClinicalDocumentType } from '../types/clinicalDocument'

const LABELS: Record<ClinicalDocumentType,string> = {
  PRESCRIPTION:'Receita', CERTIFICATE:'Atestado', DECLARATION:'Declaração', REFERRAL:'Encaminhamento',
  EXAM_REQUEST:'Solicitação de exame', REPORT:'Relatório', CONSENT:'Termo de consentimento', CLINICAL_CONTRACT:'Contrato clínico', REFUSAL:'Termo de recusa', POST_OP_INSTRUCTIONS:'Orientações pós-operatórias',
}

export default function ClinicalDocuments(){
  const [searchParams]=useSearchParams(); const patientFromQuery=searchParams.get('patientId')||''
  const [rows,setRows]=useState<ClinicalDocument[]>([]); const [templates,setTemplates]=useState<ClinicalDocumentTemplate[]>([])
  const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [open,setOpen]=useState(false)
  const [form,setForm]=useState({patientId:patientFromQuery,professionalName:'',documentType:'PRESCRIPTION' as ClinicalDocumentType,title:'',content:'',templateId:''})
  const load=async()=>{setLoading(true);setError('');try{const [docs,tpls]=await Promise.all([listClinicalDocuments(),listClinicalDocumentTemplates()]);setRows(docs);setTemplates(tpls)}catch(e:any){setError(e.message||'Erro ao carregar documentos.')}finally{setLoading(false)}}
  useEffect(()=>{void load()},[])
  const stats=useMemo(()=>({total:rows.length,issued:rows.filter(x=>x.status==='ISSUED').length,drafts:rows.filter(x=>x.status==='DRAFT').length,cancelled:rows.filter(x=>x.status==='CANCELLED').length}),[rows])
  const chooseTemplate=(id:string)=>{const t=templates.find(x=>x.id===id);setForm(v=>({...v,templateId:id,...(t?{documentType:t.documentType,title:t.title,content:t.content}:{})}))}
  const save=async()=>{setError('');try{await createClinicalDocument({...form,templateId:form.templateId||undefined,status:'DRAFT'});setOpen(false);setForm({patientId:patientFromQuery,professionalName:'',documentType:'PRESCRIPTION',title:'',content:'',templateId:''});await load()}catch(e:any){setError(e.message||'Erro ao criar documento.')}}
  const issue=async(id:string)=>{try{await issueClinicalDocument(id);await load()}catch(e:any){setError(e.message||'Erro ao emitir documento.')}}
  return <Box>
    <PageHeader title="Documentos Clínicos" description="Receitas, atestados, declarações, encaminhamentos, exames, relatórios, consentimentos e contratos com autoria e histórico." actionLabel="Novo documento" actionIcon={<AddIcon />} onAction={()=>setOpen(true)} />
    {error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr 1fr',lg:'repeat(4,1fr)'},gap:2,mb:3}}>{Object.entries(stats).map(([k,v])=><Paper key={k} variant="outlined" sx={{p:2,borderRadius:3}}><Typography color="text.secondary">{{total:'Total',issued:'Emitidos',drafts:'Rascunhos',cancelled:'Cancelados'}[k as keyof typeof stats]}</Typography><Typography variant="h5" sx={{fontWeight:900}}>{v}</Typography></Paper>)}</Box>
    <Paper variant="outlined" sx={{borderRadius:3,overflow:'hidden'}}>
      {loading?<Typography sx={{p:3}}>Carregando...</Typography>:rows.length===0?<Typography sx={{p:3}} color="text.secondary">Nenhum documento clínico emitido.</Typography>:rows.map(doc=><Box key={doc.id} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'2fr 1fr 1fr auto'},gap:2,p:2,borderBottom:'1px solid',borderColor:'divider',alignItems:'center'}}><Box><Typography sx={{fontWeight:800}}>{doc.title}</Typography><Typography variant="body2" color="text.secondary">{LABELS[doc.documentType]} · {doc.professionalName} · v{doc.version}</Typography></Box><Chip size="small" label={doc.status==='DRAFT'?'Rascunho':doc.status==='ISSUED'?'Emitido':'Cancelado'} color={doc.status==='ISSUED'?'success':doc.status==='CANCELLED'?'error':'warning'} /><Typography variant="body2">{new Date(doc.createdAt).toLocaleString('pt-BR')}</Typography><Box sx={{display:'flex',gap:1}}>{doc.status==='DRAFT'&&<Button size="small" variant="contained" onClick={()=>void issue(doc.id)}>Emitir</Button>}<Button size="small" variant="outlined" startIcon={<LocalPrintshopIcon/>} onClick={()=>window.print()}>Imprimir</Button></Box></Box>)}
    </Paper>
    <Dialog open={open} onClose={()=>setOpen(false)} fullWidth maxWidth="md"><DialogTitle>Novo documento clínico</DialogTitle><DialogContent sx={{display:'grid',gap:2,pt:'12px !important'}}>
      <TextField label="Paciente (ID)" value={form.patientId} onChange={e=>setForm({...form,patientId:e.target.value})} required />
      <TextField label="Profissional" value={form.professionalName} onChange={e=>setForm({...form,professionalName:e.target.value})} required />
      <TextField select label="Modelo da clínica" value={form.templateId} onChange={e=>chooseTemplate(e.target.value)}><MenuItem value="">Sem modelo</MenuItem>{templates.map(t=><MenuItem key={t.id} value={t.id}>{t.title}</MenuItem>)}</TextField>
      <TextField select label="Tipo" value={form.documentType} onChange={e=>setForm({...form,documentType:e.target.value as ClinicalDocumentType})}>{Object.entries(LABELS).map(([v,l])=><MenuItem key={v} value={v}>{l}</MenuItem>)}</TextField>
      <TextField label="Título" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} required />
      <TextField label="Conteúdo" value={form.content} onChange={e=>setForm({...form,content:e.target.value})} multiline minRows={10} required />
    </DialogContent><DialogActions><Button onClick={()=>setOpen(false)}>Cancelar</Button><Button variant="contained" onClick={()=>void save()}>Salvar rascunho</Button></DialogActions></Dialog>
  </Box>
}
