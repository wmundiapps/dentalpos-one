import { Alert, Box, Button, Chip, MenuItem, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Async, FormDialog, Kanban, Panel, Stat, StatGrid, SubNav, Tabela, brl, fmtDate, num, useApi, useToast, type Field } from "./host";
import { Situacao, api, abrirHtml, hojeIso, usePrompt, Simulado } from "./kit";

const P = "/contabil/carteira";
const ETAPAS = [{ key: "LEAD", title: "Leads", color: "#64748b" }, { key: "PROPOSTA", title: "Proposta", color: "#0F5FDB" }, { key: "CONTRATO", title: "Contrato", color: "#B45309" }, { key: "ATIVO", title: "Ativo", color: "#2e9e5b" }, { key: "PERDIDO", title: "Perdido", color: "#d64545" }];

export default function FunilTab() {
  const [params, setParams] = useSearchParams();
  const sub = params.get("v") || "kanban";
  const funil = useApi<any>(`${P}/funil`);
  const props = useApi<any>(`${P}/propostas?pageSize=50`);
  const ctrs = useApi<any>(`${P}/contratos?pageSize=50`);
  const [novoLead, setNovoLead] = useState<any>(null);
  const [novaProp, setNovaProp] = useState<any>(null);
  const [converter, setConverter] = useState<any>(null);
  const [contrato, setContrato] = useState<any>(null);
  const toast = useToast();
  const pr = usePrompt();
  const recarregar = () => { funil.reload(); props.reload(); ctrs.reload(); };
  const mover = async (l: any, etapa: string) => {
    let motivoPerda: string | undefined;
    if (etapa === "PERDIDO") { const m = await pr.ask("Motivo da perda", { min: 3 }); if (!m) return; motivoPerda = m; }
    await toast.run(() => api.patch(`/leads/${l.id}/etapa`, { etapa, motivoPerda }), "Lead atualizado.", recarregar);
  };
  const escopoPadrao = [{ servico: "Contabilidade mensal", descricao: "Escrituração, balancetes e demonstrações" }, { servico: "Obrigações fiscais", descricao: "Apuração e guias de impostos" }];
  return (
    <>
      <SubNav value={sub} onChange={(v) => setParams({ aba: "funil", v })} items={[{ key: "kanban", label: "Kanban" }, { key: "propostas", label: "Propostas" }, { key: "contratos", label: "Contratos" }]} />
      {sub === "kanban" && (
        <Async state={funil}>{(d) => (
          <>
            <StatGrid min={150}><Stat label="Leads no funil" value={d.total} /><Stat label="Lead → proposta" value={`${num(d.conversao.leadParaProposta, 0)}%`} /><Stat label="Proposta → contrato" value={`${num(d.conversao.propostaParaContrato, 0)}%`} /><Stat label="Lead → ativo" value={`${num(d.conversao.leadParaAtivo, 0)}%`} tone="success" /></StatGrid>
            <Panel title="Funil comercial" subtitle="Lead → proposta → contrato → ativo. Use os botões do cartão para avançar." actions={<Button size="small" variant="contained" onClick={() => setNovoLead({})}>Novo lead</Button>}>
              <Kanban columns={ETAPAS} rows={d.colunas.flatMap((c: any) => c.leads)} groupBy={(l: any) => l.etapa} empty="Sem leads" render={(l: any) => (
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{l.nome}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block">{l.origem || "—"} · {l.valorEstimado ? brl(l.valorEstimado) + "/mês" : "sem estimativa"}</Typography>
                  {l.proximoContato ? <Typography variant="caption" display="block">Próximo contato: {fmtDate(l.proximoContato)}</Typography> : null}
                  {l.propostas?.length ? <Chip size="small" sx={{ mt: 0.5 }} label={`Proposta nº ${l.propostas[0].numero} (${l.propostas[0].status})`} /> : null}
                  {l.motivoPerda ? <Typography variant="caption" color="error.main" display="block">{l.motivoPerda}</Typography> : null}
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.75 }}>
                    {l.etapa === "LEAD" || l.etapa === "PROPOSTA" ? <Button size="small" onClick={() => setNovaProp({ leadId: l.id, valorMensal: l.valorEstimado, titulo: `Contabilidade — ${l.nome}`, escopo: escopoPadrao })}>Proposta</Button> : null}
                    {!l.clienteId && l.etapa !== "ATIVO" && l.etapa !== "PERDIDO" ? <Button size="small" onClick={() => setConverter(l)}>Converter em cliente</Button> : null}
                    {l.etapa !== "PERDIDO" && l.etapa !== "ATIVO" ? <Button size="small" color="error" onClick={() => mover(l, "PERDIDO")}>Perdido</Button> : null}
                    {l.etapa === "PERDIDO" ? <Button size="small" onClick={() => mover(l, "LEAD")}>Reabrir</Button> : null}
                  </Box>
                </Box>
              )} />
            </Panel>
          </>
        )}</Async>
      )}
      {sub === "propostas" && (
        <Panel title="Propostas de honorários" actions={<Button size="small" variant="contained" onClick={() => setNovaProp({ escopo: escopoPadrao })}>Nova proposta</Button>}>
          <Async state={props}>{(d) => <Tabela rows={d.items} vazio="Nenhuma proposta." cols={[{ h: "Nº", r: (r: any) => r.numero }, { h: "Para", r: (r: any) => r.destinatario || "—" }, { h: "Título", r: (r: any) => r.titulo }, { h: "Valor mensal", r: (r: any) => brl(r.valorMensal) }, { h: "Situação", r: (r: any) => <Situacao value={r.status} /> }, { h: "Validade", r: (r: any) => fmtDate(r.validadeAte) },
            { h: "", r: (r: any) => (
              <Box sx={{ display: "flex", flexWrap: "wrap" }}>
                <Button size="small" onClick={() => toast.run(() => abrirHtml(`/propostas/${r.id}/imprimir`))}>Imprimir</Button>
                {r.status === "RASCUNHO" ? <Button size="small" onClick={() => toast.run(() => api.patch(`/propostas/${r.id}/status`, { status: "ENVIADA" }), "Registrada como enviada (o sistema não envia e-mail real).", recarregar)}>Marcar enviada</Button> : null}
                {r.status === "ENVIADA" ? <><Button size="small" color="success" onClick={() => toast.run(() => api.patch(`/propostas/${r.id}/status`, { status: "ACEITA" }), "Proposta aceita.", recarregar)}>Aceita</Button><Button size="small" color="error" onClick={() => toast.run(() => api.patch(`/propostas/${r.id}/status`, { status: "RECUSADA" }), "Proposta recusada.", recarregar)}>Recusada</Button></> : null}
                {r.status === "ACEITA" ? <Button size="small" variant="contained" onClick={() => setContrato(r)}>Gerar contrato</Button> : null}
              </Box>) }]} />}</Async>
        </Panel>
      )}
      {sub === "contratos" && (
        <Panel title="Contratos de honorários" subtitle="A assinatura é SIMULADA (sem valor jurídico) até integrar um provedor de assinatura eletrônica.">
          <Async state={ctrs}>{(d) => <Tabela rows={d.items} vazio="Nenhum contrato." cols={[{ h: "Nº", r: (r: any) => r.numero }, { h: "Cliente", r: (r: any) => r.clienteNome || "—" }, { h: "Situação", r: (r: any) => <Situacao value={r.status} /> }, { h: "Valor mensal", r: (r: any) => brl(r.valorMensal) }, { h: "Valor atual", r: (r: any) => brl(r.valorAtual) }, { h: "Vence dia", r: (r: any) => r.diaVencimento }, { h: "Início", r: (r: any) => fmtDate(r.inicio) }, { h: "Assinaturas", r: (r: any) => (r.assinaturas || []).length ? <>{r.assinaturas.length}/2 <Simulado /></> : "—" },
            { h: "", r: (r: any) => (
              <Box sx={{ display: "flex", flexWrap: "wrap" }}>
                <Button size="small" onClick={() => toast.run(() => abrirHtml(`/contratos/${r.id}/imprimir`))}>Imprimir</Button>
                {r.status === "RASCUNHO" ? <Button size="small" onClick={() => toast.run(() => api.post(`/contratos/${r.id}/enviar-assinatura`, {}), "Enviado para assinatura (SIMULADO).", recarregar)}>Enviar p/ assinatura</Button> : null}
                {r.status === "AGUARDANDO_ASSINATURA" ? ["ESCRITORIO", "CLIENTE"].filter((p) => !(r.assinaturas || []).some((a: any) => a.parte === p)).map((p) => <Button key={p} size="small" onClick={async () => { const n = await pr.ask(`Nome de quem assina pelo ${p === "CLIENTE" ? "cliente" : "escritório"} (assinatura SIMULADA)`, { min: 2 }); if (n) toast.run(() => api.post(`/contratos/${r.id}/assinar`, { parte: p, nome: n }), "Assinatura simulada registrada.", recarregar); }}>Assinar ({p === "CLIENTE" ? "cliente" : "escritório"})</Button>) : null}
                {["VIGENTE", "AGUARDANDO_ASSINATURA", "RASCUNHO"].includes(r.status) ? <Button size="small" color="error" onClick={async () => { const m = await pr.ask("Motivo do encerramento", { min: 3 }); if (m) toast.run(() => api.post(`/contratos/${r.id}/encerrar`, { motivo: m }), "Contrato encerrado.", recarregar); }}>Encerrar</Button> : null}
              </Box>) }]} />}</Async>
        </Panel>
      )}
      <FormDialog open={!!novoLead} title="Novo lead" fields={[{ key: "nome", label: "Nome / razão social", required: true }, { key: "tipo", label: "Tipo", type: "select", options: ["PJ", "PF"], def: "PJ" }, { key: "documento", label: "CNPJ / CPF (opcional)" }, { key: "email", label: "E-mail" }, { key: "telefone", label: "Telefone" }, { key: "origem", label: "Origem" }, { key: "segmento", label: "Segmento" }, { key: "valorEstimado", label: "Valor mensal estimado", type: "number" }, { key: "proximoContato", label: "Próximo contato", type: "date" }, { key: "observacoes", label: "Observações", type: "textarea" }]}
        onClose={() => setNovoLead(null)} onSubmit={async (b) => { await api.post("/leads", b); toast.ok("Lead criado."); recarregar(); }} />
      <FormDialog open={!!converter} title={`Converter "${converter?.nome}" em cliente`} intro={<Alert severity="info" sx={{ mb: 2 }}>Informe o CNPJ/CPF (validado). O cliente entra como prospecto e vira ativo quando o contrato for assinado.</Alert>} fields={[{ key: "documento", label: "CNPJ / CPF", required: true }, { key: "regime", label: "Regime", type: "select", options: ["MEI", "SIMPLES", "PRESUMIDO", "REAL", "PF", "ISENTA", "OUTRO"] }]} initial={{ documento: converter?.documento }}
        onClose={() => setConverter(null)} onSubmit={async (b) => { await api.post(`/leads/${converter.id}/converter`, b); toast.ok("Lead convertido em cliente."); recarregar(); }} />
      <NovaProposta open={!!novaProp} base={novaProp} onClose={() => setNovaProp(null)} onSaved={() => { toast.ok("Proposta criada."); recarregar(); }} />
      <FormDialog open={!!contrato} title={`Gerar contrato da proposta nº ${contrato?.numero}`} fields={[{ key: "inicio", label: "Início da vigência", type: "date", def: hojeIso() }, { key: "fim", label: "Fim (vazio = indeterminado)", type: "date" }, { key: "diaVencimento", label: "Dia de vencimento", type: "number", def: 10 }, { key: "reajusteMes", label: "Mês do reajuste anual (1–12)", type: "number" }, { key: "reajustePercentual", label: "Reajuste anual (%) — simulação", type: "number" }]}
        onClose={() => setContrato(null)} onSubmit={async (b) => { await api.post(`/propostas/${contrato.id}/gerar-contrato`, b); toast.ok("Contrato gerado como rascunho."); recarregar(); setParams({ aba: "funil", v: "contratos" }); }} />
      {toast.node}{pr.node}
    </>
  );
}

