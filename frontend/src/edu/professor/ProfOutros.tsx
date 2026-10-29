import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, TextField, Typography,
} from "@mui/material";
import { useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import { Empty, Feedback, Progress, Status, fmtDate, fmtDateTime, fmtNum, useLoad } from "../secretaria/util";
import { Kpi } from "../portal/PortalSecoes";
import { DIAS, hhmm, useToast } from "../portal/comum";

/** Painel inicial do professor: pendências, próximas aulas, risco e avaliação docente. */
export function ProfPainel({ onIr }: { onIr: (aba: string) => void }) {
  const { data, loading, error, reload } = useLoad<any>("/portal2/prof/painel");
  const p = data?.pendencias;
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {data && (
        <>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "repeat(2, minmax(0,1fr))", md: "repeat(4, minmax(0,1fr))" } }}>
            <Kpi title="Turmas" value={data.turmas.length} color="#0F5FDB" />
            <Kpi title="Para corrigir" value={p.entregasParaCorrigir} hint="entregas de atividades" color={p.entregasParaCorrigir ? "#ED6C02" : "#2E7D32"} />
            <Kpi title="Revisões de nota" value={p.revisoesDeNota} hint="aguardando parecer" color={p.revisoesDeNota ? "#D32F2F" : "#2E7D32"} />
            <Kpi title="Alunos em risco" value={data.risco.alto + data.risco.medio} hint={`${data.risco.alto} alto · ${data.risco.medio} médio`} color={data.risco.alto ? "#D32F2F" : "#ED6C02"} />
          </Box>
          {(p.aulasSemChamada > 0 || p.justificativasPendentes > 0 || p.topicosNovosNoForum > 0) && (
            <Box sx={{ display: "grid", gap: 1 }}>
              {p.aulasSemChamada > 0 && <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => onIr("turmas")}>Abrir turmas</Button>}>{p.aulasSemChamada} aula(s) já passaram e estão sem chamada.</Alert>}
              {p.justificativasPendentes > 0 && <Alert severity="info" action={<Button color="inherit" size="small" onClick={() => onIr("justificativas")}>Ver</Button>}>{p.justificativasPendentes} justificativa(s) de falta aguardando decisão.</Alert>}
              {p.topicosNovosNoForum > 0 && <Alert severity="info">{p.topicosNovosNoForum} dúvida(s) nova(s) de alunos no fórum esta semana.</Alert>}
            </Box>
          )}
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "repeat(2, minmax(0,1fr))" } }}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Próximas aulas</Typography>
              {!data.proximasAulas.length && <Empty>Nenhuma aula nos próximos 14 dias.</Empty>}
              {data.proximasAulas.map((a: any) => <Typography key={a.id} variant="body2" sx={{ py: 0.25 }}><b>{fmtDateTime(a.inicio)}</b> · {a.disciplina}{a.local ? ` · ${a.local}` : ""}</Typography>)}
            </Paper>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Atenção: alunos em risco de evasão</Typography>
              {!data.risco.top.length && <Empty>Nenhum aluno em risco no momento.</Empty>}
              {data.risco.top.map((a: any) => (
                <Box key={a.classSectionId + a.studentId} sx={{ py: 0.5 }}>
                  <Typography variant="body2"><b>{a.aluno}</b> · {a.disciplina} <Chip size="small" color={a.nivel === "ALTO" ? "error" : "warning"} label={a.nivel === "ALTO" ? "Alto" : "Médio"} /></Typography>
                  <Typography variant="caption" color="text.secondary">{a.motivos.slice(0, 2).join(" · ")}</Typography>
                </Box>
              ))}
              {data.risco.top.length > 0 && <Button size="small" onClick={() => onIr("alertas")}>Ver todos</Button>}
            </Paper>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Minhas turmas</Typography>
              {data.turmas.map((t: any) => <Typography key={t.id} variant="body2">{t.disciplina} — {t.nome} · {t.alunos} aluno(s)</Typography>)}
            </Paper>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Avaliação docente</Typography>
              {data.avaliacaoDocente.media != null ? <Typography variant="h4" sx={{ fontWeight: 800 }}>{fmtNum(data.avaliacaoDocente.media, 2)} <Typography component="span" variant="body2" color="text.secondary">/ 5 · {data.avaliacaoDocente.respostas} resposta(s)</Typography></Typography> : <Empty>Sem respostas ainda.</Empty>}
              <Button size="small" onClick={() => onIr("avaliacoes")}>Ver detalhes</Button>
            </Paper>
          </Box>
        </>
      )}
    </Box>
  );
}

