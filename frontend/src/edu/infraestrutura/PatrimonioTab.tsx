import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DescriptionIcon from "@mui/icons-material/Description";
import { useState } from "react";
import EduResourcePage, { StatusChip } from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import ListTable from "./ListTable";
import InventarioPanel from "./InventarioPanel";
import { Async, type Field, FormDialog, ProgressBar, Stat, StatGrid, SubNav, Tag, brl, fmtDate, fmtDateTime, label, nameOf, openHtml, useApi, useSpaces, useToast } from "./kit";

const ESTADOS = ["NOVO", "BOM", "REGULAR", "RUIM", "INSERVIVEL"];
const CRITICIDADES = ["BAIXA", "NORMAL", "ALTA", "CRITICA"];
const estadoTone = (e: string) => (e === "NOVO" || e === "BOM" ? "success" : e === "REGULAR" ? "warning" : "error") as any;

function BemDetalhe({ id, onClose }: { id: string; onClose: () => void }) {
  const st = useApi<any>(`/infraestrutura/bens/${id}`);
  const spaces = useSpaces();
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Ficha do bem</DialogTitle>
      <DialogContent dividers>
        <Async state={st}>
          {(b) => (
            <Box sx={{ display: "grid", gap: 2 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>{b.descricao}</Typography>
                <Typography variant="body2" color="text.secondary">Tombamento {b.tombamento} · {b.categoria?.nome || "sem categoria"} · {nameOf(spaces, b.spaceId)}</Typography>
                <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
                  <Tag text={label(b.estado)} tone={estadoTone(b.estado)} /><StatusChip value={b.status} /><Tag text={`Criticidade ${label(b.criticidade)}`} />
                </Box>
              </Box>
              <StatGrid min={150}>
                <Stat label="Valor de aquisição" value={brl(b.valorAquisicao)} hint={fmtDate(b.dataAquisicao)} />
                <Stat label="Valor contábil" value={brl(b.depreciacao?.valorContabil)} hint={`Residual ${brl(b.depreciacao?.valorResidual)}`} />
                <Stat label="Depreciação mensal" value={brl(b.depreciacao?.depreciacaoMensal)} hint={`${b.depreciacao?.mesesUsados ?? 0} mês(es) de uso`} />
                <Stat label="Custo de manutenção" value={brl(b.custoManutencao)} hint={`${(b.ordensServico || []).length} OS`} />
              </StatGrid>
              <Box>
                <Typography variant="caption" color="text.secondary">Depreciação acumulada</Typography>
                <ProgressBar value={b.depreciacao?.percentualDepreciado || 0} color={b.depreciacao?.totalmenteDepreciado ? "error" : "primary"} />
              </Box>
              <Divider />
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Movimentações</Typography>
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead><TableRow><TableCell>Data</TableCell><TableCell>Tipo</TableCell><TableCell>Motivo</TableCell></TableRow></TableHead>
                  <TableBody>
                    {(b.movimentacoes || []).map((m: any) => (
                      <TableRow key={m.id}><TableCell>{fmtDateTime(m.createdAt)}</TableCell><TableCell>{label(m.tipo)}</TableCell><TableCell>{m.motivo || "—"}</TableCell></TableRow>
                    ))}
                    {!(b.movimentacoes || []).length && <TableRow><TableCell colSpan={3}>Sem movimentações.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Ordens de serviço</Typography>
              {(b.ordensServico || []).map((o: any) => (
                <Box key={o.id} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                  <b>{o.numero}</b><span>{o.titulo}</span><StatusChip value={o.status} /><Typography variant="caption">{fmtDate(o.abertaEm)}</Typography>
                </Box>
              ))}
              {!(b.ordensServico || []).length && <Typography variant="body2" color="text.secondary">Nenhuma OS para este bem.</Typography>}
            </Box>
          )}
        </Async>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

export default function PatrimonioTab() {
  const [sub, setSub] = useState("bens");
  const [key, setKey] = useState(0);
  const [form, setForm] = useState<{ kind: "novo" | "editar" | "transferir" | "estado" | "baixar"; row?: any } | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const spaces = useSpaces();
  const cats = useApi<any>("/infraestrutura/categorias-bem?pageSize=200");
  const toast = useToast();
  const catOpts = (cats.data?.items || []).map((c: any) => ({ value: c.id, label: c.nome }));
  const reload = () => setKey((k) => k + 1);

  const bemFields = (novo: boolean): Field[] => [
    ...(novo ? [{ key: "tombamento", label: "Tombamento", helper: "Deixe em branco para gerar automaticamente" } as Field] : []),
    { key: "descricao", label: "Descrição", required: true, full: true },
    { key: "categoriaId", label: "Categoria", type: "select", options: catOpts, required: true },
    { key: "marca", label: "Marca" }, { key: "modelo", label: "Modelo" }, { key: "numeroSerie", label: "Nº de série" }, { key: "notaFiscal", label: "Nota fiscal" },
    { key: "valorAquisicao", label: "Valor de aquisição (R$)", type: "number", required: true },
    { key: "dataAquisicao", label: "Data de aquisição", type: "date", required: true },
    { key: "vidaUtilMeses", label: "Vida útil (meses)", type: "number", helper: "Em branco: usa a da categoria" },
    { key: "valorResidual", label: "Valor residual (R$)", type: "number" },
    ...(novo ? [
      { key: "spaceId", label: "Local (espaço)", type: "select", options: spaces } as Field,
      { key: "estado", label: "Estado", type: "select", options: ESTADOS, def: "NOVO" } as Field,
    ] : []),
    { key: "criticidade", label: "Criticidade", type: "select", options: CRITICIDADES, def: "NORMAL" },
    { key: "garantiaAte", label: "Garantia até", type: "date" },
    { key: "observacoes", label: "Observações", type: "textarea" },
  ];

  const submit = async (body: any) => {
    const f = form!;
    const r = f.row;
    if (f.kind === "novo") await eduApi.post("/infraestrutura/bens", body);
    else if (f.kind === "editar") await eduApi.patch(`/infraestrutura/bens/${r.id}`, body);
    else if (f.kind === "transferir") await eduApi.post(`/infraestrutura/bens/${r.id}/transferir`, body);
    else if (f.kind === "estado") await eduApi.post(`/infraestrutura/bens/${r.id}/estado`, body);
    else if (f.kind === "baixar") await eduApi.post(`/infraestrutura/bens/${r.id}/baixar`, body);
    toast.ok("Operação concluída.");
    reload();
  };
  const fieldsFor = (): Field[] => {
    switch (form?.kind) {
      case "transferir": return [
        { key: "spaceId", label: "Novo local", type: "select", options: spaces }, { key: "responsavelUserId", label: "Novo responsável (ID do usuário)" },
        { key: "motivo", label: "Motivo", required: true, full: true }, { key: "documento", label: "Documento (termo/ofício)" }];
      case "estado": return [{ key: "estado", label: "Novo estado", type: "select", options: ESTADOS, required: true }, { key: "motivo", label: "Motivo", full: true }];
      case "baixar": return [{ key: "motivo", label: "Motivo da baixa", required: true, full: true, type: "textarea" }, { key: "documento", label: "Documento" }, { key: "data", label: "Data da baixa", type: "date" }];
      case "novo": return bemFields(true);
      default: return bemFields(false);
    }
  };
  const titleFor = { novo: "Novo bem patrimonial", editar: "Editar bem", transferir: "Transferir bem", estado: "Alterar estado de conservação", baixar: "Baixar bem (desfazimento)" } as const;

  return (
    <Box>
      <SubNav value={sub} onChange={setSub} items={[{ key: "bens", label: "Bens" }, { key: "inventarios", label: "Inventários" }, { key: "categorias", label: "Categorias" }]} />
      {sub === "bens" && (
        <ListTable
          path="/infraestrutura/bens" refreshKey={key}
          filters={[{ key: "estado", label: "Estado", options: ESTADOS }, { key: "status", label: "Situação", options: ["ATIVO", "EM_MANUTENCAO", "BAIXADO"] }, { key: "criticidade", label: "Criticidade", options: CRITICIDADES },
            { key: "categoriaId", label: "Categoria", options: catOpts }]}
          toolbar={
            <>
              <Button startIcon={<DescriptionIcon />} onClick={() => toast.run(() => openHtml("/infraestrutura/relatorios/patrimonio?format=html"), "Relatório aberto em nova aba.")}>Relatório</Button>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ kind: "novo" })}>Novo bem</Button>
            </>
          }
          columns={[
            { key: "tombamento", label: "Tombamento" }, { key: "descricao", label: "Descrição" },
            { key: "categoria", label: "Categoria", render: (r) => r.categoria?.nome || "—" },
            { key: "spaceId", label: "Local", render: (r) => nameOf(spaces, r.spaceId) },
            { key: "estado", label: "Estado", render: (r) => <Tag text={label(r.estado)} tone={estadoTone(r.estado)} /> },
            { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> },
            { key: "valorAquisicao", label: "Aquisição", align: "right", render: (r) => brl(r.valorAquisicao) },
            { key: "contabil", label: "Valor contábil", align: "right", render: (r) => brl(r.depreciacao?.valorContabil) },
          ]}
          actions={(r) => (
            <>
              <Button size="small" onClick={() => setDetail(r.id)}>Ficha</Button>
              {r.status !== "BAIXADO" && <Button size="small" onClick={() => setForm({ kind: "editar", row: r })}>Editar</Button>}
              {r.status !== "BAIXADO" && <Button size="small" onClick={() => setForm({ kind: "transferir", row: r })}>Transferir</Button>}
              {r.status !== "BAIXADO" && <Button size="small" onClick={() => setForm({ kind: "estado", row: r })}>Estado</Button>}
              {r.status !== "BAIXADO"
                ? <Button size="small" color="error" onClick={() => setForm({ kind: "baixar", row: r })}>Baixar</Button>
                : <Button size="small" color="success" onClick={() => toast.run(async () => eduApi.post(`/infraestrutura/bens/${r.id}/reativar`, { motivo: "Reativação pelo painel" }), "Bem reativado.", reload, "Reativar este bem?")}>Reativar</Button>}
            </>
          )}
        />
      )}
      {sub === "inventarios" && <InventarioPanel spaces={spaces} categorias={catOpts} />}
      {sub === "categorias" && (
        <EduResourcePage
          title="Categorias de bens" description="Definem vida útil e valor residual padrão para a depreciação linear." base="/infraestrutura" resource="/categorias-bem"
          columns={[{ key: "codigo", label: "Código" }, { key: "nome", label: "Nome" }, { key: "grupo", label: "Grupo" }, { key: "vidaUtilMeses", label: "Vida útil (meses)" }, { key: "valorResidualPct", label: "Residual %" }, { key: "ativo", label: "Ativa" }]}
          fields={[{ key: "codigo", label: "Código", required: true }, { key: "nome", label: "Nome", required: true }, { key: "grupo", label: "Grupo" },
            { key: "vidaUtilMeses", label: "Vida útil (meses)", type: "number" }, { key: "valorResidualPct", label: "Valor residual (%)", type: "number" }, { key: "ativo", label: "Ativa", type: "bool" }]}
        />
      )}
      <FormDialog open={!!form} title={form ? titleFor[form.kind] : ""} fields={fieldsFor()} initial={form?.kind === "editar" ? form.row : null} onClose={() => setForm(null)} onSubmit={submit} />
      {detail && <BemDetalhe id={detail} onClose={() => setDetail(null)} />}
      {toast.node}
    </Box>
  );
}
