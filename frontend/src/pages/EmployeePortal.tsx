import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Paper, TextField, Typography } from "@mui/material";
import { STATUS_LABEL, fmtDate, fmtMin, type DayRow, type Totals } from "../services/HrApi";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
const KEY = "completodonto.colaborador.token";

async function call<T>(path: string, token?: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API}/public/colaborador/${path}`, { method: body ? "POST" : "GET", headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d?.error || `Erro ${r.status}`), { status: r.status });
  return d as T;
}
const maskCpf = (v: string) => v.replace(/\D/g, "").slice(0, 11).replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");

type Today = { linked: boolean; employee?: { name: string; position: string }; punches?: Array<{ id: string; label: string; time: string }> };
type Month = { ref: string; days: DayRow[]; totals: Totals };

// Área do colaborador: CPF + senha individual. Cada pessoa vê apenas o próprio ponto (nada de cargo, salário ou dados de outros).
export default function EmployeePortal() {
  const [token, setToken] = useState(() => sessionStorage.getItem(KEY) || "");
  const [cpf, setCpf] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [today, setToday] = useState<Today | null>(null);
  const [month, setMonth] = useState<Month | null>(null);

  const logout = useCallback(() => { sessionStorage.removeItem(KEY); setToken(""); setToday(null); setMonth(null); }, []);

  useEffect(() => {
    if (!token) return;
    Promise.all([call<Today>("hoje", token), call<Month>("mes", token)])
      .then(([t, m]) => { setToday(t); setMonth(m); })
      .catch((e: Error & { status?: number }) => { if (e.status === 401) logout(); setError(e.message); });
  }, [token, logout]);

  const login = async () => {
    setBusy(true); setError("");
    try {
      const r = await call<{ token: string }>("login", undefined, { cpf, password });
      sessionStorage.setItem(KEY, r.token); setToken(r.token); setPassword("");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível entrar."); } finally { setBusy(false); }
  };

  const print = () => {
    if (!month || !today?.employee) return;
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
    const rows = month.days.map((d) => `<tr><td>${fmtDate(d.date)}</td><td>${esc(STATUS_LABEL[d.status] || d.status)}</td><td>${esc(d.punches.map((p) => p.time).join(" · ") || d.note || "—")}</td><td>${fmtMin(d.workedMin)}</td><td>${d.expectedMin ? fmtMin(d.diffMin) : ""}</td></tr>`).join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Espelho de ponto</title><style>body{font-family:Arial,sans-serif;padding:24px;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #999;padding:4px 6px;text-align:left}</style></head><body><h2>Espelho de ponto — ${esc(today.employee.name)}</h2><div>Competência ${month.ref.split("-").reverse().join("/")}</div><table><thead><tr><th>Data</th><th>Situação</th><th>Batidas</th><th>Trabalhadas</th><th>Saldo</th></tr></thead><tbody>${rows}</tbody></table><p><b>Trabalhadas:</b> ${fmtMin(month.totals.workedMin)} &nbsp; <b>Banco de horas:</b> ${fmtMin(month.totals.balanceMin)}</p></body></html>`);
    w.document.close(); w.print();
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", p: 2, display: "grid", justifyItems: "center", alignContent: "start" }}>
      <Box sx={{ width: "100%", maxWidth: 560, display: "grid", gap: 2, mt: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 900, textAlign: "center" }}>Meu ponto — CompletoDonto</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {!token ? (
          <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, display: "grid", gap: 2 }}>
            <TextField label="CPF" value={cpf} onChange={(e) => setCpf(maskCpf(e.target.value))} slotProps={{ htmlInput: { inputMode: "numeric" } }} />
            <TextField label="Senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void login(); }} />
            <Button variant="contained" disabled={busy || cpf.replace(/\D/g, "").length !== 11 || !password} onClick={() => void login()}>Entrar</Button>
            <Typography variant="caption" color="text.secondary">A senha é criada pelo RH da clínica. Você vê apenas o seu próprio ponto.</Typography>
          </Paper>
        ) : (
          <>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Typography sx={{ fontWeight: 800 }}>{today?.employee?.name || "Carregando…"}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Hoje: {today?.punches?.length ? today.punches.map((p) => `${p.label} ${p.time}`).join(" · ") : "nenhuma batida ainda"}</Typography>
            </Paper>
            {month && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
                  <Chip label={`Trabalhadas ${fmtMin(month.totals.workedMin)}`} /><Chip label={`Banco ${fmtMin(month.totals.balanceMin)}`} color={month.totals.balanceMin < 0 ? "error" : "default"} />
                  <Chip label={`Faltas ${month.totals.faltas}`} /><Chip label={`Atrasos ${month.totals.atrasos}`} />
                </Box>
                {month.days.map((d) => (
                  <Box key={d.date} sx={{ display: "grid", gridTemplateColumns: "70px 1fr 60px", gap: 1, py: 0.6, borderTop: "1px solid", borderColor: "divider", alignItems: "center" }}>
                    <Typography sx={{ fontWeight: 700 }}>{fmtDate(d.date)}</Typography>
                    <Typography variant="body2" color="text.secondary">{STATUS_LABEL[d.status] || d.status}{d.punches.length ? ` — ${d.punches.map((p) => p.time).join(" · ")}` : ""}</Typography>
                    <Typography variant="body2">{fmtMin(d.workedMin)}</Typography>
                  </Box>
                ))}
              </Paper>
            )}
            <Box sx={{ display: "flex", gap: 1, justifyContent: "space-between" }}>
              <Button onClick={print}>Imprimir espelho</Button>
              <Button color="inherit" onClick={logout}>Sair</Button>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
