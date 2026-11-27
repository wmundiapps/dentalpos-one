import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Pagination, Paper, Tab, Tabs, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useState } from "react";
import {
  ActionsMenu, Bar, DataList, FormDialog, Kpi, KpiRow, LoadBox, Pick, Section, Status, call, fmtDate, fmtDateTime, fmtNum, fmtPct, itemsOf, label, qsOf, useApi, useIsMobile, useRunner, useToast, type FormField, Flag,
} from "./kit";
import { StudentPicker } from "../desempenho/kit";

const ABAS = ["Programas e preparatórios", "Competências e plano individual", "Acompanhamento", "Avaliação global", "Orientações", "Indicadores"];
const TIPOS = ["PREPARATORIO", "DIDATICO", "PEDAGOGICO", "DESENVOLVIMENTO_PESSOAL", "MENTORIA", "NIVELAMENTO"];
const ALVOS = ["ENADE", "ENAMED", "OAB", "MESTRADO", "DOUTORADO", "CONCURSO", "OUTRO"];

export default function DesenvolvimentoPage() {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>{ABAS.map((t) => <Tab key={t} label={t} />)}</Tabs>
      {tab === 0 && <Programas />}
      {tab === 1 && <Competencias />}
      {tab === 2 && <Acompanhamento />}
      {tab === 3 && <AvaliacaoGlobal onOrient={() => setTab(4)} />}
      {tab === 4 && <Orientacoes />}
      {tab === 5 && <Indicadores />}
    </Box>
  );
}

// ------------------------------------------------------------------ programas
function Programas() {
  const [rev, setRev] = useState(0);
  const [tipo, setTipo] = useState("");
  const [page, setPage] = useState(1);
  const [novo, setNovo] = useState(false);
  const [det, setDet] = useState<string | null>(null);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const l = useApi<any>(`/desenvolvimento/programas?${qsOf({ tipo, page, pageSize: 20 })}`, [rev]);
  const exames = useApi<any>("/desempenho/exames?pageSize=100");
  const campos: FormField[] = [
    { key: "codigo", label: "Código", required: true }, { key: "nome", label: "Nome", required: true }, { key: "tipo", label: "Tipo", type: "select", options: TIPOS, required: true },
    { key: "alvo", label: "Alvo do preparatório", type: "select", options: ALVOS, hidden: (v) => v.tipo !== "PREPARATORIO" },
    { key: "exameId", label: "Exame / banco de questões vinculado", type: "select", options: itemsOf(exames.data).map((e: any) => ({ value: e.id, label: e.nome })), helper: "Usa o banco de questões e os simulados do módulo ENADE/OAB" },
    { key: "inicio", label: "Início", type: "date" }, { key: "fim", label: "Fim", type: "date" }, { key: "vagas", label: "Vagas", type: "number" }, { key: "metaPercentual", label: "Meta de acerto (%)", type: "number" },
    { key: "rankingAtivo", label: "Habilitar ranking opcional (só aparece quem consentir)", type: "bool", full: true }, { key: "descricao", label: "Descrição", type: "textarea" },
  ];
  return (
    <Section title="Programas de incentivo e desenvolvimento" actions={<Button variant="contained" onClick={() => setNovo(true)}>Novo programa</Button>}>
      {node}
      <Box sx={{ mb: 2 }}><Pick label="Tipo" value={tipo} onChange={(v) => { setTipo(v); setPage(1); }} all="Todos" options={TIPOS.map((t) => ({ value: t, label: label(t) }))} /></Box>
      <LoadBox loading={l.loading} error={l.error} empty={!itemsOf(l.data).length} emptyText="Nenhum programa cadastrado." onRetry={l.reload}>
        <DataList rows={itemsOf(l.data)} onRowClick={(p: any) => setDet(p.id)} columns={[
          { label: "Programa", primary: true, render: (p: any) => <span>{p.nome}<Typography variant="caption" color="text.secondary" component="div">{p.codigo}</Typography></span> },
          { label: "Tipo", render: (p: any) => <span>{label(p.tipo)} {p.alvo && <Flag color="info">{p.alvo}</Flag>}</span> }, { label: "Status", render: (p: any) => <Status value={p.status} /> },
          { label: "Inscritos", render: (p: any) => `${p.inscritos}${p.vagas ? `/${p.vagas}` : ""}` }, { label: "Período", render: (p: any) => `${fmtDate(p.inicio)} a ${fmtDate(p.fim)}` },
          { label: "Ranking", hideOnMobile: true, render: (p: any) => (p.rankingAtivo ? "Opcional" : "—") },
        ]} actions={(p: any) => <ActionsMenu items={[{ label: "Abrir", onClick: () => setDet(p.id) }, { label: "Abrir inscrições", show: p.status === "RASCUNHO", onClick: () => run(() => call("POST", `/desenvolvimento/programas/${p.id}/status`, { status: "ABERTO" }), "Inscrições abertas.") }, { label: "Iniciar", show: p.status === "ABERTO", onClick: () => run(() => call("POST", `/desenvolvimento/programas/${p.id}/status`, { status: "EM_ANDAMENTO" }), "Programa em andamento.") }, { label: "Encerrar", show: ["ABERTO", "EM_ANDAMENTO"].includes(p.status), color: "error", onClick: () => run(() => call("POST", `/desenvolvimento/programas/${p.id}/status`, { status: "ENCERRADO" }), "Programa encerrado.", "Encerrar o programa? As inscrições ativas serão concluídas.") }]} />} />
        <Pagination sx={{ mt: 2 }} count={Math.max(1, Math.ceil((l.data?.total ?? 0) / 20))} page={page} onChange={(_, n) => setPage(n)} />
      </LoadBox>
      <FormDialog open={novo} title="Novo programa" fields={campos} initial={{ tipo: "PREPARATORIO", metaPercentual: 60 }} onClose={() => setNovo(false)} onSubmit={async (b) => { await call("POST", "/desenvolvimento/programas", b); setRev((x) => x + 1); toast({ type: "success", text: "Programa criado." }); }} />
      {det && <ProgramaDialog id={det} onClose={() => { setDet(null); setRev((x) => x + 1); }} />}
    </Section>
  );
}

function ProgramaDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [tab, setTab] = useState(0);
  const [rev, setRev] = useState(0);
  const [dlg, setDlg] = useState<null | "ativ" | "insc" | "sim" | "imp">(null);
  const mobile = useIsMobile();
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const p = useApi<any>(`/desenvolvimento/programas/${id}`, [rev]);
  const painel = useApi<any>(`/desenvolvimento/programas/${id}/painel`, [rev]);
  const insc = useApi<any>(tab === 1 ? `/desenvolvimento/programas/${id}/inscricoes` : null, [rev]);
  const rank = useApi<any>(tab === 2 && p.data?.rankingAtivo ? `/desenvolvimento/programas/${id}/ranking` : null, [rev]);
  const x = p.data, pn = painel.data;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg" fullScreen={mobile}>
      <DialogTitle sx={{ display: "flex", alignItems: "center" }}><Box sx={{ flex: 1 }}>{x?.nome ?? "Programa"} {x && <Status value={x.status} />}</Box><IconButton onClick={onClose} aria-label="Fechar"><CloseIcon /></IconButton></DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={p.loading} error={p.error} onRetry={p.reload}>
          {x && (
            <>
              <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>{["Painel e desempenho por área", "Inscritos", "Ranking", "Cronograma"].map((t) => <Tab key={t} label={t} />)}</Tabs>
              {tab === 0 && pn && (
                <Box>
                  <KpiRow>
                    <Kpi title="Inscritos ativos" value={pn.inscritos.ativos} hint={`${pn.inscritos.listaEspera} em espera`} /><Kpi title="Progresso médio" value={fmtPct(pn.progressoMedio)} />
                    <Kpi title="Média nos simulados" value={fmtPct(pn.mediaSimulados)} hint={`meta ${pn.programa.metaPercentual}%`} color={pn.mediaSimulados != null && pn.mediaSimulados >= pn.programa.metaPercentual ? "#2e9e5b" : "#e0a100"} /><Kpi title="Tentativas" value={pn.tentativas} />
                  </KpiRow>
                  <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
                    {x.exameId && <Button variant="contained" onClick={() => setDlg("sim")}>Montar simulado do banco de questões</Button>}
                    {x.exameId && <Button variant="outlined" onClick={() => setDlg("imp")}>Importar questões de provas existentes</Button>}
                  </Box>
                  <Typography sx={{ fontWeight: 800, mb: 1 }}>Desempenho por área</Typography>
                  {pn.porArea.length ? pn.porArea.map((a: any) => <Bar key={a.eixoId} value={a.percentual} meta={a.meta} color={a.percentual != null && a.percentual >= a.meta ? "#2e9e5b" : "#d64545"} label={a.area} right={`${fmtPct(a.percentual)} · meta ${a.meta}% · ${a.questoes} questões`} />) : <Typography color="text.secondary">Ainda sem simulados respondidos. {x.exameId ? "Monte um simulado para medir as áreas." : "Vincule o programa a um exame para usar o banco de questões."}</Typography>}
                </Box>
              )}
              {tab === 1 && (
                <Box>
                  <Button variant="contained" sx={{ mb: 1.5 }} onClick={() => setDlg("insc")}>Inscrever aluno</Button>
                  <LoadBox loading={insc.loading} error={insc.error} empty={!itemsOf(insc.data).length} emptyText="Nenhum inscrito." onRetry={insc.reload}>
                    <DataList rows={itemsOf(insc.data)} columns={[{ label: "Aluno", primary: true, render: (i: any) => i.aluno?.nomeCompleto ?? "—" }, { label: "Status", render: (i: any) => <Status value={i.status} /> }, { label: "Progresso", render: (i: any) => <Bar value={i.progresso} label="" right={fmtPct(i.progresso, 0)} /> }, { label: "Ranking", render: (i: any) => (i.rankingOptIn ? "Participa" : "Não participa") }]} />
                  </LoadBox>
                </Box>
              )}
              {tab === 2 && (!x.rankingAtivo ? <Alert severity="info">Este programa não usa ranking. Ele é opcional e só pode ser habilitado na criação/edição do programa; mesmo habilitado, apenas alunos que consentirem aparecem.</Alert> : (
                <LoadBox loading={rank.loading} error={rank.error} empty={!itemsOf(rank.data).length} emptyText="Nenhum participante do ranking com simulados concluídos." onRetry={rank.reload}>
                  <Alert severity="info" sx={{ mb: 1.5 }}>{rank.data?.participantes} de {rank.data?.totalInscritos} inscritos participam do ranking. {rank.data?.aviso}</Alert>
                  <DataList rows={itemsOf(rank.data).map((r: any, i: number) => ({ ...r, id: String(i) }))} columns={[{ label: "Posição", primary: true, render: (r: any) => `${r.posicao}º` }, { label: "Aluno", render: (r: any) => r.aluno }, { label: "Média", render: (r: any) => fmtPct(r.percentual) }, { label: "Simulados", render: (r: any) => r.simulados }]} />
                </LoadBox>
              ))}
              {tab === 3 && (
                <Box>
                  <Button variant="contained" sx={{ mb: 1.5 }} onClick={() => setDlg("ativ")}>Nova atividade</Button>
                  <DataList rows={x.atividades} columns={[{ label: "Atividade", primary: true, render: (a: any) => a.titulo }, { label: "Tipo", render: (a: any) => label(a.tipo) }, { label: "Data", render: (a: any) => fmtDateTime(a.dataPrevista) }, { label: "Duração", render: (a: any) => `${a.duracaoMin} min` }, { label: "Obrigatória", render: (a: any) => (a.obrigatoria ? "Sim" : "Não") }]}
                    actions={(a: any) => <Button size="small" color="error" onClick={() => run(() => call("DELETE", `/desenvolvimento/atividades/${a.id}`), "Atividade removida.", "Remover a atividade e seus registros?")}>Remover</Button>} />
                  {!x.atividades.length && <Typography color="text.secondary">Cronograma vazio.</Typography>}
                </Box>
              )}
            </>
          )}
        </LoadBox>
        <FormDialog open={dlg === "ativ"} title="Nova atividade do cronograma" maxWidth="sm" fields={[{ key: "titulo", label: "Título", required: true }, { key: "tipo", label: "Tipo", type: "select", options: ["AULA", "SIMULADO", "TRILHA", "LEITURA", "ENCONTRO", "ENTREGA", "MENTORIA", "OFICINA"], required: true }, { key: "dataPrevista", label: "Data e hora", type: "datetime" }, { key: "duracaoMin", label: "Duração (min)", type: "number" }, { key: "obrigatoria", label: "Obrigatória", type: "bool" }, { key: "publicarNoCalendario", label: "Publicar no calendário acadêmico", type: "bool" }]} initial={{ tipo: "AULA", duracaoMin: 90, obrigatoria: true }} onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", `/desenvolvimento/programas/${id}/atividades`, b); setRev((n) => n + 1); }} />
        <FormDialog open={dlg === "insc"} title="Inscrever aluno" maxWidth="sm" fields={[{ key: "studentId", label: "Aluno", type: "student", required: true }, { key: "rankingOptIn", label: "O aluno consentiu em participar do ranking", type: "bool" }]} onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", `/desenvolvimento/programas/${id}/inscrever`, b); setRev((n) => n + 1); }} />
        <FormDialog open={dlg === "sim"} title="Montar simulado a partir do banco de questões" maxWidth="sm" intro={<Alert severity="info" sx={{ mb: 2 }}>Seleciona questões publicadas do exame, distribuídas pelos pesos das áreas, e convida os inscritos.</Alert>} fields={[{ key: "titulo", label: "Título", required: true }, { key: "total", label: "Número de questões", type: "number" }, { key: "duracaoMin", label: "Duração (min)", type: "number" }, { key: "abreEm", label: "Abre em", type: "datetime" }, { key: "fechaEm", label: "Fecha em", type: "datetime" }]} initial={{ total: 20, titulo: "Simulado diagnóstico" }} onClose={() => setDlg(null)} onSubmit={async (b) => { const r: any = await call("POST", `/desenvolvimento/programas/${id}/simulados`, b); toast({ type: "success", text: `Simulado criado com ${r.questoes} questões para ${r.alunosConvidados} alunos.` }); setRev((n) => n + 1); }} />
        <FormDialog open={dlg === "imp"} title="Importar questões de provas existentes" maxWidth="sm" intro={<Alert severity="info" sx={{ mb: 2 }}>Reaproveita as questões objetivas já cadastradas no módulo de provas. Informe o ID da avaliação.</Alert>} fields={[{ key: "assessmentId", label: "ID da avaliação", required: true }, { key: "eixoId", label: "ID da área/eixo do exame (opcional)" }, { key: "publicar", label: "Publicar direto no banco (senão ficam em rascunho para revisão)", type: "bool" }]} onClose={() => setDlg(null)} onSubmit={async (b) => { const r: any = await call("POST", `/desenvolvimento/programas/${id}/importar-questoes-provas`, b); toast({ type: "success", text: `${r.importadas} importadas, ${r.ignoradas} ignoradas.` }); }} />
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

