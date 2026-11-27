import { Button, TextField } from "@mui/material";
import { useState, type ReactNode } from "react";
import { Acoes, ActionsMenu, type Col, DataList, FormDialog, LoadBox, Section, cp, itemsOf, useCp, useDebounced, useRunner, useToast, type FormField, type RowAction } from "./kit";

/** Cadastro genérico (lista responsiva + criar/editar/remover) para recursos criados com mountCrud no backend. */
export default function Cadastro({ titulo, path, listPath, columns, fields, podeEditar, podeRemover = false, busca = true, extra, novoLabel = "Novo", intro, filtros, acoes, toBody, vazio }: {
  titulo: string; path: string; listPath?: string; columns: Col[]; fields: FormField[]; podeEditar: boolean; podeRemover?: boolean; busca?: boolean; extra?: ReactNode; novoLabel?: string; intro?: ReactNode;
  filtros?: ReactNode; acoes?: (row: any, ctx: { reload: () => void; run: (fn: () => Promise<any>, ok?: string, confirm?: string) => Promise<any> }) => RowAction[]; toBody?: (b: Record<string, any>) => Record<string, any>; vazio?: string;
}) {
  const [rev, setRev] = useState(0);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [edit, setEdit] = useState<null | { row?: any }>(null);
  const { toast, node } = useToast();
  const reload = () => setRev((x) => x + 1);
  const run = useRunner(toast, reload);
  const lp = listPath ?? path;
  const l = useCp<any>(`${lp}${lp.includes("?") ? "&" : "?"}pageSize=100${dq ? `&q=${encodeURIComponent(dq)}` : ""}`, [rev]);
  const rows = itemsOf(l.data);
  return (
    <Section title={titulo} actions={podeEditar ? <Button size="small" variant="contained" onClick={() => setEdit({})}>{novoLabel}</Button> : undefined}>
      {node}
      {intro}
      <Acoes>
        {busca && <TextField size="small" label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} sx={{ minWidth: 220 }} />}
        {filtros}
        {extra}
      </Acoes>
      <LoadBox loading={l.loading} error={l.error} onRetry={l.reload} empty={!rows.length} emptyText={vazio ?? "Nenhum registro."}>
        <DataList rows={rows} columns={columns} actions={(r) => (
          <ActionsMenu items={[
            ...(acoes?.(r, { reload, run }) ?? []),
            { label: "Editar", onClick: () => setEdit({ row: r }), show: podeEditar },
            { label: "Remover", color: "error", onClick: () => run(() => cp("DELETE", `${path}/${r.id}`), "Removido.", "Remover este registro?"), show: podeRemover },
          ]} />
        )} />
      </LoadBox>
      {edit && <FormDialog open title={edit.row ? "Editar" : novoLabel} fields={fields} initial={edit.row ? prefill(edit.row, fields) : undefined} onClose={() => setEdit(null)}
        onSubmit={async (b) => { const body = toBody ? toBody(b) : b; if (edit.row) await cp("PATCH", `${path}/${edit.row.id}`, body); else await cp("POST", path, body); reload(); }} />}
    </Section>
  );
}

function prefill(row: any, fields: FormField[]) {
  const v: Record<string, any> = { ...row };
  for (const f of fields) {
    const x = row?.[f.key];
    if (x === null || x === undefined) { delete v[f.key]; continue; }
    if (f.type === "date") v[f.key] = String(x).slice(0, 10);
    else if (f.type === "datetime") { const d = new Date(x); v[f.key] = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
  }
  return v;
}