export function ProfHorario() {
  const { data, loading, error, reload } = useLoad<any>("/portal2/prof/horario");
  const grade: any[] = data?.gradeSemanal || [];
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Feedback loading={loading} error={error} onRetry={reload} />
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Grade semanal</Typography>
        {!grade.length && !loading && <Empty>A grade semanal ainda não foi publicada pelo calendário acadêmico.</Empty>}
        <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "minmax(0,1fr)", sm: "repeat(2, minmax(0,1fr))", lg: "repeat(3, minmax(0,1fr))" } }}>
          {DIAS.map((nome, d) => { const doDia = grade.filter((g) => g.diaSemana === d); return doDia.length ? <Paper key={d} variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}><Typography sx={{ fontWeight: 800 }}>{nome}</Typography>{doDia.map((g, i) => <Typography key={i} variant="body2">{hhmm(g.inicioMin)}–{hhmm(g.fimMin)} · {g.turma}</Typography>)}</Paper> : null; })}
        </Box>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Aulas dos próximos 30 dias</Typography>
        {!(data?.aulas || []).length && !loading && <Empty>Nenhuma aula agendada.</Empty>}
        {(data?.aulas || []).map((a: any) => <Box key={a.id} sx={{ display: "flex", gap: 1, py: 0.5, borderBottom: "1px dashed", borderColor: "divider", flexWrap: "wrap" }}><Typography variant="body2" sx={{ minWidth: 130, fontWeight: 700 }}>{fmtDateTime(a.inicio)}</Typography><Typography variant="body2" sx={{ flex: 1 }}>{a.turma} — {a.titulo}{a.local ? ` · ${a.local}` : ""}</Typography><Status value={a.status} /></Box>)}
      </Paper>
    </Box>
  );
}