// ------------------------------------------------------------------ competências e plano
function Competencias() {
  const [sid, setSid] = useState("");
  const [rev, setRev] = useState(0);
  const [dlg, setDlg] = useState<null | "aval" | "plano" | "meta">(null);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const comps = useApi<any>("/desenvolvimento/competencias", [rev]);
  const perfil = useApi<any>(sid ? `/desenvolvimento/alunos/${sid}/competencias` : null, [rev]);
  const planos = useApi<any>(sid ? `/desenvolvimento/planos?studentId=${sid}` : null, [rev]);
  const [planoSel, setPlanoSel] = useState<string>("");
  return (
    <Box>
      {node}
      <Section title="Desenvolvimento pessoal: competências socioemocionais" actions={<Button size="small" onClick={() => run(() => call("POST", "/desenvolvimento/competencias/bootstrap", {}), "Competências padrão carregadas.")}>Carregar competências padrão</Button>}>
        <Box sx={{ maxWidth: 460, mb: 2 }}><StudentPicker value={sid} onChange={setSid} label="Aluno" /></Box>
        {!sid && <Alert severity="info">Escolha um aluno para ver o perfil de competências (autoavaliação, professor, mentor), a evolução por período e o plano individual.</Alert>}
        {sid && (
          <>
            <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}><Button variant="contained" onClick={() => setDlg("aval")}>Avaliar competência</Button><Button variant="outlined" onClick={() => setDlg("plano")}>Novo plano individual</Button></Box>
            <LoadBox loading={perfil.loading} error={perfil.error} empty={!itemsOf(perfil.data).length} emptyText="Cadastre as competências padrão para começar." onRetry={perfil.reload}>
              {perfil.data?.percepcaoDivergente?.length > 0 && <Alert severity="warning" sx={{ mb: 1.5 }}>Percepção divergente entre autoavaliação e avaliação externa em: {perfil.data.percepcaoDivergente.join(", ")}. Vale uma conversa de mentoria.</Alert>}
              <DataList rows={itemsOf(perfil.data)} columns={[
                { label: "Competência", primary: true, render: (c: any) => <span>{c.nome}<Typography variant="caption" color="text.secondary" component="div">{label(c.dominio)}</Typography></span> },
                { label: "Auto", render: (c: any) => fmtNum(c.auto) }, { label: "Professor", render: (c: any) => fmtNum(c.professor) }, { label: "Mentor", render: (c: any) => fmtNum(c.mentor) },
                { label: "Média (1–5)", render: (c: any) => <Bar value={c.media} max={5} color="#4f46e5" label="" right={fmtNum(c.media)} /> }, { label: "Evolução", render: (c: any) => c.evolucao.map((e: any) => `${e.periodo}: ${fmtNum(e.media)}`).join(" → ") || "—" },
              ]} />
            </LoadBox>
          </>
        )}
      </Section>
      {sid && (
        <Section title="Planos individuais de desenvolvimento (PDI do aluno)">
          <LoadBox loading={planos.loading} error={planos.error} empty={!itemsOf(planos.data).length} emptyText="Nenhum plano para este aluno." onRetry={planos.reload}>
            {itemsOf(planos.data).map((p: any) => (
              <Paper key={p.id} variant="outlined" sx={{ p: 1.5, mb: 1.5, borderRadius: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}><Typography sx={{ fontWeight: 800, flex: 1 }}>{p.titulo}</Typography><Status value={p.status} /><Button size="small" onClick={() => { setPlanoSel(p.id); setDlg("meta"); }}>Nova meta</Button></Box>
                <Typography variant="body2" color="text.secondary">{p.objetivo}</Typography>
                <Bar value={p.progresso} label="Progresso do plano" right={`${p.progresso}%`} />
                {p.metas.map((m: any) => (
                  <Box key={m.id} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.4, flexWrap: "wrap" }}>
                    <Chip size="small" label={label(m.area)} /><Typography variant="body2" sx={{ flex: 1, minWidth: 180 }}>{m.descricao}{m.prazo ? ` (até ${fmtDate(m.prazo)})` : ""}</Typography><Status value={m.status} />
                    {m.status !== "ATINGIDA" && <Button size="small" onClick={() => run(() => call("PATCH", `/desenvolvimento/planos-metas/${m.id}`, { status: "ATINGIDA" }), "Meta atingida.")}>Atingida</Button>}
                  </Box>
                ))}
              </Paper>
            ))}
          </LoadBox>
        </Section>
      )}
      <FormDialog open={dlg === "aval"} title="Avaliar competência" maxWidth="sm" fields={[{ key: "competenciaId", label: "Competência", type: "select", required: true, options: itemsOf(comps.data).map((c: any) => ({ value: c.id, label: c.nome })) }, { key: "periodo", label: "Período (ex.: 2026/2)", required: true }, { key: "origem", label: "Origem da avaliação", type: "select", options: ["PROFESSOR", "MENTOR", "PAR"], required: true }, { key: "nota", label: "Nota de 1 a 5", type: "number", required: true }, { key: "evidencia", label: "Evidência / observação", type: "textarea" }]} initial={{ origem: "PROFESSOR", periodo: `${new Date().getFullYear()}/${new Date().getMonth() < 6 ? 1 : 2}` }} onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", "/desenvolvimento/competencias/avaliar", { ...b, studentId: sid }); setRev((x) => x + 1); }} />
      <FormDialog open={dlg === "plano"} title="Novo plano individual" maxWidth="sm" fields={[{ key: "titulo", label: "Título", required: true }, { key: "objetivo", label: "Objetivo", type: "textarea" }, { key: "vigenciaInicio", label: "Início", type: "date" }, { key: "vigenciaFim", label: "Fim", type: "date" }, { key: "visivelAoAluno", label: "Visível ao aluno", type: "bool" }]} initial={{ visivelAoAluno: true }} onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", "/desenvolvimento/planos", { ...b, studentId: sid }); setRev((x) => x + 1); }} />
      <FormDialog open={dlg === "meta"} title="Nova meta" maxWidth="sm" fields={[{ key: "descricao", label: "Meta", required: true }, { key: "area", label: "Área", type: "select", options: ["ACADEMICA", "PROFISSIONAL", "PESSOAL", "SOCIOEMOCIONAL", "SAUDE"], required: true }, { key: "prazo", label: "Prazo", type: "date" }, { key: "indicador", label: "Indicador de sucesso" }]} initial={{ area: "ACADEMICA" }} onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", `/desenvolvimento/planos/${planoSel}/metas`, b); setRev((x) => x + 1); }} />
    </Box>
  );
}

