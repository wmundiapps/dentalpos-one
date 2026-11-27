import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Paper, ToggleButton, ToggleButtonGroup, Typography, TextField, MenuItem, Checkbox, FormControlLabel } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import GavelIcon from "@mui/icons-material/Gavel";
import { useMemo, useState } from "react";
import EduResourcePage, { StatusChip, type FieldDef } from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import { fmtDate, fmtDateTime, label, Progress, Status, toIso, useApi, useToast } from "./ui";

export const ETAPAS = ["PREPARACAO", "PROTOCOLADO", "EM_ANALISE", "DILIGENCIA", "AVALIACAO_IN_LOCO", "DECISAO", "PUBLICADO", "ARQUIVADO"];
export const TIPOS_PROC = ["CREDENCIAMENTO", "RECREDENCIAMENTO", "AUTORIZACAO_CURSO", "RECONHECIMENTO_CURSO", "RENOVACAO_RECONHECIMENTO", "ADITAMENTO_VAGAS", "ADITAMENTO_ENDERECO", "ADITAMENTO_POLO_EAD", "TRANSFERENCIA_MANTENCA", "OUTRO"];
const ETAPA_COR: Record<string, string> = { PREPARACAO: "#64748b", PROTOCOLADO: "#2563eb", EM_ANALISE: "#7c3aed", DILIGENCIA: "#ea580c", AVALIACAO_IN_LOCO: "#0891b2", DECISAO: "#ca8a04", PUBLICADO: "#16a34a", ARQUIVADO: "#94a3b8" };

const FIELDS: FieldDef[] = [
  { key: "tipo", label: "Tipo", type: "select", options: TIPOS_PROC.map((t) => ({ value: t, label: label(t) })), required: true },
  { key: "titulo", label: "Título", required: true },
  { key: "cursoNome", label: "Curso" },
  { key: "numeroProcesso", label: "Nº do processo" },
  { key: "vagasSolicitadas", label: "Vagas solicitadas", type: "number" },
  { key: "enderecoNovo", label: "Novo endereço (aditamento)" },
  { key: "prazoProtocolo", label: "Prazo p/ protocolo", type: "date" },
  { key: "avaliacaoPrevistaEm", label: "Avaliação in loco prevista", type: "date" },
  { key: "decisaoPrevistaEm", label: "Decisão prevista", type: "date" },
  { key: "observacoes", label: "Observações", type: "textarea" },
];

