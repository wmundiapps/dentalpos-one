import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, LinearProgress, MenuItem, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Async, Empty, FormDialog, Kanban, Panel, SubNav, Tabela, Tag, brl, fmtDate, useApi, useToast } from "./host";
import { Situacao, api, compMes, ehContador, ehGestao, hojeIso, ROTULO_REGIME } from "./kit";

const P = "/contabil/carteira";
const COLUNAS = [{ key: "A_FAZER", title: "A fazer", color: "#64748b" }, { key: "EM_ANDAMENTO", title: "Em andamento", color: "#0F5FDB" }, { key: "AGUARDANDO_CLIENTE", title: "Aguardando cliente", color: "#B45309" }, { key: "CONCLUIDA", title: "Concluídas", color: "#2e9e5b" }];

function Detalhe({ t, onClose, onSaved }: { t: any; onClose: () => void; onSaved: () => void }) {
  const [lista, setLista] = useState<any[]>(t.checklist || []);
  const [erro, setErro] = useState<string | null>(null);
  const [forcar, setForcar] = useState(false);
  const mover = async (status: string) => {
    setErro(null);
    try { await api.patch(`/tarefas/${t.id}/status`, { status, checklist: lista, forcar }); onSaved(); onClose(); } catch (e: any) { setErro(e?.message || "Falha ao atualizar."); }
  };
  const feitos = lista.filter((i) => i.feito).length;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800 }}>{t.titulo}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 1 }}><b>{t.clienteNome}</b> · prazo {fmtDate(t.prazo)} {t.atrasada ? <Tag text={`${t.diasAtraso} dia(s) de atraso`} tone="error" /> : null} · responsável {t.responsavelNome || "—"}</Typography>
        {lista.length ? <><LinearProgress variant="determinate" value={(feitos / lista.length) * 100} sx={{ height: 8, borderRadius: 4, mb: 1 }} />{lista.map((i, n) => <FormControlLabel key={n} sx={{ display: "block" }} control={<Checkbox size="small" checked={!!i.feito} onChange={(e) => setLista(lista.map((x, k) => (k === n ? { ...x, feito: e.target.checked } : x)))} />} label={i.texto} />)}</> : <Typography variant="body2" color="text.secondary">Sem checklist.</Typography>}
        {erro ? <Alert severity="warning" sx={{ mt: 1.5 }} action={erro.includes("checklist") ? <Button size="small" onClick={() => setForcar(true)}>Concluir mesmo assim</Button> : undefined}>{erro}</Alert> : null}
        {forcar ? <Alert severity="info" sx={{ mt: 1 }}>Conclusão forçada habilitada: clique em "Concluir" novamente.</Alert> : null}
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap" }}>
        <Button onClick={onClose}>Fechar</Button>
        <Button onClick={() => mover(t.status)}>Salvar checklist</Button>
        {t.status !== "EM_ANDAMENTO" && t.status !== "CONCLUIDA" ? <Button onClick={() => mover("EM_ANDAMENTO")}>Iniciar</Button> : null}
        {t.status !== "AGUARDANDO_CLIENTE" && t.status !== "CONCLUIDA" ? <Button onClick={() => mover("AGUARDANDO_CLIENTE")}>Aguardar cliente</Button> : null}
        {t.status !== "CONCLUIDA" ? <Button variant="contained" onClick={() => mover("CONCLUIDA")}>Concluir</Button> : <Button onClick={() => mover("A_FAZER")}>Reabrir</Button>}
      </DialogActions>
    </Dialog>
  );
}

