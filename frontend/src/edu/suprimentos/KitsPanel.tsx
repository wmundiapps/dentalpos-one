import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import { useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import { Async, FormDialog, Light, Panel, Tag, itemsOf, nameOf, num, useApi, useToast } from "../infraestrutura/kit";
import { useAlmoxarifados, useItens } from "./lookups";

function NovoKit({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const itens = useItens();
  const [f, setF] = useState({ nome: "", descricao: "" });
  const [ls, setLs] = useState([{ itemId: "", fixa: "0", porAluno: "1" }]);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setErr(null);
    try {
      const its = ls.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId, quantidadeFixa: Number(l.fixa) || 0, quantidadePorAluno: Number(l.porAluno) || 0 }));
      if (f.nome.trim().length < 2) throw new Error("Informe o nome do kit.");
      if (!its.length) throw new Error("Informe ao menos um item.");
      await eduApi.post("/suprimentos/kits", { nome: f.nome, descricao: f.descricao || undefined, itens: its });
      onDone(); onClose();
    } catch (e: any) { setErr(e?.message || "Falha ao salvar o kit."); }
  }
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Novo kit de insumos de aula</DialogTitle>
      <DialogContent dividers>
        {err ? <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert> : null}
        <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
          <TextField size="small" label="Nome do kit" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required />
          <TextField size="small" label="Descrição" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        </Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mt: 2, mb: 1 }}>Composição</Typography>
        {ls.map((l, i) => (
          <Box key={i} sx={{ display: "grid", gridTemplateColumns: "3fr 1fr 1fr auto", gap: 1, mb: 1, alignItems: "center" }}>
            <TextField select size="small" label="Item" value={l.itemId} onChange={(e) => setLs(ls.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))}>{itens.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}</TextField>
            <TextField size="small" type="number" label="Fixa/turma" value={l.fixa} onChange={(e) => setLs(ls.map((x, j) => (j === i ? { ...x, fixa: e.target.value } : x)))} />
            <TextField size="small" type="number" label="Por aluno" value={l.porAluno} onChange={(e) => setLs(ls.map((x, j) => (j === i ? { ...x, porAluno: e.target.value } : x)))} />
            <IconButton size="small" onClick={() => setLs(ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)}><DeleteOutlinedIcon fontSize="small" /></IconButton>
          </Box>
        ))}
        <Button startIcon={<AddIcon />} onClick={() => setLs([...ls, { itemId: "", fixa: "0", porAluno: "1" }])}>Adicionar item</Button>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" onClick={go}>Salvar kit</Button></DialogActions>
    </Dialog>
  );
}

function Disponibilidade({ kit, onClose }: { kit: any; onClose: () => void }) {
  const [n, setN] = useState("20");
  const [alm, setAlm] = useState("");
  const almox = useAlmoxarifados();
  const itens = useItens();
  const st = useApi<any>(`/suprimentos/kits/${kit.id}/disponibilidade${qsOf({ numeroAlunos: n, almoxarifadoId: alm })}`);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800 }}>Disponibilidade — {kit.nome}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
          <TextField size="small" type="number" label="Nº de alunos" value={n} onChange={(e) => setN(e.target.value)} sx={{ width: 130 }} />
          <TextField select size="small" label="Almoxarifado" value={alm} onChange={(e) => setAlm(e.target.value)} sx={{ minWidth: 220 }}><MenuItem value="">Todos</MenuItem>{almox.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}</TextField>
        </Box>
        <Async state={st}>
          {(d) => (
            <Box sx={{ display: "grid", gap: 1 }}>
              <Alert severity={d.suficiente ? "success" : "warning"}>{d.suficiente ? "Estoque suficiente para a aula." : "Há itens em falta para esta aula."}</Alert>
              {(d.itens || []).map((l: any) => (
                <Box key={l.itemId} sx={{ display: "flex", gap: 1, alignItems: "center", justifyContent: "space-between" }}>
                  <Typography variant="body2">{nameOf(itens, l.itemId)} — precisa {num(l.quantidade, 3)}, tem {num(l.disponivel, 3)}</Typography>
                  <Light tone={l.faltante > 0 ? "error" : "success"} text={l.faltante > 0 ? `faltam ${num(l.faltante, 3)}` : "ok"} />
                </Box>
              ))}
            </Box>
          )}
        </Async>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

