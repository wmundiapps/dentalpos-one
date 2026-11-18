import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Step, StepLabel, Stepper, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useState } from "react";
import EduShell from "../../edu/EduShell";
import { eduApi } from "../../services/EduApi";
import { Section, Stat, StateBox, useLoad, useToast } from "../../edu/admissoes/common";
import { FormDialog, dth } from "../../edu/operacao/ui";

export default function EduComprasRastreio() {
  const { data, loading, error, reload } = useLoad<any>("/compras-rastreio/pedidos");
  const { setMsg, node } = useToast();
  const [sel, setSel] = useState<any>(null);
  const [resp, setResp] = useState("");
  const [obs, setObs] = useState("");
  const [dest, setDest] = useState(false);
  const pedidos: any[] = data?.pedidos ?? [];
  const aberto = sel ? pedidos.find((p) => p.id === sel) : null;
  const run = async (fn: () => Promise<any>, ok: string) => { try { await fn(); setMsg({ type: "success", text: ok }); reload(); } catch (e: any) { setMsg({ type: "error", text: e.message }); } };
  return (
    <EduShell title="Acompanhamento de compras" subtitle="Cada compra do pedido até o setor que solicitou: chegada, conferência, entrada no sistema, saída para entrega e recebimento, sempre com o responsável de cada etapa.">
      <StateBox loading={loading} error={error} onRetry={reload} empty={!pedidos.length} emptyText="Nenhum pedido de compra emitido ainda.">
        <Stack direction="row" gap={2} flexWrap="wrap" sx={{ mb: 3 }}>
          <Stat label="Pedidos acompanhados" value={pedidos.length} /><Stat label="Em andamento" value={pedidos.filter((p) => !p.concluido).length} />
          <Stat label="Atrasados" value={pedidos.filter((p) => p.atrasado).length} color="#B91C1C" /><Stat label="Entregues ao setor" value={pedidos.filter((p) => p.concluido).length} color="#15803D" />
        </Stack>
        <Section title="Pedidos e produtos">
          <Table size="small"><TableHead><TableRow><TableCell>Pedido</TableCell><TableCell>Produtos</TableCell><TableCell>Fornecedor</TableCell><TableCell>Setor de destino</TableCell><TableCell>Onde está agora</TableCell><TableCell>Próxima etapa / responsável</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>{pedidos.map((p) => (<TableRow key={p.id}><TableCell>{p.numero}</TableCell><TableCell sx={{ maxWidth: 260 }}>{p.produtos.slice(0, 3).join(", ")}{p.produtos.length > 3 ? ` +${p.produtos.length - 3}` : ""}</TableCell><TableCell>{p.fornecedor}</TableCell><TableCell>{p.departamento ?? <Chip size="small" color="warning" label="Definir destino" />}</TableCell>
              <TableCell><Chip size="small" color={p.concluido ? "success" : p.atrasado ? "error" : "info"} label={p.etapaAtual} /></TableCell><TableCell>{p.proximaEtapa ? `${p.proximaEtapa.rotulo} — ${p.proximaEtapa.previstoResponsavel ?? "responsável a definir"}` : "Concluído"}</TableCell>
              <TableCell><Button size="small" onClick={() => { setSel(p.id); setResp(p.proximaEtapa?.previstoResponsavel ?? ""); setObs(""); }}>Acompanhar</Button></TableCell></TableRow>))}</TableBody></Table>
        </Section>
      </StateBox>
      <Dialog open={!!aberto} onClose={() => setSel(null)} fullWidth maxWidth="md">
        <DialogTitle>{aberto?.numero} — {aberto?.fornecedor}</DialogTitle>
        <DialogContent dividers>
          {aberto && (<Stack gap={2}>
            <Typography><b>Produtos:</b> {aberto.produtos.join(", ")}</Typography>
            <Typography><b>Destino:</b> {aberto.departamento ?? "não definido"}{aberto.solicitante ? ` · solicitante: ${aberto.solicitante}` : ""}</Typography>
            {!aberto.departamento && <Alert severity="warning" action={<Button size="small" onClick={() => setDest(true)}>Definir</Button>}>Informe o setor de destino e os responsáveis de cada etapa.</Alert>}
            <Stepper orientation="vertical" activeStep={aberto.jornada.findIndex((j: any) => !j.feito)}>
              {aberto.jornada.map((j: any) => (<Step key={j.etapa} completed={j.feito}><StepLabel optional={<Typography variant="caption">{j.feito ? `${j.responsavel} · ${dth(j.em)}${j.observacao ? ` · ${j.observacao}` : ""}` : j.previstoResponsavel ? `Responsável previsto: ${j.previstoResponsavel}` : ""}</Typography>}>{j.rotulo}</StepLabel></Step>))}
            </Stepper>
            {aberto.proximaEtapa && <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { md: "1fr 1fr" } }}><TextField size="small" label={`Responsável: ${aberto.proximaEtapa.rotulo}`} value={resp} onChange={(e) => setResp(e.target.value)} /><TextField size="small" label="Observação" value={obs} onChange={(e) => setObs(e.target.value)} /></Box>}
          </Stack>)}
        </DialogContent>
        <DialogActions><Button onClick={() => setSel(null)}>Fechar</Button>{aberto?.departamento && <Button onClick={() => setDest(true)}>Editar destino</Button>}{aberto?.proximaEtapa && <Button variant="contained" disabled={!resp.trim()} onClick={() => run(() => eduApi.post(`/compras-rastreio/pedidos/${aberto.id}/etapa`, { etapa: aberto.proximaEtapa.etapa, responsavel: resp, observacao: obs }), "Etapa registrada.").then(() => setResp(""))}>Registrar etapa</Button>}</DialogActions>
      </Dialog>
      <FormDialog open={dest} title="Destino e responsáveis" onClose={() => setDest(false)} inicial={{ departamento: aberto?.departamento ?? "", solicitante: aberto?.solicitante ?? "", ...Object.fromEntries((aberto?.jornada ?? []).map((j: any) => [`r_${j.etapa}`, j.previstoResponsavel ?? ""])) }}
        campos={[{ k: "departamento", label: "Setor que solicitou (destino)", required: true }, { k: "solicitante", label: "Solicitante" }, ...(data?.etapas ?? []).filter((e: any) => e.etapa !== "EMITIDO").map((e: any) => ({ k: `r_${e.etapa}`, label: `Responsável — ${e.rotulo}` }))]}
        onSave={async (v) => { const responsaveis: Record<string, string> = {}; Object.entries(v).forEach(([k, x]) => { if (k.startsWith("r_") && x) responsaveis[k.slice(2)] = String(x); }); await run(() => eduApi.put(`/compras-rastreio/pedidos/${aberto.id}/destino`, { departamento: v.departamento, solicitante: v.solicitante, responsaveis }), "Destino salvo."); setDest(false); }} />
      {node}
    </EduShell>
  );
}
