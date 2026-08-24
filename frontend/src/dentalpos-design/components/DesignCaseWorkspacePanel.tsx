import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Chip, MenuItem, Paper, Slider, TextField, Typography } from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import JoinInnerIcon from "@mui/icons-material/JoinInner";
import type { IntegratedLaboratoryWork } from "../../types/operationsHub";
import { getLaboratoryWorks, updateLaboratoryWork } from "../../services/OperationsHubService";

export type DesignSculptTool = "Navegação" | "Delimitar término" | "Acrescentar" | "Remover" | "Suavizar" | "Esculpir";
export type DentalCharacter = "Jovem" | "Adulto" | "Idoso" | "Natural suave" | "Marcado";

interface Props {
  antagonistFile: File | null;
  biteFile: File | null;
  onAntagonistFile: (file: File | null) => void;
  onBiteFile: (file: File | null) => void;
  tool: DesignSculptTool;
  onTool: (tool: DesignSculptTool) => void;
  brushStrength: number;
  onBrushStrength: (value: number) => void;
  character: DentalCharacter;
  onCharacter: (value: DentalCharacter) => void;
  onOcclude: () => void;
}

export default function DesignCaseWorkspacePanel({ antagonistFile, biteFile, onAntagonistFile, onBiteFile, tool, onTool, brushStrength, onBrushStrength, character, onCharacter, onOcclude }: Props) {
  const antagonistRef=useRef<HTMLInputElement|null>(null); const biteRef=useRef<HTMLInputElement|null>(null);
  const [labWork,setLabWork]=useState<IntegratedLaboratoryWork|null>(null);
  useEffect(()=>{ try { const raw=localStorage.getItem("dentalpos.design.activeLabWork.v1"); if(!raw) return; const ref=JSON.parse(raw) as {id?:number}; const work=getLaboratoryWorks().find(w=>w.id===ref.id); if(work) setLabWork(work); } catch { /* ignore */ } },[]);
  const completeness=useMemo(()=>{ if(!labWork) return 0; const checks=[labWork.toothShade,labWork.workType,labWork.patientReturnDateISO,labWork.impressionType,(labWork.receivedItems||[]).length>0]; return Math.round(checks.filter(Boolean).length/checks.length*100); },[labWork]);
  const choose=(kind:"antagonist"|"bite",file:File|null)=>{ if(file&&!file.name.toLowerCase().endsWith(".stl")){alert("Selecione um arquivo STL válido.");return;} if(kind==="antagonist")onAntagonistFile(file);else onBiteFile(file); if(labWork&&file){ const patch=kind==="antagonist"?{upperScanFileName:file.name}:{biteFileName:file.name}; updateLaboratoryWork(labWork.id,{...patch,designStatus:"Em desenho"},`${kind==="antagonist"?"Modelo antagonista":"Registro de mordida"} carregado no DentalPos Design.`); setLabWork(getLaboratoryWorks().find(w=>w.id===labWork.id)||labWork); }};
  return <Paper elevation={0} sx={{mb:1.25,p:1.25,bgcolor:"#0d1825",color:"white",border:"1px solid #243447",borderRadius:2.5}}>
    <input ref={antagonistRef} type="file" accept=".stl" hidden onChange={e=>{choose("antagonist",e.target.files?.[0]||null);e.target.value=""}}/><input ref={biteRef} type="file" accept=".stl" hidden onChange={e=>{choose("bite",e.target.files?.[0]||null);e.target.value=""}}/>
    <Box sx={{display:"flex",gap:1,alignItems:"center",justifyContent:"space-between",flexWrap:"wrap"}}><Box><Typography sx={{fontWeight:900}}>Caso clínico + registros intermaxilares</Typography><Typography variant="caption" sx={{color:"#94a3b8"}}>{labWork?`${labWork.patientName} • ${labWork.workType} • dentes ${labWork.teeth||"—"}`:"Abra um caso pela fila do Laboratório para herdar os dados clínicos."}</Typography></Box>{labWork&&<Chip size="small" label={`Ficha ${completeness}%`} color={completeness===100?"success":"warning"}/>}</Box>
    {labWork&&<Box sx={{display:"flex",gap:.6,flexWrap:"wrap",mt:1}}><Chip size="small" label={`Cor ${labWork.toothShade||"—"}`}/><Chip size="small" label={labWork.faceBiotype||"Biotipo não informado"}/><Chip size="small" label={labWork.faceShape||"Formato não informado"}/><Chip size="small" label={`${labWork.patientAge||"—"} anos`}/><Chip size="small" label={labWork.patientSex||"Sexo não informado"}/></Box>}
    <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",lg:"1.1fr 1.1fr 1.5fr"},gap:1.2,mt:1.3}}>
      <Button size="small" variant={antagonistFile?"contained":"outlined"} startIcon={<UploadFileIcon/>} onClick={()=>antagonistRef.current?.click()}>{antagonistFile?`Antagonista: ${antagonistFile.name}`:"Importar antagonista"}</Button>
      <Button size="small" variant={biteFile?"contained":"outlined"} startIcon={<JoinInnerIcon/>} onClick={()=>biteRef.current?.click()}>{biteFile?`Mordida: ${biteFile.name}`:"Importar registro de mordida"}</Button>
      <Button size="small" variant="contained" color="secondary" disabled={!antagonistFile||!biteFile} startIcon={<AutoFixHighIcon/>} onClick={onOcclude}>Ocluir conforme registro (Alpha)</Button>
    </Box>
    <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",md:"1.2fr 1fr 1fr"},gap:1.2,mt:1.3,alignItems:"center"}}>
      <TextField select size="small" label="Ferramenta ativa" value={tool} onChange={e=>onTool(e.target.value as DesignSculptTool)} sx={{"& .MuiInputBase-root":{color:"white"},"& .MuiInputLabel-root":{color:"#94a3b8"}}}>{["Navegação","Delimitar término","Acrescentar","Remover","Suavizar","Esculpir"].map(v=><MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField>
      <TextField select size="small" label="Caracterização" value={character} onChange={e=>onCharacter(e.target.value as DentalCharacter)} sx={{"& .MuiInputBase-root":{color:"white"},"& .MuiInputLabel-root":{color:"#94a3b8"}}}>{["Jovem","Adulto","Idoso","Natural suave","Marcado"].map(v=><MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField>
      <Box><Typography variant="caption" sx={{color:"#94a3b8"}}>Intensidade da ferramenta: {brushStrength}%</Typography><Slider size="small" min={5} max={100} value={brushStrength} onChange={(_,v)=>onBrushStrength(v as number)}/></Box>
    </Box>
    <Box sx={{mt:1.2,p:1,borderRadius:2,bgcolor:"rgba(56,189,248,.08)",border:"1px solid rgba(56,189,248,.2)"}}><Typography variant="caption" sx={{color:"#bae6fd",fontWeight:800}}>Guia oclusal</Typography><Typography variant="caption" sx={{display:"block",color:"#cbd5e1",mt:.4}}>Andrews: relação molar, angulação mesiodistal, inclinação vestibulolingual, ausência de rotações, contatos proximais e curva de Spee. Vista oclusal: inferior com anterior curvo e posteriores mais retilíneos em V; superior mais ovoide, pré-molares discretamente vestibulares e molares fechando suavemente para palatino. Conferir sulcos, cristas marginais e pontos de contato.</Typography></Box>
  </Paper>
}
