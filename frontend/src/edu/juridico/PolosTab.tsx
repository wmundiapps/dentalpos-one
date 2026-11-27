import { Alert, Chip, Typography } from "@mui/material";
import { useState } from "react";
import { AlertaChip, API, COLORS, DataList, J, Kpi, KpiRow, LoadBox, PromptDialog, ResourceTab, Section, Status, call, fmtDate, fmtMoney, itemsOf, opts, useApi, type FormField } from "./kit";

const COMISSAO = ["PERCENTUAL_MENSALIDADE", "VALOR_POR_ALUNO", "FIXO_MENSAL", "MISTO", "NENHUM"];

async function abrirMinuta(id: string) {
  const res = await fetch(`${API}/edu${J}/contratos-polo/${id}/minuta`, { headers: { Authorization: `Bearer ${localStorage.getItem("dentalpos.token") || ""}` } });
  if (!res.ok) throw new Error(`Erro ${res.status} ao gerar a minuta.`);
  window.open(URL.createObjectURL(new Blob([await res.text()], { type: "text/html;charset=utf-8" })), "_blank");
}

/** patrimônio cedido: uma linha por bem, no formato "descrição | tombamento | valor | estado". */
const patrimonioParaTexto = (arr: any[]) => (arr || []).map((b) => [b.descricao, b.tombamento ?? "", b.valor ?? "", b.estado ?? ""].join(" | ")).join("\n");
const textoParaPatrimonio = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
  const [descricao, tombamento, valor, estado] = l.split("|").map((x) => x.trim());
  return { descricao, ...(tombamento ? { tombamento } : {}), ...(valor && !Number.isNaN(Number(valor.replace(",", "."))) ? { valor: Number(valor.replace(",", ".")) } : {}), ...(estado ? { estado } : {}) };
});

