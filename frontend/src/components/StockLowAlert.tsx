import { useEffect, useState } from "react";
import { Alert, Button } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { StockApi, type StockAlertRow } from "../services/StockApi";

// Aviso no painel: material acabando (abaixo do mínimo ou perto do fim pela média de procedimentos). Some se o usuário não vê o estoque.
export default function StockLowAlert() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<StockAlertRow[]>([]);
  useEffect(() => { StockApi.alerts().then(setRows).catch(() => setRows([])); }, []);
  if (!rows.length) return null;
  const critical = rows.some((r) => r.level === "critical");
  return (
    <Alert severity={critical ? "error" : "warning"} sx={{ mb: 3 }} action={<Button color="inherit" size="small" onClick={() => navigate("/estoque")}>Abrir estoque</Button>}>
      <strong>{rows.length === 1 ? "1 material está acabando:" : `${rows.length} materiais estão acabando:`}</strong>{" "}
      {rows.slice(0, 4).map((r) => `${r.name} (${r.message})`).join(" • ")}{rows.length > 4 ? " • e outros." : ""}
    </Alert>
  );
}
