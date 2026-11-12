// Utilitários do módulo Exames (ENADE · ENAMED · OAB): aviso legal, perfil do usuário e seleção de exame.
import { Alert, Box, Chip, MenuItem, TextField, Typography } from "@mui/material";
import { useMemo } from "react";
import { fmtPct, useApi } from "../desempenho/kit";

export const X = "/exames";

export const AVISO_AUTORAL =
  "Questões autorais, elaboradas pela instituição ou por IA e inspiradas em padrões públicos de provas anteriores. Não são questões de provas reais e a IA não garante o conteúdo da prova oficial: use como treino, não como previsão.";

export function papelDoUsuario(): string {
  try { return String(JSON.parse(localStorage.getItem("dentalpos.user") || "null")?.role || "").toUpperCase(); } catch { return ""; }
}
export const ehAluno = () => papelDoUsuario() === "STUDENT";
export const ehGestao = () => ["ADMIN", "OWNER", "RECTOR", "BOARD", "COORDINATOR"].includes(papelDoUsuario());
export const ehDocente = () => ehGestao() || papelDoUsuario() === "TEACHER";

export function AvisoAutoral({ compacto }: { compacto?: boolean }) {
  return (
    <Alert severity="info" icon={false} sx={{ mb: 2, borderRadius: 3, py: compacto ? 0 : undefined }}>
      <Typography variant="body2"><strong>Questões autorais.</strong> {AVISO_AUTORAL}</Typography>
    </Alert>
  );
}

export interface ExameInfo { id: string; codigo: string; nome: string; tipo: string; questoes: number; simulados: number; descritores: number; perfis: number; duracaoMin?: number | null }

/** Carrega os exames do módulo. */
export function useVisao() {
  const r = useApi<any>(`${X}/visao`);
  const exames: ExameInfo[] = r.data?.exames ?? [];
  return { ...r, exames, config: r.data?.config as { revisaoDocenteObrigatoria: boolean; rankingAtivo: boolean } | undefined };
}

export const GRUPOS: Array<[string, (e: ExameInfo) => boolean]> = [
  ["ENADE", (e) => e.tipo === "ENADE"], ["ENAMED", (e) => e.tipo === "ENAMED"], ["OAB", (e) => e.tipo.startsWith("OAB")], ["Outros (residência, concursos)", (e) => !["ENADE", "ENAMED"].includes(e.tipo) && !e.tipo.startsWith("OAB")],
];

export function ExamePicker({ exames, value, onChange, somenteComConteudo, label = "Exame" }: { exames: ExameInfo[]; value: string; onChange: (v: string) => void; somenteComConteudo?: boolean; label?: string }) {
  const lista = useMemo(() => (somenteComConteudo ? exames.filter((e) => e.questoes > 0) : exames), [exames, somenteComConteudo]);
  return (
    <TextField select size="small" label={label} value={lista.some((e) => e.id === value) ? value : ""} onChange={(e) => onChange(e.target.value)} sx={{ minWidth: { xs: "100%", sm: 320 } }}>
      {GRUPOS.flatMap(([g, f]) => {
        const itens = lista.filter(f);
        return itens.length ? [<MenuItem key={g} disabled sx={{ opacity: "1 !important", fontWeight: 800 }}>{g}</MenuItem>, ...itens.map((e) => <MenuItem key={e.id} value={e.id}>{e.nome}{e.questoes ? ` · ${e.questoes} questões` : ""}</MenuItem>)] : [];
      })}
    </TextField>
  );
}

export const Pct = ({ v }: { v: number | null | undefined }) => <>{fmtPct(v)}</>;

export function SelinhoIA({ geradaPor, revisada }: { geradaPor?: string | null; revisada?: boolean }) {
  return (
    <Box component="span" sx={{ display: "inline-flex", gap: 0.5, flexWrap: "wrap" }}>
      {geradaPor && geradaPor.startsWith("IA") && <Chip size="small" color="secondary" variant="outlined" label={geradaPor === "IA_SIMULADA" ? "Variação simulada" : "Gerada por IA"} />}
      {geradaPor && geradaPor.startsWith("IA") && !revisada && <Chip size="small" color="warning" label="Não revisada" />}
    </Box>
  );
}
