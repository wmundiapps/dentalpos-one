import {
  Alert, Box, Button, Checkbox, Chip, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment, Pagination, Paper, Tab, Tabs, TextField, Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import CloseIcon from "@mui/icons-material/Close";
import { useEffect, useMemo, useState } from "react";
import {
  DataList, FormDialog, Kpi, KpiRow, LoadBox, Pick, Status, abrirHtml, baixar, call, fmtDate, fmtMoney, fmtNum, itemsOf, label, qsOf, useApi, useIsMobile, useRunner, useToast, type Col, type FormField, Flag, TURNO_ROTULO,
} from "./kit";

const VAZIO = { q: "", ano: "", periodo: "", termId: "", programId: "", classSectionId: "", poloId: "", contratoStatus: "", statusCurso: "", statusMatricula: "", turno: "", matriculaDe: "", matriculaAte: "", novos: false, nee: false, inadimplente: false, semDocumentos: false };
type Filtro = typeof VAZIO;

export default function AlunosPage() {
  const [f, setF] = useState<Filtro>(VAZIO);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [aberto, setAberto] = useState(false);
  const [ficha, setFicha] = useState<string | null>(null);
  const [rel, setRel] = useState(false);
  const mobile = useIsMobile();
  const { toast, node } = useToast();
  const run = useRunner(toast);
  const [busy, setBusy] = useState(false);

  // busca livre com atraso (evita uma chamada por tecla)
  useEffect(() => { const t = setTimeout(() => { setF((o) => (o.q === q ? o : { ...o, q })); setPage(1); }, 350); return () => clearTimeout(t); }, [q]);

  const filtrosApi = useApi<any>("/academico/alunos/filtros");
  const fo = filtrosApi.data;
  const qs = qsOf({ ...f, pageSize: 20, page } as any);
  const lista = useApi<any>(`/academico/alunos?${qs}`);
  const set = (k: keyof Filtro, v: any) => { setF((o) => ({ ...o, [k]: v })); setPage(1); };
  const ativos = useMemo(() => Object.entries(f).filter(([k, v]) => v !== "" && v !== false && k !== "q").length + (f.q ? 1 : 0), [f]);
  const opt = (xs?: any[], v = (x: any) => String(x), l = (x: any) => String(x)) => (xs ?? []).map((x) => ({ value: v(x), label: l(x) }));

  const exportar = async () => {
    setBusy(true);
    await run(() => baixar(`/academico/alunos/exportar.xlsx?${qsOf(f as any)}`, "alunos.xlsx"), "Planilha gerada.");
    setBusy(false);
  };

  const cols: Array<Col> = [
    { label: "RA", render: (r) => r.ra, hideOnMobile: true },
    { label: "Aluno", primary: true, render: (r) => <span>{r.nomeSocial || r.nome}{r.nomeSocial ? <Typography component="span" variant="caption" color="text.secondary"> ({r.nome})</Typography> : null}<Typography variant="caption" color="text.secondary" component="div">RA {r.ra}</Typography></span> },
    { label: "Curso / período", render: (r) => (r.cursos.length ? r.cursos.map((c: any) => <div key={c.enrollmentId}>{c.programa} <Typography component="span" variant="caption" color="text.secondary">· {c.periodoLetivo}</Typography></div>) : "—") },
    { label: "Turno", hideOnMobile: true, render: (r) => r.cursos[0]?.turno ? TURNO_ROTULO[r.cursos[0].turno] ?? r.cursos[0].turno : "—" },
    { label: "Matrícula", render: (r) => (r.cursos[0] ? <Status value={r.cursos[0].statusMatricula} /> : "—") },
    { label: "Status do curso", hideOnMobile: true, render: (r) => (r.cursos[0]?.statusCurso ? <Status value={r.cursos[0].statusCurso} /> : "—") },
    { label: "Contrato", render: (r) => (r.contratoStatus ? <Status value={r.contratoStatus} /> : "—") },
    { label: "Contato", hideOnMobile: true, render: (r) => <span>{r.email ?? "—"}<Typography variant="caption" color="text.secondary" component="div">{r.telefone ?? ""}</Typography></span> },
    { label: "Marcas", render: (r) => <span>{r.cursos.some((c: any) => c.matriculaNova) && <Flag color="info">Nova</Flag>}{r.nee && <Flag color="warning">NEE</Flag>}{r.inadimplente && <Flag color="error">Inadimplente</Flag>}</span> },
  ];

  return (
    <Box>
      {node}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
          <TextField size="small" label="Buscar por nome, RA, CPF, RG, telefone ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} sx={{ flex: "1 1 260px", minWidth: 0 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
          <Button variant={aberto ? "contained" : "outlined"} startIcon={<FilterAltOutlinedIcon />} onClick={() => setAberto(!aberto)}>Filtros{ativos ? ` (${ativos})` : ""}</Button>
          <Button disabled={!ativos} onClick={() => { setF(VAZIO); setQ(""); setPage(1); }}>Limpar filtros</Button>
          <Button variant="outlined" startIcon={<AssessmentOutlinedIcon />} onClick={() => setRel(true)}>Relatórios</Button>
          <Button variant="contained" startIcon={<DownloadIcon />} disabled={busy || !lista.data?.total} onClick={exportar}>Exportar Excel</Button>
        </Box>
        <Collapse in={aberto} unmountOnExit>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1.5, mt: 2 }}>
            <Pick label="Ano letivo" value={f.ano} onChange={(v) => set("ano", v)} all="Todos" minWidth={0} options={opt(fo?.anos)} />
            <Pick label="Período" value={f.periodo} onChange={(v) => set("periodo", v)} all="Todos" minWidth={0} options={opt(fo?.periodos, String, (x) => `${x}º período`)} />
            <Pick label="Curso" value={f.programId} onChange={(v) => set("programId", v)} all="Todos os cursos" minWidth={0} options={opt(fo?.cursos, (x) => x.id, (x) => x.nome)} />
            <Pick label="Turma" value={f.classSectionId} onChange={(v) => set("classSectionId", v)} all="Todas" minWidth={0} options={opt(fo?.turmas, (x) => x.id, (x) => x.nome)} />
            <Pick label="Status do contrato" value={f.contratoStatus} onChange={(v) => set("contratoStatus", v)} all="Todos" minWidth={0} options={opt(fo?.statusContrato, String, label)} />
            <Pick label="Status do curso" value={f.statusCurso} onChange={(v) => set("statusCurso", v)} all="Todos" minWidth={0} options={opt(fo?.statusCurso, String, label)} />
            <Pick label="Status da matrícula" value={f.statusMatricula} onChange={(v) => set("statusMatricula", v)} all="Todos" minWidth={0} options={opt(fo?.statusMatricula, String, label)} />
            <Pick label="Polo / unidade" value={f.poloId} onChange={(v) => set("poloId", v)} all="Todos" minWidth={0} options={opt(fo?.polos, (x) => x.id, (x) => x.nome)} />
            <Pick label="Turno" value={f.turno} onChange={(v) => set("turno", v)} all="Todos" minWidth={0} options={opt(fo?.turnos, String, (x) => TURNO_ROTULO[x] ?? x)} />
            <TextField size="small" type="date" label="Matrícula de" value={f.matriculaDe} onChange={(e) => set("matriculaDe", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="date" label="Matrícula até" value={f.matriculaAte} onChange={(e) => set("matriculaAte", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <Box sx={{ gridColumn: { xs: "1 / -1", md: "span 1" } }} />
            <FormControlLabel control={<Checkbox checked={f.novos} onChange={(e) => set("novos", e.target.checked)} />} label="Somente matrículas novas" />
            <FormControlLabel control={<Checkbox checked={f.nee} onChange={(e) => set("nee", e.target.checked)} />} label="Somente necessidades especiais" />
            <FormControlLabel control={<Checkbox checked={f.inadimplente} onChange={(e) => set("inadimplente", e.target.checked)} />} label="Somente inadimplentes" />
            <FormControlLabel control={<Checkbox checked={f.semDocumentos} onChange={(e) => set("semDocumentos", e.target.checked)} />} label="Documentos pendentes" />
          </Box>
          {f.nee && <Alert severity="info" sx={{ mt: 1.5 }}>Dado sensível (LGPD art. 11): o acesso a esta lista é registrado em log.</Alert>}
        </Collapse>
      </Paper>

      <KpiRow>
        <Kpi title="Alunos encontrados" value={lista.data?.total ?? "—"} hint={lista.data?.filtro} />
      </KpiRow>
      <LoadBox loading={lista.loading} error={lista.error} empty={!itemsOf(lista.data).length} emptyText="Nenhum aluno encontrado com estes filtros." onRetry={lista.reload}>
        <DataList rows={itemsOf(lista.data)} columns={cols} onRowClick={(r: any) => setFicha(r.id)} />
        <Pagination sx={{ mt: 2 }} count={Math.max(1, Math.ceil((lista.data?.total ?? 0) / 20))} page={page} onChange={(_, n) => setPage(n)} size={mobile ? "small" : "medium"} siblingCount={mobile ? 0 : 1} />
      </LoadBox>

      {rel && <RelatoriosDialog filtros={f} onClose={() => setRel(false)} toast={toast} />}
      {ficha && <FichaDialog id={ficha} onClose={() => { setFicha(null); lista.reload(); }} />}
    </Box>
  );
}

function RelatoriosDialog({ filtros, onClose, toast }: { filtros: Filtro; onClose: () => void; toast: (m: any) => void }) {
  const l = useApi<any>("/academico/relatorios");
  const [mes, setMes] = useState(String(new Date().getMonth() + 1));
  const run = useRunner(toast);
  const q = (extra: Record<string, string>) => qsOf({ ...(filtros as any), ...extra });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" fullScreen={useIsMobile()}>
      <DialogTitle sx={{ display: "flex", alignItems: "center" }}><Box sx={{ flex: 1 }}>Relatórios da secretaria</Box><IconButton onClick={onClose} aria-label="Fechar"><CloseIcon /></IconButton></DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>Os relatórios respeitam os filtros aplicados na listagem. Visualizar abre uma página imprimível; Excel baixa a planilha.</Alert>
        <TextField size="small" select label="Mês (aniversariantes)" value={mes} onChange={(e) => setMes(e.target.value)} slotProps={{ select: { native: true } }} sx={{ mb: 2 }}>
          {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2000, i, 1).toLocaleDateString("pt-BR", { month: "long" })}</option>)}
        </TextField>
        <LoadBox loading={l.loading} error={l.error} empty={!itemsOf(l.data).length} onRetry={l.reload}>
          {itemsOf(l.data).map((r: any) => (
            <Paper key={r.codigo} variant="outlined" sx={{ p: 1.5, mb: 1, display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <Box sx={{ flex: "1 1 220px", minWidth: 0 }}><Typography sx={{ fontWeight: 700 }}>{r.nome}</Typography><Typography variant="caption" color="text.secondary">{r.descricao}</Typography></Box>
              <Button size="small" onClick={() => run(() => abrirHtml(`/academico/relatorios/${r.codigo}?${q({ formato: "html", mes })}`))}>Visualizar</Button>
              {r.codigo !== "carometro" && <Button size="small" variant="outlined" onClick={() => run(() => baixar(`/academico/relatorios/${r.codigo}?${q({ formato: "xlsx", mes })}`, `${r.codigo}.xlsx`), "Planilha gerada.")}>Excel</Button>}
            </Paper>
          ))}
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

const PERFIL: FormField[] = [
  { key: "nomeSocial", label: "Nome social" }, { key: "email", label: "E-mail" }, { key: "telefone", label: "Telefone" }, { key: "rg", label: "RG" }, { key: "rgOrgao", label: "Órgão emissor" },
  { key: "sexo", label: "Sexo", type: "select", options: [{ value: "F", label: "Feminino" }, { value: "M", label: "Masculino" }, { value: "O", label: "Outro" }] },
  { key: "cidade", label: "Cidade" }, { key: "uf", label: "UF" }, { key: "fotoUrl", label: "Foto (link https)", helper: "Usada no carômetro" }, { key: "responsavelNome", label: "Responsável (menores de 18 anos)" },
  { key: "nee", label: "Possui necessidade educacional especial (dado sensível)", type: "bool", full: true },
  { key: "neeCategoria", label: "Categoria da necessidade", hidden: (v) => !v.nee, helper: "Restrito à equipe de apoio e coordenação" },
  { key: "neeBaseLegal", label: "Base legal (LGPD art. 11)", type: "select", options: [{ value: "CONSENTIMENTO", label: "Consentimento do titular/responsável" }, { value: "TUTELA_SAUDE", label: "Tutela da saúde" }, { value: "OBRIGACAO_LEGAL", label: "Obrigação legal" }], hidden: (v) => !v.nee, required: false },
];
const CONTRATO: FormField[] = [
  { key: "status", label: "Status", type: "select", options: ["RASCUNHO", "PENDENTE_ASSINATURA", "ASSINADO", "RESCINDIDO", "ENCERRADO", "CANCELADO"], required: true },
  { key: "valorMensalidade", label: "Mensalidade (R$)", type: "number", required: true }, { key: "parcelas", label: "Parcelas", type: "number" }, { key: "diaVencimento", label: "Dia de vencimento", type: "number" },
  { key: "descontoPercent", label: "Desconto (%)", type: "number" }, { key: "vigenciaInicio", label: "Início da vigência", type: "date" }, { key: "vigenciaFim", label: "Fim da vigência", type: "date" },
];
const MAT_EXT: FormField[] = [
  { key: "turno", label: "Turno", type: "select", options: Object.entries(TURNO_ROTULO).map(([value, label]) => ({ value, label })) },
  { key: "statusCurso", label: "Status do curso", type: "select", options: ["CURSANDO", "FORMANDO", "FORMADO", "TRANCADO", "JUBILADO", "TRANSFERIDO", "EVADIDO"] },
  { key: "ingresso", label: "Forma de ingresso", type: "select", options: ["VESTIBULAR", "ENEM", "TRANSFERENCIA", "PORTADOR_DIPLOMA", "REINGRESSO", "OUTRO"] },
  { key: "matriculaNova", label: "Matrícula nova (ingressante)", type: "bool" }, { key: "periodoAtual", label: "Período/série atual", type: "number" },
];

function FichaDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [tab, setTab] = useState(0);
  const [rev, setRev] = useState(0);
  const [ed, setEd] = useState<null | "perfil" | "contrato" | { ext: string; row: any }>(null);
  const mobile = useIsMobile();
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const d = useApi<any>(`/academico/alunos/${id}/ficha`, [rev]);
  const x = d.data;
  const T = ["Dados", "Matrículas", "Contratos", "Notas", "Financeiro", "Documentos", "Ocorrências"];
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg" fullScreen={mobile}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, overflowWrap: "anywhere" }}>{x?.perfil?.nomeSocial || x?.aluno?.nome || "Ficha do aluno"}</Typography>
          {x && <Typography variant="caption" color="text.secondary">RA {x.aluno.ra} · <Status value={x.aluno.status} /> {x.menor ? <Flag color="warning">Menor de idade</Flag> : null}{x.perfil?.nee ? <Flag color="warning">NEE</Flag> : null}</Typography>}
        </Box>
        <IconButton onClick={onClose} aria-label="Fechar"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={d.loading} error={d.error} onRetry={d.reload}>
          {x && (
            <>
              <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>{T.map((t) => <Tab key={t} label={t} />)}</Tabs>
              {tab === 0 && (
                <Box>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }, gap: 1.5 }}>
                    {[["Nome completo", x.aluno.nome], ["CPF", x.aluno.cpf || "—"], ["Nascimento", fmtDate(x.aluno.dataNascimento)], ["E-mail", x.perfil?.email], ["Telefone", x.perfil?.telefone], ["RG", x.perfil?.rg ? `${x.perfil.rg} ${x.perfil.rgOrgao ?? ""}` : "—"], ["Cidade", x.perfil?.cidade ? `${x.perfil.cidade}/${x.perfil.uf ?? ""}` : "—"], ["Responsável", x.perfil?.responsavelNome ?? "—"], ["Necessidade especial", x.perfil?.nee ? `Sim${x.perfil.neeCategoria ? ` — ${label(x.perfil.neeCategoria)}` : ""}` : "Não"]].map(([k, v]) => (
                      <Box key={k as string}><Typography variant="caption" color="text.secondary">{k}</Typography><Typography sx={{ overflowWrap: "anywhere" }}>{(v as any) || "—"}</Typography></Box>
                    ))}
                  </Box>
                  <Button sx={{ mt: 2 }} variant="outlined" onClick={() => setEd("perfil")}>Editar dados complementares</Button>
                  {x.orientacoesAbertas ? <Alert severity="warning" sx={{ mt: 2 }}>{x.orientacoesAbertas} ação(ões) de orientação em aberto para este aluno.</Alert> : null}
                </Box>
              )}
              {tab === 1 && (
                <DataList rows={x.matriculas} columns={[
                  { label: "Curso", primary: true, render: (m: any) => m.curso }, { label: "Período", render: (m: any) => m.periodoLetivo }, { label: "Matrícula", render: (m: any) => <Status value={m.status} /> },
                  { label: "Status do curso", render: (m: any) => (m.ext?.statusCurso ? <Status value={m.ext.statusCurso} /> : "—") }, { label: "Turno", render: (m: any) => (m.ext?.turno ? TURNO_ROTULO[m.ext.turno] ?? m.ext.turno : "—") },
                  { label: "Matriculado em", render: (m: any) => fmtDate(m.dataMatricula) }, { label: "Turmas", render: (m: any) => m.turmas.map((t: any) => t.nome).join(", ") || "—" },
                ]} actions={(m: any) => <Button size="small" onClick={() => setEd({ ext: m.id, row: m.ext ?? {} })}>Editar</Button>} />
              )}
              {tab === 2 && (
                <Box>
                  <Button variant="contained" sx={{ mb: 1.5 }} onClick={() => setEd("contrato")}>Novo contrato</Button>
                  {x.contratos.length ? <DataList rows={x.contratos} columns={[{ label: "Contrato", primary: true, render: (c: any) => c.numero }, { label: "Status", render: (c: any) => <Status value={c.status} /> }, { label: "Mensalidade", render: (c: any) => fmtMoney(c.valorMensalidade) }, { label: "Parcelas", render: (c: any) => c.parcelas }, { label: "Assinado em", render: (c: any) => fmtDate(c.assinadoEm) }, { label: "Vigência", render: (c: any) => `${fmtDate(c.vigenciaInicio)} a ${fmtDate(c.vigenciaFim)}` }]}
                    actions={(c: any) => c.status === "PENDENTE_ASSINATURA" ? <Button size="small" onClick={() => run(() => call("PATCH", `/academico/contratos/${c.id}`, { status: "ASSINADO" }), "Contrato assinado.")}>Marcar assinado</Button> : null} /> : <Typography color="text.secondary">Nenhum contrato.</Typography>}
                </Box>
              )}
              {tab === 3 && (x.notas.length ? <DataList rows={x.notas} columns={[{ label: "Disciplina", primary: true, render: (n: any) => n.disciplina ?? "—" }, { label: "Média parcial", render: (n: any) => fmtNum(n.mediaParcial) }, { label: "Média final", render: (n: any) => fmtNum(n.mediaFinal) }, { label: "Frequência", render: (n: any) => (n.frequenciaPct == null ? "—" : `${fmtNum(n.frequenciaPct, 0)}%`) }, { label: "Faltas", render: (n: any) => n.faltas }, { label: "Situação", render: (n: any) => <Status value={n.situacao} /> }]} /> : <Typography color="text.secondary">Sem notas lançadas.</Typography>)}
              {tab === 4 && (
                <Box>
                  <KpiRow><Kpi title="Parcelas em aberto" value={x.financeiro.emAberto} /><Kpi title="Vencidas" value={x.financeiro.vencidas} color={x.financeiro.vencidas ? "#d64545" : undefined} /><Kpi title="Valor vencido" value={fmtMoney(x.financeiro.valorVencido)} /></KpiRow>
                  {x.financeiro.parcelas.length ? <DataList rows={x.financeiro.parcelas} columns={[{ label: "Descrição", primary: true, render: (p: any) => p.descricao }, { label: "Valor", render: (p: any) => fmtMoney(p.valor) }, { label: "Vencimento", render: (p: any) => fmtDate(p.vencimento) }, { label: "Pago em", render: (p: any) => fmtDate(p.pagoEm) }, { label: "Status", render: (p: any) => <Status value={p.status} /> }]} /> : <Typography color="text.secondary">Sem lançamentos.</Typography>}
                </Box>
              )}
              {tab === 5 && (
                <Box>
                  <Box sx={{ display: "flex", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
                    <Button variant="outlined" onClick={() => { const tipo = window.prompt("Tipo do documento (ex.: RG, CPF, HISTORICO_ESCOLAR)"); if (tipo) void run(() => call("POST", `/academico/alunos/${id}/documentos`, { tipo: tipo.toUpperCase().replace(/\s+/g, "_") }), "Documento incluído como pendente."); }}>Exigir documento</Button>
                    <Chip label={`Horas complementares validadas: ${x.horasComplementares.total}h`} />
                  </Box>
                  {x.documentos.length ? <DataList rows={x.documentos} columns={[{ label: "Documento", primary: true, render: (p: any) => label(p.tipo) }, { label: "Status", render: (p: any) => <Status value={p.status} /> }, { label: "Entregue em", render: (p: any) => fmtDate(p.entregueEm) }, { label: "Obrigatório", render: (p: any) => (p.obrigatorio ? "Sim" : "Não") }]}
                    actions={(p: any) => ["PENDENTE", "REJEITADO", "ENTREGUE"].includes(p.status) ? <Button size="small" onClick={() => run(() => call("PATCH", `/academico/documentos/${p.id}`, { status: p.status === "ENTREGUE" ? "VALIDADO" : "ENTREGUE" }), "Documento atualizado.")}>{p.status === "ENTREGUE" ? "Validar" : "Receber"}</Button> : null} /> : <Typography color="text.secondary">Nenhum documento exigido.</Typography>}
                </Box>
              )}
              {tab === 6 && (x.ocorrencias === null ? <Alert severity="info">Seu perfil não tem acesso às ocorrências disciplinares.</Alert> : x.ocorrencias.length ? <DataList rows={x.ocorrencias} columns={[{ label: "Nº", primary: true, render: (o: any) => o.numero }, { label: "Categoria", render: (o: any) => label(o.categoria) }, { label: "Gravidade", render: (o: any) => <Status value={o.gravidade} /> }, { label: "Data", render: (o: any) => fmtDate(o.dataFato) }, { label: "Situação", render: (o: any) => <Status value={o.status} /> }]} /> : <Typography color="text.secondary">Sem ocorrências registradas.</Typography>)}
            </>
          )}
        </LoadBox>
        <FormDialog open={ed === "perfil"} title="Dados complementares" fields={PERFIL} initial={{ ...(x?.perfil ?? {}) }} onClose={() => setEd(null)} onSubmit={async (b) => { await call("PUT", `/academico/alunos/${id}/perfil`, b); setRev((n) => n + 1); toast({ type: "success", text: "Dados salvos." }); }} />
        <FormDialog open={ed === "contrato"} title="Novo contrato" fields={CONTRATO} initial={{ status: "PENDENTE_ASSINATURA", parcelas: 6, diaVencimento: 10 }} onClose={() => setEd(null)} onSubmit={async (b) => { await call("POST", `/academico/alunos/${id}/contratos`, b); setRev((n) => n + 1); toast({ type: "success", text: "Contrato criado." }); }} />
        <FormDialog open={!!ed && typeof ed === "object"} title="Matrícula — dados da secretaria" fields={MAT_EXT} initial={typeof ed === "object" && ed ? ed.row : {}} onClose={() => setEd(null)} onSubmit={async (b) => { if (typeof ed === "object" && ed) await call("PUT", `/academico/matriculas/${ed.ext}/ext`, b); setRev((n) => n + 1); toast({ type: "success", text: "Matrícula atualizada." }); }} />
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}