function Calendario() {
  const [mes, setMes] = useState(compMes());
  const st = useApi<any>(`${P}/calendario?mes=${mes}`);
  return (
    <Panel title="Calendário de obrigações da carteira" subtitle="Prazos de tarefas, vencimento de guias e aniversários de empresas." actions={<TextField size="small" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />}>
      <Async state={st}>{(d) => {
        const dias = Object.keys(d.dias).sort();
        if (!dias.length) return <Empty text="Nada neste mês." />;
        return (
          <Box sx={{ display: "grid", gap: 1 }}>
            {d.fiscal?.simulado ? <Typography variant="caption" color="text.secondary">Guias da camada local (módulo fiscal não conectado).</Typography> : null}
            {dias.map((dia) => (
              <Box key={dia} sx={{ display: "grid", gridTemplateColumns: { xs: "64px 1fr", md: "90px 1fr" }, gap: 1, borderBottom: "1px solid", borderColor: "divider", pb: 1 }}>
                <Typography sx={{ fontWeight: 800 }}>{dia.slice(8, 10)}/{dia.slice(5, 7)}</Typography>
                <Box>
                  {d.dias[dia].tarefas.map((t: any) => <Typography key={t.id} variant="body2" sx={{ color: t.atrasada ? "error.main" : undefined }}>📋 <b>{t.cliente}</b> — {t.titulo} <Situacao value={t.status} /></Typography>)}
                  {d.dias[dia].guias.map((g: any) => <Typography key={g.id} variant="body2">💳 <b>{g.cliente}</b> — guia {g.tipo} {brl(g.valor)} <Situacao value={g.status} /></Typography>)}
                  {d.dias[dia].aniversarios.map((a: any, i: number) => <Typography key={i} variant="body2">🎂 {a.cliente} — {a.tipo === "ABERTURA" ? `${a.anos} ano(s) de empresa` : `${a.anos} ano(s) de parceria`}</Typography>)}
                </Box>
              </Box>
            ))}
          </Box>
        );
      }}</Async>
    </Panel>
  );
}

function Modelos() {
  const st = useApi<any>(`${P}/tarefa-modelos`);
  const [form, setForm] = useState<any>(null);
  const toast = useToast();
  return (
    <Panel title="Modelos de rotinas" subtitle="Por regime e segmento. Prazos ilustrativos: confirme o calendário oficial com o seu contador." actions={ehContador() ? <Box sx={{ display: "flex", gap: 1 }}>{ehGestao() ? <Button size="small" onClick={() => toast.run(async () => { const r = await api.post("/tarefa-modelos/padrao", {}); toast.ok(`${r.criados} modelo(s) padrão criado(s).`); }, "", st.reload)}>Carregar modelos padrão</Button> : null}<Button size="small" variant="contained" onClick={() => setForm({})}>Novo modelo</Button></Box> : null}>
      <Async state={st}>{(d) => <Tabela rows={d.items} vazio="Nenhum modelo. Carregue os modelos padrão." cols={[{ h: "Modelo", r: (r: any) => r.nome }, { h: "Categoria", r: (r: any) => r.categoria }, { h: "Regime", r: (r: any) => ROTULO_REGIME[r.regime] || "todos" }, { h: "Recorrência", r: (r: any) => r.recorrencia }, { h: "Prazo", r: (r: any) => `dia ${r.diaPrazo}${r.recorrencia === "ANUAL" ? `/${r.mesPrazo}` : ""}` }, { h: "Itens", r: (r: any) => (r.itens || []).length }, { h: "Ativo", r: (r: any) => <Tag text={r.ativo ? "sim" : "não"} tone={r.ativo ? "success" : "default"} /> },
        { h: "", r: (r: any) => ehContador() ? <Button size="small" onClick={() => setForm({ ...r, itensTxt: (r.itens || []).join("\n") })}>Editar</Button> : null }]} />}</Async>
      <FormDialog open={!!form} title={form?.id ? "Editar modelo" : "Novo modelo"} initial={form} fields={[{ key: "nome", label: "Nome", required: true }, { key: "categoria", label: "Categoria", type: "select", options: ["FECHAMENTO", "OBRIGACAO", "FOLHA", "IR", "OUTRA"], def: "OUTRA" }, { key: "regime", label: "Regime (vazio = todos)", type: "select", options: Object.entries(ROTULO_REGIME).map(([value, label]) => ({ value, label })) }, { key: "segmento", label: "Segmento (vazio = todos)" }, { key: "recorrencia", label: "Recorrência", type: "select", options: ["MENSAL", "TRIMESTRAL", "ANUAL"], def: "MENSAL" }, { key: "diaPrazo", label: "Dia do prazo", type: "number", def: 10 }, { key: "mesPrazo", label: "Mês do prazo (anual)", type: "number" }, { key: "mesesAdiante", label: "Prazo N meses após a competência", type: "number", def: 1 }, { key: "itensTxt", label: "Checklist (um item por linha)", type: "textarea" }, { key: "ativo", label: "Ativo", type: "bool", def: true }]}
        onClose={() => setForm(null)} onSubmit={async (b) => { const { itensTxt, ...r } = b; const body = { ...r, itens: String(itensTxt || "").split("\n").map((s) => s.trim()).filter(Boolean) }; form?.id ? await api.put(`/tarefa-modelos/${form.id}`, body) : await api.post("/tarefa-modelos", body); toast.ok("Modelo salvo."); st.reload(); }} />
      {toast.node}
    </Panel>
  );
}

