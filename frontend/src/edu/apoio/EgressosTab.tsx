import { Alert, Box, Button, Chip, Pagination, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useState } from "react";
import EduResourcePage, { StatusChip } from "../EduResourcePage";
import { Bar, COLORS, FormDialog, Kpi, KpiRow, LoadBox, Pick, Section, call, fmtDate, fmtDateTime, fmtNum, fmtPct, itemsOf, useApi, useCursos, useRunner, useToast } from "../desempenho/kit";

const SITUACOES = ["EMPREGADO", "AUTONOMO", "EMPREENDEDOR", "DESEMPREGADO", "ESTUDANDO", "CONCURSO", "NAO_INFORMADO"];
const FAIXAS = [{ value: "ate_2sm", label: "Até 2 salários mínimos" }, { value: "2_5sm", label: "2 a 5 salários" }, { value: "5_10sm", label: "5 a 10 salários" }, { value: "acima_10sm", label: "Acima de 10 salários" }];

function Indicadores() {
  const r = useApi<any>("/apoio/egressos/indicadores");
  const g = r.data?.geral;
  const max = (o?: Record<string, number>) => Math.max(1, ...Object.values(o || {}));
  return (
    <Section title="Indicadores de egressos (CPA / regulatório)">
      <LoadBox loading={r.loading} error={r.error} empty={!g?.total} emptyText="Nenhum egresso cadastrado. Importe os concluintes na aba Egressos." onRetry={r.reload}>
        <KpiRow>
          <Kpi title="Egressos" value={g?.total ?? 0} hint={`${fmtPct(g?.taxaInformacao, 0)} com situação informada`} />
          <Kpi title="Inserção profissional" value={fmtPct(g?.taxaInsercao, 0)} color={COLORS.ok} hint={`com estudo: ${fmtPct(g?.taxaInsercaoOuEstudo, 0)}`} />
          <Kpi title="Atuam na área" value={fmtPct(g?.taxaAtuacaoNaArea, 0)} />
          <Kpi title="Pós-graduação" value={fmtPct(g?.taxaPosGraduacao, 0)} />
          <Kpi title="1º emprego" value={g?.tempoMedioPrimeiroEmpregoMeses != null ? `${fmtNum(g.tempoMedioPrimeiroEmpregoMeses)} meses` : "—"} />
          <Kpi title="Perfis atualizados (12 meses)" value={g?.perfisAtualizadosUltimoAno ?? 0} />
        </KpiRow>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
          <Box><Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Situação profissional</Typography>{Object.entries(g?.porSituacao || {}).map(([k, v]) => <Bar key={k} label={k.replace(/_/g, " ")} value={Number(v)} max={max(g?.porSituacao)} right={String(v)} />)}</Box>
          <Box><Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Faixa salarial</Typography>{Object.entries(g?.porFaixaSalarial || {}).map(([k, v]) => <Bar key={k} label={FAIXAS.find((f) => f.value === k)?.label ?? k} value={Number(v)} max={max(g?.porFaixaSalarial)} right={String(v)} color="#7a5cff" />)}</Box>
        </Box>
        {(r.data?.porCurso || []).length > 0 && (
          <Box sx={{ mt: 2, overflowX: "auto" }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Por curso</Typography>
            <Table size="small"><TableHead><TableRow><TableCell>Curso</TableCell><TableCell>Egressos</TableCell><TableCell>Inserção</TableCell><TableCell>Atuação na área</TableCell><TableCell>Informação</TableCell></TableRow></TableHead>
              <TableBody>{r.data.porCurso.map((c: any) => <TableRow key={c.curso}><TableCell>{c.curso}</TableCell><TableCell>{c.total}</TableCell><TableCell>{fmtPct(c.taxaInsercao, 0)}</TableCell><TableCell>{fmtPct(c.taxaAtuacaoNaArea, 0)}</TableCell><TableCell>{fmtPct(c.taxaInformacao, 0)}</TableCell></TableRow>)}</TableBody></Table>
          </Box>
        )}
      </LoadBox>
    </Section>
  );
}

function Lista() {
  const cursos = useCursos();
  const [rev, setRev] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [sit, setSit] = useState("");
  const [edit, setEdit] = useState<null | { row?: any }>(null);
  const [traj, setTraj] = useState<any | null>(null);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const l = useApi<any>(`/apoio/egressos?page=${page}&pageSize=25${q ? `&q=${encodeURIComponent(q)}` : ""}${sit ? `&situacaoProfissional=${sit}` : ""}`, [rev]);
  const rows = itemsOf(l.data);
  const total = l.data?.total ?? 0;
  const fields = [
    { key: "nome", label: "Nome", required: true }, { key: "email", label: "E-mail" }, { key: "telefone", label: "Telefone" }, { key: "programId", label: "Curso", type: "select" as const, options: cursos }, { key: "programaNome", label: "Nome do curso (se fora da lista)" },
    { key: "anoIngresso", label: "Ano de ingresso", type: "number" as const }, { key: "anoConclusao", label: "Ano de conclusão", type: "number" as const }, { key: "cidade", label: "Cidade" }, { key: "uf", label: "UF" },
    { key: "situacaoProfissional", label: "Situação profissional", type: "select" as const, options: SITUACOES }, { key: "empregadorAtual", label: "Empregador atual" }, { key: "cargoAtual", label: "Cargo atual" }, { key: "faixaSalarial", label: "Faixa salarial", type: "select" as const, options: FAIXAS },
    { key: "linkedin", label: "LinkedIn (URL)" }, { key: "atuaNaArea", label: "Atua na área do curso", type: "bool" as const }, { key: "cursandoPos", label: "Cursando pós-graduação", type: "bool" as const }, { key: "consenteContato", label: "Consente contato (LGPD)", type: "bool" as const },
  ];
  return (
    <Section title="Cadastro de egressos" actions={<>
      <TextField size="small" label="Buscar" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
      <Pick label="Situação" value={sit} all="Todas" minWidth={160} onChange={(v) => { setPage(1); setSit(v); }} options={SITUACOES.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))} />
      <Button variant="outlined" onClick={() => run(() => call("POST", "/apoio/egressos/importar-concluintes", {}), "Concluintes importados para o cadastro de egressos.", "Importar alunos concluintes como egressos?")}>Importar concluintes</Button>
      <Button variant="contained" onClick={() => setEdit({})}>Novo egresso</Button>
    </>}>
      {node}
      <LoadBox loading={l.loading} error={l.error} empty={!rows.length} emptyText="Nenhum egresso encontrado." onRetry={l.reload}>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Egresso</TableCell><TableCell>Curso / conclusão</TableCell><TableCell>Situação</TableCell><TableCell>Empregador / cargo</TableCell><TableCell>Atualizado</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id} hover>
                  <TableCell>{e.nome}<Typography variant="caption" color="text.secondary" component="div">{e.email ?? ""}</Typography></TableCell><TableCell>{e.programaNome ?? cursos.find((c) => c.value === e.programId)?.label ?? "—"} {e.anoConclusao ? `(${e.anoConclusao})` : ""}</TableCell>
                  <TableCell><StatusChip value={e.situacaoProfissional} />{!e.consenteContato && <Chip size="small" sx={{ ml: 0.5 }} label="sem consentimento" />}</TableCell>
                  <TableCell>{[e.empregadorAtual, e.cargoAtual].filter(Boolean).join(" — ") || "—"}</TableCell><TableCell>{fmtDate(e.ultimaAtualizacaoEm)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    <Button size="small" onClick={() => setEdit({ row: e })}>Editar</Button><Button size="small" onClick={() => setTraj(e)}>Trajetória</Button>
                    <Button size="small" color="error" onClick={() => run(() => call("POST", `/apoio/egressos/${e.id}/anonimizar`), "Dados anonimizados.", "Anonimizar os dados pessoais deste egresso (LGPD)? A ação é irreversível.")}>Anonimizar</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
        {total > 25 && <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}><Pagination count={Math.ceil(total / 25)} page={page} onChange={(_, v) => setPage(v)} /></Box>}
      </LoadBox>
      <FormDialog open={!!edit} onClose={() => setEdit(null)} title={edit?.row ? "Editar egresso" : "Novo egresso"} fields={fields} initial={edit?.row ? { ...edit.row, primeiroEmpregoEm: undefined } : { situacaoProfissional: "NAO_INFORMADO", consenteContato: true }}
        onSubmit={async (b) => { if (edit?.row) await call("PATCH", `/apoio/egressos/${edit.row.id}`, b); else await call("POST", "/apoio/egressos", b); setRev((x) => x + 1); }} />
      <FormDialog open={!!traj} onClose={() => setTraj(null)} maxWidth="sm" title={`Nova etapa da trajetória — ${traj?.nome ?? ""}`} initial={{ tipo: "EMPREGO" }}
        fields={[{ key: "tipo", label: "Tipo", type: "select", options: ["EMPREGO", "POS_GRADUACAO", "EMPREENDEDORISMO", "CONCURSO", "OUTRO"], required: true }, { key: "organizacao", label: "Organização", required: true }, { key: "cargo", label: "Cargo / curso" }, { key: "inicio", label: "Início", type: "date", required: true }, { key: "fim", label: "Fim", type: "date" }, { key: "atuaNaArea", label: "Atua na área do curso", type: "bool" }]}
        onSubmit={async (b) => { await call("POST", `/apoio/egressos/${traj.id}/trajetoria`, b); toast({ type: "success", text: "Trajetória registrada." }); setRev((x) => x + 1); }} />
    </Section>
  );
}