// ------------------------------------------------------------------ acompanhamento didático e pedagógico
function Acompanhamento() {
  const [rev, setRev] = useState(0);
  const [tipo, setTipo] = useState("");
  const [novo, setNovo] = useState(false);
  const { toast, node } = useToast();
  const l = useApi<any>(`/desenvolvimento/acompanhamentos?${qsOf({ tipo })}`, [rev]);
  return (
    <Section title="Acompanhamento didático e pedagógico" actions={<Button variant="contained" onClick={() => setNovo(true)}>Novo registro</Button>}>
      {node}
      <Alert severity="info" sx={{ mb: 2 }}>Didático: dificuldades em disciplinas e estratégias (professor). Pedagógico: métodos de estudo, organização e adaptação (coordenação/apoio). Registros “restritos” só são vistos por quem os criou e pela equipe de apoio.</Alert>
      <Box sx={{ mb: 2 }}><Pick label="Tipo" value={tipo} onChange={setTipo} all="Todos" options={[{ value: "DIDATICO", label: "Didático" }, { value: "PEDAGOGICO", label: "Pedagógico" }]} /></Box>
      <LoadBox loading={l.loading} error={l.error} empty={!itemsOf(l.data).length} emptyText="Nenhum registro." onRetry={l.reload}>
        <DataList rows={itemsOf(l.data)} columns={[{ label: "Aluno", primary: true, render: (a: any) => a.aluno?.nomeCompleto ?? "—" }, { label: "Tipo", render: (a: any) => label(a.tipo) }, { label: "Data", render: (a: any) => fmtDate(a.data) }, { label: "Resumo", render: (a: any) => a.resumo }, { label: "Estratégias", hideOnMobile: true, render: (a: any) => a.estrategias ?? "—" }, { label: "Próximo passo", render: (a: any) => fmtDate(a.proximoPassoEm) }, { label: "Sigilo", hideOnMobile: true, render: (a: any) => label(a.sigilo) }]} />
      </LoadBox>
      <FormDialog open={novo} title="Registro de acompanhamento" fields={[{ key: "studentId", label: "Aluno", type: "student", required: true }, { key: "tipo", label: "Tipo", type: "select", options: [{ value: "DIDATICO", label: "Didático" }, { value: "PEDAGOGICO", label: "Pedagógico" }], required: true }, { key: "resumo", label: "Resumo do atendimento", type: "textarea", required: true }, { key: "dificuldades", label: "Dificuldades observadas", type: "textarea" }, { key: "estrategias", label: "Estratégias combinadas", type: "textarea" }, { key: "proximoPassoEm", label: "Próximo passo em", type: "date" }, { key: "sigilo", label: "Sigilo", type: "select", options: [{ value: "NORMAL", label: "Normal" }, { value: "RESTRITO", label: "Restrito" }] }]} initial={{ tipo: "DIDATICO", sigilo: "NORMAL" }} onClose={() => setNovo(false)} onSubmit={async (b) => { await call("POST", "/desenvolvimento/acompanhamentos", b); setRev((x) => x + 1); toast({ type: "success", text: "Registro salvo." }); }} />
    </Section>
  );
}