/** Provas e banco de questões (usa o módulo de provas com IA). */
export function ProfProvas() {
  const provas = useLoad<any>("/portal2/prof/provas");
  const [disc, setDisc] = useState("");
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("");
  const banco = useLoad<any>(`/portal2/prof/banco-questoes${qsOf({ disciplineId: disc, q, tipo })}`);
  const [sel, setSel] = useState<string[]>([]);
  const [montar, setMontar] = useState<any>(null);
  const [ia, setIa] = useState<any>(null);
  const t = useToast();
  const discs: any[] = [...new Map((provas.data?.disciplinas || []).map((d: any) => [d.disciplineId, d])).values()];
  const turmas: any[] = provas.data?.disciplinas || [];
  const conteudos = useLoad<any>(ia?.disciplineId ? `/conteudo/disciplines/${ia.disciplineId}/content` : null);
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>Minhas provas e atividades avaliativas</Typography>
          <Button size="small" variant="outlined" onClick={() => setIa({ disciplineId: discs[0]?.disciplineId || "", classSectionId: discs[0]?.classSectionId || "", titulo: "", mc: 5, dis: 1 })}>Gerar prova com IA</Button>
        </Box>
        <Feedback loading={provas.loading} error={provas.error} onRetry={provas.reload} />
        {!provas.loading && !(provas.data?.itens || []).length && <Empty>Nenhuma prova criada ainda. Gere uma com IA ou monte a partir do banco.</Empty>}
        {(provas.data?.itens || []).map((p: any) => (
          <Box key={p.id} sx={{ display: "flex", gap: 1, alignItems: "center", py: 0.75, borderBottom: "1px dashed", borderColor: "divider", flexWrap: "wrap" }}>
            <Box sx={{ flex: 1, minWidth: 200 }}><Typography variant="body2" sx={{ fontWeight: 700 }}>{p.titulo}</Typography><Typography variant="caption" color="text.secondary">{p.disciplina} · {p.tipo}{p.dataAbertura ? ` · abre ${fmtDate(p.dataAbertura)}` : ""}</Typography></Box>
            <Chip size="small" label={`${p.questoes} questão(ões)`} /><Chip size="small" variant="outlined" label={`${p.tentativas} tentativa(s)`} />
            {p.correcaoPorIA && <Chip size="small" color="secondary" label="Correção por IA" />}
          </Box>
        ))}
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Banco de questões</Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
          <TextField select size="small" label="Disciplina" value={disc} onChange={(e) => { setDisc(e.target.value); setSel([]); }} sx={{ minWidth: 220 }}><MenuItem value="">Todas as minhas</MenuItem>{discs.map((d) => <MenuItem key={d.disciplineId} value={d.disciplineId}>{d.nome.split(" — ")[0]}</MenuItem>)}</TextField>
          <TextField select size="small" label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} sx={{ minWidth: 170 }}><MenuItem value="">Todos</MenuItem><MenuItem value="MULTIPLA_ESCOLHA">Múltipla escolha</MenuItem><MenuItem value="DISSERTATIVA">Dissertativa</MenuItem><MenuItem value="VERDADEIRO_FALSO">Verdadeiro/falso</MenuItem></TextField>
          <TextField size="small" label="Buscar no enunciado" value={q} onChange={(e) => setQ(e.target.value)} sx={{ flex: 1, minWidth: 180 }} />
          <Button variant="contained" disabled={!sel.length} onClick={() => setMontar({ titulo: "", classSectionId: turmas[0]?.classSectionId || "", tipo: "PROVA" })}>Montar prova com {sel.length} questão(ões)</Button>
        </Box>
        <Feedback loading={banco.loading} error={banco.error} onRetry={banco.reload} />
        {!banco.loading && !(banco.data?.itens || []).length && <Empty>Nenhuma questão no banco para este filtro.</Empty>}
        {(banco.data?.itens || []).map((x: any) => (
          <Box key={x.id} sx={{ display: "flex", gap: 1, alignItems: "flex-start", py: 0.75, borderBottom: "1px dashed", borderColor: "divider" }}>
            <Checkbox checked={sel.includes(x.id)} onChange={(e) => setSel(e.target.checked ? [...sel, x.id] : sel.filter((s) => s !== x.id))} slotProps={{ input: { "aria-label": `Selecionar questão: ${x.enunciado.slice(0, 40)}` } }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2">{x.enunciado}</Typography>
              {Array.isArray(x.alternativas) && x.alternativas.map((a: any, i: number) => <Typography key={i} variant="caption" sx={{ display: "block", color: a.correta ? "success.main" : "text.secondary" }}>{String.fromCharCode(97 + i)}) {a.texto}{a.correta ? " ✔" : ""}</Typography>)}
              <Typography variant="caption" color="text.secondary">{x.disciplina} · {x.prova} · peso {x.peso}</Typography>
            </Box>
          </Box>
        ))}
      </Paper>

      <Dialog open={!!montar} onClose={() => setMontar(null)} fullWidth maxWidth="sm">
        <DialogTitle>Montar prova</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField size="small" label="Título da prova" value={montar?.titulo || ""} onChange={(e) => setMontar({ ...montar, titulo: e.target.value })} />
          <TextField select size="small" label="Turma" value={montar?.classSectionId || ""} onChange={(e) => setMontar({ ...montar, classSectionId: e.target.value })}>{turmas.map((d) => <MenuItem key={d.classSectionId} value={d.classSectionId}>{d.nome}</MenuItem>)}</TextField>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            <TextField size="small" type="datetime-local" label="Abertura (opcional)" slotProps={{ inputLabel: { shrink: true } }} value={montar?.abre || ""} onChange={(e) => setMontar({ ...montar, abre: e.target.value })} />
            <TextField size="small" type="datetime-local" label="Fechamento (opcional)" slotProps={{ inputLabel: { shrink: true } }} value={montar?.fecha || ""} onChange={(e) => setMontar({ ...montar, fecha: e.target.value })} />
          </Box>
          <Alert severity="info">As questões escolhidas são copiadas para a nova prova; o banco original não muda. Só questões da disciplina da turma são aceitas.</Alert>
        </DialogContent>
        <DialogActions><Button onClick={() => setMontar(null)}>Cancelar</Button><Button variant="contained" disabled={(montar?.titulo || "").trim().length < 3} onClick={async () => {
          try { await eduApi.post("/portal2/prof/provas/montar", { titulo: montar.titulo, classSectionId: montar.classSectionId, tipo: montar.tipo, questionIds: sel, dataAbertura: montar.abre ? new Date(montar.abre).toISOString() : undefined, dataFechamento: montar.fecha ? new Date(montar.fecha).toISOString() : undefined }); setMontar(null); setSel([]); t.ok("Prova criada."); provas.reload(); banco.reload(); } catch (e: any) { t.err(e.message); }
        }}>Criar prova</Button></DialogActions>
      </Dialog>

      <Dialog open={!!ia} onClose={() => setIa(null)} fullWidth maxWidth="sm">
        <DialogTitle>Gerar prova com IA</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField select size="small" label="Turma" value={ia?.classSectionId || ""} onChange={(e) => setIa({ ...ia, classSectionId: e.target.value, disciplineId: turmas.find((d) => d.classSectionId === e.target.value)?.disciplineId, contentItemId: "" })}>{turmas.map((d) => <MenuItem key={d.classSectionId} value={d.classSectionId}>{d.nome}</MenuItem>)}</TextField>
          <TextField select size="small" label="Conteúdo-base" value={ia?.contentItemId || ""} onChange={(e) => setIa({ ...ia, contentItemId: e.target.value })} helperText={!conteudos.loading && !(Array.isArray(conteudos.data) ? conteudos.data : conteudos.data?.items || []).length ? "Cadastre conteúdos da disciplina (módulo Conteúdo) para gerar questões." : undefined}>
            {(Array.isArray(conteudos.data) ? conteudos.data : conteudos.data?.items || []).map((c: any) => <MenuItem key={c.id} value={c.id}>{c.titulo}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Título da prova" value={ia?.titulo || ""} onChange={(e) => setIa({ ...ia, titulo: e.target.value })} />
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
            <TextField size="small" type="number" label="Múltipla escolha" value={ia?.mc ?? 5} onChange={(e) => setIa({ ...ia, mc: e.target.value })} />
            <TextField size="small" type="number" label="Dissertativas" value={ia?.dis ?? 1} onChange={(e) => setIa({ ...ia, dis: e.target.value })} />
          </Box>
          <Alert severity="info">Sem chave de IA configurada, o sistema usa o provedor simulado (questões de exemplo). Revise sempre as questões antes de aplicar.</Alert>
        </DialogContent>
        <DialogActions><Button onClick={() => setIa(null)}>Cancelar</Button><Button variant="contained" disabled={!ia?.contentItemId || (ia?.titulo || "").trim().length < 3} onClick={async () => {
          try {
            const a: any = await eduApi.post("/provas/assessments", { disciplineId: ia.disciplineId, classSectionId: ia.classSectionId, titulo: ia.titulo, tipo: "PROVA" });
            await eduApi.post(`/provas/assessments/${a.id}/generate-questions`, { contentItemId: ia.contentItemId, quantidadeMultiplaEscolha: Number(ia.mc) || 0, quantidadeDissertativas: Number(ia.dis) || 0 });
            setIa(null); t.ok("Prova gerada. Revise as questões."); provas.reload(); banco.reload();
          } catch (e: any) { t.err(e.message); }
        }}>Gerar</Button></DialogActions>
      </Dialog>
      {t.node}
    </Box>
  );
}

