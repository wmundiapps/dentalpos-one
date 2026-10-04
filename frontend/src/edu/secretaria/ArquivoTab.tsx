import { Alert, Box, Button, Paper, Snackbar, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import EduResourcePage from "../EduResourcePage";
import { Empty, Feedback, Status, fetchHtml, fmtDate, itemsOf, useHtmlPreview, useLoad } from "./util";

type Toast = (t: "success" | "error", m: string) => void;
const STATUS_ARQ = ["ATIVO", "ELEGIVEL_DESCARTE", "DESCARTE_SOLICITADO", "SUSPENSO", "GUARDA_PERMANENTE", "DESCARTADO"];

function Itens({ toast }: { toast: Toast }) {
  const tmp = useLoad<any>("/secretaria/temporalidade?pageSize=100&ativo=true");
  const opts = itemsOf(tmp.data).map((t) => ({ value: t.id, label: `${t.codigo} — ${t.tipoDocumento}` }));
  const nome = (id: string) => opts.find((o) => o.value === id)?.label || "—";
  const [versao, setVersao] = useState(0);
  const [busca, setBusca] = useState("");
  const res = useLoad<any>(busca.trim().length >= 2 ? `/secretaria/arquivo-busca?q=${encodeURIComponent(busca.trim())}` : null);
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 4 }}>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <Typography sx={{ fontWeight: 800 }}>Localizar documento físico</Typography>
          <TextField size="small" sx={{ flex: 1, minWidth: 240 }} placeholder="Título, caixa, pasta, estante, aluno…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <Button color="warning" onClick={async () => { try { const r: any = await eduApi.post("/secretaria/arquivo-reclassificar", {}); toast("success", `${r.elegiveisNovos} item(ns) elegível(is) para descarte.`); setVersao((v) => v + 1); } catch (e: any) { toast("error", e.message); } }}>Reclassificar por temporalidade</Button>
        </Box>
        <Feedback loading={res.loading} error={res.error} />
        {busca.trim().length >= 2 && !res.loading && !res.error && (itemsOf(res.data).length ? (
          <Box sx={{ mt: 1 }}>{itemsOf(res.data).map((i) => (
            <Typography key={i.id} variant="body2">• <b>{i.titulo}</b> — {i.localizacao || [i.predio, i.sala, i.estante, i.caixa, i.pasta].filter(Boolean).join(" / ") || "sem localização"} <Status value={i.status} /></Typography>
          ))}</Box>
        ) : <Empty>Nada encontrado.</Empty>)}
      </Paper>
      <EduResourcePage key={versao} title="Itens do arquivo" base="/secretaria" resource="/arquivo" dense
        description="Acervo físico/digital com localização e data de eliminação calculada pela tabela de temporalidade."
        columns={[{ key: "titulo", label: "Título" }, { key: "temporalidadeId", label: "Classificação", render: (r) => nome(r.temporalidadeId) }, { key: "loc", label: "Localização", render: (r) => [r.predio, r.sala, r.estante, r.caixa, r.pasta].filter(Boolean).join(" / ") || "—" },
          { key: "eliminarApos", label: "Eliminar após", render: (r) => fmtDate(r.eliminarApos) }, { key: "status", label: "Situação", render: (r) => <Status value={r.status} /> },
          { key: "susp", label: "", render: (r) => ["ATIVO", "ELEGIVEL_DESCARTE"].includes(r.status) ? <Button size="small" color="warning" onClick={async () => { const m = window.prompt("Motivo da suspensão da eliminação (mín. 5 caracteres):"); if (!m) return; try { await eduApi.post(`/secretaria/arquivo/${r.id}/suspender`, { motivo: m }); toast("success", "Item suspenso."); setVersao((v) => v + 1); } catch (e: any) { toast("error", e.message); } }}>Suspender</Button> : null }]}
        fields={[{ key: "titulo", label: "Título", required: true }, { key: "temporalidadeId", label: "Classificação (temporalidade)", type: "select", options: opts, required: true }, { key: "dataEncerramento", label: "Data de encerramento (início da guarda)", type: "date", required: true },
          { key: "dataDocumento", label: "Data do documento", type: "date" }, { key: "studentId", label: "ID do aluno (opcional)" }, { key: "predio", label: "Prédio" }, { key: "sala", label: "Sala" }, { key: "estante", label: "Estante" }, { key: "caixa", label: "Caixa" }, { key: "pasta", label: "Pasta" }, { key: "urlDigital", label: "Link da cópia digital" }, { key: "descricao", label: "Descrição", type: "textarea" }]}
        filters={[{ key: "status", label: "Situação", options: STATUS_ARQ }]}
        rowActions={[{ label: "Retomar", path: "/arquivo/:id/retomar", hidden: (r) => r.status !== "SUSPENSO" }]} />
    </Box>
  );
}

