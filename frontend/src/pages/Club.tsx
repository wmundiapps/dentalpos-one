import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, FormControlLabel, LinearProgress, MenuItem, Paper, Radio, RadioGroup,
  Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from "@mui/material";
import PageHeader from "../components/PageHeader";
import { loadBackendPatients, type BackendPatient } from "../services/PatientApi";
import {
  addCashbackMember, brl, cancelClubSale, confirmClubSale, createClubSale, currentMonth, loadCashbackMembers, loadCashbackStatement,
  loadClubOptions, loadClubPanel, loadClubReport, loadClubSales, loadClubSettings, loadMyWeek, loadSurveys, loadTeamResults,
  saveClubSettings, sendTeamEvaluation, spendCashback, transferCashback,
  type CashbackMember, type CashbackStatement, type ClubConfig, type ClubOptions, type ClubPanel, type ClubReport, type ClubSale,
  type MyWeek, type SurveyResults, type TeamResults,
} from "../services/ClubApi";

type Msg = { type: "success" | "error"; text: string } | null;
const dmy = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

function useRunner() {
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string, after?: () => void) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ type: "success", text: ok }); after?.(); }
    catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "Não foi possível concluir." }); }
    finally { setBusy(false); }
  };
  const box = msg ? <Alert severity={msg.type} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert> : null;
  return { run, busy, box };
}

function PatientPicker({ patients, value, onChange, label }: { patients: BackendPatient[]; value: string; onChange: (id: string) => void; label: string }) {
  const selected = patients.find((p) => p.id === value) || null;
  return (
    <Autocomplete options={patients} value={selected} onChange={(_, p) => onChange(p?.id || "")}
      getOptionLabel={(p) => `${p.fullName}${p.phone ? ` — ${p.phone}` : ""}`} isOptionEqualToValue={(a, b) => a.id === b.id}
      renderInput={(params) => <TextField {...params} label={label} size="small" />} sx={{ minWidth: 280, flex: 1 }} />
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 3, mb: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>{title}</Typography>
      {children}
    </Paper>
  );
}

// ---------------- Painel da meta (so numeros) ----------------
function Goal({ label, done, goal, pct, footer }: { label: string; done: number; goal: number; pct: number; footer: string }) {
  const hit = pct >= 100;
  return (
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, flex: 1, minWidth: 240 }}>
      <Typography variant="overline" color="text.secondary">{label}</Typography>
      <Typography sx={{ fontSize: 44, fontWeight: 800, lineHeight: 1.1 }}>{done} <Typography component="span" sx={{ fontSize: 24, color: "text.secondary" }}>de {goal}</Typography></Typography>
      <LinearProgress variant="determinate" value={Math.min(100, pct)} color={hit ? "success" : "primary"} sx={{ height: 10, borderRadius: 5, my: 1.5 }} />
      <Typography sx={{ fontWeight: 700 }} color={hit ? "success.main" : "text.primary"}>{pct}% da meta</Typography>
      <Typography variant="body2" color="text.secondary">{footer}</Typography>
    </Paper>
  );
}

