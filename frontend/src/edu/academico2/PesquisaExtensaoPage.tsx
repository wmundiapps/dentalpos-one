import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Pagination, Paper, Tab, Tabs, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useState } from "react";
import { ActionsMenu, DataList, FormDialog, Kpi, KpiRow, LoadBox, Pick, Section, Status, abrirHtml, baixar, call, fmtDate, itemsOf, label, qsOf, useApi, useIsMobile, useRunner, useToast, Flag } from "./kit";

const ABAS = ["Ligas e centros acadêmicos", "Extramuros", "Horas complementares", "Pesquisa e extensão", "Relatórios"];
const TIPOS_LIGA = [{ value: "LIGA_ACADEMICA", label: "Liga acadêmica" }, { value: "CENTRO_ACADEMICO", label: "Centro acadêmico" }, { value: "ATLETICA", label: "Atlética" }, { value: "EMPRESA_JUNIOR", label: "Empresa júnior" }, { value: "GRUPO_ESTUDOS", label: "Grupo de estudos" }];

export default function PesquisaExtensaoPage() {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>{ABAS.map((t) => <Tab key={t} label={t} />)}</Tabs>
      {tab === 0 && <Ligas />}
      {tab === 1 && <Extramuros />}
      {tab === 2 && <Horas />}
      {tab === 3 && <Projetos />}
      {tab === 4 && <Relatorios />}
    </Box>
  );
}

function Ligas() {
  const [rev, setRev] = useState(0);
  const [tipo, setTipo] = useState("");
  const [novo, setNovo] = useState(false);
  const [det, setDet] = useState<string | null>(null);
  const { toast, node } = useToast();
  const l = useApi<any>(`/academico/ligas?${qsOf({ tipo, pageSize: 50 })}`, [rev]);
  return (
    <Section title="Ligas acadêmicas e centros acadêmicos" actions={<Button variant="contained" onClick={() => setNovo(true)}>Nova liga / centro</Button>}>
      {node}
      <Box sx={{ mb: 2 }}><Pick label="Tipo" value={tipo} onChange={setTipo} all="Todos" options={TIPOS_LIGA} /></Box>
      <LoadBox loading={l.loading} error={l.error} empty={!itemsOf(l.data).length} emptyText="Nenhuma liga ou centro cadastrado." onRetry={l.reload}>
        <DataList rows={itemsOf(l.data)} onRowClick={(x: any) => setDet(x.id)} columns={[
          { label: "Nome", primary: true, render: (x: any) => <span>{x.nome}{x.sigla && <Typography component="span" variant="caption" color="text.secondary"> ({x.sigla})</Typography>}</span> },
          { label: "Tipo", render: (x: any) => label(x.tipo) }, { label: "Situação", render: (x: any) => <Status value={x.status} /> }, { label: "Membros", render: (x: any) => x._count.membros }, { label: "Atividades", render: (x: any) => x._count.atividades },
          { label: "Orientador", hideOnMobile: true, render: (x: any) => x.orientadorNome ?? "—" },
        ]} />
      </LoadBox>
      <FormDialog open={novo} title="Nova liga ou centro acadêmico" fields={[
        { key: "tipo", label: "Tipo", type: "select", options: TIPOS_LIGA, required: true }, { key: "nome", label: "Nome", required: true }, { key: "sigla", label: "Sigla" }, { key: "areaConhecimento", label: "Área de conhecimento" },
        { key: "orientadorNome", label: "Professor orientador" }, { key: "cargaHorariaMaxAluno", label: "Máx. de horas complementares por aluno", type: "number" }, { key: "estatutoUrl", label: "Estatuto (link https)" }, { key: "descricao", label: "Descrição", type: "textarea" },
      ]} initial={{ tipo: "LIGA_ACADEMICA", cargaHorariaMaxAluno: 60 }} onClose={() => setNovo(false)} onSubmit={async (b) => { await call("POST", "/academico/ligas", b); setRev((x) => x + 1); toast({ type: "success", text: "Cadastrada. Registre membros e envie o plano de atividades para aprovação." }); }} />
      {det && <LigaDialog id={det} onClose={() => { setDet(null); setRev((x) => x + 1); }} />}
    </Section>
  );
}

function LigaDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [tab, setTab] = useState(0);
  const [rev, setRev] = useState(0);
  const [dlg, setDlg] = useState<null | "membro" | "plano" | "ativ" | { realizar: any }>(null);
  const mobile = useIsMobile();
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const d = useApi<any>(`/academico/ligas/${id}`, [rev]);
  const x = d.data;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg" fullScreen={mobile}>
      <DialogTitle sx={{ display: "flex", alignItems: "center" }}><Box sx={{ flex: 1 }}>{x?.nome ?? "Liga"} {x && <Status value={x.status} />}</Box><IconButton onClick={onClose} aria-label="Fechar"><CloseIcon /></IconButton></DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={d.loading} error={d.error} onRetry={d.reload}>
          {x && (
            <>
              <KpiRow><Kpi title="Membros ativos" value={x.resumo.membrosAtivos} /><Kpi title="Atividades realizadas" value={x.resumo.atividadesRealizadas} /><Kpi title="Horas realizadas" value={`${x.resumo.horasRealizadas} h`} /><Kpi title="Planejadas" value={x.resumo.planejadas} /></KpiRow>
              <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>{["Membros", "Plano de atividades", "Atividades"].map((t) => <Tab key={t} label={t} />)}</Tabs>
              {tab === 0 && <Box>
                <Button variant="contained" sx={{ mb: 1.5 }} onClick={() => setDlg("membro")}>Adicionar membro</Button>
                <DataList rows={x.membros} columns={[{ label: "Nome", primary: true, render: (m: any) => m.nome }, { label: "Papel", render: (m: any) => label(m.papel) }, { label: "Entrada", render: (m: any) => fmtDate(m.entrada) }, { label: "Situação", render: (m: any) => (m.ativo ? "Ativo" : `Saiu em ${fmtDate(m.saida)}`) }]}
                  actions={(m: any) => m.ativo ? <Button size="small" color="error" onClick={() => run(() => call("POST", `/academico/ligas-membros/${m.id}/desligar`, {}), "Membro desligado.", "Desligar este membro?")}>Desligar</Button> : null} />
              </Box>}
              {tab === 1 && <Box>
                <Button variant="contained" sx={{ mb: 1.5 }} onClick={() => setDlg("plano")}>Novo plano</Button>
                {x.planos.map((p: any) => (
                  <Paper key={p.id} variant="outlined" sx={{ p: 1.5, mb: 1.5, borderRadius: 3 }}>
                    <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}><Typography sx={{ fontWeight: 800, flex: 1 }}>Plano {p.periodo}</Typography><Status value={p.status} />
                      {p.status === "RASCUNHO" && <Button size="small" onClick={() => run(() => call("POST", `/academico/ligas-planos/${p.id}/enviar`, {}), "Plano enviado para aprovação.")}>Enviar</Button>}
                      {p.status === "ENVIADO" && <><Button size="small" color="success" onClick={() => run(() => call("POST", `/academico/ligas-planos/${p.id}/decidir`, { aprovar: true, parecer: "Aprovado." }), "Plano aprovado.")}>Aprovar</Button><Button size="small" color="error" onClick={() => { const par = window.prompt("Motivo da reprovação"); if (par) void run(() => call("POST", `/academico/ligas-planos/${p.id}/decidir`, { aprovar: false, parecer: par }), "Plano reprovado."); }}>Reprovar</Button></>}</Box>
                    <Typography variant="body2"><b>Objetivos:</b> {p.objetivos}</Typography><Typography variant="body2"><b>Metas:</b> {p.metas ?? "—"}</Typography><Typography variant="body2"><b>Orçamento:</b> R$ {p.orcamento}</Typography>{p.parecer && <Alert severity="info" sx={{ mt: 1 }}>{p.parecer}</Alert>}
                  </Paper>
                ))}
                {!x.planos.length && <Typography color="text.secondary">Sem plano de atividades. Crie um para o período letivo e envie à coordenação.</Typography>}
              </Box>}
              {tab === 2 && <Box>
                <Button variant="contained" sx={{ mb: 1.5 }} onClick={() => setDlg("ativ")}>Nova atividade</Button>
                <DataList rows={x.atividades} columns={[{ label: "Atividade", primary: true, render: (a: any) => a.titulo }, { label: "Tipo", render: (a: any) => label(a.tipo) }, { label: "Data", render: (a: any) => fmtDate(a.inicio) }, { label: "Carga", render: (a: any) => `${a.cargaHoraria} h` }, { label: "Situação", render: (a: any) => <Status value={a.status} /> }, { label: "No calendário", hideOnMobile: true, render: (a: any) => (a.calEventoId ? "Sim" : "Não") }]}
                  actions={(a: any) => a.status === "PLANEJADA" ? <ActionsMenu items={[{ label: "Registrar realização e presença", onClick: () => setDlg({ realizar: a }) }, { label: "Cancelar", color: "error", onClick: () => run(() => call("POST", `/academico/ligas-atividades/${a.id}/cancelar`, {}), "Atividade cancelada.") }]} /> : null} />
              </Box>}
            </>
          )}
        </LoadBox>
        <FormDialog open={dlg === "membro"} title="Adicionar membro" maxWidth="sm" fields={[{ key: "studentId", label: "Aluno", type: "student", required: true }, { key: "papel", label: "Papel", type: "select", required: true, options: ["PRESIDENTE", "VICE", "DIRETOR", "TESOUREIRO", "SECRETARIO", "MEMBRO"] }]} initial={{ papel: "MEMBRO" }} onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", `/academico/ligas/${id}/membros`, b); setRev((n) => n + 1); }} />
        <FormDialog open={dlg === "plano"} title="Plano de atividades" maxWidth="sm" fields={[{ key: "periodo", label: "Período (ex.: 2026/2)", required: true }, { key: "objetivos", label: "Objetivos", type: "textarea", required: true }, { key: "metas", label: "Metas", type: "textarea" }, { key: "orcamento", label: "Orçamento (R$)", type: "number" }]} onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", `/academico/ligas/${id}/planos`, b); setRev((n) => n + 1); }} />
        <FormDialog open={dlg === "ativ"} title="Nova atividade" maxWidth="sm" fields={[{ key: "titulo", label: "Título", required: true }, { key: "tipo", label: "Tipo", type: "select", required: true, options: ["REUNIAO", "AULA", "CONGRESSO", "EVENTO", "ACAO_SOCIAL", "PESQUISA", "EXTENSAO", "EXTRAMUROS", "CAMPEONATO"] }, { key: "inicio", label: "Início", type: "datetime", required: true }, { key: "cargaHoraria", label: "Carga horária (h)", type: "number" }, { key: "local", label: "Local" }, { key: "publicarNoCalendario", label: "Publicar no calendário acadêmico", type: "bool" }]} initial={{ tipo: "REUNIAO", cargaHoraria: 2 }} onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", `/academico/ligas/${id}/atividades`, b); setRev((n) => n + 1); }} />
        <FormDialog open={!!dlg && typeof dlg === "object"} title="Registrar realização e presença" maxWidth="sm" intro={<Alert severity="info" sx={{ mb: 2 }}>Informe os IDs/RA dos presentes pelo seletor; as horas viram lançamentos de horas complementares (respeitando o teto da liga por aluno).</Alert>} fields={[{ key: "alunoA", label: "Presente 1", type: "student" }, { key: "alunoB", label: "Presente 2", type: "student" }, { key: "alunoC", label: "Presente 3", type: "student" }, { key: "relatorio", label: "Relatório da atividade", type: "textarea" }]} onClose={() => setDlg(null)}
          onSubmit={async (b, raw) => { const ids = [raw.alunoA, raw.alunoB, raw.alunoC].filter(Boolean); const a = (dlg as any).realizar; const r: any = await call("POST", `/academico/ligas-atividades/${a.id}/realizar`, { presentes: ids.map((studentId) => ({ studentId })), relatorio: b.relatorio }); toast({ type: "success", text: `Registrado: ${r.presentes} presente(s), ${r.horasGeradas} lançamento(s) de horas.` }); setRev((n) => n + 1); }} />
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

