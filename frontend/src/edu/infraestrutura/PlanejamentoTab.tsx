// Infraestrutura · Planejamento: planos de obras, reformas, expansão, reposição, pintura, plotagem e aquisição de
// materiais/equipamentos por curso, com cotações, cronograma (Gantt), alçadas de aprovação, orçamento e necessidades do MEC.
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import {
  Async, Empty, FormDialog, Kanban, Panel, ProgressBar, Stat, StatGrid, SubNav, Tag, brl, fmtDate, label, num, openHtml, pct, useApi, usePrograms, useSpaces, useToast, type Field,
} from "./kit";
import ListTable from "./ListTable";

const TIPOS = [
  ["REFORMA", "Reforma"], ["EXPANSAO", "Expansão"], ["REPOSICAO", "Reposição de materiais"], ["PINTURA", "Pintura"], ["PLOTAGEM", "Plotagem e sinalização"], ["EQUIPAMENTO", "Equipamento para curso"], ["MATERIAL", "Material para curso"],
].map(([value, l]) => ({ value, label: l }));
const PRIOR = ["BAIXA", "MEDIA", "ALTA", "CRITICA"];
const STATUS_COL = [
  { key: "RASCUNHO", title: "Rascunho", color: "#9e9e9e" }, { key: "AGUARDANDO_APROVACAO", title: "Aguardando aprovação", color: "#ed6c02" }, { key: "APROVADO", title: "Aprovado", color: "#2e7d32" },
  { key: "CONVERTIDO", title: "Convertido", color: "#0288d1" }, { key: "EM_EXECUCAO", title: "Em execução", color: "#1565c0" }, { key: "CONCLUIDO", title: "Concluído", color: "#1b5e20" },
  { key: "REPROVADO", title: "Reprovado", color: "#d32f2f" }, { key: "CANCELADO", title: "Cancelado", color: "#616161" },
];
const statusTone = (s: string): "default" | "success" | "warning" | "error" | "info" => (["APROVADO", "CONCLUIDO"].includes(s) ? "success" : s === "AGUARDANDO_APROVACAO" ? "warning" : ["REPROVADO", "CANCELADO"].includes(s) ? "error" : ["CONVERTIDO", "EM_EXECUCAO"].includes(s) ? "info" : "default");
const priTone = (p: string): "default" | "success" | "warning" | "error" | "info" => (p === "CRITICA" ? "error" : p === "ALTA" ? "warning" : p === "MEDIA" ? "info" : "default");
const sevTone = (s: string): "warning" | "error" | "info" => (s === "CRITICO" ? "error" : s === "ATENCAO" ? "warning" : "info");
const GANTT_COR: Record<string, string> = { RASCUNHO: "#9e9e9e", AGUARDANDO_APROVACAO: "#ed6c02", APROVADO: "#2e7d32", CONVERTIDO: "#0288d1", EM_EXECUCAO: "#1565c0", CONCLUIDO: "#1b5e20" };

const planoFields = (programs: any[], spaces: any[]): Field[] => [
  { key: "titulo", label: "Título", required: true, full: true },
  { key: "tipo", label: "Tipo", type: "select", options: TIPOS, required: true, def: "EQUIPAMENTO" },
  { key: "prioridade", label: "Prioridade", type: "select", options: PRIOR, def: "MEDIA" },
  { key: "programId", label: "Curso beneficiado", type: "select", options: programs },
  { key: "spaceId", label: "Espaço beneficiado", type: "select", options: spaces },
  { key: "justificativa", label: "Justificativa", type: "textarea", required: true, helper: "Explique a necessidade e o vínculo com o curso." },
  { key: "indicadorMec", label: "Indicador / exigência do MEC", helper: "Ex.: Indicador 1.6 — Laboratórios didáticos especializados", full: true },
  { key: "pdiMetaId", label: "Meta do PDI (id)", helper: "Opcional: id da meta de Governança/PDI" },
  { key: "orcamentoEstimado", label: "Orçamento estimado (R$)", type: "number", helper: "Deixe vazio para somar os itens abaixo" },
  { key: "anoReferencia", label: "Ano de referência", type: "number", def: new Date().getFullYear() },
  { key: "inicioPrevisto", label: "Início previsto", type: "date" },
  { key: "fimPrevisto", label: "Fim previsto", type: "date" },
  { key: "itensTexto", label: "Itens (opcional)", type: "textarea", helper: "Um por linha: descrição; quantidade; preço unitário. Ex.: Divã terapêutico; 4; 1850" },
];
function corpoPlano(b: Record<string, any>) {
  const { itensTexto, ...rest } = b;
  if (itensTexto) {
    const itens = String(itensTexto).split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const [descricao, q, p] = l.split(";").map((s) => s.trim());
      return { descricao, quantidade: Number((q || "1").replace(",", ".")) || 1, ...(p ? { precoEstimado: Number(p.replace(/\./g, "").replace(",", ".")) || 0 } : {}) };
    });
    if (itens.length) rest.itens = itens;
  }
  return rest;
}

