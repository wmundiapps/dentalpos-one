import { useState } from "react";
import { Button, ListItemIcon, ListItemText, Menu, MenuItem } from "@mui/material";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import { downloadCsv, downloadTablePdf, type ExportTable } from "../utils/exportTable";

// Botão "Baixar / imprimir" das telas de listas. `build` monta a tabela só quando o usuário escolhe uma opção.
export default function ExportMenu({ build, label = "Baixar / imprimir", disabled }: { build: () => ExportTable; label?: string; disabled?: boolean }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [error, setError] = useState("");
  const close = () => setAnchor(null);

  const run = async (kind: "pdf" | "csv" | "print") => {
    close();
    setError("");
    try {
      if (kind === "print") { window.print(); return; }
      const table = build();
      if (kind === "csv") downloadCsv(table); else await downloadTablePdf(table);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível gerar o arquivo.");
    }
  };

  return (
    <>
      <Button variant="outlined" size="small" startIcon={<FileDownloadOutlinedIcon />} disabled={disabled} onClick={(e) => setAnchor(e.currentTarget)}>{label}</Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
        <MenuItem onClick={() => void run("pdf")}><ListItemIcon><PictureAsPdfOutlinedIcon fontSize="small" /></ListItemIcon><ListItemText>Baixar PDF</ListItemText></MenuItem>
        <MenuItem onClick={() => void run("csv")}><ListItemIcon><TableChartOutlinedIcon fontSize="small" /></ListItemIcon><ListItemText>Baixar planilha (Excel/CSV)</ListItemText></MenuItem>
        <MenuItem onClick={() => void run("print")}><ListItemIcon><PrintOutlinedIcon fontSize="small" /></ListItemIcon><ListItemText>Imprimir esta tela</ListItemText></MenuItem>
      </Menu>
      {error && <span role="alert" style={{ color: "#c62828", marginLeft: 8, fontSize: 13 }}>{error}</span>}
    </>
  );
}
