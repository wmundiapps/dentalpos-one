import { Alert, Snackbar } from "@mui/material";
import { useCallback, useState, type ReactNode } from "react";

/** Aviso rápido (sucesso/erro) reutilizado pelas telas do portal. */
export function useToast() {
  const [t, setT] = useState<{ s: "success" | "error" | "info"; m: string } | null>(null);
  const ok = useCallback((m: string) => setT({ s: "success", m }), []);
  const err = useCallback((m: string) => setT({ s: "error", m }), []);
  const node: ReactNode = (
    <Snackbar open={!!t} autoHideDuration={4500} onClose={() => setT(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
      {t ? <Alert severity={t.s} onClose={() => setT(null)} variant="filled">{t.m}</Alert> : undefined}
    </Snackbar>
  );
  return { ok, err, node };
}

export const GRID_2 = { display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" } } as const;
export const GRID_3 = { display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" } } as const;

/** Sufixo ?studentId= usado quando a gestão consulta o portal de um aluno. */
export const sid = (studentId?: string | null, first = true) => (studentId ? `${first ? "?" : "&"}studentId=${encodeURIComponent(studentId)}` : "");
export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