// ------------------------------------------------------------------ avaliação global
function AvaliacaoGlobal({ onOrient }: { onOrient: () => void }) {
  const [rev, setRev] = useState(0);
  const [faixa, setFaixa] = useState("");
  const [page, setPage] = useState(1);
  const [ger, setGer] = useState(false);
  const [det, setDet] = useState<string | null>(null);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const cursos = useApi<any>("/academico/cursos");
  const l = useApi<any>(`/desenvolvimento/avaliacoes-globais?${qsOf({ faixa, page, pageSize: 20 })}`, [rev]);
  const COR: Record<string, string> = { OTIMO: "#2e9e5b", BOM: "#0F5FDB", ATENCAO: "#e0a100", RISCO: "#d64545" };
  return (
    <Section title="Avaliação global do aluno" actions={<Button variant="contained" onClick={() => setGer(true)}>Gerar avaliações</Button>}>
      {node}
      <Alert severity="info" sx={{ mb: 2 }}>Consolida notas, frequência, engajamento, situação financeira, ocorrências e participação em pesquisa/extensão num único panorama e aponta alertas com sugestão de encaminhamento. É um instrumento de apoio à orientação, não uma nota oficial.</Alert>
      <Box sx={{ mb: 2 }}><Pick label="Faixa" value={faixa} onChange={(v) => { setFaixa(v); setPage(1); }} all="Todas" options={["RISCO", "ATENCAO", "BOM", "OTIMO"].map((x) => ({ value: x, label: label(x) }))} /></Box>
      <LoadBox loading={l.loading} error={l.error} empty={!itemsOf(l.data).length} emptyText="Nenhuma avaliação gerada. Use “Gerar avaliações”." onRetry={l.reload}>
        <DataList rows={itemsOf(l.data)} onRowClick={(a: any) => setDet(a.id)} columns={[
          { label: "Aluno", primary: true, render: (a: any) => a.aluno?.nomeCompleto ?? "—" }, { label: "Período", render: (a: any) => a.periodo },
          { label: "Score", render: (a: any) => <Chip size="small" sx={{ bgcolor: COR[a.faixa], color: "#fff", fontWeight: 700 }} label={`${fmtNum(a.scoreGlobal, 0)} · ${label(a.faixa)}`} /> },
          { label: "Nota", render: (a: any) => fmtNum(a.notaAcademica) }, { label: "Frequência", render: (a: any) => fmtPct(a.frequenciaPct, 0) }, { label: "Financeiro", hideOnMobile: true, render: (a: any) => fmtNum(a.financeiroScore, 0) },
          { label: "Alertas", render: (a: any) => (a.alertas ?? []).length },
        ]} />
        <Pagination sx={{ mt: 2 }} count={Math.max(1, Math.ceil((l.data?.total ?? 0) / 20))} page={page} onChange={(_, n) => setPage(n)} />
      </LoadBox>
      <FormDialog open={ger} title="Gerar avaliações globais" maxWidth="sm" fields={[{ key: "programId", label: "Curso (vazio = aluno informado)", type: "select", options: itemsOf(cursos.data).map((c: any) => ({ value: c.id, label: c.nome })) }, { key: "studentId", label: "Ou um aluno específico", type: "student" }, { key: "periodo", label: "Período de referência (ex.: 2026/2)" }]} initial={{ periodo: `${new Date().getFullYear()}/${new Date().getMonth() < 6 ? 1 : 2}` }} onClose={() => setGer(false)}
        onSubmit={async (b) => { const r: any = await call("POST", "/desenvolvimento/avaliacoes-globais/gerar", b); toast({ type: "success", text: `${r.geradas} avaliação(ões) gerada(s).` }); setRev((x) => x + 1); }} />
      {det && <AvaliacaoDialog id={det} onClose={() => setDet(null)} onChanged={() => setRev((x) => x + 1)} onOrient={onOrient} toast={toast} />}
      <span hidden>{String(run === undefined)}</span>
    </Section>
  );
}

