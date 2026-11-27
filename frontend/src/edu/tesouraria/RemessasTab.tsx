import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DownloadIcon from "@mui/icons-material/Download";
import { useEffect, useState } from "react";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { Async, AvisoSimulado, Situacao, Stat, StatGrid, Sub, TES, baixarArquivo, brl, comReauth, erroCompleto, fmtDate, fmtDateTime, isoDia, label, useApi, useContas, useMotivo, useToast } from "./tes";

function NovaRemessa({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { contas } = useContas();
  const bancos = contas.filter((c) => c.tipo !== "CAIXA");
  const [contaId, setContaId] = useState("");
  const [tipo, setTipo] = useState("CNAB240");
  const [data, setData] = useState(isoDia(0));
  const [sel, setSel] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const conta = contaId || bancos[0]?.value || "";
  const el = useApi<any>(conta ? `${TES}/remessas/elegiveis?contaId=${conta}` : null);
  const lista: any[] = (el.data?.items || []).filter((t: any) => (tipo === "PIX_LOTE" ? t.formaPagamento === "PIX" : true));
  useEffect(() => { setSel(lista.map((t) => t.id)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [el.data, tipo]);
  const total = lista.filter((t) => sel.includes(t.id)).reduce((a, t) => a + t.valorLiquido, 0);
  async function go() {
    setErr(null);
    try { await eduApi.post(`${TES}/remessas`, { contaId: conta, tipo, dataPagamento: new Date(`${data}T12:00:00`).toISOString(), tituloIds: sel }); onDone(); onClose(); } catch (e: any) { setErr(erroCompleto(e)); }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Gerar remessa de pagamentos</DialogTitle>
      <DialogContent dividers>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr 1fr" }, gap: 1.5, mb: 2 }}>
          <TextField select size="small" label="Conta pagadora" value={conta} onChange={(e) => setContaId(e.target.value)}>{bancos.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}</TextField>
          <TextField select size="small" label="Arquivo" value={tipo} onChange={(e) => setTipo(e.target.value)}><MenuItem value="CNAB240">CNAB 240 (Febraban)</MenuItem><MenuItem value="PIX_LOTE">Pix em lote (CSV)</MenuItem></TextField>
          <TextField size="small" type="date" label="Data do pagamento" value={data} onChange={(e) => setData(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Títulos autorizados disponíveis ({lista.length})</Typography>
        <Async state={el}>
          {() => (
            <Box sx={{ maxHeight: 340, overflowY: "auto" }}>
              {lista.map((t) => (
                <Box key={t.id} sx={{ display: "flex", gap: 1, alignItems: "center", py: 0.5, borderBottom: 1, borderColor: "divider", flexWrap: "wrap" }}>
                  <Checkbox size="small" checked={sel.includes(t.id)} onChange={(e) => setSel(e.target.checked ? [...sel, t.id] : sel.filter((x) => x !== t.id))} />
                  <Box sx={{ flex: 1, minWidth: 180 }}><Typography variant="body2" sx={{ fontWeight: 700 }}>{t.numero} — {t.fornecedor}</Typography><Sub>{label(t.formaPagamento)} · vence {fmtDate(t.vencimento)}</Sub></Box>
                  {!t.integridadeOk && <Situacao value="DIVERGENTE" />}
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{brl(t.valorLiquido)}</Typography>
                </Box>
              ))}
              {!lista.length && <Typography color="text.secondary" sx={{ py: 2 }}>Nenhum título autorizado para esta conta/tipo.</Typography>}
            </Box>
          )}
        </Async>
        <Typography variant="h6" sx={{ fontWeight: 800, mt: 1 }}>{sel.length} título(s) · {brl(total)}</Typography>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={!sel.length} onClick={go}>Gerar arquivo</Button></DialogActions>
    </Dialog>
  );
}

function Detalhe({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const st = useApi<any>(`${TES}/remessas/${id}`);
  const toast = useToast();
  const motivo = useMotivo();
  const [ret, setRet] = useState("");
  async function acao(fn: () => Promise<any>, ok: (r: any) => string) {
    try { const r = await fn(); toast.ok(ok(r)); st.reload(); onChanged(); } catch (e: any) { toast.err(erroCompleto(e)); }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Remessa</DialogTitle>
      <DialogContent dividers>
        <Async state={st}>
          {(r) => (
            <Box sx={{ display: "grid", gap: 2 }}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>Nº {r.numero}</Typography><Situacao value={r.status} />
                <Typography variant="body2">{label(r.tipo)} · {r.nomeArquivo}</Typography>
              </Box>
              <StatGrid min={140}>
                <Stat label="Itens" value={r.qtd} /><Stat label="Valor total" value={brl(r.valorTotal)} /><Stat label="Pagamento em" value={fmtDate(r.dataPagamento)} />
                <Stat label="Protocolo" value={r.protocolo || "—"} hint={r.enviadaEm ? fmtDateTime(r.enviadaEm) : undefined} />
              </StatGrid>
              <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>SHA-256 do arquivo: {r.hash}</Typography>
              <Box sx={{ overflowX: "auto" }}>
                {r.itens.map((i: any) => (
                  <Box key={i.id} sx={{ display: "flex", gap: 1.5, py: 0.5, borderBottom: 1, borderColor: "divider", flexWrap: "wrap", alignItems: "center" }}>
                    <Typography variant="caption" sx={{ minWidth: 130, fontFamily: "monospace" }}>{i.idPagamento}</Typography>
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 160 }}>{i.titulo?.numero} — {i.titulo?.fornecedor}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{brl(i.valor)}</Typography>
                    <Situacao value={i.status === "INCLUIDO" ? "PENDENTE" : i.status === "PAGO" ? "PAGO" : "REJEITADO"} />
                    {i.motivo && <Typography variant="caption" color="error">{i.motivo}</Typography>}
                  </Box>
                ))}
              </Box>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button startIcon={<DownloadIcon />} onClick={() => baixarArquivo(r.nomeArquivo, r.conteudo, r.tipo === "PIX_LOTE" ? "text/csv;charset=utf-8" : "text/plain;charset=latin1")}>Baixar arquivo</Button>
                {r.status === "GERADA" && <Button variant="contained" onClick={() => acao(() => comReauth((x) => eduApi.post(`${TES}/remessas/${id}/enviar`, x)), (x) => (x.simulado ? "Remessa enviada ao banco simulado (nenhum pagamento real)." : "Remessa enviada."))}>Enviar ao banco</Button>}
                {r.status === "GERADA" && <Button color="error" onClick={async () => { const m = await motivo.ask("Cancelar remessa"); if (m) acao(() => eduApi.post(`${TES}/remessas/${id}/cancelar`, { motivo: m }), () => "Remessa cancelada; títulos liberados."); }}>Cancelar</Button>}
                {r.status === "ENVIADA" && <Button variant="contained" color="success" onClick={() => acao(() => eduApi.post(`${TES}/remessas/${id}/consultar-retorno`, {}), (x) => `Retorno: ${x.pagos} pago(s), ${x.rejeitados} rejeitado(s).`)}>Consultar retorno no banco</Button>}
              </Box>
              {r.status === "ENVIADA" && (
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Retorno manual</Typography>
                  <Typography variant="caption" color="text.secondary">Cole o arquivo de retorno CNAB 240 ou linhas “idPagamento;PAGO|REJEITADO;motivo”.</Typography>
                  <TextField fullWidth multiline minRows={3} size="small" value={ret} onChange={(e) => setRet(e.target.value)} sx={{ my: 1 }} slotProps={{ htmlInput: { style: { fontFamily: "monospace", fontSize: 12 } } }} />
                  <Button disabled={ret.trim().length < 10} onClick={() => acao(() => eduApi.post(`${TES}/remessas/${id}/retorno`, { conteudo: ret }), (x) => `Retorno processado: ${x.pagos} pago(s), ${x.rejeitados} rejeitado(s).`)}>Processar retorno</Button>
                </Box>
              )}
            </Box>
          )}
        </Async>
        {toast.node}{motivo.node}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

export default function RemessasTab() {
  const [key, setKey] = useState(0);
  const [nova, setNova] = useState(false);
  const [det, setDet] = useState<string | null>(null);
  const toast = useToast();
  const reload = () => setKey((k) => k + 1);
  return (
    <Box>
      <AvisoSimulado />
      <ListTable path={`${TES}/remessas`} refreshKey={key} searchable={false}
        filters={[{ key: "status", label: "Situação", options: ["GERADA", "ENVIADA", "PROCESSADA", "ERRO", "CANCELADA"] }]}
        toolbar={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setNova(true)}>Gerar remessa</Button>}
        columns={[
          { key: "numero", label: "Nº", render: (r) => <b>{r.numero}</b> }, { key: "tipo", label: "Arquivo", render: (r) => <>{label(r.tipo)}<Sub>{r.nomeArquivo}</Sub></> },
          { key: "dataPagamento", label: "Pagamento", render: (r) => fmtDate(r.dataPagamento) }, { key: "qtd", label: "Itens", align: "center" },
          { key: "valorTotal", label: "Valor", align: "right", render: (r) => brl(r.valorTotal) }, { key: "provedor", label: "Provedor" },
          { key: "status", label: "Situação", render: (r) => <Situacao value={r.status} /> },
        ]}
        actions={(r) => <Button size="small" onClick={() => setDet(r.id)}>Abrir</Button>} />
      {nova && <NovaRemessa onClose={() => setNova(false)} onDone={() => { toast.ok("Remessa gerada. Revise e envie ao banco."); reload(); }} />}
      {det && <Detalhe id={det} onClose={() => setDet(null)} onChanged={reload} />}
      {toast.node}
    </Box>
  );
}
