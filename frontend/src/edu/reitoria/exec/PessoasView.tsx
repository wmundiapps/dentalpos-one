import { Alert, Box, Button, MenuItem, Paper, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { eduApi } from "../../../services/EduApi";
import { Section, useToast } from "../../regulatorio/ui";
import PainelRemoto from "./Painel";

const GRUPOS = ["ADMINISTRATIVO", "DOCENTE", "COORDENACAO", "APOIO", "OUTRO"];

/** Avaliação de funcionários: painel agregado (sem dados individuais) + lançamento de resumo + sincronização com o RH. */
export default function PessoasView() {
  const [v, setV] = useState(0);
  const [f, setF] = useState<any>({ ciclo: String(new Date().getFullYear()), setor: "", grupo: "ADMINISTRATIVO", avaliados: "", concluidas: "", notaMedia: "", escalaMax: "5" });
  const { toast, node } = useToast();
  async function lancar() {
    try {
      await eduApi.put("/reitoria/pessoas/resumos", { ciclo: f.ciclo, setor: f.setor, grupo: f.grupo, avaliados: Number(f.avaliados), concluidas: Number(f.concluidas), escalaMax: Number(f.escalaMax), ...(f.notaMedia !== "" ? { notaMedia: Number(f.notaMedia) } : {}) });
      toast({ type: "success", text: "Resumo salvo." }); setV((x) => x + 1);
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function sincronizar() {
    try { const r = await eduApi.post("/reitoria/pessoas/sincronizar-rh"); toast({ type: r.disponivel ? "success" : "error", text: r.disponivel ? `${r.sincronizados} resumo(s) trazidos do RH.` : "O módulo de RH ainda não tem ciclos de avaliação." }); setV((x) => x + 1); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>Esta tela mostra apenas <b>resultados agregados por setor</b> (nunca a nota de uma pessoa). Setores com menos de 3 avaliados ficam ocultos para proteger o sigilo.</Alert>
      <PainelRemoto key={v} id="pessoas" />
      <Section title="Lançar resumo do ciclo" action={<Button size="small" onClick={sincronizar}>Trazer do RH</Button>}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(6, 1fr) auto" }, gap: 1.5, alignItems: "center" }}>
          <TextField size="small" label="Ciclo" value={f.ciclo} onChange={(e) => setF({ ...f, ciclo: e.target.value })} />
          <TextField size="small" label="Setor" value={f.setor} onChange={(e) => setF({ ...f, setor: e.target.value })} />
          <TextField select size="small" label="Grupo" value={f.grupo} onChange={(e) => setF({ ...f, grupo: e.target.value })}>{GRUPOS.map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}</TextField>
          <TextField size="small" type="number" label="Avaliados" value={f.avaliados} onChange={(e) => setF({ ...f, avaliados: e.target.value })} />
          <TextField size="small" type="number" label="Concluídas" value={f.concluidas} onChange={(e) => setF({ ...f, concluidas: e.target.value })} />
          <TextField size="small" type="number" label="Nota média" value={f.notaMedia} onChange={(e) => setF({ ...f, notaMedia: e.target.value })} />
          <Button variant="contained" onClick={lancar} disabled={!f.setor || f.avaliados === "" || f.concluidas === ""}>Salvar</Button>
        </Box>
        <Paper variant="outlined" sx={{ p: 1, mt: 1.5, borderStyle: "dashed" }}><Typography variant="caption" color="text.secondary">Reenviar o mesmo ciclo/setor/grupo atualiza o resumo existente.</Typography></Paper>
      </Section>
      {node}
    </Box>
  );
}