function AvaliacaoDialog({ id, onClose, onChanged, onOrient, toast }: { id: string; onClose: () => void; onChanged: () => void; onOrient: () => void; toast: (m: any) => void }) {
  const [rev, setRev] = useState(0);
  const mobile = useIsMobile();
  const d = useApi<any>(`/desenvolvimento/avaliacoes-globais/${id}`, [rev]);
  const run = useRunner(toast, () => { setRev((x) => x + 1); onChanged(); });
  const [parecer, setParecer] = useState(false);
  const a = d.data;
  const COMP = [["academico", "Desempenho acadêmico"], ["frequencia", "Frequência"], ["engajamento", "Engajamento"], ["financeiro", "Situação financeira"]];
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" fullScreen={mobile}>
      <DialogTitle sx={{ display: "flex", alignItems: "center" }}><Box sx={{ flex: 1 }}>{a?.aluno?.nomeCompleto ?? "Avaliação"} · {a?.periodo}</Box><IconButton onClick={onClose} aria-label="Fechar"><CloseIcon /></IconButton></DialogTitle>
      <DialogContent dividers>
        <LoadBox loading={d.loading} error={d.error} onRetry={d.reload}>
          {a && (
            <>
              <KpiRow><Kpi title="Score global" value={fmtNum(a.scoreGlobal, 0)} hint={label(a.faixa)} color={{ OTIMO: "#2e9e5b", BOM: "#0F5FDB", ATENCAO: "#e0a100", RISCO: "#d64545" }[a.faixa as string]} /><Kpi title="Ocorrências (12 meses)" value={a.ocorrencias} /><Kpi title="Pesquisa/extensão" value={`${fmtNum(a.horasPesquisaExtensao, 0)} h`} /><Kpi title="Complementares" value={`${fmtNum(a.horasComplementares, 0)} h`} /></KpiRow>
              {COMP.map(([k, n]) => { const c = a.componentes?.[k]; return c ? <Bar key={k} value={c.valor} label={n} right={`${c.valor == null ? "sem dado" : fmtNum(c.valor, 0)} · peso ${Math.round(c.peso * 100)}%`} color={c.valor != null && c.valor >= 60 ? "#2e9e5b" : "#d64545"} /> : null; })}
              <Typography variant="caption" color="text.secondary">Bônus de pesquisa/extensão +{a.componentes?.bonus ?? 0} · penalidade por ocorrências −{a.componentes?.penalidade ?? 0}</Typography>
              <Typography sx={{ fontWeight: 800, mt: 2, mb: 1 }}>Alertas e sugestões</Typography>
              {(a.alertas ?? []).length ? a.alertas.map((x: any) => <Alert key={x.codigo} severity={x.nivel === "CRITICO" ? "error" : x.nivel === "ATENCAO" ? "warning" : "info"} sx={{ mb: 1 }}><b>{x.texto}</b> {x.sugestao}</Alert>) : <Alert severity="success">Sem alertas.</Alert>}
              <Typography sx={{ fontWeight: 800, mt: 2, mb: 1 }}>Evolução</Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>{a.historico.map((h: any) => <Chip key={h.periodo} label={`${h.periodo}: ${fmtNum(h.scoreGlobal, 0)}`} />)}</Box>
              {a.parecer && <Alert severity="info" sx={{ mt: 2 }}><b>Parecer:</b> {a.parecer}</Alert>}
            </>
          )}
        </LoadBox>
        <FormDialog open={parecer} title="Parecer da coordenação" maxWidth="sm" fields={[{ key: "parecer", label: "Parecer", type: "textarea", required: true }]} initial={{ parecer: a?.parecer }} onClose={() => setParecer(false)} onSubmit={async (b) => { await call("PATCH", `/desenvolvimento/avaliacoes-globais/${id}/parecer`, b); setRev((x) => x + 1); }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setParecer(true)}>Registrar parecer</Button>
        {a && (a.alertas ?? []).length > 0 && <Button variant="contained" onClick={async () => { const r = await run(() => call("POST", `/desenvolvimento/avaliacoes-globais/${id}/orientacao`, {}), "Ação de orientação criada."); if (r) { onClose(); onOrient(); } }}>Gerar ação de orientação</Button>}
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
}

