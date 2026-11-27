import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import EduResourcePage, { StatusChip } from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { Async, FormDialog, SubNav, Tag, brl, fmtDate, itemsOf, num, useApi, useSupplierOptions, useToast, type Field } from "../infraestrutura/kit";

const FORN_STATUS = ["ATIVO", "EM_ANALISE", "BLOQUEADO", "INATIVO"];
const FORN_FIELDS: Field[] = [
  { key: "razaoSocial", label: "Razão social", required: true, full: true }, { key: "nomeFantasia", label: "Nome fantasia" }, { key: "cnpj", label: "CNPJ", helper: "14 dígitos ou 00.000.000/0000-00" },
  { key: "email", label: "E-mail" }, { key: "telefone", label: "Telefone" }, { key: "contato", label: "Pessoa de contato" }, { key: "cidade", label: "Cidade" }, { key: "uf", label: "UF" },
  { key: "categorias", label: "Categorias (separe por vírgula)", type: "list" }, { key: "prazoPagamentoDias", label: "Prazo de pagamento (dias)", type: "number" },
  { key: "banco", label: "Banco" }, { key: "chavePix", label: "Chave PIX" }, { key: "status", label: "Situação", type: "select", options: FORN_STATUS, def: "ATIVO" }, { key: "observacoes", label: "Observações", type: "textarea" },
];

function Avaliacoes({ fornecedor, onClose }: { fornecedor: any; onClose: () => void }) {
  const st = useApi<any>(`/suprimentos/fornecedores/${fornecedor.id}/avaliacoes`);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800 }}>Avaliações — {fornecedor.razaoSocial}</DialogTitle>
      <DialogContent dividers>
        <Async state={st}>
          {(d) => {
            const rows = itemsOf(d);
            return rows.length ? rows.map((a: any) => (
              <Box key={a.id} sx={{ mb: 1.5 }}>
                <Typography variant="body2"><b>{fmtDate(a.createdAt)}</b> · prazo {a.notaPrazo} · qualidade {a.notaQualidade} · preço {a.notaPreco}{a.notaAtendimento ? ` · atendimento ${a.notaAtendimento}` : ""}</Typography>
                {a.comentario && <Typography variant="caption" color="text.secondary">{a.comentario}</Typography>}
              </Box>
            )) : <Typography color="text.secondary">Nenhuma avaliação registrada.</Typography>;
          }}
        </Async>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

