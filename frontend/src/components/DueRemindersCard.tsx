import { useEffect, useState } from "react";
import { Box, Chip, Paper, Typography } from "@mui/material";
import EventBusyIcon from "@mui/icons-material/EventBusy";
import { useNavigate } from "react-router-dom";
import { loadDueOverview, type DueItem } from "../services/DueRemindersApi";

const label = (d: number) => (d < 0 ? `Venceu há ${-d} dia${d === -1 ? "" : "s"}` : d === 0 ? "Vence hoje" : d === 1 ? "Vence amanhã" : `Vence em ${d} dias`);
const color = (d: number): "error" | "warning" | "info" => (d <= 0 ? "error" : d <= 1 ? "warning" : "info");

// Tela de abertura: contas, impostos, recibos da Receita Saúde, alvará, autoclave, validade de produtos e documentos.
export default function DueRemindersCard() {
  const [items, setItems] = useState<DueItem[] | null>(null);
  const navigate = useNavigate();
  useEffect(() => { loadDueOverview().then((d) => setItems(d.items)).catch(() => setItems(null)); }, []);
  if (!items || items.length === 0) return null;
  return (
    <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider", mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.2, mb: 1.5 }}>
        <EventBusyIcon color="warning" />
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Vencimentos e avisos</Typography>
        <Chip size="small" color={items.some((i) => i.daysLeft <= 0) ? "error" : "primary"} label={`${items.length}`} />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Você também recebe estes avisos por e-mail às 9h: 10 dias, 7 dias, 1 dia antes e no dia do vencimento.</Typography>
      <Box sx={{ display: "grid", gap: 1 }}>
        {items.map((i) => (
          <Box key={`${i.source}-${i.id}-${i.dueDate}`} role="button" tabIndex={0} onClick={() => navigate(i.path)} onKeyDown={(e) => { if (e.key === "Enter") navigate(i.path); }} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap", p: 1.2, border: "1px solid", borderColor: "divider", borderRadius: 2, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}>
            <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, minWidth: 220 }}>{i.title}</Typography>
            <Chip size="small" color={color(i.daysLeft)} label={`${label(i.daysLeft)} · ${i.dueDate.split("-").reverse().join("/")}`} />
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
