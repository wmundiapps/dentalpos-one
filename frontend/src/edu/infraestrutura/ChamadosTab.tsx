import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, MenuItem, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { StatusChip } from "../EduResourcePage";
import { eduApi, qsOf } from "../../services/EduApi";
import { Async, FormDialog, Kanban, type Opt, SubNav, Tag, fmtDate, fmtDateTime, label, nameOf, useApi, useSpaces, useToast } from "./kit";

const CATEGORIAS = ["PREDIAL", "ELETRICA", "HIDRAULICA", "TI", "AR_CONDICIONADO", "LIMPEZA", "SEGURANCA", "ILUMINACAO", "MOBILIARIO", "OUTRO"];
const PRIORIDADES = ["BAIXA", "MEDIA", "ALTA", "URGENTE"];
const COLS = [
  { key: "ABERTO", title: "Abertos", color: "#0288d1" },
  { key: "EM_ATENDIMENTO", title: "Em atendimento", color: "#ed6c02" },
  { key: "RESOLVIDO", title: "Resolvidos", color: "#2e7d32" },
  { key: "FECHADO", title: "Fechados", color: "#9e9e9e" },
];
const prioTone = (p: string) => (p === "URGENTE" ? "error" : p === "ALTA" ? "warning" : "default") as any;

