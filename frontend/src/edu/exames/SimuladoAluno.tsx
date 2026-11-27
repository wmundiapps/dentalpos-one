// Simulados do aluno: lista, realização com cronômetro, correção automática, gabarito e respostas comentadas.
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, MenuItem, Paper, Radio, Stack, TextField, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bar, COLORS, Kpi, KpiRow, LoadBox, Section, Status, call, fmtDateTime, fmtNum, fmtPct, semaforo, useApi, useToast, useRunner } from "../desempenho/kit";
import { AvisoAutoral, ExamePicker, SelinhoIA, X } from "./comum";
import type { ExameInfo } from "./comum";

const mmss = (s: number) => `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, "0")}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

export default function SimuladoAluno({ exames, exameId, setExameId }: { exames: ExameInfo[]; exameId: string; setExameId: (v: string) => void }) {
  const lista = useApi<any>(`${X}/simulados${exameId ? `?exameId=${exameId}` : ""}`);
  const minhas = useApi<any>(`${X}/minhas-sessoes`);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => { lista.reload(); minhas.reload(); });
  const [sessao, setSessao] = useState<any>(null);
  const [resultadoId, setResultadoId] = useState<string | null>(null);
  const [treino, setTreino] = useState(false);

  async function iniciar(id: string) {
    const r = await run(() => call("POST", `${X}/simulados/${id}/iniciar`), "Prova iniciada. Boa sorte!");
    if (r && r !== true) setSessao(r);
  }
  async function retomar(id: string) {
    const r = await run(() => call("GET", `${X}/sessoes/${id}`), "Prova retomada.");
    if (r && r !== true) { if (r.status && r.status !== "EM_ANDAMENTO") setResultadoId(id); else setSessao(r); }
  }

  if (sessao) return <>{node}<Prova sessao={sessao} onFim={(id) => { setSessao(null); setResultadoId(id); lista.reload(); minhas.reload(); }} onSair={() => { setSessao(null); lista.reload(); minhas.reload(); }} /></>;
  if (resultadoId) return <Resultado sessaoId={resultadoId} onVoltar={() => { setResultadoId(null); lista.reload(); minhas.reload(); }} />;

  const emAndamento = (minhas.data?.items || []).filter((s: any) => s.status === "EM_ANDAMENTO");
  return (
    <Box>
      {node}
      <AvisoAutoral compacto />
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2, alignItems: "center" }}>
        <ExamePicker exames={exames} value={exameId} onChange={setExameId} />
        <Button variant="contained" color="secondary" onClick={() => setTreino(true)} disabled={!exameId}>Treino personalizado</Button>
      </Box>
      {emAndamento.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => retomar(emAndamento[0].id)}>Continuar</Button>}>
          Você tem uma prova em andamento ("{emAndamento[0].simulado}"). O tempo continua correndo; ao esgotar, ela é corrigida automaticamente.
        </Alert>
      )}
      <Section title="Simulados disponíveis">
        <LoadBox loading={lista.loading} error={lista.error} empty={!(lista.data?.items || []).length} emptyText="Nenhum simulado publicado para o seu curso ainda." onRetry={lista.reload}>
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "repeat(2, minmax(0,1fr))" } }}>
            {(lista.data?.items || []).map((s: any) => (
              <Paper key={s.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                <Typography sx={{ fontWeight: 800 }}>{s.titulo}</Typography>
                <Typography variant="body2" color="text.secondary">{s.exame?.nome} · {s.totalQuestoes} questões · {s.duracaoMin} min</Typography>
                <Box sx={{ my: 1, display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                  {s.pessoal && <Chip size="small" label="Treino pessoal" />}
                  {s.tentativas > 0 && <Chip size="small" color="success" label={`${s.tentativas} tentativa(s) · melhor ${fmtPct(s.melhorPercentual, 0)}`} />}
                  {s.emAndamento && <Chip size="small" color="warning" label="Em andamento" />}
                </Box>
                <Button variant="contained" size="small" onClick={() => iniciar(s.id)}>{s.emAndamento ? "Continuar prova" : s.tentativas ? "Refazer" : "Iniciar"}</Button>
              </Paper>
            ))}
          </Box>
        </LoadBox>
      </Section>
      <Section title="Minhas provas">
        <LoadBox loading={minhas.loading} error={minhas.error} empty={!(minhas.data?.items || []).length} emptyText="Você ainda não fez nenhuma prova." onRetry={minhas.reload}>
          {(minhas.data?.items || []).filter((s: any) => s.status !== "EM_ANDAMENTO").slice(0, 12).map((s: any) => (
            <Box key={s.id} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.75, borderBottom: 1, borderColor: "divider", flexWrap: "wrap" }}>
              <Box sx={{ flex: 1, minWidth: 180 }}><Typography sx={{ fontWeight: 700 }}>{s.simulado}</Typography><Typography variant="caption" color="text.secondary">{fmtDateTime(s.iniciadaEm)}</Typography></Box>
              <Chip size="small" sx={{ bgcolor: semaforo(s.percentual), color: "#fff" }} label={fmtPct(s.percentual, 0)} />
              <Status value={s.status} />
              <Button size="small" onClick={() => setResultadoId(s.id)}>Ver gabarito comentado</Button>
            </Box>
          ))}
        </LoadBox>
      </Section>
      <TreinoDialog open={treino} exameId={exameId} onClose={() => setTreino(false)} onStart={(r) => { setTreino(false); setSessao(r); }} />
    </Box>
  );
}

function TreinoDialog({ open, exameId, onClose, onStart }: { open: boolean; exameId: string; onClose: () => void; onStart: (r: any) => void }) {
  const [modo, setModo] = useState("sugerido");
  const [qtd, setQtd] = useState(10);
  const [tema, setTema] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const sug = useApi<any>(open && exameId ? `${X}/sugestoes?exameId=${exameId}` : null);
  async function go() {
    setBusy(true); setErro("");
    try { onStart(await call("POST", `${X}/treino`, { exameId, quantidade: qtd, modo, ...(modo === "tema" ? { tema } : {}) })); } catch (e: any) { setErro(e.message); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Treino personalizado</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
        <TextField select size="small" label="Como montar" value={modo} onChange={(e) => setModo(e.target.value)}>
          <MenuItem value="sugerido">Sugerido: temas recorrentes em provas anteriores onde posso melhorar</MenuItem>
          <MenuItem value="tema">Por tema</MenuItem>
          <MenuItem value="erradas">Refazer as questões que errei</MenuItem>
        </TextField>
        {modo === "tema" && (
          <TextField select size="small" label="Tema" value={tema} onChange={(e) => setTema(e.target.value)} helperText="Temas listados por recorrência histórica (ilustrativa)">
            {(sug.data?.temas || []).filter((t: any) => t.questoesDisponiveis > 0).map((t: any) => <MenuItem key={t.tema} value={t.tema}>{t.tema} · {t.questoesDisponiveis} questão(ões)</MenuItem>)}
          </TextField>
        )}
        <TextField size="small" type="number" label="Quantidade de questões" value={qtd} onChange={(e) => setQtd(Math.max(3, Math.min(40, Number(e.target.value) || 10)))} />
        {erro && <Alert severity="warning">{erro}</Alert>}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" onClick={go} disabled={busy || (modo === "tema" && !tema)}>{busy ? "Montando…" : "Começar"}</Button></DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------- realização da prova
function Prova({ sessao, onFim, onSair }: { sessao: any; onFim: (id: string) => void; onSair: () => void }) {
  const [resp, setResp] = useState<Record<string, string>>(sessao.respostasSalvas || {});
  const [i, setI] = useState(0);
  const [resto, setResto] = useState(() => Math.max(0, Math.round((new Date(sessao.expiraEm).getTime() - Date.now()) / 1000)));
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");
  const respRef = useRef(resp);
  respRef.current = resp;
  const qs: any[] = sessao.questoes || [];
  const q = qs[i];

  const salvar = useCallback(async () => {
    try { await call("PUT", `${X}/sessoes/${sessao.sessaoId}/respostas`, { respostas: respRef.current }); } catch (e: any) { setAviso(e.message); }
  }, [sessao.sessaoId]);

  const enviar = useCallback(async () => {
    setEnviando(true);
    try { await call("POST", `${X}/sessoes/${sessao.sessaoId}/enviar`, { respostas: respRef.current }); onFim(sessao.sessaoId); } catch (e: any) { setAviso(e.message); setEnviando(false); if (/finalizada|esgot/i.test(e.message)) onFim(sessao.sessaoId); }
  }, [sessao.sessaoId, onFim]);

  useEffect(() => { const t = setInterval(() => setResto((r) => r - 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (resto <= 0 && !enviando) void enviar(); }, [resto, enviando, enviar]);
  useEffect(() => { const t = setInterval(() => { void salvar(); }, 20000); return () => clearInterval(t); }, [salvar]);

  const respondidas = Object.keys(resp).length;
  const escolher = (qid: string, letra: string) => setResp((r) => ({ ...r, [qid]: letra }));
  if (!q) return <Alert severity="warning">Esta prova não tem questões.</Alert>;
  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2, position: "sticky", top: 8, zIndex: 2, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
        <Box sx={{ flex: 1, minWidth: 160 }}>
          <Typography sx={{ fontWeight: 800 }}>Questão {i + 1} de {qs.length}</Typography>
          <LinearProgress variant="determinate" value={(respondidas / qs.length) * 100} sx={{ mt: 0.5, height: 6, borderRadius: 3 }} />
          <Typography variant="caption" color="text.secondary">{respondidas} respondida(s)</Typography>
        </Box>
        <Chip color={resto < 300 ? "error" : "default"} label={`Tempo: ${mmss(resto)}`} sx={{ fontWeight: 800, fontSize: 16 }} aria-live="polite" />
        <Button color="inherit" onClick={async () => { await salvar(); onSair(); }}>Salvar e sair</Button>
        <Button variant="contained" color="success" disabled={enviando} onClick={() => { if (respondidas < qs.length && !window.confirm(`Faltam ${qs.length - respondidas} questão(ões). Enviar mesmo assim?`)) return; void enviar(); }}>Enviar prova</Button>
      </Paper>
      {aviso && <Alert severity="warning" onClose={() => setAviso("")} sx={{ mb: 2 }}>{aviso}</Alert>}
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 4 }}>
        <Box sx={{ display: "flex", gap: 0.5, mb: 1, flexWrap: "wrap" }}>
          {q.tema && <Chip size="small" label={q.tema} />}
          <Chip size="small" variant="outlined" label={q.nivel} />
          {!q.revisada && <Chip size="small" color="warning" label="Questão ainda não revisada por docente" />}
        </Box>
        <Typography sx={{ whiteSpace: "pre-line", mb: 2, fontSize: 17, lineHeight: 1.55 }}>{q.enunciado}</Typography>
        <Stack spacing={1} role="radiogroup" aria-label={`Alternativas da questão ${i + 1}`}>
          {(q.alternativas || []).map((a: any) => {
            const sel = resp[q.questaoId] === a.letra;
            return (
              <Paper key={a.letra} variant="outlined" onClick={() => escolher(q.questaoId, a.letra)} sx={{ p: 1.25, borderRadius: 2, cursor: "pointer", display: "flex", gap: 1, alignItems: "flex-start", borderColor: sel ? "primary.main" : "divider", bgcolor: sel ? "action.selected" : undefined }}>
                <Radio checked={sel} onChange={() => escolher(q.questaoId, a.letra)} value={a.letra} slotProps={{ input: { "aria-label": `Alternativa ${a.letra}` } }} sx={{ p: 0.5 }} />
                <Typography><strong>{a.letra})</strong> {a.texto}</Typography>
              </Paper>
            );
          })}
        </Stack>
        {resp[q.questaoId] && <Button size="small" sx={{ mt: 1 }} onClick={() => setResp((r) => { const n = { ...r }; delete n[q.questaoId]; return n; })}>Limpar resposta</Button>}
        <Box sx={{ display: "flex", justifyContent: "space-between", mt: 3, gap: 1, flexWrap: "wrap" }}>
          <Button disabled={i === 0} onClick={() => { setI(i - 1); void salvar(); }}>Anterior</Button>
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", justifyContent: "center", flex: 1 }}>
            {qs.map((x, n) => <Chip key={x.questaoId} size="small" label={n + 1} color={n === i ? "primary" : resp[x.questaoId] ? "success" : "default"} variant={n === i ? "filled" : "outlined"} onClick={() => setI(n)} />)}
          </Box>
          <Button disabled={i === qs.length - 1} variant="outlined" onClick={() => { setI(i + 1); void salvar(); }}>Próxima</Button>
        </Box>
      </Paper>
    </Box>
  );
}

// ---------------------------------------------------------------- resultado: gabarito e respostas comentadas
export function Resultado({ sessaoId, onVoltar }: { sessaoId: string; onVoltar: () => void }) {
  const r = useApi<any>(`${X}/sessoes/${sessaoId}/resultado`);
  const [filtro, setFiltro] = useState<"todas" | "erradas">("todas");
  const d = r.data;
  const itens: any[] = (d?.revisao || []).filter((x: any) => filtro === "todas" || !x.correta);
  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
        <Button onClick={onVoltar}>← Voltar aos simulados</Button>
        <Button variant={filtro === "todas" ? "contained" : "outlined"} onClick={() => setFiltro("todas")}>Todas</Button>
        <Button variant={filtro === "erradas" ? "contained" : "outlined"} onClick={() => setFiltro("erradas")}>Só as que errei</Button>
      </Box>
      <LoadBox loading={r.loading} error={r.error} onRetry={r.reload}>
        {d && (
          <>
            <KpiRow>
              <Kpi title="Nota" value={fmtPct(d.percentual, 0)} hint={`${d.acertos} de ${d.total} acertos`} color={semaforo(d.percentual)} />
              <Kpi title="Tempo" value={d.tempoSegundos != null ? mmss(d.tempoSegundos) : "—"} hint={d.status === "EXPIRADA" ? "Tempo esgotado" : "Enviada"} />
              {d.projecao && <Kpi title="Projeção (estimativa)" value={d.projecao.conceito ? `Conceito ${d.projecao.conceito}` : d.projecao.aprovadoProvavel ? "Acima do corte" : "Abaixo do corte"} hint={d.projecao.observacao || `Margem ${fmtNum(d.projecao.margem)} pontos`} />}
            </KpiRow>
            <Section title="Desempenho por eixo e tema">
              {(d.porEixo || []).map((e: any) => <Bar key={e.eixoId} value={e.percentual} meta={e.meta} color={semaforo(e.percentual, e.meta ?? 60, 40)} label={e.nome} right={`${e.acertos}/${e.total} · ${fmtPct(e.percentual, 0)}`} />)}
              {(d.porTema || []).length > 0 && <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, fontWeight: 800 }}>Por tema</Typography>}
              {(d.porTema || []).map((t: any) => <Bar key={t.tema} value={t.percentual} color={semaforo(t.percentual)} label={t.tema} right={`${t.acertos}/${t.total}`} />)}
              <Typography variant="caption" color="text.secondary">A linha preta marca a meta do eixo. {d.porDescritor?.length ? `Descritores trabalhados: ${d.porDescritor.map((x: any) => x.codigo).join(", ")}.` : ""}</Typography>
            </Section>
            <AvisoAutoral compacto />
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Gabarito e respostas comentadas</Typography>
            {itens.map((x) => <QuestaoComentada key={x.questaoId} x={x} />)}
            {!itens.length && <Alert severity="success">Nenhuma questão errada nesta prova. Ótimo trabalho!</Alert>}
          </>
        )}
      </LoadBox>
    </Box>
  );
}

function QuestaoComentada({ x }: { x: any }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 3, mb: 2, borderLeft: `6px solid ${x.correta ? COLORS.ok : COLORS.bad}` }}>
      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 1, alignItems: "center" }}>
        <Typography sx={{ fontWeight: 800 }}>Questão {x.ordem}</Typography>
        <Chip size="small" color={x.correta ? "success" : "error"} label={x.correta ? "Acertou" : x.respondida ? "Errou" : "Em branco"} />
        {x.tema && <Chip size="small" label={x.tema} />}
        {x.descritor?.codigo && <Chip size="small" variant="outlined" label={x.descritor.codigo} />}
        <SelinhoIA geradaPor={x.geradaPor} revisada={x.revisada} />
      </Box>
      <Typography sx={{ whiteSpace: "pre-line", mb: 1.5 }}>{x.enunciado}</Typography>
      {(x.alternativas || []).map((a: any) => {
        const certa = a.letra === x.gabarito, marcada = a.letra === x.marcada;
        return (
          <Box key={a.letra} sx={{ p: 1.25, mb: 1, borderRadius: 2, border: 1, borderColor: certa ? "success.main" : marcada ? "error.main" : "divider", bgcolor: certa ? "rgba(46,158,91,.10)" : marcada ? "rgba(214,69,69,.08)" : undefined }}>
            <Typography><strong>{a.letra})</strong> {a.texto} {certa && <Chip size="small" color="success" label="Gabarito" sx={{ ml: 0.5 }} />} {marcada && !certa && <Chip size="small" color="error" label="Sua resposta" sx={{ ml: 0.5 }} />} {marcada && certa && <Chip size="small" label="Sua resposta" sx={{ ml: 0.5 }} />}</Typography>
            {x.comentarios?.[a.letra] && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{x.comentarios[a.letra]}</Typography>}
          </Box>
        );
      })}
      {x.descritor?.descricao && <Typography variant="caption" color="text.secondary">Descritor {x.descritor.codigo}: {x.descritor.descricao}</Typography>}
    </Paper>
  );
}
