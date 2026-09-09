import { useEffect, useMemo, useState } from "react";
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
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import MonetizationOnIcon from "@mui/icons-material/MonetizationOn";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import {
  Sales5787Api,
  type SalesProduct5787,
} from "../services/Sales5787Api";

type StockMeta = {
  category?: string;
  supplier?: string;
  unit?: string;
  batch?: string;
  location?: string;
};

type StockRow = {
  product: SalesProduct5787;
  meta: StockMeta;
  quantity: number;
  minimum: number;
  cost: number;
};

const META_PREFIX = "DPSTOCK:";
const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

function decodeMeta(description?: string | null): StockMeta {
  if (!description?.startsWith(META_PREFIX)) return {};
  try {
    const line = description.split("\n")[0];
    return JSON.parse(line.slice(META_PREFIX.length)) as StockMeta;
  } catch {
    return {};
  }
}

function encodeMeta(meta: StockMeta) {
  return `${META_PREFIX}${JSON.stringify(meta)}`;
}

function statusOf(quantity: number, minimum: number) {
  if (quantity <= 0) return "Crítico";
  if (quantity <= Math.max(1, Math.floor(minimum * 0.35))) return "Crítico";
  if (quantity <= minimum) return "Estoque baixo";
  return "Normal";
}

export default function Stock() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<SalesProduct5787[]>([]);
  const [loading, setLoading] = useState(true);
  const [busySku, setBusySku] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    category: "Materiais clínicos",
    supplier: "",
    currentQuantity: "0",
    minimumQuantity: "0",
    unit: "unidades",
    batch: "",
    expirationDate: "",
    location: "",
    unitCost: "0",
  });

  const load = async () => {
    setError("");
    try {
      setProducts(await Sales5787Api.products());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar estoque.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo<StockRow[]>(
    () =>
      products
        .filter((product) => product.active)
        .map((product) => ({
          product,
          meta: decodeMeta(product.description),
          quantity: Number(product.stockQuantity),
          minimum: Number(product.minStock),
          cost: Number(product.costPrice),
        })),
    [products],
  );

  const critical = rows.filter((row) => row.quantity <= row.minimum);
  const inventoryValue = useMemo(
    () => rows.reduce((sum, row) => sum + row.quantity * row.cost, 0),
    [rows],
  );

  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      setError("Código/SKU e produto são obrigatórios.");
      return;
    }

    setBusySku(form.code.trim());
    setError("");
    try {
      const quantity = Math.max(0, Number(form.currentQuantity) || 0);
      const minimum = Math.max(0, Number(form.minimumQuantity) || 0);
      const cost = Math.max(0, Number(form.unitCost) || 0);
      await Sales5787Api.upsertProduct({
        sku: form.code.trim(),
        name: form.name.trim(),
        description: encodeMeta({
          category: form.category.trim(),
          supplier: form.supplier.trim(),
          unit: form.unit,
          batch: form.batch.trim(),
          location: form.location.trim(),
        }),
        salePrice: cost,
        costPrice: cost,
        stockQuantity: quantity,
        minStock: minimum,
        batchTracked: Boolean(form.batch.trim()),
        expiresAt: form.expirationDate
          ? new Date(`${form.expirationDate}T12:00:00`).toISOString()
          : null,
        active: true,
      });
      setOpen(false);
      setForm({
        code: "",
        name: "",
        category: "Materiais clínicos",
        supplier: "",
        currentQuantity: "0",
        minimumQuantity: "0",
        unit: "unidades",
        batch: "",
        expirationDate: "",
        location: "",
        unitCost: "0",
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar item.");
    } finally {
      setBusySku(null);
    }
  };

  const adjust = async (row: StockRow, delta: number) => {
    const next = Math.max(0, row.quantity + delta);
    setBusySku(row.product.sku);
    setError("");
    try {
      await Sales5787Api.upsertProduct({
        sku: row.product.sku,
        name: row.product.name,
        barcode: row.product.barcode ?? null,
        description: row.product.description ?? null,
        salePrice: Number(row.product.salePrice),
        costPrice: row.cost,
        stockQuantity: next,
        minStock: row.minimum,
        batchTracked: row.product.batchTracked,
        expiresAt: row.product.expiresAt ?? null,
        active: row.product.active,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar estoque.");
    } finally {
      setBusySku(null);
    }
  };

  return (
    <Box>
      <PageHeader
        title="Estoque"
        description="Estoque central da clínica, com persistência no servidor, mínimos e reposição crítica."
        actionLabel="Novo item"
        actionIcon={<AddIcon />}
        onAction={() => setOpen(true)}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {critical.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <strong>{critical.length} item(ns) precisam de reposição.</strong>{" "}
          O alerta é automático conforme o estoque mínimo configurado.
        </Alert>
      )}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(2,1fr)",
            xl: "repeat(4,1fr)",
          },
          gap: 2,
          mb: 3,
        }}
      >
        <Summary
          title="Itens cadastrados"
          value={String(rows.length)}
          icon={<Inventory2Icon />}
        />
        <Summary
          title="Reposição necessária"
          value={String(critical.length)}
          icon={<WarningAmberIcon />}
        />
        <Summary
          title="Fornecedores"
          value={String(
            new Set(rows.map((row) => row.meta.supplier).filter(Boolean)).size,
          )}
          icon={<LocalShippingIcon />}
        />
        <Summary
          title="Valor em estoque"
          value={brl(inventoryValue)}
          icon={<MonetizationOnIcon />}
        />
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper variant="outlined" sx={{ overflow: "hidden" }}>
          {rows.length === 0 && (
            <Typography color="text.secondary" sx={{ p: 3 }}>
              Nenhum item cadastrado ainda.
            </Typography>
          )}
          {rows.map((row) => {
            const status = statusOf(row.quantity, row.minimum);
            const busy = busySku === row.product.sku;
            return (
              <Box
                key={row.product.id}
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    md: "2fr 1fr 1fr 190px",
                  },
                  gap: 2,
                  p: 2,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  alignItems: "center",
                }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 800 }}>
                    {row.product.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {row.product.sku} • {row.meta.category || "Sem categoria"} •{" "}
                    {row.meta.supplier || "Sem fornecedor"}
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 800 }}>
                    {row.quantity} {row.meta.unit || "unidades"}
                  </Typography>
                  <Typography variant="caption">
                    mínimo {row.minimum}
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  label={status}
                  color={
                    status === "Crítico"
                      ? "error"
                      : status === "Estoque baixo"
                        ? "warning"
                        : "success"
                  }
                />
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={busy}
                    onClick={() => void adjust(row, -1)}
                  >
                    -1 saída
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={busy}
                    onClick={() => void adjust(row, 1)}
                  >
                    +1 entrada
                  </Button>
                </Stack>
              </Box>
            );
          })}
        </Paper>
      )}

      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
        <Button
          variant="contained"
          startIcon={<LocalShippingIcon />}
          onClick={() => navigate("/sales")}
          disabled={critical.length === 0}
        >
          Abrir loja e vendas
        </Button>
      </Box>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Novo item de estoque</DialogTitle>
        <DialogContent
          sx={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 1.5,
            pt: "12px!important",
          }}
        >
          <TextField
            label="Código/SKU"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          <TextField
            label="Produto"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <TextField
            label="Categoria"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <TextField
            label="Fornecedor"
            value={form.supplier}
            onChange={(e) => setForm({ ...form, supplier: e.target.value })}
          />
          <TextField
            label="Quantidade atual"
            type="number"
            value={form.currentQuantity}
            onChange={(e) =>
              setForm({ ...form, currentQuantity: e.target.value })
            }
          />
          <TextField
            label="Estoque mínimo"
            type="number"
            value={form.minimumQuantity}
            onChange={(e) =>
              setForm({ ...form, minimumQuantity: e.target.value })
            }
          />
          <TextField
            select
            label="Unidade"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
          >
            {["unidades", "caixas", "pacotes", "frascos", "seringas", "kits"].map(
              (value) => (
                <MenuItem key={value} value={value}>
                  {value}
                </MenuItem>
              ),
            )}
          </TextField>
          <TextField
            label="Custo unitário"
            type="number"
            value={form.unitCost}
            onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
          />
          <TextField
            label="Lote"
            value={form.batch}
            onChange={(e) => setForm({ ...form, batch: e.target.value })}
          />
          <TextField
            label="Validade"
            type="date"
            slotProps={{ inputLabel: { shrink: true } }}
            value={form.expirationDate}
            onChange={(e) =>
              setForm({ ...form, expirationDate: e.target.value })
            }
          />
          <TextField
            label="Localização"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            sx={{ gridColumn: "1/-1" }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={Boolean(busySku)}
            onClick={() => void save()}
          >
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function Summary({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Box sx={{ color: "primary.main", mb: 1 }}>{icon}</Box>
      <Typography variant="body2" color="text.secondary">
        {title}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 850 }}>
        {value}
      </Typography>
    </Paper>
  );
}