function AvancarDialog({ proc, para, onClose, onDone }: { proc: any; para: string | null; onClose: () => void; onDone: (m: string) => void }) {
  const [f, setF] = useState<Record<string, any>>({});
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: any) => setF((s) => ({ ...s, [k]: v }));
  if (!para) return null;
  const deferido = f.resultado === "DEFERIDO";
  async function go() {
    setErr(null);
    try {
      const body: any = { etapa: para };
      if (f.observacao) body.observacao = f.observacao;
      if (f.protocoloEmec) body.protocoloEmec = f.protocoloEmec;
      if (f.forcar) body.forcar = true;
      if (f.avaliacaoPrevistaEm) body.avaliacaoPrevistaEm = toIso(f.avaliacaoPrevistaEm);
      if (f.decisaoPrevistaEm) body.decisaoPrevistaEm = toIso(f.decisaoPrevistaEm);
      if (para === "PUBLICADO") {
        body.resultado = f.resultado;
        if (f.conceitoObtido) body.conceitoObtido = Number(f.conceitoObtido);
        if (f.publicadoEm) body.publicadoEm = toIso(f.publicadoEm);
        if (deferido && f.atoNumero && f.atoData) {
          body.ato = { numero: f.atoNumero, dataPublicacao: toIso(f.atoData), referenciaDou: f.atoDou || undefined, vencimento: f.atoVenc ? toIso(f.atoVenc) : undefined, vagasAutorizadas: f.atoVagas ? Number(f.atoVagas) : undefined, cicloAvaliativoAnos: f.atoCiclo ? Number(f.atoCiclo) : undefined };
        }
      }
      await eduApi.post(`/regulatorio/processos/${proc.id}/avancar`, body);
      onDone(`Processo movido para ${label(para)}.`);
    } catch (e: any) { setErr(e.message); }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Mover para {label(para)}</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
        {err && <Typography color="error" variant="body2">{err}</Typography>}
        {para === "PROTOCOLADO" && (<>
          <TextField size="small" label="Protocolo e-MEC" required value={f.protocoloEmec ?? proc.protocoloEmec ?? ""} onChange={(e) => set("protocoloEmec", e.target.value)} />
          <FormControlLabel control={<Checkbox checked={!!f.forcar} onChange={(e) => set("forcar", e.target.checked)} />} label="Protocolar mesmo com requisitos obrigatórios pendentes no checklist" />
        </>)}
        {(para === "EM_ANALISE" || para === "PROTOCOLADO") && <TextField size="small" type="date" label="Avaliação in loco prevista" value={f.avaliacaoPrevistaEm || ""} onChange={(e) => set("avaliacaoPrevistaEm", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />}
        {(para === "AVALIACAO_IN_LOCO" || para === "DECISAO") && <TextField size="small" type="date" label="Decisão prevista" value={f.decisaoPrevistaEm || ""} onChange={(e) => set("decisaoPrevistaEm", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />}
        {para === "PUBLICADO" && (<>
          <TextField size="small" select label="Resultado" required value={f.resultado || ""} onChange={(e) => set("resultado", e.target.value)}>
            <MenuItem value="DEFERIDO">Deferido</MenuItem><MenuItem value="INDEFERIDO">Indeferido (exige observação)</MenuItem>
          </TextField>
          <TextField size="small" type="number" label="Conceito obtido (1 a 5)" value={f.conceitoObtido || ""} onChange={(e) => set("conceitoObtido", e.target.value)} slotProps={{ htmlInput: { min: 1, max: 5 } }} />
          <TextField size="small" type="date" label="Data de publicação" value={f.publicadoEm || ""} onChange={(e) => set("publicadoEm", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          {deferido && (<>
            <Divider>Registrar ato (portaria) — opcional</Divider>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
              <TextField size="small" label="Nº do ato" value={f.atoNumero || ""} onChange={(e) => set("atoNumero", e.target.value)} />
              <TextField size="small" type="date" label="Publicação no DOU" value={f.atoData || ""} onChange={(e) => set("atoData", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField size="small" label="Referência DOU" value={f.atoDou || ""} onChange={(e) => set("atoDou", e.target.value)} />
              <TextField size="small" type="date" label="Vencimento" value={f.atoVenc || ""} onChange={(e) => set("atoVenc", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField size="small" type="number" label="Vagas autorizadas" value={f.atoVagas || ""} onChange={(e) => set("atoVagas", e.target.value)} />
              <TextField size="small" type="number" label="Ciclo avaliativo (anos)" value={f.atoCiclo || ""} onChange={(e) => set("atoCiclo", e.target.value)} />
            </Box>
          </>)}
        </>)}
        <TextField size="small" multiline minRows={2} label="Observação" value={f.observacao || ""} onChange={(e) => set("observacao", e.target.value)} />
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" onClick={go}>Confirmar</Button></DialogActions>
    </Dialog>
  );
}

function DiligenciaDialog({ proc, onClose, onDone }: { proc: any; onClose: () => void; onDone: (m: string) => void }) {
  const [f, setF] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setErr(null);
    try {
      const exigencias = (f.exigencias || "").split("\n").map((t) => t.trim()).filter(Boolean).map((texto) => ({ texto }));
      await eduApi.post(`/regulatorio/processos/${proc.id}/diligencias`, { descricao: f.descricao, prazoResposta: toIso(f.prazoResposta), recebidaEm: f.recebidaEm ? toIso(f.recebidaEm) : undefined, exigencias: exigencias.length ? exigencias : undefined });
      onDone("Diligência registrada.");
    } catch (e: any) { setErr(e.message); }
  }
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Registrar diligência</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
        {err && <Typography color="error" variant="body2">{err}</Typography>}
        <TextField size="small" multiline minRows={3} required label="Descrição" value={f.descricao || ""} onChange={(e) => set("descricao", e.target.value)} />
        <TextField size="small" multiline minRows={3} label="Exigências (uma por linha)" value={f.exigencias || ""} onChange={(e) => set("exigencias", e.target.value)} />
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          <TextField size="small" type="date" label="Recebida em" value={f.recebidaEm || ""} onChange={(e) => set("recebidaEm", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="date" required label="Prazo de resposta" value={f.prazoResposta || ""} onChange={(e) => set("prazoResposta", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" onClick={go} disabled={!f.descricao || !f.prazoResposta}>Registrar</Button></DialogActions>
    </Dialog>
  );
}

function Detalhe({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { data: p, loading, error, reload } = useApi<any>(`/regulatorio/processos/${id}/detalhe`);
  const [para, setPara] = useState<string | null>(null);
  const [dil, setDil] = useState(false);
  const { toast, node } = useToast();
  const done = (m: string) => { setPara(null); setDil(false); toast({ type: "success", text: m }); reload(); onChanged(); };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{p?.titulo || "Processo"}</DialogTitle>
      <DialogContent dividers>
        <Status loading={loading && !p} error={error} onRetry={reload} empty={!p}>
          {p && (<>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
              <Chip label={label(p.tipo)} /><StatusChip value={p.etapa} />{p.resultado && <StatusChip value={p.resultado} />}
              {p.protocoloEmec && <Chip variant="outlined" label={`e-MEC ${p.protocoloEmec}`} />}
              {p.conceitoObtido && <Chip variant="outlined" label={`Conceito ${p.conceitoObtido}`} />}
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Prazo p/ protocolo: {fmtDate(p.prazoProtocolo)} · Avaliação prevista: {fmtDate(p.avaliacaoPrevistaEm)} · Decisão prevista: {fmtDate(p.decisaoPrevistaEm)}
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Avançar etapa</Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2, mt: 0.5 }}>
              {(p.proximasEtapas || []).map((e: string) => <Button key={e} size="small" variant="outlined" endIcon={<ArrowForwardIcon />} onClick={() => setPara(e)}>{label(e)}</Button>)}
              {!(p.proximasEtapas || []).length && <Typography variant="body2" color="text.secondary">Etapa final.</Typography>}
              {!["PUBLICADO", "ARQUIVADO", "PREPARACAO"].includes(p.etapa) && <Button size="small" startIcon={<GavelIcon />} onClick={() => setDil(true)}>Registrar diligência</Button>}
            </Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Checklists vinculados</Typography>
            {(p.checklists || []).length ? p.checklists.map((c: any) => (
              <Box key={c.id} sx={{ display: "flex", alignItems: "center", gap: 2, my: 0.5 }}><Typography variant="body2" sx={{ flex: 1 }}>{c.nome}</Typography><Box sx={{ width: 180 }}><Progress value={c.prontidao} /></Box></Box>
            )) : <Typography variant="body2" color="text.secondary">Nenhum. Crie um na aba Checklists.</Typography>}
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2 }}>Diligências</Typography>
            {(p.diligencias || []).length ? p.diligencias.map((d: any) => (
              <Paper key={d.id} variant="outlined" sx={{ p: 1, my: 0.5, borderRadius: 2 }}>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}><StatusChip value={d.status} /><Typography variant="caption">Prazo {fmtDate(d.prazoResposta)}</Typography></Box>
                <Typography variant="body2">{d.descricao}</Typography>
              </Paper>
            )) : <Typography variant="body2" color="text.secondary">Nenhuma.</Typography>}
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2 }}>Histórico</Typography>
            {(p.historico || []).map((h: any) => (
              <Typography key={h.id} variant="body2" color="text.secondary">{fmtDateTime(h.createdAt)} — {h.etapaDe ? `${label(h.etapaDe)} → ` : ""}<b>{label(h.etapaPara)}</b>{h.observacao ? ` (${h.observacao})` : ""}</Typography>
            ))}
          </>)}
        </Status>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      {p && <AvancarDialog proc={p} para={para} onClose={() => setPara(null)} onDone={done} />}
      {p && dil && <DiligenciaDialog proc={p} onClose={() => setDil(false)} onDone={done} />}
      {node}
    </Dialog>
  );
}

function Kanban() {
  const [tipo, setTipo] = useState("");
  const { data, loading, error, reload } = useApi<any>("/regulatorio/processos?pageSize=200");
  const [sel, setSel] = useState<string | null>(null);
  const items: any[] = useMemo(() => (Array.isArray(data) ? data : data?.items || []).filter((p: any) => !tipo || p.tipo === tipo), [data, tipo]);
  return (
    <Box>
      <TextField select size="small" label="Tipo de processo" value={tipo} onChange={(e) => setTipo(e.target.value)} sx={{ minWidth: 260, mb: 2 }}>
        <MenuItem value="">Todos</MenuItem>
        {TIPOS_PROC.map((t) => <MenuItem key={t} value={t}>{label(t)}</MenuItem>)}
      </TextField>
      <Status loading={loading && !data} error={error} onRetry={reload} empty={false}>
        <Box sx={{ display: "flex", gap: 1.5, overflowX: "auto", pb: 1 }}>
          {ETAPAS.map((e) => {
            const col = items.filter((p) => p.etapa === e);
            return (
              <Paper key={e} variant="outlined" sx={{ minWidth: 230, width: 230, p: 1, borderRadius: 3, bgcolor: "action.hover", borderTop: `4px solid ${ETAPA_COR[e]}` }}>
                <Typography variant="caption" sx={{ fontWeight: 800 }}>{label(e)} ({col.length})</Typography>
                {col.map((p) => (
                  <Paper key={p.id} onClick={() => setSel(p.id)} sx={{ p: 1, mt: 1, borderRadius: 2, cursor: "pointer", "&:hover": { boxShadow: 3 } }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{p.titulo}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{label(p.tipo)}</Typography>
                    {p.prazoProtocolo && e === "PREPARACAO" && <Typography variant="caption" color="warning.main">Protocolar até {fmtDate(p.prazoProtocolo)}</Typography>}
                    {p.resultado && <StatusChip value={p.resultado} />}
                  </Paper>
                ))}
                {!col.length && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>Vazio</Typography>}
              </Paper>
            );
          })}
        </Box>
      </Status>
      {sel && <Detalhe id={sel} onClose={() => setSel(null)} onChanged={reload} />}
    </Box>
  );
}

export default function ProcessosTab() {
  const [view, setView] = useState<"kanban" | "tabela">("kanban");
  return (
    <Box>
      <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)} sx={{ mb: 2 }}>
        <ToggleButton value="kanban">Quadro por etapa</ToggleButton>
        <ToggleButton value="tabela">Tabela / cadastro</ToggleButton>
      </ToggleButtonGroup>
      {view === "kanban" ? <Kanban /> : (
        <EduResourcePage title="Processos MEC / e-MEC" base="/regulatorio" resource="/processos" fields={FIELDS}
          description="Cadastre aqui; mova de etapa no quadro (abra o cartão do processo)."
          filters={[{ key: "tipo", label: "Tipo", options: TIPOS_PROC }, { key: "etapa", label: "Etapa", options: ETAPAS }]}
          columns={[
            { key: "titulo", label: "Título" }, { key: "tipo", label: "Tipo", render: (r) => label(r.tipo) },
            { key: "etapa", label: "Etapa", render: (r) => <StatusChip value={r.etapa} /> },
            { key: "protocoloEmec", label: "Protocolo e-MEC" }, { key: "prazoProtocolo", label: "Prazo protocolo", render: (r) => fmtDate(r.prazoProtocolo) },
          ]} />
      )}
    </Box>
  );
}