function Fornecedores() {
  const [key, setKey] = useState(0);
  const [form, setForm] = useState<{ kind: "novo" | "editar" | "avaliar"; row?: any } | null>(null);
  const [aval, setAval] = useState<any | null>(null);
  const toast = useToast();
  const reload = () => setKey((k) => k + 1);
  const nota = (k: string, l: string, req = true): Field => ({ key: k, label: l, type: "number", required: req, helper: "1 a 5" });
  return (
    <Box>
      <ListTable path="/suprimentos/fornecedores" refreshKey={key}
        filters={[{ key: "status", label: "Situação", options: FORN_STATUS }]}
        toolbar={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ kind: "novo" })}>Novo fornecedor</Button>}
        columns={[
          { key: "razaoSocial", label: "Razão social" }, { key: "cnpj", label: "CNPJ" }, { key: "contato", label: "Contato", render: (r) => r.contato || r.email || r.telefone || "—" },
          { key: "cidade", label: "Cidade/UF", render: (r) => [r.cidade, r.uf].filter(Boolean).join("/") || "—" },
          { key: "avaliacaoMedia", label: "Nota", render: (r) => (r.avaliacaoMedia ? <Tag text={`${num(r.avaliacaoMedia)} / 5`} tone={r.avaliacaoMedia >= 4 ? "success" : r.avaliacaoMedia >= 3 ? "warning" : "error"} /> : "—") },
          { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> },
        ]}
        actions={(r) => (
          <>
            <Button size="small" onClick={() => setForm({ kind: "avaliar", row: r })}>Avaliar</Button>
            <Button size="small" onClick={() => setAval(r)}>Histórico</Button>
            <Button size="small" onClick={() => setForm({ kind: "editar", row: r })}>Editar</Button>
          </>
        )} />
      <FormDialog open={!!form} onClose={() => setForm(null)}
        title={form?.kind === "novo" ? "Novo fornecedor" : form?.kind === "editar" ? "Editar fornecedor" : `Avaliar ${form?.row?.razaoSocial || ""}`}
        initial={form?.kind === "editar" ? form.row : null}
        fields={form?.kind === "avaliar" ? [nota("notaPrazo", "Nota de prazo"), nota("notaQualidade", "Nota de qualidade"), nota("notaPreco", "Nota de preço"), nota("notaAtendimento", "Nota de atendimento", false), { key: "comentario", label: "Comentário", type: "textarea" }] : FORN_FIELDS}
        onSubmit={async (b) => {
          if (form!.kind === "novo") await eduApi.post("/suprimentos/fornecedores", b);
          else if (form!.kind === "editar") await eduApi.put(`/suprimentos/fornecedores/${form!.row.id}`, b);
          else await eduApi.post("/suprimentos/fornecedores/avaliacoes", { ...b, fornecedorId: form!.row.id });
          toast.ok("Salvo com sucesso."); reload();
        }} />
      {aval && <Avaliacoes fornecedor={aval} onClose={() => setAval(null)} />}
      {toast.node}
    </Box>
  );
}

function Documentos({ forn }: { forn: Array<{ value: string; label: string }> }) {
  const venc = useApi<any>("/suprimentos/fornecedor-documentos-vencendo");
  const lista = itemsOf(venc.data);
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {lista.length > 0 && <Alert severity="warning">{lista.length} certidão(ões) vencida(s) ou a vencer em 30 dias — regularize antes de emitir novos pedidos.</Alert>}
      <EduResourcePage title="Documentos e certidões dos fornecedores" base="/suprimentos" resource="/fornecedor-documentos" searchable={false} dense
        filters={[{ key: "status", label: "Situação", options: ["VALIDO", "A_VENCER", "VENCIDO"] }]}
        columns={[{ key: "fornecedorId", label: "Fornecedor", render: (r) => forn.find((f) => f.value === r.fornecedorId)?.label || r.fornecedorId }, { key: "tipo", label: "Documento" }, { key: "numero", label: "Número" },
          { key: "validade", label: "Validade", render: (r) => fmtDate(r.validade) }, { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> }]}
        fields={[{ key: "fornecedorId", label: "Fornecedor", type: "select", options: forn, required: true, createOnly: true }, { key: "tipo", label: "Tipo (CND federal, FGTS, trabalhista…)", required: true }, { key: "numero", label: "Número" },
          { key: "emissao", label: "Emissão", type: "date" }, { key: "validade", label: "Validade", type: "date" }, { key: "arquivoUrl", label: "URL do arquivo" }]} />
    </Box>
  );
}