function Extramuros() {
  const [rev, setRev] = useState(0);
  const [novo, setNovo] = useState(false);
  const [part, setPart] = useState<any>(null);
  const [real, setReal] = useState<any>(null);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const l = useApi<any>(`/academico/extramuros?pageSize=50`, [rev]);
  const det = useApi<any>(real ? `/academico/extramuros/${real.id}` : null);
  const [marcados, setMarcados] = useState<string[]>([]);
  return (
    <Section title="Atividades extramuros" actions={<Button variant="contained" onClick={() => setNovo(true)}>Nova atividade</Button>}>
      {node}
      <Alert severity="info" sx={{ mb: 2 }}>Visitas técnicas, ações comunitárias, aulas de campo e mutirões fora do campus. A coordenação só aprova com termo de autorização e, para risco médio/alto, seguro. As horas dos presentes viram horas complementares.</Alert>
      <LoadBox loading={l.loading} error={l.error} empty={!itemsOf(l.data).length} emptyText="Nenhuma atividade extramuros." onRetry={l.reload}>
        <DataList rows={itemsOf(l.data)} columns={[
          { label: "Atividade", primary: true, render: (e: any) => <span>{e.titulo}<Typography variant="caption" color="text.secondary" component="div">{e.codigo} · {e.local}</Typography></span> }, { label: "Tipo", render: (e: any) => label(e.tipo) },
          { label: "Data", render: (e: any) => fmtDate(e.inicio) }, { label: "Situação", render: (e: any) => <Status value={e.status} /> }, { label: "Inscritos", render: (e: any) => `${e._count.participantes}${e.vagas ? `/${e.vagas}` : ""}` },
          { label: "Risco", render: (e: any) => <Flag color={e.riscoNivel === "ALTO" ? "error" : e.riscoNivel === "MEDIO" ? "warning" : "default"}>{e.riscoNivel}</Flag> }, { label: "Seguro", hideOnMobile: true, render: (e: any) => (e.seguro ? "Sim" : "Não") },
        ]} actions={(e: any) => <ActionsMenu items={[
          { label: "Inscrever aluno", show: !["REALIZADA", "CANCELADA"].includes(e.status), onClick: () => setPart(e) },
          { label: "Aprovar", show: e.status === "PLANEJADA", onClick: () => run(() => call("POST", `/academico/extramuros/${e.id}/status`, { status: "APROVADA" }), "Atividade aprovada.") },
          { label: "Registrar realização", show: e.status === "APROVADA", onClick: () => { setMarcados([]); setReal(e); } },
          { label: "Cancelar", show: !["REALIZADA", "CANCELADA"].includes(e.status), color: "error", onClick: () => run(() => call("POST", `/academico/extramuros/${e.id}/status`, { status: "CANCELADA" }), "Atividade cancelada.", "Cancelar a atividade?") },
        ]} />} />
      </LoadBox>
      <FormDialog open={novo} title="Nova atividade extramuros" fields={[
        { key: "titulo", label: "Título", required: true }, { key: "tipo", label: "Tipo", type: "select", required: true, options: ["VISITA_TECNICA", "ACAO_COMUNITARIA", "AULA_CAMPO", "ESTAGIO_CAMPO", "MUTIRAO", "SAUDE_COMUNIDADE"] }, { key: "local", label: "Local", required: true }, { key: "cidade", label: "Cidade" },
        { key: "inicio", label: "Início", type: "datetime", required: true }, { key: "vagas", label: "Vagas", type: "number" }, { key: "cargaHoraria", label: "Carga horária (h)", type: "number" }, { key: "riscoNivel", label: "Nível de risco", type: "select", options: ["BAIXO", "MEDIO", "ALTO"] },
        { key: "transporte", label: "Transporte contratado", type: "bool" }, { key: "seguro", label: "Seguro de acidentes pessoais", type: "bool" }, { key: "termoAutorizacao", label: "Exige termo de autorização", type: "bool" },
      ]} initial={{ tipo: "VISITA_TECNICA", riscoNivel: "BAIXO", termoAutorizacao: true }} onClose={() => setNovo(false)} onSubmit={async (b) => { await call("POST", "/academico/extramuros", b); setRev((x) => x + 1); toast({ type: "success", text: "Atividade criada." }); }} />
      <FormDialog open={!!part} title={`Inscrever aluno — ${part?.titulo ?? ""}`} maxWidth="sm" fields={[{ key: "studentId", label: "Aluno", type: "student", required: true }, { key: "termoAceito", label: "Termo de autorização aceito", type: "bool" }]} initial={{ termoAceito: true }} onClose={() => setPart(null)} onSubmit={async (b) => { await call("POST", `/academico/extramuros/${part.id}/participantes`, b); setRev((x) => x + 1); toast({ type: "success", text: "Aluno inscrito." }); }} />
      <Dialog open={!!real} onClose={() => setReal(null)} fullWidth maxWidth="sm">
        <DialogTitle>Presença — {real?.titulo}</DialogTitle>
        <DialogContent dividers>
          <LoadBox loading={det.loading} error={det.error} empty={!det.data?.participantes?.length} emptyText="Sem inscritos." onRetry={det.reload}>
            {det.data?.participantes?.map((p: any) => <Box key={p.id} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.3 }}><Chip label={marcados.includes(p.studentId) ? "Presente" : "Ausente"} color={marcados.includes(p.studentId) ? "success" : "default"} onClick={() => setMarcados(marcados.includes(p.studentId) ? marcados.filter((x) => x !== p.studentId) : [...marcados, p.studentId])} /><Typography>{p.aluno?.nomeCompleto}</Typography></Box>)}
          </LoadBox>
        </DialogContent>
        <DialogActions><Button onClick={() => setReal(null)}>Cancelar</Button><Button variant="contained" onClick={async () => { const r = await run(() => call("POST", `/academico/extramuros/${real.id}/realizar`, { presentes: marcados }), "Realização registrada e horas geradas."); if (r) setReal(null); }}>Confirmar</Button></DialogActions>
      </Dialog>
    </Section>
  );
}

