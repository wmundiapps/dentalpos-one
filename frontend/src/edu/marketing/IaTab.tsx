import { Alert, Box, Button, Chip, Paper, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { Lista, LoadBox, M, Section, Status, call, label, opts, svgUri, useApi, useToast, FormDialog } from "./kit";

export default function IaTab() {
  const [f, setF] = useState<any>({ briefing: "", curso: "", publico: "", cta: "Inscreva-se agora", variacoes: 3 });
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [rev, setRev] = useState(0);
  const [ver, setVer] = useState<any>(null);
  const { toast, node } = useToast();
  const marca = useApi<any>(`${M}/marca`);
  async function gerar() {
    setBusy(true);
    try { setRes(await call("POST", `${M}/ia/gerar`, { ...f, variacoes: Number(f.variacoes) || 3 })); setRev((x) => x + 1); toast({ type: "success", text: "Peças geradas e salvas na biblioteca (rascunho)." }); }
    catch (e: any) { toast({ type: "error", text: e.message }); } finally { setBusy(false); }
  }
  const set = (k: string) => (e: any) => setF((o: any) => ({ ...o, [k]: e.target.value }));
  return (
    <>
      {node}
      <Section title="Gerador de peças para campanhas EAD">
        <Alert severity="info" sx={{ mb: 2 }}>Descreva o briefing e receba copy, variações de anúncio, roteiro de vídeo, legendas, e-mail e imagens com a marca ({marca.data?.nome ?? "da instituição"}). Sem chave de IA configurada o conteúdo é gerado em <b>modo simulado</b> (modelos + imagens vetoriais). Todo material passa por revisão e aprovação antes de ser publicado.</Alert>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          <TextField label="Briefing" multiline minRows={3} value={f.briefing} onChange={set("briefing")} sx={{ gridColumn: { md: "1 / -1" } }} required helperText="Mínimo de 10 caracteres: objetivo, público, diferenciais e restrições." />
          <TextField label="Curso" value={f.curso} onChange={set("curso")} size="small" /><TextField label="Público" value={f.publico} onChange={set("publico")} size="small" />
          <TextField label="Chamada para ação" value={f.cta} onChange={set("cta")} size="small" /><TextField label="Variações (1 a 5)" type="number" value={f.variacoes} onChange={set("variacoes")} size="small" />
        </Box>
        <Button variant="contained" sx={{ mt: 2 }} disabled={busy || f.briefing.length < 10} onClick={gerar}>{busy ? "Gerando…" : "Gerar peças"}</Button>
      </Section>
      {res && (
        <Section title="Resultado">
          <Alert severity={res.simulado ? "warning" : "success"} sx={{ mb: 2 }}>{res.aviso}</Alert>
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}><Typography variant="subtitle2">Copy principal</Typography><Typography sx={{ fontWeight: 800 }}>{res.copy.titulo}</Typography><Typography>{res.copy.corpo}</Typography><Chip size="small" label={res.copy.cta} sx={{ mt: 1 }} /></Paper>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3,1fr)" }, gap: 1.5, mb: 2 }}>
            {res.anuncios.map((a: any) => <Paper key={a.variacao} variant="outlined" sx={{ p: 1.5 }}><Typography variant="caption" color="text.secondary">Anúncio v{a.variacao}</Typography><Typography sx={{ fontWeight: 700 }}>{a.headline}</Typography><Typography variant="body2">{a.descricao}</Typography></Paper>)}
          </Box>
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}><Typography variant="subtitle2">Roteiro de vídeo ({res.roteiro.duracaoSeg}s)</Typography>{res.roteiro.cenas.map((c: any, i: number) => <Typography key={i} variant="body2"><b>{c.tempo}</b> · {c.visual} — “{c.narracao}”</Typography>)}</Paper>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3,1fr)" }, gap: 1.5, mb: 2 }}>
            {res.legendas.map((l: any) => <Paper key={l.variacao} variant="outlined" sx={{ p: 1.5 }}><Typography variant="caption" color="text.secondary">Legenda v{l.variacao}</Typography><Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>{l.texto}</Typography><Typography variant="caption">{l.hashtags.join(" ")}</Typography></Paper>)}
          </Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Imagens (placeholder SVG com a marca)</Typography>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>{res.imagens.map((im: any) => <Box key={im.formato}><img src={svgUri(im.svg)} alt={`Peça ${im.formato}`} style={{ maxWidth: 260, maxHeight: 300, borderRadius: 8, border: "1px solid #ddd" }} /><Typography variant="caption" component="div">{im.formato}</Typography></Box>)}</Box>
        </Section>
      )}
      <Lista title="Biblioteca de ativos" path="/pecas" refreshKey={rev} onRowClick={(r) => setVer(r)}
        filters={[{ key: "tipo", label: "Tipo", options: opts(["COPY", "ANUNCIO", "ROTEIRO_VIDEO", "LEGENDA", "EMAIL", "IMAGEM"]) }, { key: "status", label: "Situação", options: opts(["RASCUNHO", "EM_APROVACAO", "APROVADA", "REJEITADA", "ARQUIVADA"]) }]}
        columns={[{ label: "Peça", primary: true, render: (r) => <><b>{r.titulo}</b><Typography variant="caption" component="div" color="text.secondary">{label(r.tipo)}{r.formato ? ` · ${r.formato}` : ""} · v{r.versao}{r.simulado ? " · simulado" : ""}</Typography></> }, { label: "Situação", render: (r) => <Status value={r.status} /> }]}
        rowActions={(r, { run }) => [
          { label: "Visualizar", onClick: () => setVer(r) },
          { label: "Enviar para aprovação", show: ["RASCUNHO", "REJEITADA"].includes(r.status), onClick: () => { void run(() => call("POST", `${M}/pecas/${r.id}/enviar-aprovacao`), "Enviada."); } },
          { label: "Aprovar", show: r.status === "EM_APROVACAO", onClick: () => { void run(() => call("POST", `${M}/pecas/${r.id}/aprovar`), "Peça aprovada."); } },
          { label: "Rejeitar", color: "error", show: r.status === "EM_APROVACAO", onClick: () => { const m = window.prompt("Motivo da rejeição:"); if (m) void run(() => call("POST", `${M}/pecas/${r.id}/rejeitar`, { motivo: m }), "Rejeitada."); } },
          { label: "Arquivar", show: r.status !== "ARQUIVADA", onClick: () => { void run(() => call("POST", `${M}/pecas/${r.id}/arquivar`), "Arquivada."); } },
        ]} />
      <FormDialog open={!!ver} title={ver?.titulo ?? ""} onClose={() => setVer(null)} fields={[]} submitLabel="Fechar" maxWidth="sm" onSubmit={async () => undefined}
        intro={ver && (ver.svg ? <LoadBox><img src={svgUri(ver.svg)} alt={ver.titulo} style={{ width: "100%", borderRadius: 8 }} /></LoadBox> : <Typography sx={{ whiteSpace: "pre-line" }}>{ver.texto}</Typography>)} />
    </>
  );
}