function Recall() {
  const [rev, setRev] = useState(0);
  const [dias, setDias] = useState("365");
  const l = useApi<any>(`/apoio/egressos/recall?semAtualizacaoDias=${dias}`, [rev]);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const rows = itemsOf(l.data);
  return (
    <Section title="Recall — egressos com cadastro desatualizado" actions={<>
      <Pick label="Sem atualizar há" value={dias} onChange={setDias} minWidth={170} options={[{ value: "180", label: "6 meses" }, { value: "365", label: "1 ano" }, { value: "730", label: "2 anos" }]} />
      <Button variant="contained" disabled={!rows.length} onClick={() => run(async () => { const r = await call("POST", "/apoio/egressos/recall/solicitar-atualizacao", { semAtualizacaoDias: Number(dias) }); toast({ type: "success", text: `${r.enviados} solicitação(ões) de atualização enviadas.` }); }, "Solicitação enviada.", `Enviar pedido de atualização de cadastro a ${rows.length} egresso(s) que consentiram contato?`)}>Solicitar atualização</Button>
    </>}>
      {node}
      <Alert severity="info" sx={{ mb: 2 }}>Somente egressos que consentiram contato (LGPD) entram na lista de campanhas.</Alert>
      <LoadBox loading={l.loading} error={l.error} empty={!rows.length} emptyText="Todos os egressos estão com cadastro atualizado." onRetry={l.reload}>
        <Typography variant="body2" sx={{ mb: 1 }}>{l.data?.total} egresso(s) elegíveis.</Typography>
        <Table size="small"><TableBody>{rows.slice(0, 50).map((e) => <TableRow key={e.id}><TableCell>{e.nome}</TableCell><TableCell>{e.email ?? e.telefone ?? "—"}</TableCell><TableCell>{e.anoConclusao ?? "—"}</TableCell><TableCell>{fmtDate(e.ultimaAtualizacaoEm)}</TableCell></TableRow>)}</TableBody></Table>
      </LoadBox>
    </Section>
  );
}