export default function KitsPanel() {
  const [key, setKey] = useState(0);
  const st = useApi<any>(`/suprimentos/kits?ativo=true&k=${key}`);
  const [novo, setNovo] = useState(false);
  const [disp, setDisp] = useState<any | null>(null);
  const [dlg, setDlg] = useState<{ kind: "consumir" | "solicitar"; kit: any } | null>(null);
  const itens = useItens();
  const almox = useAlmoxarifados();
  const toast = useToast();
  const reload = () => setKey((k) => k + 1);
  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}><Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo(true)}>Novo kit</Button></Box>
      <Async state={st}>
        {(d) => (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 2 }}>
            {itemsOf(d).map((k: any) => (
              <Panel key={k.id} title={k.nome} subtitle={k.descricao}>
                <Box sx={{ display: "grid", gap: 0.5, mb: 1 }}>
                  {(k.itens || []).map((i: any) => <Typography key={i.id} variant="body2">{nameOf(itens, i.itemId)} <Tag text={`${i.quantidadeFixa ? `${num(i.quantidadeFixa, 2)} fixa` : ""}${i.quantidadeFixa && i.quantidadePorAluno ? " + " : ""}${i.quantidadePorAluno ? `${num(i.quantidadePorAluno, 2)}/aluno` : ""}`} /></Typography>)}
                </Box>
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                  <Button size="small" onClick={() => setDisp(k)}>Disponibilidade</Button>
                  <Button size="small" color="success" onClick={() => setDlg({ kind: "consumir", kit: k })}>Baixar para aula</Button>
                  <Button size="small" onClick={() => setDlg({ kind: "solicitar", kit: k })}>Solicitar compra</Button>
                  <Button size="small" color="error" onClick={() => toast.run(() => eduApi.del(`/suprimentos/kits/${k.id}`), "Kit desativado.", reload, `Desativar o kit "${k.nome}"?`)}>Desativar</Button>
                </Box>
              </Panel>
            ))}
            {!itemsOf(d).length && <Typography color="text.secondary">Nenhum kit cadastrado.</Typography>}
          </Box>
        )}
      </Async>
      <NovoKit open={novo} onClose={() => setNovo(false)} onDone={() => { toast.ok("Kit criado."); reload(); }} />
      {disp && <Disponibilidade kit={disp} onClose={() => setDisp(null)} />}
      <FormDialog open={!!dlg} onClose={() => setDlg(null)} title={dlg?.kind === "consumir" ? `Baixar kit para aula — ${dlg.kit.nome}` : `Solicitar kit — ${dlg?.kit?.nome || ""}`} submitLabel={dlg?.kind === "consumir" ? "Dar baixa" : "Solicitar"}
        fields={[{ key: "almoxarifadoId", label: "Almoxarifado", type: "select", options: almox, required: true }, { key: "numeroAlunos", label: "Nº de alunos", type: "number", required: true }, { key: "multiplicador", label: "Nº de aulas/turmas (multiplicador)", type: "number", def: 1 },
          ...(dlg?.kind === "solicitar" ? [{ key: "necessarioEm", label: "Necessário até", type: "date" as const }] : [])]}
        onSubmit={async (b) => { await eduApi.post(`/suprimentos/kits/${dlg!.kit.id}/${dlg!.kind === "consumir" ? "consumir" : "solicitar"}`, b); toast.ok(dlg!.kind === "consumir" ? "Baixa registrada." : "Requisição criada."); reload(); }} />
      {toast.node}
    </Box>
  );
}
