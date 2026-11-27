import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Table, TableBody, TableCell, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useState } from "react";
import { Bar, COLORS, FormDialog, Kanban, Kpi, KpiRow, LoadBox, Pick, Section, Status, call, fmtDate, fmtMoney, fmtPct, itemsOf, useApi, useCursos, useRunner, useToast } from "../desempenho/kit";

const COLS = ["RASCUNHO", "SUBMETIDO", "EM_AVALIACAO", "APROVADO", "EM_EXECUCAO", "SUSPENSO", "CONCLUIDO", "REPROVADO", "CANCELADO"];
const NEXT: Record<string, string[]> = {
  RASCUNHO: ["SUBMETIDO", "CANCELADO"], SUBMETIDO: ["EM_AVALIACAO", "RASCUNHO", "CANCELADO"], EM_AVALIACAO: ["APROVADO", "REPROVADO", "SUBMETIDO"], APROVADO: ["EM_EXECUCAO", "CANCELADO"],
  EM_EXECUCAO: ["SUSPENSO", "CONCLUIDO", "CANCELADO"], SUSPENSO: ["EM_EXECUCAO", "CANCELADO"], CONCLUIDO: [], CANCELADO: [], REPROVADO: ["RASCUNHO"],
};
const COLOR: Record<string, string> = { RASCUNHO: COLORS.mute, SUBMETIDO: COLORS.info, EM_AVALIACAO: COLORS.warn, APROVADO: "#5aa86b", EM_EXECUCAO: COLORS.ok, SUSPENSO: "#e07a00", CONCLUIDO: "#1f7a4a", REPROVADO: COLORS.bad, CANCELADO: COLORS.bad };
const TIPOS = ["IC", "PIBIC", "PIBITI", "EXTENSAO", "INOVACAO", "PESQUISA", "OUTRO"];
const SIT_COR: Record<string, string> = { CONCLUIDA: COLORS.ok, EM_ANDAMENTO: COLORS.info, ATRASADA: COLORS.bad, PLANEJADA: COLORS.mute };

