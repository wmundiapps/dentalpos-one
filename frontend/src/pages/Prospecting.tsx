import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Pagination,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import SendIcon from "@mui/icons-material/Send";
import HistoryIcon from "@mui/icons-material/History";
import PageHeader from "../components/PageHeader";
import {
  importProspects,
  loadProspectEvents,
  loadProspects,
  loadProspectStats,
  runProspects,
  saveProspectConfig,
  sendProspectTest,
  updateProspect,
  type ProspectEvent,
  type ProspectLead,
  type ProspectStats,
  type ProspectStatus,
} from "../services/ProspectApi";

const STATUS_LABEL: Record<string, { label: string; color: "default" | "primary" | "success" | "warning" | "error" | "info" }> = {
  NOVO: { label: "Novo", color: "default" },
  EM_SEQUENCIA: { label: "Em sequência", color: "info" },
  SEQUENCIA_CONCLUIDA: { label: "Sequência concluída", color: "default" },
  QUENTE: { label: "Quente (clicou)", color: "warning" },
  RESPONDEU: { label: "Respondeu", color: "primary" },
  CONVERTIDO: { label: "Convertido", color: "success" },
  DESCADASTRADO: { label: "Descadastrado", color: "error" },
  BOUNCE: { label: "E-mail inválido", color: "error" },
  EXCLUIDO: { label: "Excluído", color: "default" },
};

const CARDS: Array<{ key: string; label: string; help: string }> = [
  { key: "", label: "Total na base", help: "Todos os leads importados" },
  { key: "NOVO", label: "Aguardando 1º e-mail", help: "Ainda não receberam nada" },
  { key: "EM_SEQUENCIA", label: "Em sequência", help: "Receberam o 1º ou o 2º e-mail" },
  { key: "QUENTE", label: "Quentes", help: "Clicaram no link: ligar hoje" },
  { key: "RESPONDEU", label: "Responderam", help: "Marcados pela equipe" },
  { key: "CONVERTIDO", label: "Convertidos", help: "Criaram conta no DentalPos" },
  { key: "DESCADASTRADO", label: "Descadastrados", help: "Nunca mais recebem" },
];

const dataHora = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";

