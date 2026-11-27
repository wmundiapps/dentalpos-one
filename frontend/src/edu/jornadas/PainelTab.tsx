import { Alert, Box, Button, Chip, LinearProgress, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import { Loadable, PERSONAS, fmtData, papelLabel, useAsync } from "./common";

function Card({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, minWidth: 150, flex: "1 1 150px", borderLeft: `5px solid ${color || "#2563eb"}` }}>
      <Typography variant="h4" sx={{ fontWeight: 800 }}>{value}</Typography>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
    </Paper>
  );
}

function Section({ title, children, hint }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4, mb: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 800 }}>{title}</Typography>
      {hint ? <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{hint}</Typography> : null}
      {children}
    </Paper>
  );
}

/** Painel de gargalos, atrasos por responsável, funil da jornada e pessoas com etapas atrasadas. */
export default function PainelTab({ templateId }: { templateId: string }) {
  const resumo = useAsync(() => eduApi.get("/jornadas/painel/resumo"), []);
  const garg = useAsync(() => eduApi.get(`/jornadas/painel/gargalos${qsOf({ templateId })}`), [templateId]);
  const atrasos = useAsync(() => eduApi.get("/jornadas/painel/atrasos-responsavel"), []);
  const funil = useAsync(() => (templateId ? eduApi.get(`/jornadas/painel/funil${qsOf({ templateId })}`) : Promise.resolve(null)), [templateId]);
  const onde = useAsync(() => eduApi.get("/jornadas/painel/onde-estao?atrasadas=true&pageSize=30"), []);
  const [msg, setMsg] = useState<{ t: "success" | "error"; s: string } | null>(null);

  async function processar() {
    try { const r = await eduApi.post("/jornadas/processar-atrasos", {}); setMsg({ t: "success", s: `Detector executado: ${JSON.stringify(r)}` }); atrasos.reload(); garg.reload(); onde.reload(); resumo.reload(); }
    catch (e: any) { setMsg({ t: "error", s: e.message }); }
  }

  const r = resumo.data;
  const sum = (o?: Record<string, number>) => Object.values(o || {}).reduce((a, b) => a + b, 0);
  const gl: any[] = Array.isArray(garg.data) ? garg.data : [];
  const maxMedio = Math.max(1, ...gl.map((g) => g.tempoMedioDias || 0));
  const fl: any[] = funil.data?.funil || [];
  const maxF = Math.max(1, ...fl.map((f) => f.alcancaram));
  const al: any[] = Array.isArray(atrasos.data) ? atrasos.data : [];
  const ondeItems: any[] = onde.data?.items || [];

  return (
    <Box>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2, alignItems: "stretch" }}>
        <Loadable loading={resumo.loading} error={resumo.error}>
          <Card label="Jornadas ativas" value={r?.instancias?.ATIVA ?? 0} />
          <Card label="Concluídas" value={r?.instancias?.CONCLUIDA ?? 0} color="#16a34a" />
          <Card label="Etapas abertas" value={sum(r?.etapasAbertas)} color="#ca8a04" />
          <Card label="Etapas atrasadas" value={r?.etapasAbertas?.ATRASADA ?? 0} color="#dc2626" />
        </Loadable>
      </Box>
      {r?.ativasPorPersona && Object.keys(r.ativasPorPersona).length ? (
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
          {Object.entries(r.ativasPorPersona).map(([k, v]) => <Chip key={k} label={`${PERSONAS.find((p) => p.value === k)?.label || k}: ${v}`} />)}
          <Button size="small" onClick={processar}>Processar atrasos agora</Button>
        </Box>
      ) : <Box sx={{ mb: 2 }}><Button size="small" onClick={processar}>Processar atrasos agora</Button></Box>}
      {msg ? <Alert severity={msg.t} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.s}</Alert> : null}

      <Section title="Gargalos" hint="Etapas com mais atrasos, filas abertas e maior tempo médio de conclusão (jornada selecionada, ou todas se nenhuma).">
        <Loadable loading={garg.loading} error={garg.error}>
          {gl.length ? (
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead><TableRow><TableCell>Etapa</TableCell><TableCell>Papel</TableCell><TableCell align="right">Abertas</TableCell><TableCell align="right">Atrasadas</TableCell><TableCell align="right">Concluídas</TableCell><TableCell sx={{ minWidth: 180 }}>Tempo médio (dias)</TableCell></TableRow></TableHead>
                <TableBody>
                  {gl.slice(0, 15).map((g) => (
                    <TableRow key={g.noChave} hover>
                      <TableCell>{g.titulo}</TableCell><TableCell>{papelLabel(g.papel)}</TableCell>
                      <TableCell align="right">{g.abertas}</TableCell>
                      <TableCell align="right">{g.atrasadas ? <Chip size="small" color="error" label={g.atrasadas} /> : 0}</TableCell>
                      <TableCell align="right">{g.concluidas}</TableCell>
                      <TableCell>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <LinearProgress variant="determinate" value={((g.tempoMedioDias || 0) / maxMedio) * 100} sx={{ flex: 1, height: 8, borderRadius: 4 }} color={g.atrasadas ? "error" : "primary"} />
                          <Typography variant="caption" sx={{ minWidth: 34 }}>{g.tempoMedioDias ?? "—"}</Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          ) : <Typography color="text.secondary">Sem dados de etapas ainda.</Typography>}
        </Loadable>
      </Section>

      <Section title="Funil da jornada" hint="Quantas pessoas já alcançaram cada etapa e quantas estão nela agora.">
        <Loadable loading={funil.loading} error={funil.error}>
          {fl.length ? fl.map((f) => (
            <Box key={f.noChave} sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.7 }}>
              <Typography variant="body2" sx={{ width: { xs: 120, md: 260 }, flexShrink: 0 }} noWrap title={f.titulo}>{f.titulo}</Typography>
              <Box sx={{ flex: 1, position: "relative", height: 20, bgcolor: "action.hover", borderRadius: 1 }}>
                <Box sx={{ position: "absolute", inset: 0, width: `${(f.alcancaram / maxF) * 100}%`, bgcolor: "primary.main", opacity: 0.35, borderRadius: 1 }} />
                <Box sx={{ position: "absolute", inset: 0, width: `${(f.agoraAqui / maxF) * 100}%`, bgcolor: "primary.main", borderRadius: 1 }} />
              </Box>
              <Typography variant="caption" sx={{ width: 90, textAlign: "right" }}>{f.alcancaram} · {f.agoraAqui} agora</Typography>
            </Box>
          )) : <Typography color="text.secondary">{templateId ? "Sem instâncias nesta jornada." : "Selecione uma jornada."}</Typography>}
        </Loadable>
      </Section>

      <Section title="Atrasos por responsável" hint="Quem acumula mais etapas vencidas.">
        <Loadable loading={atrasos.loading} error={atrasos.error}>
          {al.length ? (
            <Table size="small">
              <TableHead><TableRow><TableCell>Papel</TableCell><TableCell>Responsável</TableCell><TableCell align="right">Abertas</TableCell><TableCell align="right">Atrasadas</TableCell><TableCell align="right">Maior atraso (dias)</TableCell></TableRow></TableHead>
              <TableBody>{al.slice(0, 15).map((a, i) => (
                <TableRow key={i} hover><TableCell>{papelLabel(a.papel)}</TableCell><TableCell>{a.responsavelUserId ? a.responsavelUserId.slice(0, 8) : "Fila do papel"}</TableCell>
                  <TableCell align="right">{a.abertas}</TableCell><TableCell align="right">{a.atrasadas ? <Chip size="small" color="error" label={a.atrasadas} /> : 0}</TableCell><TableCell align="right">{a.maxDiasAtraso}</TableCell></TableRow>
              ))}</TableBody>
            </Table>
          ) : <Typography color="text.secondary">Nenhuma etapa aberta.</Typography>}
        </Loadable>
      </Section>

      <Section title="Pessoas com etapas atrasadas">
        <Loadable loading={onde.loading} error={onde.error}>
          {ondeItems.length ? (
            <Table size="small">
              <TableHead><TableRow><TableCell>Pessoa</TableCell><TableCell>Jornada</TableCell><TableCell>Etapa atrasada</TableCell><TableCell>Prazo</TableCell></TableRow></TableHead>
              <TableBody>{ondeItems.map((o) => (
                <TableRow key={o.instanciaId} hover><TableCell>{o.personNome || o.personId}</TableCell><TableCell>{o.jornada}</TableCell>
                  <TableCell>{(o.etapasAtuais || []).map((e: any) => `${e.titulo} (${papelLabel(e.papel)})`).join("; ")}</TableCell>
                  <TableCell>{fmtData(o.etapasAtuais?.[0]?.prazoEm)}</TableCell></TableRow>
              ))}</TableBody>
            </Table>
          ) : <Typography color="text.secondary">Nada atrasado.</Typography>}
        </Loadable>
      </Section>
    </Box>
  );
}
