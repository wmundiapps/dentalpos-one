import { Box, Chip, LinearProgress, Typography } from "@mui/material";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { StatusChip } from "../EduResourcePage";
import { Card, MiniTable, Section, Semaforo, fmtD, fmtDT, itemsOf, Loadable, useAsync } from "./kit";

const nv = (n?: string) => (n === "CRITICO" || n === "ALTO" ? "critico" : n === "ATENCAO" || n === "MEDIO" ? "atencao" : "ok") as "ok" | "atencao" | "critico";

/** Engajamento no AVA: distribuição de risco, alertas de inatividade e resumos por aluno. */
export default function EngajamentoTab() {
  const [nivel, setNivel] = useState("");
  const res = useAsync(() => eduApi.get("/modalidades/engajamento/resumos"), []);
  const all = itemsOf(res.data);
  const cont = (n: string) => all.filter((r) => r.nivel === n).length;
  const filtrados = nivel ? all.filter((r) => r.nivel === nivel) : all;
  const total = all.length || 1;
  const cores: Record<string, string> = { BAIXO: "#16a34a", MEDIO: "#ca8a04", ALTO: "#ea580c", CRITICO: "#dc2626" };

  return (
    <Box>
      <Section title="Risco de evasão por engajamento" hint="Score de 0 a 100 calculado com último acesso, horas, acessos e tarefas dos últimos 30 dias.">
        <Loadable loading={res.loading} error={res.error}>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>
            {["BAIXO", "MEDIO", "ALTO", "CRITICO"].map((n) => (
              <Box key={n} onClick={() => setNivel(nivel === n ? "" : n)} sx={{ cursor: "pointer", flex: "1 1 150px" }}>
                <Card label={`Risco ${n.toLowerCase()}`} value={cont(n)} color={cores[n]} hint={nivel === n ? "filtro ativo" : "clique para filtrar"} />
              </Box>
            ))}
          </Box>
          <Box sx={{ display: "flex", height: 16, borderRadius: 2, overflow: "hidden", mb: 2, bgcolor: "action.hover" }}>
            {["BAIXO", "MEDIO", "ALTO", "CRITICO"].map((n) => <Box key={n} title={`${n}: ${cont(n)}`} sx={{ width: `${(cont(n) / total) * 100}%`, bgcolor: cores[n] }} />)}
          </Box>
          <Box sx={{ overflowX: "auto" }}>
            <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", "& td, & th": { p: 1, textAlign: "left", borderBottom: 1, borderColor: "divider", fontSize: 14 } }}>
              <thead><tr><th /><th>Aluno (ID)</th><th style={{ minWidth: 140 }}>Score</th><th>Dias sem acesso</th><th>Horas 30d</th><th>Acessos 30d</th><th>Tarefas 30d</th><th>Último acesso</th></tr></thead>
              <tbody>
                {filtrados.slice(0, 100).map((r) => (
                  <tr key={r.id}>
                    <td><Semaforo nivel={nv(r.nivel)} /></td><td>{String(r.studentId).slice(0, 8)}</td>
                    <td><Box sx={{ display: "flex", alignItems: "center", gap: 1 }}><LinearProgress variant="determinate" value={r.score} sx={{ flex: 1, height: 7, borderRadius: 4 }} color={r.score >= 70 ? "error" : r.score >= 40 ? "warning" : "primary"} /><Typography variant="caption">{r.score}</Typography></Box></td>
                    <td>{r.diasSemAcesso >= 999 ? "nunca" : r.diasSemAcesso}</td><td>{r.horas30d}</td><td>{r.acessos30d}</td><td>{r.tarefas30d}</td><td>{fmtD(r.ultimoAcesso)}</td>
                  </tr>
                ))}
                {!filtrados.length && <tr><td colSpan={8}><Typography color="text.secondary" sx={{ py: 2, textAlign: "center" }}>Nenhum resumo calculado ainda. Os resumos são gerados quando os eventos do AVA são registrados.</Typography></td></tr>}
              </tbody>
            </Box>
          </Box>
        </Loadable>
      </Section>
      <Section title="Alertas de inatividade abertos" hint="Gerados pelo job diário para alunos de cursos EAD/semipresenciais.">
        <MiniTable url="/modalidades/engajamento/alertas" empty="Nenhum alerta aberto."
          columns={[
            { label: "Aluno (ID)", render: (r) => String(r.studentId).slice(0, 8) }, { label: "Nível", render: (r) => <StatusChip value={r.nivel} /> },
            { label: "Dias sem acesso", render: (r) => <Chip size="small" label={r.diasSemAcesso} color={r.nivel === "CRITICO" ? "error" : "warning"} /> }, { label: "Aberto em", render: (r) => fmtDT(r.createdAt) },
          ]} />
      </Section>
    </Box>
  );
}
