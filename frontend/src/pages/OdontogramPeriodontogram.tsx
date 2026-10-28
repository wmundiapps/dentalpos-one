import { useEffect, useState } from 'react'
import {
  Alert, AppBar, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Paper,
  Select, Stack, Tab, Tabs, TextField, Toolbar, Typography
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import { useNavigate } from 'react-router-dom'
import TeethPicker from '../components/odontogram/TeethPicker'
import OdontogramBoard, { OdontogramLegend, isDone } from '../components/OdontogramBoard'
import { DEFAULT_DONE, DEFAULT_PLANNED, DONE_PALETTE, PLANNED_PALETTE, saveOdontogramColors, useOdontogramColors } from '../config/odontogramColors'
import { PENDING_ALERTS_EVENT } from '../services/PendingAlertsApi'
import PageHeader from '../components/PageHeader'
import PatientAlertBanner from '../components/patient/PatientAlertBanner'
import PatientPicker from '../components/patient/PatientPicker'
import { DentalChartService } from '../services/DentalChartService'
import type {
  ClinicalState, DentalChartEntry, DentalFinding, Dentition,
  PeriodontalExam, PeriodontalSite, PeriodontalSiteRecord, ToothSurface
} from '../types/dentalChart'

const SITES: PeriodontalSite[] = ['MB','B','DB','ML','L','DL']
const SURFACES: ToothSurface[] = ['M','D','O','V','L']
const stateLabel: Record<ClinicalState,string> = { CURRENT:'A fazer (cor clara)', PLANNED:'Planejado (cor clara)', COMPLETED:'Concluído (cor escura)' }

export default function OdontogramPeriodontogram({ startFullscreen = false, embedded = false }: { startFullscreen?: boolean; embedded?: boolean }) {
  const navigate = useNavigate()
  const oc = useOdontogramColors()
  const TODO_COLOR = oc.todo, TODO_TEXT = oc.todoText, DONE_COLOR = oc.done
  const [colorsOpen,setColorsOpen] = useState(false)
  const [pickTodo,setPickTodo] = useState(oc.todo)
  const [pickDone,setPickDone] = useState(oc.done)
  const params = new URLSearchParams(window.location.search)
  const patientId = params.get('patientId') || ''
  const patientName = params.get('patient') || 'Paciente'
  const [tab,setTab] = useState(0)
  const [fullscreen,setFullscreen] = useState(startFullscreen)
  const [toothOpen,setToothOpen] = useState<number|null>(null)
  const [dentition,setDentition] = useState<Dentition>('ADULT')
  const [entries,setEntries] = useState<DentalChartEntry[]>([])
  const [findings,setFindings] = useState<DentalFinding[]>([])
  const [exams,setExams] = useState<PeriodontalExam[]>([])
  const [teeth,setTeeth] = useState<number[]>([])
  const [error,setError] = useState('')
  const [selectedTooth,setSelectedTooth] = useState<number | ''>('')
  const [markTeeth,setMarkTeeth] = useState<number[]>([])
  const [surface,setSurface] = useState<ToothSurface | ''>('')
  const [findingCode,setFindingCode] = useState('CARIES')
  const [clinicalState,setClinicalState] = useState<ClinicalState>('PLANNED')
  const [notes,setNotes] = useState('')
  const [professionalName,setProfessionalName] = useState('')
  const [examNotes,setExamNotes] = useState('')
  const [records,setRecords] = useState<Record<string,PeriodontalSiteRecord>>({})
  const [procTeeth,setProcTeeth] = useState<number[]>([])
  const [procFaces,setProcFaces] = useState<ToothSurface[]>([])
  const [procFinding,setProcFinding] = useState('')
  const [procNotes,setProcNotes] = useState('')
  const [procPro,setProcPro] = useState(()=>params.get('profissional') || (()=>{try{return localStorage.getItem('completodonto.lastProfessional')||''}catch{return ''}})())
  const [procNext,setProcNext] = useState('')
  const [procBusy,setProcBusy] = useState(false)
  const [procOk,setProcOk] = useState('')
  const [unplannedMsg,setUnplannedMsg] = useState('')
  const [planMsg,setPlanMsg] = useState('')

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
    setMarkTeeth([]); setProcTeeth([])
  },[dentition])

  const activeFinding = findings.find(f=>f.code===findingCode)

  // Marca um ou vários dentes de uma vez (boca toda, arcada ou dentes escolhidos), com a mesma face, achado e estado.
  async function saveMark() {
    const targets = markTeeth.length ? markTeeth : (selectedTooth ? [Number(selectedTooth)] : [])
    if (!patientId || !targets.length || !activeFinding) return
    try {
      let pro = procPro
      if (!pro) { try { pro = localStorage.getItem('completodonto.lastProfessional') || '' } catch { pro = '' } }
      if (clinicalState==='COMPLETED' && pro.trim().length<2) { setError('Informe o profissional no quadro "Registrar procedimento realizado" antes de concluir.'); return }
      const unplannedList: Array<{ tooth: number; procedure: string }> = []
      let first = true
      for (const tooth of targets) {
        const saved = await DentalChartService.saveEntry(patientId,{
          dentition,tooth,surface:surface||null,
          findingCode:activeFinding.code,findingLabel:activeFinding.label,clinicalState,notes,
          // Concluído: o que foi feito (mesmo sem observação) vai para os procedimentos executados da ficha do paciente (uma evolução para todos os dentes).
          ...(clinicalState==='COMPLETED' && first ? { evolutionNotes: `Dente${targets.length>1?'s':''} ${targets.join(', ')}${surface?` — face ${surface}`:''}: ${notes.trim() || `${activeFinding.label} realizado`}`, professionalName: pro.trim() } : {})
        })
        first = false
        if (saved.unplanned) unplannedList.push({ tooth, procedure: activeFinding.label })
      }
      if (unplannedList.length) await handleUnplanned(unplannedList, pro.trim())
      if (clinicalState==='PLANNED') setPlanMsg(`Planejado: ${targets.length>1?`${targets.length} dentes (${targets.join(', ')})`:`dente ${targets[0]}`} — ${activeFinding.label}. O procedimento já entrou no plano de tratamento para o orçamento.`)
      setNotes(''); await load()
    } catch(e:any){setError(e.message)}
  }

  // Procedimento concluído que não estava no plano: avisa o gestor por e-mail e deixa a pendência na tela para passar orçamento.
  async function handleUnplanned(list: Array<{ tooth: number; procedure: string }>, professional: string) {
    if (!list.length) return
    try { await DentalChartService.notifyUnplanned(patientId, list, professional) } catch { /* o aviso na tela vale mesmo se o e-mail falhar */ }
    window.dispatchEvent(new Event(PENDING_ALERTS_EVENT))
    setUnplannedMsg(`Novo procedimento fora do plano (${list.map(i=>`dente ${i.tooth}: ${i.procedure}`).join('; ')}). O gestor foi avisado por e-mail: passar o orçamento ao paciente.`)
  }

  // Registro do que foi feito no paciente: cada dente/face entra no odontograma como CONCLUÍDO e a evolução clínica fica no prontuário.
  async function saveProcedure() {
    const finding = findings.find(f=>f.code===procFinding)
    if (!patientId || !finding || !procTeeth.length || procPro.trim().length<2 || procNext.trim().length<3) return
    setProcBusy(true); setError(''); setProcOk(''); setUnplannedMsg('')
    try {
      const faces: Array<ToothSurface|null> = procFaces.length ? procFaces : [null]
      let first = true
      const unplannedList: Array<{ tooth: number; procedure: string }> = []
      for (const tooth of procTeeth) for (const face of faces) {
        const saved = await DentalChartService.saveEntry(patientId,{
          dentition,tooth,surface:face,findingCode:finding.code,findingLabel:finding.label,clinicalState:'COMPLETED',notes:procNotes.trim(),
          ...(first ? { evolutionNotes:`Dente(s) ${procTeeth.join(', ')}${procFaces.length?` — face(s) ${procFaces.join('')}`:''}: ${procNotes.trim() || `${finding.label} realizado`}`, professionalName:procPro.trim(), nextProcedure:procNext.trim() } : {})
        })
        first = false
        if (saved.unplanned && !unplannedList.some(u=>u.tooth===tooth)) unplannedList.push({ tooth, procedure: finding.label })
      }
      await handleUnplanned(unplannedList, procPro.trim())
      try { localStorage.setItem('completodonto.lastProfessional', procPro) } catch { /* sem armazenamento */ }
      setProcOk(`Procedimento registrado em ${procTeeth.length} dente(s) e incluído no histórico do prontuário.`)
      setProcTeeth([]); setProcFaces([]); setProcNotes(''); setProcNext('')
      await load()
    } catch(e:any){ setError(e.message) } finally { setProcBusy(false) }
  }

  const procedureCard = (
    <Paper variant="outlined" sx={{p:2,borderRadius:3,mb:2,borderColor:'primary.main',borderWidth:2}}>
      <Typography variant="h6" sx={{ fontWeight:900 }}>Registrar procedimento realizado hoje</Typography>
      <Typography variant="body2" color="text.secondary">Escolha os dentes, o procedimento e anote o que foi feito. O dente fica na cor escura (concluído) no odontograma e o registro vai para Procedimentos executados na ficha do paciente. Planejado fica na cor clara escolhida em Configurar cores.</Typography>
      {procOk && <Alert severity="success" sx={{mt:1}} onClose={()=>setProcOk('')}>{procOk}</Alert>}
      {unplannedMsg && <Alert severity="warning" sx={{mt:1}} onClose={()=>setUnplannedMsg('')} action={<Button size="small" onClick={()=>navigate(`/orcamentos-tratamentos?patientId=${encodeURIComponent(patientId)}`)}>Ir para o orçamento</Button>}>{unplannedMsg}</Alert>}
      {planMsg && <Alert severity="info" sx={{mt:1}} onClose={()=>setPlanMsg('')} action={<Button size="small" onClick={()=>navigate(`/orcamentos-tratamentos?patientId=${encodeURIComponent(patientId)}`)}>Abrir orçamento</Button>}>{planMsg}</Alert>}
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'1fr 1fr 1fr'},gap:1.5,mt:2}}>
        <Box sx={{gridColumn:{md:'1/-1'}}}><TeethPicker teeth={teeth} value={procTeeth} onChange={setProcTeeth} label="Dentes"/></Box>
        <FormControl><InputLabel>Face(s) (opcional)</InputLabel><Select multiple value={procFaces} label="Face(s) (opcional)" onChange={e=>setProcFaces(e.target.value as ToothSurface[])} renderValue={(v)=>(v as string[]).join(' ')}>
          {SURFACES.map(s=><MenuItem key={s} value={s}>{s}</MenuItem>)}
        </Select></FormControl>
        <FormControl><InputLabel>Procedimento realizado</InputLabel><Select value={procFinding} label="Procedimento realizado" onChange={e=>setProcFinding(e.target.value)}>
          {findings.map(f=><MenuItem key={f.id} value={f.code}>{f.label}</MenuItem>)}
        </Select></FormControl>
        <TextField sx={{gridColumn:{md:'1/-1'}}} multiline minRows={2} label="Observações — o que foi feito (opcional)" value={procNotes} onChange={e=>setProcNotes(e.target.value)}/>
        <TextField required label="Profissional" value={procPro} onChange={e=>setProcPro(e.target.value)} error={procTeeth.length>0&&procPro.trim().length<2}/>
        <TextField required label="Próxima conduta / próxima consulta" value={procNext} onChange={e=>setProcNext(e.target.value)} placeholder="Ex.: retorno em 15 dias para prova" error={procTeeth.length>0&&procNext.trim().length<3}/>
        <Button variant="contained" size="large" disabled={procBusy||!procFinding||!procTeeth.length||procPro.trim().length<2||procNext.trim().length<3} onClick={()=>void saveProcedure()}>{procBusy?'Salvando...':'Salvar procedimento realizado'}</Button>
      </Box>
    </Paper>
  )

  async function setEntryState(e:DentalChartEntry,state:ClinicalState){
    try{
      await DentalChartService.saveEntry(patientId,{
        id:e.id,dentition:e.dentition,tooth:e.tooth,surface:e.surface||null,
        findingCode:e.findingCode,findingLabel:e.findingLabel,clinicalState:state,notes:e.notes||undefined
      })
      await load()
    }catch(err:any){setError(err.message)}
  }
  async function removeEntry(e:DentalChartEntry){
    if(!window.confirm('Remover esta marcação do odontograma?'))return
    try{await DentalChartService.removeEntry(patientId,e.id);await load()}catch(err:any){setError(err.message)}
  }
  function openTooth(t:number){ setToothOpen(t); setSelectedTooth(t); setMarkTeeth([t]) }
  const toothEntries = toothOpen ? entries.filter(e=>e.tooth===toothOpen && e.dentition===dentition) : []
  const todoList = entries.filter(e=>e.dentition===dentition && !isDone(e.clinicalState)).sort((a,b)=>a.tooth-b.tooth)

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

  if (!patientId) return <PatientPicker titulo="Odontograma e Periodontograma" descricao="Escolha o paciente para abrir o odontograma." />

  return <Box>
    <PageHeader title={`Odontograma e Periodontograma • ${patientName}`} description="FDI adulto/infantil, histórico longitudinal, plano de tratamento e auditoria integrados." />
    {!embedded && <PatientAlertBanner patientId={patientId}/>}
    {!patientId && <Alert severity="warning" sx={{mb:2}}>Abra este módulo a partir de um paciente para informar o patientId.</Alert>}
    {error && <Alert severity="error" sx={{mb:2}} onClose={()=>setError('')}>{error}</Alert>}

    <Paper variant="outlined" sx={{p:2,borderRadius:3,mb:2}}>
      <Stack direction={{xs:'column',md:'row'}} spacing={2} sx={{ alignItems:{md:'center'} }}>
        <FormControl sx={{minWidth:190}}><InputLabel>Dentição</InputLabel><Select value={dentition} label="Dentição" onChange={e=>setDentition(e.target.value as Dentition)}>
          <MenuItem value="ADULT">Adulto • FDI</MenuItem><MenuItem value="CHILD">Infantil • FDI</MenuItem>
        </Select></FormControl>
        <Stack direction="row" spacing={1} sx={{ flexWrap:"wrap" }}>
          <Chip label="Cor clara: planejado / a fazer" sx={{bgcolor:TODO_COLOR,color:TODO_TEXT,fontWeight:700}}/><Chip label="Cor escura: concluído" sx={{bgcolor:DONE_COLOR,color:'#fff',fontWeight:700}}/><Button size="small" onClick={()=>{setPickTodo(oc.todo);setPickDone(oc.done);setColorsOpen(true)}}>Configurar cores</Button>
        </Stack>
      </Stack>
    </Paper>

    <Tabs value={tab} onChange={(_,v)=>setTab(v)} sx={{mb:2}}>
      <Tab label="Odontograma"/><Tab label="Periodontograma"/><Tab label="Histórico periodontal"/>
    </Tabs>

    {tab===0 && <>
      {procedureCard}
      <Paper variant="outlined" sx={{p:2,borderRadius:3,mb:2}}>
        <Typography variant="h6" sx={{ fontWeight:900 }}>Registrar achado ou planejar tratamento</Typography>
        <Box sx={{mt:2}}><TeethPicker teeth={teeth} value={markTeeth} onChange={setMarkTeeth} label="Dentes a marcar ou planejar"/></Box>
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(4,1fr)'},gap:1.5,mt:2}}>
          <FormControl><InputLabel>Face</InputLabel><Select value={surface} label="Face" onChange={e=>setSurface(e.target.value as ToothSurface|'')}>
            <MenuItem value="">Dente/região</MenuItem>{SURFACES.map(s=><MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select></FormControl>
          <FormControl><InputLabel>Achado</InputLabel><Select value={findingCode} label="Achado" onChange={e=>setFindingCode(e.target.value)}>
            {findings.map(f=><MenuItem key={f.id} value={f.code}>{f.label}</MenuItem>)}
          </Select></FormControl>
          <FormControl><InputLabel>Estado</InputLabel><Select value={clinicalState} label="Estado" onChange={e=>setClinicalState(e.target.value as ClinicalState)}>
            {(['CURRENT','PLANNED','COMPLETED'] as ClinicalState[]).map(s=><MenuItem key={s} value={s}>{stateLabel[s]}</MenuItem>)}
          </Select></FormControl>
          <Button variant="contained" disabled={!markTeeth.length||!activeFinding} onClick={()=>void saveMark()}>{markTeeth.length>1?`Salvar em ${markTeeth.length} dentes`:'Salvar'}</Button>
        </Box>
        <TextField fullWidth label="Observações" value={notes} onChange={e=>setNotes(e.target.value)} sx={{mt:1.5}}/>
      </Paper>
      <Paper variant="outlined" sx={{p:2,borderRadius:3}}>
        <Box sx={{display:'flex',justifyContent:'flex-end',mb:1}}><Button startIcon={<FullscreenIcon/>} onClick={()=>setFullscreen(true)}>Tela cheia</Button></Box>
        <Box sx={{display:'flex',gap:3,flexDirection:{xs:'column',lg:'row'}}}>
          <Box sx={{flex:1,minWidth:0}}><OdontogramBoard entries={entries} dentition={dentition} onToothClick={openTooth}/></Box>
          <OdontogramLegend entries={entries.filter(e=>e.dentition===dentition)}/>
        </Box>
      </Paper>
    </>}

    {tab===1 && <Paper variant="outlined" sx={{p:2,borderRadius:3}}>
      <Typography variant="h6" sx={{ fontWeight:900 }}>Novo exame periodontal</Typography>
      <Stack direction={{xs:'column',md:'row'}} spacing={1.5} sx={{my:2}}>
        <TextField label="Profissional" value={professionalName} onChange={e=>setProfessionalName(e.target.value)}/>
        <TextField fullWidth label="Observações gerais" value={examNotes} onChange={e=>setExamNotes(e.target.value)}/>
        <Button variant="contained" onClick={()=>void saveExam()}>Salvar exame</Button>
      </Stack>
      <Box sx={{overflowX:'auto'}}>
        <Box sx={{minWidth:1100}}>
          {teeth.map(tooth=><Box key={tooth} sx={{display:'grid',gridTemplateColumns:'70px repeat(6, 1fr)',gap:.5,mb:.75,alignItems:'center'}}>
            <Typography sx={{ fontWeight:900 }}>FDI {tooth}</Typography>
            {SITES.map(site=>{
              const r=getRecord(tooth,site)
              return <Paper key={site} variant="outlined" sx={{p:.75}}>
                <Typography variant="caption" sx={{ fontWeight:900 }}>{site}</Typography>
                <TextField size="small" type="number" label="PS" value={r.probingDepth} onChange={e=>patchRecord(tooth,site,{probingDepth:Number(e.target.value)})} sx={{mt:.5}}/>
                <TextField size="small" type="number" label="REC" value={r.recession} onChange={e=>patchRecord(tooth,site,{recession:Number(e.target.value)})} sx={{mt:.5}}/>
                <Stack direction="row" spacing={.5} sx={{ mt:.5, flexWrap:"wrap" }}>
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
          <Typography sx={{ fontWeight:900 }}>{new Date(exam.examinedAt).toLocaleString('pt-BR')} • {exam.professionalName||'Profissional não informado'}</Typography>
          <Typography color="text.secondary">{exam.sites.length} sítio(s) registrados • {exam.notes||'Sem observações gerais'}</Typography>
        </Paper>)}
    </Stack>}
    <Dialog open={colorsOpen} onClose={()=>setColorsOpen(false)} fullWidth maxWidth="xs">
      <DialogTitle sx={{fontWeight:900}}>Cores do odontograma</DialogTitle>
      <DialogContent>
        <Typography sx={{fontWeight:800,mb:1}}>Planejado / a fazer (cores claras)</Typography>
        <Box sx={{display:'flex',gap:1,flexWrap:'wrap',mb:2.5}}>
          {PLANNED_PALETTE.map(c=><Box key={c.value} title={c.name} onClick={()=>setPickTodo(c.value)} sx={{width:40,height:40,borderRadius:'50%',bgcolor:c.value,cursor:'pointer',border:pickTodo===c.value?'4px solid #111':'2px solid #bbb'}}/>)}
        </Box>
        <Typography sx={{fontWeight:800,mb:1}}>Concluído (cores escuras)</Typography>
        <Box sx={{display:'flex',gap:1,flexWrap:'wrap',mb:2}}>
          {DONE_PALETTE.map(c=><Box key={c.value} title={c.name} onClick={()=>setPickDone(c.value)} sx={{width:40,height:40,borderRadius:'50%',bgcolor:c.value,cursor:'pointer',border:pickDone===c.value?'4px solid #f9a825':'2px solid #bbb'}}/>)}
        </Box>
        <Typography variant="caption" color="text.secondary">As cores ficam salvas neste navegador. Planejado e concluído nunca usam a mesma cor.</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={()=>{saveOdontogramColors(DEFAULT_PLANNED.value,DEFAULT_DONE.value);setColorsOpen(false)}}>Voltar ao padrão</Button>
        <Button onClick={()=>setColorsOpen(false)}>Cancelar</Button>
        <Button variant="contained" disabled={pickTodo===pickDone} onClick={()=>{if(saveOdontogramColors(pickTodo,pickDone))setColorsOpen(false)}}>Salvar cores</Button>
      </DialogActions>
    </Dialog>
    <Dialog open={toothOpen!==null} onClose={()=>setToothOpen(null)} fullWidth maxWidth="sm">
      <DialogTitle sx={{fontWeight:900}}>Dente {toothOpen}</DialogTitle>
      <DialogContent>
        {toothEntries.length===0 && <Alert severity="info" sx={{mb:2}}>Nenhuma marcação neste dente.</Alert>}
        <Stack spacing={1} sx={{mb:2}}>
          {toothEntries.map(e=><Paper key={e.id} variant="outlined" sx={{p:1.2,display:'flex',alignItems:'center',gap:1,flexWrap:'wrap',borderLeft:`6px solid ${isDone(e.clinicalState)?DONE_COLOR:TODO_COLOR}`}}>
            <Box sx={{flex:1,minWidth:160}}>
              <Typography sx={{fontWeight:800}}>{e.surface?`Face ${e.surface} • `:''}{e.findingLabel}</Typography>
              <Typography variant="caption" color="text.secondary">{isDone(e.clinicalState)?'Concluído':'A fazer'}{e.notes?` • ${e.notes}`:''}</Typography>
            </Box>
            {isDone(e.clinicalState)
              ? <Button size="small" onClick={()=>void setEntryState(e,'PLANNED')}>Voltar para a fazer</Button>
              : <Button size="small" variant="contained" sx={{bgcolor:DONE_COLOR,'&:hover':{bgcolor:'#333'}}} onClick={()=>void setEntryState(e,'COMPLETED')}>Marcar concluído</Button>}
            <Button size="small" color="error" onClick={()=>void removeEntry(e)}>Remover</Button>
          </Paper>)}
        </Stack>
        <Typography sx={{fontWeight:900,mb:1}}>Adicionar procedimento</Typography>
        <Box sx={{mb:1.5}}><TeethPicker teeth={teeth} value={markTeeth} onChange={setMarkTeeth} label="Repetir em outros dentes (opcional)"/></Box>
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},gap:1.5}}>
          <FormControl size="small" sx={{gridColumn:{sm:'1/-1'}}}><InputLabel>Procedimento (implante, coroa, núcleo, extração, intrusão...)</InputLabel><Select value={findingCode} label="Procedimento (implante, coroa, núcleo, extração, intrusão...)" onChange={e=>setFindingCode(e.target.value)}>
            {findings.map(f=><MenuItem key={f.id} value={f.code}>{f.label}</MenuItem>)}
          </Select></FormControl>
          <FormControl size="small"><InputLabel>Situação</InputLabel><Select value={clinicalState} label="Situação" onChange={e=>setClinicalState(e.target.value as ClinicalState)}>
            {(['PLANNED','COMPLETED'] as ClinicalState[]).map(x=><MenuItem key={x} value={x}>{stateLabel[x]}</MenuItem>)}
          </Select></FormControl>
          <FormControl size="small"><InputLabel>Face (opcional)</InputLabel><Select value={surface} label="Face (opcional)" onChange={e=>setSurface(e.target.value as ToothSurface|'')}>
            <MenuItem value="">Dente inteiro</MenuItem>{SURFACES.map(x=><MenuItem key={x} value={x}>{x}</MenuItem>)}
          </Select></FormControl>
          <TextField size="small" sx={{gridColumn:{sm:'1/-1'}}} label="Observações — o que foi feito neste dente (opcional)" value={notes} onChange={e=>setNotes(e.target.value)}/>
        </Box>
        <Button sx={{mt:1.5}} size="small" onClick={()=>navigate(`/ficha-paciente?patientId=${encodeURIComponent(patientId)}&aba=executados`)}>Ver procedimentos executados na ficha do paciente</Button>
      </DialogContent>
      <DialogActions>
        <Button onClick={()=>setToothOpen(null)}>Fechar</Button>
        <Button variant="contained" disabled={!activeFinding||!markTeeth.length} onClick={()=>void saveMark()}>{markTeeth.length>1?`Adicionar em ${markTeeth.length} dentes`:'Adicionar'}</Button>
      </DialogActions>
    </Dialog>

    <Dialog fullScreen open={fullscreen} onClose={()=>setFullscreen(false)}>
      <AppBar position="sticky" color="default" elevation={1}>
        <Toolbar sx={{gap:2}}>
          <Typography sx={{flex:1,fontWeight:900,fontSize:{xs:16,md:20}}}>Odontograma • {patientName}</Typography>
          <FormControl size="small" sx={{minWidth:150}}><Select value={dentition} onChange={e=>setDentition(e.target.value as Dentition)}>
            <MenuItem value="ADULT">Adulto • FDI</MenuItem><MenuItem value="CHILD">Infantil • FDI</MenuItem>
          </Select></FormControl>
          <Button variant="contained" onClick={()=>setFullscreen(false)} startIcon={<CloseIcon/>}>Fechar tela cheia</Button>
        </Toolbar>
      </AppBar>
      <Box sx={{p:{xs:1.5,md:3},display:'grid',gap:3}}>
        {error && <Alert severity="error" onClose={()=>setError('')}>{error}</Alert>}
        <PatientAlertBanner patientId={patientId}/>
        {procedureCard}
        <Box sx={{display:'flex',gap:4,flexDirection:{xs:'column',lg:'row'}}}>
          <Box sx={{flex:1,minWidth:0}}><OdontogramBoard big entries={entries} dentition={dentition} onToothClick={openTooth}/></Box>
          <Paper variant="outlined" sx={{p:2,borderRadius:3,alignSelf:'flex-start'}}><OdontogramLegend entries={entries.filter(e=>e.dentition===dentition)}/></Paper>
        </Box>
        <Paper variant="outlined" sx={{p:2,borderRadius:3}}>
          <Typography sx={{fontWeight:900,mb:1,color:TODO_TEXT}}>O que falta fazer ({todoList.length})</Typography>
          {todoList.length===0
            ? <Typography color="text.secondary">Nada pendente neste odontograma.</Typography>
            : <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,1fr)',xl:'repeat(3,1fr)'},gap:1}}>
                {todoList.map(e=><Paper key={e.id} variant="outlined" onClick={()=>openTooth(e.tooth)} sx={{p:1,cursor:'pointer',borderLeft:`6px solid ${TODO_COLOR}`}}>
                  <Typography sx={{fontWeight:800}}>Dente {e.tooth}{e.surface?` • face ${e.surface}`:''} — {e.findingLabel}</Typography>
                  {e.notes && <Typography variant="caption" color="text.secondary">{e.notes}</Typography>}
                </Paper>)}
              </Box>}
        </Paper>
      </Box>
      
    </Dialog>
  </Box>
}
