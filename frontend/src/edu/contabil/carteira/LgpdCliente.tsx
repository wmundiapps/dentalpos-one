import { Alert, Box, Button, Typography } from "@mui/material";
import { useState } from "react";
import { Async, FormDialog, Panel, Tabela, Tag, fmtDate, fmtDateTime, useApi, useToast } from "./host";
import { api, baixar, ehContador, ehGestao, hojeIso, usePrompt } from "./kit";

const P = "/contabil/carteira";
const BASES: Record<string, string> = { EXECUCAO_CONTRATO: "Execução de contrato", OBRIGACAO_LEGAL: "Obrigação legal/regulatória", CONSENTIMENTO: "Consentimento", LEGITIMO_INTERESSE: "Legítimo interesse", EXERCICIO_DIREITOS: "Exercício regular de direitos" };

/** LGPD por cliente: base legal, registro de acessos, dados do titular, anonimização e exclusão com confirmação. */
export default function LgpdCliente({ c, reload }: { c: any; reload: () => void }) {
  const st = useApi<any>(`${P}/clientes/${c.id}/lgpd`);
  const ac = useApi<any>(ehGestao() ? `${P}/clientes/${c.id}/lgpd/acessos?pageSize=15` : null);
  const [base, setBase] = useState(false);
  const toast = useToast();
  const pr = usePrompt();

  const exportar = async () => {
    const r = await api.get(`/clientes/${c.id}/lgpd/exportar`);
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" })); a.download = `dados-do-titular-${c.id.slice(0, 8)}.json`; a.click();
  };
  const anonimizar = async () => {
    const motivo = await pr.ask("Anonimizar este cliente? Ação irreversível", { dica: "Informe o motivo (ex.: solicitação do titular).", min: 5 });
    if (!motivo) return;
    const conf = await pr.ask("Confirmação", { exato: "ANONIMIZAR" });
    if (conf !== "ANONIMIZAR") return;
    await toast.run(() => api.post(`/clientes/${c.id}/lgpd/anonimizar`, { confirmacao: "ANONIMIZAR", motivo }), "Cliente anonimizado.", reload);
  };
  const excluir = async () => {
    const motivo = await pr.ask("Excluir definitivamente? Ação irreversível", { dica: "Informe o motivo.", min: 5 });
    if (!motivo) return;
    const conf = await pr.ask("Confirmação", { exato: "EXCLUIR" });
    if (conf !== "EXCLUIR") return;
    await toast.run(() => api.post(`/clientes/${c.id}/lgpd/excluir`, { confirmacao: "EXCLUIR", motivo }), "Cliente excluído.", () => window.location.assign("/edu/contabil/carteira?aba=clientes"));
  };

  return (
    <>
      <Async state={st}>{(d) => (
        <Panel title="Tratamento de dados pessoais" actions={ehContador() && !c.anonimizadoEm ? <Button size="small" onClick={() => setBase(true)}>Registrar base legal</Button> : null}>
          {c.anonimizadoEm ? <Alert severity="info" sx={{ mb: 1 }}>Cliente anonimizado em {fmtDate(c.anonimizadoEm)}. Contratos e honorários foram mantidos (obrigação legal), sem identificar o titular.</Alert> : null}
          <Typography variant="body2">Base legal: <b>{d.baseLegal ? BASES[d.baseLegal] : "não registrada"}</b>{d.consentimentoEm ? ` · consentimento em ${fmtDate(d.consentimentoEm)}` : ""}</Typography>
          {d.consentimentoObs ? <Typography variant="caption" color="text.secondary">{d.consentimentoObs}</Typography> : null}
          <Typography variant="body2" sx={{ mt: 1 }}>Retenção: <b>{d.retencao.anos} ano(s)</b> após o encerramento. {d.retencao.detalhe}</Typography>
          {ehGestao() && !c.anonimizadoEm ? (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 2 }}>
              <Button size="small" variant="outlined" onClick={() => toast.run(exportar, "Dados do titular exportados (registrado no log).")}>Exportar dados do titular (JSON)</Button>
              <Button size="small" color="warning" variant="outlined" onClick={anonimizar}>Anonimizar…</Button>
              <Button size="small" color="error" variant="outlined" onClick={excluir}>Excluir definitivamente…</Button>
            </Box>
          ) : null}
          {!ehGestao() ? <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>Exportação, anonimização e exclusão são feitas pela gestão do escritório.</Typography> : null}
        </Panel>
      )}</Async>
      {ehGestao() ? (
        <Panel title="Registro de acessos aos dados pessoais" subtitle="Quem consultou, baixou ou exportou dados deste cliente." sx={{ mt: 2 }}>
          <Async state={ac}>{(d) => <Tabela rows={d.items} vazio="Sem registros." cols={[{ h: "Quando", r: (r: any) => fmtDateTime(r.em) }, { h: "Quem", r: (r: any) => r.userNome || "—" }, { h: "Ação", r: (r: any) => <Tag text={r.acao.replace(/_/g, " ")} /> }, { h: "Detalhe", r: (r: any) => r.detalhe || "—" }]} />}</Async>
        </Panel>
      ) : null}
      <FormDialog open={base} title="Base legal (LGPD, art. 7º)" fields={[{ key: "baseLegal", label: "Base legal", type: "select", required: true, options: Object.entries(BASES).map(([value, label]) => ({ value, label })) }, { key: "consentimentoEm", label: "Data do consentimento (se aplicável)", type: "date", def: hojeIso() }, { key: "consentimentoObs", label: "Observação", type: "textarea" }]}
        initial={st.data ? { baseLegal: st.data.baseLegal, consentimentoEm: st.data.consentimentoEm, consentimentoObs: st.data.consentimentoObs } : null} onClose={() => setBase(false)} onSubmit={async (b) => { await api.put(`/clientes/${c.id}/lgpd`, b); toast.ok("Base legal registrada."); st.reload(); }} />
      {toast.node}{pr.node}
    </>
  );
}