export default function TarefasTab() {
  const [params, setParams] = useSearchParams();
  const sub = params.get("v") || (params.get("f") === "atrasadas" ? "lista" : "kanban");
  const [minhas, setMinhas] = useState(false);
  const [aberta, setAberta] = useState<any>(null);
  const [nova, setNova] = useState(false);
  const [gerar, setGerar] = useState(false);
  const atrasadas = params.get("f") === "atrasadas";
  const st = useApi<any>(sub === "kanban" || sub === "lista" ? `${P}/tarefas?pageSize=300${minhas ? "&minhas=1" : ""}${atrasadas ? "&atrasadas=1" : ""}${sub === "kanban" ? "&aberta=0" : ""}` : null);
  const clientes = useApi<any>(`${P}/clientes?pageSize=200&status=ATIVO`);
  const opt = useApi<any>(`${P}/clientes/opcoes`);
  const toast = useToast();
  const rows = (st.data?.items || []).filter((t: any) => t.status !== "CANCELADA");
  const card = (t: any) => (
    <Box onClick={() => setAberta(t)} sx={{ cursor: "pointer" }}>
      <Typography variant="body2" sx={{ fontWeight: 800 }}>{t.titulo}</Typography>
      <Typography variant="caption" color="text.secondary" display="block">{t.clienteNome}</Typography>
      <Typography variant="caption" sx={{ color: t.atrasada ? "error.main" : "text.secondary" }}>Prazo {fmtDate(t.prazo)}{t.atrasada ? ` · ${t.diasAtraso}d de atraso` : ""}</Typography>
      {t.progresso !== null ? <LinearProgress variant="determinate" value={t.progresso} sx={{ mt: 0.5, height: 5, borderRadius: 3 }} /> : null}
      <Typography variant="caption" display="block">{t.responsavelNome || "sem responsável"} {t.prioridade !== "NORMAL" ? <Tag text={t.prioridade} tone={t.prioridade === "URGENTE" ? "error" : "warning"} /> : null}</Typography>
    </Box>
  );
  return (
    <>
      <SubNav value={sub} onChange={(v) => setParams({ aba: "tarefas", v })} items={[{ key: "kanban", label: "Kanban" }, { key: "lista", label: "Lista" }, { key: "calendario", label: "Calendário" }, { key: "modelos", label: "Modelos de rotina" }]} />
      {(sub === "kanban" || sub === "lista") && (
        <Panel title="Tarefas e rotinas" subtitle={atrasadas ? "Filtrando: atrasadas" : "Fechamento mensal, obrigações acessórias, folha e IR por cliente."} actions={
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <FormControlLabel control={<Checkbox size="small" checked={minhas} onChange={(e) => setMinhas(e.target.checked)} />} label="Só as minhas" />
            {atrasadas ? <Button size="small" onClick={() => setParams({ aba: "tarefas" })}>Limpar filtro</Button> : <Button size="small" onClick={() => setParams({ aba: "tarefas", v: "lista", f: "atrasadas" })}>Ver atrasadas</Button>}
            {ehContador() ? <><Button size="small" onClick={() => setGerar(true)}>Gerar rotinas do mês</Button><Button size="small" variant="contained" onClick={() => setNova(true)}>Nova tarefa</Button></> : null}
          </Box>}>
          <Async state={st}>{() => sub === "kanban" ? <Kanban columns={COLUNAS} rows={rows} groupBy={(t: any) => t.status} render={card} empty="Nada aqui" /> : <Tabela rows={rows} vazio="Nenhuma tarefa." onRow={setAberta} cols={[{ h: "Tarefa", r: (r: any) => r.titulo }, { h: "Cliente", r: (r: any) => r.clienteNome }, { h: "Prazo", r: (r: any) => <span style={{ color: r.atrasada ? "#d32f2f" : undefined }}>{fmtDate(r.prazo)}</span> }, { h: "Situação", r: (r: any) => <Situacao value={r.status} /> }, { h: "Responsável", r: (r: any) => r.responsavelNome || "—" }, { h: "Checklist", r: (r: any) => (r.progresso === null ? "—" : `${r.progresso}%`) }]} />}</Async>
        </Panel>
      )}
      {sub === "calendario" && <Calendario />}
      {sub === "modelos" && <Modelos />}
      {aberta ? <Detalhe t={aberta} onClose={() => setAberta(null)} onSaved={st.reload} /> : null}
      <FormDialog open={nova} title="Nova tarefa" fields={[{ key: "clienteId", label: "Cliente", type: "select", options: (clientes.data?.items || []).map((c: any) => ({ value: c.id, label: c.nome })), required: true }, { key: "titulo", label: "Título", required: true }, { key: "categoria", label: "Categoria", type: "select", options: ["FECHAMENTO", "OBRIGACAO", "FOLHA", "IR", "OUTRA"], def: "OUTRA" }, { key: "prazo", label: "Prazo", type: "date", required: true, def: hojeIso(5) }, { key: "prioridade", label: "Prioridade", type: "select", options: ["BAIXA", "NORMAL", "ALTA", "URGENTE"], def: "NORMAL" }, { key: "responsavelId", label: "Responsável", type: "select", options: (opt.data?.equipe || []).map((u: any) => ({ value: u.id, label: u.nome })) }, { key: "itensTxt", label: "Checklist (um item por linha)", type: "textarea" }]}
        onClose={() => setNova(false)} onSubmit={async (b) => { const { itensTxt, ...r } = b; await api.post("/tarefas", { ...r, prazo: String(r.prazo).slice(0, 10), checklist: String(itensTxt || "").split("\n").map((s) => s.trim()).filter(Boolean).map((texto) => ({ texto, feito: false })) }); toast.ok("Tarefa criada."); st.reload(); }} />
      <FormDialog open={gerar} title="Gerar rotinas recorrentes" intro={<Alert severity="info" sx={{ mb: 2 }}>Cria, para cada cliente ativo, as tarefas dos modelos que se aplicam ao regime/segmento e à competência. Não duplica as já existentes.</Alert>} fields={[{ key: "competencia", label: "Competência (AAAA-MM)", required: true, def: compMes(-1) }]} submitLabel="Gerar"
        onClose={() => setGerar(false)} onSubmit={async (b) => { const r = await api.post("/tarefas/gerar", b); toast.ok(`${r.criadas} tarefa(s) criada(s), ${r.jaExistiam} já existia(m).`); st.reload(); }} />
      {toast.node}
    </>
  );
}
void MenuItem;
