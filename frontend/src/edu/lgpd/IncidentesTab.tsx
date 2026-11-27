import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useState } from "react";
import { COLORS, FormDialog, LoadBox, Section, Status, call, fmtDateTime, itemsOf, useApi, useRunner, useToast } from "../desempenho/kit";
import { PrazoChip } from "./common";

function Detalhe({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const [rev, setRev] = useState(0);
  const [dlg, setDlg] = useState<null | "anpd" | "titulares" | "encerrar" | "evento" | "avaliar">(null);
  const { toast, node } = useToast();
  const after = () => { setRev((x) => x + 1); onChange(); };
  const run = useRunner(toast, after);
  const r = useApi<any>(`/lgpd/incidentes/${id}`, [rev]);
  const d = r.data;
  const base = `/lgpd/incidentes/${id}`;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>{d ? `${d.numero} — ${d.titulo}` : "Incidente"}</DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={r.loading} error={r.error} onRetry={r.reload}>
          {d && (
            <>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", mb: 1.5 }}>
                <Status value={d.status} /><Chip size="small" color={d.severidade === "CRITICA" || d.severidade === "ALTA" ? "error" : "default"} label={`Severidade ${d.severidade}`} />
                <Chip size="small" variant="outlined" label={`Ciência: ${fmtDateTime(d.ciencia)}`} />
                <Chip size="small" variant="outlined" label={`Prazo de comunicação (3 dias úteis): ${fmtDateTime(d.prazoComunicacaoEm)}`} /><PrazoChip estado={d.prazoEstado} dias={d.diasRestantes} />
                {d.riscoRelevante ? <Chip size="small" color="error" label="Risco/dano relevante: comunicação obrigatória" /> : <Chip size="small" label="Sem risco relevante (documentar)" />}
                {d.dadosSensiveis && <Chip size="small" color="warning" label="dados sensíveis" />}{d.envolveMenores && <Chip size="small" color="warning" label="menores" />}
              </Box>
              <Typography sx={{ whiteSpace: "pre-wrap", mb: 1 }}>{d.descricao}</Typography>
              <Typography variant="body2" color="text.secondary">Titulares afetados: {d.titularesAfetados ?? "a apurar"} · Dados: {(d.categoriasDados || []).join(", ") || "—"}</Typography>
              <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", my: 1 }}>
                <Typography variant="body2"><b>ANPD:</b> {d.comunicadoAnpdEm ? `comunicada em ${fmtDateTime(d.comunicadoAnpdEm)} (${d.anpdProtocolo})` : d.pendenciaAnpd ? "PENDENTE" : "não aplicável"}</Typography>
                <Typography variant="body2"><b>Titulares:</b> {d.comunicadoTitularesEm ? `comunicados em ${fmtDateTime(d.comunicadoTitularesEm)} (${d.meioComunicacaoTitulares})` : d.pendenciaTitulares ? "PENDENTE" : "não aplicável"}</Typography>
              </Box>
              {d.status !== "ENCERRADO" && (
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
                  <Button size="small" onClick={() => setDlg("evento")}>Registrar evento</Button>
                  <Button size="small" onClick={() => setDlg("avaliar")}>Reavaliar risco</Button>
                  <Button size="small" variant="outlined" onClick={() => setDlg("anpd")}>Registrar comunicação à ANPD</Button>
                  <Button size="small" variant="outlined" onClick={() => setDlg("titulares")}>Registrar comunicação aos titulares</Button>
                  <Button size="small" variant="contained" color="success" onClick={() => setDlg("encerrar")}>Encerrar</Button>
                </Box>
              )}
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Checklist ({d.checklistProgresso.feitos}/{d.checklistProgresso.total}; obrigatórios pendentes: {d.checklistProgresso.obrigatoriosPendentes})</Typography>
              {(d.checklist || []).map((c: any) => (
                <FormControlLabel key={c.codigo} sx={{ display: "flex", ml: 0 }} disabled={d.status === "ENCERRADO"} control={<Checkbox size="small" checked={!!c.feito} onChange={(e) => run(() => call("POST", `${base}/checklist/${c.codigo}`, { feito: e.target.checked }), "Checklist atualizado.")} />}
                  label={<Typography variant="body2">{c.texto}{c.obrigatorio && <Chip size="small" label="obrigatório" sx={{ ml: 0.5, height: 18 }} />}</Typography>} />
              ))}
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2 }}>Linha do tempo</Typography>
              {(d.eventos || []).map((e: any) => <Typography key={e.id} variant="body2">• {fmtDateTime(e.ocorridoEm)} — <b>{e.tipo.replace(/_/g, " ")}</b>: {e.descricao}</Typography>)}
            </>
          )}
        </LoadBox>
        <FormDialog open={dlg === "anpd"} title="Comunicação à ANPD" intro={<Alert severity="info" sx={{ mb: 2 }}>Faça a comunicação no formulário da ANPD e registre aqui o protocolo.</Alert>} fields={[{ key: "protocolo", label: "Protocolo da ANPD", required: true }, { key: "em", label: "Data/hora", type: "datetime" }]} onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", `${base}/comunicar-anpd`, b); after(); }} />
        <FormDialog open={dlg === "titulares"} title="Comunicação aos titulares" fields={[{ key: "meio", label: "Meio (e-mail, carta, aviso no portal…)", required: true }, { key: "titularesNotificados", label: "Quantos titulares", type: "number" }, { key: "em", label: "Data/hora", type: "datetime" }]} onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", `${base}/comunicar-titulares`, b); after(); }} />
        <FormDialog open={dlg === "evento"} title="Registrar evento" fields={[{ key: "tipo", label: "Tipo", type: "select", required: true, options: ["CONTENCAO", "AVALIACAO", "NOTA"] }, { key: "descricao", label: "O que aconteceu", type: "textarea", required: true }, { key: "ocorridoEm", label: "Quando", type: "datetime" }]} initial={{ tipo: "NOTA" }} onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", `${base}/eventos`, b); after(); }} />
        <FormDialog open={dlg === "avaliar"} title="Reavaliar risco" fields={[{ key: "riscoRelevante", label: "Há risco ou dano relevante aos titulares", type: "bool" }, { key: "severidade", label: "Severidade", type: "select", options: ["BAIXA", "MEDIA", "ALTA", "CRITICA"] }, { key: "titularesAfetados", label: "Titulares afetados", type: "number" }]} initial={{ riscoRelevante: d?.riscoRelevante, severidade: d?.severidade }} onClose={() => setDlg(null)} onSubmit={async (b) => { await call("PUT", base, b); after(); }} />
        <FormDialog open={dlg === "encerrar"} title="Encerrar incidente" fields={[{ key: "causa", label: "Causa raiz", type: "textarea", required: true }, { key: "medidasCorretivas", label: "Medidas corretivas e preventivas", type: "textarea", required: true }, { key: "justificativaSemComunicacao", label: "Se não houve comunicação: por que não há risco/dano relevante", type: "textarea" }]} onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", `${base}/encerrar`, b); after(); }} />
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

