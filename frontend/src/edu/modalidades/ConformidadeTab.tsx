import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, LinearProgress, MenuItem, Snackbar, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { Card, Loadable, Section, Semaforo, abrirHtml, useAsync } from "./kit";

const MODS = ["PRESENCIAL", "SEMIPRESENCIAL", "EAD", "HIBRIDO"];
const nivelOf = (r: any): "ok" | "atencao" | "critico" =>
  !r.conforme || (r.alertas || []).some((a: any) => a.severidade === "CRITICO") ? "critico" : (r.alertas || []).some((a: any) => a.severidade === "ATENCAO") ? "atencao" : "ok";

const CFG_FIELDS: Array<[string, string]> = [
  ["maxPctEadPresencial", "% máx. EAD em curso presencial"], ["minPctPresencialSemi", "% mín. presencial em semipresencial"], ["maxPctEadSemi", "% máx. EAD em semipresencial"],
  ["minEncontrosPresenciaisEad", "Encontros presenciais mín. (EAD)"], ["minAvaliacoesPresenciaisEad", "Avaliações presenciais mín. (EAD)"],
  ["alunosPorTutorEad", "Alunos por tutor (EAD)"], ["alunosPorTutorSemi", "Alunos por tutor (semipresencial)"],
  ["slaRespostaHoras", "SLA de resposta (h)"], ["slaUrgenteHoras", "SLA urgente (h)"], ["diasInatividadeAtencao", "Dias de inatividade: atenção"], ["diasInatividadeCritico", "Dias de inatividade: crítico"],
  ["presencaMinimaLivePct", "Presença mínima em aula ao vivo (%)"], ["cargaMinimaLato", "Carga mínima lato sensu (h)"],
  ["prazoMaxMesesMestrado", "Prazo máx. mestrado (meses)"], ["prazoMaxMesesDoutorado", "Prazo máx. doutorado (meses)"], ["prazoMaxMesesLato", "Prazo máx. lato (meses)"], ["maxOrientandosPorDocente", "Máx. orientandos por docente"],
];

