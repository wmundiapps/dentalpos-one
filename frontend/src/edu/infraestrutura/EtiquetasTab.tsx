import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, TextField, Typography } from "@mui/material";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import PrintIcon from "@mui/icons-material/Print";
import AddIcon from "@mui/icons-material/Add";
import { useMemo, useState } from "react";
import { eduApi } from "../../services/EduApi";
import ListTable from "./ListTable";
import { Async, FormDialog, Panel, Tag, itemsOf, useApi, useSpaces, useToast, type Field } from "./kit";
import { abrirArquivo, useCategoriasBem, useDepartamentos } from "./cppKit";

const CAMPOS = ["instituicao", "codigo", "nome", "departamento", "local", "responsavel", "categoria"];

export default function EtiquetasTab() {
  const layouts = useApi<any>("/infraestrutura/etiquetas/layouts");
  const spaces = useSpaces();
  const deps = useDepartamentos();
  const cats = useCategoriasBem();
  const toast = useToast();
  const [layoutId, setLayoutId] = useState("");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [filtro, setFiltro] = useState<{ spaceId: string; departamentoId: string; categoriaId: string }>({ spaceId: "", departamentoId: "", categoriaId: "" });
  const [copias, setCopias] = useState(1);
  const [pular, setPular] = useState(0);
  const [novo, setNovo] = useState(false);
  const ids = useMemo(() => Object.keys(sel).filter((k) => sel[k]), [sel]);
  const itens: any[] = layouts.data?.items || [];
  const atual = itens.find((l) => l.id === layoutId) || itens.find((l) => l.padrao) || itens[0];

  const gerar = (formato: "pdf" | "html") => {
    const usarFiltro = !ids.length;
    if (usarFiltro && !filtro.spaceId && !filtro.departamentoId && !filtro.categoriaId) { toast.err("Marque bens na lista ou escolha um filtro (local, departamento ou categoria)."); return; }
    const body: any = { layoutId: atual?.id, formato, copias, pularPosicoes: atual?.formato === "A4_COLUNAS" ? pular : 0 };
    if (ids.length) body.ids = ids; else Object.entries(filtro).forEach(([k, v]) => v && (body[k] = v));
    return toast.run(async () => { const r = await abrirArquivo("POST", "/infraestrutura/etiquetas/gerar", body); return r; }, formato === "pdf" ? "PDF aberto em nova aba." : "Página de impressão aberta.");
  };

  const campos: Field[] = [
    { key: "nome", label: "Nome do layout", required: true },
    { key: "formato", label: "Formato", type: "select", options: ["A4_COLUNAS", "ROLO"], def: "A4_COLUNAS", required: true },
    { key: "larguraMm", label: "Largura da etiqueta (mm)", type: "number", required: true, def: 63.5 }, { key: "alturaMm", label: "Altura da etiqueta (mm)", type: "number", required: true, def: 33.9 },
    { key: "colunas", label: "Colunas (A4)", type: "number", def: 3 }, { key: "linhas", label: "Linhas (A4)", type: "number", def: 8 },
    { key: "margemSupMm", label: "Margem superior (mm)", type: "number", def: 10 }, { key: "margemEsqMm", label: "Margem esquerda (mm)", type: "number", def: 7 },
    { key: "gapXMm", label: "Espaço horizontal (mm)", type: "number", def: 2.5 }, { key: "gapYMm", label: "Espaço vertical (mm)", type: "number", def: 0 },
    { key: "campos", label: "Campos (separados por vírgula)", type: "list", def: ["codigo", "nome", "departamento"], helper: CAMPOS.join(", "), full: true },
    { key: "qrPosicao", label: "QR Code", type: "select", options: ["ESQUERDA", "DIREITA"], def: "ESQUERDA" },
    { key: "fonteBasePt", label: "Fonte base (pt)", type: "number", def: 7 },
    { key: "mostrarQr", label: "Mostrar QR Code", type: "bool", def: true }, { key: "mostrarBarras", label: "Mostrar código de barras", type: "bool", def: true },
    { key: "borda", label: "Borda", type: "bool", def: true }, { key: "padrao", label: "Layout padrão", type: "bool" },
  ];

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Panel title="Etiquetas patrimoniais" subtitle="QR Code e código de barras Code 128 com código, nome e departamento. Impressão em lote em folha A4 (colunas) ou rolo térmico."
        actions={<Button startIcon={<AddIcon />} onClick={() => setNovo(true)}>Novo layout</Button>}>
        <Async state={layouts}>
          {() => (
            <Box sx={{ display: "grid", gap: 2 }}>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr 1fr" }, gap: 2 }}>
                <TextField select size="small" label="Layout" value={atual?.id || ""} onChange={(e) => setLayoutId(e.target.value)}>
                  {itens.map((l) => <MenuItem key={l.id} value={l.id}>{l.nome}{l.padrao ? " (padrão)" : ""}{l.predefinido ? " — predefinido" : ""}</MenuItem>)}
                </TextField>
                <TextField size="small" type="number" label="Cópias de cada etiqueta" value={copias} onChange={(e) => setCopias(Math.max(1, Number(e.target.value) || 1))} />
                <TextField size="small" type="number" label="Pular posições (folha parcial)" value={pular} disabled={atual?.formato !== "A4_COLUNAS"} onChange={(e) => setPular(Math.max(0, Number(e.target.value) || 0))} />
              </Box>
              {atual && (
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  <Tag text={atual.formato === "ROLO" ? "Rolo" : `A4 ${atual.colunas}×${atual.linhas}`} /><Tag text={`${atual.larguraMm}×${atual.alturaMm} mm`} />
                  {atual.mostrarQr && <Tag text="QR Code" tone="info" />}{atual.mostrarBarras && <Tag text="Code 128" tone="info" />}
                  {(atual.campos || []).map((c: string) => <Tag key={c} text={c} />)}
                </Box>
              )}
            </Box>
          )}
        </Async>
      </Panel>
      <Panel title="Quais bens imprimir" subtitle="Marque os bens na lista ou, sem marcar nenhum, imprima tudo que corresponde ao filtro.">
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2, mb: 2 }}>
          <TextField select size="small" label="Local" value={filtro.spaceId} onChange={(e) => setFiltro({ ...filtro, spaceId: e.target.value })}><MenuItem value="">Todos</MenuItem>{spaces.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}</TextField>
          <TextField select size="small" label="Departamento" value={filtro.departamentoId} onChange={(e) => setFiltro({ ...filtro, departamentoId: e.target.value })}><MenuItem value="">Todos</MenuItem>{deps.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}</TextField>
          <TextField select size="small" label="Categoria" value={filtro.categoriaId} onChange={(e) => setFiltro({ ...filtro, categoriaId: e.target.value })}><MenuItem value="">Todas</MenuItem>{cats.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}</TextField>
        </Box>
        <ListTable path="/infraestrutura/bens" pageSize={15} extraQuery={{ status: "ATIVO", spaceId: filtro.spaceId, departamentoId: filtro.departamentoId, categoriaId: filtro.categoriaId }}
          columns={[
            { key: "sel", label: "", width: 40, render: (r) => <Checkbox size="small" checked={!!sel[r.id]} onChange={(e) => setSel({ ...sel, [r.id]: e.target.checked })} /> },
            { key: "tombamento", label: "Tombamento" }, { key: "descricao", label: "Descrição" },
            { key: "departamentoId", label: "Departamento", render: (r) => deps.find((d) => d.value === r.departamentoId)?.label || "—" },
            { key: "spaceId", label: "Local", render: (r) => spaces.find((s) => s.value === r.spaceId)?.label || "—" },
          ]} />
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 2, alignItems: "center" }}>
          <Button variant="contained" startIcon={<PictureAsPdfIcon />} onClick={() => gerar("pdf")}>Gerar PDF</Button>
          <Button startIcon={<PrintIcon />} onClick={() => gerar("html")}>Abrir para imprimir</Button>
          <FormControlLabel control={<Checkbox size="small" checked={ids.length > 0} onChange={() => setSel({})} />} label={`${ids.length} bem(ns) marcado(s) — desmarcar`} />
        </Box>
        <Alert severity="info" sx={{ mt: 2 }}>Imprima em escala 100% (sem “ajustar à página”). Para rolo térmico escolha um layout de rolo: cada etiqueta sai em uma página do tamanho exato.</Alert>
      </Panel>
      <FormDialog open={novo} title="Novo layout de etiqueta" fields={campos} onClose={() => setNovo(false)}
        onSubmit={async (b) => { await eduApi.post("/infraestrutura/etiquetas/layouts", b); toast.ok("Layout criado."); layouts.reload(); }} />
      {toast.node}
      <Typography variant="caption" color="text.secondary">{itemsOf(layouts.data).length} layout(s) disponíveis.</Typography>
    </Box>
  );
}
