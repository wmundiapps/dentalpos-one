// Kit do Acadêmico avançado (alunos, matrizes, salas, desenvolvimento, pesquisa/extensão): reaproveita o kit do Jurídico/Desempenho.
import { Box, Chip } from "@mui/material";
import { eduApi, EduApiError } from "../../services/EduApi";

export * from "../juridico/kit";
export { eduApi, EduApiError };

const API = (import.meta as any).env?.VITE_API_URL || "http://localhost:3000/api";

/** Baixa um arquivo binário (xlsx etc.) autenticado e dispara o download no navegador. */
export async function baixar(path: string, nomePadrao: string) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const res = await fetch(`${API}/edu${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || `Erro ${res.status}`); }
  const cd = res.headers.get("content-disposition") || "";
  const nome = /filename="?([^";]+)"?/.exec(cd)?.[1] || nomePadrao;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/** Abre uma página HTML do backend (relatórios imprimíveis) em nova aba, enviando o token. */
export async function abrirHtml(path: string) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const res = await fetch(`${API}/edu${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || `Erro ${res.status}`); }
  const url = URL.createObjectURL(new Blob([await res.text()], { type: "text/html" }));
  window.open(url, "_blank");
}

export const qsOf = (o: Record<string, string | number | boolean | undefined | null>) =>
  Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== false).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");

export const DIAS = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
export const DIAS_CURTO = ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };

export const NIVEL_ROTULO: Record<string, string> = { GRADUACAO: "Graduação", POS: "Pós-graduação", LIVRE: "Cursos livres", TECNICO: "Técnico", TECNOLOGO: "Tecnólogo", POS_LATO: "Pós lato sensu", POS_STRICTO: "Pós stricto sensu" };
export const TURNO_ROTULO: Record<string, string> = { MANHA: "Manhã", TARDE: "Tarde", NOITE: "Noite", FIM_DE_SEMANA: "Finais de semana", INTEGRAL: "Integral", EAD: "EAD" };

export function Flag({ children, color = "default" }: { children: string; color?: "default" | "error" | "warning" | "success" | "info" | "primary" }) {
  return <Chip size="small" color={color as any} variant={color === "default" ? "outlined" : "filled"} label={children} sx={{ mr: 0.5 }} />;
}

export const Cols2 = ({ children }: { children: React.ReactNode }) => (
  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>{children}</Box>
);