function NovaProposta({ open, base, onClose, onSaved }: { open: boolean; base: any; onClose: () => void; onSaved: () => void }) {
  const leads = useApi<any>(open && !base?.leadId ? `${P}/leads?pageSize=100` : null);
  const [escopo, setEscopo] = useState("");
  const campos: Field[] = [
    ...(base?.leadId ? [] : [{ key: "leadId", label: "Lead", type: "select" as const, options: (leads.data?.items || []).map((l: any) => ({ value: l.id, label: l.nome })), required: true }]),
    { key: "titulo", label: "Título", required: true }, { key: "valorMensal", label: "Valor mensal", type: "number", required: true }, { key: "validadeAte", label: "Válida até", type: "date", def: hojeIso(15) },
    { key: "reajusteIndice", label: "Índice de reajuste", type: "select", options: ["IPCA", "IGP-M", "INPC", "SALARIO_MINIMO", "FIXO"], def: "IPCA" },
    { key: "escopoTxt", label: "Escopo (um serviço por linha: Serviço — descrição)", type: "textarea", def: (base?.escopo || []).map((e: any) => `${e.servico} — ${e.descricao || ""}`).join("\n") }, { key: "observacoes", label: "Observações", type: "textarea" },
  ];
  void escopo; void setEscopo;
  return <FormDialog open={open} title="Nova proposta" fields={campos} initial={base} onClose={onClose} onSubmit={async (b) => {
    const { escopoTxt, ...resto } = b;
    const escopoArr = String(escopoTxt || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [s, ...d] = l.split(/\s[—-]\s/); return { servico: s.trim(), descricao: d.join(" — ").trim() || undefined }; });
    await api.post("/propostas", { ...resto, leadId: base?.leadId ?? resto.leadId, escopo: escopoArr }); onSaved();
  }} />;
}
void MenuItem; void TextField;
