import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, TextField, Typography } from "@mui/material";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import { useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import { Async, Light, Panel, ProgressBar, Stat, StatGrid, Tag, label, num, usePrograms, useApi, useToast } from "../infraestrutura/kit";
import { ObraPicker } from "./pickers";

const TONE: Record<string, "success" | "warning" | "error"> = { ADEQUADA: "success", PARCIAL: "warning", INADEQUADA: "error" };

function Bibliografia({ disc, onClose, onChanged }: { disc: any; onClose: () => void; onChanged: () => void }) {
  const st = useApi<any>(`/biblioteca/bibliografia/disciplina/${disc.disciplineId}`);
  const [obra, setObra] = useState<any | null>(null);
  const [tipo, setTipo] = useState("BASICA");
  const toast = useToast();
  const after = () => { st.reload(); onChanged(); };
  const lista = (titulo: string, itens: any[]) => (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{titulo} ({itens.length})</Typography>
      {itens.map((i) => (
        <Box key={i.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="body2" sx={{ flex: 1 }}>{i.obra?.titulo || "(obra removida)"} <Tag text={`${i.exemplares} ex. · ${i.disponiveis} disp.`} tone={i.exemplares ? "default" : "error"} /></Typography>
          <IconButton size="small" onClick={() => toast.run(() => eduApi.del(`/biblioteca/bibliografia/${i.id}`), "Vínculo removido.", after, "Remover esta obra da bibliografia?")}><DeleteOutlinedIcon fontSize="small" /></IconButton>
        </Box>
      ))}
      {!itens.length && <Typography variant="body2" color="text.secondary">Nenhum título.</Typography>}
    </Box>
  );
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Bibliografia — {disc.disciplina}</DialogTitle>
      <DialogContent dividers>
        <Async state={st}>{(d) => <Box sx={{ display: "grid", gap: 2 }}>{lista("Bibliografia básica", d.basica || [])}{lista("Bibliografia complementar", d.complementar || [])}</Box>}</Async>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "3fr 1fr auto" }, gap: 1, mt: 3, alignItems: "center" }}>
          <ObraPicker label="Adicionar obra" value={obra} onChange={setObra} />
          <TextField select size="small" label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}><MenuItem value="BASICA">Básica</MenuItem><MenuItem value="COMPLEMENTAR">Complementar</MenuItem></TextField>
          <Button variant="contained" disabled={!obra} onClick={() => toast.run(() => eduApi.post("/biblioteca/bibliografia", { disciplineId: disc.disciplineId, obraId: obra.id, tipo }), "Obra vinculada.", () => { setObra(null); after(); })}>Vincular</Button>
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      {toast.node}
    </Dialog>
  );
}

export default function AdequacaoBib() {
  const programs = usePrograms();
  const [programId, setProgramId] = useState("");
  const [status, setStatus] = useState("");
  const [bib, setBib] = useState<any | null>(null);
  const toast = useToast();
  const st = useApi<any>(programId ? `/biblioteca/adequacao${qsOf({ programId, status })}` : null);
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <TextField select size="small" label="Curso" value={programId} onChange={(e) => setProgramId(e.target.value)} sx={{ minWidth: 320 }}>{programs.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}</TextField>
        <TextField select size="small" label="Situação" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 160 }}><MenuItem value="">Todas</MenuItem>{["ADEQUADA", "PARCIAL", "INADEQUADA"].map((s) => <MenuItem key={s} value={s}>{label(s)}</MenuItem>)}</TextField>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" disabled={!programId} onClick={() => toast.run(() => eduApi.post("/biblioteca/adequacao/gerar-sugestoes", { programId }), "Sugestões de aquisição geradas a partir das lacunas.", st.reload, "Gerar sugestões de aquisição para as lacunas de bibliografia deste curso?")}>Gerar sugestões de aquisição</Button>
      </Box>
      {!programId ? <Alert severity="info">Selecione um curso para comparar a bibliografia da matriz curricular com o acervo (títulos e exemplares por vaga).</Alert> : (
        <Async state={st}>
          {(d) => (
            <>
              <StatGrid>
                <Stat label="Disciplinas" value={d.resumo?.disciplinas} /><Stat label="Adequadas" value={d.resumo?.adequadas} tone="success" /><Stat label="Parciais" value={d.resumo?.parciais} tone="warning" />
                <Stat label="Inadequadas" value={d.resumo?.inadequadas} tone={d.resumo?.inadequadas ? "error" : "success"} /><Stat label="Sem bibliografia" value={d.resumo?.semBibliografia} tone={d.resumo?.semBibliografia ? "error" : "success"} />
                <Stat label="Índice médio" value={`${d.resumo?.indiceMedio ?? 0}%`} hint={`Mín. ${d.parametros?.minTitulosBasicos} básicos / ${d.parametros?.minTitulosComplementares} compl. · 1 ex. a cada ${d.parametros?.vagasPorExemplar} vagas`} />
              </StatGrid>
              <Box sx={{ display: "grid", gap: 1.5 }}>
                {(d.disciplinas || []).map((x: any) => (
                  <Panel key={x.disciplineId} title={<Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}><span>{x.periodo ? `${x.periodo}º · ` : ""}{x.disciplina}</span><Light tone={TONE[x.status] || "default"} text={label(x.status)} /></Box>}
                    actions={<Button size="small" onClick={() => setBib(x)}>Bibliografia</Button>} sx={{ p: 2 }}>
                    <ProgressBar value={x.indice} color={TONE[x.status] || "primary"} />
                    <Typography variant="body2" sx={{ mt: 1 }}>{x.basicos} básico(s) · {x.complementares} complementar(es) · {num(x.vagas, 0)} vaga(s) · {x.exemplaresNecessariosPorTitulo} ex./título necessário(s)</Typography>
                    {(x.lacunas || []).map((l: any, i: number) => <Typography key={i} variant="body2" color="error">• {l.mensagem}</Typography>)}
                  </Panel>
                ))}
              </Box>
            </>
          )}
        </Async>
      )}
      {bib && <Bibliografia disc={bib} onClose={() => setBib(null)} onChanged={st.reload} />}
      {toast.node}
    </Box>
  );
}
