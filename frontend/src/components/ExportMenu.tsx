import { useState } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, ListItemIcon, ListItemText, Menu, MenuItem, TextField, Typography } from "@mui/material";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import { downloadCsv, downloadTablePdf, type ExportTable } from "../utils/exportTable";

// Botão "Baixar / imprimir" das telas de listas. `build` monta a tabela só quando o usuário escolhe uma opção.
export interface ExportPeriod { from: string; to: string }

const isoDay = (d: Date) => d.toLocaleDateString("sv-SE");
function periodPresets(): Array<[string, ExportPeriod]> {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const prevFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevLast = new Date(now.getFullYear(), now.getMonth(), 0);
  const in30 = new Date(now.getTime() + 30 * 86400000);
  return [
    ["Este mês", { from: isoDay(first), to: isoDay(last) }],
    ["Mês passado", { from: isoDay(prevFirst), to: isoDay(prevLast) }],
    ["Próximos 30 dias", { from: isoDay(now), to: isoDay(in30) }],
    ["Tudo", { from: "", to: "" }],
  ];
}

// Com `periodLabel`, antes de baixar pergunta o período (De / Até). `build` recebe o período escolhido.
export default function ExportMenu({ build, label = "Baixar / imprimir", disabled, periodLabel }: { build: (period?: ExportPeriod) => ExportTable; label?: string; disabled?: boolean; periodLabel?: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<"pdf" | "csv" | null>(null);
  const [period, setPeriod] = useState<ExportPeriod>(periodPresets()[0][1]);
  const close = () => setAnchor(null);

  const run = async (kind: "pdf" | "csv" | "print", chosen?: ExportPeriod) => {
    close();
    setError("");
    try {
      if (kind === "print") { window.print(); return; }
      const table = build(chosen);
      if (kind === "csv") downloadCsv(table); else await downloadTablePdf(table);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível gerar o arquivo.");
    }
  };

  return (
    <>
      <Button variant="outlined" size="small" startIcon={<FileDownloadOutlinedIcon />} disabled={disabled} onClick={(e) => setAnchor(e.currentTarget)}>{label}</Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
        <MenuItem onClick={() => (periodLabel ? (close(), setPending("pdf")) : void run("pdf"))}><ListItemIcon><PictureAsPdfOutlinedIcon fontSize="small" /></ListItemIcon><ListItemText>Baixar PDF</ListItemText></MenuItem>
        <MenuItem onClick={() => (periodLabel ? (close(), setPending("csv")) : void run("csv"))}><ListItemIcon><TableChartOutlinedIcon fontSize="small" /></ListItemIcon><ListItemText>Baixar planilha (Excel/CSV)</ListItemText></MenuItem>
        <MenuItem onClick={() => void run("print")}><ListItemIcon><PrintOutlinedIcon fontSize="small" /></ListItemIcon><ListItemText>Imprimir esta tela</ListItemText></MenuItem>
      </Menu>
      <Dialog open={pending !== null} onClose={() => setPending(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 800 }}>{`Período do relatório (${periodLabel || ""})`}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {periodPresets().map(([name, value]) => <Button key={name} size="small" variant="outlined" onClick={() => setPeriod(value)}>{name}</Button>)}
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            <TextField type="date" label="De" value={period.from} onChange={(e) => setPeriod({ ...period, from: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField type="date" label="Até" value={period.to} onChange={(e) => setPeriod({ ...period, to: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          </Box>
          <Typography variant="body2" color="text.secondary">Também vale o filtro da tela (por exemplo Despesa ou Pendente) e a busca. Deixe as datas vazias para baixar tudo.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)}>Cancelar</Button>
          <Button variant="contained" onClick={() => { const kind = pending; setPending(null); if (kind) void run(kind, period); }}>Baixar</Button>
        </DialogActions>
      </Dialog>
      {error && <span role="alert" style={{ color: "#c62828", marginLeft: 8, fontSize: 13 }}>{error}</span>}
    </>
  );
}
