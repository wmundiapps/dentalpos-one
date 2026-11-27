import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { Async, Panel, SubNav, Tag, fmtDateTime, useApi, useToast } from "../infraestrutura/kit";
import { ROTULO_STATUS, STATUS_COR, hora } from "./comum";

const hoje = () => new Date().toISOString().slice(0, 10);

function ListaChamada({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const d = useApi<any>(`/presenca/chamadas/${id}`);
  const toast = useToast();
  const [corr, setCorr] = useState<any | null>(null);
  const [status, setStatus] = useState("PRESENTE");
  const [just, setJust] = useState("");
  const [hist, setHist] = useState<any[] | null>(null);
  const x = d.data;
  async function salvar() {
    await toast.run(() => eduApi.patch(`/presenca/frequencias/${corr.frequenciaId}`, { status, justificativa: just }), "Correção registrada na trilha de auditoria.", () => { setCorr(null); setJust(""); d.reload(); onChanged(); });
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>{x ? `${x.disciplina} · ${x.turma}` : "Lista de chamada"}</DialogTitle>
      <DialogContent dividers>
        <Async state={d}>
          {(c) => (
            <Box sx={{ display: "grid", gap: 1.5 }}>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Tag text={c.chamada.status} tone={STATUS_COR[c.chamada.status] === "success" ? "success" : "info"} />
                <Chip size="small" label={`${hora(c.chamada.inicioEsperado)}–${hora(c.chamada.fimEsperado)}`} />
                <Chip size="small" color="success" label={`Presentes ${c.resumo.presentes}`} /><Chip size="small" color="warning" label={`Atrasos ${c.resumo.atrasos}`} />
                <Chip size="small" color="error" label={`Faltas ${c.resumo.faltas}`} /><Chip size="small" label={`Pendentes ${c.resumo.pendentes}`} />
                {c.resumo.divergentes > 0 && <Chip size="small" color="warning" variant="outlined" label={`${c.resumo.divergentes} divergência(s)`} />}
              </Box>
              <Box sx={{ overflowX: "auto" }}>
                <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", "& td, & th": { p: 0.75, borderBottom: "1px solid", borderColor: "divider", textAlign: "left", fontSize: 14 } }}>
                  <thead><tr><th>Aluno</th><th>Situação</th><th>Entrada</th><th>Saída</th><th>Origem</th><th /></tr></thead>
                  <tbody>
                    {c.roster.map((a: any) => (
                      <tr key={a.studentId}>
                        <td><b>{a.nome}</b><br /><Typography component="span" variant="caption" color="text.secondary">RA {a.ra}</Typography></td>
                        <td><Chip size="small" color={STATUS_COR[a.status] || "default"} label={ROTULO_STATUS[a.status] || a.status} />{a.minutosAtraso ? ` ${a.minutosAtraso} min` : ""}{a.intervaloExcedido ? " · intervalo excedido" : ""}{a.divergente ? " ⚠" : ""}</td>
                        <td>{hora(a.entradaEm)}</td><td>{hora(a.saidaEm)}</td><td>{a.origem === "MANUAL" ? "Manual" : a.ultimaMarcacao?.metodo || "—"}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {a.frequenciaId && <Button size="small" onClick={() => { setCorr(a); setStatus(a.status === "PENDENTE" ? "PRESENTE" : a.status); }}>Corrigir</Button>}
                          {a.frequenciaId && <Button size="small" onClick={async () => setHist((await eduApi.get<any>(`/presenca/frequencias/${a.frequenciaId}/correcoes`)).items)}>Histórico</Button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Box>
              </Box>
              {c.chamada.status === "ABERTA" && <Alert severity="info">Alunos pendentes ficam com falta ao encerrar. Peça para marcarem no quiosque ou lance manualmente (com justificativa).</Alert>}
            </Box>
          )}
        </Async>
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap" }}>
        {x?.chamada.status === "ABERTA" && <Button color="error" onClick={() => toast.run(() => eduApi.post(`/presenca/chamadas/${id}/fechar`, {}), "Chamada encerrada e conciliada.", () => { d.reload(); onChanged(); }, "Encerrar a chamada e conciliar com o diário?")}>Encerrar e conciliar</Button>}
        {x?.chamada.status === "FECHADA" && <Button onClick={() => toast.run(() => eduApi.post(`/presenca/chamadas/${id}/conciliar`, {}), "Conciliado com o diário.", () => { d.reload(); onChanged(); })}>Conciliar com o diário</Button>}
        {x && x.chamada.status !== "ABERTA" && <Button onClick={() => { const m = window.prompt("Motivo da reabertura (mín. 5 caracteres):"); if (m) toast.run(() => eduApi.post(`/presenca/chamadas/${id}/reabrir`, { motivo: m }), "Chamada reaberta.", () => { d.reload(); onChanged(); }); }}>Reabrir</Button>}
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
      <Dialog open={!!corr} onClose={() => setCorr(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 800 }}>Corrigir frequência</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
          <Typography variant="body2"><b>{corr?.nome}</b> — hoje: {ROTULO_STATUS[corr?.status] || corr?.status}</Typography>
          <TextField select size="small" label="Nova situação" value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(ROTULO_STATUS).filter(([k]) => k !== "PENDENTE").map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Justificativa (obrigatória, mín. 10 caracteres)" multiline minRows={2} value={just} onChange={(e) => setJust(e.target.value)} helperText="Fica na trilha de auditoria com seu nome e papel." />
        </DialogContent>
        <DialogActions><Button onClick={() => setCorr(null)}>Cancelar</Button><Button variant="contained" disabled={just.trim().length < 10} onClick={salvar}>Salvar correção</Button></DialogActions>
      </Dialog>
      <Dialog open={!!hist} onClose={() => setHist(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 800 }}>Trilha de correções</DialogTitle>
        <DialogContent dividers>
          {(hist || []).map((h) => <Box key={h.id} sx={{ mb: 1.5 }}><Typography variant="body2"><b>{h.de?.status ?? "—"} → {h.para?.status}</b> · {h.papel} · {fmtDateTime(h.createdAt)}</Typography><Typography variant="body2" color="text.secondary">{h.justificativa}</Typography></Box>)}
          {hist && !hist.length && <Typography color="text.secondary">Sem correções.</Typography>}
        </DialogContent>
        <DialogActions><Button onClick={() => setHist(null)}>Fechar</Button></DialogActions>
      </Dialog>
      {toast.node}
    </Dialog>
  );
}

function Aulas() {
  const [data, setData] = useState(hoje());
  const ag = useApi<any>(`/presenca/chamadas/agenda?data=${data}`);
  const [aberta, setAberta] = useState<string | null>(null);
  const toast = useToast();
  return (
    <Panel title="Aulas e chamadas" subtitle="Abra a chamada, acompanhe a lista ao vivo, corrija com justificativa e concilie com o diário." actions={<TextField size="small" type="date" label="Dia" value={data} onChange={(e) => setData(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />}>
      <Async state={ag}>
        {(d) => (
          <Box sx={{ display: "grid", gap: 1 }}>
            {(d.items || []).map((a: any) => (
              <Box key={a.classSessionId} sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap", p: 1.5, border: 1, borderColor: "divider", borderRadius: 3 }}>
                <Box sx={{ flex: 1, minWidth: 220 }}>
                  <Typography sx={{ fontWeight: 800 }}>{a.disciplina} · {a.turma}</Typography>
                  <Typography variant="body2" color="text.secondary">{hora(a.inicio)}–{hora(a.fim)} · {a.local || "sem local"} · {a.titulo}</Typography>
                </Box>
                {a.chamada ? <Tag text={`Chamada ${a.chamada.status.toLowerCase()}`} tone={STATUS_COR[a.chamada.status] === "success" ? "success" : "info"} /> : <Tag text="Sem chamada" />}
                {a.chamada
                  ? <Button variant="outlined" onClick={() => setAberta(a.chamada.id)}>Ver lista</Button>
                  : <Button variant="contained" onClick={() => toast.run(() => eduApi.post<any>("/presenca/chamadas/abrir", { classSessionId: a.classSessionId }), "Chamada aberta.", (c) => { ag.reload(); setAberta(c.id); })}>Abrir chamada</Button>}
              </Box>
            ))}
            {!d.items?.length && <Typography color="text.secondary">Nenhuma aula agendada neste dia.</Typography>}
          </Box>
        )}
      </Async>
      {aberta && <ListaChamada id={aberta} onClose={() => setAberta(null)} onChanged={ag.reload} />}
      {toast.node}
    </Panel>
  );
}

function Divergencias() {
  const dv = useApi<any>("/presenca/divergencias");
  const toast = useToast();
  const [alvo, setAlvo] = useState<any | null>(null);
  const [fonte, setFonte] = useState("RECONHECIMENTO");
  const [just, setJust] = useState("");
  return (
    <Panel title="Divergências com o diário" subtitle="O reconhecimento/QR e o lançamento do professor discordam. Nada é sobrescrito sem decisão do professor.">
      <Async state={dv}>
        {(d) => (
          <Box sx={{ display: "grid", gap: 1 }}>
            {(d.items || []).map((i: any) => (
              <Box key={i.id} sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap", p: 1.5, border: 1, borderColor: "divider", borderRadius: 3 }}>
                <Box sx={{ flex: 1, minWidth: 220 }}><Typography sx={{ fontWeight: 800 }}>{i.aluno?.nomeCompleto ?? i.studentId}</Typography><Typography variant="body2" color="text.secondary">Aula de {fmtDateTime(i.chamada?.inicioEsperado)}</Typography></Box>
                <Chip color={i.presenteReconhecimento ? "success" : "error"} label={`Sistema: ${ROTULO_STATUS[i.status] || i.status}`} />
                <Chip color={i.diarioPresente ? "success" : "error"} variant="outlined" label={`Diário: ${i.diarioPresente ? "presente" : "falta"}`} />
                <Button variant="contained" size="small" onClick={() => { setAlvo(i); setJust(""); }}>Resolver</Button>
              </Box>
            ))}
            {!d.items?.length && <Alert severity="success">Nenhuma divergência pendente.</Alert>}
          </Box>
        )}
      </Async>
      <Dialog open={!!alvo} onClose={() => setAlvo(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 800 }}>Resolver divergência</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
          <TextField select size="small" label="Prevalece" value={fonte} onChange={(e) => setFonte(e.target.value)}><MenuItem value="RECONHECIMENTO">Resultado do reconhecimento/QR</MenuItem><MenuItem value="DIARIO">Lançamento do professor (diário)</MenuItem></TextField>
          <TextField size="small" label="Justificativa (mín. 10 caracteres)" multiline minRows={2} value={just} onChange={(e) => setJust(e.target.value)} />
        </DialogContent>
        <DialogActions><Button onClick={() => setAlvo(null)}>Cancelar</Button><Button variant="contained" disabled={just.trim().length < 10} onClick={() => toast.run(() => eduApi.post(`/presenca/frequencias/${alvo.id}/resolver`, { fonte, justificativa: just }), "Divergência resolvida.", () => { setAlvo(null); dv.reload(); })}>Confirmar</Button></DialogActions>
      </Dialog>
      {toast.node}
    </Panel>
  );
}

export default function ChamadaTab() {
  const [sub, setSub] = useState("aulas");
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <SubNav value={sub} onChange={setSub} items={[{ key: "aulas", label: "Aulas e chamadas" }, { key: "div", label: "Divergências com o diário" }]} />
      {sub === "aulas" ? <Aulas /> : <Divergencias />}
    </Box>
  );
}
