import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Box, Button, Chip, Divider, FormControl, InputLabel, MenuItem, Paper,
  Select, Stack, Tab, Tabs, TextField, Typography
} from '@mui/material'
import PageHeader from '../components/PageHeader'
import { DentalChartService } from '../services/DentalChartService'
import type {
  ClinicalState, DentalChartEntry, DentalFinding, Dentition,
  PeriodontalExam, PeriodontalSite, PeriodontalSiteRecord, ToothSurface
} from '../types/dentalChart'

const SITES: PeriodontalSite[] = ['MB','B','DB','ML','L','DL']
const SURFACES: ToothSurface[] = ['M','D','O','V','L']
const stateLabel: Record<ClinicalState,string> = { CURRENT:'Atual', PLANNED:'Planejado', COMPLETED:'Concluído' }

export default function OdontogramPeriodontogram() {
  const params = new URLSearchParams(window.location.search)
  const patientId = params.get('patientId') || ''
  const patientName = params.get('patient') || 'Paciente'
  const [tab,setTab] = useState(0)
  const [dentition,setDentition] = useState<Dentition>('ADULT')
  const [entries,setEntries] = useState<DentalChartEntry[]>([])
  const [findings,setFindings] = useState<DentalFinding[]>([])
  const [exams,setExams] = useState<PeriodontalExam[]>([])
  const [teeth,setTeeth] = useState<number[]>([])
  const [error,setError] = useState('')
  const [selectedTooth,setSelectedTooth] = useState<number | ''>('')
  const [surface,setSurface] = useState<ToothSurface | ''>('')
  const [findingCode,setFindingCode] = useState('CARIES')
  const [clinicalState,setClinicalState] = useState<ClinicalState>('CURRENT')
  const [notes,setNotes] = useState('')
  const [professionalName,setProfessionalName] = useState('')
  const [examNotes,setExamNotes] = useState('')
  const [records,setRecords] = useState<Record<string,PeriodontalSiteRecord>>({})

  async function load() {
    if (!patientId) return
    setError('')
    try {
      const [chart, findingRows, history] = await Promise.all([
        DentalChartService.chart(patientId),
        DentalChartService.findings(),
        DentalChartService.periodontalHistory(patientId)
      ])
      setEntries(chart.entries.filter(x=>x.status==='ACTIVE'))
      setFindings(findingRows)
      setExams(history.exams)
      setTeeth(dentition === 'CHILD' ? chart.childTeeth : chart.adultTeeth)
    } catch (e:any) { setError(e.message) }
  }
  useEffect(()=>{ void load() },[patientId])
  useEffect(()=>{
    const adult=[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28,48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38]
    const child=[55,54,53,52,51,61,62,63,64,65,85,84,83,82,81,71,72,73,74,75]
    setTeeth(dentition==='CHILD'?child:adult)
    setSelectedTooth('')
  },[dentition])

  const activeFinding = findings.find(f=>f.code===findingCode)
  const grouped = useMemo(()=>Object.fromEntries(teeth.map(t=>[t,entries.filter(e=>e.tooth===t && e.dentition===dentition)])),[entries,teeth,dentition])

  async function saveMark() {
    if (!patientId || !selectedTooth || !activeFinding) return
    try {
      await DentalChartService.saveEntry(patientId,{
        dentition,tooth:Number(selectedTooth),surface:surface||null,
        findingCode:activeFinding.code,findingLabel:activeFinding.label,clinicalState,notes
      })
      setNotes(''); await load()
    } catch(e:any){setError(e.message)}
  }

  function recordKey(tooth:number,site:PeriodontalSite){ return `${tooth}-${site}` }
  function getRecord(tooth:number,site:PeriodontalSite): PeriodontalSiteRecord {
    return records[recordKey(tooth,site)] || {
      tooth,site,probingDepth:0,recession:0,bleeding:false,plaque:false,suppuration:false,mobility:null,furcation:null
    }
  }
  function patchRecord(tooth:number,site:PeriodontalSite,patch:Partial<PeriodontalSiteRecord>){
    const current=getRecord(tooth,site)
    setRecords(prev=>({...prev,[recordKey(tooth,site)]:{...current,...patch}}))
  }
  async function saveExam(){
    const rows = Object.values(records) as PeriodontalSiteRecord[]
    if(!rows.length){setError('Preencha ao menos um sítio periodontal.');return}
    try{
      await DentalChartService.savePeriodontalExam(patientId,{
        dentition,professionalName,notes:examNotes,records:rows
      })
      setRecords({});setExamNotes('');await load()
    }catch(e:any){setError(e.message)}
  }

  return <Box>
    <PageHeader title={`Odontograma e Periodontograma • ${patientName}`} description="FDI adulto/infantil, histórico longitudinal, plano de tratamento e auditoria integrados." />
    {!patientId && <Alert severity="warning" sx={{mb:2}}>Abra este módulo a partir de um paciente para informar o patientId.</Alert>}
    {error && <Alert severity="error" sx={{mb:2}} onClose={()=>setError('')}>{error}</Alert>}

    <Paper variant="outlined" sx={{p:2,borderRadius:3,mb:2}}>
      <Stack direction={{xs:'column',md:'row'}} spacing={2} alignItems={{md:'center'}}>
        <FormControl sx={{minWidth:190}}><InputLabel>Dentição</InputLabel><Select value={dentition} label="Dentição" onChange={e=>setDentition(e.target.value as Dentition)}>
          <MenuItem value="ADULT">Adulto • FDI</MenuItem><MenuItem value="CHILD">Infantil • FDI</MenuItem>
        </Select></FormControl>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Chip label="Atual" variant="outlined"/><Chip label="Planejado" color="warning"/><Chip label="Concluído" color="success"/>
        </Stack>
      </Stack>
    </Paper>

    <Tabs value={tab} onChange={(_,v)=>setTab(v)} sx={{mb:2}}>
      <Tab label="Odontograma"/><Tab label="Periodontograma"/><Tab label="Histórico periodontal"/>
    </Tabs>

    {tab===0 && <>
      <Paper variant="outlined" sx={{p:2,borderRadius:3,mb:2}}>
        <Typography variant="h6" fontWeight={900}>Registrar achado</Typography>
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(5,1fr)'},gap:1.5,mt:2}}>
          <FormControl><InputLabel>Dente FDI</InputLabel><Select value={selectedTooth} label="Dente FDI" onChange={e=>setSelectedTooth(Number(e.target.value))}>
            {teeth.map(t=><MenuItem key={t} value={t}>{t}</MenuItem>)}
          </Select></FormControl>
          <FormControl><InputLabel>Face</InputLabel><Select value={surface} label="Face" onChange={e=>setSurface(e.target.value as ToothSurface|'')}>
            <MenuItem value="">Dente/região</MenuItem>{SURFACES.map(s=><MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select></FormControl>
          <FormControl><InputLabel>Achado</InputLabel><Select value={findingCode} label="Achado" onChange={e=>setFindingCode(e.target.value)}>
            {findings.map(f=><MenuItem key={f.id} value={f.code}>{f.label}</MenuItem>)}
          </Select></FormControl>
          <FormControl><InputLabel>Estado</InputLabel><Select value={clinicalState} label="Estado" onChange={e=>setClinicalState(e.target.value as ClinicalState)}>
            {(['CURRENT','PLANNED','COMPLETED'] as ClinicalState[]).map(s=><MenuItem key={s} value={s}>{stateLabel[s]}</MenuItem>)}
          </Select></FormControl>
          <Button variant="contained" disabled={!selectedTooth||!activeFinding} onClick={()=>void saveMark()}>Salvar</Button>
        </Box>
        <TextField fullWidth label="Observações" value={notes} onChange={e=>setNotes(e.target.value)} sx={{mt:1.5}}/>
      </Paper>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(4,1fr)',md:'repeat(8,1fr)'},gap:1}}>
        {teeth.map(tooth=><Paper key={tooth} variant="outlined" sx={{p:1.25,minHeight:110,borderRadius:2}}>
          <Typography fontWeight={900} textAlign="center">{tooth}</Typography>
          <Divider sx={{my:.75}}/>
          <Stack spacing={0.5}>
            {(grouped[tooth]||[]).map(e=><Chip key={e.id} size="small" label={`${e.surface?e.surface+' • ':''}${e.findingLabel} • ${stateLabel[e.clinicalState]}`}
              color={e.clinicalState==='COMPLETED'?'success':e.clinicalState==='PLANNED'?'warning':'default'} />)}
          </Stack>
        </Paper>)}
      </Box>
    </>}

    {tab===1 && <Paper variant="outlined" sx={{p:2,borderRadius:3}}>
      <Typography variant="h6" fontWeight={900}>Novo exame periodontal</Typography>
      <Stack direction={{xs:'column',md:'row'}} spacing={1.5} sx={{my:2}}>
        <TextField label="Profissional" value={professionalName} onChange={e=>setProfessionalName(e.target.value)}/>
        <TextField fullWidth label="Observações gerais" value={examNotes} onChange={e=>setExamNotes(e.target.value)}/>
        <Button variant="contained" onClick={()=>void saveExam()}>Salvar exame</Button>
      </Stack>
      <Box sx={{overflowX:'auto'}}>
        <Box sx={{minWidth:1100}}>
          {teeth.map(tooth=><Box key={tooth} sx={{display:'grid',gridTemplateColumns:'70px repeat(6, 1fr)',gap:.5,mb:.75,alignItems:'center'}}>
            <Typography fontWeight={900}>FDI {tooth}</Typography>
            {SITES.map(site=>{
              const r=getRecord(tooth,site)
              return <Paper key={site} variant="outlined" sx={{p:.75}}>
                <Typography variant="caption" fontWeight={900}>{site}</Typography>
                <TextField size="small" type="number" label="PS" value={r.probingDepth} onChange={e=>patchRecord(tooth,site,{probingDepth:Number(e.target.value)})} sx={{mt:.5}}/>
                <TextField size="small" type="number" label="REC" value={r.recession} onChange={e=>patchRecord(tooth,site,{recession:Number(e.target.value)})} sx={{mt:.5}}/>
                <Stack direction="row" spacing={.5} sx={{mt:.5}} flexWrap="wrap">
                  <Chip size="small" clickable color={r.bleeding?'error':'default'} label="Sang." onClick={()=>patchRecord(tooth,site,{bleeding:!r.bleeding})}/>
                  <Chip size="small" clickable color={r.plaque?'warning':'default'} label="Placa" onClick={()=>patchRecord(tooth,site,{plaque:!r.plaque})}/>
                  <Chip size="small" clickable color={r.suppuration?'error':'default'} label="Sup." onClick={()=>patchRecord(tooth,site,{suppuration:!r.suppuration})}/>
                </Stack>
              </Paper>
            })}
          </Box>)}
        </Box>
      </Box>
      <Typography variant="caption" color="text.secondary">PS = profundidade de sondagem; REC = recessão. Nível de inserção clínica é calculado automaticamente como PS + recessão quando não enviado.</Typography>
    </Paper>}

    {tab===2 && <Stack spacing={1.5}>
      {exams.length===0 ? <Alert severity="info">Nenhum exame periodontal registrado.</Alert> :
        exams.map(exam=><Paper key={exam.id} variant="outlined" sx={{p:2,borderRadius:3}}>
          <Typography fontWeight={900}>{new Date(exam.examinedAt).toLocaleString('pt-BR')} • {exam.professionalName||'Profissional não informado'}</Typography>
          <Typography color="text.secondary">{exam.sites.length} sítio(s) registrados • {exam.notes||'Sem observações gerais'}</Typography>
        </Paper>)}
    </Stack>}
  </Box>
}
