import { Alert, Button, Typography } from "@mui/material";
import { useState } from "react";
import { AD, FormDialog, LoadBox, Section, call, useApi, useRunner, useToast, type FormField } from "./kit";

const PAPEIS = ["COORDINATOR", "SECRETARY", "FINANCE", "LEGAL", "RECTOR", "BOARD", "ADMIN", "OWNER", "STAFF"];
const FIELDS: FormField[] = [
  { key: "percentualAproveitamento", label: "Aproveitamento mínimo da carga horária (%)", type: "number", required: true }, { key: "similaridadeMinima", label: "Similaridade mínima de ementa/nome (%)", type: "number", required: true },
  { key: "validadeAproveitamentoAnos", label: "Validade do aproveitamento (anos)", type: "number", required: true }, { key: "slaHoras", label: "SLA de revisão (horas)", type: "number", required: true },
  { key: "slaCriticoHoras", label: "SLA de caso crítico (horas)", type: "number", required: true }, { key: "retencaoDias", label: "Retenção dos dados pessoais após a decisão (dias)", type: "number", required: true },
  { key: "diretoriaSecretaria", label: "Diretoria da Secretaria (decide críticos)", type: "select", options: PAPEIS }, { key: "diretoriaFinanceiro", label: "Diretoria do Financeiro", type: "select", options: PAPEIS },
  { key: "diretoriaJuridico", label: "Diretoria do Jurídico", type: "select", options: PAPEIS }, { key: "notificarReitor", label: "Avisar o reitor em casos críticos", type: "bool" },
  { key: "provedor", label: "Provedor de consulta de instituições", type: "select", options: ["SIMULADO", "EMEC"], helper: "EMEC exige credenciais (ver README); sem elas o sistema usa o SIMULADO." },
];

export default function ConfigTab() {
  const [rev, setRev] = useState(0);
  const [open, setOpen] = useState(false);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const c = useApi<any>(`${AD}/config`, [rev]);
  return (
    <Section title="Configuração do agente" actions={<Button variant="contained" onClick={() => setOpen(true)}>Editar</Button>}>
      {node}
      <Alert severity="info" sx={{ mb: 2 }}>Parâmetros de equivalência, prazos (SLA), retenção de dados pessoais e quem decide casos críticos (além da reitoria/administração).</Alert>
      <LoadBox loading={c.loading} error={c.error} onRetry={c.reload}>
        {c.data && FIELDS.map((f) => <Typography key={f.key} variant="body2" sx={{ py: 0.3 }}><b>{f.label}:</b> {typeof c.data[f.key] === "boolean" ? (c.data[f.key] ? "Sim" : "Não") : String(c.data[f.key])}</Typography>)}
      </LoadBox>
      <FormDialog open={open} title="Configuração do agente" fields={FIELDS} initial={c.data || {}} onClose={() => setOpen(false)} onSubmit={async (b) => { await run(() => call("PUT", `${AD}/config`, b), "Configuração salva."); }} />
    </Section>
  );
}
