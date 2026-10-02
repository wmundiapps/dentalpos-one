import { Alert, Box, Button, Checkbox, Chip, CircularProgress, FormControlLabel, FormGroup, LinearProgress, MenuItem, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { Card, DIAS_CURTO, fmtDT, itemsOf, Row, useGet, useTerms, usePrograms, useToast } from "./kit";

const TURNOS = [["MANHA", "Manhã"], ["TARDE", "Tarde"], ["NOITE", "Noite"]];
const SW: Array<[string, string]> = [
  ["preservarManuais", "Preservar aulas lançadas manualmente"], ["substituirGerados", "Substituir aulas geradas anteriormente"],
  ["considerarReservas", "Considerar reservas de espaços"], ["permitirPendencias", "Permitir aplicar com pendências"], ["notificarProfessores", "Notificar professores"],
];

export default function GeradorTab() {
  const terms = useTerms(); const programs = usePrograms();
  const [f, setF] = useState<Record<string, any>>({ termId: "", programId: "", periodos: "", dias: [1, 2, 3, 4, 5], turnos: [], semanasLetivas: "", horaAulaMin: "", maxAulasGrupoDia: 6,
    preservarManuais: true, substituirGerados: true, considerarReservas: true, permitirPendencias: true, notificarProfessores: true });
  const [busy, setBusy] = useState<string | null>(null);
  const [diag, setDiag] = useState<any>(null);
  const [sim, setSim] = useState<any>(null);
  const [aplicado, setAplicado] = useState<any>(null);
  const [erro, setErro] = useState<any>(null);
  const hist = useGet<any>("/calendario/gerador/execucoes?pageSize=10");
  const { toast, node } = useToast();

  const body = () => {
    const b: Record<string, any> = { termId: f.termId, dias: f.dias, maxAulasGrupoDia: Number(f.maxAulasGrupoDia) || 6 };
    if (f.programId) b.programId = f.programId;
    const per = String(f.periodos || "").split(/[,\s]+/).map(Number).filter((n) => n > 0);
    if (per.length) b.periodos = per;
    if (f.turnos.length) b.turnos = f.turnos;
    if (f.semanasLetivas) b.semanasLetivas = Number(f.semanasLetivas);
    if (f.horaAulaMin) b.horaAulaMin = Number(f.horaAulaMin);
    SW.forEach(([k]) => { b[k] = !!f[k]; });
    return b;
  };
  async function run(kind: "diagnostico" | "simular") {
    setBusy(kind); setErro(null); setAplicado(null);
    try {
      const r = await eduApi.post(`/calendario/gerador/${kind}`, body());
      if (kind === "diagnostico") setDiag(r); else { setSim(r); hist.reload(); }
    } catch (e: any) { setErro(e.message); } finally { setBusy(null); }
  }
  async function aplicar() {
    if (!sim) return;
    const msg = `Aplicar a simulação? Serão criadas ${sim.alocacoes?.length ?? 0} aulas na grade${sim.slotsQueSeriamSubstituidos ? ` e ${sim.slotsQueSeriamSubstituidos} aulas geradas anteriormente serão substituídas` : ""}${sim.pendencias?.length ? `. Atenção: ${sim.pendencias.length} pendência(s) ficarão sem alocação` : ""}.`;
    if (!window.confirm(msg)) return;
    setBusy("aplicar"); setErro(null);
    try {
      const r = await eduApi.post("/calendario/gerador/aplicar", { execucaoId: sim.execucaoId });
      setAplicado(r); setSim(null); hist.reload(); toast({ type: "success", text: `Cronograma aplicado: ${r.slotsCriados} aulas criadas.` });
    } catch (e: any) { setErro(e.message); } finally { setBusy(null); }
  }
  async function acao(id: string, a: "descartar" | "desfazer") {
    if (!window.confirm(a === "desfazer" ? "Desfazer esta aplicação? As aulas criadas por ela serão removidas (as substituídas NÃO são restauradas)." : "Descartar esta simulação?")) return;
    try { await eduApi.post(`/calendario/gerador/execucoes/${id}/${a}`, {}); hist.reload(); toast({ type: "success", text: "Feito." }); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }

  const m = sim?.metricas;
  const pctAloc = m && m.totalAulas ? Math.round((m.alocadas / m.totalAulas) * 100) : 0;
  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>Gerador automático de cronograma</Typography>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
          <TextField select size="small" required label="Período letivo" value={f.termId} onChange={(e) => setF({ ...f, termId: e.target.value })}>{terms.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}</TextField>
          <TextField select size="small" label="Curso (opcional)" value={f.programId} onChange={(e) => setF({ ...f, programId: e.target.value })}><MenuItem value="">Todos</MenuItem>{programs.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}</TextField>
          <TextField size="small" label="Períodos/semestres" placeholder="ex.: 1, 2, 3" value={f.periodos} onChange={(e) => setF({ ...f, periodos: e.target.value })} helperText="Vazio = todos" />
          <TextField size="small" type="number" label="Semanas letivas" value={f.semanasLetivas} onChange={(e) => setF({ ...f, semanasLetivas: e.target.value })} helperText="Vazio = calcular pelo calendário" />
          <TextField size="small" type="number" label="Duração da hora-aula (min)" value={f.horaAulaMin} onChange={(e) => setF({ ...f, horaAulaMin: e.target.value })} />
          <TextField size="small" type="number" label="Máx. aulas por dia/grupo" value={f.maxAulasGrupoDia} onChange={(e) => setF({ ...f, maxAulasGrupoDia: e.target.value })} />
        </Box>
        <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", mt: 1 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Dias da semana</Typography>
            <FormGroup row>{[1, 2, 3, 4, 5, 6, 7].map((d) => <FormControlLabel key={d} label={DIAS_CURTO[d]} control={<Checkbox size="small" checked={f.dias.includes(d)} onChange={(e) => setF({ ...f, dias: e.target.checked ? [...f.dias, d].sort() : f.dias.filter((x: number) => x !== d) })} />} />)}</FormGroup>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Turnos (nenhum = todos)</Typography>
            <FormGroup row>{TURNOS.map(([v, l]) => <FormControlLabel key={v} label={l} control={<Checkbox size="small" checked={f.turnos.includes(v)} onChange={(e) => setF({ ...f, turnos: e.target.checked ? [...f.turnos, v] : f.turnos.filter((x: string) => x !== v) })} />} />)}</FormGroup>
          </Box>
        </Box>
        <FormGroup row>{SW.map(([k, l]) => <FormControlLabel key={k} label={l} control={<Checkbox size="small" checked={!!f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />} />)}</FormGroup>
        <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
          <Button variant="outlined" disabled={!f.termId || !f.dias.length || !!busy} onClick={() => run("diagnostico")}>{busy === "diagnostico" ? "Analisando..." : "Diagnosticar"}</Button>
          <Button variant="contained" startIcon={busy === "simular" ? <CircularProgress size={16} color="inherit" /> : <AutoFixHighIcon />} disabled={!f.termId || !f.dias.length || !!busy} onClick={() => run("simular")}>{busy === "simular" ? "Simulando..." : "Simular cronograma"}</Button>
        </Box>
      </Paper>
      {erro ? <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert> : null}

      {diag ? (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Diagnóstico — {diag.periodo}</Typography>
          <Row>
            <Card label="Turmas" value={diag.turmas} /><Card label="Aulas a alocar" value={diag.aulasASeremAlocadas} color="#7c3aed" />
            <Card label="Professores" value={diag.professores} color="#0891b2" /><Card label="Espaços" value={diag.espacos} color="#16a34a" />
            <Card label="Células na malha" value={diag.celulasNaMalha} color="#ca8a04" /><Card label="Compromissos fixos" value={diag.compromissosFixos} color="#64748b" />
          </Row>
          {(diag.avisos || []).map((a: string, i: number) => <Alert key={i} severity="info" sx={{ mb: 0.5 }}>{a}</Alert>)}
          {(diag.gruposSobrecarregados || []).map((g: any, i: number) => <Alert key={i} severity="warning" sx={{ mb: 0.5 }}><b>{g.grupo}</b>: {g.aulas} aulas para {g.celulasDisponiveis} horários. {g.motivo}</Alert>)}
        </Paper>
      ) : null}

      {sim ? (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", mb: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>Resultado da simulação <Chip size="small" label="Nada foi gravado ainda" /></Typography>
            <Button variant="contained" color="success" disabled={!!busy || !sim.alocacoes?.length} onClick={aplicar}>{busy === "aplicar" ? "Aplicando..." : "Aplicar na grade"}</Button>
          </Box>
          <Row>
            <Card label="Aulas a alocar" value={m?.totalAulas} /><Card label="Alocadas" value={m?.alocadas} color="#16a34a" />
            <Card label="Pendentes" value={m?.pendentes} color={m?.pendentes ? "#dc2626" : "#16a34a"} /><Card label="Tempo" value={`${m?.ms ?? 0} ms`} color="#64748b" />
          </Row>
          <LinearProgress variant="determinate" value={pctAloc} color={pctAloc === 100 ? "success" : "warning"} sx={{ height: 10, borderRadius: 5, mb: 0.5 }} />
          <Typography variant="caption" color="text.secondary">{pctAloc}% das aulas alocadas{sim.slotsQueSeriamSubstituidos ? ` · ${sim.slotsQueSeriamSubstituidos} aulas geradas antes serão substituídas` : ""}</Typography>
          {(sim.avisos || []).map((a: string, i: number) => <Alert key={i} severity="info" sx={{ mt: 0.5 }}>{a}</Alert>)}

          {sim.pendencias?.length ? (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Pendências ({sim.pendencias.length})</Typography>
              {sim.pendencias.map((p: any, i: number) => (
                <Alert key={i} severity="warning" sx={{ mt: 1 }}>
                  <b>{p.disciplina || "Disciplina"}{p.turma ? ` — ${p.turma}` : ""}</b>{p.professor ? ` · ${p.professor}` : ""}: faltam {p.aulasFaltantes} aula(s).<br />
                  Motivo: {String(p.motivo || "").replace(/_/g, " ")}{p.detalhe ? ` — ${p.detalhe}` : ""}{p.sugestao ? <><br />Sugestão: {p.sugestao}</> : null}
                </Alert>
              ))}
            </Box>
          ) : <Alert severity="success" sx={{ mt: 2 }}>Todas as aulas foram alocadas.</Alert>}

          <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 2 }}>Alocações propostas ({sim.alocacoes?.length ?? 0})</Typography>
          <Box sx={{ overflowX: "auto", maxHeight: 420 }}>
            <Table size="small" stickyHeader>
              <TableHead><TableRow><TableCell>Dia</TableCell><TableCell>Horário</TableCell><TableCell>Disciplina</TableCell><TableCell>Turma</TableCell><TableCell>Professor</TableCell><TableCell>Espaço</TableCell></TableRow></TableHead>
              <TableBody>
                {(sim.alocacoes || []).slice(0, 400).map((a: any, i: number) => (
                  <TableRow key={i}><TableCell>{a.dia}</TableCell><TableCell>{a.inicio}–{a.fim}</TableCell><TableCell>{a.disciplina}</TableCell><TableCell>{a.turma}</TableCell><TableCell>{a.professor || "—"}</TableCell><TableCell>{a.espaco || (a.pratica ? "—" : "Online/sem sala")}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          {(sim.alocacoes?.length ?? 0) > 400 ? <Typography variant="caption" color="text.secondary">Exibindo as 400 primeiras alocações.</Typography> : null}
        </Paper>
      ) : null}

      {aplicado ? (
        <Alert severity="success" sx={{ mb: 3 }}>
          Cronograma aplicado: {aplicado.slotsCriados} aulas criadas, {aplicado.slotsSubstituidos} substituídas, {aplicado.pendencias?.length ?? 0} pendência(s).
          {aplicado.varredura ? ` Varredura: ${aplicado.varredura.choques ?? 0} choque(s), ${aplicado.varredura.alunosEmChoque ?? 0} aluno(s) em choque.` : ""}
        </Alert>
      ) : null}

      <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Execuções recentes</Typography>
      {hist.error ? <Alert severity="info">Histórico indisponível: {hist.error}</Alert> : !itemsOf(hist.data).length ? <Typography color="text.secondary">Nenhuma execução registrada.</Typography> : (
        <Paper variant="outlined" sx={{ borderRadius: 3, overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Data</TableCell><TableCell>Situação</TableCell><TableCell>Aulas</TableCell><TableCell>Alocadas</TableCell><TableCell>Pendentes</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>
              {itemsOf(hist.data).map((x: any) => (
                <TableRow key={x.id}>
                  <TableCell>{fmtDT(x.createdAt)}</TableCell>
                  <TableCell><Chip size="small" label={x.status} color={x.status === "APLICADA" ? "success" : x.status === "SIMULADA" ? "info" : "default"} /></TableCell>
                  <TableCell>{x.totalAulas}</TableCell><TableCell>{x.alocadas}</TableCell><TableCell>{x.pendentes}</TableCell>
                  <TableCell align="right">
                    {x.status === "SIMULADA" ? <Button size="small" onClick={() => acao(x.id, "descartar")}>Descartar</Button> : null}
                    {x.status === "APLICADA" ? <Button size="small" color="error" onClick={() => acao(x.id, "desfazer")}>Desfazer</Button> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
      {node}
    </Box>
  );
}
