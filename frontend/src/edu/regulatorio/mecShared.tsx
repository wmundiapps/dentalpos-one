import { Alert, Chip } from "@mui/material";

export const DIM_NOME: Record<string, string> = {
  ORGANIZACAO_DIDATICO_PEDAGOGICA: "Organização didático-pedagógica",
  CORPO_DOCENTE_TUTORIAL: "Corpo docente e tutorial",
  INFRAESTRUTURA: "Infraestrutura",
};
export const DIMS = Object.keys(DIM_NOME);

export const NIVEL_COR: Record<string, string> = { VENCIDO: "#dc2626", CRITICO: "#dc2626", ALTO: "#ea580c", ATENCAO: "#eab308", NORMAL: "#16a34a" };
export const NIVEL_TXT: Record<string, string> = { VENCIDO: "Vencido", CRITICO: "Crítico", ALTO: "Atenção alta", ATENCAO: "Atenção", NORMAL: "Em dia" };
export const FASE_COR: Record<string, "default" | "success" | "warning" | "info"> = { PENDENTE: "default", EM_ANDAMENTO: "warning", CONCLUIDA: "success", NAO_APLICAVEL: "default" };
export const STATUS_EV: Record<string, "default" | "success" | "warning" | "error"> = { PENDENTE: "error", EM_ANDAMENTO: "warning", ATENDIDO: "success", NAO_APLICAVEL: "default" };

export function diasTxt(d: number | null | undefined) {
  if (d == null) return "sem prazo";
  return d < 0 ? `${Math.abs(d)} dia(s) em atraso` : d === 0 ? "hoje" : `em ${d} dia(s)`;
}

export function NivelChip({ nivel, dias }: { nivel?: string | null; dias?: number | null }) {
  if (!nivel) return null;
  return <Chip size="small" label={`${NIVEL_TXT[nivel] || nivel}${dias != null ? ` · ${diasTxt(dias)}` : ""}`} sx={{ bgcolor: `${NIVEL_COR[nivel]}22`, color: NIVEL_COR[nivel], fontWeight: 700 }} />;
}

/** Aviso permanente: os dados do ambiente de demonstração são fictícios. */
export function AvisoFicticio({ texto }: { texto?: string | null }) {
  if (!texto) return null;
  return (
    <Alert severity="warning" variant="filled" sx={{ mb: 2, fontWeight: 700 }}>
      {texto} Nenhum conceito, protocolo e-MEC ou avaliador desta tela é real.
    </Alert>
  );
}
