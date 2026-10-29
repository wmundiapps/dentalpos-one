import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Tab, Tabs, Typography } from "@mui/material";
import { useState } from "react";
import { AlertaChip, DataList, J, Kpi, KpiRow, LoadBox, NivelChip, Pick, PromptDialog, ResourceTab, Section, Status, call, fmtDate, fmtMoney, itemsOf, opts, useApi, useIsMobile, useJurOptions, useRunner, useToast, type FormField } from "./kit";

const CATEGORIAS = ["PATRIMONIAL", "PESSOAL", "RESPONSABILIDADE_CIVIL", "TRABALHISTA", "REGULATORIO", "REPUTACIONAL", "OPERACIONAL", "CIBERNETICO", "AMBIENTAL", "FINANCEIRO"];
const TIPOS_SEGURO = ["PATRIMONIAL", "PESSOAL", "RESPONSABILIDADE_CIVIL", "DANOS_MORAIS", "ACIDENTES_ALUNOS", "VIDA_COLABORADORES", "CIBERNETICO", "EQUIPAMENTOS", "OUTRO"];
const COR: Record<string, string> = { BAIXO: "#2e9e5b", MEDIO: "#e0a100", ALTO: "#e07b00", CRITICO: "#d64545" };

function Matriz({ rev }: { rev: number }) {
  const mobile = useIsMobile();
  const [residual, setResidual] = useState("");
  const [sel, setSel] = useState<any>(null);
  const m = useApi<any>(`${J}/riscos-matriz${residual ? "?residual=true" : ""}`, [rev]);
  const sc = useApi<any>(`${J}/riscos-sem-cobertura`, [rev]);
  const cel = (p: number, i: number) => m.data?.celulas?.find((c: any) => c.probabilidade === p && c.impacto === i);
  const size = mobile ? 46 : 74;
  return (
    <Section title="Matriz de riscos (probabilidade x impacto)" actions={<Pick label="Visão" value={residual} onChange={setResidual} options={[{ value: "true", label: "Residual (após controles)" }]} all="Inerente" minWidth={190} />}>
      <LoadBox loading={m.loading} error={m.error} onRetry={m.reload}>
        {m.data && <>
          <KpiRow>
            <Kpi title="Críticos" value={m.data.porNivel.CRITICO} color={COR.CRITICO} /><Kpi title="Altos" value={m.data.porNivel.ALTO} color={COR.ALTO} />
            <Kpi title="Médios" value={m.data.porNivel.MEDIO} color={COR.MEDIO} /><Kpi title="Baixos" value={m.data.porNivel.BAIXO} color={COR.BAIXO} />
          </KpiRow>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "flex-start" }}>
            <Box sx={{ overflowX: "auto", maxWidth: "100%" }}>
              <Box sx={{ display: "grid", gridTemplateColumns: `28px repeat(5, ${size}px)`, gap: "4px", alignItems: "center" }}>
                {[5, 4, 3, 2, 1].map((p) => (
                  <Box key={p} sx={{ display: "contents" }}>
                    <Typography variant="caption" sx={{ textAlign: "center", fontWeight: 800 }}>{p}</Typography>
                    {[1, 2, 3, 4, 5].map((i) => {
                      const c = cel(p, i);
                      return (
                        <Box key={i} role="button" tabIndex={0} onClick={() => c?.qtd && setSel(c)} onKeyDown={(e) => e.key === "Enter" && c?.qtd && setSel(c)}
                          sx={{ height: size * 0.8, borderRadius: 2, bgcolor: COR[c?.nivel ?? "BAIXO"], color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, opacity: c?.qtd ? 1 : 0.35, cursor: c?.qtd ? "pointer" : "default", outline: sel === c ? "3px solid #000" : undefined }}>{c?.qtd || ""}</Box>
                      );
                    })}
                  </Box>
                ))}
                <span />{[1, 2, 3, 4, 5].map((i) => <Typography key={i} variant="caption" sx={{ textAlign: "center", fontWeight: 800 }}>{i}</Typography>)}
              </Box>
              <Typography variant="caption" color="text.secondary">Linhas: probabilidade (5 = quase certa) · Colunas: impacto (5 = catastrófico). Toque na célula para ver os riscos.</Typography>
            </Box>
            {sel && <Box sx={{ flex: 1, minWidth: 220 }}>
              <Typography sx={{ fontWeight: 800 }}>Probabilidade {sel.probabilidade} x impacto {sel.impacto} <NivelChip nivel={sel.nivel} /></Typography>
              {sel.riscos.map((r: any) => <Typography key={r.id} variant="body2">• {r.codigo} — {r.titulo}</Typography>)}
            </Box>}
          </Box>
        </>}
      </LoadBox>
      <Typography variant="subtitle1" sx={{ fontWeight: 800, mt: 3, mb: 1 }}>Riscos altos/críticos sem seguro vigente</Typography>
      <LoadBox loading={sc.loading} error={sc.error} empty={!itemsOf(sc.data).length} emptyText="Todos os riscos seguráveis de nível alto/crítico têm apólice vigente associada." onRetry={sc.reload}>
        <DataList rows={itemsOf(sc.data)} columns={[{ label: "Risco", primary: true, render: (r: any) => <b>{r.codigo} — {r.titulo}</b> }, { label: "Categoria", render: (r: any) => r.categoria.replace(/_/g, " ").toLowerCase() }, { label: "Nível", render: (r: any) => <NivelChip nivel={r.nivel} /> }, { label: "Motivo", render: (r: any) => (r.motivo === "SEM_SEGURO" ? "sem apólice associada" : "apólice vencida/inativa") }]} />
      </LoadBox>
    </Section>
  );
}