// ---------------------------------------------------------------- detalhe do plano
function PlanoDetalhe({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const st = useApi<any>(`/infraestrutura/planejamento/planos/${id}`);
  const toast = useToast();
  const [dlg, setDlg] = useState<string | null>(null);
  const programs = usePrograms(), spaces = useSpaces();
  const p = st.data;
  const act = (path: string, body: any, ok: string, confirmText?: string) => toast.run(() => eduApi.post(`/infraestrutura/planejamento/planos/${id}${path}`, body), ok, () => { st.reload(); onChanged(); }, confirmText);
  const decidir = (decisao: "APROVADO" | "REPROVADO") => {
    const parecer = window.prompt(decisao === "APROVADO" ? "Parecer (opcional):" : "Parecer da reprovação (obrigatório):") ?? null;
    if (parecer === null) return;
    return act("/decidir", { decisao, parecer: parecer || undefined }, decisao === "APROVADO" ? "Decisão registrada." : "Plano reprovado.");
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg" scroll="paper">
      <DialogTitle sx={{ fontWeight: 800 }}>{p ? `${p.numero} — ${p.titulo}` : "Plano"}</DialogTitle>
      <DialogContent dividers>
        <Async state={st}>
          {(pl) => (
            <Box sx={{ display: "grid", gap: 2 }}>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Tag text={label(pl.status)} tone={statusTone(pl.status)} /><Tag text={pl.tipoRotulo} /><Tag text={`Prioridade ${label(pl.prioridade)}`} tone={priTone(pl.prioridade)} />
                {pl.cursoNome && <Tag text={pl.cursoNome} tone="info" />}{pl.espacoNome && <Tag text={pl.espacoNome} />}{pl.origem !== "MANUAL" && <Tag text={`Origem: ${label(pl.origem)}`} />}
              </Box>
              {pl.alertas?.map((a: any, i: number) => <Alert key={i} severity={sevTone(a.severidade)}>{a.mensagem}</Alert>)}
              {pl.motivoReprovacao && <Alert severity="error">Motivo: {pl.motivoReprovacao}</Alert>}
              <StatGrid min={150}>
                <Stat label="Orçamento" value={brl(pl.orcamentoEstimado)} />
                <Stat label="Executado" value={brl(pl.executado)} tone={pl.saldo < 0 ? "error" : "default"} hint={pl.consumoPct != null ? `${num(pl.consumoPct, 0)}% do orçamento` : undefined} />
                <Stat label="Saldo" value={brl(pl.saldo)} tone={pl.saldo < 0 ? "error" : "success"} />
                <Stat label="Prazo" value={`${fmtDate(pl.inicioPrevisto)} → ${fmtDate(pl.fimPrevisto)}`} />
              </StatGrid>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Justificativa</Typography>
                <Typography variant="body2">{pl.justificativa}</Typography>
                {pl.indicadorMec && <Typography variant="body2" sx={{ mt: 0.5 }}><b>Indicador / exigência MEC:</b> {pl.indicadorMec}</Typography>}
                {pl.pdiMetaId && <Typography variant="body2"><b>Meta do PDI:</b> {pl.pdiMetaId}</Typography>}
                {pl.descricao && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>{pl.descricao}</Typography>}
                {Array.isArray(pl.itens) && pl.itens.length > 0 && (
                  <Box sx={{ overflowX: "auto", mt: 1 }}>
                    <Table size="small"><TableHead><TableRow><TableCell>Item</TableCell><TableCell align="right">Qtd.</TableCell><TableCell align="right">Preço un.</TableCell></TableRow></TableHead>
                      <TableBody>{pl.itens.map((i: any, k: number) => <TableRow key={k}><TableCell>{i.descricao}</TableCell><TableCell align="right">{i.quantidade}</TableCell><TableCell align="right">{brl(i.precoEstimado)}</TableCell></TableRow>)}</TableBody></Table>
                  </Box>
                )}
              </Box>

              <Panel title="Cotações" subtitle={pl.exigenciaCotacao.exige ? `Acima do limite: exigidas ${pl.exigenciaCotacao.minimo} cotações de fornecedores distintos (há ${pl.exigenciaCotacao.distintas}).` : "Abaixo do limite configurável: cotações opcionais."} actions={!["CONVERTIDO", "EM_EXECUCAO", "CONCLUIDO", "CANCELADO"].includes(pl.status) ? <Button size="small" variant="outlined" onClick={() => setDlg("cotacao")}>Adicionar cotação</Button> : undefined} sx={{ p: 2 }}>
                {pl.exigenciaCotacao.exige && !pl.exigenciaCotacao.atende && <Alert severity="warning" sx={{ mb: 1 }}>Faltam {pl.exigenciaCotacao.faltam} cotação(ões) para poder converter o plano.</Alert>}
                {pl.cotacoes.length === 0 ? <Empty text="Sem cotações." /> : (
                  <Box sx={{ overflowX: "auto" }}>
                    <Table size="small"><TableHead><TableRow><TableCell>Fornecedor</TableCell><TableCell align="right">Valor</TableCell><TableCell align="right">Prazo (dias)</TableCell><TableCell>Situação</TableCell><TableCell /></TableRow></TableHead>
                      <TableBody>{pl.cotacoes.map((c: any) => (
                        <TableRow key={c.id} hover selected={c.escolhida}>
                          <TableCell>{c.fornecedorNome}{c.observacao ? <Typography variant="caption" sx={{ display: "block" }} color="text.secondary">{c.observacao}</Typography> : null}</TableCell>
                          <TableCell align="right">{brl(c.valor)}</TableCell><TableCell align="right">{c.prazoDias ?? "—"}</TableCell>
                          <TableCell>{c.escolhida ? <Tag text="Escolhida" tone="success" /> : c.valor === pl.exigenciaCotacao.menor ? <Tag text="Menor preço" tone="info" /> : null}</TableCell>
                          <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                            {!["CONVERTIDO", "EM_EXECUCAO", "CONCLUIDO", "CANCELADO"].includes(pl.status) && <>
                              {!c.escolhida && <Button size="small" onClick={() => {
                                const needs = c.valor > pl.exigenciaCotacao.menor;
                                const j = needs ? window.prompt("Esta não é a cotação de menor preço. Justifique a escolha (mín. 10 caracteres):") : undefined;
                                if (needs && !j) return;
                                toast.run(() => eduApi.post(`/infraestrutura/planejamento/planos/${id}/cotacoes/${c.id}/escolher`, { justificativa: j || undefined }), "Cotação escolhida.", () => { st.reload(); onChanged(); });
                              }}>Escolher</Button>}
                              <Button size="small" color="error" onClick={() => toast.run(() => eduApi.del(`/infraestrutura/planejamento/planos/${id}/cotacoes/${c.id}`), "Cotação removida.", () => st.reload(), "Remover esta cotação?")}>Remover</Button>
                            </>}
                          </TableCell>
                        </TableRow>
                      ))}</TableBody></Table>
                    {pl.exigenciaCotacao.economiaVsEstimado != null && <Typography variant="caption" color="text.secondary">Economia da escolhida sobre o orçamento estimado: {brl(pl.exigenciaCotacao.economiaVsEstimado)}</Typography>}
                  </Box>
                )}
              </Panel>

              <Panel title="Cronograma e marcos" actions={!["CONCLUIDO", "CANCELADO"].includes(pl.status) ? <Button size="small" variant="outlined" onClick={() => setDlg("marco")}>Adicionar marco</Button> : undefined} sx={{ p: 2 }}>
                {pl.marcos.length === 0 ? <Empty text="Sem marcos." /> : pl.marcos.map((m: any) => (
                  <Box key={m.id} sx={{ display: "flex", gap: 1, alignItems: "center", py: 0.5, flexWrap: "wrap" }}>
                    <Chip size="small" label={fmtDate(m.data)} color={!m.concluidoEm && new Date(m.data) < new Date() ? "error" : "default"} />
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 160, textDecoration: m.concluidoEm ? "line-through" : "none" }}>{m.titulo}</Typography>
                    {m.concluidoEm ? <Tag text="Concluído" tone="success" /> : <Button size="small" onClick={() => toast.run(() => eduApi.post(`/infraestrutura/planejamento/marcos/${m.id}/concluir`, {}), "Marco concluído.", () => st.reload())}>Concluir</Button>}
                    <Button size="small" color="error" onClick={() => toast.run(() => eduApi.del(`/infraestrutura/planejamento/marcos/${m.id}`), "Marco removido.", () => st.reload(), "Remover marco?")}>Remover</Button>
                  </Box>
                ))}
              </Panel>

              <Panel title="Fluxo de aprovação" subtitle="Coordenação → diretoria → reitoria conforme a alçada configurada para o valor." sx={{ p: 2 }}>
                {pl.aprovacoes.length === 0 ? <Empty text="Ainda não enviado para aprovação." /> : (
                  <Box sx={{ display: "grid", gap: 0.75 }}>
                    {pl.aprovacoes.map((a: any) => (
                      <Box key={a.id} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                        <Chip size="small" label={`Nível ${a.nivel}`} /><Typography variant="body2" sx={{ fontWeight: 700 }}>{a.rotulo || a.papel}</Typography>
                        <Tag text={label(a.status)} tone={a.status === "APROVADO" ? "success" : a.status === "REPROVADO" ? "error" : "warning"} />
                        {a.decididoEm && <Typography variant="caption" color="text.secondary">{fmtDate(a.decididoEm)}</Typography>}
                        {a.parecer && <Typography variant="caption" color="text.secondary">— {a.parecer}</Typography>}
                      </Box>
                    ))}
                  </Box>
                )}
              </Panel>

              {(pl.requisicaoId || pl.ordemServicoId || pl.projetoId) && (
                <Alert severity="info">
                  Convertido em {pl.destino === "REQUISICAO" ? "requisição de compra (módulo Suprimentos)" : pl.destino === "OS" ? "ordem de serviço (Manutenção e OS)" : "projeto (Melhorias 5W2H)"} em {fmtDate(pl.convertidoEm)}.
                  {pl.sugereConclusao && " O registro de origem já foi concluído: você pode concluir este plano."}
                </Alert>
              )}
            </Box>
          )}
        </Async>
        {toast.node}
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap", gap: 0.5 }}>
        {p && p.status === "RASCUNHO" && <><Button onClick={() => setDlg("editar")}>Editar</Button><Button variant="contained" onClick={() => act("/enviar", {}, "Enviado para aprovação.")}>Enviar para aprovação</Button></>}
        {p && p.status === "REPROVADO" && <Button onClick={() => act("/reabrir", {}, "Plano reaberto como rascunho.")}>Reabrir como rascunho</Button>}
        {p && p.status === "AGUARDANDO_APROVACAO" && <>
          <Button onClick={() => act("/reabrir", {}, "Devolvido a rascunho.", "Devolver o plano a rascunho?")}>Devolver a rascunho</Button>
          <Button color="error" onClick={() => decidir("REPROVADO")}>Reprovar ({p.etapaAprovacao?.rotulo || p.etapaAprovacao?.papel})</Button>
          <Button variant="contained" onClick={() => decidir("APROVADO")}>Aprovar ({p.etapaAprovacao?.rotulo || p.etapaAprovacao?.papel})</Button></>}
        {p && p.status === "APROVADO" && <Button variant="contained" onClick={() => setDlg("converter")}>Converter em pedido / OS / projeto</Button>}
        {p && ["CONVERTIDO", "EM_EXECUCAO"].includes(p.status) && <>
          <Button onClick={() => setDlg("execucao")}>Lançar execução</Button>
          <Button variant="contained" onClick={() => act("/status", { status: "CONCLUIDO" }, "Plano concluído.", "Concluir este plano?")}>Concluir</Button></>}
        {p && !["CONCLUIDO", "CANCELADO"].includes(p.status) && <Button color="error" onClick={() => { const m = window.prompt("Motivo do cancelamento:"); if (m) act("/status", { status: "CANCELADO", motivo: m }, "Plano cancelado."); }}>Cancelar plano</Button>}
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
      <FormDialog open={dlg === "cotacao"} title="Nova cotação" onClose={() => setDlg(null)} fields={[
        { key: "fornecedorNome", label: "Fornecedor", required: true }, { key: "valor", label: "Valor total (R$)", type: "number", required: true }, { key: "prazoDias", label: "Prazo de entrega (dias)", type: "number" },
        { key: "validadeAte", label: "Validade da proposta", type: "date" }, { key: "observacao", label: "Observação", type: "textarea" },
      ]} onSubmit={async (b) => { await eduApi.post(`/infraestrutura/planejamento/planos/${id}/cotacoes`, b); st.reload(); onChanged(); }} />
      <FormDialog open={dlg === "marco"} title="Novo marco" onClose={() => setDlg(null)} fields={[{ key: "titulo", label: "Marco", required: true, full: true }, { key: "data", label: "Data", type: "date", required: true }]}
        onSubmit={async (b) => { await eduApi.post(`/infraestrutura/planejamento/planos/${id}/marcos`, b); st.reload(); }} />
      <FormDialog open={dlg === "execucao"} title="Lançar execução" onClose={() => setDlg(null)} intro={<Typography variant="body2" sx={{ mb: 1 }}>O valor executado considera o maior entre os lançamentos manuais e o apurado nos registros vinculados (pedidos emitidos, custo da OS, gasto do projeto).</Typography>}
        fields={[{ key: "valor", label: "Valor executado (R$)", type: "number", required: true }, { key: "descricao", label: "Descrição", full: true }]} onSubmit={async (b) => { await eduApi.post(`/infraestrutura/planejamento/planos/${id}/execucao`, b); st.reload(); onChanged(); }} />
      <FormDialog open={dlg === "converter"} title="Converter plano aprovado" submitLabel="Converter" onClose={() => setDlg(null)}
        intro={<Alert severity="info" sx={{ mb: 1 }}>Reformas e pinturas viram ordem de serviço; expansões viram projeto (com os marcos como etapas); equipamentos, materiais, reposição e plotagem viram requisição de compra já aprovada em Suprimentos. Se faltarem cotações, só a direção converte, com justificativa.</Alert>}
        fields={[
          { key: "destino", label: "Destino", type: "select", options: [{ value: "REQUISICAO", label: "Requisição de compra" }, { value: "OS", label: "Ordem de serviço" }, { value: "PROJETO", label: "Projeto (Melhorias 5W2H)" }], helper: "Vazio: padrão do tipo de plano" },
          { key: "centroCustoId", label: "Centro de custo (id)", helper: "Necessário se o plano não tem curso nem espaço" },
          { key: "justificativaExcecao", label: "Exceção de cotações (direção)", type: "textarea", helper: "Mín. 15 caracteres; use só quando faltarem cotações." },
        ]} onSubmit={async (b) => { await eduApi.post(`/infraestrutura/planejamento/planos/${id}/converter`, b); st.reload(); onChanged(); }} />
      {p && <FormDialog open={dlg === "editar"} title="Editar plano" onClose={() => setDlg(null)} fields={planoFields(programs, spaces)} initial={p}
        onSubmit={async (b) => { await eduApi.patch(`/infraestrutura/planejamento/planos/${id}`, corpoPlano(b)); st.reload(); onChanged(); }} />}
    </Dialog>
  );
}