function PanelTab({ month }: { month: string }) {
  const [p, setP] = useState<ClubPanel | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { setP(null); loadClubPanel(month).then(setP).catch((e) => setErr(e.message)); }, [month]);
  if (err) return <Alert severity="error">{err}</Alert>;
  if (!p) return <LinearProgress />;
  const c = p.contracts;
  return (
    <Box>
      <Alert severity={p.goalHit ? "success" : "info"} sx={{ mb: 2 }}>
        {p.goalHit ? "Meta do mês batida! Cada novo contrato aumenta o Caixa da Equipe." : `Faltam ${p.daysLeft} dia(s) para fechar o mês.`}
      </Alert>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>
        <Goal label="Contratos de manutenção" done={c.done} goal={c.goal} pct={c.pct} footer={c.over > 0 ? `${c.over} acima da meta` : `Faltam ${c.missing}`} />
        <Goal label="Tratamentos da campanha" done={p.treatments.done} goal={p.treatments.goal} pct={p.treatments.pct} footer={p.treatments.hit ? "Meta de vendas batida" : "Percentual da meta de vendas do mês"} />
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, flex: 1, minWidth: 240 }}>
          <Typography variant="overline" color="text.secondary">Inadimplência do mês</Typography>
          <Typography sx={{ fontSize: 32, fontWeight: 800, mt: 1 }} color={p.delinquencyOk ? "success.main" : "warning.main"}>{p.delinquencyOk ? "Dentro da meta" : "Acima da meta"}</Typography>
          <Typography variant="body2" color="text.secondary">Abaixo do limite, a equipe ganha o bônus extra quando bate a meta.</Typography>
        </Paper>
      </Box>
      <Section title="Ranking do mês">
        {p.ranking.length ? (
          <Table size="small">
            <TableHead><TableRow><TableCell>#</TableCell><TableCell>Nome</TableCell><TableCell align="right">Contratos</TableCell><TableCell align="right">Tratamentos</TableCell></TableRow></TableHead>
            <TableBody>{p.ranking.map((r) => <TableRow key={r.position}><TableCell>{r.position}º</TableCell><TableCell>{r.name}</TableCell><TableCell align="right">{r.contracts}</TableCell><TableCell align="right">{r.treatments}</TableCell></TableRow>)}</TableBody>
          </Table>
        ) : <Typography color="text.secondary">Nenhuma venda confirmada neste mês ainda.</Typography>}
      </Section>
    </Box>
  );
}