function Sinistros({ seguro, onClose }: { seguro: any; onClose: () => void }) {
  const [rev, setRev] = useState(0);
  const [novo, setNovo] = useState(false);
  const l = useApi<any>(`${J}/sinistros?seguroId=${seguro.id}`, [rev]);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const NEXT: Record<string, string[]> = { COMUNICADO: ["EM_ANALISE", "NEGADO"], EM_ANALISE: ["NEGADO", "INDENIZADO"], INDENIZADO: ["ENCERRADO"], NEGADO: ["ENCERRADO", "EM_ANALISE"], ENCERRADO: [] };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Sinistros — apólice {seguro.apolice}</DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={l.loading} error={l.error} empty={!itemsOf(l.data).length} emptyText="Nenhum sinistro registrado." onRetry={l.reload}>
          <DataList rows={itemsOf(l.data)} columns={[
            { label: "Ocorrência", primary: true, render: (s: any) => fmtDate(s.dataOcorrencia) }, { label: "Descrição", render: (s: any) => s.descricao }, { label: "Estimado", render: (s: any) => fmtMoney(s.valorEstimado) },
            { label: "Indenizado", render: (s: any) => fmtMoney(s.valorIndenizado) }, { label: "Protocolo", hideOnMobile: true, render: (s: any) => s.protocoloSeguradora || "—" }, { label: "Situação", render: (s: any) => <Status value={s.status} /> },
          ]} actions={(s: any) => <>{(NEXT[s.status] || []).map((n) => (
            <Button key={n} size="small" onClick={() => {
              let body: any = { status: n };
              if (n === "INDENIZADO") { const v = window.prompt("Valor indenizado (R$):"); if (!v) return; body = { status: n, valorIndenizado: Number(v.replace(",", ".")) }; }
              void run(() => call("POST", `${J}/sinistros/${s.id}/status`, body), "Sinistro atualizado.");
            }}>{n.replace(/_/g, " ").toLowerCase()}</Button>))}</>} />
        </LoadBox>
      </DialogContent>
      <DialogActions><Button variant="contained" onClick={() => setNovo(true)}>Registrar sinistro</Button><Button onClick={onClose}>Fechar</Button></DialogActions>
      <PromptDialog open={novo} title="Registrar sinistro" onClose={() => setNovo(false)}
        intro={<Alert severity="info" sx={{ mb: 2 }}>A data da ocorrência deve estar dentro da vigência da apólice.</Alert>}
        fields={[{ key: "dataOcorrencia", label: "Data da ocorrência", type: "date", required: true }, { key: "descricao", label: "O que aconteceu", type: "textarea", required: true }, { key: "valorEstimado", label: "Valor estimado (R$)", type: "number" }, { key: "protocoloSeguradora", label: "Protocolo na seguradora" }]}
        onSubmit={async (b) => { await call("POST", `${J}/seguros/${seguro.id}/sinistros`, b); setRev((x) => x + 1); }} />
    </Dialog>
  );
}

