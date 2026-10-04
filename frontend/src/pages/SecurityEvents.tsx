import { useCallback, useEffect, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, MenuItem, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TablePagination, TableRow, TextField, Typography,
} from "@mui/material";
import PageHeader from "../components/PageHeader";
import { securityApi, SecurityApiError } from "../services/SecurityApi";

interface Evento {
  id?: string;
  createdAt?: string;
  at?: string;
  type?: string;
  event?: string;
  action?: string;
  severity?: string;
  success?: boolean;
  userEmail?: string;
  user?: { email?: string } | null;
  ip?: string;
  userAgent?: string;
  details?: unknown;
  metadata?: unknown;
}

const SEVERIDADES = ["INFO", "WARNING", "CRITICAL"];

function dataHora(e: Evento) {
  const v = e.createdAt || e.at;
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString("pt-BR") : "—";
}

function resumo(e: Evento) {
  const d = e.details ?? e.metadata;
  if (!d) return "";
  const t = typeof d === "string" ? d : JSON.stringify(d);
  return t.length > 140 ? `${t.slice(0, 140)}…` : t;
}

export default function SecurityEvents() {
  const [tipo, setTipo] = useState("");
  const [usuario, setUsuario] = useState("");
  const [ip, setIp] = useState("");
  const [severidade, setSeveridade] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [itens, setItens] = useState<Evento[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const carregar = useCallback(async (pagina = page, tamanho = size) => {
    setLoading(true);
    setError("");
    try {
      const r = await securityApi.events({
        type: tipo.trim() || undefined,
        user: usuario.trim() || undefined,
        ip: ip.trim() || undefined,
        severity: severidade || undefined,
        from: de ? new Date(`${de}T00:00:00`).toISOString() : undefined,
        to: ate ? new Date(`${ate}T23:59:59`).toISOString() : undefined,
        page: pagina + 1,
        pageSize: tamanho,
        limit: tamanho,
        offset: pagina * tamanho,
      });
      const lista: Evento[] = Array.isArray(r) ? r : r?.items || r?.events || r?.data || [];
      setItens(lista);
      setTotal(Number(r?.total ?? r?.count ?? lista.length));
    } catch (e) {
      setItens([]);
      setTotal(0);
      setError(
        e instanceof SecurityApiError && e.status === 403
          ? "Somente administradores podem ver os eventos de segurança."
          : e instanceof SecurityApiError && e.status === 404
            ? "Os eventos de segurança ainda não estão disponíveis neste ambiente."
            : e instanceof Error ? e.message : "Não foi possível carregar os eventos.",
      );
    } finally {
      setLoading(false);
    }
  }, [page, size, tipo, usuario, ip, severidade, de, ate]);

  // Os filtros só são aplicados ao clicar em "Filtrar"; aqui reage apenas à paginação.
  useEffect(() => {
    void carregar(page, size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, size]);

  function filtrar() {
    if (page === 0) void carregar(0, size);
    else setPage(0);
  }

  function limpar() {
    setTipo(""); setUsuario(""); setIp(""); setSeveridade(""); setDe(""); setAte("");
    setPage(0);
    window.setTimeout(() => void carregar(0, size), 0);
  }

  return (
    <Box>
      <PageHeader title="Eventos de segurança" description="Registro de acessos, falhas, bloqueios e alterações de 2FA (somente administradores)." />
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(3,1fr)" }, gap: 2 }}>
          <TextField size="small" label="Tipo de evento" placeholder="ex.: LOGIN_FAILED" value={tipo} onChange={(e) => setTipo(e.target.value)} />
          <TextField size="small" label="Usuário (e-mail)" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
          <TextField size="small" label="IP" value={ip} onChange={(e) => setIp(e.target.value)} />
          <TextField size="small" select label="Severidade" value={severidade} onChange={(e) => setSeveridade(e.target.value)}>
            <MenuItem value="">Todas</MenuItem>
            {SEVERIDADES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <TextField size="small" type="date" label="De" value={de} onChange={(e) => setDe(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="date" label="Até" value={ate} onChange={(e) => setAte(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Box>
        <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
          <Button variant="contained" onClick={filtrar} disabled={loading}>Filtrar</Button>
          <Button onClick={limpar} disabled={loading}>Limpar</Button>
        </Box>
      </Paper>

      {error ? <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert> : null}

      <Paper variant="outlined" sx={{ borderRadius: 3 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Data/hora</TableCell>
                <TableCell>Evento</TableCell>
                <TableCell>Severidade</TableCell>
                <TableCell>Usuário</TableCell>
                <TableCell>IP</TableCell>
                <TableCell>Detalhes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} align="center"><CircularProgress size={22} /></TableCell></TableRow>
              ) : itens.length ? itens.map((e, i) => {
                const sev = String(e.severity || "").toUpperCase();
                return (
                  <TableRow key={e.id || i} hover>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{dataHora(e)}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{e.type || e.event || e.action || "—"}</TableCell>
                    <TableCell>
                      {sev ? <Chip size="small" label={sev} color={sev === "CRITICAL" || sev === "ERROR" ? "error" : sev === "WARNING" ? "warning" : "default"} /> : e.success === false ? <Chip size="small" color="warning" label="Falha" /> : "—"}
                    </TableCell>
                    <TableCell>{e.userEmail || e.user?.email || "—"}</TableCell>
                    <TableCell>{e.ip || "—"}</TableCell>
                    <TableCell sx={{ maxWidth: 360, wordBreak: "break-word" }}><Typography variant="caption" color="text.secondary">{resumo(e)}</Typography></TableCell>
                  </TableRow>
                );
              }) : (
                <TableRow><TableCell colSpan={6} align="center"><Typography color="text.secondary" sx={{ py: 2 }}>Nenhum evento encontrado.</Typography></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={size}
          onRowsPerPageChange={(e) => { setSize(Number(e.target.value)); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50, 100]}
          labelRowsPerPage="Por página"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
        />
      </Paper>
    </Box>
  );
}
