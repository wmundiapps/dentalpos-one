import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Pagination, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DownloadIcon from "@mui/icons-material/Download";
import { useState } from "react";
import { eduApi, qsOf } from "../../../services/EduApi";
import { baixarArquivo, fetchTexto } from "../common";
import { Kpi, KpiGrid, Status, label, useApi, useToast } from "../../regulatorio/ui";
import { fmtUn } from "./Charts";

const TIPOS = ["CONVENIO", "ACORDO_COOPERACAO", "TERMO_PARCERIA", "CONTRATO", "ESTAGIO", "INTERNACIONAL", "OUTRO"];
const SIT_COR: Record<string, string> = { VIGENTE: "#16a34a", VENCENDO: "#ea580c", VENCIDO: "#dc2626", SEM_PRAZO: "#64748b", INATIVO: "#94a3b8" };
const dt = (v: any) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");

function Form({ inicial, onClose, onSaved }: { inicial?: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>(inicial ? { ...inicial, inicio: String(inicial.inicio).slice(0, 10), fim: inicial.fim ? String(inicial.fim).slice(0, 10) : "" } : { tipo: "CONVENIO", parteTipo: "EMPRESA", abrangencia: "NACIONAL", inicio: new Date().toISOString().slice(0, 10), fim: "", numero: "", titulo: "", parteNome: "", vigenciaIndeterminada: false });
  const [erro, setErro] = useState<string | null>(null);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  async function salvar() {
    setErro(null);
    try {
      const body: any = {
        numero: f.numero, tipo: f.tipo, titulo: f.titulo, parteNome: f.parteNome, parteTipo: f.parteTipo, abrangencia: f.abrangencia, vigenciaIndeterminada: !!f.vigenciaIndeterminada,
        inicio: new Date(`${f.inicio}T12:00:00`).toISOString(), ...(f.fim && !f.vigenciaIndeterminada ? { fim: new Date(`${f.fim}T12:00:00`).toISOString() } : {}),
        ...(f.parteCnpj ? { parteCnpj: f.parteCnpj } : {}), ...(f.objeto ? { objeto: f.objeto } : {}), ...(f.responsavelNome ? { responsavelNome: f.responsavelNome } : {}),
        ...(f.valor !== "" && f.valor != null ? { valor: Number(f.valor) } : {}), ...(f.pais ? { pais: f.pais } : {}), ...(f.area ? { area: f.area } : {}), renovacaoAutomatica: !!f.renovacaoAutomatica,
      };
      if (inicial) await eduApi.patch(`/reitoria/convenios/${inicial.id}`, body); else await eduApi.post("/reitoria/convenios", body);
      onSaved(); onClose();
    } catch (e: any) { setErro(e.message); }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" fullScreen={typeof window !== "undefined" && window.innerWidth < 600}>
      <DialogTitle>{inicial ? "Editar convênio" : "Novo acordo / convênio"}</DialogTitle>
      <DialogContent dividers>
        {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
          <TextField size="small" label="Número / código" value={f.numero} onChange={(e) => set("numero", e.target.value)} required />
          <TextField select size="small" label="Tipo" value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>{TIPOS.map((t) => <MenuItem key={t} value={t}>{label(t)}</MenuItem>)}</TextField>
          <TextField size="small" label="Título" value={f.titulo} onChange={(e) => set("titulo", e.target.value)} required sx={{ gridColumn: { sm: "1 / -1" } }} />
          <TextField size="small" label="Parte (instituição/empresa)" value={f.parteNome} onChange={(e) => set("parteNome", e.target.value)} required />
          <TextField size="small" label="CNPJ da parte" value={f.parteCnpj || ""} onChange={(e) => set("parteCnpj", e.target.value)} />
          <TextField select size="small" label="Tipo da parte" value={f.parteTipo} onChange={(e) => set("parteTipo", e.target.value)}>{["EMPRESA", "IES", "ORGAO_PUBLICO", "ONG", "OUTRO"].map((t) => <MenuItem key={t} value={t}>{label(t)}</MenuItem>)}</TextField>
          <TextField select size="small" label="Abrangência" value={f.abrangencia} onChange={(e) => set("abrangencia", e.target.value)}><MenuItem value="NACIONAL">Nacional</MenuItem><MenuItem value="INTERNACIONAL">Internacional</MenuItem></TextField>
          <TextField size="small" type="date" label="Início da vigência" value={f.inicio} onChange={(e) => set("inicio", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="date" label="Fim da vigência" value={f.fim || ""} onChange={(e) => set("fim", e.target.value)} disabled={!!f.vigenciaIndeterminada} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField select size="small" label="Vigência indeterminada" value={f.vigenciaIndeterminada ? "1" : "0"} onChange={(e) => set("vigenciaIndeterminada", e.target.value === "1")}><MenuItem value="0">Não</MenuItem><MenuItem value="1">Sim</MenuItem></TextField>
          <TextField select size="small" label="Renovação automática" value={f.renovacaoAutomatica ? "1" : "0"} onChange={(e) => set("renovacaoAutomatica", e.target.value === "1")}><MenuItem value="0">Não</MenuItem><MenuItem value="1">Sim</MenuItem></TextField>
          <TextField size="small" type="number" label="Valor (R$)" value={f.valor ?? ""} onChange={(e) => set("valor", e.target.value)} />
          <TextField size="small" label="Responsável" value={f.responsavelNome || ""} onChange={(e) => set("responsavelNome", e.target.value)} />
          <TextField size="small" label="Área (estágio, pesquisa, mobilidade...)" value={f.area || ""} onChange={(e) => set("area", e.target.value)} />
          <TextField size="small" label="País (se internacional)" value={f.pais || ""} onChange={(e) => set("pais", e.target.value)} />
          <TextField size="small" multiline minRows={2} label="Objeto" value={f.objeto || ""} onChange={(e) => set("objeto", e.target.value)} sx={{ gridColumn: { sm: "1 / -1" } }} />
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button><Button variant="contained" onClick={salvar} disabled={!f.numero || !f.titulo || !f.parteNome}>Salvar</Button></DialogActions>
    </Dialog>
  );
}

function Eventos({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const { data: c, reload } = useApi<any>(`/reitoria/convenios/${id}`);
  const [e, setE] = useState<any>({ tipo: "RENOVACAO", descricao: "", novoFim: "", valor: "" });
  const [erro, setErro] = useState<string | null>(null);
  async function salvar() {
    setErro(null);
    try {
      await eduApi.post(`/reitoria/convenios/${id}/eventos`, { tipo: e.tipo, descricao: e.descricao, ...(e.novoFim ? { novoFim: new Date(`${e.novoFim}T12:00:00`).toISOString() } : {}), ...(e.valor ? { valor: Number(e.valor) } : {}) });
      setE({ tipo: "RENOVACAO", descricao: "", novoFim: "", valor: "" }); reload(); onSaved();
    } catch (x: any) { setErro(x.message); }
  }
  if (!c) return null;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{c.numero} — histórico, aditivos e renovações</DialogTitle>
      <DialogContent dividers>
        {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}
        <Typography variant="body2" sx={{ mb: 1 }}>Vigência: {dt(c.inicio)} a {c.vigenciaIndeterminada ? "indeterminada" : dt(c.fim)} · <Chip size="small" label={label(c.situacao)} sx={{ bgcolor: `${SIT_COR[c.situacao]}22`, fontWeight: 700 }} /></Typography>
        {(c.eventos || []).map((x: any) => <Typography key={x.id} variant="body2">• {dt(x.data)} — <b>{label(x.tipo)}</b>: {x.descricao}{x.novoFim ? ` (nova vigência até ${dt(x.novoFim)})` : ""}{x.valor ? ` (${fmtUn(x.valor, "R$")})` : ""}</Typography>)}
        {!c.eventos?.length && <Typography variant="body2" color="text.secondary">Sem eventos registrados.</Typography>}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5, mt: 2 }}>
          <TextField select size="small" label="Registrar" value={e.tipo} onChange={(x) => setE({ ...e, tipo: x.target.value })}>{["RENOVACAO", "ADITIVO", "ALTERACAO", "RESCISAO", "NOTA"].map((t) => <MenuItem key={t} value={t}>{label(t)}</MenuItem>)}</TextField>
          <TextField size="small" type="date" label="Nova data final" value={e.novoFim} onChange={(x) => setE({ ...e, novoFim: x.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="number" label="Valor do aditivo (R$)" value={e.valor} onChange={(x) => setE({ ...e, valor: x.target.value })} />
          <TextField size="small" label="Descrição" value={e.descricao} onChange={(x) => setE({ ...e, descricao: x.target.value })} />
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button><Button variant="contained" onClick={salvar} disabled={e.descricao.trim().length < 2}>Registrar</Button></DialogActions>
    </Dialog>
  );
}

export default function ConveniosView() {
  const [f, setF] = useState({ q: "", tipo: "", situacao: "" });
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<any | null | false>(false);
  const [ev, setEv] = useState<string | null>(null);
  const { data, loading, error, reload } = useApi<any>(`/reitoria/convenios${qsOf({ ...f, page, pageSize: 20 })}`);
  const { data: p, reload: rp } = useApi<any>("/reitoria/convenios/painel");
  const { toast, node } = useToast();
  const recarregar = () => { reload(); rp(); };
  async function importar(path: string, rotulo: string) {
    try { const r = await eduApi.post(`/reitoria/convenios/${path}`); toast({ type: r.disponivel === false ? "error" : "success", text: r.disponivel === false ? `${rotulo}: módulo ainda não disponível.` : `${rotulo}: ${r.importados} importado(s), ${r.ignorados} já existiam.` }); recarregar(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function csv() { try { baixarArquivo("convenios.csv", await fetchTexto(`/reitoria/convenios${qsOf({ ...f, formato: "csv" })}`), "text/csv;charset=utf-8"); } catch (e: any) { toast({ type: "error", text: e.message }); } }
  return (
    <Box>
      {p && (
        <KpiGrid>
          <Kpi title="Vigentes" value={p.vigentes} hint={`${p.total} no cadastro`} />
          <Kpi title="Vencem em 30 dias" value={p.vencendoEm30} color={p.vencendoEm30 ? "#ea580c" : undefined} hint={`${p.vencendoEm90} em 90 dias`} />
          <Kpi title="Vencidos sem encerrar" value={p.vencidosNaoEncerrados} color={p.vencidosNaoEncerrados ? "#dc2626" : undefined} />
          <Kpi title="Valor dos vigentes" value={fmtUn(p.valorVigente, "R$")} hint={`${p.internacionais} internacional(is)`} />
        </KpiGrid>
      )}
      {p?.alertas?.length > 0 && <Alert severity="warning" sx={{ mb: 2 }}>Atenção: {p.alertas.slice(0, 4).map((a: any) => `${a.numero} (${a.diasRestantes < 0 ? `vencido há ${-a.diasRestantes} d` : `${a.diasRestantes} d`})`).join(" · ")}</Alert>}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2, alignItems: "center" }}>
        <TextField size="small" label="Buscar" value={f.q} onChange={(e) => { setPage(1); setF({ ...f, q: e.target.value }); }} />
        <TextField select size="small" label="Tipo" value={f.tipo} onChange={(e) => { setPage(1); setF({ ...f, tipo: e.target.value }); }} sx={{ minWidth: 150 }}><MenuItem value="">Todos</MenuItem>{TIPOS.map((t) => <MenuItem key={t} value={t}>{label(t)}</MenuItem>)}</TextField>
        <TextField select size="small" label="Situação" value={f.situacao} onChange={(e) => { setPage(1); setF({ ...f, situacao: e.target.value }); }} sx={{ minWidth: 150 }}><MenuItem value="">Todas</MenuItem>{Object.keys(SIT_COR).map((t) => <MenuItem key={t} value={t}>{label(t)}</MenuItem>)}</TextField>
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={() => importar("importar-juridico", "Jurídico")}>Importar do Jurídico</Button>
        <Button size="small" onClick={() => importar("importar-estagio", "Estágios")}>Importar convênios de estágio</Button>
        <Button size="small" startIcon={<DownloadIcon />} onClick={csv}>CSV</Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm(null)}>Novo</Button>
      </Box>
      <Status loading={loading && !data} error={error} onRetry={reload} empty={!data?.items?.length} emptyText="Nenhum acordo ou convênio cadastrado.">
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Número</TableCell><TableCell>Convênio</TableCell><TableCell>Parte</TableCell><TableCell>Vigência</TableCell><TableCell>Situação</TableCell><TableCell align="right">Valor</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>
              {(data?.items || []).map((c: any) => (
                <TableRow key={c.id} hover>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{c.numero}</TableCell>
                  <TableCell sx={{ minWidth: 200 }}><b>{c.titulo}</b><br /><Typography variant="caption" color="text.secondary">{label(c.tipo)}{c.abrangencia === "INTERNACIONAL" ? ` · ${c.pais || "internacional"}` : ""}</Typography></TableCell>
                  <TableCell>{c.parteNome}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{dt(c.inicio)} a {c.vigenciaIndeterminada ? "indet." : dt(c.fim)}</TableCell>
                  <TableCell><Chip size="small" label={`${label(c.situacao)}${c.diasRestantes != null ? ` (${c.diasRestantes}d)` : ""}`} sx={{ bgcolor: `${SIT_COR[c.situacao]}22`, fontWeight: 700 }} /></TableCell>
                  <TableCell align="right">{c.valor != null ? fmtUn(c.valor, "R$") : "—"}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}><Button size="small" onClick={() => setEv(c.id)}>Histórico</Button><Button size="small" onClick={() => setForm(c)}>Editar</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
        <Pagination sx={{ mt: 2 }} count={Math.max(1, Math.ceil((data?.total || 0) / 20))} page={page} onChange={(_, v) => setPage(v)} />
      </Status>
      {form !== false && <Form inicial={form || undefined} onClose={() => setForm(false)} onSaved={recarregar} />}
      {ev && <Eventos id={ev} onClose={() => setEv(null)} onSaved={recarregar} />}
      {node}
    </Box>
  );
}
