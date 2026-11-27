import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import { useState } from "react";
import { StatusChip } from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { Async, Light, ProgressBar, Stat, StatGrid, brl, fmtDate, fmtDateTime, nameOf, num, useApi, useSupplierOptions, useToast } from "../infraestrutura/kit";
import { useAlmoxarifados, useItens } from "./lookups";

function Detalhe({ id, onClose }: { id: string; onClose: () => void }) {
  const st = useApi<any>(`/suprimentos/pedidos/${id}`);
  const itens = useItens();
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Pedido de compra</DialogTitle>
      <DialogContent dividers>
        <Async state={st}>
          {(p) => (
            <Box sx={{ display: "grid", gap: 2 }}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}><Typography variant="h6" sx={{ fontWeight: 800 }}>{p.numero}</Typography><StatusChip value={p.status} /><Typography variant="body2">{p.fornecedor?.razaoSocial}</Typography></Box>
              <StatGrid min={140}>
                <Stat label="Itens" value={brl(p.valorItens)} /><Stat label="Frete" value={brl(p.frete)} /><Stat label="Total" value={brl(p.valorTotal)} /><Stat label="Entrega prevista" value={fmtDate(p.previsaoEntrega)} />
              </StatGrid>
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead><TableRow><TableCell>Item</TableCell><TableCell align="right">Qtd</TableCell><TableCell align="right">Preço</TableCell><TableCell sx={{ minWidth: 160 }}>Recebimento</TableCell></TableRow></TableHead>
                  <TableBody>
                    {(p.itens || []).map((i: any) => (
                      <TableRow key={i.id}><TableCell>{nameOf(itens, i.itemId)}</TableCell><TableCell align="right">{num(i.quantidade, 3)}</TableCell><TableCell align="right">{brl(i.precoUnitario)}</TableCell>
                        <TableCell><ProgressBar value={i.quantidade ? (i.quantidadeRecebida / i.quantidade) * 100 : 0} color="success" /></TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Recebimentos</Typography>
              {(p.recebimentos || []).map((r: any) => <Typography key={r.id} variant="body2">{fmtDateTime(r.dataRecebimento)} · NF {r.notaFiscal || "—"} · {brl(r.valor)} · {(r.itens || []).length} item(ns)</Typography>)}
              {!(p.recebimentos || []).length && <Typography variant="body2" color="text.secondary">Nenhum recebimento registrado.</Typography>}
              {(p.payableIds || []).length > 0 && <Alert severity="success">{p.payableIds.length} conta(s) a pagar gerada(s) no financeiro.</Alert>}
            </Box>
          )}
        </Async>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

function Receber({ pedido, onClose, onDone }: { pedido: any; onClose: () => void; onDone: () => void }) {
  const itens = useItens();
  const [rows, setRows] = useState<Record<string, { rec: string; rej: string; lote: string; val: string; motivo: string }>>(() =>
    Object.fromEntries((pedido.itens || []).map((i: any) => [i.id, { rec: String(Math.max(0, i.quantidade - (i.quantidadeRecebida || 0))), rej: "0", lote: "", val: "", motivo: "" }])));
  const [nf, setNf] = useState("");
  const [venc, setVenc] = useState("");
  const [gerar, setGerar] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (id: string, patch: any) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  async function go() {
    setBusy(true); setErr(null);
    try {
      const body = {
        notaFiscal: nf || undefined, gerarContasPagar: gerar, primeiroVencimentoEm: venc ? new Date(`${venc}T12:00:00`).toISOString() : undefined,
        itens: (pedido.itens || []).filter((i: any) => Number(rows[i.id].rec) > 0 || Number(rows[i.id].rej) > 0).map((i: any) => {
          const r = rows[i.id];
          return { pedidoItemId: i.id, quantidadeRecebida: Number(r.rec) || 0, quantidadeRejeitada: Number(r.rej) || 0, motivoRejeicao: r.motivo || undefined, loteNumero: r.lote || undefined, validade: r.val ? new Date(`${r.val}T12:00:00`).toISOString() : undefined };
        }),
      };
      if (!body.itens.length) throw new Error("Informe a quantidade recebida de ao menos um item.");
      await eduApi.post(`/suprimentos/pedidos/${pedido.id}/receber`, body);
      onDone(); onClose();
    } catch (e: any) { setErr(e?.message || "Falha ao registrar o recebimento."); } finally { setBusy(false); }
  }
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="lg">
      <DialogTitle sx={{ fontWeight: 800 }}>Receber pedido {pedido.numero}</DialogTitle>
      <DialogContent dividers>
        {err ? <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert> : null}
        <Box sx={{ display: "grid", gap: 1.5 }}>
          {(pedido.itens || []).map((i: any) => {
            const r = rows[i.id];
            return (
              <Box key={i.id} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "2fr 1fr 1fr 1fr 1fr 1.4fr" }, gap: 1, alignItems: "center" }}>
                <Box><Typography variant="body2" sx={{ fontWeight: 700 }}>{nameOf(itens, i.itemId)}</Typography><Typography variant="caption" color="text.secondary">Pedido {num(i.quantidade, 3)} · já recebido {num(i.quantidadeRecebida, 3)}</Typography></Box>
                <TextField size="small" type="number" label="Recebida" value={r.rec} onChange={(e) => set(i.id, { rec: e.target.value })} />
                <TextField size="small" type="number" label="Rejeitada" value={r.rej} onChange={(e) => set(i.id, { rej: e.target.value })} />
                <TextField size="small" label="Lote" value={r.lote} onChange={(e) => set(i.id, { lote: e.target.value })} />
                <TextField size="small" type="date" label="Validade" value={r.val} onChange={(e) => set(i.id, { val: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField size="small" label="Motivo da rejeição" value={r.motivo} onChange={(e) => set(i.id, { motivo: e.target.value })} disabled={!(Number(r.rej) > 0)} />
              </Box>
            );
          })}
        </Box>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mt: 2 }}>
          <TextField size="small" label="Nota fiscal" value={nf} onChange={(e) => setNf(e.target.value)} />
          <TextField size="small" type="date" label="1º vencimento" value={venc} onChange={(e) => setVenc(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <FormControlLabel control={<Checkbox checked={gerar} onChange={(e) => setGerar(e.target.checked)} />} label="Gerar contas a pagar no financeiro" />
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose} disabled={busy}>Cancelar</Button><Button variant="contained" onClick={go} disabled={busy}>Confirmar recebimento</Button></DialogActions>
    </Dialog>
  );
}

function NovoPedido({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const forn = useSupplierOptions();
  const almox = useAlmoxarifados();
  const itens = useItens();
  const [f, setF] = useState<Record<string, string>>({ parcelas: "1", frete: "0" });
  const [ls, setLs] = useState([{ itemId: "", quantidade: "1", precoUnitario: "" }]);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  async function go() {
    setErr(null);
    try {
      if (!f.fornecedorId || !f.almoxarifadoId) throw new Error("Informe fornecedor e almoxarifado.");
      const its = ls.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId, quantidade: Number(l.quantidade), precoUnitario: Number(l.precoUnitario) || 0 }));
      if (!its.length) throw new Error("Informe ao menos um item.");
      if (!f.centroCustoId && !f.cursoId && !f.laboratorioId) { /* origem é opcional neste endpoint */ }
      await eduApi.post("/suprimentos/pedidos", { fornecedorId: f.fornecedorId, almoxarifadoId: f.almoxarifadoId, frete: Number(f.frete) || 0, parcelas: Number(f.parcelas) || 1, previsaoEntrega: f.previsao ? new Date(`${f.previsao}T12:00:00`).toISOString() : undefined, observacao: f.observacao || undefined, itens: its });
      onDone(); onClose();
    } catch (e: any) { setErr(e?.message || "Falha ao criar o pedido."); }
  }
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Novo pedido de compra (avulso)</DialogTitle>
      <DialogContent dividers>
        {err ? <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert> : null}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, pt: 1 }}>
          <TextField select size="small" label="Fornecedor" value={f.fornecedorId || ""} onChange={(e) => set("fornecedorId", e.target.value)}>{forn.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}</TextField>
          <TextField select size="small" label="Almoxarifado de destino" value={f.almoxarifadoId || ""} onChange={(e) => set("almoxarifadoId", e.target.value)}>{almox.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}</TextField>
          <TextField size="small" type="number" label="Frete (R$)" value={f.frete} onChange={(e) => set("frete", e.target.value)} />
          <TextField size="small" type="number" label="Parcelas" value={f.parcelas} onChange={(e) => set("parcelas", e.target.value)} />
          <TextField size="small" type="date" label="Previsão de entrega" value={f.previsao || ""} onChange={(e) => set("previsao", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" label="Observação" value={f.observacao || ""} onChange={(e) => set("observacao", e.target.value)} />
        </Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mt: 2, mb: 1 }}>Itens</Typography>
        {ls.map((l, i) => (
          <Box key={i} sx={{ display: "grid", gridTemplateColumns: "3fr 1fr 1fr auto", gap: 1, mb: 1, alignItems: "center" }}>
            <TextField select size="small" label="Item" value={l.itemId} onChange={(e) => setLs(ls.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))}>{itens.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}</TextField>
            <TextField size="small" type="number" label="Qtd" value={l.quantidade} onChange={(e) => setLs(ls.map((x, j) => (j === i ? { ...x, quantidade: e.target.value } : x)))} />
            <TextField size="small" type="number" label="Preço unit." value={l.precoUnitario} onChange={(e) => setLs(ls.map((x, j) => (j === i ? { ...x, precoUnitario: e.target.value } : x)))} />
            <IconButton size="small" onClick={() => setLs(ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)}><DeleteOutlinedIcon fontSize="small" /></IconButton>
          </Box>
        ))}
        <Button startIcon={<AddIcon />} onClick={() => setLs([...ls, { itemId: "", quantidade: "1", precoUnitario: "" }])}>Adicionar item</Button>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" onClick={go}>Criar pedido</Button></DialogActions>
    </Dialog>
  );
}

