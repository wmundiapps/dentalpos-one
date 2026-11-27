import { Alert, Box, Chip, MenuItem, Paper, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { Feedback, Progress, fmtNum, useLoad } from "../secretaria/util";
import { sid } from "./comum";

const COR: Record<string, { bg: string; bd: string; txt: string; rot: string }> = {
  APROVADA: { bg: "#E8F5E9", bd: "#2E7D32", txt: "#1B5E20", rot: "Aprovada" },
  CURSANDO: { bg: "#E3F2FD", bd: "#1565C0", txt: "#0D47A1", rot: "Cursando" },
  REPROVADA: { bg: "#FDECEA", bd: "#C62828", txt: "#B71C1C", rot: "Reprovada" },
  BLOQUEADA: { bg: "#F3F4F6", bd: "#9CA3AF", txt: "#4B5563", rot: "Bloqueada por pré-requisito" },
  PENDENTE: { bg: "#FFF8E1", bd: "#F9A825", txt: "#8D6E00", rot: "Pendente" },
};

/** Fluxograma curricular: períodos (semestre/bimestre/módulo/ano) em colunas, com status e pré-requisitos de cada disciplina. */
export default function PortalFluxograma({ studentId }: { studentId?: string | null }) {
  const [prog, setProg] = useState("");
  const { data, loading, error, reload } = useLoad<any>(`/portal2/aluno/fluxograma${sid(studentId)}${prog ? `${studentId ? "&" : "?"}programId=${prog}` : ""}`);
  const [foco, setFoco] = useState<string | null>(null);
  const fx = data?.fluxograma;
  const todas: any[] = fx ? fx.periodos.flatMap((p: any) => p.disciplinas) : [];
  const focada = todas.find((d) => d.disciplineId === foco);
  const relacionadas = new Set<string>(focada ? [focada.disciplineId, ...focada.preRequisitos.map((p: any) => p.disciplineId), ...todas.filter((d) => d.preRequisitos.some((p: any) => p.disciplineId === focada.disciplineId)).map((d) => d.disciplineId)] : []);
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {data && !fx && <Alert severity="info">Você ainda não tem matrícula em um curso com matriz curricular.</Alert>}
      {fx && (
        <>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
              <Box sx={{ flex: 1, minWidth: 220 }}>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>{fx.programa.nome}</Typography>
                <Typography variant="body2" color="text.secondary">{fx.resumo.aprovadas} aprovada(s) · {fx.resumo.cursando} cursando · {fx.resumo.pendentes} pendente(s){fx.resumo.reprovadas ? ` · ${fx.resumo.reprovadas} reprovada(s)` : ""} · {fx.resumo.chCumprida}h de {fx.resumo.chTotal}h ({fx.resumo.percentual}%)</Typography>
                <Progress value={fx.resumo.percentual} color="success" />
              </Box>
              {(data.programas || []).length > 1 && (
                <TextField select size="small" label="Curso" value={prog || fx.programa.id} onChange={(e) => setProg(e.target.value)} sx={{ minWidth: 220 }}>
                  {data.programas.map((p: any) => <MenuItem key={p.id} value={p.id}>{p.nome}</MenuItem>)}
                </TextField>
              )}
            </Box>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1.5 }}>
              {Object.entries(COR).map(([k, c]) => <Chip key={k} size="small" label={c.rot} sx={{ bgcolor: c.bg, color: c.txt, border: `1px solid ${c.bd}`, fontWeight: 700 }} />)}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>Toque em uma disciplina para destacar seus pré-requisitos e as disciplinas que dependem dela. Períodos de {fx.config.rotuloPeriodo}, agrupados por ano.</Typography>
          </Paper>
          <Box sx={{ overflowX: "auto", pb: 1 }} role="region" aria-label="Fluxograma curricular">
            {fx.anos.map((ano: any) => (
              <Box key={ano.ano} sx={{ mb: 2 }}>
                <Typography sx={{ fontWeight: 800, mb: 0.75 }}>{ano.rotulo}</Typography>
                <Box sx={{ display: "flex", gap: 1.5, alignItems: "stretch" }}>
                  {fx.periodos.filter((p: any) => ano.periodos.includes(p.periodo)).map((p: any) => (
                    <Box key={p.periodo} sx={{ minWidth: { xs: 200, sm: 230 }, flex: "1 0 200px", display: "grid", gap: 1, alignContent: "start" }}>
                      <Typography variant="overline" sx={{ fontWeight: 800 }}>{p.rotulo}</Typography>
                      {p.disciplinas.map((d: any) => {
                        const c = COR[d.status];
                        const apagada = foco && !relacionadas.has(d.disciplineId);
                        return (
                          <Box key={d.disciplineId} component="button" type="button" onClick={() => setFoco(foco === d.disciplineId ? null : d.disciplineId)}
                            aria-label={`${d.nome}: ${c.rot}`} aria-pressed={foco === d.disciplineId}
                            sx={{ textAlign: "left", cursor: "pointer", font: "inherit", p: 1.25, borderRadius: 2, bgcolor: c.bg, color: c.txt, border: `2px solid ${foco === d.disciplineId ? "#111827" : c.bd}`, opacity: apagada ? 0.3 : 1, transition: "opacity .15s" }}>
                            <Typography variant="body2" sx={{ fontWeight: 800, lineHeight: 1.2 }}>{d.nome}</Typography>
                            <Typography variant="caption">{d.cargaHoraria}h · {c.rot}{d.mediaFinal != null ? ` · média ${fmtNum(d.mediaFinal)}` : ""}</Typography>
                            {d.status === "BLOQUEADA" && <Typography variant="caption" sx={{ display: "block" }}>Falta: {d.bloqueadaPor.join(", ")}</Typography>}
                          </Box>
                        );
                      })}
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
          {focada && (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Typography sx={{ fontWeight: 800 }}>{focada.nome}</Typography>
              <Typography variant="body2">Pré-requisitos: {focada.preRequisitos.length ? focada.preRequisitos.map((p: any) => `${p.nome} ${p.cumprido ? "✔" : "✖"}`).join(" · ") : "nenhum"}.</Typography>
              <Typography variant="body2">Libera: {todas.filter((d) => d.preRequisitos.some((p: any) => p.disciplineId === focada.disciplineId)).map((d) => d.nome).join(", ") || "nenhuma disciplina"}.</Typography>
            </Paper>
          )}
        </>
      )}
    </Box>
  );
}