function ChamadoDialog({ id, spaces, onClose, onChanged }: { id: string; spaces: Opt[]; onClose: () => void; onChanged: () => void }) {
  const st = useApi<any>(`/infraestrutura/chamados/${id}`);
  const toast = useToast();
  const [texto, setTexto] = useState("");
  const [resol, setResol] = useState("");
  const [interno, setInterno] = useState(false);
  const [nota, setNota] = useState("5");
  const after = () => { st.reload(); onChanged(); };
  const post = (p: string, body: any, ok: string, confirmText?: string) => toast.run(() => eduApi.post(`/infraestrutura/chamados/${id}${p}`, body), ok, after, confirmText);

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Chamado</DialogTitle>
      <DialogContent dividers>
        <Async state={st}>
          {(c) => (
            <Box sx={{ display: "grid", gap: 2 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>{c.numero} — {c.titulo}</Typography>
                {c.descricao ? <Typography variant="body2" color="text.secondary">{c.descricao}</Typography> : null}
                <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap", alignItems: "center" }}>
                  <StatusChip value={c.status} /><Tag text={label(c.categoria)} /><Tag text={`Prioridade ${label(c.prioridade)}`} tone={prioTone(c.prioridade)} />
                  <Typography variant="caption">{nameOf(spaces, c.spaceId)} · aberto em {fmtDateTime(c.createdAt)}</Typography>
                </Box>
                {c.os ? <Typography variant="body2" sx={{ mt: 1 }}>OS vinculada: <b>{c.os.numero}</b> ({label(c.os.status)})</Typography> : null}
                {c.avaliacaoNota ? <Typography variant="body2" sx={{ mt: 1 }}>Avaliação do solicitante: <b>{c.avaliacaoNota}/5</b> {c.avaliacaoComentario || ""}</Typography> : null}
              </Box>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {c.status === "ABERTO" && <Button variant="outlined" onClick={() => post("/atender", {}, "Chamado assumido.")}>Assumir atendimento</Button>}
                {["ABERTO", "EM_ATENDIMENTO"].includes(c.status) && !c.osId && <Button variant="outlined" onClick={() => post("/gerar-os", {}, "OS gerada.", "Gerar uma ordem de serviço para este chamado?")}>Gerar OS</Button>}
                {c.status === "RESOLVIDO" && <Button variant="outlined" onClick={() => { const m = window.prompt("Motivo da reabertura:"); if (m) post("/reabrir", { motivo: m }, "Chamado reaberto."); }}>Reabrir</Button>}
                {!["FECHADO", "CANCELADO"].includes(c.status) && <Button color="error" onClick={() => post("/cancelar", {}, "Chamado cancelado.", "Cancelar este chamado?")}>Cancelar chamado</Button>}
              </Box>
              {["ABERTO", "EM_ATENDIMENTO"].includes(c.status) && (
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  <TextField size="small" label="Texto da resolução" value={resol} onChange={(e) => setResol(e.target.value)} sx={{ flex: 1, minWidth: 240 }} />
                  <Button variant="contained" color="success" onClick={() => resol.trim().length >= 3 ? post("/resolver", { texto: resol }, "Chamado resolvido.") : toast.err("Descreva a resolução (mín. 3 caracteres).")}>Resolver</Button>
                </Box>
              )}
              {c.status === "RESOLVIDO" && (
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                  <TextField select size="small" label="Nota do atendimento" value={nota} onChange={(e) => setNota(e.target.value)} sx={{ width: 170 }}>
                    {[1, 2, 3, 4, 5].map((n) => <MenuItem key={n} value={String(n)}>{n} estrela(s)</MenuItem>)}
                  </TextField>
                  <Button variant="contained" onClick={() => post("/fechar", { nota: Number(nota) }, "Chamado fechado.")}>Confirmar e fechar</Button>
                </Box>
              )}
              <Divider />
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Histórico e comentários</Typography>
              {(c.comentarios || []).map((m: any) => (
                <Box key={m.id} sx={{ p: 1, borderRadius: 2, bgcolor: m.interno ? "warning.light" : "action.hover" }}>
                  <Typography variant="caption" color="text.secondary">{fmtDateTime(m.createdAt)} {m.interno ? "· interno" : ""}</Typography>
                  <Typography variant="body2">{m.texto}</Typography>
                </Box>
              ))}
              {!(c.comentarios || []).length && <Typography variant="body2" color="text.secondary">Sem comentários.</Typography>}
              {!["FECHADO", "CANCELADO"].includes(c.status) && (
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                  <TextField size="small" label="Novo comentário" value={texto} onChange={(e) => setTexto(e.target.value)} sx={{ flex: 1, minWidth: 240 }} />
                  <FormControlLabel control={<Checkbox checked={interno} onChange={(e) => setInterno(e.target.checked)} />} label="Interno" />
                  <Button onClick={() => texto.trim() ? post("/comentarios", { texto, interno }, "Comentário enviado.").then(() => setTexto("")) : null}>Comentar</Button>
                </Box>
              )}
            </Box>
          )}
        </Async>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      {toast.node}
    </Dialog>
  );
}

export default function ChamadosTab() {
  const [sub, setSub] = useState("todos");
  const [key, setKey] = useState(0);
  const [novo, setNovo] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [fCat, setFCat] = useState("");
  const spaces = useSpaces();
  const toast = useToast();
  const list = useApi<any>(`/infraestrutura/${sub === "meus" ? "chamados/meus" : "chamados"}${qsOf({ pageSize: 100, categoria: sub === "meus" ? undefined : fCat, k: key })}`);
  const reload = () => setKey((k) => k + 1);
  return (
    <Box>
      <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
        <SubNav value={sub} onChange={setSub} items={[{ key: "todos", label: "Fila da equipe" }, { key: "meus", label: "Meus chamados" }]} />
        {sub === "todos" && (
          <TextField select size="small" label="Categoria" value={fCat} onChange={(e) => setFCat(e.target.value)} sx={{ minWidth: 170, mb: 2 }}>
            <MenuItem value="">Todas</MenuItem>{CATEGORIAS.map((c) => <MenuItem key={c} value={c}>{label(c)}</MenuItem>)}
          </TextField>
        )}
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo(true)} sx={{ mb: 2 }}>Abrir chamado</Button>
      </Box>
      <Async state={list}>
        {(d) => (
          <Kanban columns={COLS} rows={(d.items || []) as any[]} groupBy={(c) => c.status}
            render={(c) => (
              <Box sx={{ display: "grid", gap: 0.5, cursor: "pointer" }} onClick={() => setOpen(c.id)}>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="caption" sx={{ fontWeight: 800 }}>{c.numero}</Typography><Tag text={label(c.prioridade)} tone={prioTone(c.prioridade)} />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{c.titulo}</Typography>
                <Typography variant="caption" color="text.secondary">{label(c.categoria)} · {fmtDate(c.createdAt)}</Typography>
              </Box>
            )} />
        )}
      </Async>
      <FormDialog open={novo} title="Abrir chamado" onClose={() => setNovo(false)}
        fields={[
          { key: "titulo", label: "Título", required: true, full: true }, { key: "descricao", label: "Descrição do problema", type: "textarea" },
          { key: "categoria", label: "Categoria", type: "select", options: CATEGORIAS, def: "PREDIAL" }, { key: "prioridade", label: "Prioridade", type: "select", options: PRIORIDADES, def: "MEDIA" },
          { key: "spaceId", label: "Local", type: "select", options: spaces },
        ]}
        onSubmit={async (b) => { await eduApi.post("/infraestrutura/chamados", b); toast.ok("Chamado registrado."); reload(); }} />
      {open && <ChamadoDialog id={open} spaces={spaces} onClose={() => setOpen(null)} onChanged={reload} />}
      {toast.node}
    </Box>
  );
}