export default function PedidosTab() {
  const [key, setKey] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [rec, setRec] = useState<any | null>(null);
  const [novo, setNovo] = useState(false);
  const toast = useToast();
  const reload = () => setKey((k) => k + 1);

  async function emitir(p: any) {
    if (!window.confirm(`Emitir o pedido ${p.numero} ao fornecedor?`)) return;
    try { await eduApi.post(`/suprimentos/pedidos/${p.id}/emitir`, {}); toast.ok("Pedido emitido."); reload(); }
    catch (e: any) {
      if (/documentos vencidos/i.test(e?.message || "") && window.confirm(`${e.message}\n\nEmitir mesmo assim? (exige perfil Financeiro/Direção)`)) {
        try { await eduApi.post(`/suprimentos/pedidos/${p.id}/emitir?forcar=true`, {}); toast.ok("Pedido emitido com exceção."); reload(); } catch (e2: any) { toast.err(e2.message); }
      } else toast.err(e?.message || "Falha ao emitir.");
    }
  }
  return (
    <Box>
      <ListTable path="/suprimentos/pedidos" refreshKey={key} searchable={false}
        filters={[{ key: "status", label: "Situação", options: ["RASCUNHO", "EMITIDO", "PARCIALMENTE_RECEBIDO", "RECEBIDO", "CANCELADO"] }]}
        toolbar={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo(true)}>Novo pedido</Button>}
        columns={[
          { key: "numero", label: "Pedido" }, { key: "fornecedor", label: "Fornecedor", render: (r) => r.fornecedor?.razaoSocial || "—" }, { key: "valorTotal", label: "Total", align: "right", render: (r) => brl(r.valorTotal) },
          { key: "previsaoEntrega", label: "Entrega prevista", render: (r) => {
            const atrasado = r.previsaoEntrega && ["EMITIDO", "PARCIALMENTE_RECEBIDO"].includes(r.status) && new Date(r.previsaoEntrega) < new Date();
            return r.previsaoEntrega ? <Light tone={atrasado ? "error" : ["RECEBIDO", "CANCELADO"].includes(r.status) ? "default" : "success"} text={fmtDate(r.previsaoEntrega)} /> : "—";
          } },
          { key: "recebimento", label: "Recebido", render: (r) => { const q = (r.itens || []).reduce((s: number, i: any) => s + i.quantidade, 0); const rc = (r.itens || []).reduce((s: number, i: any) => s + (i.quantidadeRecebida || 0), 0); return <Box sx={{ minWidth: 110 }}><ProgressBar value={q ? (rc / q) * 100 : 0} color="success" /></Box>; } },
          { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> },
        ]}
        actions={(r) => (
          <>
            <Button size="small" onClick={() => setOpen(r.id)}>Abrir</Button>
            {r.status === "RASCUNHO" && <Button size="small" color="success" onClick={() => emitir(r)}>Emitir</Button>}
            {["EMITIDO", "PARCIALMENTE_RECEBIDO"].includes(r.status) && <Button size="small" color="success" onClick={() => setRec(r)}>Receber</Button>}
            {r.status === "PARCIALMENTE_RECEBIDO" && <Button size="small" onClick={() => toast.run(() => eduApi.post(`/suprimentos/pedidos/${r.id}/encerrar-saldo`, {}), "Saldo encerrado.", reload, "Encerrar o saldo pendente deste pedido?")}>Encerrar saldo</Button>}
            {["RASCUNHO", "EMITIDO"].includes(r.status) && <Button size="small" color="error" onClick={() => toast.run(() => eduApi.post(`/suprimentos/pedidos/${r.id}/cancelar`, {}), "Pedido cancelado.", reload, `Cancelar o pedido ${r.numero}?`)}>Cancelar</Button>}
          </>
        )} />
      {open && <Detalhe id={open} onClose={() => setOpen(null)} />}
      {rec && <Receber pedido={rec} onClose={() => setRec(null)} onDone={() => { toast.ok("Recebimento registrado."); reload(); }} />}
      <NovoPedido open={novo} onClose={() => setNovo(false)} onDone={() => { toast.ok("Pedido criado como rascunho."); reload(); }} />
      {toast.node}
    </Box>
  );
}