function Horas() {
  const [rev, setRev] = useState(0);
  const [st, setSt] = useState("PENDENTE");
  const [page, setPage] = useState(1);
  const [novo, setNovo] = useState(false);
  const [val, setVal] = useState<any>(null);
  const { toast, node } = useToast();
  const l = useApi<any>(`/academico/horas-complementares?${qsOf({ status: st, page, pageSize: 20 })}`, [rev]);
  const regras = useApi<any>("/academico/horas-complementares/regras", [rev]);
  const [regra, setRegra] = useState(false);
  const CATS = itemsOf({ items: regras.data?.categorias ?? [] });
  return (
    <Section title="Horas complementares" actions={<><Button variant="outlined" onClick={() => setRegra(true)}>Tetos por categoria</Button><Button variant="contained" onClick={() => setNovo(true)}>Lançar horas</Button></>}>
      {node}
      <Box sx={{ mb: 2 }}><Pick label="Situação" value={st} onChange={(v) => { setSt(v); setPage(1); }} all="Todas" options={["PENDENTE", "APROVADA", "PARCIAL", "REJEITADA"].map((x) => ({ value: x, label: label(x) }))} /></Box>
      <LoadBox loading={l.loading} error={l.error} empty={!itemsOf(l.data).length} emptyText="Nenhum lançamento." onRetry={l.reload}>
        <DataList rows={itemsOf(l.data)} columns={[
          { label: "Aluno", primary: true, render: (h: any) => h.aluno?.nomeCompleto ?? "—" }, { label: "Categoria", render: (h: any) => label(h.categoria) }, { label: "Descrição", render: (h: any) => h.descricao }, { label: "Origem", hideOnMobile: true, render: (h: any) => label(h.origemTipo) },
          { label: "Informadas", render: (h: any) => `${h.horasInformadas} h` }, { label: "Validadas", render: (h: any) => `${h.horasValidadas} h` }, { label: "Situação", render: (h: any) => <Status value={h.status} /> },
        ]} actions={(h: any) => h.status === "PENDENTE" ? <Button size="small" variant="contained" onClick={() => setVal(h)}>Validar</Button> : null} />
        <Pagination sx={{ mt: 2 }} count={Math.max(1, Math.ceil((l.data?.total ?? 0) / 20))} page={page} onChange={(_, n) => setPage(n)} />
      </LoadBox>
      <FormDialog open={novo} title="Lançar horas complementares" maxWidth="sm" fields={[{ key: "studentId", label: "Aluno (deixe vazio se você for o aluno)", type: "student" }, { key: "categoria", label: "Categoria", type: "select", required: true, options: CATS }, { key: "descricao", label: "Descrição", required: true }, { key: "data", label: "Data", type: "date" }, { key: "horasInformadas", label: "Horas", type: "number", required: true }, { key: "comprovanteUrl", label: "Comprovante (link https)" }]} initial={{ categoria: "EVENTO" }} onClose={() => setNovo(false)} onSubmit={async (b) => { await call("POST", "/academico/horas-complementares", b); setRev((x) => x + 1); toast({ type: "success", text: "Horas lançadas para validação." }); }} />
      <FormDialog open={!!val} title={`Validar — ${val?.descricao ?? ""}`} maxWidth="sm" intro={<Alert severity="info" sx={{ mb: 2 }}>O sistema aplica o teto da categoria para o curso do aluno. Para rejeitar, escolha “Rejeitar” e informe o motivo.</Alert>} fields={[{ key: "aprovar", label: "Aprovar (desmarque para rejeitar)", type: "bool" }, { key: "horasValidadas", label: "Horas a validar (opcional)", type: "number" }, { key: "parecer", label: "Parecer", type: "textarea" }]} initial={{ aprovar: true }} onClose={() => setVal(null)} onSubmit={async (b) => { await call("POST", `/academico/horas-complementares/${val.id}/validar`, b); setRev((x) => x + 1); toast({ type: "success", text: "Lançamento avaliado." }); }} />
      <FormDialog open={regra} title="Teto de horas por categoria" maxWidth="sm" fields={[{ key: "categoria", label: "Categoria", type: "select", required: true, options: CATS }, { key: "maxHoras", label: "Máximo de horas", type: "number", required: true }, { key: "fator", label: "Fator de aproveitamento (1 = integral)", type: "number" }]} initial={{ fator: 1 }} onClose={() => setRegra(false)} onSubmit={async (b) => { await call("PUT", "/academico/horas-complementares/regras", b); setRev((x) => x + 1); toast({ type: "success", text: "Regra salva." }); }} />
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>Regras atuais: {itemsOf(regras.data).map((r: any) => `${label(r.categoria)} ≤ ${r.maxHoras}h`).join(" · ") || "nenhuma"}.</Typography>
    </Section>
  );
}

