import { Alert, Box, Button, Chip, Typography } from "@mui/material";
import { useState } from "react";
import { Bar, FormDialog, Kpi, KpiRow, Lista, LoadBox, M, Section, Status, baixarCsv, call, fmtDateTime, label, opts, useApi, useToast } from "./kit";

export default function ConformidadeTab() {
  const [rev, setRev] = useState(0);
  const [add, setAdd] = useState(false);
  const [imp, setImp] = useState(false);
  const [ver, setVer] = useState(false);
  const [cfg, setCfg] = useState(false);
  const [rem, setRem] = useState<any>(null);
  const { toast, node } = useToast();
  const p = useApi<any>(`${M}/conformidade/painel`, [rev]);
  const c = useApi<any>(`${M}/config`, [rev]);
  const d = p.data;
  return (
    <>
      {node}
      <Section title="Conformidade LGPD" actions={<><Button onClick={() => setVer(true)}>Verificar contato</Button><Button onClick={() => setCfg(true)}>Janelas e limites</Button><Button onClick={() => baixarCsv(`${M}/conformidade/relatorio.csv`, "conformidade-marketing.csv").catch((e) => toast({ type: "error", text: e.message }))}>Relatório CSV</Button></>}>
        <LoadBox loading={p.loading} error={p.error} onRetry={p.reload}>
          {d && (
            <>
              <Alert severity={d.conforme ? "success" : "warning"} sx={{ mb: 2 }}>{d.conforme ? "Sem pendências de conformidade." : <>Pendências: <ul style={{ margin: 0 }}>{d.problemas.map((x: string) => <li key={x}>{x}</li>)}</ul></>}</Alert>
              <KpiRow>
                <Kpi title="Supressões ativas" value={d.supressao.ativos} hint="Valem para todos os canais" color="#d64545" />
                <Kpi title="Consentimentos ativos" value={d.consentimentos.ativos} color="#2e9e5b" />
                <Kpi title="Revogados" value={d.consentimentos.revogados} color="#e0a100" />
                <Kpi title="Bloqueios (30 dias)" value={d.totalBloqueios} hint="Envios impedidos automaticamente" color="#0F5FDB" />
              </KpiRow>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
                <Box><Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Motivos de bloqueio</Typography>{Object.entries(d.bloqueiosPorMotivo).length ? Object.entries(d.bloqueiosPorMotivo).map(([k, v]: any) => <Bar key={k} label={k} value={v} max={d.totalBloqueios || 1} right={String(v)} />) : <Typography color="text.secondary">Nenhum bloqueio.</Typography>}</Box>
                <Box><Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Políticas ativas</Typography>
                  <Typography variant="body2">Janela de envio: <b>{d.politicas.janela}</b> (Brasília)</Typography><Typography variant="body2">Limite de frequência: <b>{d.politicas.limiteDia}/dia · {d.politicas.limiteSemana}/semana</b> por pessoa</Typography>
                  <Typography variant="body2">Descadastro em 1 clique em todas as mensagens: <b>sim</b></Typography><Typography variant="body2">Lista de supressão global (todos os canais): <b>sim</b></Typography><Typography variant="body2">Opt-in obrigatório para marketing: <b>sim</b></Typography></Box>
              </Box>
            </>
          )}
        </LoadBox>
      </Section>
      <Lista title="Lista de supressão global" path="/conformidade/supressao" refreshKey={rev} search={false} newLabel="Adicionar contato"
        extraActions={<><Button onClick={() => setAdd(true)} sx={{ mr: 1 }}>Registrar pedido do titular</Button><Button onClick={() => setImp(true)} sx={{ mr: 1 }}>Importar lista</Button></>}
        intro={<Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Guarda apenas hash + máscara do e-mail/telefone. Quem sai por um canal (link do e-mail, SAIR no WhatsApp/SMS, pedido ao atendimento) deixa de receber em todos os canais. Reativar exige justificativa e novo opt-in do titular.</Typography>}
        columns={[{ label: "Contato", primary: true, render: (r) => <b>{r.mascarado}</b> }, { label: "Tipo", render: (r) => r.tipo }, { label: "Motivo", render: (r) => label(r.motivo) }, { label: "Canal de origem", hideOnMobile: true, render: (r) => r.canalOrigem ?? "—" }, { label: "Desde", render: (r) => fmtDateTime(r.createdAt) }, { label: "Situação", render: (r) => (r.ativo ? <Chip size="small" color="error" label="Suprimido" /> : <Chip size="small" label="Removido" />) }]}
        rowActions={(r) => [{ label: "Remover da lista (novo opt-in)", show: r.ativo, onClick: () => setRem(r) }]} />
      <Lista title="Provas de consentimento" path="/conformidade/consentimentos" refreshKey={rev} search={false}
        filters={[{ key: "status", label: "Situação", options: [{ value: "ativos", label: "Ativos" }, { value: "revogados", label: "Revogados" }] }]}
        columns={[{ label: "Titular", primary: true, render: (r) => <><b>{r.titularNome ?? "—"}</b><Typography variant="caption" component="div" color="text.secondary">{r.email ?? ""}</Typography></> }, { label: "Finalidade", render: (r) => label(r.finalidade) }, { label: "Base legal", hideOnMobile: true, render: (r) => label(r.baseLegal) }, { label: "Texto", hideOnMobile: true, render: (r) => `v${r.textoVersao} · ${String(r.textoHash).slice(0, 8)}…` }, { label: "Origem", render: (r) => label(r.origem) }, { label: "Data", render: (r) => fmtDateTime(r.createdAt) }, { label: "Situação", render: (r) => <Status value={r.revogadoEm ? "REVOGADO" : "ATIVO"} /> }]} />
      <FormDialog open={add} title="Registrar pedido de descadastro" onClose={() => setAdd(false)} maxWidth="sm" intro={<Alert severity="info" sx={{ mb: 2 }}>O contato será bloqueado em todos os canais (e-mail, SMS, WhatsApp, Telegram, voz).</Alert>}
        fields={[{ key: "email", label: "E-mail" }, { key: "telefone", label: "Telefone" }, { key: "documento", label: "CPF (opcional)" }, { key: "motivo", label: "Motivo", type: "select", required: true, options: opts(["SOLICITACAO_TITULAR", "ATENDENTE", "RECLAMACAO"]) }, { key: "observacao", label: "Observação", full: true }]} initial={{ motivo: "SOLICITACAO_TITULAR" }}
        onSubmit={async (b) => { await call("POST", `${M}/conformidade/supressao`, b); setRev((x) => x + 1); toast({ type: "success", text: "Contato adicionado à lista de supressão." }); }} />
      <FormDialog open={imp} title="Importar lista de supressão" onClose={() => setImp(false)} maxWidth="sm" fields={[{ key: "texto", label: "Um por linha: e-mail ou telefone", type: "textarea", required: true, full: true }]}
        onSubmit={async (b) => { const itens = String(b.texto).split("\n").map((s) => s.trim()).filter(Boolean).map((s) => (s.includes("@") ? { email: s } : { telefone: s })); const r: any = await call("POST", `${M}/conformidade/supressao/importar`, { itens }); setRev((x) => x + 1); toast({ type: "success", text: `${r.novos} novos identificadores suprimidos.` }); }} />
      <FormDialog open={ver} title="Verificar se um contato pode receber" onClose={() => setVer(false)} maxWidth="sm" submitLabel="Verificar" initial={{ canal: "EMAIL", finalidade: "MARKETING" }}
        fields={[{ key: "canal", label: "Canal", type: "select", required: true, options: opts(["EMAIL", "SMS", "TELEGRAM", "WHATSAPP", "VOZ"]) }, { key: "destino", label: "E-mail / telefone", required: true }, { key: "finalidade", label: "Finalidade", type: "select", required: true, options: opts(["MARKETING", "TRANSACIONAL"]) }]}
        onSubmit={async (b) => { const r: any = await call("POST", `${M}/conformidade/verificar`, b); toast({ type: r.permitido ? "success" : "info", text: r.permitido ? "Permitido." : `Bloqueado: ${r.motivo}` }); }} />
      <FormDialog open={!!rem} title="Remover da lista de supressão" onClose={() => setRem(null)} maxWidth="sm" intro={<Alert severity="warning" sx={{ mb: 2 }}>Só remova se o titular pediu para voltar a receber (novo opt-in). A justificativa fica auditada.</Alert>}
        fields={[{ key: "motivo", label: "Justificativa (mín. 15 caracteres)", type: "textarea", required: true, full: true }]} onSubmit={async (b) => { await call("POST", `${M}/conformidade/supressao/${rem.id}/remover`, b); setRev((x) => x + 1); }} />
      <FormDialog open={cfg} title="Janelas de horário e limites de frequência" onClose={() => setCfg(false)} maxWidth="sm" initial={c.data ?? {}}
        fields={[{ key: "janelaInicio", label: "Início (HH:MM)", required: true }, { key: "janelaFim", label: "Fim (HH:MM)", required: true }, { key: "limiteDia", label: "Máx. mensagens de marketing por pessoa/dia", type: "number" }, { key: "limiteSemana", label: "Máx. por pessoa/semana", type: "number" }, { key: "remetenteEndereco", label: "Endereço do remetente (rodapé de e-mail)", full: true }, { key: "contatoDpo", label: "Contato do encarregado (DPO)", full: true }, { key: "slaPrimeiroContatoMin", label: "SLA do 1º contato (min)", type: "number" }, { key: "ticketMedio", label: "Receita estimada por aluno (R$)", type: "number" }, { key: "metaCustoLead", label: "Meta de custo por lead (R$)", type: "number" }, { key: "limiteAprovacaoOrcamento", label: "Orçamento que exige aprovação (R$)", type: "number" }]}
        onSubmit={async (b) => { await call("PUT", `${M}/config`, b); setRev((x) => x + 1); toast({ type: "success", text: "Configuração salva." }); }} />
    </>
  );
}
