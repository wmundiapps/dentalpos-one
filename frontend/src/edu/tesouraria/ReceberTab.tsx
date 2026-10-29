import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useEffect, useState } from "react";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { FormDialog } from "../desempenho/kit";
import { FORMAS_RECEBIMENTO, Light, Situacao, Sub, TES, brl, dataISO, erroCompleto, fmtDate, imprimirHtml, isoDia, itemsOf, label, useContas, useToast } from "./tes";

function ReceberDialog({ rec, onClose, onDone }: { rec: any; onClose: () => void; onDone: () => void }) {
  const { contas } = useContas();
  const [permutas, setPermutas] = useState<any[]>([]);
  const [forma, setForma] = useState("PIX");
  const [contaId, setContaId] = useState("");
  const [data, setData] = useState(isoDia(0));
  const [desconto, setDesconto] = useState("0");
  const [encargos, setEncargos] = useState(!!rec.encargosSugeridos);
  const [recibo, setRecibo] = useState(true);
  const [permutaId, setPermutaId] = useState("");
  const [obs, setObs] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { eduApi.get(`${TES}/permutas?status=APROVADA&sentido=RECEBER&pageSize=100`).then((r) => setPermutas(itemsOf(r))).catch(() => setPermutas([])); }, []);
  const lista = forma === "DINHEIRO" ? contas.filter((c) => c.tipo === "CAIXA") : contas;
  const enc = rec.encargosSugeridos;
  const prevEnc = encargos && enc ? enc.multa + enc.juros : 0;
  const prevTotal = Math.max(0, rec.valorDevido - (Number(desconto) || 0) + prevEnc);

  async function go() {
    setBusy(true); setErr(null);
    try {
      const r = await eduApi.post(`${TES}/recebiveis/${rec.id}/receber`, {
        forma, contaId: forma === "PERMUTA" ? undefined : contaId || undefined, data: dataISO(data), desconto: Number(desconto) || 0,
        aplicarEncargos: encargos, emitirRecibo: recibo, permutaId: forma === "PERMUTA" ? permutaId || undefined : undefined, observacao: obs || undefined,
      });
      onDone();
      if (r?.recibo) {
        const det = await eduApi.get(`${TES}/recibos/${r.recibo.id}`).catch(() => null);
        if (det?.documento?.html && window.confirm(`Recibo ${r.recibo.rotulo} emitido. Imprimir agora?`)) imprimirHtml(det.documento.html, `Recibo ${r.recibo.rotulo}`);
      }
      onClose();
    } catch (e: any) { setErr(erroCompleto(e)); } finally { setBusy(false); }
  }
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800 }}>Receber — {rec.descricao}</DialogTitle>
      <DialogContent dividers>
        {err ? <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert> : null}
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          {rec.aluno?.nomeCompleto} · vence {fmtDate(rec.dataVencimento)} · original <b>{brl(rec.valor)}</b>
          {rec.ajuste && rec.ajuste.bolsaValor > 0 ? <> · bolsa <b>-{brl(rec.ajuste.bolsaValor)}</b> ({rec.ajuste.programaNome})</> : null}
          {rec.ajuste && rec.ajuste.descontoValor > 0 ? <> · desconto <b>-{brl(rec.ajuste.descontoValor)}</b></> : null}
          {" "}· devido <b>{brl(rec.valorDevido)}</b>
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
          <TextField select size="small" label="Forma de recebimento" value={forma} onChange={(e) => { setForma(e.target.value); setContaId(""); }}>
            {FORMAS_RECEBIMENTO.map((f) => <MenuItem key={f} value={f}>{label(f)}</MenuItem>)}
          </TextField>
          {forma === "PERMUTA" ? (
            <TextField select size="small" label="Permuta aprovada" value={permutaId} onChange={(e) => setPermutaId(e.target.value)} helperText={permutas.length ? "O valor equivalente deve ser igual ao valor a receber." : "Nenhuma permuta APROVADA (cadastre e aprove em Permutas e Bolsas)."}>
              {permutas.map((p) => <MenuItem key={p.id} value={p.id}>{p.numero} — {p.parteNome} — {brl(p.valorEquivalente)}</MenuItem>)}
            </TextField>
          ) : (
            <TextField select size="small" label={forma === "DINHEIRO" ? "Caixa de destino" : "Conta de destino"} value={contaId} onChange={(e) => setContaId(e.target.value)}>
              {lista.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
            </TextField>
          )}
          <TextField size="small" type="date" label="Data do recebimento" value={data} onChange={(e) => setData(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="number" label="Desconto adicional (R$)" value={desconto} onChange={(e) => setDesconto(e.target.value)} />
          <TextField size="small" label="Observação" value={obs} onChange={(e) => setObs(e.target.value)} sx={{ gridColumn: { sm: "1 / -1" } }} />
        </Box>
        {enc ? <FormControlLabel control={<Checkbox checked={encargos} onChange={(e) => setEncargos(e.target.checked)} />} label={`Cobrar encargos de ${enc.dias} dia(s) de atraso: multa ${brl(enc.multa)} + juros ${brl(enc.juros)}`} /> : null}
        <FormControlLabel control={<Checkbox checked={recibo} onChange={(e) => setRecibo(e.target.checked)} />} label="Emitir recibo numerado" />
        <Typography variant="h6" sx={{ fontWeight: 800, mt: 1 }}>Total a receber: {brl(prevTotal)}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button variant="contained" onClick={go} disabled={busy || (forma === "PERMUTA" ? !permutaId : !contaId)}>Confirmar recebimento</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function ReceberTab() {
  const [key, setKey] = useState(0);
  const [rec, setRec] = useState<any | null>(null);
  const [gerar, setGerar] = useState(false);
  const [novo, setNovo] = useState(false);
  const [desc, setDesc] = useState<any | null>(null);
  const toast = useToast();
  const reload = () => setKey((k) => k + 1);

  return (
    <Box>
      <ListTable path={`${TES}/recebiveis`} refreshKey={key}
        filters={[{ key: "status", label: "Situação", options: ["PENDENTE", "ATRASADO", "PAGO", "CANCELADO"] }]}
        toolbar={
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setGerar(true)}>Gerar mensalidades</Button>
            <Button onClick={() => setNovo(true)}>Novo recebível</Button>
            <Button onClick={() => toast.run(() => eduApi.post(`${TES}/recebiveis/aplicar-bolsas`, {}), "Bolsas reaplicadas nas mensalidades em aberto.", reload, "Reaplicar as bolsas vigentes em todas as mensalidades em aberto?")}>Aplicar bolsas</Button>
          </Box>
        }
        columns={[
          { key: "aluno", label: "Aluno", render: (r) => <><b>{r.aluno?.nomeCompleto || r.studentId}</b><Sub>{r.aluno?.ra}</Sub></> },
          { key: "descricao", label: "Descrição" },
          { key: "dataVencimento", label: "Vencimento", render: (r) => <Light tone={r.status === "ATRASADO" ? "error" : r.status === "PAGO" ? "success" : "default"} text={fmtDate(r.dataVencimento)} /> },
          { key: "valor", label: "Original", align: "right", render: (r) => brl(r.valor) },
          { key: "ajuste", label: "Bolsa / desconto", align: "right", render: (r) => r.ajuste ? <>{r.ajuste.bolsaValor > 0 && <div>-{brl(r.ajuste.bolsaValor)} <Sub>{r.ajuste.programaNome}</Sub></div>}{r.ajuste.descontoValor > 0 && <div>-{brl(r.ajuste.descontoValor)} <Sub>{r.ajuste.descontoMotivo}</Sub></div>}{r.ajuste.conferencia === "DIVERGENTE" && <Situacao value="DIVERGENTE" />}</> : "—" },
          { key: "valorDevido", label: "A receber", align: "right", render: (r) => <b>{brl(r.valorDevido)}</b> },
          { key: "status", label: "Situação", render: (r) => <Situacao value={r.status} /> },
        ]}
        actions={(r) => (
          ["PENDENTE", "ATRASADO"].includes(r.status) ? (
            <>
              <Button size="small" color="success" onClick={() => setRec(r)}>Receber</Button>
              <Button size="small" onClick={() => setDesc(r)}>Desconto</Button>
            </>
          ) : r.recebimento ? <Sub>{label(r.recebimento.forma)} · {fmtDate(r.recebimento.data)}</Sub> : null
        )} />
      {rec && <ReceberDialog rec={rec} onClose={() => setRec(null)} onDone={() => { toast.ok("Recebimento registrado."); reload(); }} />}
      <FormDialog open={gerar} title="Gerar mensalidades (carnê)" submitLabel="Gerar" onClose={() => setGerar(false)}
        intro={<Alert severity="info" sx={{ mb: 2 }}>A bolsa vigente do aluno (módulo Apoio ao Estudante) é aplicada automaticamente em cada parcela.</Alert>}
        initial={{ quantidadeParcelas: 6, diaVencimento: 10, descricaoBase: "Mensalidade", primeiroVencimento: isoDia(10) }}
        fields={[
          { key: "studentId", label: "Aluno", type: "student", required: true, full: true },
          { key: "valorParcela", label: "Valor da parcela (R$)", type: "number", required: true },
          { key: "quantidadeParcelas", label: "Quantidade de parcelas", type: "number", required: true },
          { key: "diaVencimento", label: "Dia de vencimento (1-28)", type: "number", required: true },
          { key: "primeiroVencimento", label: "1º vencimento", type: "date", required: true },
          { key: "descricaoBase", label: "Descrição", required: true },
        ]}
        onSubmit={async (b) => { const r = await eduApi.post(`${TES}/recebiveis/gerar-mensalidades`, b); toast.ok(`${r.parcelasGeradas} parcela(s) gerada(s); ${r.comBolsa} com bolsa aplicada.`); reload(); }} />
      <FormDialog open={novo} title="Novo recebível avulso" onClose={() => setNovo(false)}
        initial={{ dataVencimento: isoDia(10) }}
        fields={[
          { key: "studentId", label: "Aluno", type: "student", required: true, full: true },
          { key: "descricao", label: "Descrição", required: true, full: true, helper: "Use 'Mensalidade' ou 'Parcela' no texto para aplicar a bolsa automaticamente." },
          { key: "valor", label: "Valor (R$)", type: "number", required: true },
          { key: "dataVencimento", label: "Vencimento", type: "date", required: true },
        ]}
        onSubmit={async (b) => { await eduApi.post(`${TES}/recebiveis`, b); toast.ok("Recebível criado."); reload(); }} />
      <FormDialog open={!!desc} title={`Desconto manual — ${desc?.descricao ?? ""}`} onClose={() => setDesc(null)}
        fields={[
          { key: "percentual", label: "Desconto (%)", type: "number" },
          { key: "valor", label: "Desconto fixo (R$)", type: "number" },
          { key: "motivo", label: "Motivo (obrigatório, auditado)", required: true, full: true },
        ]}
        onSubmit={async (b) => { await eduApi.put(`${TES}/recebiveis/${desc.id}/desconto`, { percentual: b.percentual ?? 0, valor: b.valor ?? 0, motivo: b.motivo }); toast.ok("Desconto aplicado."); reload(); }} />
      {toast.node}
    </Box>
  );
}