// ---------------- Formulario de venda ----------------
function SaleTab({ opts, patients, month }: { opts: ClubOptions; patients: BackendPatient[]; month: string }) {
  const empty = { patientId: "", kind: "MANUTENCAO", amount: "", saleDate: new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10), captureChannel: "PRESENCIAL", sellerIds: [opts.me], mainSellerId: opts.me, origin: "", notes: "" };
  const [f, setF] = useState(empty);
  const [sales, setSales] = useState<ClubSale[]>([]);
  const { run, busy, box } = useRunner();
  const load = useCallback(() => { loadClubSales(month).then((d) => setSales(d.sales)).catch(() => setSales([])); }, [month]);
  useEffect(() => { load(); }, [load]);
  const team = opts.team;
  const submit = () => run(() => createClubSale({ ...f, amount: Number(String(f.amount).replace(/\./g, "").replace(",", ".")), origin: f.origin || undefined }), "Venda registrada. O pagamento conta depois de confirmado pelo financeiro.", () => { setF({ ...empty }); load(); });
  return (
    <Box>
      {box}
      <Section title="Registrar venda do Clube">
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          <PatientPicker patients={patients} value={f.patientId} onChange={(id) => setF({ ...f, patientId: id })} label="Paciente" />
          <TextField select size="small" label="Tipo" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            {Object.entries(opts.kinds).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Valor pago pelo paciente (R$)" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} inputMode="decimal" />
          <TextField size="small" type="date" label="Data" InputLabelProps={{ shrink: true }} value={f.saleDate} onChange={(e) => setF({ ...f, saleDate: e.target.value })} />
          <TextField select size="small" label="Mecanismo de captação" value={f.captureChannel} onChange={(e) => setF({ ...f, captureChannel: e.target.value })}>
            {Object.entries(opts.channels).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
          </TextField>
          {f.kind === "TRATAMENTO" && (
            <TextField select size="small" label="Origem do paciente (se ainda não estiver na ficha)" value={f.origin} onChange={(e) => setF({ ...f, origin: e.target.value })} helperText="Só a campanha dos funcionários entra na comissão de tratamentos.">
              <MenuItem value="">Já está na ficha</MenuItem>
              {Object.entries(opts.origins).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
            </TextField>
          )}
          <Autocomplete multiple options={team} value={team.filter((t) => f.sellerIds.includes(t.id))} getOptionLabel={(t) => t.name}
            onChange={(_, v) => { const ids = v.map((t) => t.id); setF({ ...f, sellerIds: ids, mainSellerId: ids.includes(f.mainSellerId) ? f.mainSellerId : ids[0] || "" }); }}
            renderInput={(p) => <TextField {...p} size="small" label="Quem participou da venda" />} />
          <TextField select size="small" label="Responsável principal (conta no ranking)" value={f.mainSellerId} onChange={(e) => setF({ ...f, mainSellerId: e.target.value })}>
            {team.filter((t) => f.sellerIds.includes(t.id)).map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Observações" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} sx={{ gridColumn: { md: "1 / -1" } }} />
        </Box>
        <Button variant="contained" sx={{ mt: 2 }} disabled={busy || !f.patientId || !f.amount || !f.sellerIds.length} onClick={submit}>Registrar</Button>
      </Section>
      <Section title={`Vendas de ${month.split("-").reverse().join("/")}`}>
        <Table size="small">
          <TableHead><TableRow><TableCell>Data</TableCell><TableCell>Paciente</TableCell><TableCell>Tipo</TableCell>{opts.isManager && <TableCell align="right">Valor</TableCell>}<TableCell>Captação</TableCell><TableCell>Responsável</TableCell><TableCell>Origem</TableCell><TableCell>Situação</TableCell>{opts.isManager && <TableCell />}</TableRow></TableHead>
          <TableBody>
            {sales.map((s) => (
              <TableRow key={s.id} sx={{ opacity: s.cancelled ? 0.5 : 1 }}>
                <TableCell>{dmy(s.saleDate)}</TableCell><TableCell>{s.patientName}</TableCell><TableCell>{s.kindLabel}</TableCell>
                {opts.isManager && <TableCell align="right">{s.amount !== undefined ? brl(s.amount) : ""}</TableCell>}
                <TableCell>{s.captureChannel}</TableCell><TableCell>{s.mainSeller}</TableCell><TableCell>{s.origin}</TableCell>
                <TableCell>
                  {s.cancelled ? <Chip size="small" label="Cancelada" /> : s.paymentConfirmed ? <Chip size="small" color="success" label="Pago" /> : <Chip size="small" color="warning" label="Aguardando pagamento" />}
                  {!s.cancelled && <Chip size="small" variant="outlined" sx={{ ml: 0.5 }} label={s.countsForTeam ? "Conta para a equipe" : "Não conta"} />}
                </TableCell>
                {opts.isManager && (
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    {!s.cancelled && !s.paymentConfirmed && <Button size="small" onClick={() => run(() => confirmClubSale(s.id), "Pagamento confirmado.", load)}>Confirmar pagamento</Button>}
                    {!s.cancelled && <Button size="small" color="error" onClick={() => run(() => cancelClubSale(s.id), "Venda cancelada.", load)}>Cancelar</Button>}
                  </TableCell>
                )}
              </TableRow>
            ))}
            {!sales.length && <TableRow><TableCell colSpan={9}><Typography color="text.secondary">Nenhuma venda neste mês.</Typography></TableCell></TableRow>}
          </TableBody>
        </Table>
      </Section>
    </Box>
  );
}

// ---------------- Cashback ----------------
function CashbackTab({ opts, patients }: { opts: ClubOptions; patients: BackendPatient[] }) {
  const [members, setMembers] = useState<CashbackMember[]>([]);
  const [add, setAdd] = useState({ patientId: "", consent: false, freeMonths: "0" });
  const [sel, setSel] = useState("");
  const [st, setSt] = useState<CashbackStatement | null>(null);
  const [spend, setSpend] = useState("");
  const [tr, setTr] = useState({ toPatientId: "", amount: "", relation: "OUTRO" });
  const { run, busy, box } = useRunner();
  const load = useCallback(() => { loadCashbackMembers().then((d) => setMembers(d.members)).catch(() => setMembers([])); }, []);
  useEffect(() => { load(); }, [load]);
  const openSt = useCallback((id: string) => { setSel(id); setSt(null); if (id) loadCashbackStatement(id).then(setSt).catch(() => setSt(null)); }, []);
  const money = (v: string) => Number(String(v).replace(/\./g, "").replace(",", "."));
  const refresh = () => { load(); openSt(sel); };
  return (
    <Box>
      {box}
      <Section title="Cadastrar no Cashbacksmart">
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
          <PatientPicker patients={patients} value={add.patientId} onChange={(id) => setAdd({ ...add, patientId: id })} label="Paciente" />
          <TextField select size="small" label="Assinatura gratuita" value={add.freeMonths} onChange={(e) => setAdd({ ...add, freeMonths: e.target.value })} sx={{ minWidth: 200 }}>
            <MenuItem value="0">Sem período grátis</MenuItem><MenuItem value="6">6 meses grátis (promoção)</MenuItem>
          </TextField>
          <FormControlLabel control={<Checkbox checked={add.consent} onChange={(e) => setAdd({ ...add, consent: e.target.checked })} />} label="O paciente autorizou participar e receber avisos do cashback" />
          <Button variant="contained" disabled={busy || !add.patientId || !add.consent} onClick={() => run(() => addCashbackMember({ patientId: add.patientId, consent: add.consent, freeMonths: Number(add.freeMonths) }), "Paciente cadastrado no cashback.", () => { setAdd({ patientId: "", consent: false, freeMonths: "0" }); load(); })}>Cadastrar</Button>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Todo tratamento pago gera cashback para quem está cadastrado. O cashback vale por 6 meses e só é usado na clínica.</Typography>
      </Section>
      <Section title="Participantes">
        <Table size="small">
          <TableHead><TableRow><TableCell>Paciente</TableCell><TableCell>Telefone</TableCell><TableCell align="right">Saldo</TableCell><TableCell>Próximo vencimento</TableCell><TableCell>Grátis até</TableCell><TableCell /></TableRow></TableHead>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.patientId} selected={sel === m.patientId}>
                <TableCell>{m.name}</TableCell><TableCell>{m.phone}</TableCell><TableCell align="right">{brl(m.balance)}</TableCell>
                <TableCell>{m.nextExpiry ? dmy(m.nextExpiry) : "—"}</TableCell><TableCell>{m.freeUntil ? dmy(m.freeUntil) : "—"}</TableCell>
                <TableCell><Button size="small" onClick={() => openSt(m.patientId)}>Extrato e uso</Button></TableCell>
              </TableRow>
            ))}
            {!members.length && <TableRow><TableCell colSpan={6}><Typography color="text.secondary">Ninguém cadastrado ainda.</Typography></TableCell></TableRow>}
          </TableBody>
        </Table>
      </Section>
      {sel && st && (
        <Section title={`Cashback de ${members.find((m) => m.patientId === sel)?.name || ""}: ${brl(st.balance)} disponível`}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
            <Box>
              <Typography sx={{ fontWeight: 700, mb: 1 }}>Usar em tratamento</Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField size="small" label="Valor (R$)" value={spend} onChange={(e) => setSpend(e.target.value)} />
                <Button variant="outlined" disabled={busy || !spend} onClick={() => run(() => spendCashback({ patientId: sel, amount: money(spend) }), "Cashback usado.", () => { setSpend(""); refresh(); })}>Usar</Button>
              </Box>
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 700, mb: 1 }}>Transferir para outro paciente</Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <PatientPicker patients={patients.filter((p) => p.id !== sel)} value={tr.toPatientId} onChange={(id) => setTr({ ...tr, toPatientId: id })} label="Quem recebe (precisa estar cadastrado)" />
                <TextField select size="small" label="Parentesco" value={tr.relation} onChange={(e) => setTr({ ...tr, relation: e.target.value })}>
                  {Object.entries(opts.relations).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
                </TextField>
                <TextField size="small" label="Valor (R$)" value={tr.amount} onChange={(e) => setTr({ ...tr, amount: e.target.value })} />
                <Button variant="outlined" disabled={busy || !tr.toPatientId || !tr.amount} onClick={() => run(() => transferCashback({ fromPatientId: sel, toPatientId: tr.toPatientId, amount: money(tr.amount), relation: tr.relation }), "Cashback transferido.", () => { setTr({ toPatientId: "", amount: "", relation: "OUTRO" }); refresh(); })}>Transferir</Button>
                <Typography variant="caption" color="text.secondary">Fora de pais e filhos, cada paciente recebe de uma só pessoa e cada pessoa envia para um só paciente. Pais e filhos podem juntar cashback entre si.</Typography>
              </Box>
            </Box>
          </Box>
          <Table size="small" sx={{ mt: 2 }}>
            <TableHead><TableRow><TableCell>Data</TableCell><TableCell>Movimento</TableCell><TableCell align="right">Valor</TableCell><TableCell>Detalhe</TableCell></TableRow></TableHead>
            <TableBody>{st.moves.map((m, i) => <TableRow key={i}><TableCell>{dmy(m.createdAt)}</TableCell><TableCell>{m.kind.replace(/_/g, " ").toLowerCase()}</TableCell><TableCell align="right">{brl(m.amount)}</TableCell><TableCell>{m.note || ""}</TableCell></TableRow>)}</TableBody>
          </Table>
        </Section>
      )}
    </Box>
  );
}

