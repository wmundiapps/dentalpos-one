import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { Empty, Feedback, Progress, Status, fmtDate, fmtDateTime, useLoad } from "../secretaria/util";
import { sid, useToast } from "./comum";

const TIPOS = [
  { v: "TRANCAMENTO", t: "Trancamento de matrícula" }, { v: "DESTRANCAMENTO", t: "Destrancamento de matrícula" }, { v: "TRANSFERENCIA", t: "Transferência para outra instituição" },
  { v: "APROVEITAMENTO", t: "Aproveitamento de estudos" }, { v: "CANCELAMENTO", t: "Cancelamento de matrícula" },
];
const KIND: Record<string, string> = { REQUERIMENTO: "Requerimento", REVISAO: "Revisão de nota", PROCESSO: "Processo interno", JUSTIFICATIVA: "Justificativa de faltas" };

/** Requerimentos, revisões de nota, justificativas e processos internos (trancamento, transferência, aproveitamento) com acompanhamento. */
export default function PortalRequerimentos({ studentId, podeAgir, onNovoRequerimento }: { studentId?: string | null; podeAgir: boolean; onNovoRequerimento: () => void }) {
  const { data, loading, error, reload } = useLoad<any>(`/portal2/aluno/requerimentos${sid(studentId)}`);
  const [filtro, setFiltro] = useState("");
  const [novo, setNovo] = useState<any>(null);
  const [det, setDet] = useState<string | null>(null);
  const t = useToast();
  const itens: any[] = (data?.itens || []).filter((i: any) => !filtro || i.kind === filtro);
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Feedback loading={loading} error={error} onRetry={reload} />
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        {podeAgir && <Button variant="contained" onClick={onNovoRequerimento}>Novo requerimento</Button>}
        {podeAgir && <Button variant="outlined" onClick={() => setNovo({ tipo: "TRANCAMENTO", justificativa: "", dados: {} })}>Abrir processo (trancamento, transferência…)</Button>}
        <TextField select size="small" label="Mostrar" value={filtro} onChange={(e) => setFiltro(e.target.value)} sx={{ minWidth: 190, ml: "auto" }}>
          <MenuItem value="">Tudo</MenuItem>{Object.entries(KIND).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
        </TextField>
      </Box>
      {data?.resumo && <Alert severity={data.resumo.atrasados ? "warning" : "info"}>{data.resumo.abertos} em andamento{data.resumo.atrasados ? ` · ${data.resumo.atrasados} com prazo vencido` : ""} · {data.resumo.total} no total.</Alert>}
      {!loading && !itens.length && <Empty>Nenhuma solicitação por aqui.</Empty>}
      {itens.map((i) => (
        <Paper key={`${i.kind}-${i.id}`} variant="outlined" sx={{ p: 1.5, borderRadius: 3, display: "grid", gap: 0.5 }}>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Chip size="small" variant="outlined" label={KIND[i.kind]} />
            <Typography sx={{ fontWeight: 800, flex: 1, minWidth: 180 }}>{i.numero ? `${i.numero} · ` : ""}{i.titulo}</Typography>
            <Status value={i.status} />
            {i.kind === "PROCESSO" && <Button size="small" onClick={() => setDet(i.id)}>Acompanhar</Button>}
          </Box>
          <Typography variant="caption" color={i.atrasado ? "error" : "text.secondary"}>
            Aberto em {fmtDate(i.criadoEm)}{i.prazoEm ? ` · prazo de resposta ${fmtDate(i.prazoEm)}${i.atrasado ? " (vencido)" : ""}` : ""}{i.respondidoEm ? ` · respondido em ${fmtDate(i.respondidoEm)}` : ""}
          </Typography>
          {i.resposta && <Alert severity="info" sx={{ py: 0 }}>Resposta: {i.resposta}</Alert>}
        </Paper>
      ))}

      <Dialog open={!!novo} onClose={() => setNovo(null)} fullWidth maxWidth="sm">
        <DialogTitle>Abrir processo</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField select size="small" label="Tipo de processo" value={novo?.tipo || ""} onChange={(e) => setNovo({ ...novo, tipo: e.target.value, dados: {} })}>{TIPOS.map((x) => <MenuItem key={x.v} value={x.v}>{x.t}</MenuItem>)}</TextField>
          <TextField multiline minRows={3} label="Justificativa (mín. 10 caracteres)" value={novo?.justificativa || ""} onChange={(e) => setNovo({ ...novo, justificativa: e.target.value })} />
          {novo?.tipo === "TRANCAMENTO" && <TextField size="small" label="Retorno previsto (ex.: 2027/1)" value={novo.dados.retornoPrevisto || ""} onChange={(e) => setNovo({ ...novo, dados: { ...novo.dados, retornoPrevisto: e.target.value } })} />}
          {novo?.tipo === "TRANSFERENCIA" && <>
            <TextField size="small" label="Instituição de destino" value={novo.dados.instituicaoDestino || ""} onChange={(e) => setNovo({ ...novo, dados: { ...novo.dados, instituicaoDestino: e.target.value } })} />
            <TextField size="small" label="Curso de destino" value={novo.dados.cursoDestino || ""} onChange={(e) => setNovo({ ...novo, dados: { ...novo.dados, cursoDestino: e.target.value } })} />
          </>}
          {novo?.tipo === "APROVEITAMENTO" && <AproveitamentoCampos novo={novo} setNovo={setNovo} />}
          {novo?.tipo === "CANCELAMENTO" && <Alert severity="warning">O cancelamento encerra o vínculo. Verifique pendências financeiras antes.</Alert>}
        </DialogContent>
        <DialogActions><Button onClick={() => setNovo(null)}>Cancelar</Button>
          <Button variant="contained" disabled={(novo?.justificativa || "").trim().length < 10} onClick={async () => {
            const d: any = { ...novo.dados }; if (d.cargaHorariaOrigem) d.cargaHorariaOrigem = Number(d.cargaHorariaOrigem); if (d.notaOrigem) d.notaOrigem = Number(d.notaOrigem);
            try { await eduApi.post("/portal2/aluno/processos", { tipo: novo.tipo, justificativa: novo.justificativa, dados: d }); setNovo(null); t.ok("Processo aberto. Acompanhe as etapas aqui."); reload(); } catch (e: any) { t.err(e.message); }
          }}>Abrir processo</Button></DialogActions>
      </Dialog>
      <ProcessoDialog id={det} onClose={() => { setDet(null); reload(); }} podeAgir={podeAgir} toast={t} />
      {t.node}
    </Box>
  );
}

