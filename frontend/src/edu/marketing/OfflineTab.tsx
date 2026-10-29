import { Alert, Box, Dialog, DialogActions, DialogContent, DialogTitle, Button, Typography } from "@mui/material";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { FormDialog, Lista, LoadBox, M, Section, Status, call, fmtDate, fmtMoney, label, opts, useApi, useToast } from "./kit";

const TIPOS = ["RADIO", "TV", "OUTDOOR", "PANFLETAGEM", "JORNAL", "EVENTO_PRESENCIAL", "CARRO_DE_SOM", "OUTRO"];
function Qr({ url }: { url: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => { QRCode.toDataURL(url, { width: 220, margin: 1 }).then(setSrc).catch(() => setSrc("")); }, [url]);
  return src ? <img src={src} alt={`QR code para ${url}`} width={220} height={220} /> : null;
}

export default function OfflineTab() {
  const [ins, setIns] = useState<any>(null);
  const [qr, setQr] = useState<any>(null);
  const [rev, setRev] = useState(0);
  const { toast, node } = useToast();
  const rel = useApi<any>(`${M}/midia-offline-relatorio`, [rev]);
  const camps = useApi<any>(`${M}/campanhas?pageSize=100`);
  return (
    <>
      {node}
      <Lista title="Mídia offline (rádio, TV, outdoor, panfletagem)" path="/midia-offline" newLabel="Nova mídia" refreshKey={rev} search={false}
        intro={<Alert severity="info" sx={{ mb: 1.5 }}>Cada mídia recebe um <b>cupom</b>, um <b>QR code</b> e, opcionalmente, um <b>telefone exclusivo</b>. Leads que informam o cupom (ou chegam pelo QR) são atribuídos automaticamente à mídia e ao seu custo.</Alert>}
        fields={[{ key: "tipo", label: "Tipo", type: "select", required: true, options: opts(TIPOS) }, { key: "veiculo", label: "Veículo / local", required: true }, { key: "praca", label: "Praça" }, { key: "campanhaId", label: "Campanha", type: "select", options: (camps.data?.items ?? []).map((c: any) => ({ value: c.id, label: c.nome })) },
          { key: "inicio", label: "Início", type: "date", required: true }, { key: "fim", label: "Fim", type: "date" }, { key: "cupom", label: "Cupom exclusivo" }, { key: "telefoneExclusivo", label: "Telefone exclusivo" }, { key: "descricao", label: "Descrição", type: "textarea", full: true }]}
        filters={[{ key: "tipo", label: "Tipo", options: opts(TIPOS) }, { key: "status", label: "Situação", options: opts(["PLANEJADA", "EM_VEICULACAO", "ENCERRADA", "CANCELADA"]) }]}
        columns={[
          { label: "Mídia", primary: true, render: (r) => <><b>{r.veiculo}</b><Typography variant="caption" component="div" color="text.secondary">{label(r.tipo)} · {fmtDate(r.inicio)}{r.fim ? ` a ${fmtDate(r.fim)}` : ""}</Typography></> },
          { label: "Cupom", render: (r) => r.cupom ?? "—" }, { label: "Inserções", render: (r) => r.insercoes }, { label: "Custo", render: (r) => fmtMoney(r.custoTotal) },
          { label: "Leads", render: (r) => r.leads }, { label: "Custo/lead", render: (r) => (r.custoPorLead == null ? "—" : fmtMoney(r.custoPorLead)) }, { label: "Acessos QR", hideOnMobile: true, render: (r) => r.scans }, { label: "Situação", render: (r) => <Status value={r.status} /> },
        ]}
        rowActions={(r) => [{ label: "Registrar inserção", show: !["ENCERRADA", "CANCELADA"].includes(r.status), onClick: () => setIns(r) }, { label: "QR code", onClick: () => setQr(r) }]} />
      <Section title="Resultado por tipo de mídia">
        <LoadBox loading={rel.loading} error={rel.error} empty={!rel.data?.length} onRetry={rel.reload}>
          {(rel.data ?? []).map((x: any) => <Typography key={x.tipo} variant="body2" sx={{ mb: 0.5 }}><b>{label(x.tipo)}</b>: {x.midias} mídia(s) · {x.insercoes} inserções · custo {fmtMoney(x.custo)} · {x.leads} leads · {x.matriculados} matrículas · custo/lead {x.custoPorLead == null ? "—" : fmtMoney(x.custoPorLead)}</Typography>)}
        </LoadBox>
      </Section>
      <FormDialog open={!!ins} title={`Inserção — ${ins?.veiculo ?? ""}`} onClose={() => setIns(null)} maxWidth="sm" initial={{ quantidade: 1 }}
        fields={[{ key: "data", label: "Data", type: "date", required: true }, { key: "quantidade", label: "Quantidade", type: "number", required: true }, { key: "custo", label: "Custo (R$)", type: "number" }, { key: "horario", label: "Horário / faixa" }, { key: "observacao", label: "Observação", full: true }]}
        onSubmit={async (b) => { await call("POST", `${M}/midia-offline/${ins.id}/insercoes`, b); setRev((x) => x + 1); toast({ type: "success", text: "Inserção registrada." }); }} />
      <Dialog open={!!qr} onClose={() => setQr(null)}>
        <DialogTitle>QR code — {qr?.veiculo}</DialogTitle>
        <DialogContent sx={{ textAlign: "center" }}>{qr && <><Qr url={qr.urlQr} /><Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{qr.urlQr}</Typography>{qr.cupom && <Typography>Cupom: <b>{qr.cupom}</b></Typography>}{qr.telefoneExclusivo && <Typography>Telefone: <b>{qr.telefoneExclusivo}</b></Typography>}<Box sx={{ mt: 1 }}><Typography variant="caption" color="text.secondary">Imprima na peça. Cada leitura é contada e leva ao site com UTM e cupom.</Typography></Box></>}</DialogContent>
        <DialogActions><Button onClick={() => setQr(null)}>Fechar</Button></DialogActions>
      </Dialog>
    </>
  );
}
