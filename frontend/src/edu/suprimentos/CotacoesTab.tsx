import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { useState } from "react";
import { StatusChip } from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { Async, FormDialog, Stat, StatGrid, Tag, brl, fmtDate, label, num, useApi, useToast, type Field } from "../infraestrutura/kit";
import { useAlmoxarifados } from "./lookups";

const bestSx = { bgcolor: "success.light", color: "success.contrastText", fontWeight: 800 } as const;

function Mapa({ row, onClose, onChanged }: { row: any; onClose: () => void; onChanged: () => void }) {
  const st = useApi<any>(`/suprimentos/cotacoes/${row.id}/mapa`);
  const [prop, setProp] = useState<any | null>(null);
  const [enc, setEnc] = useState(false);
  const [ped, setPed] = useState(false);
  const almox = useAlmoxarifados();
  const toast = useToast();
  const after = () => { st.reload(); onChanged(); };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle sx={{ fontWeight: 800 }}>Mapa comparativo — {row.numero}</DialogTitle>
      <DialogContent dividers>
        <Async state={st}>
          {(m) => {
            const aberta = m.cotacao?.status === "ABERTA";
            const fornecedores: any[] = m.fornecedores || [];
            const linha = (id: string) => (m.linhas || []).find((l: any) => l.fornecedorId === id);
            const nome = (id: string) => fornecedores.find((f) => f.id === id)?.razaoSocial || id;
            const completos = (m.linhas || []).filter((l: any) => l.cobreTodos).map((l: any) => ({ value: l.fornecedorId, label: nome(l.fornecedorId) }));
            const propostaFields = (): Field[] => [
              { key: "frete", label: "Frete (R$)", type: "number", def: 0 }, { key: "prazoEntregaDias", label: "Prazo de entrega (dias)", type: "number" }, { key: "parcelas", label: "Parcelas", type: "number", def: 1 },
              { key: "validadeProposta", label: "Validade da proposta", type: "date" },
              ...(m.itens || []).map((i: any): Field => ({ key: `p_${i.id}`, label: `Preço unit. — ${i.descricao} (${num(i.quantidade, 2)} ${i.unidade || ""})`, type: "number", required: true })),
              { key: "observacao", label: "Observação", type: "textarea" },
            ];
            return (
              <Box sx={{ display: "grid", gap: 2 }}>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                  <StatusChip value={m.cotacao?.status} /><Tag text={`Critério: ${label(m.cotacao?.criterio)}`} />
                  {m.semProposta && <Tag text="Nenhuma proposta recebida" tone="warning" />}
                </Box>
                <StatGrid min={150}>
                  <Stat label="Referência" value={brl(m.referencia)} hint="Estimado ou média das propostas" />
                  <Stat label="Melhor total" value={brl(m.totalVencedor)} tone="success" />
                  <Stat label="Economia" value={brl(m.economia)} tone={m.economia > 0 ? "success" : "default"} />
                  <Stat label="Soma dos menores preços" value={brl(m.totalMelhorPorItem)} hint="Se comprasse item a item" />
                </StatGrid>
                <Box sx={{ overflowX: "auto" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 800 }}>Item</TableCell>
                        {fornecedores.map((f) => (
                          <TableCell key={f.id} align="right" sx={{ fontWeight: 800, minWidth: 140 }}>
                            {f.razaoSocial}
                            {m.vencedor === f.id && <Box><Chip size="small" color="success" icon={<EmojiEventsIcon />} label="Vencedor" /></Box>}
                            {!linha(f.id) && <Box><Chip size="small" label="Sem resposta" /></Box>}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(m.itens || []).map((i: any) => (
                        <TableRow key={i.id}>
                          <TableCell>{i.descricao} <Typography component="span" variant="caption" color="text.secondary">× {num(i.quantidade, 2)}</Typography></TableCell>
                          {fornecedores.map((f) => {
                            const p = linha(f.id)?.precos?.[i.id];
                            const best = m.melhorPorItem?.[i.id]?.fornecedorId === f.id;
                            return <TableCell key={f.id} align="right" sx={best ? bestSx : undefined}>{p == null ? "—" : brl(p)}</TableCell>;
                          })}
                        </TableRow>
                      ))}
                      <TableRow><TableCell>Frete</TableCell>{fornecedores.map((f) => <TableCell key={f.id} align="right">{linha(f.id) ? brl(linha(f.id).frete) : "—"}</TableCell>)}</TableRow>
                      <TableRow><TableCell sx={{ fontWeight: 800 }}>Total</TableCell>{fornecedores.map((f) => { const l = linha(f.id); return <TableCell key={f.id} align="right" sx={{ fontWeight: 800 }}>{l ? brl(l.total) : "—"}{l && !l.cobreTodos && <Box><Tag text="parcial" tone="warning" /></Box>}</TableCell>; })}</TableRow>
                      <TableRow><TableCell>Prazo de entrega</TableCell>{fornecedores.map((f) => <TableCell key={f.id} align="right">{linha(f.id)?.prazoEntregaDias != null ? `${linha(f.id).prazoEntregaDias} dia(s)` : "—"}</TableCell>)}</TableRow>
                      <TableRow><TableCell>Nota do fornecedor</TableCell>{fornecedores.map((f) => <TableCell key={f.id} align="right">{f.avaliacaoMedia ? `${num(f.avaliacaoMedia)} / 5` : "—"}</TableCell>)}</TableRow>
                      <TableRow><TableCell>Pontuação ({label(m.cotacao?.criterio)})</TableCell>{fornecedores.map((f) => <TableCell key={f.id} align="right">{linha(f.id)?.cobreTodos ? num(linha(f.id).score, 3) : "—"}</TableCell>)}</TableRow>
                      {aberta && <TableRow><TableCell />{fornecedores.map((f) => <TableCell key={f.id} align="right"><Button size="small" onClick={() => setProp(f)}>{linha(f.id) ? "Editar proposta" : "Lançar proposta"}</Button></TableCell>)}</TableRow>}
                    </TableBody>
                  </Table>
                </Box>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  {aberta && <Button variant="contained" color="success" disabled={!completos.length} onClick={() => setEnc(true)}>Encerrar e escolher vencedor</Button>}
                  {aberta && <Button color="error" onClick={() => toast.run(() => eduApi.post(`/suprimentos/cotacoes/${row.id}/cancelar`, {}), "Cotação cancelada.", () => { after(); onClose(); }, "Cancelar esta cotação? A requisição volta para APROVADA.")}>Cancelar cotação</Button>}
                  {m.cotacao?.status === "ENCERRADA" && <Button variant="contained" onClick={() => setPed(true)}>Gerar pedido de compra</Button>}
                </Box>
                <FormDialog open={!!prop} title={`Proposta — ${prop?.razaoSocial || ""}`} fields={propostaFields()} onClose={() => setProp(null)}
                  onSubmit={async (b) => {
                    const precos = (m.itens || []).filter((i: any) => b[`p_${i.id}`] !== undefined).map((i: any) => ({ requisicaoItemId: i.id, precoUnitario: b[`p_${i.id}`] }));
                    const { frete, prazoEntregaDias, parcelas, validadeProposta, observacao } = b;
                    await eduApi.put(`/suprimentos/cotacoes/${row.id}/propostas/${prop.id}`, { frete: frete ?? 0, prazoEntregaDias, parcelas: parcelas ?? 1, validadeProposta, observacao, precos });
                    toast.ok("Proposta registrada."); after();
                  }} />
                <FormDialog open={enc} title="Encerrar cotação" submitLabel="Encerrar" onClose={() => setEnc(false)}
                  initial={{ fornecedorId: m.vencedor }}
                  fields={[{ key: "fornecedorId", label: "Fornecedor escolhido", type: "select", options: completos, required: true, helper: "Só fornecedores com proposta completa" }, { key: "justificativa", label: "Justificativa (obrigatória se diferente do vencedor sugerido)", type: "textarea" }]}
                  onSubmit={async (b) => { await eduApi.post(`/suprimentos/cotacoes/${row.id}/encerrar`, b); toast.ok("Cotação encerrada."); after(); }} />
                <FormDialog open={ped} title="Gerar pedido de compra" submitLabel="Gerar pedido" onClose={() => setPed(false)}
                  fields={[{ key: "almoxarifadoId", label: "Almoxarifado de destino", type: "select", options: almox }, { key: "previsaoEntrega", label: "Previsão de entrega", type: "date" }, { key: "parcelas", label: "Parcelas", type: "number", def: 1 }, { key: "intervaloParcelasDias", label: "Intervalo entre parcelas (dias)", type: "number", def: 30 }]}
                  onSubmit={async (b) => { await eduApi.post(`/suprimentos/cotacoes/${row.id}/gerar-pedido`, b); toast.ok("Pedido gerado. Veja a aba Pedidos."); after(); }} />
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

export default function CotacoesTab() {
  const [key, setKey] = useState(0);
  const [open, setOpen] = useState<any | null>(null);
  return (
    <Box>
      <ListTable path="/suprimentos/cotacoes" refreshKey={key} searchable={false}
        filters={[{ key: "status", label: "Situação", options: ["ABERTA", "ENCERRADA", "CANCELADA"] }]}
        columns={[
          { key: "numero", label: "Cotação" }, { key: "criterio", label: "Critério", render: (r) => label(r.criterio) },
          { key: "propostas", label: "Respostas", render: (r) => `${(r.propostas || []).filter((p: any) => p.respondeu).length}/${(r.propostas || []).length}` },
          { key: "prazoResposta", label: "Prazo", render: (r) => fmtDate(r.prazoResposta) }, { key: "valorEscolhido", label: "Valor escolhido", align: "right", render: (r) => brl(r.valorEscolhido) },
          { key: "economia", label: "Economia", align: "right", render: (r) => (r.economia ? <Tag text={brl(r.economia)} tone="success" /> : "—") }, { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> },
        ]}
        actions={(r) => <Button size="small" variant="outlined" onClick={() => setOpen(r)}>Mapa comparativo</Button>} />
      {open && <Mapa row={open} onClose={() => setOpen(null)} onChanged={() => setKey((k) => k + 1)} />}
    </Box>
  );
}