function PlanoCard({ p, onOpen }: { p: any; onOpen: (id: string) => void }) {
  return (
    <Box onClick={() => onOpen(p.id)} sx={{ cursor: "pointer" }}>
      <Typography variant="caption" color="text.secondary">{p.numero} · {p.tipoRotulo}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>{p.titulo}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{p.cursoNome || p.espacoNome || "Institucional"}</Typography>
      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5, alignItems: "center" }}>
        <Chip size="small" label={brl(p.orcamentoEstimado)} /><Chip size="small" color={priTone(p.prioridade)} variant="outlined" label={label(p.prioridade)} />
        {p.alertas?.length > 0 && <Chip size="small" color={p.atrasado ? "error" : "warning"} label={`${p.alertas.length} alerta(s)`} />}
        {p.exigenciaCotacao?.exige && !p.exigenciaCotacao.atende && <Chip size="small" color="warning" variant="outlined" label={`${p.exigenciaCotacao.distintas}/${p.exigenciaCotacao.minimo} cotações`} />}
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------- visões
function Painel({ onOpen }: { onOpen: (id: string) => void }) {
  const st = useApi<any>("/infraestrutura/planejamento/painel");
  const al = useApi<any>("/infraestrutura/planejamento/alertas");
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Async state={st}>
        {(d) => (
          <>
            <StatGrid>
              <Stat label="Planos" value={d.total} hint={`${d.aguardandoAprovacao} aguardando aprovação`} />
              <Stat label="Planejado" value={brl(d.planejado)} /><Stat label="Aprovado" value={brl(d.aprovado)} />
              <Stat label="Executado" value={brl(d.executado)} hint={d.aprovado > 0 ? `${pct((d.executado / d.aprovado) * 100)} do aprovado` : undefined} />
              <Stat label="Alertas" value={d.alertas.total} tone={d.alertas.criticos ? "error" : d.alertas.total ? "warning" : "success"} hint={`${d.alertas.criticos} crítico(s)`} />
              <Stat label="Cotações pendentes" value={d.semCotacaoSuficiente} tone={d.semCotacaoSuficiente ? "warning" : "success"} hint="planos acima do limite" />
              <Stat label="Vínculo MEC / PDI" value={`${d.vinculadosMec} / ${d.vinculadosPdi}`} />
              <Stat label="Sugestões a revisar" value={d.sugestoesPendentes} tone={d.sugestoesPendentes ? "info" : "default"} />
            </StatGrid>
            <Panel title="Próximos prazos">
              {d.proximosPrazos.length === 0 ? <Empty text="Sem prazos cadastrados." /> : d.proximosPrazos.map((p: any) => (
                <Box key={p.id} onClick={() => onOpen(p.id)} sx={{ display: "flex", gap: 1, py: 0.5, cursor: "pointer", flexWrap: "wrap" }}>
                  <Chip size="small" label={fmtDate(p.fimPrevisto)} /><Typography variant="body2" sx={{ flex: 1, minWidth: 180 }}>{p.numero} — {p.titulo}</Typography><Tag text={label(p.status)} tone={statusTone(p.status)} />
                </Box>
              ))}
            </Panel>
          </>
        )}
      </Async>
      <Panel title="Alertas de prazo e orçamento">
        <Async state={al}>
          {(d) => d.alertas.length === 0 ? <Empty text="Nenhum alerta no momento." /> : (
            <Box sx={{ display: "grid", gap: 0.75 }}>
              {d.alertas.slice(0, 30).map((a: any, i: number) => <Alert key={i} severity={sevTone(a.severidade)} action={<Button size="small" onClick={() => onOpen(a.planoId)}>Abrir</Button>}><b>{a.numero}</b> — {a.titulo}: {a.mensagem}</Alert>)}
            </Box>
          )}
        </Async>
      </Panel>
    </Box>
  );
}