export default function IncidentesTab() {
  const [rev, setRev] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const l = useApi<any>("/lgpd/incidentes?pageSize=100", [rev]);
  return (
    <Section title="Incidentes de segurança (art. 48) — comunicação em 3 dias úteis" actions={<Button variant="contained" color="error" onClick={() => setNovo(true)}>Registrar incidente</Button>}>
      <Alert severity="warning" sx={{ mb: 2 }}>Ao tomar conhecimento de incidente que possa acarretar risco ou dano relevante, comunique a ANPD e os titulares em até <b>3 dias úteis</b>. O relógio começa na “ciência”. Veja o Plano de Resposta a Incidentes em <code>docs/LGPD-PLANO-INCIDENTES.md</code>.</Alert>
      <LoadBox loading={l.loading} error={l.error} empty={!itemsOf(l.data).length} emptyText="Nenhum incidente registrado." onRetry={l.reload}>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Nº</TableCell><TableCell>Título</TableCell><TableCell>Severidade</TableCell><TableCell>Status</TableCell><TableCell>Prazo de comunicação</TableCell><TableCell>ANPD</TableCell><TableCell>Titulares</TableCell></TableRow></TableHead>
            <TableBody>
              {itemsOf(l.data).map((i: any) => (
                <TableRow key={i.id} hover sx={{ cursor: "pointer" }} onClick={() => setOpen(i.id)}>
                  <TableCell><b>{i.numero}</b></TableCell><TableCell>{i.titulo}</TableCell>
                  <TableCell><Chip size="small" sx={{ bgcolor: i.severidade === "CRITICA" ? COLORS.bad : i.severidade === "ALTA" ? "#e07b00" : i.severidade === "MEDIA" ? COLORS.warn : COLORS.mute, color: "#fff" }} label={i.severidade} /></TableCell>
                  <TableCell><Status value={i.status} /></TableCell><TableCell><PrazoChip estado={i.prazoEstado} dias={i.diasRestantes} /></TableCell>
                  <TableCell>{i.comunicadoAnpdEm ? "✔" : i.pendenciaAnpd ? "pendente" : "—"}</TableCell><TableCell>{i.comunicadoTitularesEm ? "✔" : i.pendenciaTitulares ? "pendente" : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </LoadBox>
      {open && <Detalhe id={open} onClose={() => setOpen(null)} onChange={() => setRev((x) => x + 1)} />}
      <FormDialog open={novo} title="Registrar incidente" fields={[
        { key: "titulo", label: "Título", required: true }, { key: "descricao", label: "Descrição do que aconteceu", type: "textarea", required: true },
        { key: "severidade", label: "Severidade", type: "select", required: true, options: ["BAIXA", "MEDIA", "ALTA", "CRITICA"] }, { key: "ciencia", label: "Quando a instituição tomou conhecimento", type: "datetime", helper: "Vazio = agora" }, { key: "ocorridoEm", label: "Quando ocorreu", type: "datetime" },
        { key: "categoriasDados", label: "Categorias de dados afetados", type: "list" }, { key: "titularesAfetados", label: "Titulares afetados (estimativa)", type: "number" },
        { key: "dadosSensiveis", label: "Envolve dados sensíveis", type: "bool" }, { key: "envolveMenores", label: "Envolve menores", type: "bool" }, { key: "riscoRelevante", label: "Há risco ou dano relevante aos titulares", type: "bool" },
        { key: "medidasContencao", label: "Medidas de contenção já tomadas", type: "textarea" },
      ]} initial={{ severidade: "MEDIA" }} onClose={() => setNovo(false)} onSubmit={async (b) => { await call("POST", "/lgpd/incidentes", b); setRev((x) => x + 1); }} />
    </Section>
  );
}