export function ProfJustificativas() {
  const [status, setStatus] = useState("PENDENTE");
  const { data, loading, error, reload } = useLoad<any>(`/portal2/justificativas${qsOf({ status })}`);
  const [dec, setDec] = useState<any>(null);
  const t = useToast();
  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>Justificativas de faltas</Typography>
        <TextField select size="small" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 150 }}><MenuItem value="PENDENTE">Pendentes</MenuItem><MenuItem value="DEFERIDA">Deferidas</MenuItem><MenuItem value="INDEFERIDA">Indeferidas</MenuItem><MenuItem value="">Todas</MenuItem></TextField>
      </Box>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {!loading && !(data?.itens || []).length && <Empty>Nada por aqui.</Empty>}
      {(data?.itens || []).map((j: any) => (
        <Paper key={j.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2, display: "grid", gap: 0.5 }}>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Typography sx={{ fontWeight: 700, flex: 1, minWidth: 180 }}>{j.aluno?.nomeCompleto} <Typography component="span" variant="caption" color="text.secondary">RA {j.aluno?.ra}</Typography></Typography>
            <Status value={j.status} />
          </Box>
          <Typography variant="body2">{fmtDate(j.dataInicio)} a {fmtDate(j.dataFim)} — {j.motivo}</Typography>
          {j.anexoUrl && <Button size="small" href={j.anexoUrl} target="_blank" rel="noopener noreferrer" sx={{ justifySelf: "start" }}>Ver comprovante</Button>}
          {j.parecer && <Typography variant="caption" color="text.secondary">Parecer: {j.parecer}</Typography>}
          {j.status === "PENDENTE" && <Box sx={{ display: "flex", gap: 1 }}><Button size="small" variant="contained" onClick={() => setDec({ id: j.id, status: "DEFERIDA", parecer: "" })}>Deferir</Button><Button size="small" color="error" onClick={() => setDec({ id: j.id, status: "INDEFERIDA", parecer: "" })}>Indeferir</Button></Box>}
        </Paper>
      ))}
      <Dialog open={!!dec} onClose={() => setDec(null)} fullWidth maxWidth="xs">
        <DialogTitle>{dec?.status === "DEFERIDA" ? "Deferir justificativa" : "Indeferir justificativa"}</DialogTitle>
        <DialogContent dividers sx={{ pt: 2 }}><TextField autoFocus multiline minRows={3} fullWidth label="Parecer (obrigatório)" value={dec?.parecer || ""} onChange={(e) => setDec({ ...dec, parecer: e.target.value })} /></DialogContent>
        <DialogActions><Button onClick={() => setDec(null)}>Cancelar</Button><Button variant="contained" disabled={(dec?.parecer || "").trim().length < 3} onClick={async () => { try { const r: any = await eduApi.post(`/portal2/justificativas/${dec.id}/decisao`, { status: dec.status, parecer: dec.parecer }); setDec(null); t.ok(dec.status === "DEFERIDA" ? `Deferida (${r.faltasAbonadas} falta(s) abonada(s)).` : "Indeferida."); reload(); } catch (e: any) { t.err(e.message); } }}>Confirmar</Button></DialogActions>
      </Dialog>
      {t.node}
    </Box>
  );
}