function Quadro({ refreshKey, onOpen }: { refreshKey: number; onOpen: (id: string) => void }) {
  const [tipo, setTipo] = useState("");
  const [ano, setAno] = useState("");
  const st = useApi<any>(`/infraestrutura/planejamento/kanban${qsOf({ tipo, ano, k: refreshKey })}`);
  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
        <TextField size="small" select label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} sx={{ minWidth: 200 }}><MenuItem value="">Todos</MenuItem>{TIPOS.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}</TextField>
        <TextField size="small" type="number" label="Ano" value={ano} onChange={(e) => setAno(e.target.value)} sx={{ width: 120 }} />
      </Box>
      <Async state={st}>
        {(d) => {
          const rows = d.colunas.flatMap((c: any) => c.items);
          return <Kanban columns={STATUS_COL.map((c) => { const col = d.colunas.find((x: any) => x.status === c.key); return { ...c, title: `${c.title} · ${brl(col?.total ?? 0)}` }; })} rows={rows} groupBy={(r: any) => r.status} render={(p: any) => <PlanoCard p={p} onOpen={onOpen} />} />;
        }}
      </Async>
    </Box>
  );
}

function Lista({ refreshKey, onOpen }: { refreshKey: number; onOpen: (id: string) => void }) {
  return (
    <ListTable path="/infraestrutura/planejamento/planos" refreshKey={refreshKey} searchable
      filters={[{ key: "status", label: "Status", options: STATUS_COL.map((c) => ({ value: c.key, label: c.title })) }, { key: "tipo", label: "Tipo", options: TIPOS }, { key: "prioridade", label: "Prioridade", options: PRIOR }]}
      columns={[
        { key: "numero", label: "Nº", width: 110 },
        { key: "titulo", label: "Item", render: (r) => <Box><Typography variant="body2" sx={{ fontWeight: 700 }}>{r.titulo}</Typography><Typography variant="caption" color="text.secondary">{r.tipoRotulo} · {r.cursoNome || r.espacoNome || "Institucional"}</Typography></Box> },
        { key: "status", label: "Status", render: (r) => <Tag text={label(r.status)} tone={statusTone(r.status)} /> },
        { key: "prioridade", label: "Prior.", render: (r) => <Tag text={label(r.prioridade)} tone={priTone(r.prioridade)} /> },
        { key: "orcamentoEstimado", label: "Orçamento", align: "right", render: (r) => brl(r.orcamentoEstimado) },
        { key: "executado", label: "Executado", align: "right", render: (r) => brl(r.executado) },
        { key: "fimPrevisto", label: "Fim previsto", render: (r) => fmtDate(r.fimPrevisto) },
        { key: "alertas", label: "Alertas", render: (r) => (r.alertas?.length ? <Tag text={r.alertas.length} tone={r.atrasado ? "error" : "warning"} /> : "—") },
      ]}
      actions={(r) => <Button size="small" onClick={() => onOpen(r.id)}>Abrir</Button>} />
  );
}