/** Conformidade EAD/semipresencial: semáforo por curso, simulador, regras e relatório. */
export default function ConformidadeTab() {
  const painel = useAsync(() => eduApi.get("/modalidades/painel"), []);
  const conf = useAsync(() => eduApi.get("/modalidades/conformidade"), []);
  const [msg, setMsg] = useState<{ t: "success" | "error"; s: string } | null>(null);
  const [det, setDet] = useState<any | null>(null);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const p = painel.data; const c = conf.data;
  const cursos: any[] = c?.cursos || [];

  async function verificar(programId: string) {
    try { setDet(await eduApi.get(`/modalidades/conformidade/programas/${programId}?registrar=true`)); setMsg({ t: "success", s: "Verificação registrada no histórico." }); }
    catch (e: any) { setMsg({ t: "error", s: e.message }); }
  }
  async function bootstrap() {
    try { const r = await eduApi.post("/modalidades/bootstrap", {}); setMsg({ t: "success", s: `Regras e checklists padrão aplicados (${r.polosAtualizados} polo(s), ${r.itensChecklistCriados} item(ns)).` }); painel.reload(); }
    catch (e: any) { setMsg({ t: "error", s: e.message }); }
  }

  return (
    <Box>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>
        <Loadable loading={painel.loading} error={painel.error}>
          <Card label="Polos credenciados" value={`${p?.polosCredenciados ?? 0}/${p?.polos ?? 0}`} color="#16a34a" />
          <Card label="Atendimentos abertos" value={p?.atendimentosAbertos ?? 0} />
          <Card label="Atendimentos com SLA vencido" value={p?.atendimentosComSlaVencido ?? 0} color="#dc2626" />
          <Card label="Alunos inativos (alertas)" value={p?.alunosInativosAlerta ?? 0} color="#ca8a04" />
          <Card label="Lives nos próximos 7 dias" value={p?.livesProximos7d ?? 0} color="#7c3aed" />
          <Card label="Alunos de pós ativos" value={p?.posAlunosAtivos ?? 0} color="#0891b2" />
        </Loadable>
      </Box>

      <Section title="Conformidade por curso" hint="Verifica o percentual de carga EAD, encontros presenciais, avaliações presenciais e a relação aluno/tutor conforme as regras configuradas."
        actions={<>
          <Button size="small" onClick={() => setSimOpen(true)}>Simulador</Button>
          <Button size="small" onClick={() => setCfgOpen(true)}>Regras</Button>
          <Button size="small" onClick={() => abrirHtml("/modalidades/relatorios/conformidade").catch((e) => setMsg({ t: "error", s: e.message }))}>Relatório (HTML)</Button>
          <Button size="small" onClick={bootstrap}>Aplicar padrões</Button>
        </>}>
        <Loadable loading={conf.loading} error={conf.error}>
          {c?.resumo && Object.keys(c.resumo).length ? (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
              {Object.entries<any>(c.resumo).map(([m, v]) => <Chip key={m} label={`${m}: ${v.conformes}/${v.cursos} conformes`} color={v.naoConformes ? "warning" : "success"} variant="outlined" />)}
            </Box>
          ) : null}
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead><TableRow><TableCell /><TableCell sx={{ fontWeight: 800 }}>Curso</TableCell><TableCell sx={{ fontWeight: 800 }}>Modalidade</TableCell><TableCell sx={{ fontWeight: 800, minWidth: 140 }}>% EAD</TableCell><TableCell sx={{ fontWeight: 800 }}>Alertas</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>
                {cursos.map((r) => (
                  <TableRow key={r.programId} hover>
                    <TableCell><Semaforo nivel={nivelOf(r)} /></TableCell>
                    <TableCell>{r.nome}</TableCell>
                    <TableCell>{r.modalidade}</TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <LinearProgress variant="determinate" value={Math.min(100, r.percentualEad)} color={r.conforme ? "primary" : "error"} sx={{ flex: 1, height: 8, borderRadius: 4 }} />
                        <Typography variant="caption">{r.percentualEad}%</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>{(r.alertas || []).length ? (r.alertas as any[]).slice(0, 3).map((a, i) => <Typography key={i} variant="caption" sx={{ display: "block" }} color={a.severidade === "CRITICO" ? "error" : "text.secondary"}>• {a.mensagem}</Typography>) : <Typography variant="caption" color="success.main">Conforme</Typography>}</TableCell>
                    <TableCell align="right"><Button size="small" onClick={() => verificar(r.programId)}>Verificar</Button></TableCell>
                  </TableRow>
                ))}
                {!cursos.length && <TableRow><TableCell colSpan={6}><Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>Nenhum curso cadastrado para avaliar.</Typography></TableCell></TableRow>}
              </TableBody>
            </Table>
          </Box>
        </Loadable>
      </Section>

      <Dialog open={!!det} onClose={() => setDet(null)} fullWidth maxWidth="md">
        <DialogTitle>{det?.program?.nome} — {det?.conforme ? "Conforme" : "Não conforme"}</DialogTitle>
        <DialogContent dividers>
          {det ? (
            <>
              <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>
                <Card label="% EAD" value={`${det.percentualEad}%`} hint={det.limiteEad != null ? `limite ${det.limiteEad}%` : undefined} color={det.conforme ? "#16a34a" : "#dc2626"} />
                <Card label="% presencial" value={`${det.percentualPresencial}%`} hint={det.minimoPresencial != null ? `mínimo ${det.minimoPresencial}%` : undefined} />
                <Card label="Carga total (h)" value={det.cargaTotal} />
              </Box>
              {(det.alertas || []).map((a: any, i: number) => <Alert key={i} sx={{ mb: 1 }} severity={a.severidade === "CRITICO" ? "error" : a.severidade === "ATENCAO" ? "warning" : "info"}>{a.mensagem}</Alert>)}
              <Typography variant="subtitle2" sx={{ mt: 1 }}>Por disciplina</Typography>
              <Table size="small"><TableHead><TableRow><TableCell>Disciplina</TableCell><TableCell align="right">Carga</TableCell><TableCell align="right">% EAD</TableCell><TableCell>Situação</TableCell></TableRow></TableHead>
                <TableBody>{(det.porDisciplina || []).map((d: any) => <TableRow key={d.id}><TableCell>{d.nome}</TableCell><TableCell align="right">{d.carga}h</TableCell><TableCell align="right">{d.percentualEad}%</TableCell><TableCell><Semaforo nivel={d.conforme ? "ok" : "critico"} label={d.conforme ? "OK" : "Fora do limite"} /></TableCell></TableRow>)}</TableBody></Table>
            </>
          ) : null}
        </DialogContent>
        <DialogActions><Button onClick={() => setDet(null)}>Fechar</Button></DialogActions>
      </Dialog>

      {cfgOpen && <ConfigDialog onClose={() => setCfgOpen(false)} onMsg={(t, s) => { setMsg({ t, s }); if (t === "success") conf.reload(); }} />}
      {simOpen && <SimuladorDialog onClose={() => setSimOpen(false)} />}
      <Snackbar open={!!msg} autoHideDuration={4500} onClose={() => setMsg(null)}>
        {msg ? <Alert severity={msg.t} onClose={() => setMsg(null)}>{msg.s}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}

function ConfigDialog({ onClose, onMsg }: { onClose: () => void; onMsg: (t: "success" | "error", s: string) => void }) {
  const { data, loading, error } = useAsync(() => eduApi.get("/modalidades/config"), []);
  const [form, setForm] = useState<Record<string, string>>({});
  const val = (k: string) => form[k] ?? (data?.[k] != null ? String(data[k]) : "");
  async function salvar() {
    try {
      const body: Record<string, number> = {};
      CFG_FIELDS.forEach(([k]) => { const v = val(k); if (v !== "") body[k] = Number(v); });
      await eduApi.put("/modalidades/config", body); onMsg("success", "Regras salvas."); onClose();
    } catch (e: any) { onMsg("error", e.message); }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Regras de modalidade</DialogTitle>
      <DialogContent dividers>
        <Loadable loading={loading} error={error}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, pt: 1 }}>
            {CFG_FIELDS.map(([k, l]) => <TextField key={k} size="small" type="number" label={l} value={val(k)} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />)}
          </Box>
        </Loadable>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" onClick={salvar} disabled={!data}>Salvar</Button></DialogActions>
    </Dialog>
  );
}

