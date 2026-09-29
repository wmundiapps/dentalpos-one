import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import PageHeader from "../components/PageHeader";
import { listStudents, type EduStudent } from "../services/EduApi";
import {
  adjustStock,
  approvePurchaseOrder,
  createPurchaseOrder,
  createSale,
  createSupplyItem,
  listPurchaseOrders,
  listSales,
  listSupplyItems,
  receivePurchaseOrder,
  type PurchaseOrder,
  type Sale,
  type SupplyItem,
} from "../services/SupplyApi";

type Secao = "itens" | "compras" | "vendas";

const SECOES: { value: Secao; label: string }[] = [
  { value: "itens", label: "Itens e estoque" },
  { value: "compras", label: "Pedidos de compra" },
  { value: "vendas", label: "Vendas" },
];

export default function Supply() {
  const navigate = useNavigate();
  const secaoParam = (new URLSearchParams(window.location.search).get("secao") || "itens") as Secao;
  const secao = SECOES.some((s) => s.value === secaoParam) ? secaoParam : "itens";
  const setSecao = (value: Secao) => navigate(`/suprimentos?secao=${value}`);

  return (
    <Box>
      <PageHeader title="Suprimentos" description="Estoque, compras e vendas (cantina, materiais, uniformes)." />
      <Tabs value={secao} onChange={(_, value) => setSecao(value)} sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
        {SECOES.map((s) => <Tab key={s.value} value={s.value} label={s.label} />)}
      </Tabs>
      {secao === "itens" && <Itens />}
      {secao === "compras" && <Compras />}
      {secao === "vendas" && <Vendas />}
    </Box>
  );
}