export default function RiscosTab() {
  const [sub, setSub] = useState(0);
  const [rev, setRev] = useState(0);
  const [sin, setSin] = useState<any>(null);
  const [dlg, setDlg] = useState<null | { kind: "renovar" | "cancelar"; row: any }>(null);
  const seguros = useJurOptions("/seguros?pageSize=200", (s) => ({ value: s.id, label: `${s.apolice} — ${s.seguradora}` }));
  const RISCO: FormField[] = [
    { key: "titulo", label: "Risco", required: true, full: true }, { key: "categoria", label: "Categoria", type: "select", required: true, options: opts(CATEGORIAS) }, { key: "setor", label: "Setor" },
    { key: "probabilidade", label: "Probabilidade (1-5)", type: "number", required: true }, { key: "impacto", label: "Impacto (1-5)", type: "number", required: true },
    { key: "probabilidadeResidual", label: "Probabilidade residual (1-5)", type: "number" }, { key: "impactoResidual", label: "Impacto residual (1-5)", type: "number" },
    { key: "controles", label: "Controles existentes", type: "textarea" }, { key: "planoTratamento", label: "Plano de tratamento", type: "textarea" }, { key: "responsavelNome", label: "Responsável (obrigatório p/ alto e crítico)" },
    { key: "seguroId", label: "Apólice que cobre o risco", type: "select", options: seguros }, { key: "status", label: "Situação", type: "select", options: opts(["IDENTIFICADO", "EM_TRATAMENTO", "MITIGADO", "ACEITO", "ENCERRADO"]) },
    { key: "revisaoEm", label: "Próxima revisão", type: "date" }, { key: "descricao", label: "Descrição", type: "textarea" },
  ];
  const SEGURO: FormField[] = [
    { key: "tipo", label: "Tipo", type: "select", required: true, options: opts(TIPOS_SEGURO) }, { key: "apolice", label: "Nº da apólice", required: true }, { key: "seguradora", label: "Seguradora", required: true }, { key: "corretor", label: "Corretor" },
    { key: "premio", label: "Prêmio (R$)", type: "number", required: true }, { key: "premioPeriodicidade", label: "Periodicidade do prêmio", type: "select", options: opts(["ANUAL", "MENSAL", "UNICO"]) },
    { key: "limiteTotal", label: "Limite total de cobertura (R$)", type: "number" }, { key: "vigenciaInicio", label: "Início da vigência", type: "date", required: true }, { key: "vigenciaFim", label: "Fim da vigência (vencimento)", type: "date", required: true },
    { key: "bensSegurados", label: "Bens / pessoas seguradas", type: "textarea" }, { key: "renovacaoAutomatica", label: "Renovação automática", type: "bool" }, { key: "responsavelNome", label: "Responsável" }, { key: "observacoes", label: "Observações", type: "textarea" },
  ];
  return (
    <>
      <Section title="Riscos e seguros"><Tabs value={sub} onChange={(_, v) => setSub(v)} variant="scrollable"><Tab label="Matriz" /><Tab label="Registro de riscos" /><Tab label="Seguros e sinistros" /></Tabs></Section>
      {sub === 0 && <Matriz rev={rev} />}
      {sub === 1 && <ResourceTab title="Registro de riscos" path="/riscos" fields={RISCO} newLabel="Novo risco" anexoRef="Risco" refreshKey={rev}
        filters={[{ key: "categoria", label: "Categoria", options: opts(CATEGORIAS) }, { key: "nivel", label: "Nível", options: opts(["CRITICO", "ALTO", "MEDIO", "BAIXO"]) }, { key: "status", label: "Situação", options: opts(["IDENTIFICADO", "EM_TRATAMENTO", "MITIGADO", "ACEITO", "ENCERRADO"]) }]}
        columns={[
          { label: "Risco", primary: true, render: (r) => <><b>{r.titulo}</b><Typography variant="caption" component="div" color="text.secondary">{r.codigo} · {r.categoria.replace(/_/g, " ").toLowerCase()}</Typography></> },
          { label: "P x I", render: (r) => `${r.probabilidade} x ${r.impacto} = ${r.score}` }, { label: "Nível", render: (r) => <NivelChip nivel={r.nivel} /> }, { label: "Residual", hideOnMobile: true, render: (r) => (r.probabilidadeResidual && r.impactoResidual ? r.probabilidadeResidual * r.impactoResidual : "—") },
          { label: "Responsável", hideOnMobile: true, render: (r) => r.responsavelNome || "—" }, { label: "Revisão", render: (r) => fmtDate(r.revisaoEm) }, { label: "Situação", render: (r) => <Status value={r.status} /> },
        ]} />}
      {sub === 2 && <ResourceTab title="Apólices de seguro" path="/seguros" fields={SEGURO} vencimento newLabel="Nova apólice" anexoRef="Seguro" refreshKey={rev}
        intro={<Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Patrimonial, pessoal, responsabilidade civil, danos morais, acidentes de alunos etc. Os alertas de vencimento (90/60/30 dias) são agendados automaticamente.</Typography>}
        filters={[{ key: "tipo", label: "Tipo", options: opts(TIPOS_SEGURO) }, { key: "status", label: "Situação", options: opts(["VIGENTE", "RENOVADO", "CANCELADO", "ENCERRADO"]) }]}
        columns={[
          { label: "Apólice", primary: true, render: (r) => <><b>{r.apolice}</b><Typography variant="caption" component="div" color="text.secondary">{r.tipo.replace(/_/g, " ").toLowerCase()} · {r.seguradora}</Typography></> },
          { label: "Prêmio", render: (r) => `${fmtMoney(r.premio)} / ${r.premioPeriodicidade.toLowerCase()}` }, { label: "Limite", hideOnMobile: true, render: (r) => fmtMoney(r.limiteTotal) },
          { label: "Vigência até", render: (r) => fmtDate(r.vigenciaFim) }, { label: "Prazo", render: (r) => (r.status === "VIGENTE" ? <AlertaChip alerta={r.alerta} /> : "—") },
          { label: "Sinistros", render: (r) => r._count?.sinistros ?? 0 }, { label: "Situação", render: (r) => <Status value={r.status} /> },
        ]}
        rowActions={(r) => [
          { label: "Sinistros", onClick: () => setSin(r) },
          { label: "Renovar (nova apólice)", show: r.status === "VIGENTE", onClick: () => setDlg({ kind: "renovar", row: r }) },
          { label: "Cancelar apólice", color: "error", show: r.status === "VIGENTE", onClick: () => setDlg({ kind: "cancelar", row: r }) },
        ]} />}
      {sin && <Sinistros seguro={sin} onClose={() => { setSin(null); setRev((x) => x + 1); }} />}
      <PromptDialog open={dlg?.kind === "renovar"} title="Renovar apólice" onClose={() => setDlg(null)}
        intro={<Alert severity="info" sx={{ mb: 2 }}>A apólice atual passa a “renovada”, os riscos vinculados migram para a nova e os alertas são reagendados.</Alert>}
        fields={[{ key: "apolice", label: "Nº da nova apólice", required: true }, { key: "vigenciaInicio", label: "Início", type: "date", required: true }, { key: "vigenciaFim", label: "Fim", type: "date", required: true }, { key: "premio", label: "Novo prêmio (R$)", type: "number" }, { key: "limiteTotal", label: "Novo limite (R$)", type: "number" }]}
        onSubmit={async (b) => { await call("POST", `${J}/seguros/${dlg!.row.id}/renovar`, b); setRev((x) => x + 1); }} />
      <PromptDialog open={dlg?.kind === "cancelar"} title="Cancelar apólice" onClose={() => setDlg(null)} fields={[{ key: "motivo", label: "Motivo", type: "textarea", required: true }]}
        onSubmit={async (b) => { await call("POST", `${J}/seguros/${dlg!.row.id}/cancelar`, b); setRev((x) => x + 1); }} />
    </>
  );
}
