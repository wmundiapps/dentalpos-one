// Área docente/coordenação: banco classificado e comentado, gerador por IA, simulados, perfis de prova, descritores, trilhas e configurações.
import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Paper, Tab, Tabs, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { LoadBox, Section, Status, call, fmtNum, fmtPct, useApi, useCursos, useRunner, useToast } from "../desempenho/kit";
import { AvisoAutoral, ExamePicker, SelinhoIA, X, ehGestao } from "./comum";
import type { ExameInfo } from "./comum";

export default function BancoDocente({ exames, config, recarregar }: { exames: ExameInfo[]; config?: { revisaoDocenteObrigatoria: boolean; rankingAtivo: boolean }; recarregar: () => void }) {
  const [aba, setAba] = useState(0);
  const [exameId, setExameId] = useState("");
  const abas = ["Questões", "Gerador com IA", "Simulados", "Perfis de prova", "Descritores", "Trilhas", ...(ehGestao() ? ["Configurações"] : [])];
  return (
    <Box>
      <AvisoAutoral />
      <Box sx={{ mb: 2 }}><ExamePicker exames={exames} value={exameId} onChange={setExameId} /></Box>
      <Tabs value={aba} onChange={(_, v) => setAba(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>{abas.map((a) => <Tab key={a} label={a} />)}</Tabs>
      {!exameId && aba !== 6 && <Alert severity="info">Escolha um exame para trabalhar com o banco.</Alert>}
      {exameId && aba === 0 && <Questoes exameId={exameId} />}
      {exameId && aba === 1 && <Gerador exameId={exameId} />}
      {exameId && aba === 2 && <Simulados exameId={exameId} exames={exames} />}
      {exameId && aba === 3 && <Perfis exameId={exameId} />}
      {exameId && aba === 4 && <Descritores exameId={exameId} />}
      {exameId && aba === 5 && <Trilhas exameId={exameId} />}
      {aba === 6 && ehGestao() && <Config config={config} recarregar={recarregar} />}
    </Box>
  );
}

// ---------------------------------------------------------------- questões
function Questoes({ exameId }: { exameId: string }) {
  const [rev, setRev] = useState("");
  const [tema, setTema] = useState("");
  const r = useApi<any>(`${X}/questoes?exameId=${exameId}&pageSize=100${rev ? `&revisao=${rev}` : ""}${tema ? `&tema=${encodeURIComponent(tema)}` : ""}`);
  const { toast, node } = useToast();
  const run = useRunner(toast, r.reload);
  const [novo, setNovo] = useState(false);
  const [ver, setVer] = useState<any>(null);
  return (
    <Section title="Banco de questões classificadas" actions={<Button variant="contained" onClick={() => setNovo(true)}>Nova questão</Button>}>
      {node}
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
        <TextField select size="small" label="Revisão" value={rev} onChange={(e) => setRev(e.target.value)} sx={{ minWidth: 180 }}><MenuItem value="">Todas</MenuItem><MenuItem value="PENDENTE">Pendentes</MenuItem><MenuItem value="APROVADA">Aprovadas</MenuItem><MenuItem value="REJEITADA">Rejeitadas</MenuItem></TextField>
        <TextField size="small" label="Tema contém" value={tema} onChange={(e) => setTema(e.target.value)} />
      </Box>
      <LoadBox loading={r.loading} error={r.error} empty={!(r.data?.items || []).length} emptyText="Nenhuma questão com esses filtros." onRetry={r.reload}>
        {(r.data?.items || []).map((q: any) => (
          <Paper key={q.id} variant="outlined" sx={{ p: 1.5, mb: 1, borderRadius: 2 }}>
            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 0.5, alignItems: "center" }}>
              {q.meta?.tema && <Chip size="small" label={q.meta.tema} />}
              <Chip size="small" variant="outlined" label={q.nivel} />
              <Status value={q.meta?.revisao} />
              <SelinhoIA geradaPor={q.meta?.geradaPor} revisada={q.meta?.revisao === "APROVADA"} />
              {q.taxaAcerto != null && <Chip size="small" variant="outlined" label={`acerto ${fmtPct(q.taxaAcerto, 0)} (${q.totalRespostas})`} />}
            </Box>
            <Typography variant="body2" sx={{ mb: 1 }}>{String(q.enunciado).slice(0, 220)}{q.enunciado.length > 220 ? "…" : ""}</Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button size="small" onClick={() => setVer(q)}>Ver com comentários</Button>
              {q.meta?.revisao === "PENDENTE" && <Button size="small" color="success" onClick={() => run(() => call("POST", `${X}/questoes/${q.id}/revisao`, { decisao: "APROVADA" }), "Questão aprovada e liberada aos alunos.")}>Aprovar</Button>}
              {q.meta?.revisao === "PENDENTE" && <Button size="small" color="error" onClick={() => { const nota = window.prompt("Motivo da rejeição (opcional):") ?? ""; void run(() => call("POST", `${X}/questoes/${q.id}/revisao`, { decisao: "REJEITADA", nota }), "Questão rejeitada."); }}>Rejeitar</Button>}
            </Box>
          </Paper>
        ))}
      </LoadBox>
      <Dialog open={!!ver} onClose={() => setVer(null)} fullWidth maxWidth="md">
        <DialogTitle>Questão com explicação por alternativa</DialogTitle>
        <DialogContent dividers>
          {ver && (<>
            <Typography sx={{ whiteSpace: "pre-line", mb: 2 }}>{ver.enunciado}</Typography>
            {(ver.alternativas || []).map((a: any) => <Box key={a.letra} sx={{ mb: 1, p: 1, borderRadius: 1, border: 1, borderColor: a.letra === ver.gabarito ? "success.main" : "divider" }}><Typography><strong>{a.letra})</strong> {a.texto}</Typography><Typography variant="body2" color="text.secondary">{ver.meta?.comentarios?.[a.letra]}</Typography></Box>)}
            {ver.tipo === "DISCURSIVA" && <Alert severity="info" sx={{ whiteSpace: "pre-line" }}><strong>Espelho:</strong> {ver.gabarito}{"\n"}<strong>Critérios:</strong> {ver.comentario}</Alert>}
          </>)}
        </DialogContent>
        <DialogActions><Button onClick={() => setVer(null)}>Fechar</Button></DialogActions>
      </Dialog>
      <NovaQuestao open={novo} exameId={exameId} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); r.reload(); }} />
    </Section>
  );
}

