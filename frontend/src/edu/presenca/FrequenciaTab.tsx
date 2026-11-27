import { Alert, Box, Button, Chip, LinearProgress, MenuItem, TextField, Typography } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import { useEffect, useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import { Async, Panel, Stat, StatGrid, itemsOf, num, useApi } from "../infraestrutura/kit";

export default function FrequenciaTab() {
  const [turmas, setTurmas] = useState<any[]>([]);
  const [turma, setTurma] = useState("");
  const [de, setDe] = useState(new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10));
  const [ate, setAte] = useState(new Date().toISOString().slice(0, 10));
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { eduApi.get("/academico/class-sections").then((r) => { const it = itemsOf(r); setTurmas(it); if (it[0]) setTurma((t) => t || it[0].id); }).catch((e) => setErro(e.message)); }, []);
  const rel = useApi<any>(turma ? `/presenca/relatorios/frequencia${qsOf({ classSectionId: turma, de: `${de}T00:00:00-03:00`, ate: `${ate}T23:59:59-03:00` })}` : null);

  async function csv() {
    const API = (import.meta as any).env?.VITE_API_URL || "http://localhost:3000/api";
    const res = await fetch(`${API}/edu/presenca/relatorios/frequencia${qsOf({ classSectionId: turma, de: `${de}T00:00:00-03:00`, ate: `${ate}T23:59:59-03:00`, formato: "csv" })}`, { headers: { Authorization: `Bearer ${localStorage.getItem("dentalpos.token") || ""}` } });
    if (!res.ok) { setErro(`Erro ${res.status} ao exportar.`); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await res.blob()); a.download = "frequencia.csv"; a.click();
  }
  return (
    <Panel title="Relatório de frequência por turma" subtitle="Consolidado das chamadas encerradas (facial, QR, código e lançamentos manuais)."
      actions={<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <TextField select size="small" label="Turma" sx={{ minWidth: 240 }} value={turma} onChange={(e) => setTurma(e.target.value)}>{turmas.map((t) => <MenuItem key={t.id} value={t.id}>{t.nome} — {t.discipline?.nome}</MenuItem>)}</TextField>
        <TextField size="small" type="date" label="De" value={de} onChange={(e) => setDe(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="date" label="Até" value={ate} onChange={(e) => setAte(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <Button startIcon={<DownloadIcon />} disabled={!turma} onClick={csv}>CSV</Button></Box>}>
      {erro && <Alert severity="warning" sx={{ mb: 1 }} onClose={() => setErro(null)}>{erro}</Alert>}
      {!turma ? <Typography color="text.secondary">Selecione uma turma.</Typography> : (
        <Async state={rel}>
          {(d) => {
            const alunos: any[] = d.alunos || [];
            const media = alunos.filter((a) => a.percentual != null);
            return (
              <Box sx={{ display: "grid", gap: 2 }}>
                <StatGrid><Stat label="Aulas no período" value={d.aulas} /><Stat label="Frequência média" value={media.length ? `${num(media.reduce((s, a) => s + a.percentual, 0) / media.length, 1)}%` : "—"} /><Stat label="Abaixo de 75%" value={media.filter((a) => a.percentual < 75).length} tone={media.some((a) => a.percentual < 75) ? "error" : "success"} /></StatGrid>
                <Box sx={{ overflowX: "auto" }}>
                  <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", "& td, & th": { p: 1, borderBottom: "1px solid", borderColor: "divider", textAlign: "left", fontSize: 14, whiteSpace: "nowrap" } }}>
                    <thead><tr><th>RA</th><th>Aluno</th><th>Aulas</th><th>Presenças</th><th>Atrasos</th><th>Saídas antec.</th><th>Faltas</th><th>Justif.</th><th style={{ minWidth: 160 }}>Frequência</th></tr></thead>
                    <tbody>
                      {alunos.map((a) => (
                        <tr key={a.studentId}>
                          <td>{a.ra}</td><td><b>{a.nome}</b></td><td>{a.aulas}</td><td>{a.presencas}</td><td>{a.atrasos}</td><td>{a.saidasAntecipadas}</td><td>{a.faltas}</td><td>{a.justificadas}</td>
                          <td>{a.percentual == null ? "—" : <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}><LinearProgress variant="determinate" value={a.percentual} color={a.percentual < 75 ? "error" : a.percentual < 85 ? "warning" : "success"} sx={{ flex: 1, height: 8, borderRadius: 4 }} /><Chip size="small" label={`${num(a.percentual, 1)}%`} /></Box>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Box>
                </Box>
              </Box>
            );
          }}
        </Async>
      )}
    </Panel>
  );
}
