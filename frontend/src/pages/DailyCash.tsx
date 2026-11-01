import { Fragment, useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, FormControlLabel, Paper, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import PageHeader from "../components/PageHeader";
import { loadCashReport, saveCashSettings, sendCashNow, type CashResponse } from "../services/DailyCashApi";
import { setEntryDestination } from "../services/FinancialApi";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const today = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export default function DailyCash() {
  const [date, setDate] = useState(today());
  const [data, setData] = useState<CashResponse | null>(null);
  const [emails, setEmails] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    loadCashReport(date).then((d) => { setData(d); setEmails(d.settings.emails.join(", ")); }).catch((e) => setError(e instanceof Error ? e.message : "Não foi possível carregar."));
  }, [date]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); setError(""); setMsg(""); try { await fn(); setMsg(ok); load(); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível concluir."); } finally { setBusy(false); } };
  const r = data?.report;

  return (
    <Box>
      <PageHeader title="Fechamento de caixa" description="Entradas e saídas pagas no dia, por profissional: quem pagou, a forma de pagamento, quem recebeu e se o valor ficou no caixa ou foi para uma conta. Dá para imprimir e receber por e-mail todos os dias." />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {msg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMsg("")}>{msg}</Alert>}

      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 3, "@media print": { display: "none" } }}>
        <TextField type="date" size="small" label="Dia" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>Imprimir</Button>
        <Button variant="outlined" disabled={busy} onClick={() => void act(async () => { const x = await sendCashNow(date); if (x.skipped || !x.sent) throw new Error(x.reason || "Nenhum e-mail saiu. Confira o e-mail de destino e a chave de envio."); }, "Enviado agora por e-mail.")}>Enviar por e-mail agora</Button>
      </Box>

      <Typography variant="h6" sx={{ fontWeight: 800, mb: 1, display: "none", "@media print": { display: "block" } }}>Fechamento de caixa de {dmy(date)}</Typography>

      {r && (
        <>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, mb: 3 }}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, borderColor: "success.main" }}><Typography variant="body2" color="text.secondary">Entradas</Typography><Typography variant="h5" sx={{ fontWeight: 800, color: "success.main" }}>{brl(r.entries)}</Typography></Paper>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, borderColor: "error.main" }}><Typography variant="body2" color="text.secondary">Saídas</Typography><Typography variant="h5" sx={{ fontWeight: 800, color: "error.main" }}>{brl(r.exits)}</Typography></Paper>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}><Typography variant="body2" color="text.secondary">Saldo do dia</Typography><Typography variant="h5" sx={{ fontWeight: 800 }}>{brl(r.balance)}</Typography></Paper>
          </Box>

          {r.byMethod.length > 0 && (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 3 }}>
              <Typography sx={{ fontWeight: 800, mb: 1 }}>Entradas por forma de pagamento</Typography>
              <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{r.byMethod.map((m) => <Typography key={m.method} variant="body2"><b>{m.method}:</b> {brl(m.total)}</Typography>)}</Box>
            </Paper>
          )}

          {r.byDestination.length > 0 && (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 3 }}>
              <Typography sx={{ fontWeight: 800, mb: 1 }}>Para onde foi o dinheiro recebido</Typography>
              <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{r.byDestination.map((d) => <Typography key={d.destination} variant="body2"><b>{d.destination}:</b> {brl(d.total)}</Typography>)}</Box>
            </Paper>
          )}

          {!r.groups.length && <Alert severity="info" sx={{ mb: 3 }}>Nenhum lançamento pago neste dia.</Alert>}

          {r.groups.length > 0 && (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, overflowX: "auto", mb: 3 }}>
              <Table size="small">
                <TableHead><TableRow><TableCell>Profissional</TableCell><TableCell align="right">Entradas</TableCell><TableCell align="right">Saídas</TableCell><TableCell align="right">Saldo</TableCell></TableRow></TableHead>
                <TableBody>
                  {r.groups.map((g) => (
                    <Fragment key={g.key}>
                      <TableRow sx={{ bgcolor: "action.hover" }}>
                        <TableCell sx={{ fontWeight: 800 }}>{g.name}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>{brl(g.entries)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>{brl(g.exits)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800 }}>{brl(g.balance)}</TableCell>
                      </TableRow>
                      {g.lines.length > 0 && (
                        <TableRow>
                          <TableCell colSpan={4} sx={{ p: 0, border: 0 }}>
                            <Table size="small">
                              <TableHead><TableRow><TableCell>Hora</TableCell><TableCell>Quem pagou</TableCell><TableCell>Forma</TableCell><TableCell>Quem recebeu</TableCell><TableCell>Destino</TableCell><TableCell align="right">Valor</TableCell><TableCell sx={{ "@media print": { display: "none" } }} /></TableRow></TableHead>
                              <TableBody>
                                {g.lines.map((l) => (
                                  <TableRow key={`${g.key}-${l.id}-${l.amount}`}>
                                    <TableCell>{l.time}</TableCell>
                                    <TableCell>{l.kind === "ENTRADA" ? l.payer : <>Clínica <i>(pago a {l.who})</i></>}<Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{l.description}</Typography></TableCell>
                                    <TableCell>{l.method}</TableCell>
                                    <TableCell>{l.receivedBy}</TableCell>
                                    <TableCell>{l.kind === "ENTRADA" ? <>{l.destinationLabel}{l.destinationInferred && <i> (presumido)</i>}</> : "—"}</TableCell>
                                    <TableCell align="right" sx={{ color: l.kind === "ENTRADA" ? "success.main" : "error.main", fontWeight: 700 }}>{l.kind === "ENTRADA" ? "+" : "−"} {brl(l.amount)}</TableCell>
                                    <TableCell sx={{ "@media print": { display: "none" } }}>
                                      {l.kind === "ENTRADA" && l.destination === "CAIXA" && (
                                        <Button size="small" disabled={busy} onClick={() => { const account = window.prompt("Para qual conta o valor foi enviado? (ex.: Banco Inter)"); if (account && account.trim()) void act(() => setEntryDestination(l.id, { cashDestination: "CONTA", destinationAccount: account.trim() }), "Destino registrado."); }}>Enviado para conta</Button>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>A divisão por profissional segue a divisão da cobrança ou o atendimento do paciente no dia. O que não tem profissional aparece em "Clínica".</Typography>
            </Paper>
          )}

          <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, "@media print": { display: "none" } }}>
            <Typography sx={{ fontWeight: 800 }}>Envio automático por e-mail</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Todo dia, depois das 19h, o fechamento do dia chega por e-mail (só em dias com movimento).</Typography>
            <FormControlLabel control={<Switch checked={data.settings.enabled} disabled={busy} onChange={(_, v) => void act(() => saveCashSettings({ enabled: v }), v ? "Envio diário ligado." : "Envio diário desligado.")} />} label="Enviar todo dia" />
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mt: 1 }}>
              <TextField size="small" label="E-mails (separe por vírgula)" value={emails} onChange={(e) => setEmails(e.target.value)} sx={{ minWidth: 320, flex: 1 }} helperText="Vazio = administradores da clínica." />
              <Button variant="outlined" disabled={busy} onClick={() => void act(() => saveCashSettings({ emails: emails.split(/[\s,;]+/).filter(Boolean) }), "E-mails salvos.")}>Salvar e-mails</Button>
            </Box>
          </Paper>
        </>
      )}
    </Box>
  );
}
