import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Tab, Tabs, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import {
  DataList, EduApiError, FormDialog, Kpi, KpiRow, LoadBox, Pick, Section, Status, abrirHtml, call, eduApi, itemsOf, label, qsOf, useApi, useIsMobile, useRunner, useToast, type Opt, Flag,
  DIAS, DIAS_CURTO, NIVEL_ROTULO, TURNO_ROTULO, hhmm, toMin,
} from "./kit";

const NIVEIS: Opt[] = [{ value: "GRADUACAO", label: "Graduação" }, { value: "POS", label: "Pós-graduação" }, { value: "LIVRE", label: "Cursos livres" }, { value: "TECNICO", label: "Técnico" }];
const TURNOS: Opt[] = [{ value: "MANHA", label: "Manhã" }, { value: "TARDE", label: "Tarde" }, { value: "NOITE", label: "Noite" }, { value: "FIM_DE_SEMANA", label: "Finais de semana" }, { value: "INTEGRAL", label: "Integral" }];
const COR_TURNO: Record<string, string> = { MANHA: "#e0a100", TARDE: "#e07b00", NOITE: "#4f46e5", FIM_DE_SEMANA: "#0d9488", INTEGRAL: "#64748b" };

export default function SalasPage() {
  const [termId, setTermId] = useState("");
  const [tab, setTab] = useState(0);
  const [rev, setRev] = useState(0);
  const { toast, node } = useToast();
  const terms = useApi<any>("/academico/terms");
  const lt = Array.isArray(terms.data) ? terms.data : itemsOf(terms.data);
  useEffect(() => { if (!termId && lt.length) setTermId(lt.find((t: any) => t.codigo?.startsWith(String(new Date().getFullYear())))?.id ?? lt[0].id); }, [lt, termId]);
  const reload = () => setRev((x) => x + 1);
  const T = ["Fluxograma e avisos", "Cronograma", "Alocar com sugestões", "Conflitos", "Agenda e calendário", "Turnos e turmas"];
  return (
    <Box>
      {node}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2, display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <Pick label="Período letivo" value={termId} onChange={setTermId} minWidth={200} options={lt.map((t: any) => ({ value: t.id, label: t.codigo }))} />
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 220 }}>Os horários ficam na grade do módulo Calendário: qualquer alteração aparece nos dois lugares e respeita feriados e recessos do calendário acadêmico.</Typography>
      </Paper>
      {!termId ? <Alert severity="info">Cadastre um período letivo para organizar salas e horários.</Alert> : (
        <>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>{T.map((t) => <Tab key={t} label={t} />)}</Tabs>
          {tab === 0 && <Fluxograma termId={termId} rev={rev} reload={reload} toast={toast} />}
          {tab === 1 && <Cronograma termId={termId} rev={rev} reload={reload} toast={toast} />}
          {tab === 2 && <Alocar termId={termId} rev={rev} reload={reload} toast={toast} />}
          {tab === 3 && <Conflitos termId={termId} rev={rev} />}
          {tab === 4 && <Agenda termId={termId} />}
          {tab === 5 && <TurnosTurmas termId={termId} rev={rev} reload={reload} toast={toast} />}
        </>
      )}
    </Box>
  );
}

type Toast = (m: { type: "success" | "error" | "info"; text: string }) => void;