// ------------------------------------------------------------------ orientações
function Orientacoes() {
  const [rev, setRev] = useState(0);
  const [st, setSt] = useState("");
  const [pr, setPr] = useState("");
  const [novo, setNovo] = useState(false);
  const [det, setDet] = useState<string | null>(null);
  const { toast, node } = useToast();
  const l = useApi<any>(`/desenvolvimento/orientacoes?${qsOf({ status: st, prioridade: pr })}`, [rev]);
  const COR: Record<string, any> = { URGENTE: "error", ALTA: "warning", MEDIA: "default", BAIXA: "default" };
  return (
    <Section title="Ações de orientação" actions={<Button variant="contained" onClick={() => setNovo(true)}>Nova ação</Button>}>
      {node}
      <Alert severity="warning" sx={{ mb: 2 }}>Conteúdo confidencial (LGPD). Cada ação tem nível de confidencialidade e base legal; todo acesso ao conteúdo é registrado. Itens “sigilosos” só aparecem para quem os criou ou foi designado.</Alert>
      <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
        <Pick label="Situação" value={st} onChange={setSt} all="Todas" options={["ABERTA", "EM_ACOMPANHAMENTO", "ENCAMINHADA", "CONCLUIDA", "CANCELADA"].map((x) => ({ value: x, label: label(x) }))} />
        <Pick label="Prioridade" value={pr} onChange={setPr} all="Todas" options={["URGENTE", "ALTA", "MEDIA", "BAIXA"].map((x) => ({ value: x, label: label(x) }))} />
      </Box>
      <LoadBox loading={l.loading} error={l.error} empty={!itemsOf(l.data).length} emptyText="Nenhuma ação de orientação." onRetry={l.reload}>
        <DataList rows={itemsOf(l.data)} onRowClick={(o: any) => setDet(o.id)} columns={[
          { label: "Ação", primary: true, render: (o: any) => <span>{o.titulo}<Typography variant="caption" color="text.secondary" component="div">{o.aluno?.nomeCompleto} · {label(o.tipo)}</Typography></span> },
          { label: "Prioridade", render: (o: any) => <Chip size="small" color={COR[o.prioridade]} label={label(o.prioridade)} /> }, { label: "Situação", render: (o: any) => <Status value={o.status} /> },
          { label: "Confidencial.", render: (o: any) => <Flag color={o.confidencialidade === "SIGILOSO" ? "error" : o.confidencialidade === "RESTRITO" ? "warning" : "default"}>{label(o.confidencialidade)}</Flag> },
          { label: "Prazo", render: (o: any) => <span>{fmtDate(o.prazo)} {o.vencida && <Flag color="error">vencida</Flag>}</span> }, { label: "Encaminhada a", hideOnMobile: true, render: (o: any) => (o.encaminhadoPara ? label(o.encaminhadoPara) : "—") },
        ]} />
      </LoadBox>
      <FormDialog open={novo} title="Nova ação de orientação" fields={[
        { key: "studentId", label: "Aluno", type: "student", required: true }, { key: "tipo", label: "Tipo", type: "select", required: true, options: [{ value: "ALERTA_RISCO", label: "Alerta de risco" }, { value: "PLANO_ACAO", label: "Plano de ação" }, { value: "ENCAMINHAMENTO", label: "Encaminhamento" }, { value: "ATENDIMENTO", label: "Registro de atendimento" }] },
        { key: "titulo", label: "Título", required: true }, { key: "prioridade", label: "Prioridade", type: "select", options: ["BAIXA", "MEDIA", "ALTA", "URGENTE"] }, { key: "descricao", label: "Descrição (confidencial)", type: "textarea" },
        { key: "confidencialidade", label: "Confidencialidade", type: "select", required: true, options: [{ value: "NORMAL", label: "Normal (coordenação e apoio)" }, { value: "RESTRITO", label: "Restrito (equipe de apoio)" }, { value: "SIGILOSO", label: "Sigiloso (só você e a administração)" }] },
        { key: "baseLegal", label: "Base legal (LGPD)", type: "select", required: true, options: [{ value: "EXECUCAO_CONTRATO", label: "Execução de contrato (art. 7º, V)" }, { value: "LEGITIMO_INTERESSE", label: "Legítimo interesse (art. 7º, IX)" }, { value: "CONSENTIMENTO", label: "Consentimento (art. 7º, I / 11, I)" }, { value: "TUTELA_SAUDE", label: "Tutela da saúde (art. 11, II, f) — apoio" }] },
        { key: "consentimentoAluno", label: "O aluno (ou responsável) consentiu e isso está registrado", type: "bool", hidden: (v) => v.baseLegal !== "CONSENTIMENTO" },
        { key: "encaminhadoPara", label: "Encaminhar para", type: "select", options: ["APOIO", "PSICOLOGIA", "FINANCEIRO", "COORDENACAO", "SECRETARIA", "NAPNE"] }, { key: "prazo", label: "Prazo", type: "date" },
      ]} initial={{ tipo: "PLANO_ACAO", prioridade: "MEDIA", confidencialidade: "RESTRITO", baseLegal: "EXECUCAO_CONTRATO" }} onClose={() => setNovo(false)} onSubmit={async (b) => { await call("POST", "/desenvolvimento/orientacoes", b); setRev((x) => x + 1); toast({ type: "success", text: "Ação registrada." }); }} />
      {det && <OrientacaoDialog id={det} onClose={() => { setDet(null); setRev((x) => x + 1); }} />}
    </Section>
  );
}

function OrientacaoDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [rev, setRev] = useState(0);
  const [dlg, setDlg] = useState<null | "reg" | "status">(null);
  const mobile = useIsMobile();
  const { toast, node } = useToast();
  const d = useApi<any>(`/desenvolvimento/orientacoes/${id}`, [rev]);
  const o = d.data;
  const encerrada = o && ["CONCLUIDA", "CANCELADA"].includes(o.status);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" fullScreen={mobile}>
      <DialogTitle sx={{ display: "flex", alignItems: "center" }}><Box sx={{ flex: 1 }}>{o?.titulo ?? "Ação de orientação"}</Box><IconButton onClick={onClose} aria-label="Fechar"><CloseIcon /></IconButton></DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={d.loading} error={d.error} onRetry={d.reload}>
          {o && (
            <>
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 1.5 }}><Status value={o.status} /><Flag color={o.prioridade === "URGENTE" ? "error" : "warning"}>{label(o.prioridade)}</Flag><Flag>{label(o.confidencialidade)}</Flag><Flag>{`Base legal: ${label(o.baseLegal)}`}</Flag>{o.encaminhadoPara && <Flag color="info">{`Encaminhada: ${label(o.encaminhadoPara)}`}</Flag>}</Box>
              <Typography variant="body2" color="text.secondary">Aluno: <b>{o.aluno?.nomeCompleto}</b> · Prazo: {fmtDate(o.prazo)}</Typography>
              <Paper variant="outlined" sx={{ p: 1.5, my: 1.5, whiteSpace: "pre-wrap", borderRadius: 2 }}>{o.descricao || "—"}</Paper>
              <Typography sx={{ fontWeight: 800, mb: 1 }}>Registros</Typography>
              {o.registros.length ? o.registros.map((r: any) => <Paper key={r.id} variant="outlined" sx={{ p: 1.2, mb: 1, borderRadius: 2 }}><Typography variant="caption" color="text.secondary">{label(r.tipo)} · {fmtDateTime(r.data)}</Typography><Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{r.texto}</Typography></Paper>) : <Typography color="text.secondary">Sem registros.</Typography>}
            </>
          )}
        </LoadBox>
        <FormDialog open={dlg === "reg"} title="Registrar atendimento / nota" maxWidth="sm" fields={[{ key: "tipo", label: "Tipo", type: "select", options: ["NOTA", "ATENDIMENTO", "ENCAMINHAMENTO", "RETORNO"], required: true }, { key: "texto", label: "Registro (confidencial)", type: "textarea", required: true }]} initial={{ tipo: "NOTA" }} onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", `/desenvolvimento/orientacoes/${id}/registros`, b); setRev((x) => x + 1); }} />
        <FormDialog open={dlg === "status"} title="Atualizar situação" maxWidth="sm" fields={[{ key: "status", label: "Nova situação", type: "select", required: true, options: ["EM_ACOMPANHAMENTO", "ENCAMINHADA", "CONCLUIDA", "CANCELADA"] }, { key: "encaminhadoPara", label: "Encaminhar para", type: "select", options: ["APOIO", "PSICOLOGIA", "FINANCEIRO", "COORDENACAO", "SECRETARIA", "NAPNE"], hidden: (v) => v.status !== "ENCAMINHADA" }, { key: "texto", label: "Desfecho / observação", type: "textarea" }]} initial={{ status: "EM_ACOMPANHAMENTO" }} onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", `/desenvolvimento/orientacoes/${id}/status`, b); setRev((x) => x + 1); toast({ type: "success", text: "Situação atualizada." }); }} />
      </DialogContent>
      <DialogActions>{o && !encerrada && <><Button onClick={() => setDlg("reg")}>Registrar atendimento</Button><Button variant="contained" onClick={() => setDlg("status")}>Atualizar situação</Button></>}<Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