function Cronograma({ refreshKey, onOpen }: { refreshKey: number; onOpen: (id: string) => void }) {
  const [ano, setAno] = useState("");
  const st = useApi<any>(`/infraestrutura/planejamento/cronograma${qsOf({ ano, k: refreshKey })}`);
  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <TextField size="small" type="number" label="Ano de referência" value={ano} onChange={(e) => setAno(e.target.value)} sx={{ width: 170 }} />
      <Async state={st}>
        {(d) => d.linhas.length === 0 ? <Empty text="Nenhum plano com datas previstas." /> : (
          <Box sx={{ overflowX: "auto" }}>
            <Box sx={{ minWidth: 720 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", pl: { xs: "150px", md: "260px" }, pb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">{fmtDate(d.de)}</Typography><Typography variant="caption" color="text.secondary">{fmtDate(d.ate)}</Typography>
              </Box>
              {d.linhas.map((l: any) => (
                <Box key={l.id} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.6, borderTop: "1px solid", borderColor: "divider" }}>
                  <Box sx={{ width: { xs: 142, md: 252 }, flexShrink: 0, cursor: "pointer" }} onClick={() => onOpen(l.id)}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap title={l.titulo}>{l.titulo}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>{l.numero} · {l.cursoNome || l.espacoNome || "Institucional"}</Typography>
                  </Box>
                  <Box sx={{ position: "relative", flex: 1, height: 28, bgcolor: "action.hover", borderRadius: 1 }}>
                    <Box title={`${fmtDate(l.inicio)} → ${fmtDate(l.fim)}`} onClick={() => onOpen(l.id)} sx={{ position: "absolute", top: 5, height: 18, borderRadius: 1, left: `${l.barra.esquerdaPct}%`, width: `${l.barra.larguraPct}%`, bgcolor: l.atrasado ? "error.main" : GANTT_COR[l.status] || "primary.main", cursor: "pointer", minWidth: 6 }} />
                    {l.marcos.map((m: any) => <Box key={m.id} title={`${m.titulo} — ${fmtDate(m.data)}`} sx={{ position: "absolute", top: 8, left: `calc(${m.posicaoPct}% - 6px)`, width: 12, height: 12, transform: "rotate(45deg)", bgcolor: m.concluido ? "success.main" : m.atrasado ? "error.main" : "warning.main", border: "1px solid #fff" }} />)}
                    <Box sx={{ position: "absolute", top: 0, bottom: 0, left: `${d.hojePct}%`, width: 0, borderLeft: "2px dashed", borderColor: "info.main" }} title="Hoje" />
                  </Box>
                </Box>
              ))}
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>Barras = período previsto (vermelho: atrasado) · losangos = marcos (verde: concluído, vermelho: atrasado) · linha tracejada = hoje.</Typography>
            </Box>
          </Box>
        )}
      </Async>
    </Box>
  );
}

