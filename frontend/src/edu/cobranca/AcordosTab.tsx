import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Pagination, Typography } from "@mui/material";
import { useState } from "react";
import { COLORS, FormDialog, Kpi, KpiRow, LoadBox, Pick, Section, Status, call, fmtDate, fmtDateTime, fmtMoney, label, openHtml, useApi, useRunner, useToast } from "../desempenho/kit";
import AcordoDialog from "./AcordoDialog";
import { ResponsiveTable } from "./common";

const STATUS = ["PROPOSTA", "CONTRAPROPOSTA", "ATIVO", "QUITADO", "QUEBRADO", "RENEGOCIADO", "CANCELADO"].map((s) => ({ value: s, label: label(s) }));

export default function AcordosTab() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [rev, setRev] = useState(0);
  const [aberto, setAberto] = useState<string | null>(null);
  const lista = useApi<any>(`/cobranca/acordos?pageSize=20&page=${page}${status ? `&status=${status}` : ""}`, [rev]);
  const prom = useApi<any>("/cobranca/promessas?status=ABERTA&pageSize=50", [rev]);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  return (
    <>
      {node}
      <Section title="Acordos e negociações" actions={<Pick label="Situação" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={STATUS} all="Todas" minWidth={160} />}>
        <Alert severity="info" sx={{ mb: 2 }}>Para criar uma proposta abra o aluno em <b>Inadimplentes</b> e use "Simular / propor acordo". Aqui você acompanha propostas, contrapropostas, parcelas, quebras e renegociações.</Alert>
        <LoadBox loading={lista.loading && !lista.data} error={lista.error} onRetry={lista.reload}>
          {lista.data && (
            <>
              <ResponsiveTable rows={lista.data.items} rowKey={(a: any) => a.id} onRow={(a: any) => setAberto(a.id)} empty="Nenhum acordo."
                cols={[
                  { key: "numero", label: "Acordo", render: (a: any) => <b>{a.numero}</b> },
                  { key: "aluno", label: "Aluno", render: (a: any) => a.aluno },
                  { key: "status", label: "Situação", render: (a: any) => <Status value={a.status} /> },
                  { key: "valorNegociado", label: "Total", align: "right", render: (a: any) => fmtMoney(a.valorNegociado) },
                  { key: "desconto", label: "Desconto", align: "right", hideMobile: true, render: (a: any) => fmtMoney(a.desconto) },
                  { key: "numeroParcelas", label: "Parcelas", hideMobile: true, render: (a: any) => `${a.entrada > 0 ? "entrada + " : ""}${a.numeroParcelas}x` },
                  { key: "pagas", label: "Pagas", render: (a: any) => `${a.parcelasPorStatus.PAGA ?? 0}/${(a.parcelasPorStatus.PAGA ?? 0) + (a.parcelasPorStatus.ABERTA ?? 0) + (a.parcelasPorStatus.CANCELADA ?? 0)}` },
                  { key: "validadeAte", label: "Validade", hideMobile: true, render: (a: any) => (["PROPOSTA", "CONTRAPROPOSTA"].includes(a.status) ? fmtDate(a.validadeAte) : "—") },
                ]} />
              <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}><Pagination count={Math.max(1, Math.ceil(lista.data.total / 20))} page={page} onChange={(_, p) => setPage(p)} /></Box>
            </>
          )}
        </LoadBox>
      </Section>
      <Section title="Promessas de pagamento em aberto">
        <LoadBox loading={prom.loading && !prom.data} error={prom.error} onRetry={prom.reload}>
          <ResponsiveTable rows={prom.data?.items ?? []} rowKey={(p: any) => p.id} empty="Nenhuma promessa em aberto."
            cols={[
              { key: "aluno", label: "Aluno", render: (p: any) => <b>{p.aluno}</b> },
              { key: "dataPrometida", label: "Data prometida", render: (p: any) => <>{fmtDate(p.dataPrometida)} {new Date(p.dataPrometida) < new Date(Date.now() - 86_400_000) ? <Chip size="small" color="error" label="vencida" /> : null}</> },
              { key: "valor", label: "Valor", align: "right", render: (p: any) => fmtMoney(p.valor) },
              { key: "canal", label: "Canal", hideMobile: true, render: (p: any) => p.canal ?? "—" },
              { key: "acao", label: "", render: (p: any) => <><Button size="small" onClick={() => run(() => call("POST", `/cobranca/promessas/${p.id}/cumprir`, {}), "Promessa cumprida.")}>Cumprida</Button><Button size="small" color="error" onClick={() => run(() => call("POST", `/cobranca/promessas/${p.id}/quebrar`, {}), "Promessa marcada como quebrada.")}>Quebrada</Button></> },
            ]} />
        </LoadBox>
      </Section>
      <AcordoDetalhe id={aberto} onClose={() => setAberto(null)} onChanged={() => setRev((x) => x + 1)} />
    </>
  );
}