function Descartes({ toast, show }: { toast: Toast; show: ReturnType<typeof useHtmlPreview>["show"] }) {
  const lista = useLoad<any>("/secretaria/descartes?pageSize=50");
  const elegiveis = useLoad<any>("/secretaria/arquivo?status=ELEGIVEL_DESCARTE&pageSize=100");
  const [sel, setSel] = useState<string[]>([]);
  const [just, setJust] = useState("");
  async function run(fn: () => Promise<any>, ok: string, conf?: string) {
    if (conf && !window.confirm(conf)) return;
    try { await fn(); toast("success", ok); lista.reload(); elegiveis.reload(); setSel([]); } catch (e: any) { toast("error", e.message); }
  }
  const el = itemsOf(elegiveis.data);
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Elegíveis para descarte</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Selecione itens cujo prazo de guarda venceu e solicite o termo de eliminação. A aprovação cabe à coordenação (aprovador diferente do solicitante).</Typography>
        <Feedback loading={elegiveis.loading} error={elegiveis.error} onRetry={elegiveis.reload} />
        {!elegiveis.loading && !elegiveis.error && !el.length && <Empty>Nenhum item elegível no momento.</Empty>}
        {el.map((i) => (
          <Box key={i.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <input type="checkbox" checked={sel.includes(i.id)} onChange={(e) => setSel(e.target.checked ? [...sel, i.id] : sel.filter((x) => x !== i.id))} />
            <Typography variant="body2">{i.titulo} <span style={{ opacity: .6 }}>· eliminar após {fmtDate(i.eliminarApos)}</span></Typography>
          </Box>
        ))}
        {el.length > 0 && (
          <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
            <TextField size="small" fullWidth label="Justificativa (mín. 5 caracteres)" value={just} onChange={(e) => setJust(e.target.value)} />
            <Button variant="contained" disabled={!sel.length || just.trim().length < 5} onClick={() => run(async () => { await eduApi.post("/secretaria/descartes", { itemIds: sel, justificativa: just }); setJust(""); }, "Solicitação de descarte criada.")}>Solicitar ({sel.length})</Button>
          </Box>
        )}
      </Paper>
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Termos de eliminação</Typography>
        <Feedback loading={lista.loading} error={lista.error} onRetry={lista.reload} />
        {!lista.loading && !lista.error && !itemsOf(lista.data).length && <Empty>Nenhuma solicitação de descarte.</Empty>}
        {itemsOf(lista.data).length > 0 && (
          <Box sx={{ overflowX: "auto" }}><Table size="small">
            <TableHead><TableRow>{["Nº", "Itens", "Justificativa", "Situação", ""].map((h) => <TableCell key={h} sx={{ fontWeight: 800 }}>{h}</TableCell>)}</TableRow></TableHead>
            <TableBody>{itemsOf(lista.data).map((d) => (
              <TableRow key={d.id} hover>
                <TableCell>{d.numero}</TableCell><TableCell>{Array.isArray(d.itemIds) ? d.itemIds.length : "—"}</TableCell><TableCell sx={{ maxWidth: 280 }}>{d.justificativa || d.motivoRejeicao || "—"}</TableCell><TableCell><Status value={d.status} /></TableCell>
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                  {d.status === "AGUARDANDO_APROVACAO" && <>
                    <Button size="small" color="success" onClick={() => run(() => eduApi.post(`/secretaria/descartes/${d.id}/aprovar`, {}), "Descarte aprovado.", "Aprovar a eliminação?")}>Aprovar</Button>
                    <Button size="small" color="error" onClick={() => { const m = window.prompt("Motivo da rejeição (mín. 5 caracteres):"); if (m) run(() => eduApi.post(`/secretaria/descartes/${d.id}/rejeitar`, { motivo: m }), "Descarte rejeitado."); }}>Rejeitar</Button>
                  </>}
                  {d.status === "APROVADO" && <Button size="small" color="error" variant="outlined" onClick={() => run(() => eduApi.post(`/secretaria/descartes/${d.id}/executar`, {}), "Eliminação registrada.", "Executar a eliminação? Os itens serão marcados como DESCARTADOS (irreversível).")}>Executar</Button>}
                  <Button size="small" onClick={() => show(`Termo ${d.numero}`, () => fetchHtml(`/secretaria/descartes/${d.id}/termo`))}>Termo</Button>
                </TableCell>
              </TableRow>))}</TableBody>
          </Table></Box>
        )}
      </Paper>
    </Box>
  );
}

function Temporalidade() {
  return (
    <EduResourcePage title="Tabela de temporalidade" base="/secretaria" resource="/temporalidade" dense
      description="Prazos de guarda corrente/intermediária e destinação final por tipo de documento."
      columns={[{ key: "codigo", label: "Código" }, { key: "tipoDocumento", label: "Tipo de documento" }, { key: "prazoCorrenteAnos", label: "Corrente (anos)" }, { key: "prazoIntermediarioAnos", label: "Intermediária (anos)" }, { key: "destinacao", label: "Destinação" }, { key: "ativo", label: "Ativo" }]}
      fields={[{ key: "codigo", label: "Código", required: true, createOnly: true }, { key: "tipoDocumento", label: "Tipo de documento", required: true }, { key: "prazoCorrenteAnos", label: "Prazo corrente (anos)", type: "number" }, { key: "prazoIntermediarioAnos", label: "Prazo intermediário (anos)", type: "number" },
        { key: "destinacao", label: "Destinação", type: "select", options: ["ELIMINACAO", "GUARDA_PERMANENTE"] }, { key: "fundamento", label: "Fundamento legal" }, { key: "ativo", label: "Ativo", type: "bool" }, { key: "descricao", label: "Descrição", type: "textarea" }]} />
  );
}

export default function ArquivoTab() {
  const [tab, setTab] = useState(0);
  const { show, dialog } = useHtmlPreview();
  const [msg, setMsg] = useState<{ t: "success" | "error"; m: string } | null>(null);
  const toast: Toast = (t, m) => setMsg({ t, m });
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">{["Acervo", "Descartes", "Temporalidade"].map((t) => <Tab key={t} label={t} />)}</Tabs>
      {tab === 0 && <Itens toast={toast} />}
      {tab === 1 && <Descartes toast={toast} show={show} />}
      {tab === 2 && <Temporalidade />}
      {dialog}
      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)}>{msg ? <Alert severity={msg.t} onClose={() => setMsg(null)}>{msg.m}</Alert> : undefined}</Snackbar>
    </Box>
  );
}
