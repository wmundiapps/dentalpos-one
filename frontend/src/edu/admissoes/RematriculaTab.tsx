import { Box, Button, MenuItem, Pagination, Table, TableBody, TableCell, TableHead, TableRow, Tab, Tabs, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import EduResourcePage, { StatusChip, type FieldDef } from "../EduResourcePage";
import { useTermOptions } from "./ProcessosTab";
import { Bar, BASE, Section, Stat, StateBox, asList, fmtDate, money, pct, useLoad, type Toast } from "./common";

const STATUS_ITEM = ["ELEGIVEL", "PENDENTE_FINANCEIRO", "PENDENTE_ACADEMICO", "CONFIRMADA", "NAO_RENOVOU", "TRANCADA"];

function Acompanhamento({ toast }: { toast: (t: Toast) => void }) {
  const camps = useLoad<any>(`${BASE}/rematricula/campanhas?pageSize=100`);
  const [cid, setCid] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const rel = useLoad<any>(cid ? `${BASE}/rematricula/campanhas/${cid}/relatorio` : null);
  const itens = useLoad<any>(cid ? `${BASE}/rematricula/campanhas/${cid}/itens${qsOf({ status, page, pageSize: 25 })}` : null);
  const rows = asList(itens.data);
  const total = itens.data?.total ?? rows.length;
  const g = rel.data?.geral;

  async function act(path: string, ok: string, body: any = {}) {
    try { await eduApi.post(`${BASE}${path}`, body); toast({ type: "success", text: ok }); itens.reload(); rel.reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }

  return (
    <>
      <Section title="Acompanhamento da rematrícula" description="Retenção, receita em risco e situação aluno a aluno.">
        <StateBox loading={camps.loading} error={camps.error} onRetry={camps.reload} empty={!asList(camps.data).length} emptyText="Crie uma campanha de rematrícula na aba Campanhas.">
          <TextField select size="small" label="Campanha" value={cid} onChange={(e) => { setCid(e.target.value); setPage(1); }} sx={{ minWidth: 320, mb: 2 }}>
            {asList(camps.data).map((c) => <MenuItem key={c.id} value={c.id}>{c.nome} ({String(c.status).toLowerCase()})</MenuItem>)}
          </TextField>
          {cid ? (
            <StateBox loading={rel.loading} error={rel.error} onRetry={rel.reload}>
              {g ? (
                <>
                  <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>
                    <Stat label="Base de alunos" value={g.base} />
                    <Stat label="Confirmadas" value={g.confirmadas} color="#2e7d32" />
                    <Stat label="Pendentes" value={g.pendentes} color="#ed6c02" />
                    <Stat label="Não renovaram" value={g.naoRenovou} color="#d32f2f" />
                    <Stat label="Taxa de retenção" value={pct(g.taxaRetencao)} />
                    <Stat label="Receita rematriculada" value={money(rel.data.receitaRematriculada)} />
                    <Stat label="Receita em risco" value={money(rel.data.receitaEmRisco)} color="#d32f2f" />
                  </Box>
                  <Bar value={g.confirmadas} max={g.base} color="success" label={`Progresso: ${g.confirmadas} de ${g.base} alunos confirmados`} />
                  {(rel.data.porCurso || []).length ? (
                    <Box sx={{ display: "grid", gap: 1, mt: 2 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Retenção por curso</Typography>
                      {rel.data.porCurso.map((c: any) => <Bar key={c.programId} value={c.confirmadas} max={c.base} label={`${c.curso || "Sem curso"} — ${pct(c.taxaRetencao)} (${c.confirmadas}/${c.base})`} />)}
                    </Box>
                  ) : null}
                </>
              ) : null}
            </StateBox>
          ) : null}
        </StateBox>
      </Section>
      {cid ? (
        <Section title="Alunos da campanha" actions={
          <TextField select size="small" label="Situação" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} sx={{ minWidth: 220 }}>
            <MenuItem value="">Todas</MenuItem>{STATUS_ITEM.map((s) => <MenuItem key={s} value={s}>{s.replace(/_/g, " ")}</MenuItem>)}
          </TextField>}>
          <StateBox loading={itens.loading} error={itens.error} onRetry={itens.reload} empty={!rows.length} emptyText="Nenhum aluno na lista. Use “Gerar lista” na campanha.">
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead><TableRow>{["Aluno", "RA", "Valor", "Desconto", "Situação / pendências", ""].map((h) => <TableCell key={h} sx={{ fontWeight: 800 }}>{h}</TableCell>)}</TableRow></TableHead>
                <TableBody>
                  {rows.map((i) => (
                    <TableRow key={i.id} hover>
                      <TableCell>{i.aluno?.nomeCompleto || i.studentId}</TableCell><TableCell>{i.aluno?.ra || "—"}</TableCell>
                      <TableCell>{money(i.valorFinal || i.valorBase)}</TableCell><TableCell>{money(i.desconto)}</TableCell>
                      <TableCell><StatusChip value={i.status} />{Array.isArray(i.pendencias) && i.pendencias.length ? <Typography variant="caption" color="text.secondary" component="div">{i.pendencias.join("; ")}</Typography> : null}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        {!["CONFIRMADA", "NAO_RENOVOU"].includes(i.status) ? <>
                          <Button size="small" onClick={() => act(`/rematricula/itens/${i.id}/recalcular`, "Pendências recalculadas.")}>Recalcular</Button>
                          <Button size="small" color="success" onClick={() => { if (window.confirm("Confirmar a rematrícula deste aluno?")) act(`/rematricula/itens/${i.id}/confirmar`, "Rematrícula confirmada."); }}>Confirmar</Button>
                          <Button size="small" color="error" onClick={() => { if (window.confirm("Marcar como não renovou?")) act(`/rematricula/itens/${i.id}/nao-renovou`, "Marcado como não renovou."); }}>Não renovou</Button>
                        </> : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
            {total > 25 ? <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}><Pagination count={Math.ceil(total / 25)} page={page} onChange={(_, v) => setPage(v)} /></Box> : null}
          </StateBox>
        </Section>
      ) : null}
    </>
  );
}

export default function RematriculaTab({ toast }: { toast: (t: Toast) => void }) {
  const [sub, setSub] = useState(0);
  const termOpts = useTermOptions();
  const fields: FieldDef[] = [
    { key: "nome", label: "Nome da campanha", required: true },
    { key: "termOrigemId", label: "Período de origem", type: "select", options: termOpts },
    { key: "termDestinoId", label: "Período de destino", type: "select", options: termOpts, required: true },
    { key: "janelaInicio", label: "Início da janela", type: "date", required: true },
    { key: "janelaFim", label: "Fim da janela", type: "date", required: true },
    { key: "descontoAntecipacaoPct", label: "Desconto de antecipação (%)", type: "number" },
    { key: "dataLimiteDesconto", label: "Data limite do desconto", type: "date", helper: "Obrigatória se houver desconto" },
    { key: "valorTaxa", label: "Taxa de rematrícula (R$)", type: "number" },
  ];
  return (
    <Box>
      <Tabs value={sub} onChange={(_, v) => setSub(v)} sx={{ mb: 2 }}><Tab label="Acompanhamento" /><Tab label="Campanhas" /></Tabs>
      {sub === 0 && <Acompanhamento toast={toast} />}
      {sub === 1 && (
        <EduResourcePage title="Campanhas de rematrícula" description="Gerar lista → Abrir (agenda lembretes D-30/15/7/1) → Encerrar (marca pendentes como não renovou)."
          base={BASE} resource="/rematricula/campanhas" fields={fields} filters={[{ key: "status", label: "Situação", options: ["RASCUNHO", "ABERTA", "ENCERRADA"] }]}
          columns={[
            { key: "nome", label: "Campanha" },
            { key: "janela", label: "Janela", render: (r) => `${fmtDate(r.janelaInicio)} a ${fmtDate(r.janelaFim)}` },
            { key: "desc", label: "Desconto", render: (r) => (r.descontoAntecipacaoPct ? `${pct(r.descontoAntecipacaoPct)} até ${fmtDate(r.dataLimiteDesconto)}` : "—") },
            { key: "valorTaxa", label: "Taxa", render: (r) => money(r.valorTaxa) },
            { key: "itens", label: "Alunos", render: (r) => r._count?.itens ?? 0 },
            { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> },
          ]}
          rowActions={[
            { label: "Gerar lista", path: "/rematricula/campanhas/:id/gerar-lista", hidden: (r) => r.status === "ENCERRADA" },
            { label: "Abrir", path: "/rematricula/campanhas/:id/abrir", color: "success", hidden: (r) => r.status !== "RASCUNHO", confirm: "Abrir a campanha e agendar os lembretes aos alunos?" },
            { label: "Encerrar", path: "/rematricula/campanhas/:id/encerrar", color: "warning", hidden: (r) => r.status !== "ABERTA", confirm: "Encerrar a campanha? Alunos pendentes serão marcados como não renovou." },
          ]} />
      )}
    </Box>
  );
}
