import { Box, Button, Chip, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import PrintIcon from "@mui/icons-material/Print";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useState } from "react";
import { baixarArquivo, fetchTexto } from "../common";
import { Section, Status, useApi } from "../../regulatorio/ui";
import { Grafico, fmtUn, type SerieDef } from "./Charts";

export interface KpiDef { chave: string; rotulo: string; valor: number | string | null; unidade?: string; alerta?: "VERDE" | "AMARELO" | "VERMELHO"; dica?: string }
export interface TabelaDef { chave: string; titulo: string; colunas: Array<{ key: string; label: string; tipo?: string }>; linhas: Array<Record<string, any>> }
export interface PainelDef { id: string; titulo: string; descricao: string; geradoEm: string; kpis: KpiDef[]; series: SerieDef[]; tabelas: TabelaDef[]; avisos: string[] }

const COR = { VERDE: "#16a34a", AMARELO: "#eab308", VERMELHO: "#dc2626" } as const;

export function fmtCelula(v: any, tipo?: string) {
  if (v === null || v === undefined || v === "") return "—";
  if (tipo === "moeda") return fmtUn(Number(v), "R$");
  if (tipo === "pct") return `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  if (tipo === "data") return new Date(v).toLocaleDateString("pt-BR");
  if (tipo === "numero" && typeof v === "number") return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function KpiCard({ k }: { k: KpiDef }) {
  const valor = typeof k.valor === "number" ? fmtUn(k.valor, k.unidade) : k.valor ?? "—";
  const sufixo = k.unidade === "dias" && typeof k.valor === "number" ? " dias" : k.unidade === "nota" ? "" : "";
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, borderLeft: k.alerta ? `5px solid ${COR[k.alerta]}` : undefined, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: "uppercase", lineHeight: 1.2, display: "block" }}>{k.rotulo}</Typography>
      <Typography variant="h5" sx={{ fontWeight: 800, wordBreak: "break-word" }}>{valor}{sufixo}</Typography>
    </Paper>
  );
}

export function TabelaView({ t }: { t: TabelaDef }) {
  return (
    <Section title={t.titulo}>
      {t.linhas.length === 0 ? <Typography color="text.secondary" variant="body2">Sem registros.</Typography> : (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow>{t.colunas.map((c) => <TableCell key={c.key} sx={{ fontWeight: 800, whiteSpace: "nowrap" }} align={["numero", "moeda", "pct"].includes(c.tipo || "") ? "right" : "left"}>{c.label}</TableCell>)}</TableRow></TableHead>
            <TableBody>
              {t.linhas.map((l, i) => <TableRow key={i} hover>{t.colunas.map((c) => <TableCell key={c.key} align={["numero", "moeda", "pct"].includes(c.tipo || "") ? "right" : "left"}>{fmtCelula(l[c.key], c.tipo)}</TableCell>)}</TableRow>)}
            </TableBody>
          </Table>
        </Box>
      )}
    </Section>
  );
}

export function PainelView({ painel }: { painel: PainelDef }) {
  return (
    <Box>
      <Typography color="text.secondary" sx={{ mb: 1.5 }}>{painel.descricao}</Typography>
      {painel.avisos.map((a) => <Chip key={a} label={a} size="small" sx={{ mb: 1, mr: 1, maxWidth: "100%", height: "auto", "& .MuiChip-label": { whiteSpace: "normal", py: 0.5 } }} />)}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1.5, mb: 2 }}>
        {painel.kpis.map((k) => <KpiCard key={k.chave} k={k} />)}
      </Box>
      {painel.series.length > 0 && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 2 }}>
          {painel.series.map((s) => <Paper key={s.chave} variant="outlined" sx={{ p: 2, borderRadius: 3, minWidth: 0 }}><Grafico serie={s} /></Paper>)}
        </Box>
      )}
      {painel.tabelas.map((t) => <TabelaView key={t.chave} t={t} />)}
    </Box>
  );
}

/** Carrega e exibe um painel do backend, com atualização e exportação CSV/impressão. */
export default function PainelRemoto({ id, extra }: { id: string; extra?: string }) {
  const { data, loading, error, reload } = useApi<PainelDef>(`/reitoria/paineis/${id}${extra || ""}`);
  const [erroCsv, setErroCsv] = useState<string | null>(null);
  async function exportar() {
    setErroCsv(null);
    try { baixarArquivo(`painel-${id}.csv`, await fetchTexto(`/reitoria/paineis/${id}?formato=csv${(extra || "").replace("?", "&")}`), "text/csv;charset=utf-8"); } catch (e: any) { setErroCsv(e.message); }
  }
  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
        <Button startIcon={<RefreshIcon />} onClick={reload}>Atualizar</Button>
        <Button startIcon={<DownloadIcon />} onClick={exportar} disabled={!data}>Exportar CSV</Button>
        <Button startIcon={<PrintIcon />} onClick={() => window.print()}>Imprimir</Button>
        {erroCsv && <Typography color="error" variant="body2" sx={{ alignSelf: "center" }}>{erroCsv}</Typography>}
      </Box>
      <Status loading={loading && !data} error={error} onRetry={reload} empty={!data}>{data && <PainelView painel={data} />}</Status>
    </Box>
  );
}