// ---------------- Avaliacao semanal (colaborador) ----------------
function MyEvaluationTab() {
  const [w, setW] = useState<MyWeek | null>(null);
  const [cur, setCur] = useState<string>("");
  const [ans, setAns] = useState<Record<string, string>>({});
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const { run, busy, box } = useRunner();
  const load = useCallback(() => { loadMyWeek().then((d) => { setW(d); setCur(d.tasks.find((t) => !t.done)?.evaluatedUserId || ""); }).catch(() => setW(null)); }, []);
  useEffect(() => { load(); }, [load]);
  if (!w) return <LinearProgress />;
  const task = w.tasks.find((t) => t.evaluatedUserId === cur);
  const complete = w.questions.every((q) => ans[q.id]) && score > 0;
  const send = () => task && run(() => sendTeamEvaluation({ kind: task.kind, evaluatedUserId: task.evaluatedUserId, answers: ans, score, comment: comment || undefined }), "Avaliação enviada ao gestor.", () => { setAns({}); setScore(0); setComment(""); load(); });
  return (
    <Box>
      {box}
      <Alert severity="info" sx={{ mb: 2 }}>Semana {w.week}. Suas respostas vão só para o gestor; ninguém da equipe vê o que você respondeu.</Alert>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
        {w.tasks.map((t) => <Chip key={t.evaluatedUserId} label={`${t.name}${t.done ? " ✓" : ""}`} color={t.done ? "success" : cur === t.evaluatedUserId ? "primary" : "default"} onClick={t.done ? undefined : () => setCur(t.evaluatedUserId)} />)}
      </Box>
      {!task ? <Alert severity="success">Você já respondeu tudo desta semana. Obrigado!</Alert> : (
        <Section title={task.kind === "SELF" ? "Autoavaliação" : `Avaliar: ${task.name}`}>
          {w.questions.map((q) => (
            <Box key={q.id} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, py: 0.5, borderBottom: "1px solid", borderColor: "divider", flexWrap: "wrap" }}>
              <Typography>{q.text}</Typography>
              <RadioGroup row value={ans[q.id] || ""} onChange={(e) => setAns({ ...ans, [q.id]: e.target.value })}>
                <FormControlLabel value="SIM" control={<Radio size="small" />} label="SIM" />
                <FormControlLabel value="NAO" control={<Radio size="small" />} label="NÃO" />
              </RadioGroup>
            </Box>
          ))}
          <Typography sx={{ mt: 2, fontWeight: 700 }}>Nota geral da semana</Typography>
          <RadioGroup row value={String(score || "")} onChange={(e) => setScore(Number(e.target.value))}>
            {w.scale.map((s, i) => <FormControlLabel key={s} value={String(i + 1)} control={<Radio size="small" />} label={`${i + 1} · ${s}`} />)}
          </RadioGroup>
          <TextField fullWidth multiline minRows={2} size="small" label="Comentário (opcional)" value={comment} onChange={(e) => setComment(e.target.value)} sx={{ mt: 1 }} />
          <Button variant="contained" sx={{ mt: 2 }} disabled={busy || !complete} onClick={send}>Enviar ao gestor</Button>
        </Section>
      )}
    </Box>
  );
}

