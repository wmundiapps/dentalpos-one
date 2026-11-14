// Peças compartilhadas da Caixa de boletos (DDA e e-mail dedicado).
import { Alert, Box, Chip, Tooltip, Typography } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { ReactNode } from "react";
import { readSessionUser } from "../../services/DemoAccess";

export const BOL = "/boletos";

export const AVISO_INTERNO = "Verificação interna do sistema (dígitos verificadores, cadastro de fornecedores, notas fiscais e histórico). Não é consulta ao banco nem à CIP e não substitui a conferência no banco ou no internet banking antes de pagar.";

const RESULTADO: Record<string, { color: "success" | "warning" | "error" | "default"; texto: string; dica: string }> = {
  OK: { color: "success", texto: "OK", dica: "Nenhum alerta no check-up interno" },
  ATENCAO: { color: "warning", texto: "ATENÇÃO", dica: "Há pendências ou alertas a conferir" },
  SUSPEITO: { color: "error", texto: "SUSPEITO", dica: "Indícios de fraude ou erro: conferir antes de qualquer pagamento" },
  DUPLICADO: { color: "error", texto: "DUPLICADO", dica: "Já lançado ou pago anteriormente" },
};
const STATUS: Record<string, { color: "default" | "info" | "success" | "error" | "warning"; texto: string }> = {
  RECEBIDO: { color: "info", texto: "Recebido" }, A_CONFERIR: { color: "warning", texto: "A conferir" }, EM_APROVACAO: { color: "warning", texto: "Em aprovação" },
  AUTORIZADO: { color: "success", texto: "Autorizado" }, REFUTADO: { color: "error", texto: "Refutado" },
  ABERTO: { color: "default", texto: "Aberto" }, ENVIADO_APROVACAO: { color: "info", texto: "Aguardando aprovação" }, APROVADO: { color: "success", texto: "Aprovado" },
  PARCIAL: { color: "warning", texto: "Aprovado em parte" }, REPROVADO: { color: "error", texto: "Reprovado" },
  ESPERADO: { color: "default", texto: "Esperado" }, LANCADO: { color: "success", texto: "Lançado" }, NAO_LANCADO: { color: "error", texto: "Não lançado" },
  JUSTIFICADO: { color: "default", texto: "Justificado" }, DISPENSADO: { color: "default", texto: "Dispensado" },
  PROCESSADO: { color: "success", texto: "Processado" }, SEM_DADOS: { color: "warning", texto: "Sem dados" }, ILEGIVEL: { color: "error", texto: "Ilegível" },
};

export function ResultadoChip({ value, score, size = "small" }: { value?: string | null; score?: number | null; size?: "small" | "medium" }) {
  const r = RESULTADO[value || ""] ?? { color: "default" as const, texto: value || "—", dica: "" };
  return (
    <Tooltip title={`${r.dica}${score != null ? ` · risco ${score}/100` : ""}`}>
      <Chip size={size} color={r.color} label={score != null ? `${r.texto} · ${score}` : r.texto} sx={{ fontWeight: 800 }} />
    </Tooltip>
  );
}

export function StatusChip({ value }: { value?: string | null }) {
  const s = STATUS[value || ""] ?? { color: "default" as const, texto: (value || "—").replace(/_/g, " ") };
  return <Chip size="small" variant="outlined" color={s.color} label={s.texto} />;
}

export const OrigemChip = ({ value }: { value?: string }) => <Chip size="small" variant="outlined" label={value === "DDA" ? "DDA" : value === "EMAIL" ? "E-mail" : "Manual"} />;

/** Lista legível de motivos do check-up (cada motivo com ícone conforme a gravidade). */
export function Motivos({ motivos, dense }: { motivos: Array<{ codigo: string; gravidade: string; texto: string }>; dense?: boolean }) {
  if (!motivos?.length) return <Typography variant="body2" color="text.secondary">Sem check-up registrado.</Typography>;
  const ordem: Record<string, number> = { CRITICO: 0, ATENCAO: 1, INFO: 2, OK: 3 };
  const lista = [...motivos].sort((a, b) => (ordem[a.gravidade] ?? 9) - (ordem[b.gravidade] ?? 9));
  const icon = (g: string): ReactNode =>
    g === "CRITICO" ? <ErrorOutlineIcon fontSize="small" color="error" /> : g === "ATENCAO" ? <WarningAmberIcon fontSize="small" color="warning" /> : g === "OK" ? <CheckCircleOutlineIcon fontSize="small" color="success" /> : <InfoOutlinedIcon fontSize="small" color="info" />;
  return (
    <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gap: dense ? 0.25 : 0.75 }}>
      {lista.map((m, i) => (
        <Box component="li" key={`${m.codigo}-${i}`} sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
          <Box sx={{ pt: "2px", flexShrink: 0 }}>{icon(m.gravidade)}</Box>
          <Typography variant={dense ? "caption" : "body2"} sx={{ overflowWrap: "anywhere" }}>{m.texto}</Typography>
        </Box>
      ))}
    </Box>
  );
}

export const AvisoInterno = () => <Alert severity="info" icon={<InfoOutlinedIcon />} sx={{ py: 0.5 }}>{AVISO_INTERNO}</Alert>;

/** Formata a linha digitável de 47 dígitos para leitura. */
export function fmtLinha(l?: string | null) {
  const d = String(l || "").replace(/\D/g, "");
  if (d.length === 47) return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d[32]} ${d.slice(33)}`;
  return l || "";
}

export function fmtDoc(d?: string | null) {
  const s = String(d || "");
  const n = s.replace(/\D/g, "");
  if (n.length === 14 && !s.includes("*")) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
  return s || "—";
}

/** Perfis que podem alterar configurações e rotacionar o segredo (administração e diretoria). */
export function ehAdministracao() {
  const role = String(readSessionUser()?.role || "").toUpperCase();
  return ["ADMIN", "OWNER", "RECTOR", "BOARD"].includes(role);
}

/** Baixa um anexo guardado (com o token do usuário). */
export async function baixarAnexo(id: string, nome: string) {
  const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
  const res = await fetch(`${API}/edu/boletos/anexos/${id}/download`, { headers: { Authorization: `Bearer ${localStorage.getItem("dentalpos.token") || ""}` } });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Não foi possível baixar o anexo.");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Lê arquivos escolhidos como base64 (sem o prefixo data:). */
export function lerArquivoBase64(f: File): Promise<{ filename: string; mime: string; contentBase64: string; tamanho: number }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error(`Não foi possível ler ${f.name}.`));
    r.onload = () => resolve({ filename: f.name, mime: f.type || "application/octet-stream", contentBase64: String(r.result).split(",")[1] || "", tamanho: f.size });
    r.readAsDataURL(f);
  });
}

export const hojeISO = () => new Date().toISOString().slice(0, 10);
