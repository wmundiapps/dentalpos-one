import { Alert, Box, Button, Chip, Paper, Tab, Tabs, TextField, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import {
  Bar, DataList, FormDialog, Kpi, KpiRow, LoadBox, Pick, Section, Status, call, fmtNum, itemsOf, label, qsOf, useApi, useIsMobile, useRunner, useToast, Flag, NIVEL_ROTULO,
} from "./kit";
import { StudentPicker } from "../desempenho/kit";

const REGIMES = [{ value: "SERIADO_ANUAL", label: "Seriado anual" }, { value: "SERIADO_SEMESTRAL", label: "Seriado semestral" }, { value: "BIMESTRAL", label: "Bimestral" }, { value: "MODULAR", label: "Modular (pós)" }, { value: "CREDITOS", label: "Por créditos" }, { value: "LIVRE", label: "Curso livre" }];
const TIPOS_PER = [{ value: "SEMESTRE", label: "Semestre" }, { value: "ANO", label: "Ano" }, { value: "BIMESTRE", label: "Bimestre" }, { value: "TRIMESTRE", label: "Trimestre" }, { value: "MODULO", label: "Módulo" }, { value: "PERIODO", label: "Período" }];
const TIPOS_ITEM = ["OBRIGATORIA", "OPTATIVA", "ELETIVA", "ESTAGIO", "TCC", "ATIVIDADE_COMPLEMENTAR", "EXTENSAO"];
const COR_TIPO: Record<string, string> = { OBRIGATORIA: "#0F5FDB", OPTATIVA: "#7c3aed", ELETIVA: "#9333ea", ESTAGIO: "#0d9488", TCC: "#b45309", ATIVIDADE_COMPLEMENTAR: "#64748b", EXTENSAO: "#0891b2" };
const COR_STATUS: Record<string, string> = { CONCLUIDA: "#2e9e5b", EM_CURSO: "#0F5FDB", DISPONIVEL: "#e0a100", BLOQUEADA: "#94a3b8" };

export default function MatrizesPage() {
  const [programId, setProgramId] = useState("");
  const [sel, setSel] = useState<string>("");
  const [rev, setRev] = useState(0);
  const [novo, setNovo] = useState(false);
  const [perfil, setPerfil] = useState(false);
  const { toast, node } = useToast();
  const cursos = useApi<any>("/academico/cursos", [rev]);
  const lista = useApi<any>(`/academico/matrizes?${qsOf({ programId })}`, [rev]);
  const ms = itemsOf(lista.data);
  const cursoSel = itemsOf(cursos.data).find((c: any) => c.id === programId);

  return (
    <Box>
      {node}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2, display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <Pick label="Curso" value={programId} onChange={(v) => { setProgramId(v); setSel(""); }} all="Todos os cursos" minWidth={240} options={itemsOf(cursos.data).map((c: any) => ({ value: c.id, label: c.nome }))} />
        {cursoSel && <Box><Flag color="info">{NIVEL_ROTULO[cursoSel.perfil?.nivel ?? "GRADUACAO"] ?? "Graduação"}</Flag><Flag>{label(cursoSel.perfil?.regime ?? "SERIADO_SEMESTRAL")}</Flag></Box>}
        {programId && <Button size="small" onClick={() => setPerfil(true)}>Nível e regime do curso</Button>}
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" disabled={!programId} onClick={() => setNovo(true)}>Nova matriz</Button>
      </Paper>
      {!programId && <Alert severity="info" sx={{ mb: 2 }}>Escolha um curso para criar uma matriz. Graduação seriada (anual/semestral), pós modular, cursos livres e regime por créditos são suportados.</Alert>}
      <LoadBox loading={lista.loading} error={lista.error} empty={!ms.length} emptyText="Nenhuma matriz cadastrada." onRetry={lista.reload}>
        <Box sx={{ display: "flex", gap: 1.5, overflowX: "auto", pb: 1, mb: 2 }}>
          {ms.map((m: any) => (
            <Paper key={m.id} variant="outlined" onClick={() => setSel(m.id)} sx={{ p: 1.5, borderRadius: 3, minWidth: 230, cursor: "pointer", borderColor: sel === m.id ? "primary.main" : undefined, borderWidth: sel === m.id ? 2 : 1 }}>
              <Typography sx={{ fontWeight: 800 }}>{m.nome}</Typography>
              <Typography variant="caption" color="text.secondary" component="div">{m.curso} · v{m.versao}</Typography>
              <Box sx={{ mt: 0.5 }}><Status value={m.status} /> <Flag>{label(m.regime)}</Flag></Box>
              <Typography variant="caption">{m._count.periodos} períodos · {m._count.itens} disciplinas · {m.cargaHorariaTotal}h</Typography>
            </Paper>
          ))}
        </Box>
      </LoadBox>
      {sel && <MatrizDetalhe key={sel} id={sel} onChanged={() => setRev((x) => x + 1)} />}
      {!sel && ms.length > 0 && <Alert severity="info">Selecione uma matriz para ver o fluxograma, editar a estrutura e simular a integralização de um aluno.</Alert>}
      <FormDialog open={novo} title="Nova matriz curricular" maxWidth="sm" fields={[
        { key: "nome", label: "Nome", required: true }, { key: "versao", label: "Versão", required: true }, { key: "regime", label: "Regime", type: "select", options: REGIMES, required: true },
        { key: "horasComplementaresMin", label: "Horas complementares mínimas", type: "number" }, { key: "observacao", label: "Observações", type: "textarea" },
      ]} initial={{ versao: "2026.1", regime: cursoSel?.perfil?.regime ?? "SERIADO_SEMESTRAL", horasComplementaresMin: 0 }} onClose={() => setNovo(false)}
        onSubmit={async (b) => { const m = await call<any>("POST", "/academico/matrizes", { ...b, programId }); setSel(m.id); setRev((x) => x + 1); toast({ type: "success", text: "Matriz criada. Adicione períodos e disciplinas na aba Estrutura." }); }} />
      <FormDialog open={perfil} title="Nível e regime do curso" maxWidth="sm" fields={[
        { key: "nivel", label: "Nível", type: "select", required: true, options: Object.entries(NIVEL_ROTULO).filter(([k]) => ["GRADUACAO", "TECNOLOGO", "POS_LATO", "POS_STRICTO", "LIVRE", "TECNICO"].includes(k)).map(([value, label]) => ({ value, label })) },
        { key: "regime", label: "Regime", type: "select", options: REGIMES, required: true }, { key: "duracaoPeriodos", label: "Duração (períodos)", type: "number" },
      ]} initial={cursoSel?.perfil ?? { nivel: "GRADUACAO", regime: "SERIADO_SEMESTRAL" }} onClose={() => setPerfil(false)}
        onSubmit={async (b) => { await call("PUT", `/academico/cursos/${programId}/perfil`, b); setRev((x) => x + 1); toast({ type: "success", text: "Perfil do curso salvo." }); }} />
    </Box>
  );
}

function MatrizDetalhe({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [tab, setTab] = useState(0);
  const [rev, setRev] = useState(0);
  const { toast, node } = useToast();
  const refresh = () => { setRev((x) => x + 1); onChanged(); };
  const run = useRunner(toast, refresh);
  const det = useApi<any>(`/academico/matrizes/${id}`, [rev]);
  const flux = useApi<any>(`/academico/matrizes/${id}/fluxograma`, [rev]);
  const [alunoSim, setAlunoSim] = useState("");
  const [assumir, setAssumir] = useState<string[]>([]);
  const [cargaMax, setCargaMax] = useState("");
  const sim = useApi<any>(alunoSim ? `/academico/matrizes/${id}/simular?${qsOf({ studentId: alunoSim, assumirAprovadas: assumir.join(","), cargaMaxPeriodo: cargaMax })}` : null, [rev]);
  const m = det.data;
  const status = useMemo(() => { const mp: Record<string, string> = {}; for (const i of sim.data?.itens ?? []) mp[i.id] = i.status; return mp; }, [sim.data]);
  const [dlg, setDlg] = useState<null | "periodo" | "item" | "pre" | "dup" | "eq">(null);
  const discs = useApi<any>(dlg === "item" || dlg === "eq" ? "/academico/disciplines" : null);
  const itensPlano = (m?.periodos ?? []).flatMap((p: any) => p.itens.map((i: any) => ({ value: i.id, label: `${p.rotulo} — ${i.disciplina}` })));
  const eqs = useApi<any>(tab === 4 ? "/academico/equivalencias" : null, [rev]);
  const editavel = m && m.status !== "ARQUIVADA";

  return (
    <Section title={m ? `${m.nome} (v${m.versao})` : "Matriz"} actions={m && <>
      <Status value={m.status} />
      {m.status === "RASCUNHO" && <Button variant="contained" size="small" onClick={() => run(() => call("POST", `/academico/matrizes/${id}/publicar`, {}), "Matriz publicada como vigente.", "Publicar esta matriz? A versão vigente anterior será arquivada.")}>Publicar</Button>}
      <Button size="small" variant="outlined" onClick={() => setDlg("dup")}>Duplicar como nova versão</Button>
      {m.status === "RASCUNHO" && <Button size="small" color="error" onClick={() => run(() => call("DELETE", `/academico/matrizes/${id}`), "Matriz excluída.", "Excluir esta matriz em rascunho?")}>Excluir</Button>}
    </>}>
      {node}
      <LoadBox loading={det.loading} error={det.error} onRetry={det.reload}>
        {m && (
          <>
            <KpiRow>
              <Kpi title="Carga horária obrigatória" value={`${m.cargaHorariaTotal} h`} />
              <Kpi title="Créditos" value={m.creditosTotal} />
              <Kpi title="Períodos" value={m.periodos.length} />
              <Kpi title="Horas complementares mín." value={`${m.horasComplementaresMin} h`} />
            </KpiRow>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
              {["Fluxograma", "Estrutura", "Simulador de integralização", "Validação", "Equivalências"].map((t) => <Tab key={t} label={t} />)}
            </Tabs>
            {tab === 0 && (
              <>
                {sim.data && <Alert severity="info" sx={{ mb: 1 }}>Cores do simulador para <b>{sim.data.aluno.nomeCompleto}</b>: verde concluída · azul cursando · amarelo disponível · cinza bloqueada.</Alert>}
                <Fluxograma data={flux.data} loading={flux.loading} error={flux.error} status={status} onRetry={flux.reload} />
              </>
            )}
            {tab === 1 && (
              <Box>
                {editavel && <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
                  <Button variant="outlined" onClick={() => setDlg("periodo")}>Adicionar períodos</Button>
                  <Button variant="outlined" disabled={!m.periodos.length} onClick={() => setDlg("item")}>Adicionar disciplina</Button>
                  <Button variant="outlined" disabled={m.periodos.flatMap((p: any) => p.itens).length < 2} onClick={() => setDlg("pre")}>Definir pré-requisito</Button>
                </Box>}
                {!m.periodos.length && <Alert severity="info">Comece adicionando períodos (semestres, bimestres, módulos ou anos).</Alert>}
                {m.periodos.map((p: any) => (
                  <Paper key={p.id} variant="outlined" sx={{ p: 1.5, mb: 1.5, borderRadius: 3 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography sx={{ fontWeight: 800, flex: 1 }}>{p.rotulo} <Typography component="span" variant="caption" color="text.secondary">({label(p.tipo)})</Typography></Typography>
                      {editavel && !p.itens.length && <Button size="small" color="error" onClick={() => run(() => call("DELETE", `/academico/periodos/${p.id}`), "Período removido.")}>Remover</Button>}
                    </Box>
                    {p.itens.length ? <DataList rows={p.itens} columns={[
                      { label: "Disciplina", primary: true, render: (i: any) => i.disciplina }, { label: "Tipo", render: (i: any) => <Chip size="small" sx={{ bgcolor: COR_TIPO[i.tipo], color: "#fff" }} label={label(i.tipo)} /> },
                      { label: "CH", render: (i: any) => `${i.cargaHoraria}h` }, { label: "Créditos", render: (i: any) => i.creditos },
                      { label: "Requisitos", render: (i: any) => (i.prerequisitos.length ? i.prerequisitos.map((q: any) => <Chip key={q.id} size="small" sx={{ mr: 0.5 }} onDelete={editavel ? () => run(() => call("DELETE", `/academico/prerequisitos/${q.id}`), "Vínculo removido.") : undefined} label={q.tipo === "CARGA_MIN" ? `≥ ${q.cargaMinima}h` : `${q.tipo}: ${itensPlano.find((x: any) => x.value === q.requisitoItemId)?.label.split(" — ")[1] ?? "?"}`} />) : "—") },
                    ]} actions={editavel ? (i: any) => <Button size="small" color="error" onClick={() => run(() => call("DELETE", `/academico/itens/${i.id}`), "Disciplina removida.", "Remover da matriz (e seus vínculos)?")}>Remover</Button> : undefined} /> : <Typography variant="body2" color="text.secondary">Sem disciplinas.</Typography>}
                  </Paper>
                ))}
              </Box>
            )}
            {tab === 2 && (
              <Box>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: 2, mb: 2 }}>
                  <StudentPicker value={alunoSim} onChange={(v) => { setAlunoSim(v); setAssumir([]); }} label="Aluno a simular" />
                  <TextField size="small" label="Carga máxima por período (h)" type="number" value={cargaMax} onChange={(e) => setCargaMax(e.target.value)} helperText="Opcional: limita o plano de períodos" />
                </Box>
                {!alunoSim && <Alert severity="info">Escolha um aluno para ver o que já foi integralizado, o que está disponível e uma projeção de períodos até a formatura.</Alert>}
                <LoadBox loading={sim.loading && !!alunoSim} error={sim.error} onRetry={sim.reload}>
                  {sim.data && <Simulacao s={sim.data} assumir={assumir} setAssumir={setAssumir} />}
                </LoadBox>
              </Box>
            )}
            {tab === 3 && <Validacao v={flux.data?.validacao} loading={flux.loading} />}
            {tab === 4 && (
              <Box>
                <Button variant="outlined" sx={{ mb: 1.5 }} onClick={() => setDlg("eq")}>Nova equivalência</Button>
                <LoadBox loading={eqs.loading} error={eqs.error} empty={!itemsOf(eqs.data).length} emptyText="Nenhuma equivalência cadastrada." onRetry={eqs.reload}>
                  <DataList rows={itemsOf(eqs.data)} columns={[{ label: "Disciplina", primary: true, render: (e: any) => e.disciplina }, { label: "Equivale a", render: (e: any) => e.equivalente }, { label: "Aproveitamento", render: (e: any) => `${e.percentual}%` }, { label: "Sentido", render: (e: any) => (e.bidirecional ? "Nos dois sentidos" : "Um sentido") }]}
                    actions={(e: any) => <Button size="small" color="error" onClick={() => run(() => call("DELETE", `/academico/equivalencias/${e.id}`), "Equivalência removida.")}>Remover</Button>} />
                </LoadBox>
              </Box>
            )}
          </>
        )}
      </LoadBox>
      <FormDialog open={dlg === "periodo"} title="Adicionar períodos" maxWidth="sm" fields={[{ key: "tipo", label: "Tipo", type: "select", options: TIPOS_PER, required: true }, { key: "quantidade", label: "Quantidade", type: "number", required: true, helper: "Ex.: 8 semestres, 4 módulos, 6 bimestres" }]} initial={{ tipo: m?.regime === "MODULAR" ? "MODULO" : m?.regime === "BIMESTRAL" ? "BIMESTRE" : m?.regime === "SERIADO_ANUAL" ? "ANO" : "SEMESTRE", quantidade: 4 }} onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", `/academico/matrizes/${id}/periodos`, b); refresh(); }} />
      <FormDialog open={dlg === "item"} title="Adicionar disciplina" maxWidth="sm" fields={[
        { key: "periodoId", label: "Período", type: "select", required: true, options: (m?.periodos ?? []).map((p: any) => ({ value: p.id, label: p.rotulo })) },
        { key: "disciplineId", label: "Disciplina", type: "select", required: true, options: (itemsOf(discs.data)).map((d: any) => ({ value: d.id, label: `${d.nome} (${d.cargaHoraria}h)` })) },
        { key: "tipo", label: "Tipo", type: "select", options: TIPOS_ITEM, required: true }, { key: "creditos", label: "Créditos", type: "number" }, { key: "grupoOptativas", label: "Grupo de optativas (opcional)" },
      ]} initial={{ tipo: "OBRIGATORIA" }} onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", `/academico/matrizes/${id}/itens`, b); refresh(); }} />
      <FormDialog open={dlg === "pre"} title="Pré-requisito, co-requisito ou carga mínima" maxWidth="sm" fields={[
        { key: "itemId", label: "Disciplina", type: "select", required: true, options: itensPlano },
        { key: "tipo", label: "Tipo", type: "select", required: true, options: [{ value: "PRE", label: "Pré-requisito (aprovação anterior)" }, { value: "CO", label: "Co-requisito (cursar junto)" }, { value: "CARGA_MIN", label: "Carga horária mínima integralizada" }] },
        { key: "requisitoItemId", label: "Exige a disciplina", type: "select", options: itensPlano, hidden: (v) => v.tipo === "CARGA_MIN" }, { key: "cargaMinima", label: "Carga mínima (h)", type: "number", hidden: (v) => v.tipo !== "CARGA_MIN" },
      ]} initial={{ tipo: "PRE" }} onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", `/academico/matrizes/${id}/prerequisitos`, b); refresh(); }} />
      <FormDialog open={dlg === "dup"} title="Duplicar matriz" maxWidth="sm" fields={[{ key: "versao", label: "Nova versão", required: true }]} initial={{ versao: `${new Date().getFullYear() + 1}.1` }} onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", `/academico/matrizes/${id}/duplicar`, b); refresh(); toast({ type: "success", text: "Nova versão criada em rascunho (use o seletor acima)." }); }} />
      <FormDialog open={dlg === "eq"} title="Nova equivalência de disciplinas" maxWidth="sm" fields={[
        { key: "disciplineId", label: "Disciplina", type: "select", required: true, options: itemsOf(discs.data).map((d: any) => ({ value: d.id, label: d.nome })) },
        { key: "equivalenteId", label: "Equivale a", type: "select", required: true, options: itemsOf(discs.data).map((d: any) => ({ value: d.id, label: d.nome })) },
        { key: "percentual", label: "Aproveitamento (%)", type: "number" }, { key: "bidirecional", label: "Vale nos dois sentidos", type: "bool" },
      ]} initial={{ percentual: 100, bidirecional: true }} onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", "/academico/equivalencias", b); refresh(); }} />
    </Section>
  );
}

function Validacao({ v, loading }: { v: any; loading: boolean }) {
  if (loading) return null;
  if (!v) return null;
  return (
    <Box>
      <Alert severity={v.ok ? "success" : "error"} sx={{ mb: 1.5 }}>{v.ok ? "Matriz consistente: pode ser publicada." : "A matriz tem erros que impedem a publicação."}</Alert>
      {v.problemas.map((p: any, i: number) => <Alert key={i} severity={p.nivel === "ERRO" ? "error" : "warning"} sx={{ mb: 1 }}>{p.texto}</Alert>)}
      <Typography variant="body2" color="text.secondary">Carga horária obrigatória somada: {v.cargaObrigatoria}h.</Typography>
    </Box>
  );
}

function Simulacao({ s, assumir, setAssumir }: { s: any; assumir: string[]; setAssumir: (x: string[]) => void }) {
  return (
    <Box>
      <KpiRow>
        <Kpi title="Integralizado" value={`${fmtNum(s.percentual)}%`} hint={`${s.chConcluida}h de ${s.chObrigatoria}h obrigatórias`} color="#2e9e5b" />
        <Kpi title="Faltam" value={`${s.chRestante}h`} />
        <Kpi title="Períodos restantes" value={s.periodosRestantes} hint="projeção respeitando pré-requisitos" />
        <Kpi title="Complementares" value={`${s.complementaresValidadas}/${s.complementaresMin}h`} color={s.complementaresFaltam ? "#e0a100" : "#2e9e5b"} />
      </KpiRow>
      <Bar value={s.percentual} color="#2e9e5b" label="Progresso até a formatura" right={`${fmtNum(s.percentual)}%`} />
      {s.pendenciasFormatura.length ? <Alert severity="warning" sx={{ my: 1.5 }}>{s.pendenciasFormatura.map((p: string) => <div key={p}>{p}</div>)}</Alert> : <Alert severity="success" sx={{ my: 1.5 }}>Sem pendências de integralização.</Alert>}
      <Typography sx={{ fontWeight: 800, mt: 2, mb: 1 }}>Situação por disciplina (marque para simular “e se eu passar nesta?”)</Typography>
      <DataList rows={s.itens} columns={[
        { label: "Disciplina", primary: true, render: (i: any) => i.nome }, { label: "Período", render: (i: any) => `${i.periodoOrdem}º` }, { label: "CH", render: (i: any) => `${i.cargaHoraria}h` },
        { label: "Situação", render: (i: any) => <Chip size="small" sx={{ bgcolor: COR_STATUS[i.status], color: "#fff" }} label={label(i.status)} /> }, { label: "Falta", render: (i: any) => i.faltam.join("; ") || "—" },
      ]} actions={(i: any) => ["DISPONIVEL", "BLOQUEADA", "EM_CURSO"].includes(i.status) ? <Button size="small" variant={assumir.includes(i.id) ? "contained" : "outlined"} onClick={() => setAssumir(assumir.includes(i.id) ? assumir.filter((x) => x !== i.id) : [...assumir, i.id])}>{assumir.includes(i.id) ? "Simulando aprovação" : "E se passar?"}</Button> : null} />
      <Typography sx={{ fontWeight: 800, mt: 2, mb: 1 }}>Plano projetado</Typography>
      {s.plano.length ? s.plano.map((p: any) => <Paper key={p.periodo} variant="outlined" sx={{ p: 1.2, mb: 1, borderRadius: 2 }}><Typography sx={{ fontWeight: 700 }}>Período {p.periodo} · {p.ch}h</Typography><Typography variant="body2">{p.itens.map((i: any) => i.nome).join(" · ")}</Typography></Paper>) : <Typography color="text.secondary">Nada a planejar.</Typography>}
      <Typography variant="caption" color="text.secondary">{s.aviso}</Typography>
    </Box>
  );
}

/** Fluxograma gráfico: uma coluna por período (módulo/bimestre/semestre/ano), setas de pré-requisito (cinza) e co-requisito (tracejada); caminho crítico em vermelho. */
function Fluxograma({ data, loading, error, status, onRetry }: { data: any; loading: boolean; error: string | null; status: Record<string, string>; onRetry: () => void }) {
  const mobile = useIsMobile();
  const W = mobile ? 168 : 208, H = 58, GX = mobile ? 40 : 64, GY = 14, TOP = 46;
  return (
    <LoadBox loading={loading} error={error} empty={!data?.colunas?.length} emptyText="Cadastre períodos e disciplinas na aba Estrutura para ver o fluxograma." onRetry={onRetry}>
      {data && (() => {
        const pos = new Map<string, { x: number; y: number }>();
        data.colunas.forEach((c: any, ci: number) => c.itens.forEach((it: any, ri: number) => pos.set(it.id, { x: ci * (W + GX) + 10, y: TOP + ri * (H + GY) })));
        const rows = Math.max(1, ...data.colunas.map((c: any) => c.itens.length));
        const width = data.colunas.length * (W + GX) + 20, height = TOP + rows * (H + GY) + 10;
        return (
          <Box>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 1, fontSize: 13 }}>
              <span><b style={{ color: "#d64545" }}>━</b> caminho crítico</span><span><b style={{ color: "#64748b" }}>━</b> pré-requisito</span><span><b style={{ color: "#e07b00" }}>┅</b> co-requisito</span>
              {Object.entries(COR_TIPO).slice(0, 3).map(([k, c]) => <span key={k}><b style={{ color: c }}>■</b> {label(k)}</span>)}
              <Button size="small" onClick={() => window.print()}>Imprimir</Button>
            </Box>
            <Box sx={{ overflow: "auto", border: "1px solid", borderColor: "divider", borderRadius: 2, maxHeight: "70vh" }} role="img" aria-label="Fluxograma da matriz curricular">
              <svg width={width} height={height} style={{ display: "block", minWidth: width }}>
                <defs>
                  <marker id="seta" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#64748b" /></marker>
                  <marker id="setaC" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#d64545" /></marker>
                </defs>
                {data.colunas.map((c: any, ci: number) => (
                  <g key={c.periodoId}>
                    <rect x={ci * (W + GX) + 4} y={4} width={W + 12} height={32} rx={8} fill="#eef2f7" />
                    <text x={ci * (W + GX) + 10 + W / 2} y={25} textAnchor="middle" fontSize={13} fontWeight={800} fill="#1e293b">{c.rotulo} · {c.cargaHoraria}h</text>
                  </g>
                ))}
                {data.arestas.map((a: any) => {
                  const p1 = pos.get(a.de), p2 = pos.get(a.para);
                  if (!p1 || !p2) return null;
                  const x1 = p1.x + W, y1 = p1.y + H / 2, x2 = p2.x, y2 = p2.y + H / 2;
                  const same = Math.abs(p1.x - p2.x) < 1;
                  const d = same ? `M${p1.x + W / 2},${p1.y + H} L${p2.x + W / 2},${p2.y}` : `M${x1},${y1} C${x1 + GX / 2},${y1} ${x2 - GX / 2},${y2} ${x2 - 2},${y2}`;
                  const cor = a.critico ? "#d64545" : a.tipo === "CO" ? "#e07b00" : "#64748b";
                  return <path key={a.id} d={d} fill="none" stroke={cor} strokeWidth={a.critico ? 2.4 : 1.4} strokeDasharray={a.tipo === "CO" ? "5 4" : undefined} markerEnd={a.critico ? "url(#setaC)" : "url(#seta)"} opacity={0.9} />;
                })}
                {data.colunas.flatMap((c: any) => c.itens.map((it: any) => {
                  const p = pos.get(it.id)!;
                  const st = status[it.id];
                  const fill = st ? COR_STATUS[st] : COR_TIPO[it.tipo] ?? "#0F5FDB";
                  return (
                    <g key={it.id}>
                      <title>{`${it.nome} — ${it.cargaHoraria}h${st ? ` (${label(st)})` : ""}`}</title>
                      <rect x={p.x} y={p.y} width={W} height={H} rx={10} fill={fill} stroke={it.critico ? "#d64545" : "none"} strokeWidth={3} />
                      <text x={p.x + 8} y={p.y + 22} fontSize={12} fontWeight={700} fill="#fff">{it.nome.length > (mobile ? 22 : 28) ? it.nome.slice(0, mobile ? 21 : 27) + "…" : it.nome}</text>
                      <text x={p.x + 8} y={p.y + 42} fontSize={11} fill="#fff" opacity={0.92}>{it.cargaHoraria}h · {it.creditos} cr · {label(it.tipo).toLowerCase()}</text>
                    </g>
                  );
                }))}
              </svg>
            </Box>
            <Typography variant="caption" color="text.secondary">{data.colunas.reduce((s: number, c: any) => s + c.itens.length, 0)} disciplinas · {data.arestas.length} vínculos · caminho crítico de {data.caminhoCritico.length} disciplinas encadeadas.</Typography>
          </Box>
        );
      })()}
    </LoadBox>
  );
}
