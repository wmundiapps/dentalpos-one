import { Typography } from "@mui/material";
import { useState } from "react";
import { AlertaChip, J, ResourceTab, Status, call, fmtDate, fmtMoney, opts, PromptDialog, type FormField } from "./kit";

export const TIPOS_CONTRATO = ["PRESTACAO_SERVICOS", "FORNECIMENTO", "TRABALHO", "PARCERIA", "CONVENIO", "COOPERACAO", "TECNOLOGIA", "OUTRO"];
const INDICES = ["IPCA", "IGPM", "INPC", "FIXO", "NENHUM"];

const FIELDS: FormField[] = [
  { key: "tipo", label: "Tipo", type: "select", required: true, options: opts(TIPOS_CONTRATO) },
  { key: "objeto", label: "Objeto", required: true, full: true }, { key: "contraparteNome", label: "Contraparte", required: true }, { key: "contraparteDoc", label: "CPF/CNPJ da contraparte" },
  { key: "valor", label: "Valor (R$)", type: "number" }, { key: "periodicidade", label: "Periodicidade", type: "select", options: opts(["MENSAL", "ANUAL", "UNICO", "POR_DEMANDA"]) },
  { key: "indiceReajuste", label: "Índice de reajuste", type: "select", options: opts(INDICES) }, { key: "reajusteMes", label: "Mês do reajuste (1-12)", type: "number" },
  { key: "dataAssinatura", label: "Data de assinatura", type: "date" }, { key: "vigenciaInicio", label: "Início da vigência", type: "date", required: true }, { key: "vigenciaFim", label: "Fim da vigência", type: "date" },
  { key: "renovacaoAutomatica", label: "Renovação automática", type: "bool" }, { key: "avisoPrevioDias", label: "Aviso prévio (dias)", type: "number" },
  { key: "multaRescisoria", label: "Multa rescisória" }, { key: "garantias", label: "Garantias" }, { key: "responsavelNome", label: "Responsável interno" }, { key: "observacoes", label: "Observações", type: "textarea" },
];

export default function ContratosTab() {
  const [dlg, setDlg] = useState<null | { kind: "renovar" | "rescindir"; row: any }>(null);
  const [rev, setRev] = useState(0);
  return (
    <>
      <ResourceTab title="Contratos" path="/contratos" fields={FIELDS} vencimento newLabel="Novo contrato" anexoRef="Contrato" refreshKey={rev}
        intro={<Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Prestação de serviços, fornecimento, trabalho, parcerias e convênios. O contrato nasce como rascunho; ao ativar, os alertas de vencimento (90/60/30 dias) são agendados.</Typography>}
        filters={[{ key: "tipo", label: "Tipo", options: opts(TIPOS_CONTRATO) }, { key: "status", label: "Situação", options: opts(["RASCUNHO", "VIGENTE", "ENCERRADO", "RESCINDIDO"]) }]}
        columns={[
          { label: "Contrato", primary: true, render: (r) => <><b>{r.objeto}</b><Typography variant="caption" component="div" color="text.secondary">{r.codigo} · {r.tipo.replace(/_/g, " ")}</Typography></> },
          { label: "Contraparte", render: (r) => r.contraparteNome }, { label: "Valor", render: (r) => fmtMoney(r.valor) },
          { label: "Vigência até", render: (r) => fmtDate(r.vigenciaFim) }, { label: "Prazo", render: (r) => (r.status === "VIGENTE" ? <AlertaChip alerta={r.alerta} /> : "—") },
          { label: "Renova", hideOnMobile: true, render: (r) => (r.renovacaoAutomatica ? "automática" : "manual") }, { label: "Situação", render: (r) => <Status value={r.status} /> },
        ]}
        rowActions={(r, { run }) => [
          { label: "Ativar", show: r.status === "RASCUNHO", onClick: () => { void run(() => call("POST", `${J}/contratos/${r.id}/ativar`), "Contrato ativado."); } },
          { label: "Renovar / prorrogar", show: r.status === "VIGENTE", onClick: () => setDlg({ kind: "renovar", row: r }) },
          { label: "Encerrar", show: r.status === "VIGENTE", onClick: () => { void run(() => call("POST", `${J}/contratos/${r.id}/encerrar`), "Contrato encerrado.", "Encerrar o contrato ao término normal?"); } },
          { label: "Rescindir", color: "error", show: r.status === "VIGENTE", onClick: () => setDlg({ kind: "rescindir", row: r }) },
        ]} />
      <PromptDialog open={dlg?.kind === "renovar"} title="Renovar / prorrogar contrato" onClose={() => setDlg(null)}
        fields={[{ key: "novaVigenciaFim", label: "Nova data final", type: "date", required: true }, { key: "novoValor", label: "Novo valor (R$)", type: "number" }, { key: "descricao", label: "Descrição do aditivo", type: "textarea" }]}
        onSubmit={async (b) => { await call("POST", `${J}/contratos/${dlg!.row.id}/renovar`, b); setRev((x) => x + 1); }} />
      <PromptDialog open={dlg?.kind === "rescindir"} title="Rescindir contrato" onClose={() => setDlg(null)} fields={[{ key: "motivo", label: "Motivo da rescisão", type: "textarea", required: true }, { key: "data", label: "Data da rescisão", type: "date" }]}
        onSubmit={async (b) => { await call("POST", `${J}/contratos/${dlg!.row.id}/rescindir`, b); setRev((x) => x + 1); }} />
    </>
  );
}
