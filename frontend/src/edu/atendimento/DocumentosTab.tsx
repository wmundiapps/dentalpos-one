import { Alert, Box, Button, TextField } from "@mui/material";
import { useState } from "react";
import { A, ActionsMenu, DataList, FormDialog, LoadBox, Pick, Section, StatusChip, abrirArquivo, call, fmtDateTime, itemsOf, opts, useApi, useReload, useRunner, useToast, type Col } from "./kit";

export default function DocumentosTab() {
  const { rev, reload } = useReload();
  const [st, setSt] = useState("RECEBIDO");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rej, setRej] = useState<any>(null);
  const { toast, node } = useToast();
  const run = useRunner(toast, reload);
  const l = useApi<any>(`${A}/documentos-recebidos?page=${page}&pageSize=20&status=${st}&q=${encodeURIComponent(q)}`, [rev]);
  const pend = useApi<any>(`${A}/pendencias?status=ABERTAS&pageSize=20`, [rev]);
  const cols: Col[] = [
    { label: "Documento", primary: true, render: (d) => <><b>{d.titulo}</b><div style={{ fontSize: 12, opacity: 0.7 }}>{d.arquivoNome ?? "sem arquivo"}{d.tamanho ? ` · ${Math.round(d.tamanho / 1024)} KB` : ""}</div></> },
    { label: "Protocolo", render: (d) => d.protocolo ? `${d.protocolo.numero} · ${d.protocolo.solicitanteNome}` : "—" }, { label: "Origem", hideOnMobile: true, render: (d) => d.origem ?? "—" },
    { label: "Recebido", hideOnMobile: true, render: (d) => fmtDateTime(d.recebidoEm) }, { label: "Situação", render: (d) => <StatusChip s={d.status} /> },
  ];
  return (
    <>
      <Section title="Documentos recebidos">
        {node}
        <Alert severity="info" sx={{ mb: 1.5 }}>Fila de conferência: aprove ou rejeite cada arquivo. A rejeição cria uma pendência com prazo e avisa o solicitante. Os arquivos passam por verificação de segurança (tipo real, malware).</Alert>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
          <TextField size="small" label="Buscar documento" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} sx={{ flex: "1 1 180px" }} />
          <Pick label="Situação" value={st} onChange={(v) => { setSt(v); setPage(1); }} all="Todas" minWidth={160} options={opts(["PENDENTE", "RECEBIDO", "APROVADO", "REJEITADO"])} />
        </Box>
        <LoadBox loading={l.loading} error={l.error} empty={!itemsOf(l.data).length} emptyText="Nenhum documento nesta situação." onRetry={l.reload}>
          <DataList rows={itemsOf(l.data)} columns={cols} actions={(d) => <ActionsMenu items={[
            { label: "Baixar", show: !!d.arquivoNome, onClick: () => run(() => abrirArquivo(`${A}/documentos/${d.id}/download`, d.arquivoNome, false), "Download iniciado.") },
            { label: "Aprovar", show: d.status === "RECEBIDO", onClick: () => run(() => call("POST", `${A}/documentos/${d.id}/conferir`, { decisao: "APROVAR" }), "Documento aprovado.") },
            { label: "Rejeitar", color: "error", show: d.status === "RECEBIDO", onClick: () => setRej(d) },
          ]} />} />
          <Box sx={{ display: "flex", gap: 1, mt: 2, justifyContent: "flex-end" }}><Button size="small" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button><Button size="small" disabled={page * 20 >= (l.data?.total ?? 0)} onClick={() => setPage(page + 1)}>Próxima</Button></Box>
        </LoadBox>
      </Section>
      <Section title="Pendências com prazo">
        <LoadBox loading={pend.loading} error={pend.error} empty={!itemsOf(pend.data).length} emptyText="Nenhuma pendência aberta." onRetry={pend.reload}>
          <DataList rows={itemsOf(pend.data)} columns={[
            { label: "Pendência", primary: true, render: (x: any) => x.descricao }, { label: "Protocolo", render: (x: any) => x.protocolo ? `${x.protocolo.numero} · ${x.protocolo.solicitanteNome}` : "—" },
            { label: "Prazo", render: (x: any) => new Date(x.prazoEm).toLocaleDateString("pt-BR") }, { label: "Situação", render: (x: any) => <StatusChip s={x.status === "VENCIDA" ? "CANCELADO" : "PENDENTE"} /> },
          ]} actions={(x: any) => <Button size="small" onClick={() => run(() => call("POST", `${A}/pendencias/${x.id}/resolver`), "Pendência resolvida.")}>Resolver</Button>} />
        </LoadBox>
      </Section>
      <FormDialog open={!!rej} title={`Rejeitar: ${rej?.titulo ?? ""}`} onClose={() => setRej(null)} fields={[{ key: "motivo", label: "Motivo (o solicitante verá)", type: "textarea", required: true }, { key: "prazoDias", label: "Prazo para reenvio (dias úteis)", type: "number" }]} initial={{ prazoDias: 5 }}
        onSubmit={async (b) => { await call("POST", `${A}/documentos/${rej.id}/conferir`, { decisao: "REJEITAR", ...b }); reload(); toast({ type: "success", text: "Documento rejeitado e pendência criada." }); }} />
    </>
  );
}
