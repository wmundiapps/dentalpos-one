import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import {
  dispatchDueSurveys, loadNotContracted, loadSatisfactionReport, loadSurveys, markLowScoreHandled, regenerateSurveyLink,
  type NotContractedRow, type SatisfactionReport as Report, type SurveyRow,
} from "../services/SatisfactionApi";

const STATUS: Record<string, string> = { PENDING: "Agendada", SENT: "Enviada", ANSWERED: "Respondida", EXPIRED: "Expirada", CANCELLED: "Cancelada" };
const JOURNEY: Record<string, string> = { PRIMEIRA_CONSULTA: "Primeira consulta", TRATAMENTO: "Durante o tratamento", FIM_TRATAMENTO: "Fim do tratamento" };
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "-");

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, flex: "1 1 160px" }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h5" sx={{ fontWeight: 800 }}>{value}</Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </Paper>
  );
}

export default function SatisfactionReport() {
  const [report, setReport] = useState<Report | null>(null);
  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [lost, setLost] = useState<NotContractedRow[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [r, s, l] = await Promise.all([loadSatisfactionReport(from || undefined, to || undefined), loadSurveys(), loadNotContracted()]);
      setReport(r); setSurveys(s); setLost(l);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar."); } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const copyLink = async (id: string) => {
    try {
      const res = await regenerateSurveyLink(id);
      await navigator.clipboard.writeText(res.link);
      setInfo("Novo link copiado. O link anterior deixou de valer.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível gerar o link."); }
  };
  const dispatchDue = async () => {
    try { const r = await dispatchDueSurveys(); setInfo(`${r.sent} de ${r.checked} pesquisas agendadas foram enviadas.`); void load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao enviar."); }
  };
  const handle = async (id: string) => { try { await markLowScoreHandled(id); void load(); } catch (e) { setError(e instanceof Error ? e.message : "Erro."); } };

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 } }}>
      <Typography variant="h5" sx={{ fontWeight: 800 }}>Satisfação dos pacientes</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>NPS, avaliação por profissional, motivos de não contratação e conversão de primeiras consultas.</Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField type="date" size="small" label="De" slotProps={{ inputLabel: { shrink: true } }} value={from} onChange={e => setFrom(e.target.value)} />
        <TextField type="date" size="small" label="Até" slotProps={{ inputLabel: { shrink: true } }} value={to} onChange={e => setTo(e.target.value)} />
        <Button variant="outlined" onClick={dispatchDue}>Enviar pesquisas agendadas</Button>
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {info && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setInfo("")}>{info}</Alert>}
      {loading && <CircularProgress />}
      {report && !loading && (
        <>
          <Stack direction="row" sx={{ mb: 3, flexWrap: "wrap", gap: 1.5 }}>
            <Stat label="NPS geral" value={report.nps === null ? "-" : String(report.nps)} hint={`${report.responses} respostas`} />
            <Stat label="Taxa de resposta" value={report.responseRate === null ? "-" : `${report.responseRate}%`} hint={`${report.sent} enviadas`} />
            <Stat label="Promotores / Neutros / Detratores" value={`${report.distribution.promoters} / ${report.distribution.neutrals} / ${report.distribution.detractors}`} />
            <Stat label="Conversão da primeira consulta" value={report.firstConsultConversion.rate === null ? "-" : `${report.firstConsultConversion.rate}%`} hint={`${report.firstConsultConversion.contracted} de ${report.firstConsultConversion.answered} contrataram`} />
          </Stack>

          {report.alerts.lowScoreCount > 0 && (
            <Paper variant="outlined" sx={{ p: 2, mb: 3, borderColor: "error.main" }}>
              <Typography sx={{ fontWeight: 700 }} color="error">Alertas: {report.alerts.lowScoreCount} nota(s) de 0 a 6 para tratar</Typography>
              {report.alerts.items.map(a => (
                <Box key={a.answerId} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", py: 0.75, borderTop: "1px solid", borderColor: "divider", mt: 0.75 }}>
                  <Chip size="small" color="error" label={`Nota ${a.nps}`} />
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 180 }}>
                    {a.patientName}{a.phone ? ` - ${a.phone}` : ""}{a.wantsContact ? " (pede contato)" : ""}{a.comment ? `: "${a.comment}"` : ""}
                  </Typography>
                  {a.handled ? <Chip size="small" label="Tratado" /> : <Button size="small" onClick={() => handle(a.answerId)}>Marcar como tratado</Button>}
                </Box>
              ))}
            </Paper>
          )}

          <Typography sx={{ fontWeight: 700, mb: 1 }}>Por profissional</Typography>
          <Paper variant="outlined" sx={{ mb: 3, overflowX: "auto" }}>
            <Table size="small">
              <TableHead><TableRow><TableCell>Profissional</TableCell><TableCell align="right">Respostas</TableCell><TableCell align="right">Nota média</TableCell><TableCell align="right">NPS</TableCell></TableRow></TableHead>
              <TableBody>
                {report.byDoctor.length === 0 && <TableRow><TableCell colSpan={4}>Sem respostas no período.</TableCell></TableRow>}
                {report.byDoctor.map(d => (
                  <TableRow key={d.doctorId}><TableCell>{d.name}</TableCell><TableCell align="right">{d.responses}</TableCell><TableCell align="right">{d.average}</TableCell><TableCell align="right">{d.nps ?? "-"}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>

          <Typography sx={{ fontWeight: 700, mb: 1 }}>Motivos de não contratação</Typography>
          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            {report.notContractedReasons.length === 0 && <Typography color="text.secondary">Nenhum registro no período.</Typography>}
            {report.notContractedReasons.map(r => <Typography key={r.reason} variant="body2">{r.count}x - {r.reason}</Typography>)}
          </Paper>

          <Typography sx={{ fontWeight: 700, mb: 1 }}>Pacientes que não contrataram (para contato comercial)</Typography>
          <Paper variant="outlined" sx={{ mb: 3, overflowX: "auto" }}>
            <Table size="small">
              <TableHead><TableRow><TableCell>Paciente</TableCell><TableCell>Contato</TableCell><TableCell>Motivo</TableCell><TableCell>Data</TableCell></TableRow></TableHead>
              <TableBody>
                {lost.length === 0 && <TableRow><TableCell colSpan={4}>Nenhum registro.</TableCell></TableRow>}
                {lost.map(l => (
                  <TableRow key={l.answerId}><TableCell>{l.patientName}{l.wantsContact ? " (pede contato)" : ""}</TableCell><TableCell>{l.phone || l.email || "-"}</TableCell><TableCell>{l.reason || "Não informado"}</TableCell><TableCell>{fmt(l.createdAt)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>

          {report.testimonials.length > 0 && (
            <>
              <Typography sx={{ fontWeight: 700, mb: 1 }}>Depoimentos autorizados</Typography>
              <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
                {report.testimonials.map((t, i) => <Typography key={i} variant="body2" sx={{ mb: 1 }}>"{t.comment}" {t.doctor ? `- sobre ${t.doctor}` : ""} ({fmt(t.createdAt)})</Typography>)}
              </Paper>
            </>
          )}

          <Typography sx={{ fontWeight: 700, mb: 1 }}>Pesquisas</Typography>
          <Typography variant="caption" color="text.secondary">Sem canal de envio configurado, gere o link e copie para enviar manualmente. Para criar uma pesquisa, finalize o atendimento na Agenda.</Typography>
          <Paper variant="outlined" sx={{ mt: 1, overflowX: "auto" }}>
            <Table size="small">
              <TableHead><TableRow><TableCell>Paciente</TableCell><TableCell>Jornada</TableCell><TableCell>Situação</TableCell><TableCell>Validade</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>
                {surveys.length === 0 && <TableRow><TableCell colSpan={5}>Nenhuma pesquisa criada.</TableCell></TableRow>}
                {surveys.map(s => (
                  <TableRow key={s.id}>
                    <TableCell>{s.patientName}</TableCell><TableCell>{JOURNEY[s.journey] || s.journey}</TableCell>
                    <TableCell>{STATUS[s.status] || s.status}{s.dispatchError ? ` (${s.dispatchError})` : ""}</TableCell><TableCell>{fmt(s.expiresAt)}</TableCell>
                    <TableCell align="right">{(s.status === "PENDING" || s.status === "SENT" || s.status === "EXPIRED") && <Button size="small" onClick={() => copyLink(s.id)}>Copiar novo link</Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}
    </Box>
  );
}
