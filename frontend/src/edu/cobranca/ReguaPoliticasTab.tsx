import { Alert, Box, Button, Chip, Paper, Tab, Tabs, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { FormDialog, LoadBox, Section, Status, call, fmtDateTime, fmtMoney, label, openHtml, useApi, useRunner, useToast } from "../desempenho/kit";
import { ACOES, CANAIS, ResponsiveTable, SEGMENTOS } from "./common";

export default function ReguaPoliticasTab() {
  const [sub, setSub] = useState(0);
  return (
    <>
      <Tabs value={sub} onChange={(_, v) => setSub(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        <Tab label="Política de cobrança" /><Tab label="Régua e recorrência" /><Tab label="Escalonamento e Jurídico" />
      </Tabs>
      {sub === 0 && <Politicas />}
      {sub === 1 && <Reguas />}
      {sub === 2 && <Escalonamento />}
    </>
  );
}

const camposPolitica = [
  { key: "nome", label: "Nome", required: true }, { key: "segmento", label: "Segmento", type: "select" as const, required: true, options: SEGMENTOS },
  { key: "multaPct", label: "Multa moratória (%) — máx. 2", type: "number" as const, required: true }, { key: "jurosTipo", label: "Juros", type: "select" as const, options: [{ value: "MENSAL", label: "Mensal (% ao mês)" }, { value: "DIARIO", label: "Diário (% ao dia)" }] },
  { key: "jurosPct", label: "Juros (%)", type: "number" as const, required: true }, { key: "jurosComposto", label: "Juros compostos", type: "bool" as const },
  { key: "correcaoIndice", label: "Índice de correção", type: "select" as const, options: ["NENHUM", "IPCA", "IGPM", "INPC", "FIXO"] }, { key: "correcaoPctAnual", label: "Correção monetária (% ao ano)", type: "number" as const },
  { key: "toleranciaDias", label: "Tolerância (dias sem encargos)", type: "number" as const },
  { key: "descontoQuitacaoEncargosPct", label: "Desconto de quitação sobre encargos (%)", type: "number" as const }, { key: "descontoQuitacaoPrincipalPct", label: "Desconto de quitação sobre o principal (%)", type: "number" as const },
  { key: "descontoMaxPct", label: "Alçada máxima de desconto (%)", type: "number" as const, helper: "Acima disso só gestor aprova." }, { key: "bloqueiaDescontoComBolsa", label: "Sem desconto no principal para bolsistas", type: "bool" as const },
  { key: "entradaMinPct", label: "Entrada mínima do acordo (%)", type: "number" as const }, { key: "parcelasMax", label: "Máximo de parcelas", type: "number" as const }, { key: "parcelaMinima", label: "Parcela mínima (R$)", type: "number" as const },
  { key: "jurosParcelamentoPct", label: "Juros de parcelamento (% a.m.)", type: "number" as const }, { key: "validadePropostaDias", label: "Validade da proposta (dias)", type: "number" as const },
  { key: "toleranciaQuebraDias", label: "Dias de atraso até quebrar o acordo", type: "number" as const }, { key: "aplicarEncargosAcordo", label: "Encargos em parcela de acordo paga em atraso", type: "bool" as const }, { key: "pausaComPromessa", label: "Pausar a régua durante promessa", type: "bool" as const },
  { key: "baseLegal", label: "Base legal (LGPD)", type: "select" as const, options: ["EXECUCAO_CONTRATO", "EXERCICIO_REGULAR_DIREITOS", "PROTECAO_CREDITO"] },
  { key: "janelaInicio", label: "Contato a partir de (07:00-21:00)", required: true }, { key: "janelaFim", label: "Contato até", required: true },
  { key: "diasContato", label: "Dias de contato (0=dom ... 6=sáb)", type: "list" as const }, { key: "bloqueiaFeriados", label: "Não contatar em feriados nacionais", type: "bool" as const },
  { key: "limiteContatosDia", label: "Limite de contatos por dia", type: "number" as const }, { key: "limiteContatosSemana", label: "Limite de contatos por semana", type: "number" as const },
  { key: "diasAvisoPrevio", label: "Aviso prévio antes de protesto/negativação (dias)", type: "number" as const }, { key: "valorMinimoExecucao", label: "Valor mínimo para execução (R$)", type: "number" as const },
];

function Politicas() {
  const [rev, setRev] = useState(0);
  const [edit, setEdit] = useState<any>(null);
  const [novo, setNovo] = useState(false);
  const p = useApi<any>("/cobranca/politicas", [rev]);
  const { node } = useToast();
  const prep = (b: any) => ({ ...b, diasContato: (b.diasContato ?? [1, 2, 3, 4, 5]).map(Number) });
  const ini = (r: any) => ({ ...r, diasContato: (r.diasContato ?? []).join(",") });
  return (
    <>
      {node}
      <Section title="Políticas por segmento" actions={<Button variant="contained" onClick={() => setNovo(true)}>Nova política</Button>}>
        <Alert severity="info" sx={{ mb: 2 }}>Multa limitada a 2% (CDC art. 52, §1º). Contatos só entre 07h e 21h, sem constrangimento ou exposição (CDC art. 42). Se um segmento não tem política, vale a de "Todos"; sem nenhuma, vale o padrão do sistema.</Alert>
        <LoadBox loading={p.loading && !p.data} error={p.error} onRetry={p.reload}>
          <ResponsiveTable rows={p.data?.items ?? []} rowKey={(r: any) => r.id} onRow={(r: any) => setEdit(r)} empty="Nenhuma política cadastrada (vale o padrão). Use 'Criar padrões' no Painel."
            cols={[
              { key: "nome", label: "Política", render: (r: any) => <b>{r.nome}</b> },
              { key: "segmento", label: "Segmento", render: (r: any) => label(r.segmento) },
              { key: "multaPct", label: "Multa / juros", render: (r: any) => `${r.multaPct}% + ${r.jurosPct}% ${r.jurosTipo === "DIARIO" ? "a.d." : "a.m."}${r.correcaoPctAnual ? ` + ${r.correcaoPctAnual}% a.a.` : ""}` },
              { key: "toleranciaDias", label: "Tolerância", hideMobile: true, render: (r: any) => `${r.toleranciaDias} dia(s)` },
              { key: "desc", label: "Desconto quitação", hideMobile: true, render: (r: any) => `enc. ${r.descontoQuitacaoEncargosPct}% · princ. ${r.descontoQuitacaoPrincipalPct}% (alçada ${r.descontoMaxPct}%)` },
              { key: "acordo", label: "Acordo", hideMobile: true, render: (r: any) => `entrada ${r.entradaMinPct}% · até ${r.parcelasMax}x` },
              { key: "janela", label: "Contato", render: (r: any) => `${r.janelaInicio}-${r.janelaFim} · ${r.limiteContatosDia}/dia` },
              { key: "ativa", label: "Ativa", render: (r: any) => <Chip size="small" color={r.ativa ? "success" : "default"} label={r.ativa ? "sim" : "não"} /> },
            ]} />
        </LoadBox>
      </Section>
      <Calculadora />
      <FormDialog open={novo} title="Nova política" fields={camposPolitica} initial={{ segmento: "GRADUACAO", multaPct: 2, jurosTipo: "MENSAL", jurosPct: 1, janelaInicio: "08:00", janelaFim: "20:00", diasContato: "1,2,3,4,5", limiteContatosDia: 1, limiteContatosSemana: 4, bloqueiaFeriados: true, bloqueiaDescontoComBolsa: true, aplicarEncargosAcordo: true, pausaComPromessa: true, descontoMaxPct: 30, entradaMinPct: 10, parcelasMax: 12, parcelaMinima: 50, validadePropostaDias: 7, toleranciaQuebraDias: 5, diasAvisoPrevio: 10, valorMinimoExecucao: 200, baseLegal: "EXECUCAO_CONTRATO", correcaoIndice: "NENHUM" }}
        onClose={() => setNovo(false)} maxWidth="lg" onSubmit={async (b) => { await call("POST", "/cobranca/politicas", prep(b)); setRev((x) => x + 1); }} />
      <FormDialog open={!!edit} title={`Editar: ${edit?.nome ?? ""}`} fields={[...camposPolitica, { key: "ativa", label: "Política ativa", type: "bool" }]} initial={edit ? ini(edit) : {}} onClose={() => setEdit(null)} maxWidth="lg"
        onSubmit={async (b) => { await call("PUT", `/cobranca/politicas/${edit.id}`, prep(b)); setRev((x) => x + 1); }} />
    </>
  );
}

function Calculadora() {
  const [f, setF] = useState<any>({ valor: 1000, dias: 45, multaPct: 2, jurosPct: 1, jurosTipo: "MENSAL", correcaoPctAnual: 0, toleranciaDias: 0 });
  const [r, setR] = useState<any>(null);
  const [err, setErr] = useState("");
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  async function calc() {
    try {
      const venc = new Date(Date.now() - Number(f.dias) * 86_400_000).toISOString();
      setR(await call("POST", "/cobranca/calculadora", { valor: Number(f.valor), vencimento: venc, multaPct: Number(f.multaPct), jurosPct: Number(f.jurosPct), jurosTipo: f.jurosTipo, correcaoPctAnual: Number(f.correcaoPctAnual), toleranciaDias: Number(f.toleranciaDias) })); setErr("");
    } catch (e: any) { setErr(e.message); }
  }
  return (
    <Section title="Calculadora de encargos">
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(6, 1fr)" }, gap: 1.5, mb: 1 }}>
        <TextField size="small" type="number" label="Valor" value={f.valor} onChange={set("valor")} /><TextField size="small" type="number" label="Dias de atraso" value={f.dias} onChange={set("dias")} />
        <TextField size="small" type="number" label="Multa %" value={f.multaPct} onChange={set("multaPct")} /><TextField size="small" type="number" label="Juros %" value={f.jurosPct} onChange={set("jurosPct")} />
        <TextField size="small" type="number" label="Correção % a.a." value={f.correcaoPctAnual} onChange={set("correcaoPctAnual")} /><Button variant="outlined" onClick={calc}>Calcular</Button>
      </Box>
      {err && <Alert severity="error">{err}</Alert>}
      {r && <Typography variant="body2">Multa {fmtMoney(r.multa)} · juros {fmtMoney(r.juros)} · correção {fmtMoney(r.correcao)} = encargos <b>{fmtMoney(r.total)}</b> · valor atualizado <b>{fmtMoney(r.valorAtualizado)}</b></Typography>}
    </Section>
  );
}

const camposEtapa = [
  { key: "nome", label: "Nome da etapa", required: true }, { key: "diaAtraso", label: "Dias de atraso (gatilho)", type: "number" as const, required: true },
  { key: "acao", label: "Ação", type: "select" as const, required: true, options: ACOES }, { key: "canal", label: "Canal", type: "select" as const, options: CANAIS, hidden: (v: any) => v.acao && v.acao !== "MENSAGEM" },
  { key: "canalFallback", label: "Canal alternativo", type: "select" as const, options: CANAIS, hidden: (v: any) => v.acao && v.acao !== "MENSAGEM" },
  { key: "assunto", label: "Assunto (e-mail)", hidden: (v: any) => v.acao && v.acao !== "MENSAGEM" },
  { key: "mensagem", label: "Mensagem — variáveis {{nome}} {{saldo}} {{vencimento}} {{dias_atraso}} {{titulos}} {{curso}}", type: "textarea" as const, hidden: (v: any) => v.acao && v.acao !== "MENSAGEM" },
  { key: "repetirACadaDias", label: "Repetir a cada N dias até quitar/acordo (vazio = uma vez)", type: "number" as const, hidden: (v: any) => v.acao && v.acao !== "MENSAGEM" },
  { key: "maxRepeticoes", label: "Máximo de repetições (vazio = sem limite)", type: "number" as const, hidden: (v: any) => v.acao && v.acao !== "MENSAGEM" },
  { key: "continuaAposProxima", label: "Continua repetindo depois que a próxima etapa começa", type: "bool" as const, hidden: (v: any) => v.acao && v.acao !== "MENSAGEM" },
  { key: "exigeAprovacao", label: "Exige aprovação humana", type: "bool" as const, hidden: (v: any) => !v.acao || v.acao === "MENSAGEM" || v.acao === "NOTIFICACAO_EXTRAJUDICIAL" },
  { key: "ativa", label: "Etapa ativa", type: "bool" as const },
];

function Reguas() {
  const [rev, setRev] = useState(0);
  const [etapa, setEtapa] = useState<{ reguaId: string; e?: any } | null>(null);
  const [sim, setSim] = useState<any>(null);
  const [novaRegua, setNovaRegua] = useState(false);
  const r = useApi<any>("/cobranca/reguas", [rev]);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  return (
    <>
      {node}
      <Section title="Réguas de cobrança" actions={<>
        <Button variant="outlined" onClick={async () => { const x = await run(() => call("POST", "/cobranca/motor/simular", {}), "Simulação concluída (nada foi enviado)."); if (x?.simulacao) setSim(x); }}>Simular execução</Button>
        <Button variant="contained" onClick={() => run(() => call("POST", "/cobranca/motor/executar", { despachar: true }), "Régua executada.", "Executar a régua agora?")}>Executar agora</Button>
        <Button onClick={() => setNovaRegua(true)}>Nova régua</Button>
      </>}>
        <Alert severity="info" sx={{ mb: 2 }}>A régua usa o <b>maior atraso</b> do aluno. Etapas de mensagem disparam no gatilho e <b>repetem a cada N dias até a quitação ou acordo</b>; pagamento, acordo ativo, promessa vigente ou pausa interrompem automaticamente. Opt-out, janela de horário e limites de contato são sempre respeitados.</Alert>
        {sim && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSim(null)}>
            Simulação: {sim.simulacao.length} ação(ões) — pausados: {Object.entries(sim.pulados).map(([k, v]) => `${k} ${v}`).join(", ") || "nenhum"}.
            {sim.simulacao.slice(0, 8).map((s: any, i: number) => <div key={i}>• {s.aluno}: {s.etapa} {s.canal ? `(${s.canal})` : ""} {s.repeticao ? "[repetição]" : ""} → {s.resultado}</div>)}
          </Alert>
        )}
        <LoadBox loading={r.loading && !r.data} error={r.error} onRetry={r.reload} empty={!r.data?.items?.length} emptyText="Nenhuma régua. Use 'Criar padrões' no Painel.">
          {(r.data?.items ?? []).map((g: any) => (
            <Paper key={g.id} variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 3 }}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>{g.nome}</Typography>
                <Chip size="small" label={label(g.segmento)} /><Chip size="small" color={g.ativa ? "success" : "default"} label={g.ativa ? "ativa" : "inativa"} />
                <Button size="small" onClick={() => setEtapa({ reguaId: g.id })}>+ Etapa</Button>
                <Button size="small" onClick={() => run(() => call("PUT", `/cobranca/reguas/${g.id}`, { ativa: !g.ativa }), "Atualizada.")}>{g.ativa ? "Desativar" : "Ativar"}</Button>
              </Box>
              <ResponsiveTable rows={g.etapas} rowKey={(e: any) => e.id} onRow={(e: any) => setEtapa({ reguaId: g.id, e })}
                cols={[
                  { key: "diaAtraso", label: "Atraso", render: (e: any) => <b>{e.diaAtraso}º dia</b> },
                  { key: "nome", label: "Etapa", render: (e: any) => e.nome },
                  { key: "acao", label: "Ação / canal", render: (e: any) => (e.acao === "MENSAGEM" ? <>{label(e.canal)}{e.canalFallback ? ` → ${label(e.canalFallback)}` : ""}</> : <Chip size="small" color="warning" label={label(e.acao)} />) },
                  { key: "repetirACadaDias", label: "Recorrência", render: (e: any) => (e.acao !== "MENSAGEM" ? "uma vez" : e.repetirACadaDias ? `a cada ${e.repetirACadaDias} dia(s)${e.maxRepeticoes ? `, até ${e.maxRepeticoes}x` : ", até resolver"}${e.continuaAposProxima ? " (continua)" : ""}` : "uma vez") },
                  { key: "ativa", label: "", render: (e: any) => (e.ativa ? "" : <Chip size="small" label="inativa" />) },
                ]} />
            </Paper>
          ))}
        </LoadBox>
      </Section>
      <FormDialog open={!!etapa} title={etapa?.e ? "Editar etapa" : "Nova etapa"} fields={camposEtapa} maxWidth="md"
        initial={etapa?.e ? etapa.e : { acao: "MENSAGEM", canal: "WHATSAPP", diaAtraso: 5, ativa: true }} onClose={() => setEtapa(null)}
        onSubmit={async (b) => { if (etapa?.e) await call("PUT", `/cobranca/etapas/${etapa.e.id}`, b); else await call("POST", `/cobranca/reguas/${etapa!.reguaId}/etapas`, b); setRev((x) => x + 1); }} />
      <FormDialog open={novaRegua} title="Nova régua" fields={[{ key: "nome", label: "Nome", required: true }, { key: "segmento", label: "Segmento", type: "select", options: SEGMENTOS, required: true }, { key: "toleranciaDias", label: "Tolerância para etapas atrasadas (dias)", type: "number" }, { key: "descricao", label: "Descrição", type: "textarea" }]}
        initial={{ segmento: "TODOS", toleranciaDias: 3 }} onClose={() => setNovaRegua(false)} onSubmit={async (b) => { await call("POST", "/cobranca/reguas", b); setRev((x) => x + 1); }} />
    </>
  );
}