export default function PolosTab() {
  const [rev, setRev] = useState(0);
  const [dlg, setDlg] = useState<null | { kind: "renovar" | "rescindir"; row: any }>(null);
  const sit = useApi<any>(`${J}/polos/situacao`, [rev]);
  const polos = useApi<any>(`/modalidades/polos?pageSize=200`);
  const poloOpts = itemsOf(polos.data).map((p: any) => ({ value: p.id, label: `${p.codigo} — ${p.nome}` }));
  const FIELDS: FormField[] = [
    { key: "poloId", label: "Polo EAD", type: "select", required: true, options: poloOpts, helper: "Polos cadastrados em Modalidades, EAD e pós" },
    { key: "gestorNome", label: "Gestor do polo", required: true }, { key: "gestorDoc", label: "CPF/CNPJ do gestor" }, { key: "gestorEmail", label: "E-mail" }, { key: "gestorTelefone", label: "Telefone" },
    { key: "objeto", label: "Objeto", type: "textarea" }, { key: "condicoes", label: "Condições gerais (horários, estrutura mínima...)", type: "textarea" },
    { key: "patrimonioTexto", label: "Patrimônio cedido (uma linha por bem: descrição | tombamento | valor | estado)", type: "textarea" },
    { key: "direitosInstituicao", label: "Direitos da instituição", type: "textarea" }, { key: "deveresInstituicao", label: "Deveres da instituição", type: "textarea" },
    { key: "direitosGestor", label: "Direitos do gestor", type: "textarea" }, { key: "deveresGestor", label: "Deveres do gestor", type: "textarea" },
    { key: "comissionamentoTipo", label: "Comissionamento", type: "select", options: opts(COMISSAO) }, { key: "comissionamentoPercentual", label: "% sobre mensalidades", type: "number" },
    { key: "comissionamentoValor", label: "Valor (R$) fixo ou por aluno", type: "number" }, { key: "comissionamentoObs", label: "Observações do comissionamento", type: "textarea" },
    { key: "vigenciaInicio", label: "Início", type: "date", required: true }, { key: "vigenciaFim", label: "Fim (vencimento)", type: "date", required: true }, { key: "prazoMeses", label: "Prazo (meses)", type: "number" },
    { key: "renovacaoAutomatica", label: "Renovação automática", type: "bool" }, { key: "avisoPrevioDias", label: "Aviso prévio (dias)", type: "number" },
    { key: "rescisaoCondicoes", label: "Condições de rescisão", type: "textarea" }, { key: "multaRescisoria", label: "Multa rescisória" },
  ];
  const resumo = sit.data?.resumo;
  return (
    <>
      <Section title="Situação contratual dos polos EAD">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Cruza os polos de “Modalidades, EAD e pós” com o contrato vigente do gestor. Comissão estimada considera os alunos ativos vinculados ao polo.</Typography>
        <LoadBox loading={sit.loading} error={sit.error} empty={!itemsOf(sit.data).length} emptyText="Nenhum polo cadastrado em Modalidades." onRetry={sit.reload}>
          {resumo && <KpiRow>
            <Kpi title="Regulares" value={resumo.regulares} color={COLORS.ok} /><Kpi title="Vencendo (90 d)" value={resumo.vencendo} color={resumo.vencendo ? COLORS.warn : COLORS.ok} />
            <Kpi title="Contrato vencido" value={resumo.vencidos} color={resumo.vencidos ? COLORS.bad : COLORS.ok} /><Kpi title="Sem contrato" value={resumo.semContrato} color={resumo.semContrato ? COLORS.bad : COLORS.ok} />
          </KpiRow>}
          <DataList rows={itemsOf(sit.data).map((s: any) => ({ ...s, id: s.polo.id }))} columns={[
            { label: "Polo", primary: true, render: (s: any) => <><b>{s.polo.nome}</b><Typography variant="caption" component="div" color="text.secondary">{s.polo.codigo} · {s.polo.cidade ?? ""}/{s.polo.uf ?? ""}</Typography></> },
            { label: "Credenciamento", render: (s: any) => <Status value={s.polo.statusCredenciamento} /> },
            { label: "Contrato", render: (s: any) => (s.situacao === "SEM_CONTRATO" ? <Chip size="small" color="error" label="sem contrato" /> : <>{s.contratoVigente.gestorNome} <AlertaChip alerta={s.alerta} /></>) },
            { label: "Alunos ativos", render: (s: any) => s.alunosAtivos },
            { label: "Comissão estimada", render: (s: any) => (s.comissao ? (s.comissao.valorMensal === null ? <Typography variant="caption">{s.comissao.nota}</Typography> : fmtMoney(s.comissao.valorMensal)) : "—") },
            { label: "Avisos", hideOnMobile: false, render: (s: any) => (s.avisos.length ? <Typography variant="caption" color="error">{s.avisos.join(" ")}</Typography> : "—") },
          ]} />
        </LoadBox>
      </Section>
      <ResourceTab title="Contratos com gestores de polo" path="/contratos-polo" fields={FIELDS} editFields={FIELDS.filter((f) => f.key !== "poloId")} vencimento newLabel="Novo contrato de polo" anexoRef="ContratoPolo" refreshKey={rev}
        intro={<Alert severity="info" sx={{ mb: 2 }}>Para ativar, o contrato precisa ter direitos e deveres das partes, condições de rescisão e o comissionamento definido. A minuta é um <b>modelo</b> a ser revisado por advogado.</Alert>}
        filters={[{ key: "status", label: "Situação", options: opts(["RASCUNHO", "VIGENTE", "ENCERRADO", "RESCINDIDO"]) }]}
        toBody={(b) => { const { patrimonioTexto, ...rest } = b; return { ...rest, ...(patrimonioTexto !== undefined ? { patrimonioCedido: textoParaPatrimonio(String(patrimonioTexto)) } : {}) }; }}
        fromRow={(r) => ({ patrimonioTexto: patrimonioParaTexto(r.patrimonioCedido) })}
        columns={[
          { label: "Contrato", primary: true, render: (r) => <><b>{r.gestorNome}</b><Typography variant="caption" component="div" color="text.secondary">{r.codigo} · polo {poloOpts.find((o) => o.value === r.poloId)?.label ?? r.poloId.slice(0, 8)}</Typography></> },
          { label: "Comissão", render: (r) => `${r.comissionamentoTipo.replace(/_/g, " ").toLowerCase()}${r.comissionamentoPercentual != null ? ` ${r.comissionamentoPercentual}%` : ""}${r.comissionamentoValor != null ? ` ${fmtMoney(r.comissionamentoValor)}` : ""}` },
          { label: "Patrimônio cedido", hideOnMobile: true, render: (r) => `${(r.patrimonioCedido || []).length} bem(ns)` },
          { label: "Vigência", render: (r) => `${fmtDate(r.vigenciaInicio)} a ${fmtDate(r.vigenciaFim)}` }, { label: "Prazo", render: (r) => (r.status === "VIGENTE" ? <AlertaChip alerta={r.alerta} /> : "—") }, { label: "Situação", render: (r) => <Status value={r.status} /> },
        ]}
        rowActions={(r, { run }) => [
          { label: "Gerar minuta (modelo)", onClick: () => { void run(() => abrirMinuta(r.id), "Minuta aberta em nova aba."); } },
          { label: "Ativar", show: r.status === "RASCUNHO", onClick: () => { void run(async () => { await call("POST", `${J}/contratos-polo/${r.id}/ativar`); setRev((x) => x + 1); }, "Contrato ativado."); } },
          { label: "Renovar", show: r.status === "VIGENTE", onClick: () => setDlg({ kind: "renovar", row: r }) },
          { label: "Encerrar", show: r.status === "VIGENTE", onClick: () => { void run(async () => { await call("POST", `${J}/contratos-polo/${r.id}/encerrar`); setRev((x) => x + 1); }, "Contrato encerrado.", "Encerrar o contrato do polo?"); } },
          { label: "Rescindir", color: "error", show: r.status === "VIGENTE", onClick: () => setDlg({ kind: "rescindir", row: r }) },
        ]} />
      <PromptDialog open={dlg?.kind === "renovar"} title="Renovar contrato do polo" onClose={() => setDlg(null)} fields={[{ key: "novaVigenciaFim", label: "Nova data final", type: "date", required: true }]}
        onSubmit={async (b) => { await call("POST", `${J}/contratos-polo/${dlg!.row.id}/renovar`, b); setRev((x) => x + 1); }} />
      <PromptDialog open={dlg?.kind === "rescindir"} title="Rescindir contrato do polo" onClose={() => setDlg(null)}
        intro={<Alert severity="warning" sx={{ mb: 2 }}>Confira o patrimônio cedido, a situação dos alunos do polo e a comunicação aos órgãos reguladores antes de rescindir.</Alert>}
        fields={[{ key: "motivo", label: "Motivo", type: "textarea", required: true }, { key: "data", label: "Data", type: "date" }]}
        onSubmit={async (b) => { await call("POST", `${J}/contratos-polo/${dlg!.row.id}/rescindir`, b); setRev((x) => x + 1); }} />
    </>
  );
}