// ---------------- Gestor ----------------
function ReportTab({ month }: { month: string }) {
  const [r, setR] = useState<ClubReport | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { setR(null); loadClubReport(month).then(setR).catch((e) => setErr(e.message)); }, [month]);
  if (err) return <Alert severity="error">{err}</Alert>;
  if (!r) return <LinearProgress />;
  const line = (label: string, value: string, strong = false) => <TableRow><TableCell sx={{ fontWeight: strong ? 700 : 400 }}>{label}</TableCell><TableCell align="right" sx={{ fontWeight: strong ? 700 : 400 }}>{value}</TableCell></TableRow>;
  return (
    <Box>
      {r.pendingConfirmation > 0 && <Alert severity="warning" sx={{ mb: 2 }}>{r.pendingConfirmation} venda(s) do mês aguardando confirmação de pagamento — não entram na conta até serem confirmadas.</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        <Section title={`Caixa da Equipe — ${r.goalHit ? "meta batida" : "meta não batida"}`}>
          <Table size="small"><TableBody>
            {line(`${r.contracts} contrato(s) — 1ª parcela`, brl(r.firstParcels))}
            {line(`${r.bands} faixa(s) de ${brl(r.config.bandSize)} em tratamentos × ${brl(r.goalHit ? r.config.bandValueHit : r.config.bandValueMiss)}`, brl(r.bandsValue))}
            {line("Subtotal", brl(r.subtotal))}
            {line(`Bônus de inadimplência (${r.delinquency.toFixed(1).replace(".", ",")}% no mês; limite ${r.config.delinquencyLimitPct}%)`, r.goalHit ? (r.delinquencyOk ? brl(r.bonus) : "Não ganhou") : "Só com a meta batida")}
            {line("Total a dividir", brl(r.total), true)}
            {line(`Por pessoa (${r.split})`, brl(r.perPerson))}
          </TableBody></Table>
          {r.config.bestSellerPrize && <Typography variant="body2" sx={{ mt: 1 }}>Prêmio do melhor vendedor: {r.config.bestSellerPrize} — {r.ranking[0]?.name || "ninguém ainda"}</Typography>}
        </Section>
        <Section title="Faturamento do Clube no mês">
          <Table size="small"><TableBody>
            {line("Adesões (pagamento único)", brl(r.revenue.adesao))}
            {line("Recorrência (1ª parcela + mensalidades)", brl(r.revenue.recorrencia))}
            {line("Tratamentos da campanha (entram na meta)", brl(r.revenue.tratamentosCampanha))}
            {line("Tratamentos de outras origens (não entram)", brl(r.revenue.tratamentosOutrasOrigens))}
          </TableBody></Table>
        </Section>
        <Section title="Tratamentos por origem do paciente">
          <Table size="small"><TableBody>{Object.entries(r.byOrigin).map(([k, v]) => <TableRow key={k}><TableCell>{k}</TableCell><TableCell align="right">{brl(v)}</TableCell></TableRow>)}</TableBody></Table>
        </Section>
        <Section title="Vendas por mecanismo de captação">
          <Table size="small"><TableBody>{Object.entries(r.byChannel).map(([k, v]) => <TableRow key={k}><TableCell>{k}</TableCell><TableCell align="right">{brl(v)}</TableCell></TableRow>)}</TableBody></Table>
        </Section>
      </Box>
      <Section title="Ranking com valores">
        <Table size="small">
          <TableHead><TableRow><TableCell>Nome</TableCell><TableCell align="right">Contratos</TableCell><TableCell align="right">Tratamentos</TableCell><TableCell align="right">Valor em tratamentos</TableCell></TableRow></TableHead>
          <TableBody>{r.ranking.map((x) => <TableRow key={x.userId}><TableCell>{x.name}</TableCell><TableCell align="right">{x.contracts}</TableCell><TableCell align="right">{x.treatments}</TableCell><TableCell align="right">{brl(x.treatmentAmount)}</TableCell></TableRow>)}</TableBody>
        </Table>
      </Section>
    </Box>
  );
}