/** Grade semanal de um conjunto de aulas: tabela no desktop; lista por dia no celular. */
function GradeSemanal({ slots, onRemove }: { slots: any[]; onRemove?: (s: any) => void }) {
  const mobile = useIsMobile();
  const dias = [1, 2, 3, 4, 5, 6, 7].filter((d) => slots.some((s) => s.diaSemana === d));
  const faixas = [...new Set(slots.map((s) => `${s.inicioMin}-${s.fimMin}`))].sort((a, b) => Number(a.split("-")[0]) - Number(b.split("-")[0]));
  const cel = (s: any) => (
    <Box key={s.id} sx={{ p: 0.8, mb: 0.6, borderRadius: 1.5, bgcolor: s.conflito ? "#fde8e8" : "action.hover", borderLeft: `4px solid ${s.conflito ? "#d64545" : COR_TURNO[s.turno] ?? "#64748b"}` }}>
      <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{s.disciplina ?? s.turma}</Typography>
      <Typography variant="caption" color="text.secondary" component="div">{s.turma} · {s.sala ?? "sem sala"}{s.professor ? ` · ${s.professor}` : ""}</Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
        {mobile && <Chip size="small" label={s.horario} />}{s.conflito && <Chip size="small" color="error" label="conflito" />}{s.nivel !== "GRADUACAO" && <Chip size="small" variant="outlined" label={NIVEL_ROTULO[s.nivel] ?? s.nivel} />}
        {onRemove && <Button size="small" color="error" onClick={() => onRemove(s)} sx={{ minWidth: 0, p: 0.2 }}>remover</Button>}
      </Box>
    </Box>
  );
  if (mobile) return <Box>{dias.map((d) => <Box key={d} sx={{ mb: 1.5 }}><Typography sx={{ fontWeight: 800 }}>{DIAS[d]}</Typography>{slots.filter((s) => s.diaSemana === d).sort((a, b) => a.inicioMin - b.inicioMin).map(cel)}</Box>)}</Box>;
  return (
    <Box sx={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
        <thead><tr><th style={{ border: "1px solid #cbd5e1", padding: 6, background: "#eef2f7", width: 90 }}>Horário</th>{dias.map((d) => <th key={d} style={{ border: "1px solid #cbd5e1", padding: 6, background: "#eef2f7" }}>{DIAS[d]}</th>)}</tr></thead>
        <tbody>{faixas.map((f) => { const [i, e] = f.split("-").map(Number); return (
          <tr key={f}><td style={{ border: "1px solid #cbd5e1", padding: 6, fontWeight: 700, whiteSpace: "nowrap" }}>{hhmm(i)}–{hhmm(e)}</td>{dias.map((d) => <td key={d} style={{ border: "1px solid #cbd5e1", padding: 6, verticalAlign: "top", minWidth: 150 }}>{slots.filter((s) => s.diaSemana === d && s.inicioMin === i && s.fimMin === e).map(cel)}</td>)}</tr>
        ); })}</tbody>
      </table>
    </Box>
  );
}

function Cronograma({ termId, rev, reload, toast }: { termId: string; rev: number; reload: () => void; toast: Toast }) {
  const [visao, setVisao] = useState("sala");
  const [nivel, setNivel] = useState("");
  const [turno, setTurno] = useState("");
  const run = useRunner(toast, reload);
  const d = useApi<any>(`/academico/salas/cronograma?${qsOf({ termId, visao, nivel, turno })}`, [rev]);
  const r = d.data;
  return (
    <Section title="Cronograma de salas, turmas e professores" actions={<Button size="small" variant="outlined" onClick={() => run(() => abrirHtml(`/academico/salas/imprimir?${qsOf({ termId, visao: visao === "sala" || visao === "turma" || visao === "professor" ? visao : "sala", nivel, turno })}`))}>Imprimir / PDF</Button>}>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
        <Pick label="Visão" value={visao} onChange={setVisao} minWidth={170} options={[{ value: "sala", label: "Por sala" }, { value: "turma", label: "Por turma" }, { value: "professor", label: "Por professor" }, { value: "dia", label: "Por dia" }, { value: "turno", label: "Por turno" }, { value: "curso", label: "Por curso" }]} />
        <Pick label="Nível" value={nivel} onChange={setNivel} all="Todos" minWidth={170} options={NIVEIS} />
        <Pick label="Turno" value={turno} onChange={setTurno} all="Todos" minWidth={170} options={TURNOS} />
      </Box>
      {r && <KpiRow>
        <Kpi title="Aulas na grade" value={r.total} />
        {Object.entries(r.resumo.porTurno).map(([k, v]) => <Kpi key={k} title={TURNO_ROTULO[k] ?? k} value={v as number} color={COR_TURNO[k]} />)}
        <Kpi title="Aulas em conflito" value={r.resumo.conflitos} color={r.resumo.conflitos ? "#d64545" : "#2e9e5b"} />
      </KpiRow>}
      {r && <Box sx={{ display: "flex", gap: 0.5, mb: 1.5, flexWrap: "wrap" }}>{Object.entries(r.resumo.porNivel).map(([k, v]) => <Flag key={k} color="primary">{`${NIVEL_ROTULO[k] ?? k}: ${v}`}</Flag>)}</Box>}
      <LoadBox loading={d.loading} error={d.error} empty={!r?.grupos?.length} emptyText="Nenhuma aula alocada neste recorte. Use a aba “Alocar com sugestões”." onRetry={d.reload}>
        {r?.grupos.map((g: any) => (
          <Paper key={g.chave} variant="outlined" sx={{ p: 1.5, mb: 1.5, borderRadius: 3 }}>
            <Typography sx={{ fontWeight: 800, mb: 1 }}>{g.rotulo} <Typography component="span" variant="caption" color="text.secondary">({g.slots.length} aula(s))</Typography></Typography>
            <GradeSemanal slots={g.slots} onRemove={(s) => run(() => call("DELETE", `/academico/salas/slots/${s.id}`), "Aula removida da grade.", "Remover esta aula da grade?")} />
          </Paper>
        ))}
      </LoadBox>
    </Section>
  );
}

function Alocar({ termId, rev, reload, toast }: { termId: string; rev: number; reload: () => void; toast: Toast }) {
  const turmas = useApi<any>(`/academico/salas/turmas?termId=${termId}`, [rev]);
  const [turmaId, setTurmaId] = useState("");
  const [dur, setDur] = useState("100");
  const [turno, setTurno] = useState("");
  const [dias, setDias] = useState<number[]>([]);
  const [sug, setSug] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [conf, setConf] = useState<null | { corpo: any; conflitos: any[] }>(null);
  const t = itemsOf(turmas.data).find((x: any) => x.id === turmaId);
  const sugerir = async () => {
    setBusy(true); setSug(null);
    try { setSug(await eduApi.post("/academico/salas/sugerir", { termId, classSectionId: turmaId, duracaoMin: Number(dur) || 100, ...(turno ? { turno } : {}), ...(dias.length ? { dias } : {}), limite: 12 })); }
    catch (e: any) { toast({ type: "error", text: e.message }); } finally { setBusy(false); }
  };
  const alocar = async (corpo: any, forcar = false) => {
    try { await eduApi.post("/academico/salas/alocar", { ...corpo, forcar }); toast({ type: "success", text: forcar ? "Aula alocada com conflito registrado." : "Aula alocada na grade." }); setConf(null); reload(); if (turmaId) void sugerir(); }
    catch (e: any) {
      if (e instanceof EduApiError && e.status === 409 && e.data?.conflitos) setConf({ corpo, conflitos: e.data.conflitos });
      else toast({ type: "error", text: e.message });
    }
  };
  return (
    <Section title="Alocação semi-automática">
      <Alert severity="info" sx={{ mb: 2 }}>Escolha a turma e peça sugestões: o sistema só propõe combinações sem choque de sala, professor ou turma, respeitando capacidade, recursos exigidos e a indisponibilidade do professor. Você confirma a alocação.</Alert>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr 1fr" }, gap: 1.5, mb: 1.5 }}>
        <Pick label="Turma" value={turmaId} onChange={(v) => { setTurmaId(v); setSug(null); }} minWidth={0} options={itemsOf(turmas.data).map((x: any) => ({ value: x.id, label: `${x.nome} — ${x.disciplina ?? ""} (${x.alunos} alunos · ${NIVEL_ROTULO[x.nivel] ?? x.nivel})` }))} />
        <TextField size="small" label="Duração da aula (min)" type="number" value={dur} onChange={(e) => setDur(e.target.value)} />
        <Pick label="Turno" value={turno} onChange={setTurno} all={t?.turno ? `Padrão da turma (${TURNO_ROTULO[t.turno] ?? t.turno})` : "Qualquer"} minWidth={0} options={TURNOS} />
      </Box>
      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
        <Typography variant="body2" sx={{ mr: 1 }}>Dias:</Typography>
        {[1, 2, 3, 4, 5, 6, 7].map((d) => <Chip key={d} label={DIAS_CURTO[d]} color={dias.includes(d) ? "primary" : "default"} variant={dias.includes(d) ? "filled" : "outlined"} onClick={() => setDias(dias.includes(d) ? dias.filter((x) => x !== d) : [...dias, d])} />)}
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" disabled={!turmaId || busy} onClick={sugerir}>{busy ? "Calculando…" : "Sugerir horários e salas"}</Button>
        <Button variant="outlined" disabled={!turmaId} onClick={() => setConf({ corpo: { termId, classSectionId: turmaId, diaSemana: 1, inicioMin: 1140, fimMin: 1230, manual: true }, conflitos: [] })}>Alocar manualmente</Button>
      </Box>
      {sug && (
        <Box>
          <Typography sx={{ fontWeight: 800, mb: 1 }}>{sug.sugestoes.length} sugestão(ões) de {sug.totalCandidatas} possíveis para {sug.turma.nome}</Typography>
          {!sug.sugestoes.length && <Alert severity="warning" sx={{ mb: 1 }}>Nenhuma combinação livre. Motivos das recusas: {Object.entries(sug.rejeitadas).filter(([, v]) => (v as number) > 0).map(([k, v]) => `${label(k)} (${v})`).join(", ") || "sem janelas no turno escolhido"}.</Alert>}
          <DataList rows={sug.sugestoes.map((s: any, i: number) => ({ ...s, id: String(i) }))} columns={[
            { label: "Dia", primary: true, render: (s: any) => `${s.dia} ${s.horario}` }, { label: "Sala", render: (s: any) => `${s.sala} (${s.capacidade} lug.)` }, { label: "Turno", render: (s: any) => TURNO_ROTULO[s.turno] ?? s.turno },
            { label: "Pontuação", render: (s: any) => s.score }, { label: "Por quê", render: (s: any) => <span>{s.motivos.join("; ")}{s.avisos.length ? <Typography variant="caption" color="warning.main" component="div">{s.avisos.join("; ")}</Typography> : null}</span> },
          ]} actions={(s: any) => <Button size="small" variant="contained" onClick={() => alocar({ termId, classSectionId: turmaId, spaceId: s.spaceId, diaSemana: s.diaSemana, inicioMin: s.inicioMin, fimMin: s.fimMin })}>Alocar</Button>} />
        </Box>
      )}
      {conf && <AlocacaoDialog termId={termId} base={conf.corpo} conflitos={conf.conflitos} onClose={() => setConf(null)} onSend={alocar} />}
    </Section>
  );
}

function AlocacaoDialog({ termId, base, conflitos, onClose, onSend }: { termId: string; base: any; conflitos: any[]; onClose: () => void; onSend: (b: any, forcar: boolean) => void }) {
  const espacos = useApi<any>("/core/espacos?pageSize=200");
  const [f, setF] = useState({ spaceId: base.spaceId ?? "", diaSemana: String(base.diaSemana ?? 1), ini: hhmm(base.inicioMin ?? 1140), fim: hhmm(base.fimMin ?? 1230), tipoAula: "TEORICA" });
  const corpo = () => ({ termId, classSectionId: base.classSectionId, spaceId: f.spaceId || undefined, diaSemana: Number(f.diaSemana), inicioMin: toMin(f.ini), fimMin: toMin(f.fim), tipoAula: f.tipoAula });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{conflitos.length ? "A alocação gera conflitos" : "Alocar aula"}</DialogTitle>
      <DialogContent dividers>
        {conflitos.length > 0 && <Alert severity="error" sx={{ mb: 2 }}>{conflitos.map((c, i) => <div key={i}>• {c.descricao}</div>)}<Typography variant="caption">Ajuste o horário/sala ou, se for exceção consciente, force a alocação (o conflito fica registrado como aberto).</Typography></Alert>}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5, pt: 1 }}>
          <Pick label="Sala" value={f.spaceId} onChange={(v) => setF({ ...f, spaceId: v })} minWidth={0} all="Sem sala (online)" options={itemsOf(espacos.data).map((e: any) => ({ value: e.id, label: `${e.codigo} — ${e.nome} (${e.capacidade})` }))} />
          <Pick label="Dia" value={f.diaSemana} onChange={(v) => setF({ ...f, diaSemana: v })} minWidth={0} options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: String(d), label: DIAS[d] }))} />
          <TextField size="small" type="time" label="Início" value={f.ini} onChange={(e) => setF({ ...f, ini: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="time" label="Fim" value={f.fim} onChange={(e) => setF({ ...f, fim: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <Pick label="Tipo de aula" value={f.tipoAula} onChange={(v) => setF({ ...f, tipoAula: v })} minWidth={0} options={[{ value: "TEORICA", label: "Teórica" }, { value: "PRATICA", label: "Prática" }, { value: "ONLINE", label: "Online" }]} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        {conflitos.length > 0 && <Button color="warning" onClick={() => onSend(corpo(), true)}>Forçar mesmo assim</Button>}
        <Button variant="contained" onClick={() => onSend(corpo(), false)}>Verificar e alocar</Button>
      </DialogActions>
    </Dialog>
  );
}

function Conflitos({ termId, rev }: { termId: string; rev: number }) {
  const d = useApi<any>(`/academico/salas/conflitos?termId=${termId}`, [rev]);
  const o = useApi<any>(`/academico/salas/ocupacao?termId=${termId}`, [rev]);
  const r = d.data;
  const COR: Record<string, string> = { SALA: "error", PROFESSOR: "error", TURMA: "error", CAPACIDADE: "warning", RECURSO: "warning", TURNO: "info" };
  return (
    <Section title="Conflitos da grade">
      <LoadBox loading={d.loading} error={d.error} onRetry={d.reload}>
        {r && (
          <>
            <KpiRow><Kpi title="Erros" value={r.erros} color={r.erros ? "#d64545" : "#2e9e5b"} /><Kpi title="Total de avisos e erros" value={r.total} />{Object.entries(r.porTipo).map(([k, v]) => <Kpi key={k} title={label(k)} value={v as number} />)}</KpiRow>
            {!r.items.length ? <Alert severity="success">Nenhum conflito de sala, professor, turma, capacidade ou recurso neste período.</Alert> : (
              <DataList rows={r.items.map((c: any, i: number) => ({ ...c, id: String(i) }))} columns={[{ label: "Tipo", primary: true, render: (c: any) => <Chip size="small" color={(COR[c.tipo] ?? "default") as any} label={label(c.tipo)} /> }, { label: "Descrição", render: (c: any) => c.descricao }, { label: "Gravidade", render: (c: any) => <Status value={c.gravidade === "ERRO" ? "CRITICO" : "ATENCAO"} /> }]} />
            )}
          </>
        )}
      </LoadBox>
      <Typography sx={{ fontWeight: 800, mt: 3, mb: 1 }}>Ocupação das salas por turno (carga semanal)</Typography>
      <LoadBox loading={o.loading} error={o.error} empty={!itemsOf(o.data).length} emptyText="Nenhuma sala cadastrada." onRetry={o.reload}>
        <DataList rows={itemsOf(o.data)} columns={[{ label: "Sala", primary: true, render: (s: any) => `${s.codigo} — ${s.nome}` }, { label: "Capacidade", render: (s: any) => s.capacidade }, ...(o.data?.turnos ?? []).map((t: any) => ({ label: t.nome, render: (s: any) => { const x = s.turnos[t.codigo]; return <Chip size="small" label={`${x?.pct ?? 0}%`} sx={{ bgcolor: (x?.pct ?? 0) > 85 ? "#fde8e8" : (x?.pct ?? 0) > 0 ? "#e8f3ec" : undefined }} />; } }))]} />
      </LoadBox>
    </Section>
  );
}

function Agenda({ termId }: { termId: string }) {
  const hoje = new Date();
  const [de, setDe] = useState(hoje.toISOString().slice(0, 10));
  const ate = useMemo(() => new Date(new Date(de + "T12:00:00").getTime() + 13 * 86_400_000).toISOString().slice(0, 10), [de]);
  const d = useApi<any>(`/academico/salas/agenda?${qsOf({ termId, de, ate })}`);
  const r = d.data;
  return (
    <Section title="Agenda integrada (aulas + calendário acadêmico)">
      <Box sx={{ display: "flex", gap: 1.5, mb: 2, alignItems: "center", flexWrap: "wrap" }}>
        <TextField size="small" type="date" label="A partir de" value={de} onChange={(e) => setDe(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <Typography variant="body2" color="text.secondary">Mostra 14 dias. Aulas em dias de feriado/recesso aparecem como suspensas.</Typography>
      </Box>
      <LoadBox loading={d.loading} error={d.error} empty={!r?.ocorrencias?.length && !r?.eventos?.length} emptyText="Sem aulas nem eventos neste intervalo." onRetry={d.reload}>
        {r?.eventos?.length > 0 && <Box sx={{ mb: 2 }}>{r.eventos.map((e: any) => <Alert key={e.id} severity={e.bloqueiaAulas ? "warning" : "info"} sx={{ mb: 0.5 }}>{new Date(e.inicio).toLocaleDateString("pt-BR")} — {e.titulo}{e.bloqueiaAulas ? " (sem aulas)" : ""}</Alert>)}</Box>}
        <DataList rows={(r?.ocorrencias ?? []).map((o: any, i: number) => ({ ...o, id: o.slotId + o.data + i }))} columns={[
          { label: "Data", primary: true, render: (o: any) => `${new Date(o.data + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })} ${o.horario}` }, { label: "Disciplina", render: (o: any) => o.disciplina }, { label: "Turma", render: (o: any) => o.turma },
          { label: "Sala", render: (o: any) => o.sala ?? "—" }, { label: "Professor", render: (o: any) => o.professor ?? "—" }, { label: "Situação", render: (o: any) => (o.suspensa ? <Chip size="small" color="warning" label={`Suspensa: ${o.motivoSuspensao}`} /> : <Chip size="small" color="success" variant="outlined" label="Prevista" />) },
        ]} />
      </LoadBox>
    </Section>
  );
}

function TurnosTurmas({ termId, rev, reload, toast }: { termId: string; rev: number; reload: () => void; toast: Toast }) {
  const tn = useApi<any>("/academico/salas/turnos", [rev]);
  const tm = useApi<any>(`/academico/salas/turmas?termId=${termId}`, [rev]);
  const [edT, setEdT] = useState<any>(null);
  const [edM, setEdM] = useState<any>(null);
  return (
    <Box>
      <Section title="Turnos (manhã, tarde, noite e finais de semana)">
        <LoadBox loading={tn.loading} error={tn.error} onRetry={tn.reload}>
          <DataList rows={itemsOf(tn.data).map((t: any) => ({ ...t, id: t.codigo }))} columns={[{ label: "Turno", primary: true, render: (t: any) => <span><b>{t.nome}</b> {t.padrao ? <Flag>padrão</Flag> : <Flag color="info">personalizado</Flag>}</span> }, { label: "Horário", render: (t: any) => `${hhmm(t.inicioMin)}–${hhmm(t.fimMin)}` }, { label: "Dias", render: (t: any) => t.dias.map((d: number) => DIAS_CURTO[d]).join(", ") }]}
            actions={(t: any) => <Button size="small" onClick={() => setEdT({ codigo: t.codigo, nome: t.nome, ini: hhmm(t.inicioMin), fim: hhmm(t.fimMin), dias: t.dias.join(",") })}>Editar</Button>} />
        </LoadBox>
      </Section>
      <Section title="Turmas: nível, turno e recursos exigidos">
        <LoadBox loading={tm.loading} error={tm.error} empty={!itemsOf(tm.data).length} emptyText="Nenhuma turma neste período." onRetry={tm.reload}>
          <DataList rows={itemsOf(tm.data)} columns={[{ label: "Turma", primary: true, render: (x: any) => `${x.nome}${x.disciplina ? " — " + x.disciplina : ""}` }, { label: "Nível", render: (x: any) => NIVEL_ROTULO[x.nivel] ?? x.nivel }, { label: "Turno", render: (x: any) => (x.turno ? TURNO_ROTULO[x.turno] : "—") }, { label: "Alunos", render: (x: any) => x.alunos }, { label: "Aulas/semana", render: (x: any) => `${x.aulasAlocadas} (${Math.round(x.minutosSemana / 60 * 10) / 10}h)` }, { label: "Recursos", render: (x: any) => x.recursosExigidos.join(", ") || "—" }]}
            actions={(x: any) => <Button size="small" onClick={() => setEdM({ id: x.id, nivel: x.nivel ?? "GRADUACAO", turno: x.turno ?? "NOITE", alunosEstimados: x.alunos, recursosExigidos: (x.recursosExigidos ?? []).join(", ") })}>Definir</Button>} />
        </LoadBox>
      </Section>
      <FormDialog open={!!edT} title="Editar turno" maxWidth="sm" fields={[{ key: "nome", label: "Nome", required: true }, { key: "ini", label: "Início (hh:mm)", required: true }, { key: "fim", label: "Fim (hh:mm)", required: true }, { key: "dias", label: "Dias (1=seg ... 7=dom, separados por vírgula)", required: true }]} initial={edT ?? {}} onClose={() => setEdT(null)}
        onSubmit={async (b) => { await call("PUT", `/academico/salas/turnos/${edT.codigo}`, { nome: b.nome, inicioMin: toMin(b.ini), fimMin: toMin(b.fim), dias: String(b.dias).split(",").map((x) => Number(x.trim())).filter((x) => x >= 1 && x <= 7) }); toast({ type: "success", text: "Turno salvo." }); reload(); }} />
      <FormDialog open={!!edM} title="Perfil da turma" maxWidth="sm" fields={[{ key: "nivel", label: "Nível", type: "select", options: NIVEIS, required: true }, { key: "turno", label: "Turno", type: "select", options: TURNOS, required: true }, { key: "alunosEstimados", label: "Alunos estimados", type: "number" }, { key: "recursosExigidos", label: "Recursos exigidos", type: "list", helper: "Ex.: Projetor, Bancadas, Ar-condicionado" }]} initial={edM ?? {}} onClose={() => setEdM(null)}
        onSubmit={async (b) => { await call("PUT", `/academico/salas/turmas/${edM.id}/perfil`, b); toast({ type: "success", text: "Perfil salvo." }); reload(); }} />
    </Box>
  );
}

function Fluxograma({ termId, rev, reload, toast }: { termId: string; rev: number; reload: () => void; toast: Toast }) {
  const [turmaId, setTurmaId] = useState("");
  const [semanas, setSemanas] = useState("8");
  const [busy, setBusy] = useState("");
  const [sim, setSim] = useState<any>(null);
  const turmas = useApi<any>(`/academico/salas/turmas?termId=${termId}`, [rev]);
  const f = useApi<any>(`/academico/salas/fluxograma?${qsOf({ termId, semanas, classSectionId: turmaId })}`, [rev]);
  const r = f.data;
  const gerar = async (aplicar: boolean) => {
    setBusy(aplicar ? "aplicar" : "simular");
    try {
      const x: any = await eduApi.post(`/calendario/gerador/${aplicar ? "aplicar" : "simular"}`, { termId, ...(sim?.execucaoId && aplicar ? { execucaoId: sim.execucaoId } : {}) });
      if (aplicar) { toast({ type: "success", text: `Grade gerada: ${x.slotsCriados} aulas alocadas${x.pendencias?.length ? `, ${x.pendencias.length} pendência(s)` : ""}.` }); setSim(null); reload(); f.reload(); }
      else setSim(x);
    } catch (e: any) { toast({ type: "error", text: e.message }); } finally { setBusy(""); }
  };
  const avisar = async () => {
    setBusy("avisar");
    try { const x: any = await eduApi.post("/academico/salas/avisar-alunos", { termId, dias: 7, ...(turmaId ? { classSectionId: turmaId } : {}) }); toast({ type: "success", text: `${x.enviados} aluno(s) avisados (${x.jaAvisados} já tinham o aviso desta semana).` }); }
    catch (e: any) { toast({ type: "error", text: e.message }); } finally { setBusy(""); }
  };
  return (
    <Section title="Fluxograma das aulas e avisos aos alunos">
      <Alert severity="info" sx={{ mb: 2 }}>O fluxograma é montado sozinho a partir das salas, laboratórios, turnos, dias e horários cadastrados: o gerador distribui as aulas sem choque de sala, professor ou turma, e o sistema desenha semana a semana (já descontando feriados e recessos). Cada aluno recebe o aviso das suas aulas.</Alert>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
        <Button variant="outlined" disabled={!!busy} onClick={() => gerar(false)}>{busy === "simular" ? "Simulando…" : "1. Simular geração automática"}</Button>
        <Button variant="contained" disabled={!!busy || !sim} onClick={() => gerar(true)}>{busy === "aplicar" ? "Aplicando…" : "2. Aplicar na grade"}</Button>
        <Button variant="outlined" color="success" disabled={!!busy} onClick={avisar}>{busy === "avisar" ? "Enviando…" : "Avisar alunos das aulas da semana"}</Button>
      </Box>
      {sim && <Alert severity={sim.metricas?.pendentes ? "warning" : "success"} sx={{ mb: 2 }}>Simulação pronta: {sim.metricas?.alocadas} de {sim.metricas?.totalAulas} aulas alocadas{sim.metricas?.pendentes ? `, ${sim.metricas.pendentes} sem horário disponível` : ""}. Nada foi gravado ainda; confira e aplique.</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: 1.5, mb: 2 }}>
        <Pick label="Turma" value={turmaId} onChange={setTurmaId} all="Todas as turmas" minWidth={0} options={itemsOf(turmas.data).map((x: any) => ({ value: x.id, label: `${x.nome} — ${x.disciplina ?? ""}` }))} />
        <Pick label="Semanas à frente" value={semanas} onChange={setSemanas} minWidth={0} options={["4", "8", "12", "20"].map((v) => ({ value: v, label: `${v} semanas` }))} />
      </Box>
      <LoadBox loading={f.loading} error={f.error} empty={!r?.semanas?.length} emptyText="Ainda não há aulas na grade. Use a simulação acima para gerar o fluxograma automaticamente." onRetry={f.reload}>
        <KpiRow>
          <Kpi title="Semanas com aula" value={r?.resumo?.semanas ?? 0} />
          <Kpi title="Aulas no período" value={r?.resumo?.aulas ?? 0} />
          <Kpi title="Aulas práticas (laboratório/clínica)" value={r?.resumo?.aulasPraticas ?? 0} />
        </KpiRow>
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "stretch", mt: 2 }}>
          {(r?.semanas ?? []).map((sm: any, i: number) => (
            <Box key={sm.de} sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              {i > 0 && <Box sx={{ width: 2, height: 22, bgcolor: "primary.main", position: "relative", "&::after": { content: '""', position: "absolute", bottom: -2, left: -4, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "7px solid", borderTopColor: "primary.main" } }} />}
              <Paper variant="outlined" sx={{ width: "100%", p: 1.5, borderRadius: 3, borderColor: "primary.main", mt: i > 0 ? 0.5 : 0 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                  <Typography sx={{ fontWeight: 800 }}>{`Semana ${sm.numero} · ${sm.rotulo}`}</Typography>
                  <Chip size="small" label={`${sm.totalAulas} aula(s)`} />
                </Box>
                {sm.dias.map((d: any) => (
                  <Box key={d.data} sx={{ mb: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{d.rotulo}</Typography>
                    {d.suspenso ? <Alert severity="warning" sx={{ py: 0 }}>Sem aulas: {d.suspenso}</Alert> : d.aulas.map((a: any) => (
                      <Box key={a.slotId + d.data} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", p: 1, mt: 0.5, borderRadius: 2, bgcolor: a.pratica ? "success.50" : "action.hover", borderLeft: 4, borderColor: COR_TURNO[a.turno] ?? "#64748b" }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 92 }}>{a.horario}</Typography>
                        <Typography variant="body2" sx={{ flex: 1, minWidth: 140 }}>{a.disciplina}{a.professor ? ` · ${a.professor}` : ""}</Typography>
                        <Chip size="small" color={a.pratica ? "success" : "default"} label={`${a.pratica ? "Laboratório/clínica · " : ""}${a.sala ?? "Online"}`} />
                      </Box>
                    ))}
                  </Box>
                ))}
              </Paper>
            </Box>
          ))}
        </Box>
      </LoadBox>
    </Section>
  );
}
