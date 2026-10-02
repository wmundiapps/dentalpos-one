import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Pagination, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useState } from "react";
import { COLORS, FormDialog, Kpi, KpiRow, LoadBox, Pick, Section, Status, call, fmtDateTime, itemsOf, useApi, useToast } from "../desempenho/kit";

const TIPOS = ["PSICOPEDAGOGICO", "PSICOLOGICO", "SOCIAL", "SAUDE", "ACESSIBILIDADE", "ORIENTACAO_ACADEMICA", "OUTRO"];
const ORIGENS = ["PROCURA_ESPONTANEA", "ENCAMINHAMENTO_PROFESSOR", "BUSCA_ATIVA", "RISCO_EVASAO"];
const SIGILO_COR: Record<string, "default" | "warning" | "error"> = { NORMAL: "default", RESTRITO: "warning", SIGILOSO: "error" };

export default function AtendimentosTab() {
  const [rev, setRev] = useState(0);
  const [page, setPage] = useState(1);
  const [f, setF] = useState({ status: "", tipo: "" });
  const [novo, setNovo] = useState(false);
  const [reg, setReg] = useState<any | null>(null);
  const [resch, setResch] = useState<any | null>(null);
  const [ver, setVer] = useState<any | null>(null);
  const { toast, node } = useToast();
  const qs = new URLSearchParams({ page: String(page), pageSize: "20", ...(f.status ? { status: f.status } : {}), ...(f.tipo ? { tipo: f.tipo } : {}) }).toString();
  const list = useApi<any>(`/apoio/atendimentos?${qs}`, [rev]);
  const agenda = useApi<any>("/apoio/atendimentos/agenda", [rev]);
  const rows = itemsOf(list.data);
  const ag = itemsOf(agenda.data);
  const total = list.data?.total ?? 0;
  const hoje = ag.filter((a) => new Date(a.dataHora).toDateString() === new Date().toDateString()).length;
  const refresh = () => setRev((x) => x + 1);
  async function marcar(a: any, status: "FALTOU" | "CANCELADO") {
    if (!window.confirm(status === "FALTOU" ? "Registrar falta do aluno? Ele será avisado e um lembrete de reagendamento será criado." : "Cancelar este atendimento?")) return;
    try { await call("PATCH", `/apoio/atendimentos/${a.id}`, { status }); toast({ type: "success", text: "Atendimento atualizado." }); refresh(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function abrir(a: any) {
    try { setVer(await call("GET", `/apoio/atendimentos/${a.id}`)); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Box>
      {node}
      <KpiRow>
        <Kpi title="Agendados (7 dias)" value={ag.length} color={COLORS.info} />
        <Kpi title="Hoje" value={hoje} color={hoje ? COLORS.warn : undefined} />
        <Kpi title="Total no filtro" value={total} />
      </KpiRow>
      <Section title="Agenda da semana">
        <LoadBox loading={agenda.loading} error={agenda.error} empty={!ag.length} emptyText="Nenhum atendimento agendado nos próximos 7 dias." onRetry={agenda.reload}>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {ag.map((a) => <Chip key={a.id} color={a.sigilo === "SIGILOSO" ? "error" : "primary"} variant="outlined" label={`${fmtDateTime(a.dataHora)} · ${a.aluno?.nome ?? "Aluno"} · ${String(a.tipo).replace(/_/g, " ")}`} />)}
          </Box>
        </LoadBox>
      </Section>
      <Section title="Atendimentos (NAE / NAPNE / psicopedagógico)" actions={<>
        <Pick label="Status" value={f.status} all="Todos" minWidth={140} onChange={(v) => { setPage(1); setF({ ...f, status: v }); }} options={["AGENDADO", "REALIZADO", "FALTOU", "CANCELADO"].map((s) => ({ value: s, label: s }))} />
        <Pick label="Tipo" value={f.tipo} all="Todos" minWidth={180} onChange={(v) => { setPage(1); setF({ ...f, tipo: v }); }} options={TIPOS.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))} />
        <Button variant="contained" onClick={() => setNovo(true)}>Novo atendimento</Button>
      </>}>
        <Alert severity="info" sx={{ mb: 2 }}>Sigilo: NORMAL (equipe e coordenação) · RESTRITO (somente equipe de apoio) · SIGILOSO (somente o profissional que atendeu). Leituras de relato sigiloso são auditadas.</Alert>
        <LoadBox loading={list.loading} error={list.error} empty={!rows.length} emptyText="Nenhum atendimento registrado." onRetry={list.reload}>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead><TableRow><TableCell>Data/hora</TableCell><TableCell>Aluno</TableCell><TableCell>Tipo</TableCell><TableCell>Profissional</TableCell><TableCell>Sigilo</TableCell><TableCell>Status</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.id} hover>
                    <TableCell>{fmtDateTime(a.dataHora)}</TableCell><TableCell>{a.aluno?.nome ?? a.studentId}</TableCell><TableCell>{String(a.tipo).replace(/_/g, " ")}</TableCell><TableCell>{a.profissional ?? "—"}</TableCell>
                    <TableCell><Chip size="small" color={SIGILO_COR[a.sigilo] || "default"} label={a.sigilo} /></TableCell><TableCell><Status value={a.status} /></TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      {a.status === "AGENDADO" && <Button size="small" color="success" onClick={() => setReg(a)}>Registrar</Button>}
                      {a.status === "AGENDADO" && <Button size="small" onClick={() => setResch(a)}>Reagendar</Button>}
                      {a.status === "AGENDADO" && <Button size="small" color="warning" onClick={() => marcar(a, "FALTOU")}>Faltou</Button>}
                      {a.status === "AGENDADO" && <Button size="small" color="error" onClick={() => marcar(a, "CANCELADO")}>Cancelar</Button>}
                      {a.status !== "AGENDADO" && <Button size="small" onClick={() => abrir(a)}>Relato</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          {total > 20 && <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}><Pagination count={Math.ceil(total / 20)} page={page} onChange={(_, v) => setPage(v)} /></Box>}
        </LoadBox>
      </Section>
      <FormDialog open={novo} onClose={() => setNovo(false)} title="Agendar atendimento" submitLabel="Agendar" initial={{ duracaoMin: 50, origem: "PROCURA_ESPONTANEA" }}
        fields={[{ key: "studentId", label: "Aluno", type: "student", required: true }, { key: "tipo", label: "Tipo", type: "select", options: TIPOS, required: true }, { key: "dataHora", label: "Data e hora", type: "datetime", required: true }, { key: "duracaoMin", label: "Duração (min)", type: "number" },
          { key: "origem", label: "Origem", type: "select", options: ORIGENS }, { key: "sigilo", label: "Sigilo", type: "select", options: ["NORMAL", "RESTRITO", "SIGILOSO"], helper: "Vazio = padrão do tipo (psicológico/saúde: sigiloso)" }, { key: "motivo", label: "Motivo", type: "textarea" }]}
        onSubmit={async (b) => { await call("POST", "/apoio/atendimentos", b); toast({ type: "success", text: "Atendimento agendado; aluno notificado." }); refresh(); }} />
      <FormDialog open={!!reg} onClose={() => setReg(null)} title={`Registrar atendimento — ${reg?.aluno?.nome ?? ""}`}
        fields={[{ key: "relato", label: "Relato do atendimento", type: "textarea", required: true }, { key: "encaminhamentos", label: "Encaminhamentos", type: "textarea" }, { key: "retornoEm", label: "Data de retorno", type: "datetime" }]}
        onSubmit={async (b) => { await call("PATCH", `/apoio/atendimentos/${reg.id}`, { ...b, status: "REALIZADO" }); toast({ type: "success", text: "Atendimento registrado." }); refresh(); }} />
      <FormDialog open={!!resch} onClose={() => setResch(null)} maxWidth="sm" title="Reagendar atendimento" fields={[{ key: "dataHora", label: "Nova data e hora", type: "datetime", required: true }]}
        onSubmit={async (b) => { await call("PATCH", `/apoio/atendimentos/${resch.id}`, b); toast({ type: "success", text: "Reagendado; aluno notificado." }); refresh(); }} />
      {ver && (
        <Dialog open onClose={() => setVer(null)} fullWidth maxWidth="sm">
          <DialogTitle>Atendimento de {fmtDateTime(ver.dataHora)}</DialogTitle>
          <DialogContent dividers>
            {ver.relatoVisivel === false ? <Alert severity="warning">O relato deste atendimento é {ver.sigilo === "SIGILOSO" ? "sigiloso (restrito ao profissional que atendeu)" : "restrito"} e não está disponível para o seu perfil.</Alert> : (
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Motivo</Typography><Typography sx={{ mb: 2 }}>{ver.motivo || "—"}</Typography>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Relato</Typography><Typography sx={{ mb: 2, whiteSpace: "pre-wrap" }}>{ver.relato || "—"}</Typography>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Encaminhamentos</Typography><Typography sx={{ whiteSpace: "pre-wrap" }}>{ver.encaminhamentos || "—"}</Typography>
              </>
            )}
          </DialogContent>
          <DialogActions><Button onClick={() => setVer(null)}>Fechar</Button></DialogActions>
        </Dialog>
      )}
    </Box>
  );
}
