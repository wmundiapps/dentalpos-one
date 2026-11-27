import { Alert, Box, Button, Chip, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { A, ActionsMenu, DataList, FormDialog, LoadBox, Pick, Section, StatusChip, abrirArquivo, call, fmtDate, itemsOf, opts, useApi, useReload, useRunner, useToast, type Col, type FormField } from "./kit";

const TIPOS = ["CERTIFICADO", "DIPLOMA", "DECLARACAO", "ATESTADO", "TERMO"];
const MODELO: FormField[] = [
  { key: "codigo", label: "Código", required: true, helper: "Ex.: DECL_ESTAGIO" }, { key: "nome", label: "Nome", required: true }, { key: "tipo", label: "Tipo", type: "select", required: true, options: opts(TIPOS) }, { key: "titulo", label: "Título impresso", required: true },
  { key: "texto", label: "Texto com campos dinâmicos {{nome}}, {{matricula}}, {{curso}}, {{frequencia_media}}, {{historico}}, {{conclusao}}…", type: "textarea", required: true, full: true },
  { key: "assinante", label: "Assinante" }, { key: "cargoAssinante", label: "Cargo do assinante" }, { key: "validadeDias", label: "Validade (dias)", type: "number" }, { key: "taxa", label: "Taxa (R$)", type: "number" },
  { key: "exigeConclusao", label: "Exige conclusão do curso", type: "bool" }, { key: "exigeMatriculaAtiva", label: "Exige matrícula ativa", type: "bool" }, { key: "exigeAssinatura", label: "Assinar eletronicamente", type: "bool" }, { key: "solicitavelPortal", label: "Solicitável no portal", type: "bool" },
];

export default function EmissaoTab() {
  const { rev, reload } = useReload();
  const { toast, node } = useToast();
  const run = useRunner(toast, reload);
  const [f, setF] = useState({ q: "", status: "", tipo: "" });
  const [edit, setEdit] = useState<null | { row?: any }>(null);
  const [emitir, setEmitir] = useState(false);
  const [rev2, setRev2] = useState<any>(null);
  const [via, setVia] = useState<any>(null);
  const modelos = useApi<any>(`${A}/modelos-documento`, [rev]);
  const campos = useApi<any>(`${A}/modelos-documento/campos`);
  const docs = useApi<any>(`${A}/documentos-emitidos?pageSize=30&q=${encodeURIComponent(f.q)}&status=${f.status}&tipo=${f.tipo}`, [rev]);
  const cols: Col[] = [
    { label: "Documento", primary: true, render: (d) => <><b>{d.titulo}</b>{d.via > 1 && <Chip size="small" sx={{ ml: 1 }} label={`${d.via}ª via`} />}<div style={{ fontSize: 12, opacity: 0.7 }}>{d.numero} · código {d.codigo}</div></> },
    { label: "Destinatário", render: (d) => d.destinatarioNome }, { label: "Emissão", hideOnMobile: true, render: (d) => fmtDate(d.emitidoEm) }, { label: "Assinatura", hideOnMobile: true, render: (d) => (d.assinaturaTipo === "SIMULADA_ICP" ? "simulada" : d.assinaturaTipo ?? "—") },
    { label: "Situação", render: (d) => <StatusChip s={d.status === "EMITIDO" ? "CONCLUIDO" : d.status === "SUBSTITUIDO" ? "PENDENTE" : "CANCELADO"} /> },
  ];
  return (
    <>
      {node}
      <Section title="Documentos emitidos" actions={<Button variant="contained" onClick={() => setEmitir(true)}>Emitir documento</Button>}>
        <Alert severity="info" sx={{ mb: 1.5 }}>PDF com QR de verificação pública. A assinatura eletrônica é <b>simulada</b> (interface preparada para ICP-Brasil): sem validade jurídica até conectar um provedor de certificado.</Alert>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
          <TextField size="small" label="Buscar nome, nº ou código" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} sx={{ flex: "1 1 200px" }} />
          <Pick label="Tipo" value={f.tipo} onChange={(v) => setF({ ...f, tipo: v })} all="Todos" minWidth={140} options={opts(TIPOS)} />
          <Pick label="Situação" value={f.status} onChange={(v) => setF({ ...f, status: v })} all="Todas" minWidth={150} options={opts(["EMITIDO", "SUBSTITUIDO", "REVOGADO", "CANCELADO"])} />
        </Box>
        <LoadBox loading={docs.loading} error={docs.error} empty={!itemsOf(docs.data).length} emptyText="Nenhum documento emitido." onRetry={docs.reload}>
          <DataList rows={itemsOf(docs.data)} columns={cols} actions={(d) => <ActionsMenu items={[
            { label: "Abrir PDF", onClick: () => run(() => abrirArquivo(`${A}/documentos-emitidos/${d.id}/pdf`, `${d.numero}.pdf`), "PDF aberto.") },
            { label: "Copiar link de verificação", onClick: () => { navigator.clipboard?.writeText(`${window.location.origin}/api/public/edu/secretaria/verificar/${d.codigo}`); toast({ type: "info", text: "Link copiado." }); } },
            { label: "Emitir 2ª via", show: d.status === "EMITIDO", onClick: () => setVia(d) },
            { label: "Revogar", color: "error", show: d.status === "EMITIDO", onClick: () => setRev2({ d, acao: "revogar" }) },
            { label: "Cancelar emissão", color: "error", show: d.status === "EMITIDO", onClick: () => setRev2({ d, acao: "cancelar" }) },
          ]} />} />
        </LoadBox>
      </Section>
      <Section title="Catálogo de modelos" actions={<Button variant="outlined" onClick={() => setEdit({})}>Novo modelo</Button>}>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>Campos disponíveis: {(campos.data?.campos ?? []).map((c: string) => `{{${c}}}`).join(" ")}</Typography>
        <LoadBox loading={modelos.loading} error={modelos.error} empty={!itemsOf(modelos.data).length} onRetry={modelos.reload}>
          <DataList rows={itemsOf(modelos.data)} columns={[
            { label: "Modelo", primary: true, render: (m: any) => <><b>{m.nome}</b><div style={{ fontSize: 12, opacity: 0.7 }}>{m.codigo}</div></> }, { label: "Tipo", render: (m: any) => m.tipo }, { label: "Taxa", render: (m: any) => (m.taxa ? `R$ ${m.taxa}` : "—") },
            { label: "Regras", hideOnMobile: true, render: (m: any) => [m.exigeConclusao && "concluinte", m.exigeMatriculaAtiva && "matrícula ativa", m.exigeAssinatura && "assinado"].filter(Boolean).join(", ") || "—" }, { label: "Situação", render: (m: any) => (m.ativo ? "Ativo" : "Inativo") },
          ]} actions={(m: any) => <ActionsMenu items={[{ label: "Editar", onClick: () => setEdit({ row: m }) }, { label: m.ativo ? "Desativar" : "Ativar", onClick: () => run(() => call("PUT", `${A}/modelos-documento/${m.id}`, { ativo: !m.ativo }), "Atualizado.") }]} />} />
        </LoadBox>
      </Section>
      <FormDialog open={!!edit} title={edit?.row ? "Editar modelo" : "Novo modelo"} fields={edit?.row ? MODELO.filter((x) => x.key !== "codigo") : MODELO} initial={edit?.row ?? { tipo: "DECLARACAO", exigeAssinatura: true, solicitavelPortal: true }} onClose={() => setEdit(null)}
        onSubmit={async (b) => { if (edit?.row) await call("PUT", `${A}/modelos-documento/${edit.row.id}`, b); else await call("POST", `${A}/modelos-documento`, b); reload(); toast({ type: "success", text: "Modelo salvo." }); }} />
      <FormDialog open={emitir} title="Emitir documento" submitLabel="Emitir" onClose={() => setEmitir(false)} fields={[{ key: "modeloId", label: "Modelo", type: "select", required: true, options: itemsOf(modelos.data).filter((m: any) => m.ativo).map((m: any) => ({ value: m.id, label: `${m.nome} (${m.tipo})` })) }, { key: "studentId", label: "Aluno", type: "student", required: true }, { key: "finalidade", label: "Finalidade (opcional)" }]}
        onSubmit={async (b) => { const { finalidade, ...rest } = b; const d = await call("POST", `${A}/documentos-emitidos`, { ...rest, extras: finalidade ? { finalidade } : undefined }); reload(); toast({ type: "success", text: `Documento ${d.numero} emitido.` }); void abrirArquivo(`${A}/documentos-emitidos/${d.id}/pdf`, `${d.numero}.pdf`).catch(() => undefined); }} />
      <FormDialog open={!!via} title={`2ª via de ${via?.numero ?? ""}`} submitLabel="Emitir 2ª via" onClose={() => setVia(null)} intro={<Alert severity="warning" sx={{ mb: 2 }}>O documento original passará a constar como SUBSTITUÍDO na verificação pública.</Alert>} fields={[{ key: "motivo", label: "Motivo", type: "textarea", required: true }]}
        onSubmit={async (b) => { await call("POST", `${A}/documentos-emitidos/${via.id}/segunda-via`, b); reload(); toast({ type: "success", text: "2ª via emitida." }); }} />
      <FormDialog open={!!rev2} title={rev2?.acao === "revogar" ? "Revogar documento" : "Cancelar emissão"} submitLabel="Confirmar" onClose={() => setRev2(null)} intro={<Alert severity="error" sx={{ mb: 2 }}>Ação auditada. A verificação pública passará a informar que o documento não está vigente.</Alert>} fields={[{ key: "motivo", label: "Motivo (mín. 5 caracteres)", type: "textarea", required: true }]}
        onSubmit={async (b) => { await call("POST", `${A}/documentos-emitidos/${rev2.d.id}/${rev2.acao}`, b); reload(); toast({ type: "success", text: "Registrado." }); }} />
    </>
  );
}