function Projetos() {
  const [tipo, setTipo] = useState("");
  const l = useApi<any>(`/academico/pesquisa-extensao/projetos?${qsOf({ tipo, pageSize: 50 })}`);
  return (
    <Section title="Projetos de pesquisa e extensão">
      <Alert severity="info" sx={{ mb: 2 }}>Os projetos são cadastrados e geridos no módulo <b>Pesquisa</b> (editais, bolsas, etapas, orçamento). Esta visão mostra o que existe para acompanhar a participação dos alunos e gerar horas complementares.</Alert>
      <Box sx={{ mb: 2 }}><Pick label="Tipo" value={tipo} onChange={setTipo} all="Todos" options={["PESQUISA", "EXTENSAO", "IC", "PIBIC", "PIBITI", "INOVACAO", "OUTRO"].map((x) => ({ value: x, label: label(x) }))} /></Box>
      <LoadBox loading={l.loading} error={l.error} empty={!itemsOf(l.data).length} emptyText="Nenhum projeto." onRetry={l.reload}>
        <DataList rows={itemsOf(l.data)} columns={[{ label: "Projeto", primary: true, render: (p: any) => <span>{p.titulo}<Typography variant="caption" color="text.secondary" component="div">{p.codigo}</Typography></span> }, { label: "Tipo", render: (p: any) => label(p.tipo) }, { label: "Situação", render: (p: any) => <Status value={p.status} /> }, { label: "Coordenador", render: (p: any) => p.coordenadorNome ?? "—" }, { label: "Participantes", render: (p: any) => p._count.membros }]} />
      </LoadBox>
    </Section>
  );
}

