import { Alert, Button } from "@mui/material";
import { useState } from "react";
import { Btn, FormDialog, LoadBox, Section, Status, Tabela, fmtDate, itemsOf, perfil, rh, useColabs, useRh, useRunner, useToast } from "./kit";

const NIVEIS = ["ORIENTACAO", "ADVERTENCIA_VERBAL", "ADVERTENCIA_ESCRITA", "SUSPENSAO", "JUSTA_CAUSA"];

export default function AdvertenciasTab() {
  const P = perfil(); const colabs = useColabs();
  const [rev, setRev] = useState(0); const [novo, setNovo] = useState(false); const [sug, setSug] = useState<any>(null); const [ciente, setCiente] = useState<any | null>(null); const [canc, setCanc] = useState<any | null>(null);
  const { toast, node } = useToast(); const run = useRunner(toast, () => setRev((x) => x + 1));
  const l = useRh<any>("/advertencias?pageSize=100", [rev]);
  return (
    <Section title="Advertências e medidas disciplinares" actions={P.rh || P.gestor ? <Button variant="contained" onClick={() => { setSug(null); setNovo(true); }}>Registrar</Button> : undefined}>
      {node}
      <Alert severity="info" sx={{ mb: 2 }}>Escalonamento: orientação → advertência verbal → escrita → suspensão (até 30 dias) → justa causa. Pular níveis exige justificativa (RH). O colaborador dá ciência ou contesta; recusa exige testemunha. Dado disciplinar tem acesso registrado.</Alert>
      <LoadBox loading={l.loading} error={l.error} onRetry={l.reload}>
        <Tabela rows={itemsOf(l.data)} cols={[
          { h: "Data", r: (a: any) => fmtDate(a.data) }, { h: "Colaborador", r: (a: any) => a.colaboradorNome }, { h: "Nível", r: (a: any) => String(a.nivel).replace(/_/g, " ") + (a.diasSuspensao ? ` (${a.diasSuspensao} d)` : "") }, { h: "Motivo", r: (a: any) => a.motivo }, { h: "Status", r: (a: any) => <Status value={a.status} /> },
          { h: "Ação", r: (a: any) => (<>
            {a.status === "REGISTRADA" && <Btn variant="contained" onClick={() => setCiente(a)}>Dar ciência</Btn>}
            {a.status === "REGISTRADA" && P.rh && <Btn onClick={() => run(() => { const t = window.prompt("Nome da testemunha"); return t ? rh("POST", `/advertencias/${a.id}/recusa`, { testemunha: t }) : Promise.reject(new Error("Informe a testemunha.")); }, "Recusa registrada.")}>Recusou</Btn>}
            {P.rh && a.status !== "CANCELADA" && <Btn color="error" onClick={() => setCanc(a)}>Cancelar</Btn>}</>) },
        ]} />
      </LoadBox>
      <FormDialog open={novo} title="Registrar advertência" intro={sug ? <Alert severity="info" sx={{ mb: 2 }}>Nível sugerido: <b>{String(sug.sugerido).replace(/_/g, " ")}</b> ({sug.historico12m} registro(s) em 12 meses).</Alert> : undefined}
        onValues={(v) => { if (v.colaboradorId && sug?.id !== v.colaboradorId) rh("GET", `/advertencias/sugestao?colaboradorId=${v.colaboradorId}`).then((r) => setSug({ ...r, id: v.colaboradorId })).catch(() => undefined); }}
        fields={[{ key: "colaboradorId", label: "Colaborador", type: "select", required: true, options: colabs.opts }, { key: "nivel", label: "Nível", type: "select", required: true, options: NIVEIS }, { key: "diasSuspensao", label: "Dias de suspensão", type: "number", hidden: (v) => v.nivel !== "SUSPENSAO" }, { key: "motivo", label: "Motivo", required: true }, { key: "descricao", label: "Descrição dos fatos", type: "textarea", required: true }, { key: "justificativaSalto", label: "Justificativa para pular nível (falta grave)", type: "textarea" }]}
        initial={{ nivel: "ORIENTACAO" }} onClose={() => setNovo(false)} onSubmit={(b) => run(() => rh("POST", "/advertencias", b), "Registro criado; o colaborador será notificado.")} />
      <FormDialog open={!!ciente} title="Ciência do registro disciplinar" intro={<Alert severity="info" sx={{ mb: 2 }}>{ciente?.descricao}</Alert>} fields={[{ key: "contestacao", label: "Contestação (opcional) — se preenchida, o registro fica como contestado", type: "textarea" }]} submitLabel="Registrar ciência" onClose={() => setCiente(null)} onSubmit={(b) => run(() => rh("POST", `/advertencias/${ciente.id}/ciencia`, b), "Ciência registrada.")} maxWidth="sm" />
      <FormDialog open={!!canc} title="Cancelar registro" fields={[{ key: "motivo", label: "Motivo (mín. 10 caracteres)", type: "textarea", required: true }]} onClose={() => setCanc(null)} onSubmit={(b) => run(() => rh("POST", `/advertencias/${canc.id}/cancelar`, b), "Registro cancelado.")} maxWidth="sm" />
    </Section>
  );
}
