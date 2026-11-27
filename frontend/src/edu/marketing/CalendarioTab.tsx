import { Box, Button, Chip, Paper, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useState } from "react";
import { CANAIS, LoadBox, M, ORIGENS, Pick, REDES, Section, Status, fmtDateTime, opts, qstr, useApi } from "./kit";

const COR: Record<string, string> = { CAMPANHA: "#0F5FDB", PUBLICACAO: "#7C3AED", EVENTO: "#2e9e5b", MIDIA_OFFLINE: "#e07b00", DISPARO: "#0891b2" };
const ROT: Record<string, string> = { CAMPANHA: "Campanha", PUBLICACAO: "Publicação", EVENTO: "Evento", MIDIA_OFFLINE: "Mídia offline", DISPARO: "Disparo" };
const dia = (d: Date) => d.toISOString().slice(0, 10);

export default function CalendarioTab() {
  const [visao, setVisao] = useState<"mes" | "semana">("mes");
  const [ref, setRef] = useState(new Date());
  const [canal, setCanal] = useState(""); const [curso, setCurso] = useState(""); const [publico, setPublico] = useState("");
  const l = useApi<any>(`${M}/calendario?${qstr({ visao, data: dia(ref), canal, curso, publico })}`);
  const itens: any[] = l.data?.itens ?? [];
  const ini = l.data?.inicio ? new Date(l.data.inicio) : new Date(ref);
  const n = visao === "mes" ? Math.round((new Date(l.data?.fim ?? ini).getTime() - ini.getTime()) / 86_400_000) : 7;
  const dias = Array.from({ length: n || 7 }, (_, i) => new Date(ini.getTime() + i * 86_400_000));
  const shift = (s: number) => setRef((r) => { const d = new Date(r); if (visao === "mes") d.setUTCMonth(d.getUTCMonth() + s); else d.setUTCDate(d.getUTCDate() + 7 * s); return d; });
  const doDia = (d: Date) => itens.filter((i) => { const a = dia(new Date(i.inicio)); const b = dia(new Date(i.fim ?? i.inicio)); return dia(d) >= a && dia(d) <= b; });
  const titulo = ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <Section title="Calendário de marketing" actions={<ToggleButtonGroup size="small" exclusive value={visao} onChange={(_, v) => v && setVisao(v)}><ToggleButton value="mes">Mês</ToggleButton><ToggleButton value="semana">Semana</ToggleButton></ToggleButtonGroup>}>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2, alignItems: "center" }}>
        <Button onClick={() => shift(-1)}>‹ Anterior</Button><Typography sx={{ fontWeight: 800, textTransform: "capitalize", minWidth: 150, textAlign: "center" }}>{titulo}</Typography><Button onClick={() => shift(1)}>Próximo ›</Button><Button onClick={() => setRef(new Date())}>Hoje</Button>
        <Pick label="Canal" value={canal} onChange={setCanal} options={opts([...ORIGENS, ...CANAIS, ...REDES].filter((v, i, a) => a.indexOf(v) === i))} all="Todos" minWidth={150} />
        <Pick label="Público" value={publico} onChange={setPublico} options={opts(["ENSINO_MEDIO", "PROFISSIONAIS", "EGRESSOS", "ALUNOS", "COMUNIDADE", "EMPRESAS"])} all="Todos" minWidth={150} />
        <input aria-label="Filtrar por curso" placeholder="Curso…" value={curso} onChange={(e) => setCurso(e.target.value)} style={{ padding: 8, borderRadius: 6, border: "1px solid #bbb", minWidth: 120 }} />
      </Box>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>{Object.keys(COR).map((k) => <Chip key={k} size="small" label={ROT[k]} sx={{ bgcolor: COR[k], color: "#fff" }} />)}</Box>
      <LoadBox loading={l.loading} error={l.error} onRetry={l.reload}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(7, 1fr)" }, gap: 0.8 }}>
          {dias.map((d) => {
            const its = doDia(d);
            return (
              <Paper key={dia(d)} variant="outlined" sx={{ p: 0.8, minHeight: { md: visao === "mes" ? 96 : 220 }, borderRadius: 2, bgcolor: dia(d) === dia(new Date()) ? "action.hover" : undefined, display: { xs: its.length ? "block" : "none", md: "block" } }}>
                <Typography variant="caption" sx={{ fontWeight: 800 }}>{d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" })}</Typography>
                {its.slice(0, visao === "mes" ? 3 : 20).map((i) => (
                  <Box key={i.tipo + i.id} title={`${ROT[i.tipo]} · ${i.titulo}`} sx={{ mt: 0.4, px: 0.6, py: 0.2, borderRadius: 1, bgcolor: COR[i.tipo], color: "#fff", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.canal && i.tipo === "PUBLICACAO" ? `${i.canal}: ` : ""}{i.titulo}</Box>
                ))}
                {its.length > 3 && visao === "mes" && <Typography variant="caption" color="text.secondary">+{its.length - 3}</Typography>}
              </Paper>
            );
          })}
        </Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mt: 3, mb: 1 }}>Lista do período</Typography>
        {!itens.length ? <Typography color="text.secondary">Nada planejado neste período.</Typography> : itens.map((i) => (
          <Paper key={i.tipo + i.id} variant="outlined" sx={{ p: 1.2, mb: 1, borderRadius: 2, borderLeft: `5px solid ${COR[i.tipo]}` }}>
            <Typography sx={{ fontWeight: 700 }}>{i.titulo}</Typography>
            <Typography variant="caption" color="text.secondary">{ROT[i.tipo]} · {fmtDateTime(i.inicio)}{i.canal ? ` · ${i.canal}` : ""}{i.responsavel ? ` · ${i.responsavel}` : ""}{i.campanha ? ` · ${i.campanha}` : ""}</Typography>
            {i.orcamentoPrevisto != null && <Typography variant="caption" component="div">Orçamento previsto {Number(i.orcamentoPrevisto).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · realizado {Number(i.orcamentoRealizado).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</Typography>}
            <Status value={i.status} />
          </Paper>
        ))}
      </LoadBox>
    </Section>
  );
}
