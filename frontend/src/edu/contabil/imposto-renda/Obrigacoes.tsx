import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { Estado, Formulario, IR, Kpi, KpiRow, Lista, Secao, StatusChip, dataBr, host, qstr, rotulo, useApi, useRun, useToast } from "../comum2/kit";

export function PainelIr() {
  const p = useApi<any>(`${IR}/painel`);
  const d = p.data;
  const conta = (tipo: string) => (d?.declaracoes || []).filter((x: any) => x.tipo === tipo).reduce((s: number, x: any) => s + x.total, 0);
  return (
    <Estado loading={p.loading} error={p.error} onRetry={p.reload}>
      {d ? (
        <KpiRow>
          <Kpi titulo="Declarações PF" valor={conta("PF")} cor="#0F5FDB" /><Kpi titulo="Declarações PJ" valor={conta("PJ")} />
          <Kpi titulo="Obrigações abertas" valor={d.obrigacoes.abertas} /><Kpi titulo="Obrigações atrasadas" valor={d.obrigacoes.atrasadas} cor={d.obrigacoes.atrasadas ? "#d64545" : "#2e9e5b"} />
          <Kpi titulo="Prazo nos próximos 15 dias" valor={d.obrigacoes.prazoProximo} cor={d.obrigacoes.prazoProximo ? "#c98a00" : undefined} /><Kpi titulo="Transmissões simuladas em andamento" valor={d.transmissoesEmAndamento} />
        </KpiRow>
      ) : null}
    </Estado>
  );
}

function Checklist({ o, onClose, onSaved }: { o: any; onClose: () => void; onSaved: () => void }) {
  const [itens, setItens] = useState<Array<{ item: string; ok: boolean }>>(o.checklist || []);
  const [msg, setMsg] = useState<string | null>(null);
  const conf = useApi<any>(`${IR}/obrigacoes/${o.id}/conferencia`);
  const salvar = async (status?: string) => { try { await host.put(`${IR}/obrigacoes/${o.id}`, { checklist: itens, ...(status ? { status } : {}) }); onSaved(); if (status) onClose(); else setMsg(null); } catch (e: any) { setMsg(e.message); } };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={typeof window !== "undefined" && window.innerWidth < 600}>
      <DialogTitle>{o.nome} — {o.referencia}</DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>Este sistema não gera nem envia o arquivo oficial: aqui você controla o prazo, o checklist e a conferência de dados. Valide no programa oficial e com o contador.</Alert>
        {itens.map((c, i) => <FormControlLabel key={i} sx={{ display: "flex" }} control={<Checkbox checked={c.ok} onChange={(e) => setItens(itens.map((x, k) => (k === i ? { ...x, ok: e.target.checked } : x)))} />} label={c.item} />)}
        <Typography sx={{ fontWeight: 700, mt: 2 }}>Conferência de dados disponíveis</Typography>
        <Estado loading={conf.loading} error={conf.error} onRetry={conf.reload}>
          {(conf.data?.itens || []).map((c: any, i: number) => <Alert key={i} severity={c.ok ? "success" : "warning"} sx={{ py: 0, mt: 0.5 }}><b>{c.item}:</b> {c.detalhe}</Alert>)}
        </Estado>
        {msg ? <Alert severity="error" sx={{ mt: 1 }}>{msg}</Alert> : null}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button><Button onClick={() => salvar()}>Salvar checklist</Button><Button onClick={() => salvar("EM_CONFERENCIA")}>Em conferência</Button><Button variant="contained" onClick={() => salvar("CONFERIDA")}>Marcar conferida</Button><Button variant="contained" color="success" onClick={() => salvar("ENTREGUE")}>Marcar entregue</Button></DialogActions>
    </Dialog>
  );
}