function SimuladorDialog({ onClose }: { onClose: () => void }) {
  const [modalidade, setModalidade] = useState("EAD");
  const [discs, setDiscs] = useState([{ nome: "Disciplina 1", cargaPresencial: "20", cargaOnline: "60" }]);
  const [alunos, setAlunos] = useState(""); const [tutores, setTutores] = useState("");
  const [res, setRes] = useState<any | null>(null); const [err, setErr] = useState<string | null>(null);
  async function simular() {
    setErr(null);
    try {
      setRes(await eduApi.post("/modalidades/conformidade/simular", {
        modalidade, alunos: alunos ? Number(alunos) : undefined, tutores: tutores ? Number(tutores) : undefined,
        disciplinas: discs.map((d, i) => ({ id: `d${i}`, nome: d.nome, cargaPresencial: Number(d.cargaPresencial) || 0, cargaOnline: Number(d.cargaOnline) || 0 })),
      }));
    } catch (e: any) { setErr(e.message); setRes(null); }
  }
  const upd = (i: number, k: string, v: string) => setDiscs(discs.map((d, j) => (j === i ? { ...d, [k]: v } : d)));
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Simulador de conformidade</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Informe uma distribuição hipotética de carga horária. Nada é gravado.</Typography>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>
          <TextField select size="small" label="Modalidade" value={modalidade} onChange={(e) => setModalidade(e.target.value)} sx={{ minWidth: 180 }}>{MODS.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}</TextField>
          <TextField size="small" type="number" label="Alunos" value={alunos} onChange={(e) => setAlunos(e.target.value)} sx={{ width: 120 }} />
          <TextField size="small" type="number" label="Tutores" value={tutores} onChange={(e) => setTutores(e.target.value)} sx={{ width: 120 }} />
        </Box>
        {discs.map((d, i) => (
          <Box key={i} sx={{ display: "flex", gap: 1, mb: 1, alignItems: "center", flexWrap: "wrap" }}>
            <TextField size="small" label="Disciplina" value={d.nome} onChange={(e) => upd(i, "nome", e.target.value)} sx={{ flex: 1, minWidth: 160 }} />
            <TextField size="small" type="number" label="Presencial (h)" value={d.cargaPresencial} onChange={(e) => upd(i, "cargaPresencial", e.target.value)} sx={{ width: 130 }} />
            <TextField size="small" type="number" label="Online (h)" value={d.cargaOnline} onChange={(e) => upd(i, "cargaOnline", e.target.value)} sx={{ width: 130 }} />
            <Tooltip title="Remover"><span><IconButton disabled={discs.length < 2} onClick={() => setDiscs(discs.filter((_, j) => j !== i))}><DeleteOutlinedIcon /></IconButton></span></Tooltip>
          </Box>
        ))}
        <Button size="small" startIcon={<AddIcon />} onClick={() => setDiscs([...discs, { nome: `Disciplina ${discs.length + 1}`, cargaPresencial: "0", cargaOnline: "60" }])}>Adicionar disciplina</Button>
        {err ? <Alert severity="error" sx={{ mt: 2 }}>{err}</Alert> : null}
        {res ? (
          <Box sx={{ mt: 2 }}>
            <Alert severity={res.conforme ? "success" : "error"} sx={{ mb: 1 }}>{res.conforme ? "Conforme" : "Não conforme"} — {res.percentualEad}% EAD ({res.cargaOnline}h online de {res.cargaTotal}h){res.limiteEad != null ? `, limite ${res.limiteEad}%` : ""}</Alert>
            {(res.alertas || []).map((a: any, i: number) => <Alert key={i} sx={{ mb: 0.5 }} severity={a.severidade === "CRITICO" ? "error" : a.severidade === "ATENCAO" ? "warning" : "info"}>{a.mensagem}</Alert>)}
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button><Button variant="contained" onClick={simular}>Simular</Button></DialogActions>
    </Dialog>
  );
}
