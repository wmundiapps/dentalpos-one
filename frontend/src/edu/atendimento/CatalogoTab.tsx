import { Alert, Button, Chip } from "@mui/material";
import { useState } from "react";
import { A, ActionsMenu, DataList, FormDialog, LoadBox, Section, call, itemsOf, opts, useApi, useReload, useRunner, useToast, type Col, type FormField } from "./kit";

const AUTOMACOES: Record<string, string> = { NENHUMA: "Sem automação (fluxo manual)", EMITIR_DOCUMENTO: "Emitir documento", SEGUNDA_VIA_BOLETO: "2ª via de boleto", CONSULTA_FINANCEIRA: "Consulta financeira", TRANCAMENTO: "Trancamento de matrícula" };

export default function CatalogoTab() {
  const { rev, reload } = useReload();
  const { toast, node } = useToast();
  const run = useRunner(toast, reload);
  const [edit, setEdit] = useState<null | { row?: any }>(null);
  const l = useApi<any>(`${A}/servicos`, [rev]);
  const setores = useApi<any>(`${A}/setores`);
  const modelos = useApi<any>(`${A}/modelos-documento`);
  const F: FormField[] = [
    { key: "codigo", label: "Código", required: true }, { key: "nome", label: "Nome do serviço", required: true }, { key: "descricao", label: "Descrição para o aluno", type: "textarea", full: true },
    { key: "categoria", label: "Categoria", type: "select", required: true, options: opts(["ACADEMICO", "DOCUMENTO", "FINANCEIRO", "CADASTRO", "GERAL"]) }, { key: "setorId", label: "Setor responsável", type: "select", options: itemsOf(setores.data).map((s: any) => ({ value: s.id, label: s.nome })) },
    { key: "autoatendimento", label: "Disponível no portal (autoatendimento)", type: "bool" },
    { key: "automacao", label: "Automação", type: "select", required: true, options: Object.entries(AUTOMACOES).map(([value, label]) => ({ value, label })) },
    { key: "modeloId", label: "Modelo de documento (para emissão)", type: "select", options: itemsOf(modelos.data).map((m: any) => ({ value: m.id, label: m.nome })) },
    { key: "taxa", label: "Taxa (R$) — gera cobrança no financeiro", type: "number" }, { key: "prazoDias", label: "Prazo total (dias úteis)", type: "number" },
    { key: "etapasTxt", label: "Etapas da jornada (uma por linha: CODIGO|Nome|prazo em dias)", type: "textarea", full: true, helper: "Ex.: RECEBIDO|Recebido|0  ·  ANALISE|Em análise|3. Deixe vazio para a jornada padrão." },
    { key: "docsTxt", label: "Documentos exigidos (uma linha por documento: Título|obrigatorio ou opcional)", type: "textarea", full: true },
  ];
  const paraForm = (s: any) => ({ ...s, etapasTxt: (s.etapas ?? []).map((e: any) => `${e.codigo}|${e.nome}|${e.prazoDias ?? 0}`).join("\n"), docsTxt: (s.documentos ?? []).map((d: any) => `${d.titulo}|${d.obrigatorio ? "obrigatorio" : "opcional"}`).join("\n") });
  const paraApi = (b: any, editando: boolean) => {
    const { etapasTxt, docsTxt, ...rest } = b;
    const etapas = String(etapasTxt ?? "").split("\n").map((x) => x.trim()).filter(Boolean).map((x) => { const [codigo, nome, d] = x.split("|"); return { codigo: codigo.trim().toUpperCase(), nome: (nome ?? codigo).trim(), prazoDias: Number(d) || 0 }; });
    const documentos = String(docsTxt ?? "").split("\n").map((x) => x.trim()).filter(Boolean).map((x) => { const [titulo, o] = x.split("|"); return { titulo: titulo.trim(), obrigatorio: !/opcional/i.test(o ?? "") }; });
    return { ...rest, ...(etapas.length ? { etapas } : {}), documentos, ...(editando ? {} : {}) };
  };
  const cols: Col[] = [
    { label: "Serviço", primary: true, render: (s) => <><b>{s.nome}</b><div style={{ fontSize: 12, opacity: 0.7 }}>{s.codigo} · {s.categoria}</div></> },
    { label: "Autoatendimento", render: (s) => (s.autoatendimento ? <Chip size="small" color="success" label="no portal" /> : <Chip size="small" label="balcão/equipe" />) },
    { label: "Automação", hideOnMobile: true, render: (s) => AUTOMACOES[s.automacao] ?? s.automacao }, { label: "Taxa", render: (s) => (s.taxa ? `R$ ${Number(s.taxa).toFixed(2).replace(".", ",")}` : "—") },
    { label: "Prazo", hideOnMobile: true, render: (s) => `${s.prazoDias} dia(s)` }, { label: "Docs", hideOnMobile: true, render: (s) => s.documentos.length || "—" }, { label: "Pedidos", hideOnMobile: true, render: (s) => s.protocolos }, { label: "Situação", render: (s) => (s.ativo ? "Ativo" : "Inativo") },
  ];
  return (
    <Section title="Catálogo de serviços" actions={<Button variant="contained" onClick={() => setEdit({})}>Novo serviço</Button>}>
      {node}
      <Alert severity="info" sx={{ mb: 1.5 }}>Serviços marcados como <b>autoatendimento</b> aparecem no Portal do Aluno. Com automação e sem documentos exigidos, o pedido é resolvido na hora (ex.: declaração em PDF, 2ª via de boleto). Se houver taxa, a cobrança é lançada no financeiro e a automação roda após o pagamento.</Alert>
      <LoadBox loading={l.loading} error={l.error} empty={!itemsOf(l.data).length} onRetry={l.reload}>
        <DataList rows={itemsOf(l.data)} columns={cols} actions={(s) => <ActionsMenu items={[{ label: "Editar", onClick: () => setEdit({ row: s }) }, { label: s.ativo ? "Desativar" : "Ativar", onClick: () => run(() => call("PUT", `${A}/servicos/${s.id}`, { ativo: !s.ativo }), "Atualizado.") }]} />} />
      </LoadBox>
      <FormDialog open={!!edit} title={edit?.row ? "Editar serviço" : "Novo serviço"} fields={edit?.row ? F.filter((x) => x.key !== "codigo") : F} initial={edit?.row ? paraForm(edit.row) : { categoria: "GERAL", automacao: "NENHUMA", prazoDias: 5, autoatendimento: true }} onClose={() => setEdit(null)}
        onSubmit={async (b) => { const body = paraApi(b, !!edit?.row); if (edit?.row) await call("PUT", `${A}/servicos/${edit.row.id}`, body); else await call("POST", `${A}/servicos`, body); reload(); toast({ type: "success", text: "Serviço salvo." }); }} />
    </Section>
  );
}
