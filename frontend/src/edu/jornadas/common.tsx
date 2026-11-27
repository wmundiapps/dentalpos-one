import { Alert, Box, CircularProgress } from "@mui/material";
import { useCallback, useEffect, useState, type ReactNode } from "react";

export const PERSONAS = [
  { value: "ALUNO", label: "Aluno" },
  { value: "PROFESSOR", label: "Professor" },
  { value: "COORDENADOR", label: "Coordenador" },
  { value: "FUNCIONARIO", label: "Funcionário" },
  { value: "DIRETORIA", label: "Diretoria" },
  { value: "EGRESSO", label: "Egresso" },
];

export const ROTULO_PAPEL: Record<string, string> = {
  ADMIN: "Administração", OWNER: "Proprietário", RECTOR: "Reitoria", BOARD: "Diretoria", COORDINATOR: "Coordenação", TEACHER: "Professor",
  STUDENT: "Aluno", FINANCE: "Financeiro", SECRETARY: "Secretaria", LIBRARIAN: "Biblioteca", FACILITIES: "Infraestrutura", SUPPLIES: "Suprimentos",
  MARKETING: "Marketing", ADMISSIONS: "Admissões", SUPPORT: "Apoio/Suporte", STAFF: "Equipe administrativa",
};
export const papelLabel = (p?: string | null) => (p ? ROTULO_PAPEL[p] || p : "Geral");

export const TIPO_COR: Record<string, { fill: string; stroke: string; label: string }> = {
  INICIO: { fill: "#dcfce7", stroke: "#16a34a", label: "Início" },
  FIM: { fill: "#e2e8f0", stroke: "#475569", label: "Fim" },
  TAREFA: { fill: "#dbeafe", stroke: "#2563eb", label: "Tarefa" },
  APROVACAO: { fill: "#ede9fe", stroke: "#7c3aed", label: "Aprovação" },
  ESPERA_EVENTO: { fill: "#ffedd5", stroke: "#ea580c", label: "Espera de evento" },
  GATEWAY: { fill: "#fef9c3", stroke: "#ca8a04", label: "Decisão" },
  MARCO: { fill: "#fce7f3", stroke: "#db2777", label: "Marco" },
};

export const fmtData = (v?: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
export const fmtDataHora = (v?: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "—");

/** Carrega dados de uma função assíncrona com estados de carregando/erro. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await fn()); } catch (e: any) { setError(e?.message || "Falha ao carregar."); setData(null); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { data, loading, error, reload: run };
}

export function Loadable({ loading, error, children }: { loading: boolean; error: string | null; children: ReactNode }) {
  if (loading) return <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}><CircularProgress size={28} /></Box>;
  if (error) return <Alert severity="warning">{error}</Alert>;
  return <>{children}</>;
}