export function ProfAlertas() {
  const { data, loading, error, reload } = useLoad<any>("/portal2/prof/alertas-evasao");
  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {data && <Alert severity={data.resumo.alto ? "error" : "info"}>{data.resumo.alto} aluno(s) com risco alto e {data.resumo.medio} com risco médio nas suas turmas.</Alert>}
      {!loading && !(data?.itens || []).length && <Empty>Nenhum alerta. Ótimo!</Empty>}
      {(data?.itens || []).map((a: any) => (
        <Paper key={a.classSectionId + a.studentId} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}><Typography sx={{ fontWeight: 800, flex: 1, minWidth: 180 }}>{a.aluno} <Typography component="span" variant="caption" color="text.secondary">RA {a.ra} · {a.disciplina}</Typography></Typography><Chip size="small" color={a.nivel === "ALTO" ? "error" : "warning"} label={`${a.nivel === "ALTO" ? "Alto" : "Médio"} · ${a.score}`} /></Box>
          <Progress value={a.score} color={a.nivel === "ALTO" ? "error" : "warning"} />
          <Typography variant="body2" color="text.secondary">{a.motivos.join(" · ")}</Typography>
        </Paper>
      ))}
    </Box>
  );
}

export function ProfAvaliacoes() {
  const { data, loading, error, reload } = useLoad<any>("/portal2/prof/avaliacoes-docentes");
  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {data?.geral && <Alert severity="success">Média geral {fmtNum(data.geral.media, 2)} / 5 em {data.geral.respostas} resposta(s). As respostas são anônimas.</Alert>}
      {!loading && !(data?.itens || []).length && <Empty>Ainda não há avaliações das suas turmas.</Empty>}
      {(data?.itens || []).map((i: any) => (
        <Paper key={i.classSectionId} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}><Typography sx={{ fontWeight: 800, flex: 1 }}>{i.disciplina} — {i.turma}</Typography><Chip size="small" label={`${fmtNum(i.media, 2)} / 5`} color="primary" /><Chip size="small" variant="outlined" label={`${i.respostas}/${i.matriculados} responderam${i.participacao != null ? ` (${i.participacao}%)` : ""}`} /></Box>
          {i.criterios.map((c: any) => <Box key={c.chave} sx={{ mt: 0.75 }}><Typography variant="caption">{c.titulo}: <b>{fmtNum(c.media, 2)}</b></Typography><Progress value={(c.media / 5) * 100} color={c.media >= 4 ? "success" : c.media >= 3 ? "warning" : "error"} /></Box>)}
          {i.anonimatoPreservado && <Alert severity="info" sx={{ mt: 1 }}>{i.anonimatoPreservado}</Alert>}
          {i.comentarios.map((c: string, k: number) => <Typography key={k} variant="body2" sx={{ mt: 0.5, fontStyle: "italic" }}>“{c}”</Typography>)}
        </Paper>
      ))}
    </Box>
  );
}

