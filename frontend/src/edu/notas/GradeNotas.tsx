import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Paper, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useMemo, useState } from "react";
import { eduApi } from "../../services/EduApi";
import { Feedback, Progress, Status, StatCard, StatGrid, fetchHtml, fmtDate, fmtNum, label, useHtmlPreview, useLoad } from "../secretaria/util";

export const SEMAFORO: Record<string, string> = { NENHUM: "#2E7D32", ATENCAO: "#ED6C02", ALTO: "#D32F2F" };
export function Semaforo({ nivel, motivos }: { nivel?: string; motivos?: string[] }) {
  const n = nivel || "NENHUM";
  return (
    <Tooltip title={(motivos && motivos.length ? motivos.join(" · ") : n === "NENHUM" ? "Sem risco" : n)}>
      <Box component="span" sx={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%", bgcolor: SEMAFORO[n] || "#9E9E9E", verticalAlign: "middle" }} />
    </Tooltip>
  );
}

export const SITUACAO: Record<string, string> = { EM_CURSO: "Em curso", APROVADO: "Aprovado", REPROVADO_NOTA: "Reprovado por nota", REPROVADO_FREQ: "Reprovado por frequência", RECUPERACAO: "Recuperação", EXAME: "Exame final" };
export function SituacaoChip({ v }: { v?: string }) {
  if (!v) return <>—</>;
  const color = v === "APROVADO" ? "success" : v.startsWith("REPROVADO") ? "error" : v === "EM_CURSO" ? "default" : "warning";
  return <Chip size="small" color={color as any} label={SITUACAO[v] || label(v)} />;
}

const parse = (s: string): { valor: number | null; ausente: boolean } | "inv" => {
  const t = s.trim().toUpperCase();
  if (t === "A" || t === "AUS" || t === "AUSENTE") return { valor: null, ausente: true };
  const n = Number(t.replace(",", "."));
  return Number.isNaN(n) ? "inv" : { valor: n, ausente: false };
};

function ImportarDialog({ turmaId, open, fechado, onClose, onDone }: { turmaId: string; open: boolean; fechado: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const [csv, setCsv] = useState("");
  const [motivo, setMotivo] = useState("");
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  async function go(simular: boolean) {
    setErr(null);
    try {
      const r: any = await eduApi.post(`/notas/turmas/${turmaId}/notas/importar`, { formato: "CSV", dados: csv, simular, motivo: motivo || undefined });
      setRes(r);
      if (!simular) onDone(`${r.gravadas} nota(s) importada(s).`);
    } catch (e: any) { setErr(e.message); }
  }
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Importar notas (CSV)</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
        <Alert severity="info">Primeira linha: <code>ra;P1;P2;TRAB</code> (códigos dos componentes). Uma linha por aluno, com RA e notas. Use <code>AUSENTE</code> para falta na avaliação.</Alert>
        {err && <Alert severity="error">{err}</Alert>}
        <TextField multiline minRows={8} label="Conteúdo CSV" value={csv} onChange={(e) => setCsv(e.target.value)} slotProps={{ htmlInput: { style: { fontFamily: "monospace" } } }} />
        {fechado && <TextField size="small" label="Justificativa (diário fechado)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />}
        {res && (
          <Alert severity={res.erros?.length ? "warning" : "success"}>
            {res.simulacao ? "Simulação" : "Importação"}: {res.itens} item(ns), {res.gravadas} gravada(s), {res.semAlteracao} sem alteração, {res.erros?.length || 0} erro(s).
            {(res.erros || []).slice(0, 15).map((e: any, i: number) => <div key={i}>• {e.indice >= 0 ? `item ${e.indice + 1}: ` : ""}{e.erro}</div>)}
          </Alert>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button><Button disabled={!csv.trim()} onClick={() => go(true)}>Simular</Button><Button variant="contained" disabled={!csv.trim()} onClick={() => go(false)}>Importar</Button></DialogActions>
    </Dialog>
  );
}

function CompDialog({ turmaId, open, onClose, onDone }: { turmaId: string; open: boolean; onClose: () => void; onDone: () => void }) {
  const [c, setC] = useState<any>({ tipo: "AVALIACAO", peso: 1, notaMaxima: 10, obrigatorio: true });
  const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Novo componente de avaliação</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 2 }}>
          <TextField size="small" label="Código (ex.: P1)" required value={c.codigo || ""} onChange={(e) => setC({ ...c, codigo: e.target.value })} />
          <TextField size="small" label="Nome" required value={c.nome || ""} onChange={(e) => setC({ ...c, nome: e.target.value })} />
          <TextField select size="small" label="Tipo" value={c.tipo} onChange={(e) => setC({ ...c, tipo: e.target.value })}>{["AVALIACAO", "RECUPERACAO", "EXAME"].map((t) => <MenuItem key={t} value={t}>{label(t)}</MenuItem>)}</TextField>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1 }}>
            <TextField size="small" type="number" label="Peso" value={c.peso} onChange={(e) => setC({ ...c, peso: Number(e.target.value) })} />
            <TextField size="small" type="number" label="Nota máx." value={c.notaMaxima} onChange={(e) => setC({ ...c, notaMaxima: Number(e.target.value) })} />
            <TextField size="small" type="date" label="Data prevista" value={c.dataPrevista || ""} onChange={(e) => setC({ ...c, dataPrevista: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" disabled={!c.codigo || !c.nome} onClick={async () => { try { await eduApi.post(`/notas/turmas/${turmaId}/componentes`, { ...c, dataPrevista: c.dataPrevista ? new Date(`${c.dataPrevista}T12:00:00`).toISOString() : undefined }); onDone(); } catch (e: any) { setErr(e.message); } }}>Criar</Button></DialogActions>
    </Dialog>
  );
}

function Estatisticas({ turmaId }: { turmaId: string }) {
  const { data, loading, error, reload } = useLoad<any>(`/notas/turmas/${turmaId}/estatisticas`);
  if (loading || error) return <Feedback loading={loading} error={error} onRetry={reload} />;
  if (!data) return null;
  const dist = data.mediaFinal?.distribuicao || [];
  const maxQ = Math.max(1, ...dist.map((d: any) => d.quantidade));
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
      <StatGrid>
        <StatCard title="Alunos" value={data.alunos} />
        <StatCard title="Taxa de aprovação" value={data.taxaAprovacao != null ? `${fmtNum(data.taxaAprovacao)}%` : "—"} color="#2E7D32" />
        <StatCard title="Média parcial" value={fmtNum(data.mediaParcial?.media, 2)} />
        <StatCard title="Média final" value={fmtNum(data.mediaFinal?.media, 2)} />
      </StatGrid>
      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Distribuição das médias finais</Typography>
      <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1, height: 110, mt: 1 }}>
        {dist.map((d: any) => (
          <Box key={d.faixa} sx={{ flex: 1, textAlign: "center" }}>
            <Typography variant="caption">{d.quantidade}</Typography>
            <Box sx={{ height: `${(d.quantidade / maxQ) * 70}px`, minHeight: 2, bgcolor: "primary.main", borderRadius: 1 }} />
            <Typography variant="caption" color="text.secondary">{d.faixa}</Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ mt: 1.5, display: "flex", gap: 0.5, flexWrap: "wrap" }}>{Object.entries(data.situacoes || {}).map(([k, v]) => <Chip key={k} size="small" label={`${SITUACAO[k] || k}: ${v}`} />)}</Box>
    </Paper>
  );
}

