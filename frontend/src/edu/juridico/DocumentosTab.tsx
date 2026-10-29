import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { useState } from "react";
import { AlertaChip, J, LoadBox, ResourceTab, Status, call, fmtDate, itemsOf, opts, useApi, useRunner, useToast, FormDialog, type FormField } from "./kit";

export const CATEGORIAS_DOC = ["INTERNO", "PARCERIA", "CONVENIO", "FISCAL", "TRABALHISTA", "COOPERACAO", "CONTRATO", "OUTRO"];

const FIELDS: FormField[] = [
  { key: "categoria", label: "Categoria", type: "select", required: true, options: opts(CATEGORIAS_DOC) },
  { key: "titulo", label: "Título", required: true }, { key: "partes", label: "Partes envolvidas" },
  { key: "status", label: "Situação", type: "select", options: opts(["RASCUNHO", "VIGENTE"]) },
  { key: "vigenciaInicio", label: "Início da vigência", type: "date" }, { key: "vigenciaFim", label: "Fim da vigência (vencimento)", type: "date" },
  { key: "responsavelNome", label: "Responsável" }, { key: "tags", label: "Etiquetas", type: "list" },
  { key: "confidencial", label: "Confidencial (só equipe jurídica e reitoria)", type: "bool" }, { key: "descricao", label: "Descrição", type: "textarea" },
];

function Versoes({ doc, onClose }: { doc: any; onClose: () => void }) {
  const [rev, setRev] = useState(0);
  const [nova, setNova] = useState(false);
  const l = useApi<any>(`${J}/documentos/${doc.id}/versoes`, [rev]);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Versões — {doc.titulo}</DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={l.loading} error={l.error} empty={!itemsOf(l.data).length} emptyText="Nenhuma versão registrada." onRetry={l.reload}>
          {itemsOf(l.data).map((v: any) => (
            <div key={v.id} style={{ padding: "8px 0", borderBottom: "1px solid #8884" }}>
              <Typography sx={{ fontWeight: 700 }}>v{v.versao} <Status value={v.status} /></Typography>
              <Typography variant="body2">{v.resumoAlteracoes}</Typography>
              <Typography variant="caption" color="text.secondary">Vigência: {fmtDate(v.vigenciaInicio)} a {fmtDate(v.vigenciaFim)}</Typography>
            </div>
          ))}
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={() => setNova(true)} variant="contained">Nova versão</Button><Button onClick={onClose}>Fechar</Button></DialogActions>
      <FormDialog open={nova} title="Nova versão" onClose={() => setNova(false)} maxWidth="sm"
        intro={<Typography variant="body2" sx={{ mb: 1 }}>A versão vigente atual passa a “substituída” e a nova assume a vigência informada.</Typography>}
        fields={[{ key: "resumoAlteracoes", label: "O que mudou", type: "textarea", required: true }, { key: "vigenciaInicio", label: "Início da vigência", type: "date" }, { key: "vigenciaFim", label: "Fim da vigência", type: "date" }]}
        onSubmit={async (b) => { await run(() => call("POST", `${J}/documentos/${doc.id}/versoes`, b), "Nova versão registrada.") }} />
    </Dialog>
  );
}

export default function DocumentosTab() {
  const [ver, setVer] = useState<any>(null);
  return (
    <>
      <ResourceTab title="Acervo documental" path="/documentos" fields={FIELDS} vencimento newLabel="Novo documento" anexoRef="Documento"
        filters={[{ key: "categoria", label: "Categoria", options: opts(CATEGORIAS_DOC) }, { key: "status", label: "Situação", options: opts(["RASCUNHO", "VIGENTE", "ENCERRADO", "CANCELADO"]) }]}
        columns={[
          { label: "Documento", primary: true, render: (r) => <><b>{r.titulo}</b><Typography variant="caption" component="div" color="text.secondary">{r.codigo}{r.confidencial ? " · confidencial" : ""}</Typography></> },
          { label: "Categoria", render: (r) => r.categoria.replace(/_/g, " ") },
          { label: "Partes", hideOnMobile: true, render: (r) => r.partes || "—" },
          { label: "Versão", render: (r) => (r.versaoAtual ? `v${r.versaoAtual}` : "—") },
          { label: "Vigência até", render: (r) => fmtDate(r.vigenciaFim) },
          { label: "Prazo", render: (r) => (r.status === "VIGENTE" ? <AlertaChip alerta={r.alerta} /> : "—") },
          { label: "Situação", render: (r) => <Status value={r.status} /> },
          { label: "Responsável", hideOnMobile: true, render: (r) => r.responsavelNome || "—" },
        ]}
        rowActions={(r, { run }) => [
          { label: "Versões", onClick: () => setVer(r) },
          { label: "Encerrar", show: r.status === "VIGENTE" || r.status === "RASCUNHO", onClick: () => { void run(() => call("POST", `${J}/documentos/${r.id}/encerrar`), "Documento encerrado.", "Encerrar este documento? Os alertas de vencimento serão cancelados."); } },
        ]} />
      {ver && <Versoes doc={ver} onClose={() => setVer(null)} />}
    </>
  );
}