function ResultsTab({ month }: { month: string }) {
  const [t, setT] = useState<TeamResults | null>(null);
  const [s, setS] = useState<SurveyResults | null>(null);
  const [link, setLink] = useState("");
  useEffect(() => {
    loadTeamResults().then(setT).catch(() => setT(null));
    loadSurveys(month).then(setS).catch(() => setS(null));
    loadClubSettings().then((d) => setLink(`${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/avaliar/${d.surveyToken}`)).catch(() => setLink(""));
  }, [month]);
  return (
    <Box>
      <Section title={t ? `Avaliação da equipe — semana ${t.week} (${t.answered} de ${t.teamSize} responderam)` : "Avaliação da equipe"}>
        {t && (
          <Table size="small">
            <TableHead><TableRow><TableCell>Pessoa</TableCell><TableCell align="right">Autoavaliação</TableCell><TableCell align="right">Média dos colegas</TableCell><TableCell align="right">Respostas positivas (de 10)</TableCell></TableRow></TableHead>
            <TableBody>{t.summary.map((p) => <TableRow key={p.name}><TableCell>{p.name}</TableCell><TableCell align="right">{p.self ?? "—"}</TableCell><TableCell align="right">{p.peersAvg ?? "—"} {p.peersCount ? `(${p.peersCount})` : ""}</TableCell><TableCell align="right">{p.positivesAvg ?? "—"}</TableCell></TableRow>)}</TableBody>
          </Table>
        )}
        {t?.details.filter((d) => d.comment).map((d, i) => <Typography key={i} variant="body2" sx={{ mt: 1 }}><b>{d.evaluator} → {d.evaluated}:</b> {d.comment}</Typography>)}
      </Section>
      <Section title={`Avaliações dos pacientes no mês (${s?.count ?? 0})`}>
        {link && <Alert severity="info" sx={{ mb: 2 }}>Link para enviar aos pacientes: <b>{link}</b></Alert>}
        {s && (
          <>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>{Object.entries(s.averages).map(([k, v]) => <Chip key={k} label={`${k}: ${v ?? "—"}`} />)}</Box>
            {s.rows.map((r, i) => (
              <Paper key={i} variant="outlined" sx={{ p: 1.5, mb: 1, borderRadius: 2 }}>
                <Typography variant="body2"><b>{r.anonymous ? "Anônimo" : `${r.name || "Sem nome"}${r.phone ? ` — ${r.phone}` : ""}`}</b> · {dmy(r.createdAt)} · indicaria: {r.recommend}/5{r.highlightStaff ? ` · destaque: ${r.highlightStaff}` : ""}</Typography>
                {r.comment && <Typography variant="body2" color="text.secondary">{r.comment}</Typography>}
              </Paper>
            ))}
          </>
        )}
      </Section>
    </Box>
  );
}