function TabelaOrc({ linhas, titulo, nomeCol }: { linhas: any[]; titulo: string; nomeCol: string }) {
  return (
    <Panel title={titulo}>
      {linhas.length === 0 ? <Empty /> : (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small"><TableHead><TableRow><TableCell>{nomeCol}</TableCell><TableCell align="right">Planejado</TableCell><TableCell align="right">Aprovado</TableCell><TableCell align="right">Executado</TableCell><TableCell align="right">Saldo</TableCell><TableCell sx={{ minWidth: 140 }}>Consumo</TableCell></TableRow></TableHead>
            <TableBody>{linhas.map((a) => (
              <TableRow key={a.chave} hover>
                <TableCell>{a.chave}{a.acimaDoTeto ? <Chip size="small" color="warning" label={`acima do teto ${brl(a.tetoAnual)}`} sx={{ ml: 1 }} /> : null}</TableCell>
                <TableCell align="right">{brl(a.planejado)}</TableCell><TableCell align="right">{brl(a.aprovado)}</TableCell><TableCell align="right">{brl(a.executado)}</TableCell>
                <TableCell align="right" sx={{ color: a.saldo < 0 ? "error.main" : undefined }}>{brl(a.saldo)}</TableCell>
                <TableCell>{a.consumoPct == null ? "—" : <ProgressBar value={Math.min(100, a.consumoPct)} color={a.estouro ? "error" : a.consumoPct >= 90 ? "warning" : "primary"} />}</TableCell>
              </TableRow>
            ))}</TableBody></Table>
        </Box>
      )}
    </Panel>
  );
}

function Orcamento({ refreshKey }: { refreshKey: number }) {
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const st = useApi<any>(`/infraestrutura/planejamento/orcamento${qsOf({ ano, k: refreshKey })}`);
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <TextField size="small" type="number" label="Ano (vazio = todos)" value={ano} onChange={(e) => setAno(e.target.value)} sx={{ width: 190 }} />
      <Async state={st}>
        {(d) => (
          <>
            <StatGrid>
              <Stat label="Planejado" value={brl(d.total.planejado)} /><Stat label="Aprovado" value={brl(d.total.aprovado)} /><Stat label="Executado" value={brl(d.total.executado)} />
              <Stat label="Saldo do aprovado" value={brl(d.total.saldo)} tone={d.total.saldo < 0 ? "error" : "success"} />
            </StatGrid>
            {d.estourados?.length > 0 && <Alert severity="error">Orçamento estourado em: {d.estourados.join(", ")}.</Alert>}
            <TabelaOrc titulo="Por ano" nomeCol="Ano" linhas={d.porAno} />
            <TabelaOrc titulo="Por curso" nomeCol="Curso" linhas={d.porCurso} />
            <TabelaOrc titulo="Por tipo de iniciativa" nomeCol="Tipo" linhas={d.porTipo} />
          </>
        )}
      </Async>
    </Box>
  );
}

