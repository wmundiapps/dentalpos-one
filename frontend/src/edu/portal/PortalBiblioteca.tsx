import { Alert, Box, Button, Chip, Paper, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import { Empty, Feedback, Status, fmtDate, itemsOf, useLoad } from "../secretaria/util";
import { useToast } from "./comum";

/** Biblioteca online: acervo digital, busca no acervo físico, reservas e renovação de empréstimos. */
export default function PortalBiblioteca({ podeAgir }: { podeAgir: boolean }) {
  const resumo = useLoad<any>(podeAgir ? "/biblioteca/meus/resumo" : null);
  const virt = useLoad<any>("/biblioteca/virtual/catalogo");
  const [q, setQ] = useState("");
  const [res, setRes] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const t = useToast();
  async function buscar() {
    setBusy(true);
    try { setRes(itemsOf(await eduApi.get(`/biblioteca/acervo/busca${qsOf({ q })}`))); } catch (e: any) { t.err(e.message); setRes([]); } finally { setBusy(false); }
  }
  async function acao(fn: () => Promise<any>, ok: string) { try { await fn(); t.ok(ok); resumo.reload(); } catch (e: any) { t.err(e.message); } }
  const d = resumo.data;
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {podeAgir && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Meus empréstimos e reservas</Typography>
          <Feedback loading={resumo.loading} error={resumo.error} onRetry={resumo.reload} />
          {d && !d.podeEmprestar && <Alert severity="warning" sx={{ mb: 1 }}>Empréstimos bloqueados: {(d.motivosBloqueio || []).join("; ")}</Alert>}
          {d && !d.emprestimos.length && !d.reservas.length && <Empty>Nenhum empréstimo ou reserva ativa.</Empty>}
          {(d?.emprestimos || []).map((e: any) => (
            <Box key={e.id} sx={{ display: "flex", gap: 1, alignItems: "center", py: 0.5, flexWrap: "wrap" }}>
              <Typography variant="body2" sx={{ flex: 1, minWidth: 200 }}><b>{e.exemplar?.obra?.titulo}</b> · devolver até {fmtDate(e.dataPrevista)}</Typography>
              <Button size="small" onClick={() => acao(() => eduApi.post(`/biblioteca/meus/renovar/${e.id}`), "Empréstimo renovado.")}>Renovar</Button>
            </Box>
          ))}
          {(d?.reservas || []).map((r: any) => (
            <Box key={r.id} sx={{ display: "flex", gap: 1, alignItems: "center", py: 0.5, flexWrap: "wrap" }}>
              <Typography variant="body2" sx={{ flex: 1, minWidth: 200 }}>Reserva: <b>{r.obra?.titulo}</b>{r.status === "AGUARDANDO" ? ` · posição ${r.posicaoFila} na fila` : ""}</Typography>
              <Status value={r.status} />
              <Button size="small" onClick={() => acao(() => eduApi.post(`/biblioteca/meus/reservas/${r.id}/cancelar`), "Reserva cancelada.")}>Cancelar</Button>
            </Box>
          ))}
          {(d?.multas || []).length > 0 && <Alert severity="error" sx={{ mt: 1 }}>Você tem {d.multas.length} multa(s) em aberto.</Alert>}
        </Paper>
      )}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Buscar no acervo físico</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <TextField size="small" fullWidth label="Título, autor ou assunto" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && q.trim() && buscar()} />
          <Button variant="contained" disabled={!q.trim() || busy} onClick={buscar}>Buscar</Button>
        </Box>
        {res && !res.length && <Empty>Nada encontrado.</Empty>}
        {(res || []).slice(0, 20).map((o: any) => (
          <Box key={o.id} sx={{ display: "flex", gap: 1, alignItems: "center", py: 0.75, borderBottom: "1px dashed", borderColor: "divider", flexWrap: "wrap" }}>
            <Box sx={{ flex: 1, minWidth: 200 }}><Typography variant="body2" sx={{ fontWeight: 700 }}>{o.titulo}</Typography><Typography variant="caption" color="text.secondary">{[o.autores, o.editora, o.ano].filter(Boolean).join(" · ")}{o.disponiveis != null ? ` · ${o.disponiveis} disponível(is)` : ""}</Typography></Box>
            {podeAgir && <Button size="small" onClick={() => acao(() => eduApi.post("/biblioteca/meus/reservar", { obraId: o.id }), "Reserva realizada.")}>Reservar</Button>}
          </Box>
        ))}
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Acervo digital</Typography>
        <Feedback loading={virt.loading} error={virt.error} onRetry={virt.reload} />
        {!virt.loading && !(virt.data?.items || []).length && <Empty>O acervo digital ainda não foi configurado.</Empty>}
        {(virt.data?.items || []).map((r: any) => (
          <Box key={r.id} sx={{ display: "flex", gap: 1, alignItems: "center", py: 0.75, borderBottom: "1px dashed", borderColor: "divider", flexWrap: "wrap" }}>
            <Box sx={{ flex: 1, minWidth: 200 }}><Typography variant="body2" sx={{ fontWeight: 700 }}>{r.titulo}</Typography><Typography variant="caption" color="text.secondary">{[r.tipo, r.autores, r.provedor].filter(Boolean).join(" · ")}</Typography></Box>
            {r.permitido ? (podeAgir && <Button size="small" variant="contained" onClick={async () => { try { const a = await eduApi.post<any>(`/biblioteca/virtual/recursos/${r.id}/acessar`); if (a?.url) window.open(a.url, "_blank", "noopener,noreferrer"); } catch (e: any) { t.err(e.message); } }}>Acessar</Button>) : <Chip size="small" label={r.motivo || "Sem acesso"} />}
          </Box>
        ))}
      </Paper>
      {t.node}
    </Box>
  );
}