function SettingsTab() {
  const [c, setC] = useState<ClubConfig | null>(null);
  const [emails, setEmails] = useState("");
  const { run, busy, box } = useRunner();
  useEffect(() => { loadClubSettings().then((d) => { setC(d.config); setEmails(d.config.managerEmails.join(", ")); }).catch(() => setC(null)); }, []);
  if (!c) return <LinearProgress />;
  const n = (k: keyof ClubConfig, label: string, help?: string) => (
    <TextField size="small" type="number" label={label} helperText={help} value={c[k] as number} onChange={(e) => setC({ ...c, [k]: Number(e.target.value) })} />
  );
  return (
    <Box>
      {box}
      <Section title="Meta e premiação">
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3,1fr)" }, gap: 2 }}>
          {n("planPrice", "Mensalidade do plano (R$)")}
          {n("contractsGoal", "Meta de contratos no mês")}
          {n("treatmentsGoalAmount", "Meta de vendas em tratamentos (R$)")}
          {n("treatmentsGoalCount", "Meta de tratamentos (quantidade, só referência)")}
          {n("bandSize", "Faixa de vendas (R$)")}
          {n("bandValueHit", "Valor por faixa com meta batida (R$)")}
          {n("bandValueMiss", "Valor por faixa sem meta (R$)")}
          {n("delinquencyLimitPct", "Inadimplência máxima para o bônus (%)")}
          {n("delinquencyBonusPct", "Bônus de inadimplência (%)")}
          {n("splitCount", "Dividir entre quantas pessoas", "0 = todos os usuários ativos")}
          <TextField size="small" label="Prêmio do melhor vendedor" value={c.bestSellerPrize} onChange={(e) => setC({ ...c, bestSellerPrize: e.target.value })} />
        </Box>
      </Section>
      <Section title="Cashback e avaliações">
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3,1fr)" }, gap: 2 }}>
          {n("cashbackPct", "Cashback sobre tratamentos pagos (%)")}
          {n("cashbackMonths", "Validade do cashback (meses)")}
          {n("peersPerWeek", "Colegas avaliados por semana")}
          <TextField size="small" label="E-mails do gestor (recebem as avaliações)" helperText="Separe por vírgula. Vazio = administradores e gestores." value={emails} onChange={(e) => setEmails(e.target.value)} sx={{ gridColumn: { md: "1 / -1" } }} />
        </Box>
      </Section>
      <Button variant="contained" disabled={busy} onClick={() => run(() => saveClubSettings({ ...c, managerEmails: emails.split(/[,;\s]+/).filter(Boolean) }).then((d) => setC(d.config)), "Configuração salva.")}>Salvar</Button>
    </Box>
  );
}

