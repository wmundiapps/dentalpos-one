import { Alert, Box, Button, Chip, MenuItem, Paper, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import { useEffect, useMemo, useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import { baixarArquivo, Card, DIAS, fmtDT, itemsOf, minToHHMM, Row, useGet, useTerms, useToast } from "./kit";

type Modo = "turma" | "professor" | "espaco";
const CORES = ["#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#db2777", "#65a30d", "#ca8a04", "#4f46e5", "#0d9488"];

export default function GradeTab() {
  const terms = useTerms();
  const [termId, setTermId] = useState("");
  useEffect(() => { if (!termId && terms.length) setTermId(String(terms[0].value)); }, [terms, termId]);
  const [modo, setModo] = useState<Modo>("turma");
  const [alvo, setAlvo] = useState("");
  const { toast, node } = useToast();
  const grade = useGet<any>(termId ? `/calendario/grade${qsOf({ termId })}` : null);
  const malha = useGet<any>("/calendario/horarios?pageSize=100");
  const conflitos = useGet<any>(termId ? `/calendario/grade/conflitos${qsOf({ termId })}` : null);

  const slots: any[] = grade.data?.slots || [];
  const chave = (s: any) => (modo === "turma" ? s.classSectionId : modo === "professor" ? s.professorUserId : s.spaceId);
  const rotulo = (s: any) => (modo === "turma" ? s.turma : modo === "professor" ? s.professor : s.espaco ? `${s.espaco.codigo} — ${s.espaco.nome}` : null) || "—";
  const opcoes = useMemo(() => {
    const m = new Map<string, string>();
    slots.forEach((s) => { const k = chave(s); if (k) m.set(k, rotulo(s)); });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, modo]);
  const filtrados = alvo ? slots.filter((s) => chave(s) === alvo) : [];

  const linhas = useMemo(() => {
    const m = new Map<string, { ini: number; fim: number; nome?: string }>();
    itemsOf(malha.data).filter((h: any) => h.ativo !== false).forEach((h: any) => m.set(`${h.inicioMin}-${h.fimMin}`, { ini: h.inicioMin, fim: h.fimMin, nome: h.nome }));
    filtrados.forEach((s) => { const k = `${s.inicioMin}-${s.fimMin}`; if (!m.has(k)) m.set(k, { ini: s.inicioMin, fim: s.fimMin }); });
    return [...m.values()].sort((a, b) => a.ini - b.ini);
  }, [malha.data, filtrados]);
  const dias = useMemo(() => (filtrados.some((s) => s.diaSemana >= 6) ? [1, 2, 3, 4, 5, 6, 7].filter((d) => d <= 5 || filtrados.some((s) => s.diaSemana === d)) : [1, 2, 3, 4, 5]), [filtrados]);
  const corDisc = useMemo(() => { const m = new Map<string, string>(); slots.forEach((s) => { if (!m.has(s.disciplineId)) m.set(s.disciplineId, CORES[m.size % CORES.length]); }); return m; }, [slots]);

  async function ics() {
    try {
      const p = modo === "turma" ? { turmaId: alvo } : modo === "professor" ? { professorId: alvo } : { espacoId: alvo };
      await baixarArquivo(`/calendario/grade/ics${qsOf({ termId, ...p })}`, "grade-horaria.ics");
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function ignorar(c: any) {
    const motivo = window.prompt("Motivo para ignorar este choque:");
    if (!motivo) return;
    try { await eduApi.post(`/calendario/grade/conflitos/${c.id}/ignorar`, { motivo }); conflitos.reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }

  return (
    <Box>
      <Row>
        <TextField select size="small" label="Período letivo" value={termId} onChange={(e) => { setTermId(e.target.value); setAlvo(""); }} sx={{ minWidth: 240 }}>
          {terms.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
        </TextField>
        <ToggleButtonGroup size="small" exclusive value={modo} onChange={(_, v) => { if (v) { setModo(v); setAlvo(""); } }}>
          <ToggleButton value="turma">Por turma</ToggleButton>
          <ToggleButton value="professor">Por professor</ToggleButton>
          <ToggleButton value="espaco">Por espaço</ToggleButton>
        </ToggleButtonGroup>
        <TextField select size="small" label={modo === "turma" ? "Turma" : modo === "professor" ? "Professor(a)" : "Espaço"} value={alvo} onChange={(e) => setAlvo(e.target.value)} sx={{ minWidth: 280 }} disabled={!opcoes.length}>
          {opcoes.map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
        </TextField>
        <Button startIcon={<DownloadIcon />} disabled={!alvo} onClick={ics}>Exportar .ics</Button>
      </Row>
      {!termId ? <Alert severity="info">Selecione o período letivo para ver a grade horária.</Alert> : null}
      {grade.error ? <Alert severity="warning">Não foi possível carregar a grade: {grade.error}</Alert> : null}
      {termId && !grade.loading && !grade.error && !slots.length ? <Alert severity="info">Nenhuma aula alocada neste período. Use a aba "Gerador" para criar o cronograma.</Alert> : null}
      {slots.length ? <Row><Card label="Aulas na grade" value={slots.length} /><Card label="Choques abertos" value={itemsOf(conflitos.data).length} color={itemsOf(conflitos.data).length ? "#dc2626" : "#16a34a"} /></Row> : null}
      {alvo ? (
        <Paper variant="outlined" sx={{ borderRadius: 3, overflowX: "auto" }}>
          <Box sx={{ display: "grid", gridTemplateColumns: `90px repeat(${dias.length}, minmax(130px, 1fr))`, minWidth: 90 + dias.length * 130 }}>
            <Box sx={{ p: 1, bgcolor: "action.hover" }} />
            {dias.map((d) => <Typography key={d} variant="subtitle2" sx={{ p: 1, bgcolor: "action.hover", textAlign: "center", fontWeight: 800 }}>{DIAS[d]}</Typography>)}
            {linhas.map((l) => (
              <Box key={`${l.ini}-${l.fim}`} sx={{ display: "contents" }}>
                <Box sx={{ p: 1, borderTop: 1, borderColor: "divider", bgcolor: "action.hover" }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, display: "block" }}>{minToHHMM(l.ini)}</Typography>
                  <Typography variant="caption" color="text.secondary">{minToHHMM(l.fim)}</Typography>
                </Box>
                {dias.map((d) => {
                  const cs = filtrados.filter((s) => s.diaSemana === d && s.inicioMin === l.ini && s.fimMin === l.fim);
                  return (
                    <Box key={d} sx={{ p: 0.5, borderTop: 1, borderLeft: 1, borderColor: "divider", minHeight: 62 }}>
                      {cs.map((s) => (
                        <Tooltip key={s.id} title={`${s.disciplina || ""} · ${s.turma || ""} · ${s.professor || "sem professor"} · ${s.espaco ? s.espaco.codigo : s.tipoAula === "ONLINE" ? "Online" : "sem espaço"} · origem: ${s.origem}`}>
                          <Box sx={{ p: 0.6, mb: 0.5, borderRadius: 1.5, bgcolor: corDisc.get(s.disciplineId) || "#2563eb", color: "#fff", fontSize: 12, lineHeight: 1.25 }}>
                            <b>{s.disciplina || "Aula"}</b>
                            <Box sx={{ opacity: 0.9 }}>{modo === "turma" ? s.professor : s.turma}{modo !== "espaco" && s.espaco ? ` · ${s.espaco.codigo}` : modo === "espaco" ? ` · ${s.professor || ""}` : ""}</Box>
                          </Box>
                        </Tooltip>
                      ))}
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        </Paper>
      ) : null}

      {itemsOf(conflitos.data).length ? (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Conflitos abertos</Typography>
          {itemsOf(conflitos.data).slice(0, 50).map((c: any) => (
            <Paper key={c.id} variant="outlined" sx={{ p: 1.5, mb: 1, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", borderLeft: "5px solid #dc2626" }}>
              <Chip size="small" label={String(c.tipo).replace(/_/g, " ")} color="error" />
              <Typography sx={{ flex: 1, minWidth: 220 }} variant="body2">{c.descricao}</Typography>
              <Typography variant="caption" color="text.secondary">{fmtDT(c.detectadoEm)}</Typography>
              <Button size="small" onClick={() => ignorar(c)}>Ignorar</Button>
            </Paper>
          ))}
        </Box>
      ) : conflitos.error ? <Alert severity="info" sx={{ mt: 2 }}>Conflitos indisponíveis: {conflitos.error}</Alert> : null}
      {node}
    </Box>
  );
}
