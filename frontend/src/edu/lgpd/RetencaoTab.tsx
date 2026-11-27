import { Alert, Box, Button, Chip, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useState } from "react";
import { FormDialog, LoadBox, Section, Status, call, fmtDateTime, itemsOf, useApi, useRunner, useToast } from "../desempenho/kit";

export default function RetencaoTab() {
  const [rev, setRev] = useState(0);
  const [edit, setEdit] = useState<any>(null);
  const [sim, setSim] = useState<any>(null);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const p = useApi<any>("/lgpd/retencao/politicas", [rev]);
  const alvos = useApi<any>("/lgpd/retencao/alvos");
  const ex = useApi<any>("/lgpd/retencao/execucoes?pageSize=15", [rev]);
  return (
    <>
      {node}
      <Section title="Política de retenção e expurgo" actions={<>
        <Button variant="outlined" onClick={async () => { const r = await run(() => call("POST", "/lgpd/retencao/executar", { dryRun: true }), "Simulação concluída (nada foi alterado)."); if (r?.resultados) setSim(r); }}>Simular expurgo (dry-run)</Button>
        <Button color="error" variant="contained" onClick={() => void run(() => call("POST", "/lgpd/retencao/executar", { dryRun: false, confirmar: true }), "Expurgo executado e registrado.", "Executar o expurgo de verdade (irreversível) para todas as políticas ativas?")}>Executar agora</Button></>}>
        <Alert severity={p.data?.modoJob === "EXECUCAO" ? "warning" : "info"} sx={{ mb: 2 }}>
          O job diário roda em <b>{p.data?.modoJob === "EXECUCAO" ? "EXECUÇÃO REAL" : "DRY-RUN (só registra o que faria)"}</b>. Para executar de verdade defina <code>LGPD_RETENCAO_EXECUTAR=true</code> no servidor. O expurgo <b>nunca</b> toca: {(alvos.data?.protegidosArt16 || []).join("; ")}.
        </Alert>
        {sim && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSim(null)}>
            Simulação: {sim.resultados.map((r: any) => `${r.alvo.replace(/_/g, " ")}: ${r.afetados}`).join(" · ")}
          </Alert>
        )}
        <LoadBox loading={p.loading} error={p.error} onRetry={p.reload}>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead><TableRow><TableCell>Política</TableCell><TableCell>Ação</TableCell><TableCell>Prazo</TableCell><TableCell>Mínimo</TableCell><TableCell>Última execução</TableCell><TableCell>Ativa</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>
                {(p.data?.items || []).map((i: any) => (
                  <TableRow key={i.id}>
                    <TableCell sx={{ minWidth: 260 }}><b>{i.nome}</b><Typography variant="caption" component="div" color="text.secondary">{i.descricao}</Typography><Typography variant="caption" component="div">Base: {i.baseLegal}</Typography></TableCell>
                    <TableCell>{i.acao}</TableCell><TableCell>{i.prazoMeses} meses</TableCell><TableCell>{i.minimoMeses} meses</TableCell>
                    <TableCell>{i.ultimaExecucao ? <>{fmtDateTime(i.ultimaExecucao.iniciadoEm)}<Typography variant="caption" component="div">{i.ultimaExecucao.dryRun ? "simulação" : "real"} · {i.ultimaExecucao.afetados} registros</Typography></> : "—"}</TableCell>
                    <TableCell><Chip size="small" color={i.ativa ? "success" : "default"} label={i.ativa ? "sim" : "não"} /></TableCell>
                    <TableCell><Button size="small" onClick={() => setEdit(i)}>Editar</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </LoadBox>
      </Section>
      <Section title="Registro do que foi feito">
        <LoadBox loading={ex.loading} error={ex.error} empty={!itemsOf(ex.data).length} emptyText="Nenhuma execução registrada ainda." onRetry={ex.reload}>
          {itemsOf(ex.data).map((e: any) => <Typography key={e.id} variant="body2">• {fmtDateTime(e.iniciadoEm)} — {e.alvo.replace(/_/g, " ")} · {e.acao} · corte {fmtDateTime(e.corte)} · <b>{e.afetados}</b> registros · <Status value={e.dryRun ? "SIMULACAO" : "EXECUTADO"} /> ({e.origem}){e.erro ? ` · erro: ${e.erro}` : ""}</Typography>)}
        </LoadBox>
      </Section>
      <FormDialog open={!!edit} title={`Editar: ${edit?.nome ?? ""}`} fields={[{ key: "prazoMeses", label: `Prazo (meses; mínimo ${edit?.minimoMeses ?? 1})`, type: "number", required: true }, { key: "ativa", label: "Política ativa", type: "bool" }]} initial={edit ?? {}} onClose={() => setEdit(null)} onSubmit={async (b) => { await call("PUT", `/lgpd/retencao/politicas/${edit.id}`, b); setRev((x) => x + 1); }} />
    </>
  );
}
