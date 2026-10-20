import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, MenuItem, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import PageHeader from "../components/PageHeader";
import { createStockPartner, listStockPartners, updateStockPartner, type StockPartner } from "../services/StockPartnersApi";

const brl = (v: number | string) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Equipe WMundi: cadastro dos parceiros de estoque e controle da contrapartida (meio salário mínimo por mês).
export default function StockPartners() {
  const [rows, setRows] = useState<StockPartner[]>([]);
  const [fee, setFee] = useState(0);
  const [wage, setWage] = useState(0);
  const [form, setForm] = useState({ name: "", email: "", whatsapp: "", categories: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { listStockPartners().then((d) => { setRows(d.partners); setFee(d.suggestedFee); setWage(d.minimumWage); }).catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar.")); }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setError(""); try { await fn(); load(); } catch (e) { setError(e instanceof Error ? e.message : "Erro."); } finally { setBusy(false); } };
  const add = () => act(async () => { await createStockPartner({ ...form, monthlyFee: fee } as never); setForm({ name: "", email: "", whatsapp: "", categories: "" }); });
  const paidFor30 = (id: string) => act(() => updateStockPartner(id, { status: "ATIVO", paidUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) }));

  return (
    <Box>
      <PageHeader title="Parceiros de estoque" description={`Empresas avisadas quando o estoque de uma clínica fica baixo (só clínicas que autorizaram). Contrapartida: meio salário mínimo por mês (${brl(fee)}; salário mínimo de ${brl(wage)}). Só parceiro ATIVO e em dia recebe avisos.`} />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
        <TextField size="small" label="Empresa" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <TextField size="small" label="E-mail para os avisos" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <TextField size="small" label="WhatsApp (opcional)" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
        <TextField size="small" label="Categorias (separe por vírgula; vazio = todos os itens)" value={form.categories} onChange={(e) => setForm({ ...form, categories: e.target.value })} helperText="Ex.: resina, anestésico, luva. O parceiro recebe só itens cujo nome contém uma dessas palavras." />
        <Box><Button variant="contained" disabled={busy || !form.name || !form.email} onClick={() => void add()}>Cadastrar parceiro</Button></Box>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, overflowX: "auto" }}>
        <Table size="small">
          <TableHead><TableRow><TableCell>Empresa</TableCell><TableCell>E-mail</TableCell><TableCell>Categorias</TableCell><TableCell>Mensalidade</TableCell><TableCell>Situação</TableCell><TableCell>Pago até</TableCell><TableCell /></TableRow></TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.name}</TableCell><TableCell>{r.email}</TableCell><TableCell>{r.categories.join(", ") || "todos"}</TableCell><TableCell>{brl(r.monthlyFee)}</TableCell>
                <TableCell><TextField select size="small" value={r.status} onChange={(e) => void act(() => updateStockPartner(r.id, { status: e.target.value }))}><MenuItem value="PENDENTE">Pendente</MenuItem><MenuItem value="ATIVO">Ativo</MenuItem><MenuItem value="SUSPENSO">Suspenso</MenuItem></TextField></TableCell>
                <TableCell>{r.paidUntil ? new Date(r.paidUntil).toLocaleDateString("pt-BR") : "—"}</TableCell>
                <TableCell><Button size="small" disabled={busy} onClick={() => void paidFor30(r.id)}>Pago: ativar por 30 dias</Button></TableCell>
              </TableRow>
            ))}
            {!rows.length && <TableRow><TableCell colSpan={7}><Typography color="text.secondary">Nenhum parceiro cadastrado.</Typography></TableCell></TableRow>}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