function AproveitamentoCampos({ novo, setNovo }: { novo: any; setNovo: (v: any) => void }) {
  const progs = useLoad<any>("/portal2/aluno/fluxograma");
  const discs: any[] = (progs.data?.fluxograma?.periodos || []).flatMap((p: any) => p.disciplinas).filter((d: any) => d.status !== "APROVADA");
  const set = (k: string, v: any) => setNovo({ ...novo, dados: { ...novo.dados, [k]: v } });
  return (
    <>
      <TextField select size="small" label="Disciplina do meu curso a aproveitar" value={novo.dados.disciplinaDestinoId || ""} onChange={(e) => set("disciplinaDestinoId", e.target.value)}>{discs.map((d) => <MenuItem key={d.disciplineId} value={d.disciplineId}>{d.nome}</MenuItem>)}</TextField>
      <TextField size="small" label="Disciplina cursada (origem)" value={novo.dados.disciplinaOrigem || ""} onChange={(e) => set("disciplinaOrigem", e.target.value)} />
      <TextField size="small" label="Instituição de origem" value={novo.dados.instituicaoOrigem || ""} onChange={(e) => set("instituicaoOrigem", e.target.value)} />
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
        <TextField size="small" type="number" label="Carga horária cursada" value={novo.dados.cargaHorariaOrigem || ""} onChange={(e) => set("cargaHorariaOrigem", e.target.value)} />
        <TextField size="small" type="number" label="Nota obtida" value={novo.dados.notaOrigem || ""} onChange={(e) => set("notaOrigem", e.target.value)} />
      </Box>
      <TextField size="small" label="Link da ementa/histórico (opcional)" placeholder="https://" value={novo.dados.anexoUrl || ""} onChange={(e) => set("anexoUrl", e.target.value)} />
    </>
  );
}

function ProcessoDialog({ id, onClose, podeAgir, toast }: { id: string | null; onClose: () => void; podeAgir: boolean; toast: ReturnType<typeof useToast> }) {
  const { data, loading, error, reload } = useLoad<any>(id ? `/portal2/processos/${id}` : null);
  const [txt, setTxt] = useState("");
  const aberto = data && !["DEFERIDO", "INDEFERIDO", "CONCLUIDO", "CANCELADO"].includes(data.status);
  return (
    <Dialog open={!!id} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{data ? `${data.titulo} — ${data.numero}` : "Processo"}</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 1.5 }}>
        <Feedback loading={loading} error={error} onRetry={reload} />
        {data && (
          <>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}><Status value={data.status} />{data.prazoEm && <Typography variant="caption" color={data.atrasado ? "error" : "text.secondary"}>Prazo de resposta: {fmtDate(data.prazoEm)}</Typography>}</Box>
            <Progress value={data.progresso} color="success" />
            {data.decisao && <Alert severity={data.status === "INDEFERIDO" ? "error" : "info"}>Decisão: {data.decisao}</Alert>}
            <Typography sx={{ fontWeight: 800 }}>Etapas</Typography>
            {data.etapas.map((e: any) => (
              <Box key={e.id} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                <Typography sx={{ width: 22, color: "text.secondary" }}>{e.ordem}.</Typography>
                <Box sx={{ flex: 1 }}><Typography variant="body2" sx={{ fontWeight: 700 }}>{e.nome}</Typography><Typography variant="caption" color="text.secondary">{e.setor}{e.observacao ? ` · ${e.observacao}` : ""}</Typography></Box>
                <Status value={e.status} />
              </Box>
            ))}
            <Typography sx={{ fontWeight: 800, mt: 1 }}>Histórico</Typography>
            {data.eventos.map((ev: any) => <Typography key={ev.id} variant="body2"><b>{fmtDateTime(ev.createdAt)}</b> — {ev.autorNome ? `${ev.autorNome}: ` : ""}{ev.texto}</Typography>)}
            {podeAgir && aberto && (
              <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                <TextField size="small" fullWidth multiline minRows={2} label={data.status === "PENDENCIA" ? "Responder à pendência" : "Enviar mensagem à secretaria"} value={txt} onChange={(e) => setTxt(e.target.value)} />
                <Button variant="contained" disabled={!txt.trim()} onClick={async () => { try { await eduApi.post(`/portal2/processos/${id}/comentarios`, { texto: txt }); setTxt(""); reload(); } catch (e: any) { toast.err(e.message); } }}>Enviar</Button>
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        {podeAgir && aberto && <Button color="error" onClick={async () => { if (!window.confirm("Cancelar este processo?")) return; try { await eduApi.post(`/portal2/aluno/processos/${id}/cancelar`); toast.ok("Processo cancelado."); onClose(); } catch (e: any) { toast.err(e.message); } }}>Cancelar processo</Button>}
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
}