export default function EgressosTab() {
  const [sub, setSub] = useState("ind");
  const cursos = useCursos();
  return (
    <Box>
      <ToggleButtonGroup size="small" exclusive value={sub} onChange={(_, v) => v && setSub(v)} sx={{ mb: 2 }}>
        <ToggleButton value="ind">Indicadores</ToggleButton><ToggleButton value="lista">Egressos</ToggleButton><ToggleButton value="recall">Recall</ToggleButton><ToggleButton value="eventos">Eventos</ToggleButton>
      </ToggleButtonGroup>
      {sub === "ind" && <Indicadores />}{sub === "lista" && <Lista />}{sub === "recall" && <Recall />}
      {sub === "eventos" && (
        <EduResourcePage title="Eventos para egressos" base="/apoio" resource="/egressos-eventos" searchable={false} description="Encontros, palestras, networking e feiras de carreira."
          columns={[{ key: "titulo", label: "Evento" }, { key: "tipo", label: "Tipo", render: (r) => String(r.tipo).replace(/_/g, " ") }, { key: "dataHora", label: "Data", render: (r) => fmtDateTime(r.dataHora) }, { key: "local", label: "Local" }, { key: "vagas", label: "Vagas" }, { key: "status", label: "Status", render: (r) => <StatusChip value={r.status} /> }]}
          fields={[{ key: "titulo", label: "Título", required: true }, { key: "tipo", label: "Tipo", type: "select", options: ["ENCONTRO", "PALESTRA", "NETWORKING", "CURSO", "HOMECOMING", "FEIRA_CARREIRAS"] }, { key: "dataHora", label: "Data e hora", type: "datetime", required: true }, { key: "local", label: "Local" },
            { key: "vagas", label: "Vagas", type: "number" }, { key: "programId", label: "Curso", type: "select", options: cursos }, { key: "status", label: "Status", type: "select", options: ["PLANEJADO", "ABERTO", "REALIZADO", "CANCELADO"] }, { key: "descricao", label: "Descrição", type: "textarea" }]} />
      )}
    </Box>
  );
}
