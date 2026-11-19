import { Box, Button, Chip, Divider, Drawer, IconButton, Paper, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import type { OperationalAlert } from "../../types/operationsHub";

export const DEPARTMENTS = ["Contas a receber", "Contas a pagar", "Laboratório", "Agenda", "Estoque", "Pacientes", "RH"] as const;
export type Department = (typeof DEPARTMENTS)[number] | "Outros";
// Os quatro de maior uso ficam sempre na lista; os demais só aparecem quando têm aviso.
export const ALWAYS: Department[] = ["Contas a receber", "Contas a pagar", "Laboratório", "Agenda"];

export function departmentOf(a: OperationalAlert): Department {
  if (a.area === "Laboratório") return "Laboratório";
  if (a.area === "Estoque") return "Estoque";
  if (a.area === "Agenda") return "Agenda";
  if (a.area === "RH") return "RH";
  if (a.id.startsWith("financial-") || a.id.startsWith("agenda-unbilled")) return a.area === "Financeiro" ? "Contas a pagar" : "Contas a receber";
  if (a.area === "Financeiro") return "Contas a pagar";
  if (a.area === "Pacientes") return "Pacientes";
  return "Outros";
}

export const COLORS = { error: { main: "#D32F2F", soft: "rgba(211,47,47,.10)" }, warning: { main: "#ED6C02", soft: "rgba(237,108,2,.10)" }, none: { main: "#9AA5B1", soft: "transparent" } };

interface Props {
  alerts: OperationalAlert[];
  open: Department | null;
  onOpen: (d: Department | null) => void;
  onResolve: (a: OperationalAlert) => void;
  onDismiss: (a: OperationalAlert) => void;
}

// Painel de avisos: os departamentos ficam numa lista curta e mudam de cor quando há aviso. O detalhe só aparece ao tocar no departamento.
export default function AlertsPanel({ alerts, open, onOpen, onResolve, onDismiss }: Props) {
  const grouped = new Map<Department, OperationalAlert[]>();
  alerts.forEach((a) => { const d = departmentOf(a); grouped.set(d, [...(grouped.get(d) || []), a]); });
  const list = ([...DEPARTMENTS, "Outros"] as Department[]).filter((d) => ALWAYS.includes(d) || grouped.has(d));
  const total = alerts.length;
  const levelOf = (d: Department) => { const rows = grouped.get(d) || []; return rows.some((r) => r.severity === "error") ? "error" : rows.length ? "warning" : "none"; };
  const detail = open ? grouped.get(open) || [] : [];

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
      <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", mb: 1.2 }}>
        <Typography sx={{ fontWeight: 900 }}>Avisos do dia</Typography>
        <Typography variant="caption" color="text.secondary">{total ? `${total} no total` : "Tudo em dia"}</Typography>
      </Box>
      <Box sx={{ display: "grid", gap: 0.6 }}>
        {list.map((d) => {
          const level = levelOf(d); const c = COLORS[level]; const count = (grouped.get(d) || []).length;
          return (
            <Box key={d} role="button" tabIndex={0} onClick={() => onOpen(d)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(d); } }}
              sx={{ display: "flex", alignItems: "center", gap: 1.2, px: 1.3, py: 1, borderRadius: 2, cursor: "pointer", bgcolor: c.soft, border: "1px solid", borderColor: level === "none" ? "divider" : c.main, "&:hover": { filter: "brightness(.97)" } }}>
              <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: c.main, flexShrink: 0 }} />
              <Typography sx={{ fontWeight: level === "none" ? 600 : 800, flex: 1, color: level === "none" ? "text.secondary" : "text.primary" }}>{d}</Typography>
              {count > 0 ? <Chip size="small" label={count} sx={{ bgcolor: c.main, color: "#fff", fontWeight: 800, height: 22 }} /> : <Typography variant="caption" color="text.secondary">em dia</Typography>}
            </Box>
          );
        })}
      </Box>

      <Drawer anchor="right" open={open !== null} onClose={() => onOpen(null)} slotProps={{ paper: { sx: { width: { xs: "100%", sm: 440 }, p: 2 } } }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          <IconButton onClick={() => onOpen(null)} aria-label="Voltar"><ArrowBackIcon /></IconButton>
          <Typography variant="h6" sx={{ fontWeight: 900, flex: 1 }}>{open}</Typography>
          <IconButton onClick={() => onOpen(null)} aria-label="Fechar"><CloseIcon /></IconButton>
        </Box>
        {detail.length === 0 && <Typography color="text.secondary" sx={{ p: 2 }}>Nenhuma pendência neste departamento.</Typography>}
        {detail.map((a, i) => (
          <Box key={a.id}>
            <Box sx={{ py: 1.4, display: "grid", gap: 0.5 }}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: a.severity === "error" ? COLORS.error.main : COLORS.warning.main }} />
                <Typography sx={{ fontWeight: 800 }}>{a.title}</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">{a.description}</Typography>
              <Box sx={{ display: "flex", gap: 0.5 }}>
                <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => onResolve(a)}>Resolver na origem</Button>
                <Button size="small" color="inherit" onClick={() => onDismiss(a)}>Dispensar</Button>
              </Box>
            </Box>
            {i < detail.length - 1 && <Divider />}
          </Box>
        ))}
      </Drawer>
    </Paper>
  );
}