export default function GradeNotas({ turmaId, onBack }: { turmaId: string; onBack: () => void }) {
  const { data, loading, error, reload } = useLoad<any>(`/notas/turmas/${turmaId}/diario`);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [corrigir, setCorrigir] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [msg, setMsg] = useState<{ t: "success" | "error" | "warning"; m: string } | null>(null);
  const [imp, setImp] = useState(false);
  const [comp, setComp] = useState(false);
  const [stats, setStats] = useState(false);
  const { show, dialog } = useHtmlPreview();
  const fechado = data?.diario?.status === "FECHADO";
  const editavel = !!data && (!fechado || corrigir);
  const comps: any[] = data?.componentes || [];
  const alunos: any[] = data?.alunos || [];
  const dirty = Object.keys(edits).length;

  const invalid = useMemo(() => {
    const bad = new Set<string>();
    for (const [k, v] of Object.entries(edits)) {
      const [, cid] = k.split("|");
      const c = comps.find((x) => x.id === cid);
      const p = parse(v);
      if (!v.trim() || p === "inv" || (p.valor != null && (p.valor < 0 || (c && p.valor > c.notaMaxima)))) bad.add(k);
    }
    return bad;
  }, [edits, comps]);

  async function act(fn: () => Promise<any>, ok: (r: any) => string, conf?: string) {
    if (conf && !window.confirm(conf)) return;
    try { const r = await fn(); setMsg({ t: "success", m: ok(r) }); await reload(); } catch (e: any) { setMsg({ t: "error", m: e.message }); }
  }

  async function salvar() {
    const itens = Object.entries(edits).filter(([k]) => !invalid.has(k)).map(([k, v]) => { const [studentId, componenteId] = k.split("|"); const p = parse(v) as { valor: number | null; ausente: boolean }; return { studentId, componenteId, valor: p.valor, ausente: p.ausente }; });
    if (!itens.length) { setMsg({ t: "error", m: "Nenhuma nota válida para salvar." }); return; }
    try {
      const r: any = corrigir && fechado
        ? await eduApi.post(`/notas/turmas/${turmaId}/notas/corrigir`, { correcoes: itens, motivo })
        : await eduApi.put(`/notas/turmas/${turmaId}/notas`, { notas: itens });
      const n = r.gravadas ?? r.alteradas ?? 0;
      setMsg({ t: r.erros?.length ? "warning" : "success", m: `${n} nota(s) salva(s)${r.erros?.length ? ` · ${r.erros.length} erro(s): ${r.erros.slice(0, 3).map((e: any) => e.erro).join("; ")}` : "."}` });
      setEdits({});
      await reload();
    } catch (e: any) { setMsg({ t: "error", m: e.message }); }
  }

  const cell = (a: any, c: any) => {
    const key = `${a.studentId}|${c.id}`;
    const n = a.notas.find((x: any) => x.componenteId === c.id);
    const atual = n?.ausente ? "A" : n?.valor != null ? String(n.valor).replace(".", ",") : "";
    const v = key in edits ? edits[key] : atual;
    const baixa = n?.valor != null && data?.regra?.mediaAprovacao != null && (n.valor / c.notaMaxima) * (data.regra.notaMaxima || 10) < data.regra.mediaAprovacao;
    return (
      <TextField size="small" value={v} disabled={!editavel} error={invalid.has(key)} placeholder="—"
        onChange={(e) => setEdits((s) => { const nx = { ...s }; if (e.target.value === atual) delete nx[key]; else nx[key] = e.target.value; return nx; })}
        sx={{ width: 74, "& input": { textAlign: "center", p: "6px", color: !(key in edits) && baixa ? "error.main" : undefined, fontWeight: key in edits ? 800 : 500 }, bgcolor: key in edits ? "warning.light" : undefined, borderRadius: 1 }} />
    );
  };

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <IconButton onClick={onBack}><ArrowBackIcon /></IconButton>
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>{data?.turma?.disciplina || "Diário de classe"} — {data?.turma?.nome}</Typography>
          {data && <Typography variant="body2" color="text.secondary">Regra: {data.regra?.nome} · média {data.regra?.mediaAprovacao} · frequência mín. {data.regra?.frequenciaMinima}% · {data.aulas?.realizadas ?? 0} aula(s) realizada(s)</Typography>}
        </Box>
        {data && <Status value={data.diario.status} />}
        {data?.diario?.prazoLancamento && <Chip size="small" color={data.diario.prazoExpirado ? "error" : "default"} label={`Prazo: ${fmtDate(data.diario.prazoLancamento)}`} />}
      </Box>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {msg && <Alert severity={msg.t} onClose={() => setMsg(null)}>{msg.m}</Alert>}
      {data && (
        <>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
            {editavel && <Button variant="contained" disabled={!dirty || (corrigir && fechado && motivo.trim().length < 10)} onClick={salvar}>Salvar {dirty ? `(${dirty})` : ""}</Button>}
            {dirty > 0 && <Button onClick={() => setEdits({})}>Descartar</Button>}
            {!fechado && <Button onClick={() => setComp(true)}>+ Componente</Button>}
            {!fechado && comps.length === 0 && <Button color="secondary" variant="outlined" onClick={() => act(() => eduApi.post(`/notas/turmas/${turmaId}/componentes/aplicar-regra`, {}), () => "Componentes criados a partir da regra.")}>Aplicar regra da turma</Button>}
            <Button onClick={() => setImp(true)}>Importar CSV</Button>
            <Button onClick={() => act(() => eduApi.post(`/notas/turmas/${turmaId}/recalcular`, {}), (r) => `Recalculado: ${r.alunos} aluno(s).`)}>Recalcular</Button>
            <Button onClick={() => setStats((s) => !s)}>{stats ? "Ocultar" : "Ver"} estatísticas</Button>
            <Button onClick={() => show("Ata de resultados", () => fetchHtml(`/notas/turmas/${turmaId}/ata.html`))}>Ata / diário (imprimir)</Button>
            <Box sx={{ flex: 1 }} />
            {!fechado && <Button color="warning" variant="outlined" onClick={() => act(() => eduApi.post(`/notas/turmas/${turmaId}/fechar`, {}), () => "Diário fechado.", "Fechar o diário? As notas passam a exigir correção justificada pela secretaria/coordenação.")}>Fechar diário</Button>}
            {fechado && <Button color="warning" variant="outlined" onClick={() => { const j = window.prompt("Justificativa para reabrir o diário (mín. 10 caracteres):"); if (j) act(() => eduApi.post(`/notas/turmas/${turmaId}/reabrir`, { justificativa: j }), () => "Diário reaberto."); }}>Reabrir</Button>}
            <Button onClick={() => { const p = window.prompt("Novo prazo de lançamento (AAAA-MM-DD) — vazio para remover:", ""); if (p === null) return; act(() => eduApi.patch(`/notas/turmas/${turmaId}/prazo`, { prazoLancamento: p ? new Date(`${p}T23:59:00`).toISOString() : null }), () => "Prazo atualizado."); }}>Prazo</Button>
          </Box>
          {fechado && (
            <Alert severity="info" action={<FormControlLabel control={<Switch checked={corrigir} onChange={(e) => setCorrigir(e.target.checked)} />} label="Modo correção" />}>
              Diário fechado em {fmtDate(data.diario.fechadoEm)}. Correções exigem justificativa e ficam na trilha de auditoria.
            </Alert>
          )}
          {fechado && corrigir && <TextField size="small" label="Justificativa da correção (mín. 10 caracteres)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />}
          {stats && <Estatisticas turmaId={turmaId} />}
          {comps.length === 0 ? <Alert severity="warning">Esta turma ainda não tem componentes de avaliação. Aplique a regra ou crie um componente.</Alert> : (
            <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "auto", maxHeight: "65vh" }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800, position: "sticky", left: 0, zIndex: 3, bgcolor: "background.paper", minWidth: 220 }}>Aluno</TableCell>
                    {comps.map((c) => (
                      <TableCell key={c.id} align="center" sx={{ fontWeight: 800 }}>
                        <Tooltip title={`${c.nome} · peso ${c.peso} · máx. ${c.notaMaxima}${c.dataPrevista ? ` · ${fmtDate(c.dataPrevista)}` : ""}`}><span>{c.codigo}<Typography variant="caption" sx={{ display: "block" }} color="text.secondary">p{c.peso}{c.tipo !== "AVALIACAO" ? ` · ${label(c.tipo).slice(0, 4)}` : ""}</Typography></span></Tooltip>
                      </TableCell>
                    ))}
                    <TableCell align="center" sx={{ fontWeight: 800 }}>Parcial</TableCell><TableCell align="center" sx={{ fontWeight: 800 }}>Final</TableCell>
                    <TableCell sx={{ fontWeight: 800, minWidth: 130 }}>Frequência</TableCell><TableCell sx={{ fontWeight: 800 }}>Situação</TableCell><TableCell align="center" sx={{ fontWeight: 800 }}>Risco</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {alunos.map((a) => (
                    <TableRow key={a.studentId} hover>
                      <TableCell sx={{ position: "sticky", left: 0, bgcolor: "background.paper", zIndex: 1 }}><b>{a.nome}</b><Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>RA {a.ra}{a.statusMatricula && a.statusMatricula !== "ATIVA" ? ` · ${label(a.statusMatricula)}` : ""}</Typography></TableCell>
                      {comps.map((c) => <TableCell key={c.id} align="center" sx={{ p: 0.5 }}>{cell(a, c)}</TableCell>)}
                      <TableCell align="center">{fmtNum(a.resultado?.mediaParcial, 1)}</TableCell>
                      <TableCell align="center"><b>{fmtNum(a.resultado?.mediaFinal, 1)}</b></TableCell>
                      <TableCell>
                        {a.frequencia?.pct != null ? <><Typography variant="caption">{fmtNum(a.frequencia.pct, 0)}% · {a.frequencia.faltas ?? 0} falta(s)</Typography><Progress value={a.frequencia.pct} color={a.frequencia.pct < (data.regra?.frequenciaMinima ?? 75) ? "error" : "success"} /></> : <Typography variant="caption" color="text.secondary">sem chamada</Typography>}
                      </TableCell>
                      <TableCell><SituacaoChip v={a.resultado?.situacao} /></TableCell>
                      <TableCell align="center"><Semaforo nivel={a.risco?.nivel} motivos={a.risco?.motivos} /></TableCell>
                    </TableRow>
                  ))}
                  {!alunos.length && <TableRow><TableCell colSpan={comps.length + 6}><Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>Nenhum aluno matriculado nesta turma.</Typography></TableCell></TableRow>}
                </TableBody>
              </Table>
            </Paper>
          )}
          <Typography variant="caption" color="text.secondary">Digite a nota (vírgula ou ponto) ou <b>A</b> para ausente. Notas em vermelho estão abaixo da média de aprovação.</Typography>
        </>
      )}
      <ImportarDialog turmaId={turmaId} open={imp} fechado={fechado} onClose={() => setImp(false)} onDone={(m) => { setImp(false); setMsg({ t: "success", m }); reload(); }} />
      <CompDialog turmaId={turmaId} open={comp} onClose={() => setComp(false)} onDone={() => { setComp(false); reload(); }} />
      {dialog}
    </Box>
  );
}