function NovaQuestao({ open, exameId, onClose, onSaved }: { open: boolean; exameId: string; onClose: () => void; onSaved: () => void }) {
  const eixos = useApi<any>(open ? `/desempenho/eixos?exameId=${exameId}&pageSize=200` : null);
  const descs = useApi<any>(open ? `${X}/descritores?exameId=${exameId}` : null);
  const [v, setV] = useState<any>({ nivel: "MEDIO", gabarito: "A", alts: ["", "", "", ""], coms: ["", "", "", ""] });
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const L = ["A", "B", "C", "D"];
  async function salvar() {
    setBusy(true); setErro("");
    try {
      await call("POST", `${X}/questoes`, {
        exameId, eixoId: v.eixoId, tema: v.tema, nivel: v.nivel, enunciado: v.enunciado, descritorId: v.descritorId || undefined,
        alternativas: L.map((l, i) => ({ letra: l, texto: v.alts[i] })), gabarito: v.gabarito, comentario: v.comentario || undefined,
        comentarios: Object.fromEntries(L.map((l, i) => [l, v.coms[i]])),
      });
      onSaved();
    } catch (e: any) { setErro(e.message); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Nova questão autoral</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
        <Alert severity="warning">Redija questões originais. Não copie questões de provas reais nem de materiais protegidos.</Alert>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
          <TextField select size="small" label="Eixo / área" value={v.eixoId || ""} onChange={(e) => setV({ ...v, eixoId: e.target.value })}>{(eixos.data?.items || eixos.data || []).map((x: any) => <MenuItem key={x.id} value={x.id}>{x.nome}</MenuItem>)}</TextField>
          <TextField size="small" label="Tema" value={v.tema || ""} onChange={(e) => setV({ ...v, tema: e.target.value })} />
          <TextField select size="small" label="Descritor (matriz)" value={v.descritorId || ""} onChange={(e) => setV({ ...v, descritorId: e.target.value })}><MenuItem value="">Nenhum</MenuItem>{(descs.data?.items || []).map((d: any) => <MenuItem key={d.id} value={d.id}>{d.codigo}</MenuItem>)}</TextField>
          <TextField select size="small" label="Dificuldade" value={v.nivel} onChange={(e) => setV({ ...v, nivel: e.target.value })}><MenuItem value="FACIL">Fácil</MenuItem><MenuItem value="MEDIO">Médio</MenuItem><MenuItem value="DIFICIL">Difícil</MenuItem></TextField>
        </Box>
        <TextField multiline minRows={3} size="small" label="Enunciado" value={v.enunciado || ""} onChange={(e) => setV({ ...v, enunciado: e.target.value })} />
        {L.map((l, i) => (
          <Box key={l} sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            <TextField size="small" label={`Alternativa ${l}`} value={v.alts[i]} onChange={(e) => setV({ ...v, alts: v.alts.map((x: string, k: number) => (k === i ? e.target.value : x)) })} />
            <TextField size="small" label={`Por que ${l} está certa/errada`} value={v.coms[i]} onChange={(e) => setV({ ...v, coms: v.coms.map((x: string, k: number) => (k === i ? e.target.value : x)) })} />
          </Box>
        ))}
        <TextField select size="small" label="Gabarito" value={v.gabarito} onChange={(e) => setV({ ...v, gabarito: e.target.value })} sx={{ maxWidth: 160 }}>{L.map((l) => <MenuItem key={l} value={l}>{l}</MenuItem>)}</TextField>
        {erro && <Alert severity="error">{erro}</Alert>}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={busy || !v.eixoId || !v.tema || !v.enunciado} onClick={salvar}>Salvar como rascunho</Button></DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------- gerador
function Gerador({ exameId }: { exameId: string }) {
  const eixos = useApi<any>(`/desempenho/eixos?exameId=${exameId}&pageSize=200`);
  const rec = useApi<any>(`${X}/recorrencia?exameId=${exameId}`);
  const [eixoId, setEixoId] = useState("");
  const [tema, setTema] = useState("");
  const [qtd, setQtd] = useState(3);
  const [nivel, setNivel] = useState("MEDIO");
  const [out, setOut] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  async function gerar() {
    setBusy(true); setErro(""); setOut(null);
    try { setOut(await call("POST", `${X}/gerar`, { exameId, eixoId, tema: tema || undefined, quantidade: qtd, nivel })); } catch (e: any) { setErro(e.message); } finally { setBusy(false); }
  }
  return (
    <Section title="Gerar questões inspiradas no padrão de provas anteriores">
      <Alert severity="info" sx={{ mb: 2 }}>A IA recebe o perfil de prova (temas recorrentes, estilo e nível) e deve produzir questões <strong>originais</strong>, sem copiar provas reais. Tudo entra como rascunho para revisão docente. Sem chave de IA, o sistema usa o modo simulado (variações de questões autorais).</Alert>
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }, mb: 2 }}>
        <TextField select size="small" label="Eixo / área" value={eixoId} onChange={(e) => setEixoId(e.target.value)}>{(eixos.data?.items || eixos.data || []).map((x: any) => <MenuItem key={x.id} value={x.id}>{x.nome}</MenuItem>)}</TextField>
        <TextField select size="small" label="Tema (recorrente)" value={tema} onChange={(e) => setTema(e.target.value)}><MenuItem value="">Automático</MenuItem>{(rec.data?.temas || []).map((t: any) => <MenuItem key={t.tema} value={t.tema}>{t.tema} ({fmtNum(t.frequenciaMedia)}%)</MenuItem>)}</TextField>
        <TextField size="small" type="number" label="Quantidade (1 a 8)" value={qtd} onChange={(e) => setQtd(Math.max(1, Math.min(8, Number(e.target.value) || 1)))} />
        <TextField select size="small" label="Nível" value={nivel} onChange={(e) => setNivel(e.target.value)}><MenuItem value="FACIL">Fácil</MenuItem><MenuItem value="MEDIO">Médio</MenuItem><MenuItem value="DIFICIL">Difícil</MenuItem></TextField>
      </Box>
      <Button variant="contained" disabled={!eixoId || busy} onClick={gerar}>{busy ? "Gerando…" : "Gerar questões"}</Button>
      {erro && <Alert severity="error" sx={{ mt: 2 }}>{erro}</Alert>}
      {out && (
        <Box sx={{ mt: 2 }}>
          <Alert severity={out.ia ? "success" : "warning"} sx={{ mb: 1 }}>{out.mensagem || `${out.criadas} questão(ões) criada(s). `}{out.aviso}</Alert>
          {(out.items || []).map((q: any) => <Paper key={q.id} variant="outlined" sx={{ p: 1.5, mb: 1, borderRadius: 2 }}><SelinhoIA geradaPor={q.meta?.geradaPor} revisada={false} /><Typography variant="body2">{q.enunciado}</Typography><Typography variant="caption" color="text.secondary">Gabarito {q.gabarito} · {q.status}. Aprove na aba Questões.</Typography></Paper>)}
        </Box>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- simulados
function Simulados({ exameId, exames }: { exameId: string; exames: ExameInfo[] }) {
  const r = useApi<any>(`${X}/simulados?exameId=${exameId}`);
  const cursos = useCursos();
  const { toast, node } = useToast();
  const run = useRunner(toast, r.reload);
  const [d, setD] = useState<any>(null);
  const geral = exames.find((e) => e.codigo === "ENADE-GERAL");
  const ehEnade = exames.find((e) => e.id === exameId)?.tipo === "ENADE" && exameId !== geral?.id;
  return (
    <Section title="Simulados prontos" actions={<Button variant="contained" onClick={() => setD({ titulo: "", quantidade: 10, duracaoMin: 90, incluirGeral: !!ehEnade })}>Montar simulado</Button>}>
      {node}
      <LoadBox loading={r.loading} error={r.error} empty={!(r.data?.items || []).length} onRetry={r.reload}>
        {(r.data?.items || []).map((s: any) => (
          <Paper key={s.id} variant="outlined" sx={{ p: 1.5, mb: 1, borderRadius: 2, display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Box sx={{ flex: 1, minWidth: 200 }}><Typography sx={{ fontWeight: 700 }}>{s.titulo}</Typography><Typography variant="caption" color="text.secondary">{s.totalQuestoes} questões · {s.duracaoMin} min</Typography></Box>
            <Status value={s.status} />
            {s.status === "RASCUNHO" && <Button size="small" variant="contained" onClick={() => run(() => call("POST", `${X}/simulados/${s.id}/publicar`), "Simulado publicado.")}>Publicar</Button>}
          </Paper>
        ))}
      </LoadBox>
      <Dialog open={!!d} onClose={() => setD(null)} fullWidth maxWidth="sm">
        <DialogTitle>Montar simulado automaticamente</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField size="small" label="Título" value={d?.titulo || ""} onChange={(e) => setD({ ...d, titulo: e.target.value })} />
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
            <TextField size="small" type="number" label="Questões" value={d?.quantidade || 10} onChange={(e) => setD({ ...d, quantidade: Number(e.target.value) })} />
            <TextField size="small" type="number" label="Duração (min)" value={d?.duracaoMin || 90} onChange={(e) => setD({ ...d, duracaoMin: Number(e.target.value) })} />
          </Box>
          <TextField select size="small" label="Curso (vazio = todos)" value={d?.programId || ""} onChange={(e) => setD({ ...d, programId: e.target.value })}><MenuItem value="">Todos os cursos</MenuItem>{cursos.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}</TextField>
          {ehEnade && geral && <FormControlLabel control={<Checkbox checked={!!d?.incluirGeral} onChange={(e) => setD({ ...d, incluirGeral: e.target.checked })} />} label="Incluir Formação Geral (25%)" />}
          <Typography variant="caption" color="text.secondary">Distribuição proporcional ao peso de cada eixo; só entram questões liberadas (aprovadas pela revisão docente).</Typography>
        </DialogContent>
        <DialogActions><Button onClick={() => setD(null)}>Cancelar</Button><Button variant="contained" disabled={!d?.titulo || d.titulo.length < 3} onClick={async () => { const x = d; const ok = await run(() => call("POST", `${X}/simulados`, { exameId, titulo: x.titulo, duracaoMin: x.duracaoMin, ...(x.programId ? { programId: x.programId } : {}), auto: { quantidade: x.quantidade, ...(x.incluirGeral && geral ? { incluirExameIds: [geral.id] } : {}) } }), "Simulado criado como rascunho."); if (ok) setD(null); }}>Criar</Button></DialogActions>
      </Dialog>
    </Section>
  );
}

// ---------------------------------------------------------------- perfis de prova
function Perfis({ exameId }: { exameId: string }) {
  const r = useApi<any>(`${X}/perfis?exameId=${exameId}`);
  const rec = useApi<any>(`${X}/recorrencia?exameId=${exameId}`);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => { r.reload(); rec.reload(); });
  const [d, setD] = useState<any>(null);
  return (
    <Box>
      {node}
      <Section title="Temas mais recorrentes (consolidado)">
        <Alert severity="warning" sx={{ mb: 1 }}>Recorrência histórica não é previsão de prova. Perfis marcados como ilustrativos são sínteses autorais, sem valor estatístico oficial.</Alert>
        <LoadBox loading={rec.loading} error={rec.error} empty={!(rec.data?.temas || []).length} emptyText="Nenhum perfil cadastrado." onRetry={rec.reload}>
          <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>{(rec.data?.temas || []).slice(0, 20).map((t: any) => <Chip key={t.tema} size="small" label={`${t.tema} · ${fmtNum(t.frequenciaMedia)}%`} color={t.recorrencia === "ALTA" ? "error" : t.recorrencia === "MEDIA" ? "warning" : "default"} />)}</Box>
        </LoadBox>
      </Section>
      <Section title="Perfis por edição/ano" actions={<Button variant="contained" onClick={() => setD({ ano: new Date().getFullYear() - 1, rotulo: "", temasTxt: "", fonteDescricao: "", ilustrativo: true })}>Novo perfil</Button>}>
        <LoadBox loading={r.loading} error={r.error} empty={!(r.data?.items || []).length} onRetry={r.reload}>
          {(r.data?.items || []).map((p: any) => (
            <Paper key={p.id} variant="outlined" sx={{ p: 1.5, mb: 1, borderRadius: 2 }}>
              <Typography sx={{ fontWeight: 700 }}>{p.ano}{p.rotulo ? ` — ${p.rotulo}` : ""} {p.ilustrativo && <Chip size="small" color="warning" label="Ilustrativo" />}</Typography>
              <Typography variant="body2" color="text.secondary">{(p.temas as any[]).length} temas · nível: {p.nivelGeral || "—"}</Typography>
              <Typography variant="body2">Estilo: {p.estiloEnunciado || "—"}</Typography>
              <Typography variant="caption" color="text.secondary">Fonte: {p.fonteDescricao}</Typography>
            </Paper>
          ))}
        </LoadBox>
      </Section>
      <Dialog open={!!d} onClose={() => setD(null)} fullWidth maxWidth="md">
        <DialogTitle>Novo perfil de prova</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 2fr" }}>
            <TextField size="small" type="number" label="Ano da edição" value={d?.ano || ""} onChange={(e) => setD({ ...d, ano: Number(e.target.value) })} />
            <TextField size="small" label="Rótulo (opcional)" value={d?.rotulo || ""} onChange={(e) => setD({ ...d, rotulo: e.target.value })} />
          </Box>
          <TextField multiline minRows={5} size="small" label="Temas (um por linha: tema; frequência %)" placeholder={"Sigilo profissional; 12\nMandado de segurança; 8"} value={d?.temasTxt || ""} onChange={(e) => setD({ ...d, temasTxt: e.target.value })} />
          <TextField size="small" label="Estilo do enunciado" value={d?.estilo || ""} onChange={(e) => setD({ ...d, estilo: e.target.value })} />
          <TextField size="small" label="Nível geral" value={d?.nivel || ""} onChange={(e) => setD({ ...d, nivel: e.target.value })} />
          <TextField size="small" label="Fonte do levantamento (obrigatório)" helperText="Diga de onde vieram os dados: relatório público, levantamento próprio, síntese ilustrativa..." value={d?.fonteDescricao || ""} onChange={(e) => setD({ ...d, fonteDescricao: e.target.value })} />
          <FormControlLabel control={<Checkbox checked={!!d?.ilustrativo} onChange={(e) => setD({ ...d, ilustrativo: e.target.checked })} />} label="Valores ilustrativos (não são estatística oficial)" />
        </DialogContent>
        <DialogActions><Button onClick={() => setD(null)}>Cancelar</Button><Button variant="contained" disabled={!d?.temasTxt || (d?.fonteDescricao || "").length < 10} onClick={async () => {
          const temas = String(d.temasTxt).split("\n").map((l) => l.split(";")).filter((p) => p[0]?.trim()).map((p) => ({ tema: p[0].trim(), frequenciaPct: Number(String(p[1] || "0").replace(",", ".")) || 0 }));
          const ok = await run(() => call("POST", `${X}/perfis`, { exameId, ano: d.ano, rotulo: d.rotulo || "", temas, estiloEnunciado: d.estilo || undefined, nivelGeral: d.nivel || undefined, fonteDescricao: d.fonteDescricao, ilustrativo: d.ilustrativo }), "Perfil salvo."); if (ok) setD(null);
        }}>Salvar</Button></DialogActions>
      </Dialog>
    </Box>
  );
}

// ---------------------------------------------------------------- descritores
function Descritores({ exameId }: { exameId: string }) {
  const r = useApi<any>(`${X}/descritores?exameId=${exameId}`);
  const eixos = useApi<any>(`/desempenho/eixos?exameId=${exameId}&pageSize=200`);
  const nome = new Map<string, string>(((eixos.data?.items || eixos.data || []) as any[]).map((e) => [e.id, e.nome]));
  const { toast, node } = useToast();
  const run = useRunner(toast, r.reload);
  const [d, setD] = useState<any>(null);
  return (
    <Section title="Matriz de referência (descritores)" actions={<Button variant="contained" onClick={() => setD({ codigo: "", descricao: "", resumo: "" })}>Novo descritor</Button>}>
      {node}
      <LoadBox loading={r.loading} error={r.error} empty={!(r.data?.items || []).length} onRetry={r.reload}>
        {(r.data?.items || []).map((x: any) => <Paper key={x.id} variant="outlined" sx={{ p: 1.25, mb: 1, borderRadius: 2 }}><Typography><strong>{x.codigo}</strong> · <Typography component="span" variant="caption" color="text.secondary">{nome.get(x.eixoId) || "Sem eixo"}</Typography></Typography><Typography variant="body2">{x.descricao}</Typography></Paper>)}
      </LoadBox>
      <Dialog open={!!d} onClose={() => setD(null)} fullWidth maxWidth="sm">
        <DialogTitle>Novo descritor</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField select size="small" label="Eixo / área" value={d?.eixoId || ""} onChange={(e) => setD({ ...d, eixoId: e.target.value })}>{(eixos.data?.items || eixos.data || []).map((x: any) => <MenuItem key={x.id} value={x.id}>{x.nome}</MenuItem>)}</TextField>
          <TextField size="small" label="Código (ex.: D-CIVIL-2)" value={d?.codigo || ""} onChange={(e) => setD({ ...d, codigo: e.target.value })} />
          <TextField multiline minRows={2} size="small" label="Descrição (o que o estudante deve ser capaz de fazer)" value={d?.descricao || ""} onChange={(e) => setD({ ...d, descricao: e.target.value })} />
          <TextField multiline minRows={3} size="small" label="Resumo de estudo autoral (opcional)" value={d?.resumo || ""} onChange={(e) => setD({ ...d, resumo: e.target.value })} />
        </DialogContent>
        <DialogActions><Button onClick={() => setD(null)}>Cancelar</Button><Button variant="contained" disabled={!d?.codigo || (d?.descricao || "").length < 10} onClick={async () => { const ok = await run(() => call("POST", `${X}/descritores`, { exameId, eixoId: d.eixoId || undefined, codigo: d.codigo, descricao: d.descricao, resumo: d.resumo || undefined }), "Descritor criado."); if (ok) setD(null); }}>Salvar</Button></DialogActions>
      </Dialog>
    </Section>
  );
}

// ---------------------------------------------------------------- trilhas
function Trilhas({ exameId }: { exameId: string }) {
  const r = useApi<any>(`${X}/trilhas?exameId=${exameId}`);
  const cursos = useCursos();
  const { toast, node } = useToast();
  const run = useRunner(toast, r.reload);
  const [programId, setProgramId] = useState("");
  return (
    <Section title="Trilhas de estudo">
      {node}
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
        <TextField select size="small" label="Curso (opcional)" value={programId} onChange={(e) => setProgramId(e.target.value)} sx={{ minWidth: 240 }}><MenuItem value="">Todos os cursos</MenuItem>{cursos.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}</TextField>
        <Button variant="contained" onClick={() => run(() => call("POST", `${X}/trilhas/gerar`, { exameId, ...(programId ? { programId } : {}) }).then((t) => { toast({ type: "info", text: t.aviso }); return t; }), "Trilha gerada a partir da matriz.")}>Gerar trilha da matriz</Button>
      </Box>
      <LoadBox loading={r.loading} error={r.error} empty={!(r.data?.items || []).length} onRetry={r.reload}>
        {(r.data?.items || []).map((t: any) => <Paper key={t.id} variant="outlined" sx={{ p: 1.25, mb: 1, borderRadius: 2, display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}><Box sx={{ flex: 1, minWidth: 200 }}><Typography sx={{ fontWeight: 700 }}>{t.titulo}</Typography><Typography variant="caption" color="text.secondary">{t.area || "geral"} · {t.totalEtapas} etapas{t.geradaPorIa ? " · orientações de IA" : ""}</Typography></Box><Status value={t.ativo ? "ATIVO" : "INATIVO"} />{t.ativo && <Button size="small" onClick={() => run(() => call("PATCH", `${X}/trilhas/${t.id}`, { ativo: false }), "Trilha desativada.")}>Desativar</Button>}</Paper>)}
      </LoadBox>
    </Section>
  );
}

// ---------------------------------------------------------------- configurações
function Config({ config, recarregar }: { config?: { revisaoDocenteObrigatoria: boolean; rankingAtivo: boolean }; recarregar: () => void }) {
  const c = useApi<any>(`${X}/config`);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => { c.reload(); recarregar(); });
  const [lim, setLim] = useState<{ risco: string; meta: string }>({ risco: "", meta: "" });
  useEffect(() => { if (c.data) setLim({ risco: String(c.data.limiteRiscoPct), meta: String(c.data.metaProntidaoPct) }); }, [c.data]);
  void config;
  return (
    <Section title="Configurações do módulo">
      {node}
      <LoadBox loading={c.loading} error={c.error} onRetry={c.reload}>
        {c.data && (
          <Box sx={{ display: "grid", gap: 1 }}>
            <FormControlLabel control={<Checkbox checked={c.data.revisaoDocenteObrigatoria} onChange={(e) => run(() => call("PUT", `${X}/config`, { revisaoDocenteObrigatoria: e.target.checked }), "Configuração salva.")} />} label="Revisão docente obrigatória para questões geradas por IA (recomendado)" />
            <Typography variant="caption" color="text.secondary" sx={{ ml: 4 }}>Desligada, as questões de IA ficam visíveis aos alunos já marcadas como "não revisadas".</Typography>
            <FormControlLabel control={<Checkbox checked={c.data.rankingAtivo} onChange={(e) => run(() => call("PUT", `${X}/config`, { rankingAtivo: e.target.checked }), "Configuração salva.")} />} label="Habilitar ranking por turma (opcional para o aluno, que precisa consentir)" />
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mt: 1 }}>
              <TextField size="small" type="number" label="Limite de risco (%)" value={lim.risco} onChange={(e) => setLim({ ...lim, risco: e.target.value })} />
              <TextField size="small" type="number" label="Meta de prontidão (%)" value={lim.meta} onChange={(e) => setLim({ ...lim, meta: e.target.value })} />
              <Button variant="contained" onClick={() => run(() => call("PUT", `${X}/config`, { limiteRiscoPct: Number(lim.risco), metaProntidaoPct: Number(lim.meta) }), "Limites salvos.")}>Salvar limites</Button>
            </Box>
          </Box>
        )}
      </LoadBox>
    </Section>
  );
}