function Necessidades({ onChanged }: { onChanged: () => void }) {
  const [k, setK] = useState(0);
  const st = useApi<any>(`/infraestrutura/planejamento/necessidades${qsOf({ k })}`);
  const toast = useToast();
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Alert severity="info">Checklist de equipamentos e espaços exigidos por curso (cadastrado em “Adequação por curso”), comparado ao patrimônio existente. “Sem plano” indica lacuna sem nenhuma iniciativa de planejamento em andamento.</Alert>
      <Async state={st}>
        {(d) => (
          <>
            <StatGrid><Stat label="Cursos com checklist" value={d.resumo.cursos} /><Stat label="Itens faltando" value={d.resumo.itensFaltando} tone={d.resumo.itensFaltando ? "warning" : "success"} /><Stat label="Faltando sem plano" value={d.resumo.semPlano} tone={d.resumo.semPlano ? "error" : "success"} /></StatGrid>
            {d.cursos.length === 0 && <Empty text="Nenhum curso com checklist cadastrado." />}
            {d.cursos.map((c: any) => (
              <Panel key={c.programId} title={c.curso} subtitle={`${c.vagas} vagas/alunos · obrigatórios atendidos: ${num(c.obrigatoriosAtendidosPct, 0)}% · conceito sugerido ${c.conceitoSugerido ?? "—"} · ${c.totais.faltam} item(ns) faltando, ${c.totais.semPlano} sem plano`}
                actions={c.totais.semPlano > 0 ? <Button size="small" variant="contained" onClick={() => toast.run(() => eduApi.post("/infraestrutura/planejamento/sugestoes/gerar", { programId: c.programId }), "Sugestões geradas — revise na aba Sugestões.", () => { setK(k + 1); onChanged(); })}>Sugerir itens que faltam</Button> : undefined}>
                <Box sx={{ overflowX: "auto" }}>
                  <Table size="small"><TableHead><TableRow><TableCell>Requisito</TableCell><TableCell align="right">Exigido</TableCell><TableCell align="right">Existente</TableCell><TableCell align="right">Falta</TableCell><TableCell sx={{ minWidth: 120 }}>Cobertura</TableCell><TableCell>Planejamento</TableCell><TableCell>Ref. MEC</TableCell></TableRow></TableHead>
                    <TableBody>{c.linhas.map((l: any) => (
                      <TableRow key={l.requisitoId} hover>
                        <TableCell>{l.descricao}{l.obrigatorio ? "" : " (opcional)"}</TableCell><TableCell align="right">{l.exigido}</TableCell><TableCell align="right">{l.existente}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: l.lacuna ? "error.main" : "success.main" }}>{l.lacuna}</TableCell>
                        <TableCell><ProgressBar value={l.coberturaPct} color={l.situacao === "ATENDE" ? "success" : l.situacao === "PARCIAL" ? "warning" : "error"} /></TableCell>
                        <TableCell>{l.lacuna === 0 ? <Tag text="Atendido" tone="success" /> : l.semPlano ? <Tag text="Sem plano" tone="error" /> : l.planos.map((p: any) => <Chip key={p.id} size="small" label={`${p.numero} · ${label(p.status)}`} sx={{ mr: 0.5 }} />)}</TableCell>
                        <TableCell sx={{ maxWidth: 260 }}><Typography variant="caption">{l.referenciaMec || "—"}</Typography></TableCell>
                      </TableRow>
                    ))}</TableBody></Table>
                </Box>
              </Panel>
            ))}
          </>
        )}
      </Async>
      {toast.node}
    </Box>
  );
}

function Sugestoes({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState("PENDENTE");
  const [k, setK] = useState(0);
  const st = useApi<any>(`/infraestrutura/planejamento/sugestoes${qsOf({ status, k })}`);
  const toast = useToast();
  const [aceitar, setAceitar] = useState<any>(null);
  const after = () => { setK(k + 1); onChanged(); };
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Alert severity="info">As sugestões partem das lacunas do checklist de cada curso e da recorrência de ocorrências de manutenção. Cada uma mostra as evidências usadas; nada é criado sem a sua revisão. Quando a IA está configurada ela apenas redige a justificativa; sem chave, o texto vem das regras.</Alert>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <TextField size="small" select label="Situação" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 170 }}>{["PENDENTE", "ACEITA", "REJEITADA"].map((s) => <MenuItem key={s} value={s}>{label(s)}</MenuItem>)}</TextField>
        <Button variant="contained" onClick={() => toast.run(() => eduApi.post("/infraestrutura/planejamento/sugestoes/gerar", {}), "Sugestões atualizadas.", after)}>Gerar sugestões agora</Button>
      </Box>
      <Async state={st}>
        {(d) => d.items.length === 0 ? <Empty text="Nenhuma sugestão nesta situação." /> : (
          <Box sx={{ display: "grid", gap: 1.5 }}>
            {d.items.map((s: any) => (
              <Panel key={s.id} title={s.titulo} subtitle={`${s.cursoNome || "Institucional"} · ${s.origem === "CHECKLIST" ? "Lacuna do checklist" : "Manutenção"} · motor: ${s.motor === "IA" ? "IA (texto)" : "regras explicáveis"}`} sx={{ p: 2 }}
                actions={s.status === "PENDENTE" ? <Box sx={{ display: "flex", gap: 1 }}><Button size="small" onClick={() => { const m = window.prompt("Motivo da rejeição:"); if (m) toast.run(() => eduApi.post(`/infraestrutura/planejamento/sugestoes/${s.id}/rejeitar`, { motivo: m }), "Sugestão rejeitada.", after); }}>Rejeitar</Button><Button size="small" variant="contained" onClick={() => setAceitar(s)}>Aceitar como plano</Button></Box> : <Tag text={label(s.status)} tone={s.status === "ACEITA" ? "success" : "default"} />}>
                <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mb: 1 }}><Chip size="small" label={`Estimativa ${brl(s.valorEstimado)}`} /><Chip size="small" color={priTone(s.prioridade)} label={label(s.prioridade)} /><Chip size="small" label={`Qtd. ${s.quantidade}`} /></Box>
                <Typography variant="body2">{s.justificativa}</Typography>
                <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>{(s.explicacao || []).map((e: any, i: number) => <li key={i}><Typography variant="caption"><b>{e.fato}:</b> {e.detalhe}</Typography></li>)}</Box>
                {s.motivo && <Typography variant="caption" color="text.secondary">Motivo: {s.motivo}</Typography>}
              </Panel>
            ))}
          </Box>
        )}
      </Async>
      <FormDialog open={!!aceitar} title="Aceitar sugestão como plano" submitLabel="Criar plano" onClose={() => setAceitar(null)} initial={aceitar ? { titulo: aceitar.titulo, orcamentoEstimado: aceitar.valorEstimado, prioridade: aceitar.prioridade, justificativa: aceitar.justificativa } : null}
        fields={[{ key: "titulo", label: "Título", full: true }, { key: "orcamentoEstimado", label: "Orçamento (R$)", type: "number", helper: "Revise: pode vir sem preço de referência" }, { key: "prioridade", label: "Prioridade", type: "select", options: PRIOR }, { key: "justificativa", label: "Justificativa", type: "textarea" }, { key: "fimPrevisto", label: "Prazo", type: "date" }]}
        onSubmit={async (b) => { await eduApi.post(`/infraestrutura/planejamento/sugestoes/${aceitar.id}/aceitar`, b); toast.ok("Plano criado em rascunho."); after(); }} />
      {toast.node}
    </Box>
  );
}