export default function Prospecting() {
  const [stats, setStats] = useState<ProspectStats | null>(null);
  const [rows, setRows] = useState<ProspectLead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testStep, setTestStep] = useState(1);
  const [history, setHistory] = useState<{ lead: ProspectLead; events: ProspectEvent[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, list] = await Promise.all([loadProspectStats(), loadProspects({ status, q, page })]);
      setStats(s);
      setRows(list.rows);
      setTotal(list.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [status, q, page]);

  useEffect(() => {
    const timer = setTimeout(() => void reload(), q ? 350 : 0);
    return () => clearTimeout(timer);
  }, [reload, q]);

  const saveConfig = async (patch: Parameters<typeof saveProspectConfig>[0]) => {
    try {
      await saveProspectConfig(patch);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    }
  };

  const onImport = async (file: File) => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const parsed = JSON.parse(await file.text());
      const leads: unknown[] = Array.isArray(parsed) ? parsed : parsed.leads || [];
      const source = String(parsed.source || file.name);
      let created = 0, skipped = 0, blocked = 0;
      for (let i = 0; i < leads.length; i += 500) {
        setMessage(`Importando ${Math.min(i + 500, leads.length)} de ${leads.length}...`);
        const r = await importProspects(leads.slice(i, i + 500), source);
        created += r.created; skipped += r.skipped; blocked += r.blocked;
      }
      setMessage(`Importação concluída: ${created} novos, ${skipped} já existiam ou inválidos, ${blocked} na lista de bloqueio.`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Arquivo inválido.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const run = async (dryRun: boolean) => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const r = await runProspects({ dryRun, force: dryRun });
      if (r.skipped) setMessage(r.reason || "Nada a enviar agora.");
      else if (dryRun) setMessage(`Simulação: ${r.preview?.length || 0} e-mail(s) sairiam agora. Nada foi enviado.`);
      else setMessage(`Enviados ${r.sent || 0} e-mail(s)${r.errors ? `, ${r.errors} erro(s)` : ""}. Hoje: ${r.sentToday || 0}.`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao rodar.");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const r = await sendProspectTest(testTo, testStep);
      setMessage(`Teste do e-mail ${testStep} enviado para ${testTo} (modelo: ${r.modelLead}). Confira também a caixa de spam.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao enviar teste.");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (lead: ProspectLead, next: ProspectStatus) => {
    if ((next === "EXCLUIDO" || next === "DESCADASTRADO") && !window.confirm(`Bloquear ${lead.displayName} para sempre?`)) return;
    try {
      await updateProspect(lead.id, { status: next });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar.");
    }
  };

  const openHistory = async (lead: ProspectLead) => {
    try {
      setHistory({ lead, events: await loadProspectEvents(lead.id) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar histórico.");
    }
  };

  const config = stats?.config;
  const count = (key: string) => (key ? stats?.byStatus[key] || 0 : stats?.total || 0);

  return (
    <Box>
      <PageHeader
        title="Prospecção de clínicas"
        description="Leads dos dados públicos de CNPJ da Receita Federal, sequência de 3 e-mails e acompanhamento de quem demonstrou interesse."
      />

      <Alert severity="info" sx={{ mb: 2 }}>
        <b>Como funciona:</b> importe o arquivo gerado pelo script da Receita, faça o teste no seu e-mail e ligue o envio. A cada dia útil
        o sistema manda o 1º e-mail para os novos e os lembretes para quem já recebeu, respeitando o limite diário. Quem clica vira{" "}
        <b>quente</b> e você recebe um aviso em contato@dentalpos.com.br. Quem se descadastra nunca mais recebe.
      </Alert>

      {error ? <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert> : null}
      {message ? <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage("")}>{message}</Alert> : null}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(7, 1fr)" }, gap: 1.5, mb: 2 }}>
        {CARDS.map((card) => {
          const active = status === card.key;
          return (
            <Paper
              key={card.key || "total"}
              variant="outlined"
              onClick={() => { setStatus(card.key); setPage(1); }}
              sx={{ p: 1.5, borderRadius: 2, cursor: "pointer", borderColor: active ? "primary.main" : "divider", bgcolor: active ? "action.selected" : "background.paper" }}
            >
              <Typography variant="caption" color="text.secondary">{card.label}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 900 }}>{count(card.key)}</Typography>
              <Typography variant="caption" color="text.secondary">{card.help}</Typography>
            </Paper>
          );
        })}
      </Box>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
        <Typography sx={{ fontWeight: 900, mb: 1 }}>Envio</Typography>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
          <FormControlLabel
            control={<Switch checked={Boolean(config?.sendingEnabled)} onChange={(e) => void saveConfig({ sendingEnabled: e.target.checked })} />}
            label={config?.sendingEnabled ? "Envio automático LIGADO" : "Envio automático desligado"}
          />
          <TextField
            size="small"
            type="number"
            label="Limite por dia"
            value={config?.dailyLimit ?? 10}
            onChange={(e) => void saveConfig({ dailyLimit: Number(e.target.value) })}
            sx={{ width: 140 }}
            helperText="Aquecimento: 10 → 20 → 40 → 80"
          />
          <TextField
            select
            size="small"
            label="Público"
            value={config?.segments || "CLINICA"}
            onChange={(e) => void saveConfig({ segments: e.target.value })}
            sx={{ width: 220 }}
          >
            <MenuItem value="CLINICA">Só clínicas</MenuItem>
            <MenuItem value="LABORATORIO">Só laboratórios</MenuItem>
            <MenuItem value="CLINICA,LABORATORIO">Clínicas e laboratórios</MenuItem>
          </TextField>
          <FormControlLabel
            control={<Switch checked={config?.sendToWebmail ?? true} onChange={(e) => void saveConfig({ sendToWebmail: e.target.checked })} />}
            label="Enviar também para Gmail/Hotmail"
          />
          <Typography variant="body2" color="text.secondary">
            Hoje: <b>{stats?.sentToday ?? 0}</b> enviados · Total: {stats?.sentTotal ?? 0} · Cliques: {stats?.clicks ?? 0}
          </Typography>
        </Box>

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 2 }}>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && void onImport(e.target.files[0])} />
          <Button variant="outlined" startIcon={<UploadFileIcon />} disabled={busy} onClick={() => fileRef.current?.click()}>
            Importar arquivo da Receita
          </Button>
          <Button variant="outlined" disabled={busy} onClick={() => void run(true)}>Simular envio de hoje</Button>
          <Button variant="contained" startIcon={<PlayArrowIcon />} disabled={busy || !config?.sendingEnabled} onClick={() => void run(false)}>
            Enviar agora
          </Button>
          {busy ? <CircularProgress size={22} sx={{ alignSelf: "center" }} /> : null}
        </Box>

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 2, alignItems: "center" }}>
          <TextField size="small" label="Enviar teste para" placeholder="seu@email.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} sx={{ minWidth: 240 }} />
          <TextField select size="small" label="E-mail" value={testStep} onChange={(e) => setTestStep(Number(e.target.value))} sx={{ width: 170 }}>
            <MenuItem value={1}>1 · Apresentação</MenuItem>
            <MenuItem value={2}>2 · Benefício</MenuItem>
            <MenuItem value={3}>3 · Última chamada</MenuItem>
          </TextField>
          <Button startIcon={<SendIcon />} disabled={busy || !testTo} onClick={() => void test()}>Enviar teste</Button>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 3 }}>
        <Box sx={{ p: 2, display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
          <TextField size="small" label="Buscar" placeholder="Nome, CNPJ ou e-mail" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} sx={{ minWidth: 280 }} />
          {status ? <Chip label={`Filtro: ${STATUS_LABEL[status]?.label || status}`} onDelete={() => setStatus("")} /> : null}
          <Typography variant="body2" color="text.secondary">{total} lead(s)</Typography>
        </Box>
        {loading ? (
          <Box sx={{ display: "grid", placeItems: "center", minHeight: 160 }}><CircularProgress /></Box>
        ) : (
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Clínica</TableCell>
                  <TableCell>Contato</TableCell>
                  <TableCell>Cidade</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Último envio</TableCell>
                  <TableCell align="right">Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((lead) => (
                  <TableRow key={lead.id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700 }}>{lead.displayName}</Typography>
                      <Typography variant="caption" color="text.secondary">{lead.razaoSocial} · {lead.cnpj}{lead.segment === "LABORATORIO" ? " · Laboratório" : ""}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{lead.email || "—"}</Typography>
                      <Typography variant="caption" color="text.secondary">{[lead.phone1, lead.phone2].filter(Boolean).join(" / ") || "—"}</Typography>
                    </TableCell>
                    <TableCell>{lead.city || "—"}/{lead.uf}</TableCell>
                    <TableCell>
                      <Chip size="small" color={STATUS_LABEL[lead.status]?.color || "default"} label={STATUS_LABEL[lead.status]?.label || lead.status} />
                    </TableCell>
                    <TableCell>{lead.lastStep ? `E-mail ${lead.lastStep} · ${dataHora(lead.lastSentAt)}` : "—"}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <Button size="small" startIcon={<HistoryIcon />} onClick={() => void openHistory(lead)}>Histórico</Button>
                      <TextField
                        select
                        size="small"
                        value=""
                        label="Marcar"
                        onChange={(e) => void changeStatus(lead, e.target.value as ProspectStatus)}
                        sx={{ width: 130, ml: 1 }}
                      >
                        <MenuItem value="RESPONDEU">Respondeu</MenuItem>
                        <MenuItem value="CONVERTIDO">Convertido</MenuItem>
                        <MenuItem value="NOVO">Voltar para novo</MenuItem>
                        <MenuItem value="EXCLUIDO">Excluir e bloquear</MenuItem>
                      </TextField>
                    </TableCell>
                  </TableRow>
                ))}
                {!rows.length ? (
                  <TableRow><TableCell colSpan={6}><Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>Nenhum lead neste filtro.</Typography></TableCell></TableRow>
                ) : null}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {total > 50 ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
            <Pagination count={Math.ceil(total / 50)} page={page} onChange={(_, value) => setPage(value)} />
          </Box>
        ) : null}
      </Paper>

      <Dialog open={Boolean(history)} onClose={() => setHistory(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>{history?.lead.displayName}</DialogTitle>
        <DialogContent>
          {history?.events.length ? (
            history.events.map((event) => (
              <Box key={event.id} sx={{ py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{event.type}{event.step ? ` · e-mail ${event.step}` : ""}</Typography>
                <Typography variant="caption" color="text.secondary">{dataHora(event.createdAt)} · {event.detail || ""}</Typography>
              </Box>
            ))
          ) : (
            <Typography color="text.secondary">Sem eventos.</Typography>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setHistory(null)}>Fechar</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