function Relatorios() {
  const { toast, node } = useToast();
  const run = useRunner(toast);
  const r = useApi<any>("/academico/pesquisa-extensao/relatorio");
  return (
    <Section title="Relatório consolidado" actions={<><Button variant="outlined" onClick={() => run(() => abrirHtml("/academico/pesquisa-extensao/relatorio?formato=html"))}>Visualizar / imprimir</Button><Button variant="contained" onClick={() => run(() => baixar("/academico/pesquisa-extensao/relatorio?formato=xlsx", "pesquisa-extensao.xlsx"), "Planilha gerada.")}>Excel</Button></>}>
      {node}
      <LoadBox loading={r.loading} error={r.error} onRetry={r.reload}>
        {r.data && (
          <>
            <KpiRow><Kpi title="Projetos" value={r.data.projetos.reduce((s: number, p: any) => s + p.qtd, 0)} /><Kpi title="Ligas e centros" value={r.data.ligas.length} /><Kpi title="Atividades extramuros" value={r.data.extramuros.length} /><Kpi title="Horas validadas" value={`${r.data.horas.reduce((s: number, h: any) => s + h.validadas, 0)} h`} /></KpiRow>
            <Typography sx={{ fontWeight: 800, mb: 1 }}>Ligas e centros</Typography>
            <DataList rows={r.data.ligas.map((l: any, i: number) => ({ ...l, id: String(i) }))} columns={[{ label: "Nome", primary: true, render: (l: any) => l.nome }, { label: "Tipo", render: (l: any) => label(l.tipo) }, { label: "Situação", render: (l: any) => <Status value={l.status} /> }, { label: "Membros", render: (l: any) => l.membros }, { label: "Atividades", render: (l: any) => l.atividades }]} />
          </>
        )}
      </LoadBox>
    </Section>
  );
}
