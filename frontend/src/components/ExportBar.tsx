import { useState, type ReactNode } from "react";
import { Box, Button, Menu, MenuItem } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import { eduApi } from "../services/EduApi";

/** Extrai texto simples de um ReactNode (Typography, Chip, texto puro...) para a célula do CSV/impressão. */
function textoDe(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textoDe).join(" ");
  if (typeof node === "object" && "props" in (node as any)) {
    const children = (node as any).props?.children;
    return children !== undefined ? textoDe(children) : "";
  }
  return "";
}

function paraCsv(linhas: string[][]): string {
  const esc = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return linhas.map((l) => l.map(esc).join(";")).join("\n");
}

export interface ExportCol { label: string; render: (r: any) => ReactNode }

/**
 * Barra de relatório para qualquer lista: exportar CSV, imprimir e enviar por e-mail/WhatsApp (fila da
 * central de mensagens — a entrega real depende de canal configurado, como em qualquer outro envio do sistema).
 */
export default function ExportBar({ titulo, linhas, colunas }: { titulo: string; linhas: any[]; colunas: ExportCol[] }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");

  function montarTabela() {
    const cab = colunas.map((c) => c.label);
    const corpo = linhas.map((r) => colunas.map((c) => textoDe(c.render(r))));
    return [cab, ...corpo];
  }

  function exportarCsv() {
    const csv = paraCsv(montarTabela());
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${titulo.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function imprimir() {
    const [cab, ...corpo] = montarTabela();
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${titulo}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px}h1{font-size:18px}table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f2f2f2}</style></head><body>
      <h1>${titulo}</h1><p>Gerado em ${new Date().toLocaleString("pt-BR")}</p>
      <table><thead><tr>${cab.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
      <tbody>${corpo.map((l) => `<tr>${l.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody></table>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html); w.document.close(); w.focus(); w.print();
  }

  async function enviarRelatorio(canal: "EMAIL" | "WHATSAPP") {
    setEl(null);
    const destino = window.prompt(canal === "EMAIL" ? "E-mail de destino:" : "Telefone (WhatsApp) de destino:");
    if (!destino?.trim()) return;
    setEnviando(true); setAviso("");
    try {
      const csv = paraCsv(montarTabela());
      await eduApi.post("/comunicacao/outbox", {
        canal, destino: destino.trim(), assunto: `Relatório — ${titulo}`,
        mensagem: `Relatório "${titulo}" gerado em ${new Date().toLocaleString("pt-BR")} (${linhas.length} registro(s)). Anexo em texto:\n\n${csv.slice(0, 4000)}`,
      });
      setAviso("Relatório enfileirado para envio. A entrega depende do canal estar configurado.");
    } catch (e: any) {
      setAviso(e?.message || "Não foi possível enfileirar o envio agora.");
    } finally { setEnviando(false); }
  }

  return (
    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
      <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={exportarCsv} disabled={!linhas.length}>Exportar</Button>
      <Button size="small" variant="outlined" onClick={imprimir} disabled={!linhas.length}>Imprimir</Button>
      <Button size="small" variant="outlined" disabled={!linhas.length || enviando} onClick={(e) => setEl(e.currentTarget)}>Enviar</Button>
      <Menu anchorEl={el} open={!!el} onClose={() => setEl(null)}>
        <MenuItem onClick={() => enviarRelatorio("EMAIL")}>Por e-mail</MenuItem>
        <MenuItem onClick={() => enviarRelatorio("WHATSAPP")}>Por WhatsApp</MenuItem>
      </Menu>
      {aviso ? <Box sx={{ fontSize: 12, color: "text.secondary" }}>{aviso}</Box> : null}
    </Box>
  );
}