function Contratos({ forn }: { forn: Array<{ value: string; label: string }> }) {
  const [key, setKey] = useState(0);
  const [form, setForm] = useState<{ kind: "novo" | "editar" | "reajustar" | "renovar"; row?: any } | null>(null);
  const toast = useToast();
  const reload = () => setKey((k) => k + 1);
  const fields = (): Field[] => {
    if (form?.kind === "reajustar") return [{ key: "percentual", label: "Percentual de reajuste (%)", type: "number", required: true }, { key: "proximoReajusteEm", label: "Próximo reajuste", type: "date" }];
    if (form?.kind === "renovar") return [{ key: "meses", label: "Meses de renovação", type: "number" }, { key: "percentualReajuste", label: "Reajuste na renovação (%)", type: "number" }, { key: "numero", label: "Novo número (opcional)" }];
    return [
      { key: "numero", label: "Nº do contrato", required: true }, { key: "fornecedorId", label: "Fornecedor", type: "select", options: forn, required: true }, { key: "objeto", label: "Objeto", required: true, full: true },
      { key: "vigenciaInicio", label: "Início da vigência", type: "date", required: true }, { key: "vigenciaFim", label: "Fim da vigência", type: "date", required: true },
      { key: "valorMensal", label: "Valor mensal (R$)", type: "number" }, { key: "valorTotal", label: "Valor total (R$)", type: "number" }, { key: "indiceReajuste", label: "Índice de reajuste (IPCA, IGP-M…)" }, { key: "proximoReajusteEm", label: "Próximo reajuste", type: "date" },
      { key: "avisoDias", label: "Avisar com (dias)", type: "number", def: 60 }, { key: "renovacaoAutomatica", label: "Renovação automática", type: "bool" }, { key: "observacoes", label: "Observações", type: "textarea" },
    ];
  };
  return (
    <Box>
      <ListTable path="/suprimentos/contratos" refreshKey={key}
        filters={[{ key: "status", label: "Situação", options: ["RASCUNHO", "VIGENTE", "A_VENCER", "VENCIDO", "RENOVADO", "ENCERRADO"] }]}
        toolbar={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ kind: "novo" })}>Novo contrato</Button>}
        columns={[
          { key: "numero", label: "Contrato" }, { key: "fornecedorId", label: "Fornecedor", render: (r) => forn.find((f) => f.value === r.fornecedorId)?.label || "—" }, { key: "objeto", label: "Objeto" },
          { key: "vigenciaFim", label: "Vigência até", render: (r) => fmtDate(r.vigenciaFim) }, { key: "valorMensal", label: "Mensal", render: (r) => brl(r.valorMensal) },
          { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> },
        ]}
        actions={(r) => (
          <>
            <Button size="small" onClick={() => setForm({ kind: "reajustar", row: r })}>Reajustar</Button>
            <Button size="small" onClick={() => setForm({ kind: "renovar", row: r })}>Renovar</Button>
            <Button size="small" onClick={() => setForm({ kind: "editar", row: r })}>Editar</Button>
            <Button size="small" color="error" onClick={() => toast.run(() => eduApi.del(`/suprimentos/contratos/${r.id}`), "Contrato removido.", reload, `Remover o contrato ${r.numero}?`)}>Remover</Button>
          </>
        )} />
      <FormDialog open={!!form} onClose={() => setForm(null)} fields={fields()} initial={form?.kind === "editar" ? form.row : null}
        title={form ? { novo: "Novo contrato", editar: "Editar contrato", reajustar: `Reajustar ${form.row?.numero}`, renovar: `Renovar ${form.row?.numero}` }[form.kind] : ""}
        onSubmit={async (b) => {
          const r = form!.row;
          if (form!.kind === "novo") await eduApi.post("/suprimentos/contratos", b);
          else if (form!.kind === "editar") await eduApi.put(`/suprimentos/contratos/${r.id}`, b);
          else if (form!.kind === "reajustar") await eduApi.post(`/suprimentos/contratos/${r.id}/reajustar`, b);
          else await eduApi.post(`/suprimentos/contratos/${r.id}/renovar`, b);
          toast.ok("Operação concluída."); reload();
        }} />
      {toast.node}
    </Box>
  );
}

export default function FornecedoresTab() {
  const [sub, setSub] = useState("fornecedores");
  const forn = useSupplierOptions();
  return (
    <Box>
      <SubNav value={sub} onChange={setSub} items={[{ key: "fornecedores", label: "Fornecedores" }, { key: "documentos", label: "Certidões" }, { key: "contratos", label: "Contratos" }]} />
      {sub === "fornecedores" && <Fornecedores />}
      {sub === "documentos" && <Documentos forn={forn} />}
      {sub === "contratos" && <Contratos forn={forn} />}
    </Box>
  );
}
