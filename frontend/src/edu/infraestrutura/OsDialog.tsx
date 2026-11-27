import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, IconButton, TextField, Typography } from "@mui/material";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import { useState } from "react";
import { StatusChip } from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import { Async, Light, Stat, StatGrid, Tag, brl, fmtDate, fmtDateTime, label, useApi, useToast } from "./kit";

export const SLA_TONE: Record<string, "success" | "warning" | "error" | "default"> = { NO_PRAZO: "success", EM_RISCO: "warning", VENCIDO: "error", CUMPRIDO: "success", DESCUMPRIDO: "error" };

export default function OsDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const st = useApi<any>(`/infraestrutura/ordens-servico/${id}`);
  const toast = useToast();
  const [peca, setPeca] = useState({ descricao: "", quantidade: "1", valorUnitario: "0" });
  const [custo, setCusto] = useState("");
  const [solucao, setSolucao] = useState("");
  const refresh = () => { st.reload(); onChanged(); };

  async function toggleItem(os: any, item: any, feito: boolean) {
    await toast.run(() => eduApi.patch(`/infraestrutura/ordens-servico/${os.id}/checklist`, { itens: [{ item: item.item, feito }] }), "Checklist atualizado.", refresh);
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Ordem de serviço</DialogTitle>
      <DialogContent dividers>
        <Async state={st}>
          {(os) => {
            const encerrada = ["CONCLUIDA", "CANCELADA"].includes(os.status);
            const checklist: any[] = Array.isArray(os.checklist) ? os.checklist : [];
            return (
              <Box sx={{ display: "grid", gap: 2 }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>{os.numero} — {os.titulo}</Typography>
                  {os.descricao ? <Typography variant="body2" color="text.secondary">{os.descricao}</Typography> : null}
                  <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap", alignItems: "center" }}>
                    <StatusChip value={os.status} /><Tag text={label(os.tipo)} /><Tag text={`Prioridade ${label(os.prioridade)}`} tone={os.prioridade === "URGENTE" ? "error" : os.prioridade === "ALTA" ? "warning" : "default"} />
                    <Light tone={SLA_TONE[os.sla] || "default"} text={`SLA ${label(os.sla)} · prazo ${fmtDateTime(os.prazoSla)}`} />
                  </Box>
                </Box>
                <StatGrid min={140}>
                  <Stat label="Aberta em" value={fmtDate(os.abertaEm)} />
                  <Stat label="Mão de obra" value={brl(os.custoMaoObra)} />
                  <Stat label="Peças" value={brl(os.custoPecas)} />
                  <Stat label="Custo total" value={brl(os.custoTotal)} />
                </StatGrid>
                {os.solucao ? <Alert severity="success">Solução aplicada: {os.solucao}</Alert> : null}
                <Divider />
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Checklist de execução</Typography>
                {checklist.map((c) => (
                  <FormControlLabel key={c.item} disabled={encerrada} control={<Checkbox checked={!!c.feito} onChange={(e) => toggleItem(os, c, e.target.checked)} />}
                    label={<span>{c.item}{c.obrigatorio ? <Tag text="obrigatório" tone="warning" /> : null}</span>} />
                ))}
                {!checklist.length && <Typography variant="body2" color="text.secondary">Esta OS não possui checklist.</Typography>}
                <Divider />
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Peças e materiais</Typography>
                {(os.pecas || []).map((p: any) => (
                  <Box key={p.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography sx={{ flex: 1 }}>{p.descricao} — {p.quantidade} × {brl(p.valorUnitario)}</Typography>
                    {!encerrada && <IconButton size="small" onClick={() => toast.run(() => eduApi.del(`/infraestrutura/ordens-servico/${os.id}/pecas/${p.id}`), "Peça removida.", refresh, "Remover esta peça?")}><DeleteOutlinedIcon fontSize="small" /></IconButton>}
                  </Box>
                ))}
                {!(os.pecas || []).length && <Typography variant="body2" color="text.secondary">Nenhuma peça lançada.</Typography>}
                {!encerrada && (
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                    <TextField size="small" label="Descrição" value={peca.descricao} onChange={(e) => setPeca({ ...peca, descricao: e.target.value })} sx={{ flex: 1, minWidth: 180 }} />
                    <TextField size="small" label="Qtd" type="number" value={peca.quantidade} onChange={(e) => setPeca({ ...peca, quantidade: e.target.value })} sx={{ width: 90 }} />
                    <TextField size="small" label="Valor unit. (R$)" type="number" value={peca.valorUnitario} onChange={(e) => setPeca({ ...peca, valorUnitario: e.target.value })} sx={{ width: 140 }} />
                    <Button variant="outlined" onClick={() => toast.run(() => eduApi.post(`/infraestrutura/ordens-servico/${os.id}/pecas`, { descricao: peca.descricao, quantidade: Number(peca.quantidade), valorUnitario: Number(peca.valorUnitario) }), "Peça lançada.", () => { setPeca({ descricao: "", quantidade: "1", valorUnitario: "0" }); refresh(); })}>Adicionar</Button>
                  </Box>
                )}
                {!encerrada && (
                  <>
                    <Divider />
                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Custos e solução</Typography>
                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                      <TextField size="small" label="Mão de obra (R$)" type="number" value={custo} onChange={(e) => setCusto(e.target.value)} sx={{ width: 170 }} />
                      <TextField size="small" label="Solução aplicada" value={solucao} onChange={(e) => setSolucao(e.target.value)} sx={{ flex: 1, minWidth: 220 }} />
                      <Button variant="outlined" onClick={() => toast.run(() => eduApi.patch(`/infraestrutura/ordens-servico/${os.id}`, { ...(custo ? { custoMaoObra: Number(custo) } : {}), ...(solucao ? { solucao } : {}) }), "OS atualizada.", refresh)}>Salvar</Button>
                    </Box>
                  </>
                )}
              </Box>
            );
          }}
        </Async>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      {toast.node}
    </Dialog>
  );
}