function Escalonamento() {
  const [rev, setRev] = useState(0);
  const [tipo, setTipo] = useState("");
  const e = useApi<any>(`/cobranca/encaminhamentos?pageSize=50${tipo ? `&tipo=${tipo}` : ""}`, [rev]);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  return (
    <Section title="Escalonamento: notificação, negativação, protesto e Jurídico" actions={<TextField select size="small" label="Tipo" value={tipo} onChange={(ev) => setTipo(ev.target.value)} sx={{ minWidth: 220 }} slotProps={{ select: { native: true } }}><option value="">Todos</option>{ACOES.filter((a) => a.value !== "MENSAGEM").map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</TextField>}>
      {node}
      <Alert severity="warning" sx={{ mb: 2 }}>Negativação e protesto são <b>simulados</b> (não há integração com bureau/cartório) e exigem notificação extrajudicial entregue com aviso prévio. A solicitação de execução segue o contrato <code>cobranca.solicitacao-execucao.v1</code>, consumido pelo módulo Jurídico em <code>/cobranca/juridico/solicitacoes</code>.</Alert>
      <LoadBox loading={e.loading && !e.data} error={e.error} onRetry={e.reload}>
        <ResponsiveTable rows={e.data?.items ?? []} rowKey={(x: any) => x.id} empty="Nenhum encaminhamento."
          cols={[
            { key: "numero", label: "Nº", render: (x: any) => <b>{x.numero}</b> },
            { key: "aluno", label: "Aluno" },
            { key: "tipo", label: "Tipo", render: (x: any) => <>{label(x.tipo)}{x.simulado ? " (simulado)" : ""}</> },
            { key: "status", label: "Situação", render: (x: any) => <Status value={x.status} /> },
            { key: "valorDebito", label: "Débito", align: "right", render: (x: any) => fmtMoney(x.valorDebito) },
            { key: "createdAt", label: "Criado", hideMobile: true, render: (x: any) => fmtDateTime(x.createdAt) },
            { key: "protocoloExterno", label: "Protocolo", hideMobile: true, render: (x: any) => x.protocoloExterno ?? x.retornoMotivo ?? "—" },
            { key: "acao", label: "", render: (x: any) => (
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                {["AGUARDANDO_APROVACAO", "GERADO"].includes(x.status) && <Button size="small" variant="contained" onClick={() => run(() => call("POST", `/cobranca/encaminhamentos/${x.id}/aprovar`, {}), x.tipo === "JURIDICO" ? "Enviado ao Jurídico." : "Aprovado/registrado como enviado.", "Confirmar o envio deste encaminhamento?")}>{x.status === "GERADO" ? "Confirmar envio" : "Aprovar"}</Button>}
                {["AGUARDANDO_APROVACAO", "GERADO"].includes(x.status) && <Button size="small" color="error" onClick={() => { const m = window.prompt("Motivo do cancelamento:"); if (m) run(() => call("POST", `/cobranca/encaminhamentos/${x.id}/cancelar`, { motivo: m }), "Cancelado."); }}>Cancelar</Button>}
                {x.tipo === "NOTIFICACAO_EXTRAJUDICIAL" && <Button size="small" onClick={() => openHtml(`/cobranca/encaminhamentos/${x.id}/documento`).catch((er) => toast({ type: "error", text: er.message }))}>Documento</Button>}
              </Box>) },
          ]} />
      </LoadBox>
    </Section>
  );
}