// ------------------------------------------------------------------ indicadores
function Indicadores() {
  const [modo, setModo] = useState("coordenacao");
  const [programId, setProgramId] = useState("");
  const cursos = useApi<any>("/academico/cursos");
  const d = useApi<any>(modo === "coordenacao" ? `/desenvolvimento/indicadores/coordenacao?${qsOf({ programId })}` : "/desenvolvimento/indicadores/reitoria");
  const r = d.data;
  return (
    <Section title="Indicadores de acompanhamento">
      <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
        <Pick label="Visão" value={modo} onChange={setModo} minWidth={180} options={[{ value: "coordenacao", label: "Coordenação" }, { value: "reitoria", label: "Reitoria (agregado)" }]} />
        {modo === "coordenacao" && <Pick label="Curso" value={programId} onChange={setProgramId} all="Todos" minWidth={220} options={itemsOf(cursos.data).map((c: any) => ({ value: c.id, label: c.nome }))} />}
      </Box>
      <LoadBox loading={d.loading} error={d.error} empty={r && !r.alunosAvaliados} emptyText="Gere avaliações globais para alimentar os indicadores." onRetry={d.reload}>
        {r && (
          <>
            <KpiRow>
              <Kpi title="Alunos avaliados" value={r.alunosAvaliados} /><Kpi title="Em atenção ou risco" value={fmtPct(r.risco)} color={r.risco > 30 ? "#d64545" : "#e0a100"} /><Kpi title="Score médio" value={fmtNum(r.scoreMedio, 0)} />
              <Kpi title="Nota média" value={fmtNum(r.notaMedia)} /><Kpi title="Frequência média" value={fmtPct(r.frequenciaMedia, 0)} /><Kpi title="Orientações abertas" value={r.orientacoes.abertas} hint={`${r.orientacoes.vencidas} vencidas`} />
            </KpiRow>
            <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>{(["OTIMO", "BOM", "ATENCAO", "RISCO"] as const).map((f) => <Chip key={f} label={`${label(f)}: ${r.faixas[f]}`} sx={{ bgcolor: { OTIMO: "#2e9e5b", BOM: "#0F5FDB", ATENCAO: "#e0a100", RISCO: "#d64545" }[f], color: "#fff" }} />)}</Box>
            {modo === "coordenacao" && r.alunosEmRisco?.length > 0 && <><Typography sx={{ fontWeight: 800, mb: 1 }}>Alunos em risco (prioridade de atendimento)</Typography><DataList rows={r.alunosEmRisco.map((a: any) => ({ ...a, id: a.avaliacaoId }))} columns={[{ label: "Aluno", primary: true, render: (a: any) => a.aluno }, { label: "RA", render: (a: any) => a.ra }, { label: "Score", render: (a: any) => fmtNum(a.score, 0) }, { label: "Alertas", render: (a: any) => a.alertas.map(label).join(", ") }]} /></>}
            {modo === "reitoria" && (
              <>
                <Typography sx={{ fontWeight: 800, mb: 1 }}>Por curso</Typography>
                <DataList rows={r.porCurso.map((c: any) => ({ ...c, id: c.cursoId }))} columns={[{ label: "Curso", primary: true, render: (c: any) => c.curso }, { label: "Avaliados", render: (c: any) => c.alunosAvaliados }, { label: "Score médio", render: (c: any) => fmtNum(c.scoreMedio, 0) }, { label: "Atenção/risco", render: (c: any) => fmtPct(c.risco) }]} />
                <Typography sx={{ fontWeight: 800, mt: 2, mb: 1 }}>Evolução por período</Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>{r.evolucao.map((e: any) => <Chip key={e.periodo} label={`${e.periodo}: ${fmtNum(e.scoreMedio, 0)} (${e.avaliados})`} />)}</Box>
                <Alert severity="info" sx={{ mt: 2 }}>{r.aviso}</Alert>
              </>
            )}
          </>
        )}
      </LoadBox>
    </Section>
  );
}
