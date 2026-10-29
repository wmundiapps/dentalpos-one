import { Alert, Box, Typography } from "@mui/material";
import type { ReactNode } from "react";

export const hora = (v: any) => (v ? new Date(v).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—");

export const STATUS_COR: Record<string, "success" | "warning" | "error" | "default" | "info"> = {
  PRESENTE: "success", ATRASO: "warning", SAIDA_ANTECIPADA: "warning", ATRASO_SAIDA_ANTECIPADA: "warning", FALTA: "error", JUSTIFICADA: "info", PENDENTE: "default",
  ABERTA: "info", FECHADA: "default", CONCILIADA: "success", ATIVO: "info", DEVOLVIDO: "success", PERDIDO: "error",
  DISPONIVEL: "success", EMPRESTADO: "info", RESERVADO: "warning", MANUTENCAO: "warning", BAIXADO: "default",
  ABERTO: "error", RECONHECIDO: "warning", RESOLVIDO: "success", LIBERADO: "success", NEGADO: "error",
};

export const ROTULO_STATUS: Record<string, string> = {
  PRESENTE: "Presente", ATRASO: "Atraso", SAIDA_ANTECIPADA: "Saída antecipada", ATRASO_SAIDA_ANTECIPADA: "Atraso + saída antecipada", FALTA: "Falta", JUSTIFICADA: "Falta justificada", PENDENTE: "Pendente",
};

export const TIPO_ROTULO: Record<string, string> = { ENTRADA: "Entrada", SAIDA: "Saída", INTERVALO_SAIDA: "Saída para o intervalo", INTERVALO_VOLTA: "Volta do intervalo" };

/** Faixa grande de resultado para telas de quiosque (legível a distância). */
export function FaixaResultado({ tipo, titulo, detalhe }: { tipo: "ok" | "aviso" | "erro"; titulo: ReactNode; detalhe?: ReactNode }) {
  const cor = tipo === "ok" ? "#2e7d32" : tipo === "aviso" ? "#ed6c02" : "#c62828";
  return (
    <Box role="status" aria-live="assertive" sx={{ bgcolor: cor, color: "#fff", borderRadius: 4, p: { xs: 2, md: 3 }, textAlign: "center", boxShadow: "0 8px 24px rgba(0,0,0,.25)" }}>
      <Typography sx={{ fontWeight: 900, fontSize: { xs: 24, md: 34 }, lineHeight: 1.15 }}>{titulo}</Typography>
      {detalhe ? <Typography sx={{ mt: 0.5, fontSize: { xs: 15, md: 20 }, opacity: 0.95 }}>{detalhe}</Typography> : null}
    </Box>
  );
}

export function AvisoBiometria() {
  return (
    <Alert severity="info" sx={{ "& .MuiAlert-message": { width: "100%" } }}>
      <b>Biometria é opcional.</b> Quem não quiser usar o rosto registra presença e acesso por <b>QR da carteirinha</b>, <b>código</b> ou <b>lista manual</b>, sem qualquer prejuízo.
      O rosto é lido só neste aparelho; nenhuma foto é guardada.
    </Alert>
  );
}