export function Obrigacoes() {
  const [empresa, setEmpresa] = useState(""); const [tipo, setTipo] = useState(""); const [so, setSo] = useState("");
  const emp = useApi<any>(`/contabil/societario/empresas-ref`);
  const r = useApi<any>(`${IR}/obrigacoes?${qstr({ pageSize: 200, empresaId: empresa, tipo, alerta: so })}`);
  const meta = useApi<any>(`${IR}/meta`);
  const { toast, node } = useToast();
  const run = useRun(toast, r.reload);
  const [gerar, setGerar] = useState(false); const [sel, setSel] = useState<any | null>(null);
  const items: any[] = r.data?.items || [];
  return (
    <Secao titulo="Obrigações acessórias da pessoa jurídica (calendário e status)" acoes={<Button variant="contained" onClick={() => setGerar(true)}>Gerar calendário do ano</Button>}>
      {node}
      <Alert severity="info" sx={{ mb: 2 }}>ECD, ECF, DCTF, EFD, DEFIS e DASN-SIMEI: calendário, status e checklist. {r.data?.aviso}</Alert>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
        <TextField size="small" select label="Empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} sx={{ minWidth: 220 }}><MenuItem value="">Todas</MenuItem>{(emp.data?.itens || []).map((x: any) => <MenuItem key={x.id} value={x.id}>{x.nome || x.id}</MenuItem>)}</TextField>
        <TextField size="small" select label="Obrigação" value={tipo} onChange={(e) => setTipo(e.target.value)} sx={{ minWidth: 180 }}><MenuItem value="">Todas</MenuItem>{(meta.data?.obrigacoes || []).map((o: any) => <MenuItem key={o.tipo} value={o.tipo}>{o.tipo.replace(/_/g, " ")}</MenuItem>)}</TextField>
        <TextField size="small" select label="Filtro" value={so} onChange={(e) => setSo(e.target.value)} sx={{ minWidth: 190 }}><MenuItem value="">Todas</MenuItem><MenuItem value="true">Só atrasadas ou com prazo próximo</MenuItem></TextField>
      </Box>
      <Estado loading={r.loading} error={r.error} onRetry={r.reload} vazio={!items.length} textoVazio="Nenhuma obrigação no calendário. Use “Gerar calendário do ano”.">
        <Lista linhas={items} aoClicar={setSel} colunas={[
          { titulo: "Obrigação", principal: true, render: (o: any) => <>{o.tipo.replace(/_/g, " ")} — {o.referencia}<Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{o.empresaNome || o.empresaId}</Typography></> },
          { titulo: "Prazo", render: (o: any) => dataBr(o.prazo) }, { titulo: "Dias", render: (o: any) => (["CONFERIDA", "ENTREGUE"].includes(o.status) ? "—" : o.diasParaPrazo < 0 ? `${-o.diasParaPrazo} d de atraso` : `${o.diasParaPrazo} d`) },
          { titulo: "Situação", render: (o: any) => <StatusChip v={o.situacao} /> },
        ]} acoes={(o: any) => <Button size="small" onClick={() => setSel(o)}>Checklist e conferência</Button>} />
      </Estado>
      <Formulario aberto={gerar} titulo="Gerar calendário de obrigações" enviarRotulo="Gerar" campos={[
        { nome: "empresaId", rotulo: "Código da empresa (empresaId)", obrigatorio: true }, { nome: "empresaNome", rotulo: "Nome da empresa" },
        { nome: "regime", rotulo: "Regime", tipo: "select", obrigatorio: true, opcoes: (meta.data?.regimes || ["MEI", "SIMPLES", "PRESUMIDO", "REAL"]).map((x: string) => ({ value: x, label: rotulo(x) })), padrao: "PRESUMIDO" },
        { nome: "ano", rotulo: "Ano-calendário", tipo: "number", obrigatorio: true, padrao: new Date().getFullYear() }, { nome: "icms", rotulo: "Contribuinte de ICMS/IPI (gera a EFD ICMS/IPI)", tipo: "checkbox" },
      ]} aoFechar={() => setGerar(false)} aoEnviar={async (v) => { const x: any = await run(() => host.post(`${IR}/obrigacoes/gerar`, v), "Calendário gerado."); if (x) { setGerar(false); toast({ type: "success", text: `${x.criadas} obrigação(ões) criada(s).` }); } }} />
      {sel ? <Checklist o={sel} onClose={() => setSel(null)} onSaved={r.reload} /> : null}
    </Secao>
  );
}