function Itens() {
  const [items, setItems] = useState<SupplyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", category: "OUTRO", unit: "UN", minQuantity: 0, salePrice: 0 });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustItemId, setAdjustItemId] = useState("");
  const [adjustForm, setAdjustForm] = useState({ type: "ENTRADA", quantity: 1, reason: "" });
  const [adjustError, setAdjustError] = useState("");
  const [saving2, setSaving2] = useState(false);

  const reload = async () => {
    setLoading(true); setError("");
    try { setItems(await listSupplyItems()); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar itens."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, []);

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) { setFormError("Informe código e nome."); return; }
    setSaving(true); setFormError("");
    try {
      await createSupplyItem(form);
      setOpen(false);
      setForm({ code: "", name: "", category: "OUTRO", unit: "UN", minQuantity: 0, salePrice: 0 });
      await reload();
      setToast("Item cadastrado.");
    } catch (e) { setFormError(e instanceof Error ? e.message : "Erro ao cadastrar item."); }
    finally { setSaving(false); }
  };

  const openAdjust = (itemId: string) => { setAdjustItemId(itemId); setAdjustForm({ type: "ENTRADA", quantity: 1, reason: "" }); setAdjustError(""); setAdjustOpen(true); };

  const saveAdjust = async () => {
    setSaving2(true); setAdjustError("");
    try {
      await adjustStock(adjustItemId, adjustForm);
      setAdjustOpen(false);
      await reload();
      setToast("Estoque ajustado.");
    } catch (e) { setAdjustError(e instanceof Error ? e.message : "Erro ao ajustar estoque."); }
    finally { setSaving2(false); }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Itens de estoque</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Novo item</Button>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell>Código</TableCell><TableCell>Nome</TableCell><TableCell>Qtd. em estoque</TableCell><TableCell>Mínimo</TableCell><TableCell>Preço</TableCell><TableCell align="right">Ações</TableCell></TableRow></TableHead>
          <TableBody>
            {!loading && items.length === 0 && <TableRow><TableCell colSpan={6}><Typography color="text.secondary" sx={{ py: 2 }}>Nenhum item cadastrado ainda.</Typography></TableCell></TableRow>}
            {items.map((i) => (
              <TableRow key={i.id}>
                <TableCell>{i.code}</TableCell>
                <TableCell>{i.name}</TableCell>
                <TableCell>
                  <Chip size="small" label={`${i.quantity} ${i.unit}`} color={i.quantity <= i.minQuantity ? "error" : "default"} />
                </TableCell>
                <TableCell>{i.minQuantity}</TableCell>
                <TableCell>{i.salePrice != null ? `R$ ${i.salePrice.toFixed(2)}` : "—"}</TableCell>
                <TableCell align="right"><Button size="small" onClick={() => openAdjust(i.id)}>Ajustar estoque</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Novo item de estoque</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField required label="Código" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <TextField required label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            <TextField label="Categoria" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <TextField label="Unidade" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            <TextField label="Estoque mínimo" type="number" value={form.minQuantity} onChange={(e) => setForm({ ...form, minQuantity: Number(e.target.value) })} />
            <TextField label="Preço de venda (R$)" type="number" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: Number(e.target.value) })} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={() => void save()}>{saving ? "Salvando…" : "Cadastrar"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={adjustOpen} onClose={() => setAdjustOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Ajustar estoque</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {adjustError && <Alert severity="error">{adjustError}</Alert>}
          <TextField select label="Tipo" value={adjustForm.type} onChange={(e) => setAdjustForm({ ...adjustForm, type: e.target.value })}>
            <MenuItem value="ENTRADA">Entrada</MenuItem>
            <MenuItem value="SAIDA">Saída</MenuItem>
            <MenuItem value="AJUSTE">Ajuste</MenuItem>
          </TextField>
          <TextField label="Quantidade" type="number" value={adjustForm.quantity} onChange={(e) => setAdjustForm({ ...adjustForm, quantity: Number(e.target.value) })} />
          <TextField label="Motivo" value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdjustOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving2} onClick={() => void saveAdjust()}>{saving2 ? "Salvando…" : "Confirmar"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}

function Compras() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ supplierName: "", description: "", quantity: 1, unitPrice: 0 });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true); setError("");
    try { setOrders(await listPurchaseOrders()); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar pedidos."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, []);

  const save = async () => {
    if (!form.supplierName.trim() || !form.description.trim()) { setFormError("Informe fornecedor e descrição do item."); return; }
    setSaving(true); setFormError("");
    try {
      await createPurchaseOrder({ supplierName: form.supplierName, items: [{ description: form.description, quantity: form.quantity, unitPrice: form.unitPrice }] });
      setOpen(false);
      setForm({ supplierName: "", description: "", quantity: 1, unitPrice: 0 });
      await reload();
      setToast("Pedido de compra criado.");
    } catch (e) { setFormError(e instanceof Error ? e.message : "Erro ao criar pedido."); }
    finally { setSaving(false); }
  };

  const advance = async (order: PurchaseOrder) => {
    try {
      if (order.status === "RASCUNHO" || order.status === "PENDENTE") await approvePurchaseOrder(order.id);
      else if (order.status === "APROVADO") await receivePurchaseOrder(order.id);
      await reload();
      setToast("Pedido atualizado.");
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao atualizar pedido."); }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Pedidos de compra</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Novo pedido</Button>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell>Fornecedor</TableCell><TableCell>Total</TableCell><TableCell>Status</TableCell><TableCell align="right">Ações</TableCell></TableRow></TableHead>
          <TableBody>
            {!loading && orders.length === 0 && <TableRow><TableCell colSpan={4}><Typography color="text.secondary" sx={{ py: 2 }}>Nenhum pedido criado ainda.</Typography></TableCell></TableRow>}
            {orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell>{o.supplierName}</TableCell>
                <TableCell>R$ {o.totalAmount.toFixed(2)}</TableCell>
                <TableCell><Chip size="small" label={o.status} color={o.status === "RECEBIDO" ? "success" : "default"} /></TableCell>
                <TableCell align="right">
                  {o.status !== "RECEBIDO" && <Button size="small" onClick={() => void advance(o)}>{o.status === "APROVADO" ? "Receber" : "Aprovar"}</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Novo pedido de compra</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField required label="Fornecedor" value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} />
          <TextField required label="Descrição do item" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            <TextField label="Quantidade" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
            <TextField label="Preço unitário (R$)" type="number" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: Number(e.target.value) })} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={() => void save()}>{saving ? "Salvando…" : "Criar pedido"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}

function Vendas() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [students, setStudents] = useState<EduStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ buyerName: "", studentId: "", paymentMethod: "PIX", description: "", quantity: 1, unitPrice: 0 });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true); setError("");
    try { setSales(await listSales()); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar vendas."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); listStudents().then(setStudents).catch(() => {}); }, []);

  const save = async () => {
    if (!form.buyerName.trim() || !form.description.trim()) { setFormError("Informe comprador e descrição do item."); return; }
    setSaving(true); setFormError("");
    try {
      await createSale({
        buyerName: form.buyerName, studentId: form.studentId || undefined, paymentMethod: form.paymentMethod,
        items: [{ description: form.description, quantity: form.quantity, unitPrice: form.unitPrice }],
      });
      setOpen(false);
      setForm({ buyerName: "", studentId: "", paymentMethod: "PIX", description: "", quantity: 1, unitPrice: 0 });
      await reload();
      setToast("Venda registrada.");
    } catch (e) { setFormError(e instanceof Error ? e.message : "Erro ao registrar venda."); }
    finally { setSaving(false); }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Vendas</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Nova venda</Button>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell>Comprador</TableCell><TableCell>Pagamento</TableCell><TableCell>Total</TableCell></TableRow></TableHead>
          <TableBody>
            {!loading && sales.length === 0 && <TableRow><TableCell colSpan={3}><Typography color="text.secondary" sx={{ py: 2 }}>Nenhuma venda registrada ainda.</Typography></TableCell></TableRow>}
            {sales.map((s) => (
              <TableRow key={s.id}><TableCell>{s.student?.fullName || s.buyerName}</TableCell><TableCell>{s.paymentMethod || "—"}</TableCell><TableCell>R$ {s.totalAmount.toFixed(2)}</TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova venda</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField required label="Nome do comprador" value={form.buyerName} onChange={(e) => setForm({ ...form, buyerName: e.target.value })} />
          <TextField select label="Aluno (opcional)" value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
            <MenuItem value="">—</MenuItem>
            {students.map((s) => <MenuItem key={s.id} value={s.id}>{s.fullName}</MenuItem>)}
          </TextField>
          <TextField select label="Pagamento" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
            <MenuItem value="PIX">PIX</MenuItem>
            <MenuItem value="DINHEIRO">Dinheiro</MenuItem>
            <MenuItem value="CARTAO">Cartão</MenuItem>
          </TextField>
          <TextField required label="Descrição do item" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            <TextField label="Quantidade" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
            <TextField label="Preço unitário (R$)" type="number" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: Number(e.target.value) })} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={() => void save()}>{saving ? "Salvando…" : "Registrar"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}
