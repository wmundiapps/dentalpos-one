import { Alert, Box, Button, Chip, Table, TableBody, TableCell, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useState } from "react";
import EduResourcePage, { StatusChip } from "../EduResourcePage";
import { Bar, FormDialog, Kpi, KpiRow, LoadBox, Pick, Section, Status, call, fmtDate, fmtPct, itemsOf, useApi, useCursos, useExames, useRunner, useToast } from "./kit";

const TIPOS = ["ENADE", "OAB_1FASE", "OAB_2FASE", "ENAMED", "RESIDENCIA", "REVALIDA", "CONCURSO", "OUTRO"];
const STATUS_EDICAO = ["PLANEJADA", "INSCRICOES_ABERTAS", "INSCRICOES_ENCERRADAS", "REALIZADA", "RESULTADO_PUBLICADO", "CANCELADA"];
const SITUACOES = ["PENDENTE", "INSCRITO", "REGULAR", "DISPENSADO", "IRREGULAR", "AUSENTE"];

function Matriz({ exames }: { exames: Array<{ value: string; label: string }> }) {
  const [id, setId] = useState("");
  const m = useApi<any>(id ? `/desempenho/exames/${id}/matriz` : null);
  return (
    <Section title="Matriz de referência (distribuição de questões por eixo)" actions={<Pick label="Exame" value={id} onChange={setId} options={exames} />}>
      {!id ? <Typography color="text.secondary">Selecione um exame para ver a distribuição proporcional dos pesos.</Typography> : (
        <LoadBox loading={m.loading} error={m.error} empty={!m.data?.matriz?.length} emptyText="Exame sem eixos cadastrados." onRetry={m.reload}>
          {(m.data?.matriz || []).map((e: any) => (
            <Bar key={e.eixoId} label={`${e.codigo} — ${e.nome}`} value={e.pesoPercentual} right={`${e.quantidade} questões · peso ${fmtPct(e.pesoPercentual)} · meta ${fmtPct(e.metaAcerto, 0)}`} />
          ))}
        </LoadBox>
      )}
    </Section>
  );
}

