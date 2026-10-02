import { Alert, Box, Button, Chip, IconButton, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import CalculateIcon from "@mui/icons-material/Calculate";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { fmtDateTime, fmtNum, Progress, Section, Status, useApi, useToast } from "./ui";

const CPC = [["enade", "Enade"], ["idd", "IDD"], ["mestres", "Mestres"], ["doutores", "Doutores"], ["regime", "Regime de trabalho"], ["organizacaoDidatico", "Organização didático-pedagógica"], ["infraestrutura", "Infraestrutura"], ["oportunidades", "Oportunidades de ampliação"]];
const CC = [["organizacaoDidatico", "Organização didático-pedagógica"], ["corpoDocente", "Corpo docente e tutorial"], ["infraestrutura", "Infraestrutura"]];

function Resultado({ r }: { r: any }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mt: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
        <Typography variant="h3" sx={{ fontWeight: 800 }}>{fmtNum(r.continuo, 2)}</Typography>
        <Chip color={r.faixa >= 3 ? "success" : "error"} label={`Faixa ${r.faixa}`} sx={{ fontWeight: 800 }} />
      </Box>
      {r.alerta && <Alert severity="warning" sx={{ mb: 1 }}>{r.alerta}</Alert>}
      <Table size="small">
        <TableHead><TableRow><TableCell>Componente</TableCell><TableCell align="right">Peso</TableCell><TableCell align="right">Nota</TableCell><TableCell align="right">Contribuição</TableCell><TableCell align="right">Ganho potencial</TableCell></TableRow></TableHead>
        <TableBody>{(r.detalhes || []).map((d: any) => (
          <TableRow key={d.chave}><TableCell>{d.nome}</TableCell><TableCell align="right">{fmtNum(d.peso * 100, 0)}%</TableCell><TableCell align="right">{fmtNum(d.nota, 2)}</TableCell><TableCell align="right">{fmtNum(d.contribuicao, 3)}</TableCell><TableCell align="right">+{fmtNum(d.ganhoPotencial, 3)}</TableCell></TableRow>
        ))}</TableBody>
      </Table>
      {r.paraSubir && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Para subir para a faixa {r.paraSubir.proximaFaixa} (corte {fmtNum(r.paraSubir.corte, 2)})</Typography>
          <Typography variant="body2">Faltam {fmtNum(r.paraSubir.faltam, 3)} ponto(s) no contínuo.</Typography>
          {(r.paraSubir.caminho || []).length > 0 ? r.paraSubir.caminho.map((c: any) => (
            <Typography key={c.chave} variant="body2">• {c.nome}: de {fmtNum(c.deNota, 2)} para {fmtNum(c.paraNota, 2)}</Typography>
          )) : <Typography variant="body2" color="text.secondary">Não há caminho viável só com os componentes atuais.</Typography>}
        </Box>
      )}
      <Box sx={{ mt: 1.5 }}><Progress value={(Number(r.continuo) / 5) * 100} showLabel={false} /></Box>
    </Paper>
  );
}

export default function SimuladorTab() {
  const [tipo, setTipo] = useState<"cpc" | "cc">("cpc");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [rotulo, setRotulo] = useState("");
  const [salvar, setSalvar] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const { data: hist, reload } = useApi<any>("/regulatorio/simulacoes?pageSize=20");
  const { toast, node } = useToast();
  const campos = tipo === "cpc" ? CPC : CC;
  const [min, max] = tipo === "cpc" ? [0, 5] : [1, 5];

  async function calc() {
    setErr(null);
    try {
      const body: any = { rotulo: rotulo || undefined, salvar };
      campos.forEach(([k]) => { body[k] = Number(String(vals[k] ?? "").replace(",", ".")); });
      const r = await eduApi.post(`/regulatorio/simulador/${tipo}`, body);
      setRes(r);
      if (salvar) reload();
    } catch (e: any) { setErr(e.message); setRes(null); }
  }
  async function del(id: string) {
    if (!window.confirm("Remover esta simulação do histórico?")) return;
    try { await eduApi.del(`/regulatorio/simulacoes/${id}`); reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  const items: any[] = hist?.items || [];
  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>SIMULAÇÃO sem valor oficial. Pesos, faixas e cortes são padrões a conferir com a norma e a nota técnica vigentes do INEP.</Alert>
      <Section title="Simulador de conceitos">
        <ToggleButtonGroup size="small" exclusive value={tipo} onChange={(_, v) => { if (v) { setTipo(v); setRes(null); setErr(null); } }} sx={{ mb: 2 }}>
          <ToggleButton value="cpc">CPC (Conceito Preliminar de Curso)</ToggleButton><ToggleButton value="cc">CC (Conceito de Curso)</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
          {campos.map(([k, l]) => (
            <TextField key={k} size="small" type="number" label={`${l} (${min}-${max})`} value={vals[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} slotProps={{ htmlInput: { min, max, step: 0.01 } }} />
          ))}
        </Box>
        <Box sx={{ display: "flex", gap: 2, mt: 2, alignItems: "center", flexWrap: "wrap" }}>
          <TextField size="small" label="Rótulo (para salvar)" value={rotulo} onChange={(e) => { setRotulo(e.target.value); setSalvar(!!e.target.value); }} />
          <Button variant="contained" startIcon={<CalculateIcon />} disabled={campos.some(([k]) => vals[k] === undefined || vals[k] === "")} onClick={calc}>Simular{rotulo ? " e salvar" : ""}</Button>
        </Box>
        {err && <Alert severity="error" sx={{ mt: 2 }}>{err}</Alert>}
        {res && <Resultado r={res} />}
      </Section>
      <Section title="Histórico de simulações salvas">
        <Status empty={!items.length} emptyText="Nenhuma simulação salva (informe um rótulo ao simular).">
          {items.map((s) => (
            <Box key={s.id} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 0.5 }}>
              <Chip size="small" label={s.tipo} /><Typography variant="body2" sx={{ flex: 1 }}>{s.rotulo || "—"} · {fmtDateTime(s.createdAt)}</Typography>
              <Typography variant="body2"><b>{fmtNum(s.resultado?.continuo, 2)}</b> (faixa {s.resultado?.faixa})</Typography>
              <IconButton size="small" onClick={() => del(s.id)}><DeleteOutlinedIcon fontSize="small" /></IconButton>
            </Box>
          ))}
        </Status>
      </Section>
      {node}
    </Box>
  );
}
