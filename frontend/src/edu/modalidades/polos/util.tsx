import { Alert, Box, Snackbar } from "@mui/material";
import { useCallback, useState, type ReactNode } from "react";
import { eduApi } from "../../../services/EduApi";
import { Card } from "../kit";

export const BASE = "/modalidades/polos-ead";
export const money = (v?: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const pctTxt = (v?: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
export const corNivel = (n?: string) => (n === "critico" ? "#dc2626" : n === "atencao" ? "#ca8a04" : "#16a34a");
export const rotuloNivel = (n?: string) => (n === "critico" ? "Crítico" : n === "atencao" ? "Atenção" : "Saudável");

/** Executa uma ação da API mostrando o resultado/erro e recarregando a tela. */
export function useAcao(reload?: () => void) {
  const [msg, setMsg] = useState<{ tipo: "success" | "error"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const run = useCallback(async (fn: () => Promise<any>, ok?: string | ((r: any) => string)) => {
    setOcupado(true);
    try {
      const r = await fn();
      setMsg({ tipo: "success", texto: typeof ok === "function" ? ok(r) : ok || "Concluído." });
      reload?.();
      return r;
    } catch (e: any) {
      setMsg({ tipo: "error", texto: e?.message || "Não foi possível concluir a ação." });
    } finally { setOcupado(false); }
    return undefined;
  }, [reload]);
  const aviso: ReactNode = (
    <Snackbar open={!!msg} autoHideDuration={6000} onClose={() => setMsg(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
      {msg ? <Alert severity={msg.tipo} onClose={() => setMsg(null)} sx={{ width: "100%" }}>{msg.texto}</Alert> : undefined}
    </Snackbar>
  );
  return { run, ocupado, aviso };
}

export const post = (path: string, body?: unknown) => eduApi.post(`${BASE}${path}`, body ?? {});
export const get = (path: string) => eduApi.get(`${BASE}${path}`);

export function Cards({ children }: { children: ReactNode }) {
  return <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>{children}</Box>;
}
export { Card };
