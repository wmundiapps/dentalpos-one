import { Box, Chip, Paper, Typography } from "@mui/material";
import { Loadable, Section, StatusChip, useAsync } from "../kit";
import { get } from "./util";

// Recorte do Brasil que cobre PR, SP, MS e MT (e arredores). Projeção simples (equiretangular) — suficiente para posicionar os polos.
const LNG: [number, number] = [-62, -43];
const LAT: [number, number] = [-27, -9];
const W = 760, H = 480;
const px = (lng: number) => ((lng - LNG[0]) / (LNG[1] - LNG[0])) * W;
const py = (lat: number) => ((LAT[1] - lat) / (LAT[1] - LAT[0])) * H;
const COR_UF: Record<string, string> = { PR: "#2563eb", SP: "#16a34a", MS: "#ca8a04", MT: "#dc2626" };

/** Mapa esquemático da rede de polos e lista por cidade, com cursos, vagas e turnos de cada polo. */
export default function MapaPolos({ onAbrirPolo }: { onAbrirPolo: (id: string) => void }) {
  const { data, loading, error } = useAsync(() => get("/mapa"), []);
  return (
    <Loadable loading={loading} error={error}>
      {data ? (
        <>
          <Section title="Mapa da rede" hint="Posição aproximada de cada polo. O tamanho do círculo é proporcional ao número de alunos; a cor indica o estado.">
            <Box sx={{ overflowX: "auto" }}>
              <Box component="svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mapa esquemático dos polos por cidade" sx={{ width: "100%", minWidth: 520, maxWidth: 900, bgcolor: "#f1f5f9", borderRadius: 3, border: "1px solid #cbd5e1" }}>
                {[-60, -55, -50, -45].map((g) => <line key={g} x1={px(g)} x2={px(g)} y1={0} y2={H} stroke="#e2e8f0" />)}
                {[-24, -20, -16, -12].map((g) => <line key={g} y1={py(g)} y2={py(g)} x1={0} x2={W} stroke="#e2e8f0" />)}
                {(data.pontos as any[]).filter((p) => p.latitude != null).map((p) => {
                  const r = 8 + Math.min(22, p.alunos / 1.2);
                  const cor = COR_UF[p.uf] || "#475569";
                  return (
                    <g key={p.id} style={{ cursor: "pointer" }} onClick={() => onAbrirPolo(p.id)}>
                      <circle cx={px(p.longitude)} cy={py(p.latitude)} r={r} fill={cor} fillOpacity={0.28} stroke={cor} strokeWidth={2} />
                      <circle cx={px(p.longitude)} cy={py(p.latitude)} r={4} fill={cor} />
                      <text x={px(p.longitude) + r + 4} y={py(p.latitude) + 4} fontSize="13" fontWeight="700" fill="#0f172a">{p.cidade}/{p.uf}</text>
                    </g>
                  );
                })}
              </Box>
            </Box>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1.5 }}>
              {(data.porUf as any[]).map((u) => <Chip key={u.uf} size="small" label={`${u.uf}: ${u.polos} polo(s)`} sx={{ bgcolor: COR_UF[u.uf] || "#475569", color: "#fff", fontWeight: 700 }} />)}
            </Box>
          </Section>
          <Section title="Polos por cidade" hint="Cursos oferecidos em cada polo, com vagas e turnos.">
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              {(data.cidades as any[]).map((c) => (
                <Paper key={`${c.cidade}-${c.uf}`} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                  <Typography sx={{ fontWeight: 800 }}>{c.cidade}/{c.uf} <Typography component="span" variant="caption" color="text.secondary">· {c.alunos} aluno(s)</Typography></Typography>
                  {(c.itens as any[]).map((p) => (
                    <Box key={p.id} sx={{ mt: 1 }}>
                      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, cursor: "pointer", textDecoration: "underline" }} onClick={() => onAbrirPolo(p.id)}>{p.nome}</Typography>
                        <StatusChip v={p.status} />
                        <Typography variant="caption" color="text.secondary">Coord.: {p.responsavel || "—"}{p.telefone ? ` · ${p.telefone}` : ""}</Typography>
                      </Box>
                      <Box sx={{ display: "flex", gap: 0.6, flexWrap: "wrap", mt: 0.5 }}>
                        {p.cursos.map((cu: any) => <Chip key={cu.programId} size="small" variant="outlined" label={`${cu.nome} · ${cu.vagas} vagas · ${cu.turnos.join("/") || "—"}`} />)}
                        {!p.cursos.length ? <Typography variant="caption" color="text.secondary">Nenhum curso ofertado ainda.</Typography> : null}
                      </Box>
                    </Box>
                  ))}
                </Paper>
              ))}
              {!(data.cidades as any[]).length ? <Typography color="text.secondary">Nenhum polo cadastrado.</Typography> : null}
            </Box>
          </Section>
        </>
      ) : null}
    </Loadable>
  );
}