function Inscricoes() {
  const edicoes = useApi<any>("/desempenho/edicoes?pageSize=100");
  const cursos = useCursos();
  const [ed, setEd] = useState("");
  const [rev, setRev] = useState(0);
  const [gerar, setGerar] = useState(false);
  const [edit, setEdit] = useState<any | null>(null);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const resumo = useApi<any>(ed ? `/desempenho/edicoes/${ed}/resumo` : null, [rev]);
  const lista = useApi<any>(ed ? `/desempenho/edicoes/${ed}/inscricoes?pageSize=100` : null, [rev]);
  const pend = useApi<any>(ed ? `/desempenho/edicoes/${ed}/pendencias` : null, [rev]);
  const opts = itemsOf(edicoes.data).map((e) => ({ value: e.id, label: `${e.exame?.nome ?? "Exame"} ${e.ano}` }));
  const urg = pend.data?.urgencia;
  const urgColor = urg === "CRITICO" ? "error" : urg === "ATENCAO" ? "warning" : urg === "ENCERRADO" ? "default" : "success";
  return (
    <Section title="Inscrições e regularidade" actions={<Pick label="Edição do exame" value={ed} onChange={setEd} options={opts} minWidth={260} />}>
      {node}
      {edicoes.error && <Alert severity="warning">{edicoes.error}</Alert>}
      {!ed ? <Typography color="text.secondary">Escolha uma edição (ex.: ENADE 2026) para acompanhar a regularidade dos inscritos.</Typography> : (
        <>
          <KpiRow>
            <Kpi title="Inscritos" value={resumo.data?.total ?? "—"} />
            <Kpi title="Regularidade" value={fmtPct(resumo.data?.regularidadePercentual)} color={resumo.data?.regularidadePercentual >= 90 ? "#2e9e5b" : "#e0a100"} />
            <Kpi title="Pendências" value={pend.data?.total ?? "—"} hint={pend.data?.diasRestantes != null ? `${pend.data.diasRestantes} dia(s) para o fim das inscrições` : undefined} />
            <Kpi title="Urgência" value={urg ? <Chip size="small" color={urgColor as any} label={urg} /> : "—"} />
          </KpiRow>
          <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
            <Button variant="contained" onClick={() => setGerar(true)}>Gerar lista de inscritos</Button>
            <Button variant="outlined" onClick={() => run(() => call("POST", `/desempenho/edicoes/${ed}/notificar-pendentes`), "Pendentes notificados.", "Notificar todos os alunos com inscrição pendente ou irregular?")}>Notificar pendentes</Button>
          </Box>
          {Object.entries(resumo.data?.porSituacao || {}).map(([k, v]) => <Bar key={k} label={k} value={Number(v)} max={resumo.data?.total || 1} right={String(v)} />)}
          <LoadBox loading={lista.loading} error={lista.error} empty={!itemsOf(lista.data).length} emptyText="Nenhum inscrito. Use “Gerar lista de inscritos”." onRetry={lista.reload}>
            <Box sx={{ overflowX: "auto", mt: 1 }}>
              <Table size="small">
                <TableHead><TableRow><TableCell>Aluno</TableCell><TableCell>RA</TableCell><TableCell>Categoria</TableCell><TableCell>Situação</TableCell><TableCell>Protocolo</TableCell><TableCell /></TableRow></TableHead>
                <TableBody>
                  {itemsOf(lista.data).map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell>{r.aluno?.nome ?? r.studentId}</TableCell><TableCell>{r.aluno?.ra ?? "—"}</TableCell><TableCell>{r.categoria ?? "—"}</TableCell>
                      <TableCell><Status value={r.situacao} /></TableCell><TableCell>{r.protocolo ?? "—"}</TableCell>
                      <TableCell align="right"><Button size="small" onClick={() => setEdit(r)}>Atualizar</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </LoadBox>
        </>
      )}
      <FormDialog open={gerar} onClose={() => setGerar(false)} title="Gerar lista de inscritos" maxWidth="sm" submitLabel="Gerar"
        intro={<Alert severity="info" sx={{ mb: 2 }}>A lista usa a data de matrícula como critério interno. Confira com o regulatório antes de enviar ao INEP.</Alert>}
        fields={[
          { key: "programId", label: "Curso", type: "select", options: cursos, required: true },
          { key: "categoria", label: "Categoria", type: "select", options: ["CONCLUINTE", "INGRESSANTE", "CANDIDATO"], required: true },
          { key: "mesesMinimosConcluinte", label: "Meses mínimos (concluinte)", type: "number" },
        ]} initial={{ categoria: "CONCLUINTE", mesesMinimosConcluinte: 24 }}
        onSubmit={async (b) => { const r = await call("POST", `/desempenho/edicoes/${ed}/gerar-inscritos`, b); toast({ type: "success", text: `${r.criados} inscrito(s) criados; ${r.jaExistiam} já existiam.` }); setRev((x) => x + 1); }} />
      <FormDialog open={!!edit} onClose={() => setEdit(null)} title={`Atualizar inscrição — ${edit?.aluno?.nome ?? ""}`} maxWidth="sm"
        fields={[
          { key: "situacao", label: "Situação", type: "select", options: SITUACOES, required: true },
          { key: "protocolo", label: "Protocolo / comprovante", helper: "Obrigatório para INSCRITO/REGULAR" },
          { key: "nota", label: "Nota (0-100)", type: "number" }, { key: "conceito", label: "Conceito (1-5)", type: "number" },
          { key: "observacao", label: "Observação", type: "textarea" },
        ]} initial={edit ? { situacao: edit.situacao, protocolo: edit.protocolo ?? "" } : {}}
        onSubmit={async (b) => { await call("PATCH", `/desempenho/inscricoes/${edit.id}`, b); setRev((x) => x + 1); }} />
    </Section>
  );
}

export default function ExamesTab() {
  const [sub, setSub] = useState("exames");
  const [rev, setRev] = useState(0);
  const exames = useExames();
  const cursos = useCursos();
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  return (
    <Box>
      {node}
      <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
        <ToggleButtonGroup size="small" exclusive value={sub} onChange={(_, v) => v && setSub(v)}>
          <ToggleButton value="exames">Exames</ToggleButton><ToggleButton value="edicoes">Edições</ToggleButton>
          <ToggleButton value="inscricoes">Inscrições</ToggleButton><ToggleButton value="eixos">Eixos e matriz</ToggleButton><ToggleButton value="metas">Metas por curso</ToggleButton>
        </ToggleButtonGroup>
        <Button size="small" variant="outlined" onClick={() => run(() => call("POST", "/desempenho/bootstrap"), "Catálogo de exames garantido.", "Carregar o catálogo padrão (OAB, ENADE, ENAMED, Residência, Revalida)? Itens existentes são preservados.")}>Carregar catálogo padrão</Button>
      </Box>
      {sub === "exames" && (
        <EduResourcePage key={`ex${rev}`} title="Exames" base="/desempenho" resource="/exames" description="ENADE, OAB, ENAMED, Residência e outros exames de proficiência." filters={[{ key: "tipo", label: "Tipo", options: TIPOS }]}
          columns={[{ key: "codigo", label: "Código" }, { key: "nome", label: "Exame" }, { key: "tipo", label: "Tipo" }, { key: "numQuestoes", label: "Questões" }, { key: "notaCorte", label: "Nota de corte" }, { key: "ativo", label: "Ativo" }]}
          fields={[
            { key: "codigo", label: "Código", required: true }, { key: "nome", label: "Nome", required: true }, { key: "tipo", label: "Tipo", type: "select", options: TIPOS, required: true },
            { key: "numQuestoes", label: "Nº de questões", type: "number" }, { key: "duracaoMin", label: "Duração (min)", type: "number" }, { key: "notaCorte", label: "Nota de corte (%)", type: "number" },
            { key: "descricao", label: "Descrição", type: "textarea" }, { key: "ativo", label: "Ativo", type: "bool" },
          ]} />
      )}
      {sub === "edicoes" && (
        <EduResourcePage key={`ed${rev}${exames.length}`} title="Edições / calendário dos exames" base="/desempenho" resource="/edicoes" filters={[{ key: "status", label: "Status", options: STATUS_EDICAO }]} searchable={false}
          description="Datas de prova, inscrição e resultado geram lembretes automáticos para coordenação e docentes."
          columns={[{ key: "exame", label: "Exame", render: (r) => r.exame?.nome ?? "—" }, { key: "ano", label: "Ano" }, { key: "dataProva", label: "Prova", render: (r) => fmtDate(r.dataProva) },
            { key: "inscricaoFim", label: "Fim inscrições", render: (r) => fmtDate(r.inscricaoFim) }, { key: "dataResultado", label: "Resultado", render: (r) => fmtDate(r.dataResultado) }, { key: "status", label: "Status", render: (r) => <StatusChip value={r.status} /> }]}
          fields={[
            { key: "exameId", label: "Exame", type: "select", options: exames, required: true, createOnly: true }, { key: "ano", label: "Ano", type: "number", required: true }, { key: "titulo", label: "Título" },
            { key: "dataProva", label: "Data da prova", type: "date" }, { key: "inscricaoInicio", label: "Início das inscrições", type: "date" }, { key: "inscricaoFim", label: "Fim das inscrições", type: "date" },
            { key: "dataResultado", label: "Divulgação do resultado", type: "date" }, { key: "status", label: "Status", type: "select", options: STATUS_EDICAO }, { key: "observacoes", label: "Observações", type: "textarea" },
          ]} />
      )}
      {sub === "inscricoes" && <Inscricoes />}
      {sub === "eixos" && (
        <>
          <Matriz exames={exames} />
          <EduResourcePage key={`ei${rev}${exames.length}`} title="Eixos, áreas e competências" base="/desempenho" resource="/eixos" filters={[{ key: "tipo", label: "Tipo", options: ["AREA", "EIXO", "COMPETENCIA"] }]}
            columns={[{ key: "codigo", label: "Código" }, { key: "nome", label: "Nome" }, { key: "tipo", label: "Tipo" }, { key: "peso", label: "Peso" }, { key: "metaAcerto", label: "Meta de acerto (%)" }, { key: "ordem", label: "Ordem" }]}
            fields={[
              { key: "exameId", label: "Exame", type: "select", options: exames, required: true, createOnly: true }, { key: "codigo", label: "Código", required: true }, { key: "nome", label: "Nome", required: true },
              { key: "tipo", label: "Tipo", type: "select", options: ["AREA", "EIXO", "COMPETENCIA"] }, { key: "peso", label: "Peso", type: "number" }, { key: "metaAcerto", label: "Meta de acerto (%)", type: "number" },
              { key: "ordem", label: "Ordem", type: "number" }, { key: "descricao", label: "Descrição", type: "textarea" }, { key: "ativo", label: "Ativo", type: "bool" },
            ]} />
        </>
      )}
      {sub === "metas" && (
        <EduResourcePage key={`me${rev}${cursos.length}`} title="Metas de desempenho por curso" base="/desempenho" resource="/metas" searchable={false}
          columns={[{ key: "programId", label: "Curso", render: (r) => cursos.find((c) => c.value === r.programId)?.label ?? r.programId }, { key: "exameId", label: "Exame", render: (r) => exames.find((c) => c.value === r.exameId)?.label ?? r.exameId },
            { key: "ano", label: "Ano" }, { key: "metaAcerto", label: "Meta de acerto (%)" }, { key: "conceitoAlvo", label: "Conceito-alvo" }]}
          fields={[
            { key: "programId", label: "Curso", type: "select", options: cursos, required: true, createOnly: true }, { key: "exameId", label: "Exame", type: "select", options: exames, required: true, createOnly: true },
            { key: "ano", label: "Ano", type: "number", required: true }, { key: "metaAcerto", label: "Meta de acerto (%)", type: "number", required: true }, { key: "conceitoAlvo", label: "Conceito-alvo (1-5)", type: "number" },
          ]} />
      )}
    </Box>
  );
}