function Politica() {
  const st = useApi<any>("/infraestrutura/planejamento/politica");
  const toast = useToast();
  const [f, setF] = useState<any>(null);
  useEffect(() => { if (st.data) setF({ ...st.data, alcadas: st.data.alcadas.map((a: any) => ({ ...a })) }); }, [st.data]);
  if (!f) return <Async state={st}>{() => null}</Async>;
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const setAlc = (i: number, k: string, v: any) => set("alcadas", f.alcadas.map((a: any, j: number) => (j === i ? { ...a, [k]: v } : a)));
  return (
    <Panel title="Política de planejamento" subtitle="Limite que exige cotações, mínimo de cotações, alçadas de aprovação e limiares de alerta.">
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 2, mb: 2 }}>
        <TextField size="small" type="number" label="Exigir cotações acima de (R$)" value={f.limiteCotacao} onChange={(e) => set("limiteCotacao", Number(e.target.value))} />
        <TextField size="small" type="number" label="Mínimo de cotações" value={f.minCotacoes} onChange={(e) => set("minCotacoes", Number(e.target.value))} />
        <TextField size="small" type="number" label="Alertar prazos com (dias)" value={f.alertaPrazoDias} onChange={(e) => set("alertaPrazoDias", Number(e.target.value))} />
        <TextField size="small" type="number" label="Alertar orçamento a partir de (%)" value={f.alertaOrcamentoPct} onChange={(e) => set("alertaOrcamentoPct", Number(e.target.value))} />
      </Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Alçadas de aprovação</Typography>
      {f.alcadas.map((a: any, i: number) => (
        <Box key={i} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "80px 1fr 1fr 1fr" }, gap: 1.5, mb: 1.5 }}>
          <TextField size="small" label="Nível" value={a.nivel} disabled />
          <TextField size="small" label="Rótulo" value={a.rotulo || ""} onChange={(e) => setAlc(i, "rotulo", e.target.value)} />
          <TextField size="small" select label="Papel aprovador" value={a.papel} onChange={(e) => setAlc(i, "papel", e.target.value)}>{["COORDINATOR", "FINANCE", "SUPPLIES", "BOARD", "RECTOR"].map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}</TextField>
          <TextField size="small" type="number" label="A partir de (R$)" value={a.valorMinimo} disabled={i === 0} onChange={(e) => setAlc(i, "valorMinimo", Number(e.target.value))} />
        </Box>
      ))}
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button size="small" onClick={() => set("alcadas", [...f.alcadas, { nivel: f.alcadas.length + 1, papel: "RECTOR", rotulo: "", valorMinimo: (f.alcadas[f.alcadas.length - 1]?.valorMinimo ?? 0) + 1 }])}>Adicionar nível</Button>
        {f.alcadas.length > 1 && <Button size="small" color="error" onClick={() => set("alcadas", f.alcadas.slice(0, -1))}>Remover último</Button>}
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" onClick={() => toast.run(() => eduApi.put("/infraestrutura/planejamento/politica", { limiteCotacao: f.limiteCotacao, minCotacoes: f.minCotacoes, alertaPrazoDias: f.alertaPrazoDias, alertaOrcamentoPct: f.alertaOrcamentoPct, alcadas: f.alcadas }), "Política salva.", () => st.reload())}>Salvar política</Button>
      </Box>
      {toast.node}
    </Panel>
  );
}

// ---------------------------------------------------------------- aba
export default function PlanejamentoTab() {
  const [view, setView] = useState("painel");
  const [refresh, setRefresh] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const programs = usePrograms(), spaces = useSpaces();
  const bump = () => setRefresh((n) => n + 1);
  const ano = new Date().getFullYear();
  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap", mb: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 240 }}>Obras, reformas, expansão, reposição, pinturas, plotagem e aquisição de materiais e equipamentos dos cursos — com cotações, aprovação por alçada e conversão em pedido de compra, OS ou projeto.</Typography>
        <Button variant="outlined" onClick={() => openHtml(`/infraestrutura/planejamento/relatorio${qsOf({ ano, format: "html" })}`)}>Plano de investimentos {ano}</Button>
        <Button variant="contained" onClick={() => setNovo(true)}>Novo plano</Button>
      </Box>
      <SubNav value={view} onChange={setView} items={[
        { key: "painel", label: "Painel" }, { key: "quadro", label: "Quadro por status" }, { key: "lista", label: "Lista" }, { key: "cronograma", label: "Cronograma" },
        { key: "orcamento", label: "Orçamento" }, { key: "necessidades", label: "Necessidades por curso" }, { key: "sugestoes", label: "Sugestões" }, { key: "politica", label: "Política e alçadas" },
      ]} />
      {view === "painel" && <Painel key={refresh} onOpen={setOpenId} />}
      {view === "quadro" && <Quadro refreshKey={refresh} onOpen={setOpenId} />}
      {view === "lista" && <Lista refreshKey={refresh} onOpen={setOpenId} />}
      {view === "cronograma" && <Cronograma refreshKey={refresh} onOpen={setOpenId} />}
      {view === "orcamento" && <Orcamento refreshKey={refresh} />}
      {view === "necessidades" && <Necessidades key={refresh} onChanged={bump} />}
      {view === "sugestoes" && <Sugestoes key={refresh} onChanged={bump} />}
      {view === "politica" && <Politica />}
      {openId && <PlanoDetalhe id={openId} onClose={() => setOpenId(null)} onChanged={bump} />}
      <FormDialog open={novo} title="Novo plano de infraestrutura" fields={planoFields(programs, spaces)} onClose={() => setNovo(false)}
        onSubmit={async (b) => { const r: any = await eduApi.post("/infraestrutura/planejamento/planos", corpoPlano(b)); bump(); if (r?.id) setOpenId(r.id); }} />
    </Box>
  );
}
