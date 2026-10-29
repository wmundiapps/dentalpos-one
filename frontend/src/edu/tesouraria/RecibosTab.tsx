import { Alert, Box, Button, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { FormDialog } from "../desempenho/kit";
import { Async, Situacao, Stat, StatGrid, Sub, TES, brl, erroCompleto, fmtDate, fmtDateTime, imprimirHtml, label, num, useApi, useMotivo, useToast } from "./tes";

export default function RecibosTab() {
  const [key, setKey] = useState(0);
  const [novo, setNovo] = useState(false);
  const gestao = useApi<any>(`${TES}/recibos/gestao?_=${key}`);
  const toast = useToast();
  const motivo = useMotivo();
  const reload = () => setKey((k) => k + 1);

  async function imprimir(r: any, segunda = false) {
    try {
      const det = segunda ? await eduApi.post(`${TES}/recibos/${r.id}/segunda-via`, { motivo: "Reimpressão solicitada pelo pagador" }) : await eduApi.get(`${TES}/recibos/${r.id}`);
      imprimirHtml(det.documento.html, `Recibo ${r.rotulo}`);
      if (segunda) { toast.ok(`2ª via nº ${det.vias} registrada.`); reload(); }
    } catch (e: any) { toast.err(erroCompleto(e)); }
  }
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Async state={gestao}>
        {(g) => (
          <>
            <StatGrid min={150}>
              <Stat label="Recibos emitidos" value={num(g.emitidos, 0)} hint={brl(g.valorEmitido)} tone="success" />
              <Stat label="Cancelados" value={num(g.cancelados, 0)} tone={g.cancelados ? "warning" : "default"} />
              <Stat label="2ªs vias" value={num(g.segundasVias, 0)} />
              <Stat label="Lacunas na numeração" value={num(g.lacunas.length, 0)} tone={g.lacunas.length ? "error" : "success"} hint={g.lacunas.slice(0, 4).map((l: any) => `${l.serie}-${String(l.numero).padStart(6, "0")}`).join(", ") || undefined} />
            </StatGrid>
            {g.lacunas.length > 0 && <Alert severity="warning">Há números de recibo ausentes na sequência. Verifique se algum foi excluído indevidamente (auditoria).</Alert>}
          </>
        )}
      </Async>
      <ListTable path={`${TES}/recibos`} refreshKey={key}
        filters={[{ key: "status", label: "Situação", options: ["EMITIDO", "CANCELADO"] }]}
        toolbar={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo(true)}>Recibo avulso</Button>}
        columns={[
          { key: "rotulo", label: "Nº", render: (r) => <b>{r.rotulo}</b> },
          { key: "emitidoEm", label: "Emissão", render: (r) => fmtDateTime(r.emitidoEm) },
          { key: "pagadorNome", label: "Pagador", render: (r) => <>{r.pagadorNome}<Sub>{r.descricao}</Sub></> },
          { key: "valor", label: "Valor", align: "right", render: (r) => <>{brl(r.valor)}<Sub>{r.forma ? label(r.forma) : ""}</Sub></> },
          { key: "vias", label: "Vias", align: "center" },
          { key: "status", label: "Situação", render: (r) => <><Situacao value={r.status} />{r.status === "CANCELADO" && <Sub>{fmtDate(r.canceladoEm)} · {r.motivoCancelamento}</Sub>}</> },
        ]}
        actions={(r) => (
          <>
            <Button size="small" onClick={() => imprimir(r)}>Imprimir</Button>
            {r.status === "EMITIDO" && <Button size="small" onClick={() => imprimir(r, true)}>2ª via</Button>}
            {r.status === "EMITIDO" && <Button size="small" color="error" onClick={async () => { const m = await motivo.ask(`Cancelar recibo ${r.rotulo}`); if (!m) return; try { await eduApi.post(`${TES}/recibos/${r.id}/cancelar`, { motivo: m }); toast.ok("Recibo cancelado (o recebimento não é estornado)."); reload(); } catch (e: any) { toast.err(erroCompleto(e)); } }}>Cancelar</Button>}
          </>
        )} />
      <Typography variant="caption" color="text.secondary">Os recibos de mensalidade são emitidos automaticamente ao registrar o recebimento (série e numeração por instituição). Cancelar um recibo não estorna o recebimento.</Typography>
      <FormDialog open={novo} title="Recibo avulso" onClose={() => setNovo(false)}
        fields={[
          { key: "pagadorNome", label: "Pagador", required: true }, { key: "pagadorDocumento", label: "CPF/CNPJ" },
          { key: "valor", label: "Valor (R$)", type: "number", required: true }, { key: "forma", label: "Forma", type: "select", options: ["PIX", "BOLETO", "CARTAO", "DINHEIRO", "TRANSFERENCIA"] },
          { key: "descricao", label: "Referente a", required: true, full: true },
        ]}
        onSubmit={async (b) => { const r = await eduApi.post(`${TES}/recibos`, b); toast.ok(`Recibo ${r.rotulo} emitido.`); reload(); }} />
      {toast.node}{motivo.node}
    </Box>
  );
}