function AcordoDetalhe({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const [rev, setRev] = useState(0);
  const det = useApi<any>(id ? `/cobranca/acordos/${id}` : null, [rev]);
  const { toast, node } = useToast();
  const after = () => { setRev((x) => x + 1); onChanged(); };
  const run = useRunner(toast, after);
  const [dlg, setDlg] = useState<string | null>(null);
  const [parc, setParc] = useState<any>(null);
  const a = det.data;
  const termosCampos = [
    { key: "parcelas", label: "Parcelas (0 = à vista)", type: "number" as const, required: true }, { key: "entradaPct", label: "Entrada (%)", type: "number" as const, required: true },
    { key: "primeiroVencimento", label: "1º vencimento", type: "date" as const, required: true }, { key: "descontoEncargosPct", label: "Desconto sobre encargos (%)", type: "number" as const },
    { key: "descontoPrincipalPct", label: "Desconto sobre o principal (%)", type: "number" as const }, { key: "observacao", label: "Observação", type: "textarea" as const },
  ];
  return (
    <Dialog open={!!id} onClose={onClose} fullWidth maxWidth="md" scroll="paper">
      <DialogTitle>{a ? `Acordo ${a.numero} · ${a.aluno?.nome ?? ""}` : "Acordo"}</DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={det.loading && !a} error={det.error} onRetry={det.reload}>
          {a && (
            <>
              <Box sx={{ mb: 1 }}><Status value={a.status} /> {a.origem === "ALUNO" && a.status === "CONTRAPROPOSTA" ? <Chip size="small" color="warning" label="contraproposta do aluno" /> : null}</Box>
              <KpiRow>
                <Kpi title="Principal" value={fmtMoney(a.valorOriginal)} /><Kpi title="Encargos" value={fmtMoney(a.encargos)} /><Kpi title="Desconto" value={fmtMoney(a.desconto)} color={COLORS.ok} />
                <Kpi title="Total do acordo" value={fmtMoney(a.valorNegociado)} hint={a.jurosParcelamentoPct ? `juros de parcelamento ${a.jurosParcelamentoPct}% a.m.` : "sem juros de parcelamento"} />
              </KpiRow>
              {a.motivoQuebra && <Alert severity="error" sx={{ mb: 1 }}>Quebra: {a.motivoQuebra}</Alert>}
              {a.aceiteEm && <Alert severity="success" sx={{ mb: 1 }}>Aceito em {fmtDateTime(a.aceiteEm)} por {a.aceitePor} via {a.aceiteCanal}. Hash: <code>{a.aceiteHash?.slice(0, 16)}…</code></Alert>}
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
                {a.status === "CONTRAPROPOSTA" && <Button size="small" variant="contained" onClick={() => run(() => call("POST", `/cobranca/acordos/${a.id}/aprovar-contraproposta`, {}), "Contraproposta aprovada: pronta para aceite.")}>Aprovar contraproposta</Button>}
                {["PROPOSTA", "CONTRAPROPOSTA"].includes(a.status) && <Button size="small" onClick={() => setDlg("ajustar")}>Ajustar termos</Button>}
                {["PROPOSTA", "CONTRAPROPOSTA"].includes(a.status) && <Button size="small" onClick={() => setDlg("contra")}>Registrar contraproposta do aluno</Button>}
                {a.status === "PROPOSTA" && <Button size="small" variant="contained" color="success" onClick={() => setDlg("aceite")}>Registrar aceite</Button>}
                {["PROPOSTA", "CONTRAPROPOSTA"].includes(a.status) && <Button size="small" color="error" onClick={() => setDlg("cancelar")}>Cancelar proposta</Button>}
                {a.status === "ATIVO" && <Button size="small" color="error" onClick={() => setDlg("quebrar")}>Quebrar acordo</Button>}
                {a.status === "QUEBRADO" && <Button size="small" onClick={() => setDlg("reabrir")}>Reabrir acordo</Button>}
                {["ATIVO", "QUEBRADO"].includes(a.status) && <Button size="small" onClick={() => setDlg("reneg")}>Renegociar</Button>}
                {a.termoTexto !== null && a.aceiteEm && <Button size="small" onClick={() => openHtml(`/cobranca/acordos/${a.id}/termo`).catch((e) => toast({ type: "error", text: e.message }))}>Ver termo</Button>}
              </Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Tabela de parcelas</Typography>
              <ResponsiveTable rows={a.parcelas} rowKey={(p: any) => p.id}
                cols={[
                  { key: "numero", label: "Parcela", render: (p: any) => (p.numero === 0 ? "Entrada" : `${p.numero}/${a.numeroParcelas}`) },
                  { key: "vencimento", label: "Vencimento", render: (p: any) => fmtDate(p.vencimento) },
                  { key: "valor", label: "Valor", align: "right", render: (p: any) => fmtMoney(p.valor) },
                  { key: "status", label: "Situação", render: (p: any) => <Status value={p.status} /> },
                  { key: "valorPago", label: "Pago", align: "right", render: (p: any) => (p.valorPago ? `${fmtMoney(p.valorPago)} em ${fmtDate(p.pagoEm)}` : "—") },
                  { key: "acao", label: "", render: (p: any) => (a.status === "ATIVO" && p.status === "ABERTA" ? <Button size="small" onClick={() => setParc(p)}>Receber</Button> : null) },
                ]} />
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2 }}>Histórico da negociação</Typography>
              {a.eventos.map((e: any) => <Typography key={e.id} variant="body2">• {fmtDateTime(e.createdAt)} — <b>{label(e.tipo)}</b> ({label(e.autor)}){e.dados?.motivo ? `: ${e.dados.motivo}` : ""}{e.dados?.valor ? ` · ${fmtMoney(e.dados.valor)}` : ""}</Typography>)}
            </>
          )}
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      <FormDialog open={dlg === "aceite"} title="Registrar aceite / assinatura" onClose={() => setDlg(null)} initial={{ canal: "PRESENCIAL", aceitoPor: a?.aluno?.nome }}
        fields={[{ key: "canal", label: "Canal do aceite", type: "select", required: true, options: ["PRESENCIAL", "PORTAL", "WHATSAPP", "EMAIL", "TELEFONE", "ASSINATURA_DIGITAL"] }, { key: "aceitoPor", label: "Nome de quem aceitou", required: true }, { key: "documento", label: "CPF (será mascarado)" }]}
        onSubmit={async (b) => { await call("POST", `/cobranca/acordos/${id}/aceitar`, b); toast({ type: "success", text: "Acordo ativo. A régua foi pausada para este aluno." }); after(); }} />
      <FormDialog open={dlg === "ajustar"} title="Ajustar termos (instituição)" fields={termosCampos} initial={{ parcelas: a?.numeroParcelas, entradaPct: 20, descontoEncargosPct: 0, descontoPrincipalPct: 0 }} onClose={() => setDlg(null)}
        onSubmit={async (b) => { await call("POST", `/cobranca/acordos/${id}/ajustar`, b); toast({ type: "success", text: "Termos ajustados." }); after(); }} />
      <FormDialog open={dlg === "contra"} title="Contraproposta do aluno" fields={termosCampos} initial={{ parcelas: 6, entradaPct: 10, descontoEncargosPct: 50, descontoPrincipalPct: 0 }} onClose={() => setDlg(null)}
        onSubmit={async (b) => { await call("POST", `/cobranca/acordos/${id}/contraproposta`, b); toast({ type: "success", text: "Contraproposta registrada; aguarda análise." }); after(); }} />
      <FormDialog open={dlg === "quebrar"} title="Quebrar acordo" fields={[{ key: "motivo", label: "Motivo", type: "textarea", required: true }]} onClose={() => setDlg(null)} intro={<Alert severity="warning" sx={{ mb: 2 }}>O débito original é restabelecido (abatido do que já foi pago) e a régua recomeça.</Alert>}
        onSubmit={async (b) => { await call("POST", `/cobranca/acordos/${id}/quebrar`, b); toast({ type: "success", text: "Acordo quebrado." }); after(); }} />
      <FormDialog open={dlg === "cancelar"} title="Cancelar proposta" fields={[{ key: "motivo", label: "Motivo", required: true }]} onClose={() => setDlg(null)}
        onSubmit={async (b) => { await call("POST", `/cobranca/acordos/${id}/cancelar`, b); toast({ type: "success", text: "Proposta cancelada." }); after(); }} />
      <FormDialog open={dlg === "reabrir"} title="Reabrir acordo quebrado" fields={[{ key: "novoPrimeiroVencimento", label: "Novo 1º vencimento (obrigatório se há parcelas vencidas)", type: "date" }]} onClose={() => setDlg(null)}
        onSubmit={async (b) => { await call("POST", `/cobranca/acordos/${id}/reabrir`, b); toast({ type: "success", text: "Acordo reaberto." }); after(); }} />
      <AcordoDialog open={dlg === "reneg"} studentId={a?.studentId ?? null} renegociarId={id ?? undefined} onClose={() => setDlg(null)} onDone={() => { toast({ type: "success", text: "Nova proposta criada a partir da renegociação." }); after(); }} />
      <FormDialog open={!!parc} title={`Receber ${parc?.numero === 0 ? "entrada" : `parcela ${parc?.numero}`} (${fmtMoney(parc?.valor)})`} fields={[{ key: "forma", label: "Forma", type: "select", required: true, options: ["PIX", "BOLETO", "CARTAO", "DINHEIRO", "TRANSFERENCIA"] }]} initial={{ forma: "PIX" }} onClose={() => setParc(null)}
        intro={<Alert severity="info" sx={{ mb: 2 }}>Pagamento em atraso inclui multa e juros da política. Parcela não aceita pagamento parcial.</Alert>}
        onSubmit={async (b) => { const r = await call("POST", `/cobranca/acordos/${id}/parcelas/${parc.id}/pagar`, b); toast({ type: "success", text: r.quitado ? "Acordo quitado: títulos baixados no contas a receber." : "Parcela recebida." }); after(); }} />
    </Dialog>
  );
}