export function ProfDisponibilidade() {
  const { data, loading, error, reload } = useLoad<any>("/portal2/prof/disponibilidade");
  const [perfil, setPerfil] = useState<any>(null);
  const [janelas, setJanelas] = useState<any[] | null>(null);
  const t = useToast();
  const p = perfil ?? data?.perfil ?? {};
  const js: any[] = janelas ?? data?.janelas ?? [];
  const ch = data?.cargaHoraria;
  const toMin = (h: string) => { const [a, b] = h.split(":").map(Number); return a * 60 + (b || 0); };
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {ch && (
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "repeat(2, minmax(0,1fr))", md: "repeat(4, minmax(0,1fr))" } }}>
          <Kpi title="Contrato" value={`${ch.contratualSemanal}h`} hint="por semana" color="#0F5FDB" />
          <Kpi title="Em aula" value={`${ch.aulaSemanal}h`} hint="grade publicada" color={ch.excedeContrato ? "#D32F2F" : "#2E7D32"} />
          <Kpi title="Disponível" value={`${ch.disponivelSemanal}h`} hint="janelas informadas" color="#7C3AED" />
          <Kpi title="Turmas / CH" value={`${ch.turmas} / ${ch.chDisciplinas}h`} hint={ch.saldo != null ? `saldo ${ch.saldo}h` : undefined} color="#ED6C02" />
        </Box>
      )}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, display: "grid", gap: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Regime e titulação</Typography>
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" } }}>
          <TextField select size="small" label="Regime" value={p.regime || ""} onChange={(e) => setPerfil({ ...p, regime: e.target.value })}><MenuItem value="HORISTA">Horista</MenuItem><MenuItem value="PARCIAL">Tempo parcial</MenuItem><MenuItem value="INTEGRAL">Tempo integral</MenuItem></TextField>
          <TextField size="small" type="number" label="Carga contratual (h/semana)" value={p.cargaContratualHoras ?? 0} onChange={(e) => setPerfil({ ...p, cargaContratualHoras: Number(e.target.value) })} />
          <TextField size="small" label="Titulação" value={p.titulacao || ""} onChange={(e) => setPerfil({ ...p, titulacao: e.target.value })} />
        </Box>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, display: "grid", gap: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}><Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>Janelas semanais</Typography><Button size="small" onClick={() => setJanelas([...js, { diaSemana: 1, inicioMin: 18 * 60, fimMin: 22 * 60, tipo: "DISPONIVEL" }])}>Adicionar janela</Button></Box>
        {!js.length && <Empty>Nenhuma janela informada.</Empty>}
        {js.map((j, i) => (
          <Box key={i} sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
            <TextField select size="small" value={j.diaSemana} onChange={(e) => setJanelas(js.map((x, k) => (k === i ? { ...x, diaSemana: Number(e.target.value) } : x)))} sx={{ minWidth: 130 }}>{DIAS.map((d, n) => <MenuItem key={n} value={n}>{d}</MenuItem>)}</TextField>
            <TextField size="small" type="time" value={hhmm(j.inicioMin)} onChange={(e) => setJanelas(js.map((x, k) => (k === i ? { ...x, inicioMin: toMin(e.target.value) } : x)))} />
            <TextField size="small" type="time" value={hhmm(j.fimMin)} onChange={(e) => setJanelas(js.map((x, k) => (k === i ? { ...x, fimMin: toMin(e.target.value) } : x)))} />
            <TextField select size="small" value={j.tipo} onChange={(e) => setJanelas(js.map((x, k) => (k === i ? { ...x, tipo: e.target.value } : x)))} sx={{ minWidth: 150 }}><MenuItem value="DISPONIVEL">Disponível</MenuItem><MenuItem value="INDISPONIVEL">Indisponível</MenuItem></TextField>
            <Button size="small" color="error" onClick={() => setJanelas(js.filter((_, k) => k !== i))}>Remover</Button>
          </Box>
        ))}
      </Paper>
      <Button variant="contained" sx={{ justifySelf: "start" }} onClick={async () => {
        try { await eduApi.put("/portal2/prof/disponibilidade", { perfil: { regime: p.regime || null, cargaContratualHoras: Number(p.cargaContratualHoras) || 0, titulacao: p.titulacao || null }, janelas: js.map((j) => ({ diaSemana: j.diaSemana, inicioMin: j.inicioMin, fimMin: j.fimMin, tipo: j.tipo, observacao: j.observacao || undefined })) }); setPerfil(null); setJanelas(null); t.ok("Salvo."); reload(); } catch (e: any) { t.err(e.message); }
      }}>Salvar disponibilidade</Button>
      {t.node}
    </Box>
  );
}