function Detalhe({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const [rev, setRev] = useState(0);
  const [dlg, setDlg] = useState<null | "etapa" | "rubrica" | "lanc" | "trans">(null);
  const [alvo, setAlvo] = useState("");
  const { toast, node } = useToast();
  const p = useApi<any>(`/pesquisa/projetos/${id}/painel`, [rev]);
  const full = useApi<any>(`/pesquisa/projetos/${id}`, [rev]);
  const after = () => { setRev((x) => x + 1); onChange(); };
  const d = p.data, pr = d?.projeto, status = pr?.status as string | undefined;
  const rubricas = full.data?.rubricas || [];
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>{pr ? `${pr.codigo} — ${pr.titulo}` : "Projeto"}</DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={p.loading} error={p.error} onRetry={p.reload}>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 2 }}>
            <Status value={status} /><Chip size="small" label={pr?.tipo} />{pr?.cepStatus && pr.cepStatus !== "NAO_APLICAVEL" && <Chip size="small" color={pr.cepStatus === "APROVADO" ? "success" : "warning"} label={`Ética: ${pr.cepStatus}`} />}
            <Typography variant="body2" color="text.secondary">{fmtDate(pr?.dataInicio)} → {fmtDate(pr?.dataFim)}</Typography>
            <Box sx={{ flex: 1 }} />
            {(NEXT[status || ""] || []).map((n) => <Button key={n} size="small" variant="outlined" color={/CANCEL|REPROV|SUSP/.test(n) ? "warning" : "primary"} onClick={() => { setAlvo(n); setDlg("trans"); }}>{n.replace(/_/g, " ")}</Button>)}
          </Box>
          <KpiRow>
            <Kpi title="Progresso" value={fmtPct(d?.progressoPercentual, 0)} color={COLORS.ok} />
            <Kpi title="Equipe ativa" value={d?.equipe ?? 0} />
            <Kpi title="Orçamento executado" value={fmtPct(d?.orcamento?.percentualExecutado, 0)} hint={`${fmtMoney(d?.orcamento?.executado)} de ${fmtMoney(d?.orcamento?.previsto)}`} />
            <Kpi title="Atrasos" value={(d?.atrasos?.etapas ?? 0) + (d?.atrasos?.entregaveis ?? 0) + (d?.atrasos?.relatorios ?? 0)} color={(d?.atrasos?.etapas || d?.atrasos?.entregaveis || d?.atrasos?.relatorios) ? COLORS.bad : COLORS.ok} hint={`${d?.atrasos?.etapas ?? 0} etapa(s) · ${d?.atrasos?.entregaveis ?? 0} entregável(is) · ${d?.atrasos?.relatorios ?? 0} relatório(s)`} />
          </KpiRow>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
            <Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}><Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Cronograma</Typography><Button size="small" onClick={() => setDlg("etapa")}>Nova etapa</Button></Box>
              {(d?.etapas || []).length ? d.etapas.map((e: any) => <Bar key={e.id} label={e.titulo} value={e.percentual} color={SIT_COR[e.situacao]} right={`${e.percentual}% · até ${fmtDate(e.fimPrevisto)} · ${e.situacao}`} />) : <Typography color="text.secondary">Sem etapas (obrigatório para submeter).</Typography>}
            </Box>
            <Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}><Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Orçamento por rubrica</Typography><Box><Button size="small" onClick={() => setDlg("rubrica")}>Nova rubrica</Button><Button size="small" disabled={!rubricas.length} onClick={() => setDlg("lanc")}>Lançar gasto</Button></Box></Box>
              {(d?.orcamento?.linhas || []).length ? d.orcamento.linhas.map((l: any) => <Bar key={l.id} label={`${l.categoria} — ${l.descricao}`} value={Math.min(l.percentual, 100)} color={l.estourou ? COLORS.bad : COLORS.info} right={`${fmtMoney(l.executado)} / ${fmtMoney(l.valorPrevisto)}`} />) : <Typography color="text.secondary">Sem rubricas.</Typography>}
              {(d?.orcamento?.alertas || []).map((a: string) => <Alert key={a} severity="warning" sx={{ mt: 1 }}>{a}</Alert>)}
            </Box>
          </Box>
          {(d?.proximosPrazos || []).length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Próximos prazos</Typography>
              <Table size="small"><TableBody>{d.proximosPrazos.map((x: any, i: number) => <TableRow key={i}><TableCell>{x.tipo.replace(/_/g, " ")}</TableCell><TableCell>{x.titulo}</TableCell><TableCell>{fmtDate(x.prazo)}</TableCell></TableRow>)}</TableBody></Table>
            </Box>
          )}
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      <FormDialog open={dlg === "trans"} onClose={() => setDlg(null)} maxWidth="sm" title={`Mover para ${alvo.replace(/_/g, " ")}`} submitLabel="Confirmar"
        intro={alvo === "SUBMETIDO" || alvo === "EM_EXECUCAO" ? <Alert severity="info" sx={{ mb: 2 }}>O sistema valida as pendências (resumo, cronograma, orçamento, ética) antes de avançar.</Alert> : undefined}
        fields={[{ key: "motivo", label: "Motivo / observação", type: "textarea" }]}
        onSubmit={async (b) => { await call("POST", `/pesquisa/projetos/${id}/transicao`, { para: alvo, ...b }); toast({ type: "success", text: "Status atualizado." }); after(); }} />
      <FormDialog open={dlg === "etapa"} onClose={() => setDlg(null)} maxWidth="sm" title="Nova etapa do cronograma"
        fields={[{ key: "titulo", label: "Título", required: true }, { key: "inicioPrevisto", label: "Início previsto", type: "date", required: true }, { key: "fimPrevisto", label: "Fim previsto", type: "date", required: true }, { key: "percentual", label: "% concluído", type: "number" }, { key: "descricao", label: "Descrição", type: "textarea" }]}
        onSubmit={async (b) => { await call("POST", "/pesquisa/projetos-etapas", { ...b, projetoId: id }); after(); }} />
      <FormDialog open={dlg === "rubrica"} onClose={() => setDlg(null)} maxWidth="sm" title="Nova rubrica orçamentária"
        fields={[{ key: "categoria", label: "Categoria", type: "select", options: ["CUSTEIO", "CAPITAL", "BOLSA", "SERVICO_TERCEIROS", "VIAGEM", "OUTRO"], required: true }, { key: "descricao", label: "Descrição", required: true }, { key: "valorPrevisto", label: "Valor previsto (R$)", type: "number", required: true }]}
        onSubmit={async (b) => { await call("POST", "/pesquisa/projetos-rubricas", { ...b, projetoId: id }); after(); }} />
      <FormDialog open={dlg === "lanc"} onClose={() => setDlg(null)} maxWidth="sm" title="Lançar gasto"
        fields={[{ key: "rubricaId", label: "Rubrica", type: "select", required: true, options: rubricas.map((r: any) => ({ value: r.id, label: `${r.categoria} — ${r.descricao}` })) }, { key: "descricao", label: "Descrição", required: true }, { key: "valor", label: "Valor (R$)", type: "number", required: true }, { key: "data", label: "Data", type: "date" }, { key: "documento", label: "Documento (NF/recibo)" }]}
        onSubmit={async (b) => { await call("POST", `/pesquisa/projetos/${id}/lancamentos`, b); after(); }} />
    </Dialog>
  );
}

