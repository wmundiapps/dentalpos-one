import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { StatusChip } from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { Async, SubNav, Tag, brl, fmtDate, itemsOf, label, num, useApi, useToast } from "../infraestrutura/kit";
import { abrirArquivo } from "../infraestrutura/cppKit";

const DIV_TOM: Record<string, any> = { QUANTIDADE_NOTA: "warning", EXCESSO: "warning", FALTA: "warning", VALOR: "error", QUALIDADE: "error" };

function NovaConferencia({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const peds = useApi<any>("/suprimentos/pedidos?pageSize=100");
  const [pedidoId, setPedidoId] = useState("");
  const ped = useApi<any>(pedidoId ? `/suprimentos/pedidos/${pedidoId}` : null);
  const [nf, setNf] = useState("");
  const [vNota, setVNota] = useState("");
  const [linhas, setLinhas] = useState<Record<string, any>>({});
  const [err, setErr] = useState<string | null>(null);
  const emitidos = itemsOf(peds.data).filter((p: any) => ["EMITIDO", "PARCIALMENTE_RECEBIDO"].includes(p.status));
  const set = (id: string, k: string, v: any) => setLinhas({ ...linhas, [id]: { ...(linhas[id] || {}), [k]: v } });
  async function salvar() {
    try {
      const itens = (ped.data?.itens || []).filter((i: any) => linhas[i.id]?.contada !== undefined && linhas[i.id].contada !== "").map((i: any) => {
        const l = linhas[i.id];
        return { pedidoItemId: i.id, quantidadeContada: Number(l.contada), quantidadeNota: l.nota === undefined || l.nota === "" ? undefined : Number(l.nota), precoNota: l.preco === undefined || l.preco === "" ? undefined : Number(l.preco), qualidadeOk: !l.problema, qualidadeObs: l.problema ? l.obs || "Problema de qualidade" : undefined, loteNumero: l.lote || undefined, validade: l.validade ? new Date(l.validade).toISOString() : undefined };
      });
      if (!itens.length) { setErr("Informe a quantidade contada de ao menos um item."); return; }
      await eduApi.post("/suprimentos/conferencias", { pedidoId, notaFiscal: nf || undefined, valorNota: vNota ? Number(vNota) : undefined, itens });
      onDone(); onClose();
    } catch (e: any) { setErr(e.message); }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Nova conferência de recebimento</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
          {err && <Typography color="error">{err}</Typography>}
          <TextField select size="small" label="Pedido de compra" value={pedidoId} onChange={(e) => { setPedidoId(e.target.value); setLinhas({}); }}>
            {emitidos.map((p: any) => <MenuItem key={p.id} value={p.id}>{p.numero} — {p.fornecedor?.razaoSocial} — {brl(p.valorTotal)}</MenuItem>)}
          </TextField>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
            <TextField size="small" label="Nota fiscal" value={nf} onChange={(e) => setNf(e.target.value)} /><TextField size="small" type="number" label="Valor total da nota (R$)" value={vNota} onChange={(e) => setVNota(e.target.value)} />
          </Box>
          <Async state={ped}>
            {(p) => (
              <Box sx={{ display: "grid", gap: 1.5 }}>
                {p.itens.map((i: any) => {
                  const l = linhas[i.id] || {};
                  return (
                    <Box key={i.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5, display: "grid", gap: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{i.item?.nome || i.itemId} — pedido {num(i.quantidade, 2)}, pendente {num(i.quantidade - i.quantidadeRecebida, 2)}, preço {brl(i.precoUnitario)}</Typography>
                      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1 }}>
                        <TextField size="small" type="number" label="Contada (física)" value={l.contada ?? ""} onChange={(e) => set(i.id, "contada", e.target.value)} />
                        <TextField size="small" type="number" label="Qtd. na nota" value={l.nota ?? ""} onChange={(e) => set(i.id, "nota", e.target.value)} />
                        <TextField size="small" type="number" label="Preço na nota" value={l.preco ?? ""} onChange={(e) => set(i.id, "preco", e.target.value)} />
                        <FormControlLabel control={<Checkbox checked={!!l.problema} onChange={(e) => set(i.id, "problema", e.target.checked)} />} label="Problema de qualidade" />
                        {i.item?.controlaLote && <TextField size="small" label="Lote" value={l.lote ?? ""} onChange={(e) => set(i.id, "lote", e.target.value)} />}
                        {i.item?.controlaValidade && <TextField size="small" type="date" label="Validade" value={l.validade ?? ""} onChange={(e) => set(i.id, "validade", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />}
                        {l.problema && <TextField size="small" label="Descreva o problema" value={l.obs ?? ""} onChange={(e) => set(i.id, "obs", e.target.value)} sx={{ gridColumn: { md: "span 2" } }} />}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Async>
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={!pedidoId} onClick={salvar}>Abrir conferência</Button></DialogActions>
    </Dialog>
  );
}

function Decidir({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const st = useApi<any>(`/suprimentos/conferencias/${id}`);
  const [dec, setDec] = useState<Record<string, any>>({});
  const [just, setJust] = useState("");
  const toast = useToast();
  const set = (i: string, k: string, v: any) => setDec({ ...dec, [i]: { ...(dec[i] || {}), [k]: v } });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Conferência {st.data?.numero}</DialogTitle>
      <DialogContent dividers>
        <Async state={st}>
          {(c) => (
            <Box sx={{ display: "grid", gap: 2 }}>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}><StatusChip value={c.status} />{c.temDivergencia && <Tag text="Com divergências" tone="error" />}<Typography variant="body2">Pedido {c.pedido?.numero} · {c.pedido?.fornecedor?.razaoSocial} · NF {c.notaFiscal || "—"}</Typography></Box>
              {c.itens.map((i: any) => {
                const nome = c.pedido?.itens?.find((x: any) => x.id === i.pedidoItemId)?.item?.nome || i.itemId;
                const d = dec[i.id] || {};
                const aberto = c.status === "EM_CONFERENCIA";
                return (
                  <Box key={i.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5, display: "grid", gap: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{nome}</Typography>
                    <Typography variant="body2">Pendente {num(i.quantidadePendente, 2)} · nota {i.quantidadeNota ?? "—"} · contada {num(i.quantidadeContada, 2)} · aceita {num(i.quantidadeAceita, 2)} · rejeitada {num(i.quantidadeRejeitada, 2)} · preço pedido {brl(i.precoPedido)} · preço nota {brl(i.precoNota)}</Typography>
                    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>{i.divergencias.map((x: string) => <Tag key={x} text={label(x)} tone={DIV_TOM[x]} />)}{!i.divergencias.length && <Tag text="Sem divergência" tone="success" />}{i.qualidadeObs && <Typography variant="caption">{i.qualidadeObs}</Typography>}</Box>
                    {aberto && i.divergencias.length > 0 && (
                      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1 }}>
                        <TextField select size="small" label="Decisão" value={d.decisao ?? i.decisao ?? ""} onChange={(e) => set(i.id, "decisao", e.target.value)}>{["ACEITAR", "ACEITE_PARCIAL", "RECUSAR"].map((o) => <MenuItem key={o} value={o}>{label(o)}</MenuItem>)}</TextField>
                        {(d.decisao ?? i.decisao) === "ACEITE_PARCIAL" && <TextField size="small" type="number" label="Qtd. aceita" value={d.quantidadeAceita ?? ""} onChange={(e) => set(i.id, "quantidadeAceita", e.target.value)} />}
                        <TextField select size="small" label="Destino do rejeitado" value={d.destinoRejeitado ?? i.destinoRejeitado ?? ""} onChange={(e) => set(i.id, "destinoRejeitado", e.target.value)}>{["DEVOLVER", "DESCARTAR", "AGUARDAR_REPOSICAO"].map((o) => <MenuItem key={o} value={o}>{label(o)}</MenuItem>)}</TextField>
                        <TextField size="small" label="Motivo" value={d.motivo ?? i.motivo ?? ""} onChange={(e) => set(i.id, "motivo", e.target.value)} />
                        {i.divergencias.includes("VALOR") && <FormControlLabel control={<Checkbox checked={!!(d.aceitarPrecoNota ?? i.aceitarPrecoNota)} onChange={(e) => set(i.id, "aceitarPrecoNota", e.target.checked)} />} label="Aceitar preço da nota (Financeiro)" />}
                      </Box>
                    )}
                  </Box>
                );
              })}
              {c.devolucoes?.length > 0 && <Typography variant="body2">Devoluções geradas: {c.devolucoes.map((x: any) => `${x.numero} (${num(x.quantidade, 2)})`).join(", ")}</Typography>}
              {c.status === "EM_CONFERENCIA" && <TextField size="small" label="Justificativa geral" value={just} onChange={(e) => setJust(e.target.value)} />}
            </Box>
          )}
        </Async>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => toast.run(() => abrirArquivo("GET", `/suprimentos/conferencias/${id}/relatorio`), "Aberto.")}>Imprimir</Button>
        {st.data?.status === "EM_CONFERENCIA" && <Button color="error" onClick={() => toast.run(() => eduApi.post(`/suprimentos/conferencias/${id}/cancelar`, {}), "Cancelada.", () => { onDone(); onClose(); }, "Cancelar a conferência?")}>Cancelar</Button>}
        {st.data?.status === "EM_CONFERENCIA" && <Button variant="contained" onClick={() => toast.run(() => eduApi.post(`/suprimentos/conferencias/${id}/finalizar`, { justificativa: just || undefined, decisoes: Object.entries(dec).filter(([, v]) => v.decisao).map(([itemId, v]) => ({ itemId, decisao: v.decisao, quantidadeAceita: v.quantidadeAceita ? Number(v.quantidadeAceita) : undefined, destinoRejeitado: v.destinoRejeitado || undefined, aceitarPrecoNota: v.aceitarPrecoNota, motivo: v.motivo || undefined })) }), "Conferência finalizada: entrada no estoque registrada.", () => { onDone(); onClose(); })}>Finalizar e dar entrada</Button>}
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
      {toast.node}
    </Dialog>
  );
}

export default function ConferenciaTab() {
  const [sub, setSub] = useState("conferencias");
  const [key, setKey] = useState(0);
  const [novo, setNovo] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const toast = useToast();
  const reload = () => setKey((k) => k + 1);
  return (
    <Box>
      <SubNav value={sub} onChange={setSub} items={[{ key: "conferencias", label: "Conferências" }, { key: "devolucoes", label: "Devoluções ao fornecedor" }]} />
      {sub === "conferencias" && (
        <ListTable path="/suprimentos/conferencias" refreshKey={key} searchable={false} filters={[{ key: "status", label: "Situação", options: ["EM_CONFERENCIA", "CONCLUIDA", "CANCELADA"] }]}
          toolbar={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo(true)}>Nova conferência</Button>}
          columns={[{ key: "numero", label: "Conferência" }, { key: "pedido", label: "Pedido", render: (r) => `${r.pedido?.numero || ""} · ${r.pedido?.fornecedor?.razaoSocial || ""}` }, { key: "notaFiscal", label: "NF" },
            { key: "temDivergencia", label: "Divergência", render: (r) => r.temDivergencia ? <Tag text="Sim" tone="error" /> : <Tag text="Não" tone="success" /> },
            { key: "valorConferido", label: "Valor", align: "right", render: (r) => brl(r.valorConferido) }, { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> }, { key: "createdAt", label: "Abertura", render: (r) => fmtDate(r.createdAt) }]}
          actions={(r) => <Button size="small" variant="outlined" onClick={() => setAberta(r.id)}>{r.status === "EM_CONFERENCIA" ? "Decidir/finalizar" : "Ver"}</Button>} />
      )}
      {sub === "devolucoes" && (
        <ListTable path="/suprimentos/devolucoes-fornecedor" refreshKey={key} searchable={false} filters={[{ key: "status", label: "Situação", options: ["SOLICITADA", "ENVIADA", "CREDITADA", "CANCELADA"] }]}
          columns={[{ key: "numero", label: "Devolução" }, { key: "fornecedor", label: "Fornecedor" }, { key: "item", label: "Item", render: (r) => r.item?.nome }, { key: "quantidade", label: "Qtd", align: "right" }, { key: "valor", label: "Valor", align: "right", render: (r) => brl(r.valor) }, { key: "motivo", label: "Motivo" }, { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> }]}
          actions={(r, rl) => (
            <>
              {r.status === "SOLICITADA" && <Button size="small" onClick={() => { const n = window.prompt("Nota fiscal de devolução:"); if (n) toast.run(() => eduApi.post(`/suprimentos/devolucoes-fornecedor/${r.id}/status`, { status: "ENVIADA", notaDevolucao: n }), "Marcada como enviada.", rl); }}>Enviar</Button>}
              {r.status === "ENVIADA" && <Button size="small" color="success" onClick={() => toast.run(() => eduApi.post(`/suprimentos/devolucoes-fornecedor/${r.id}/status`, { status: "CREDITADA" }), "Crédito registrado.", rl)}>Creditada</Button>}
            </>
          )} />
      )}
      {novo && <NovaConferencia onClose={() => setNovo(false)} onDone={reload} />}
      {aberta && <Decidir id={aberta} onClose={() => setAberta(null)} onDone={reload} />}
      {toast.node}
    </Box>
  );
}