export default function Club() {
  const [opts, setOpts] = useState<ClubOptions | null>(null);
  const [patients, setPatients] = useState<BackendPatient[]>([]);
  const [tab, setTab] = useState("painel");
  const [month, setMonth] = useState(currentMonth());
  const [err, setErr] = useState("");
  useEffect(() => {
    loadClubOptions().then(setOpts).catch((e) => setErr(e.message));
    loadBackendPatients().then(setPatients).catch(() => setPatients([]));
  }, []);
  const tabs = useMemo(() => [
    ["painel", "Painel da meta"], ["venda", "Registrar venda"], ["cashback", "Cashback"], ["avaliacao", "Minha avaliação"],
    ...(opts?.isManager ? [["relatorio", "Relatório do gestor"], ["resultados", "Avaliações"], ["config", "Configurações"]] : []),
  ], [opts]);
  return (
    <Box>
      <PageHeader title="Clube da clínica" description="Campanha da equipe: contratos de manutenção, tratamentos, cashback e avaliações." />
      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
      {opts && (
        <>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", mb: 2 }}>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ flex: 1 }}>
              {tabs.map(([k, l]) => <Tab key={k} value={k} label={l} />)}
            </Tabs>
            {["painel", "venda", "relatorio", "resultados"].includes(tab) && <TextField size="small" type="month" label="Mês" InputLabelProps={{ shrink: true }} value={month} onChange={(e) => setMonth(e.target.value || currentMonth())} />}
          </Box>
          {tab === "painel" && <PanelTab month={month} />}
          {tab === "venda" && <SaleTab opts={opts} patients={patients} month={month} />}
          {tab === "cashback" && <CashbackTab opts={opts} patients={patients} />}
          {tab === "avaliacao" && <MyEvaluationTab />}
          {tab === "relatorio" && opts.isManager && <ReportTab month={month} />}
          {tab === "resultados" && opts.isManager && <ResultsTab month={month} />}
          {tab === "config" && opts.isManager && <SettingsTab />}
        </>
      )}
    </Box>
  );
}