function Bolsas() {
  const [rev, setRev] = useState(0);
  const [novo, setNovo] = useState(false);
  const [st, setSt] = useState<any | null>(null);
  const [fStatus, setFStatus] = useState("");
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const l = useApi<any>(`/pesquisa/bolsas?pageSize=50${fStatus ? `&status=${fStatus}` : ""}`, [rev]);
  const rows = itemsOf(l.data);
  return (
    <Section title="Bolsas de iniciação científica" actions={<><Pick label="Status" value={fStatus} all="Todos" minWidth={140} onChange={setFStatus} options={["ATIVA", "SUSPENSA", "ENCERRADA", "CANCELADA"].map((s) => ({ value: s, label: s }))} /><Button variant="contained" onClick={() => setNovo(true)}>Nova bolsa</Button></>}>
      {node}
      <KpiRow>
        <Kpi title="Ativas" value={rows.filter((b) => b.status === "ATIVA").length} color={COLORS.ok} />
        <Kpi title="Valor mensal (ativas)" value={fmtMoney(rows.filter((b) => b.status === "ATIVA").reduce((s, b) => s + Number(b.valorMensal || 0), 0))} />
      </KpiRow>
      <LoadBox loading={l.loading} error={l.error} empty={!rows.length} emptyText="Nenhuma bolsa." onRetry={l.reload}>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Bolsista</TableCell><TableCell>Modalidade</TableCell><TableCell>Vigência</TableCell><TableCell>Valor</TableCell><TableCell>Pagamentos</TableCell><TableCell>Status</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>
              {rows.map((b) => {
                const pgs: any[] = b.pagamentos || [];
                const prox = pgs.find((p) => p.status === "PREVISTO");
                return (
                  <TableRow key={b.id} hover>
                    <TableCell>{b.bolsistaNome ?? b.studentId}</TableCell><TableCell>{b.modalidade} · {b.agencia}</TableCell><TableCell>{fmtDate(b.dataInicio)} → {fmtDate(b.dataFim)}</TableCell><TableCell>{fmtMoney(b.valorMensal)}</TableCell>
                    <TableCell>{pgs.filter((p) => p.status === "PAGO").length}/{pgs.length} pagos</TableCell><TableCell><Status value={b.status} /></TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      {b.status === "ATIVA" && prox && <Button size="small" color="success" onClick={() => run(() => call("POST", `/pesquisa/bolsas/${b.id}/pagamentos/${prox.competencia}/liberar`), `Competência ${prox.competencia} liberada.`, `Liberar pagamento da competência ${prox.competencia}?`)}>Liberar {prox.competencia}</Button>}
                      {["ATIVA", "SUSPENSA"].includes(b.status) && <Button size="small" onClick={() => setSt(b)}>Alterar status</Button>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      </LoadBox>
      <FormDialog open={novo} onClose={() => setNovo(false)} maxWidth="sm" title="Nova bolsa"
        fields={[{ key: "studentId", label: "Bolsista", type: "student", required: true }, { key: "modalidade", label: "Modalidade (PIBIC, PIBITI…)" }, { key: "agencia", label: "Agência", type: "select", options: ["INSTITUCIONAL", "CNPQ", "CAPES", "FAPESP", "OUTRA"] },
          { key: "valorMensal", label: "Valor mensal (R$)", type: "number", required: true }, { key: "dataInicio", label: "Início", type: "date", required: true }, { key: "dataFim", label: "Fim", type: "date", required: true }, { key: "projetoId", label: "ID do projeto (opcional)" }]}
        initial={{ modalidade: "PIBIC", agencia: "INSTITUCIONAL" }} onSubmit={async (b) => { await call("POST", "/pesquisa/bolsas", b); setRev((x) => x + 1); }} />
      <FormDialog open={!!st} onClose={() => setSt(null)} maxWidth="sm" title={`Alterar status — ${st?.bolsistaNome ?? ""}`}
        fields={[{ key: "para", label: "Novo status", type: "select", options: ["ATIVA", "SUSPENSA", "ENCERRADA", "CANCELADA"], required: true }, { key: "motivo", label: "Motivo", type: "textarea", required: true }]}
        onSubmit={async (b) => { await call("POST", `/pesquisa/bolsas/${st.id}/status`, b); setRev((x) => x + 1); }} />
    </Section>
  );
}

export default function ProjetosTab() {
  const [sub, setSub] = useState("kanban");
  const [rev, setRev] = useState(0);
  const [det, setDet] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [tipo, setTipo] = useState("");
  const cursos = useCursos();
  const { toast, node } = useToast();
  const l = useApi<any>(`/pesquisa/projetos?pageSize=100${tipo ? `&tipo=${tipo}` : ""}`, [rev]);
  const rows = itemsOf(l.data);
  return (
    <Box>
      {node}
      <ToggleButtonGroup size="small" exclusive value={sub} onChange={(_, v) => v && setSub(v)} sx={{ mb: 2 }}>
        <ToggleButton value="kanban">Projetos (quadro)</ToggleButton><ToggleButton value="bolsas">Bolsas</ToggleButton>
      </ToggleButtonGroup>
      {sub === "bolsas" ? <Bolsas /> : (
        <Section title="Projetos de pesquisa, extensão e inovação" actions={<><Pick label="Tipo" value={tipo} all="Todos" minWidth={130} onChange={setTipo} options={TIPOS.map((t) => ({ value: t, label: t }))} /><Button variant="contained" onClick={() => setNovo(true)}>Novo projeto</Button></>}>
          <LoadBox loading={l.loading} error={l.error} empty={!rows.length} emptyText="Nenhum projeto cadastrado." onRetry={l.reload}>
            <Kanban columns={COLS} items={rows} getCol={(r) => r.status} colors={COLOR} onOpen={(r) => setDet(r.id)}
              title={(r) => r.titulo} subtitle={(r) => `${r.codigo} · ${r.coordenadorNome ?? "sem coordenador"}`}
              meta={(r) => <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}><Chip size="small" label={r.tipo} />{r.dataFim && <Chip size="small" variant="outlined" label={`até ${fmtDate(r.dataFim)}`} />}</Box>} />
          </LoadBox>
        </Section>
      )}
      <FormDialog open={novo} onClose={() => setNovo(false)} title="Novo projeto" submitLabel="Criar"
        fields={[
          { key: "titulo", label: "Título", required: true }, { key: "tipo", label: "Tipo", type: "select", options: TIPOS, required: true }, { key: "areaConhecimento", label: "Área do conhecimento" }, { key: "programId", label: "Curso", type: "select", options: cursos },
          { key: "dataInicio", label: "Início", type: "date" }, { key: "dataFim", label: "Fim", type: "date" }, { key: "fomento", label: "Fomento / agência" }, { key: "orcamentoTotal", label: "Orçamento total (R$)", type: "number" },
          { key: "palavrasChave", label: "Palavras-chave", type: "list" }, { key: "eticaNecessaria", label: "Exige aprovação de Comitê de Ética (CEP/CEUA)", type: "bool" },
          { key: "resumo", label: "Resumo", type: "textarea" }, { key: "objetivos", label: "Objetivos", type: "textarea" }, { key: "metodologia", label: "Metodologia", type: "textarea" },
        ]} initial={{ tipo: "PESQUISA" }}
        onSubmit={async (b) => { const r = await call("POST", "/pesquisa/projetos", b); toast({ type: "success", text: `Projeto ${r.codigo} criado como rascunho.` }); setRev((x) => x + 1); }} />
      {det && <Detalhe id={det} onClose={() => setDet(null)} onChange={() => setRev((x) => x + 1)} />}
    </Box>
  );
}
