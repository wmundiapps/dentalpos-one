import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Pagination, Paper, Switch, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { useRef, useState } from "react";
import EduResourcePage, { type FieldDef } from "../../EduResourcePage";
import { eduApi, qsOf } from "../../../services/EduApi";
import { baixarArquivo, fetchTexto } from "../common";
import { Kpi, KpiGrid, Section, Status, label, useApi, useToast } from "../../regulatorio/ui";

const REL_COR: Record<string, string> = { ALTA: "#dc2626", MEDIA: "#ea580c", BAIXA: "#64748b", NENHUMA: "#94a3b8" };
const STATUS = ["NOVA", "EM_ANALISE", "EM_TRATAMENTO", "CONCLUIDA", "DESCARTADA"];
const TEMAS = ["AUTORIZACAO", "RECONHECIMENTO", "RENOVACAO", "CREDENCIAMENTO", "ENADE_CPC", "FIES_PROUNI", "EAD", "SUPERVISAO", "PENALIDADE", "REGULAMENTACAO", "OUTRO"];
const dt = (v: any) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");

function Tratar({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const { data: p, reload } = useApi<any>(`/reitoria/dou/publicacoes/${id}`);
  const [f, setF] = useState<any>({});
  const [erro, setErro] = useState<string | null>(null);
  const { toast, node } = useToast();
  const val = (k: string, dflt: any = "") => (f[k] !== undefined ? f[k] : p?.[k] ?? dflt);
  async function salvar() {
    setErro(null);
    try {
      const body: any = { ...f };
      if (body.prazoAcaoEm) body.prazoAcaoEm = new Date(`${body.prazoAcaoEm}T12:00:00`).toISOString();
      await eduApi.patch(`/reitoria/dou/publicacoes/${id}`, body);
      toast({ type: "success", text: "Tratamento salvo." }); setF({}); reload(); onSaved();
    } catch (e: any) { setErro(e.message); }
  }
  async function acao(path: string, body: any, ok: string) { try { await eduApi.post(`/reitoria/dou/publicacoes/${id}${path}`, body); toast({ type: "success", text: ok }); reload(); onSaved(); } catch (e: any) { setErro(e.message); } }
  if (!p) return null;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" fullScreen={typeof window !== "undefined" && window.innerWidth < 600}>
      <DialogTitle sx={{ pr: 6 }}>{p.titulo}</DialogTitle>
      <DialogContent dividers>
        {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}
        <Box sx={{ display: "flex", gap: 0.8, flexWrap: "wrap", mb: 1.5 }}>
          <Chip size="small" label={`Relevância ${p.relevancia}`} sx={{ bgcolor: REL_COR[p.relevancia], color: "#fff" }} />
          <Chip size="small" label={label(p.tema)} /><Chip size="small" label={p.orgao || "—"} /><Chip size="small" label={label(p.tipoAto)} />
          <Chip size="small" variant="outlined" label={`Publicado em ${dt(p.dataPublicacao)}${p.secao ? ` · Seção ${p.secao}` : ""}${p.pagina ? ` · p. ${p.pagina}` : ""}`} />
          {p.url && <Chip size="small" component="a" clickable href={p.url} target="_blank" rel="noreferrer" label="Abrir no DOU" />}
        </Box>
        {p.palavrasEncontradas?.length > 0 && <Typography variant="body2" sx={{ mb: 1 }}>Palavras encontradas: {p.palavrasEncontradas.map((w: string) => <Chip key={w} size="small" label={w} sx={{ mr: 0.5 }} />)}</Typography>}
        {p.ementa && <Typography sx={{ fontWeight: 700, mb: 1 }}>{p.ementa}</Typography>}
        {p.texto && <Paper variant="outlined" sx={{ p: 1.5, maxHeight: 180, overflow: "auto", whiteSpace: "pre-wrap", fontSize: 13, mb: 2 }}>{p.texto}</Paper>}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
          <TextField select size="small" label="Status" value={val("status", "NOVA")} onChange={(e) => setF({ ...f, status: e.target.value })}>{STATUS.map((s) => <MenuItem key={s} value={s}>{label(s)}</MenuItem>)}</TextField>
          <TextField size="small" type="date" label="Prazo de ação" value={String(f.prazoAcaoEm ?? p.prazoAcaoEm ?? "").slice(0, 10)} onChange={(e) => setF({ ...f, prazoAcaoEm: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" label="Responsável (nome)" value={val("responsavelNome")} onChange={(e) => setF({ ...f, responsavelNome: e.target.value })} />
          <TextField select size="small" label="Relevância" value={val("relevancia", "MEDIA")} onChange={(e) => setF({ ...f, relevancia: e.target.value })}>{["ALTA", "MEDIA", "BAIXA", "NENHUMA"].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}</TextField>
          <TextField select size="small" label="Tema" value={val("tema", "OUTRO")} onChange={(e) => setF({ ...f, tema: e.target.value })}>{TEMAS.map((s) => <MenuItem key={s} value={s}>{label(s)}</MenuItem>)}</TextField>
          <TextField size="small" multiline minRows={2} label="Observações do tratamento" value={val("observacoes")} onChange={(e) => setF({ ...f, observacoes: e.target.value })} sx={{ gridColumn: { sm: "1 / -1" } }} />
        </Box>
        <Box sx={{ mt: 2, display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
          <Typography variant="body2">Ato regulatório: {p.regAto ? <b>{label(p.regAto.tipo)} nº {p.regAto.numero}{p.regAto.referenciaDou ? ` (${p.regAto.referenciaDou})` : ""}</b> : "não vinculado"}</Typography>
          {!p.regAtoId && p.numero && <Button size="small" onClick={() => acao("/criar-ato", {}, "Ato criado e vinculado no Regulatório.")}>Criar/vincular ato no Regulatório</Button>}
          {p.regAtoId && <Button size="small" onClick={() => acao("/vincular-ato", { regAtoId: null }, "Vínculo removido.")}>Desvincular</Button>}
          <Button size="small" onClick={() => acao("/reclassificar", {}, "Reclassificada.")}>Reclassificar</Button>
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button><Button variant="contained" disabled={!Object.keys(f).length} onClick={salvar}>Salvar tratamento</Button></DialogActions>
      {node}
    </Dialog>
  );
}

function Publicacoes() {
  const [f, setF] = useState<Record<string, string>>({ status: "", relevancia: "", tema: "", q: "" });
  const [page, setPage] = useState(1);
  const [aberta, setAberta] = useState<string | null>(null);
  const { data, loading, error, reload } = useApi<any>(`/reitoria/dou/publicacoes${qsOf({ ...f, page, pageSize: 20 })}`);
  const { data: painel, reload: rp } = useApi<any>("/reitoria/dou/painel");
  const { toast, node } = useToast();
  async function csv() { try { baixarArquivo("dou-publicacoes.csv", await fetchTexto(`/reitoria/dou/publicacoes${qsOf({ ...f, formato: "csv", pageSize: 200 })}`), "text/csv;charset=utf-8"); } catch (e: any) { toast({ type: "error", text: e.message }); } }
  const items: any[] = data?.items || [];
  return (
    <Box>
      {painel && (
        <KpiGrid>
          <Kpi title="Novas / em aberto" value={(painel.porStatus.NOVA || 0) + (painel.porStatus.EM_ANALISE || 0) + (painel.porStatus.EM_TRATAMENTO || 0)} hint={`${painel.abertasPorRelevancia.ALTA || 0} de relevância alta`} color={REL_COR.ALTA} />
          <Kpi title="Prazos vencidos" value={painel.atrasadas} color={painel.atrasadas ? REL_COR.ALTA : undefined} hint={`${painel.vencendoEm7Dias} vencem em 7 dias`} />
          <Kpi title="Sem responsável" value={painel.semResponsavel} hint="relevância alta/média" />
          <Kpi title="Palavras-chave ativas" value={painel.palavrasAtivas} hint={painel.semPalavras || undefined} />
        </KpiGrid>
      )}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr) auto" }, gap: 1, mb: 2 }}>
        <TextField size="small" label="Buscar" value={f.q} onChange={(e) => { setPage(1); setF({ ...f, q: e.target.value }); }} sx={{ gridColumn: { xs: "1 / -1", md: "auto" } }} />
        <TextField select size="small" label="Status" value={f.status} onChange={(e) => { setPage(1); setF({ ...f, status: e.target.value }); }}><MenuItem value="">Todos</MenuItem>{STATUS.map((s) => <MenuItem key={s} value={s}>{label(s)}</MenuItem>)}</TextField>
        <TextField select size="small" label="Relevância" value={f.relevancia} onChange={(e) => { setPage(1); setF({ ...f, relevancia: e.target.value }); }}><MenuItem value="">Todas</MenuItem>{["ALTA", "MEDIA", "BAIXA"].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}</TextField>
        <TextField select size="small" label="Tema" value={f.tema} onChange={(e) => { setPage(1); setF({ ...f, tema: e.target.value }); }}><MenuItem value="">Todos</MenuItem>{TEMAS.map((s) => <MenuItem key={s} value={s}>{label(s)}</MenuItem>)}</TextField>
        <Button startIcon={<DownloadIcon />} onClick={csv}>CSV</Button>
      </Box>
      <Status loading={loading && !data} error={error} onRetry={reload} empty={!items.length} emptyText="Nenhuma publicação. Importe o XML do INLABS, um RSS ou cole o texto na aba Importar.">
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Data</TableCell><TableCell>Publicação</TableCell><TableCell>Relevância</TableCell><TableCell>Tema</TableCell><TableCell>Prazo</TableCell><TableCell>Status</TableCell><TableCell>Responsável</TableCell></TableRow></TableHead>
            <TableBody>
              {items.map((p) => (
                <TableRow key={p.id} hover sx={{ cursor: "pointer" }} onClick={() => setAberta(p.id)}>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{dt(p.dataPublicacao)}</TableCell>
                  <TableCell sx={{ minWidth: 240 }}><b>{p.titulo}</b><br /><Typography variant="caption" color="text.secondary">{p.orgao} · {label(p.tipoAto)}{p.regAtoId ? " · vinculada ao Regulatório" : ""}</Typography></TableCell>
                  <TableCell><Chip size="small" label={p.relevancia} sx={{ bgcolor: REL_COR[p.relevancia], color: "#fff" }} /></TableCell>
                  <TableCell>{label(p.tema)}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap", color: p.prazoAcaoEm && new Date(p.prazoAcaoEm) < new Date() && !["CONCLUIDA", "DESCARTADA"].includes(p.status) ? "error.main" : undefined }}>{dt(p.prazoAcaoEm)}</TableCell>
                  <TableCell>{label(p.status)}</TableCell><TableCell>{p.responsavelNome || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
        <Pagination sx={{ mt: 2 }} count={Math.max(1, Math.ceil((data?.total || 0) / 20))} page={page} onChange={(_, v) => setPage(v)} />
      </Status>
      {aberta && <Tratar id={aberta} onClose={() => setAberta(null)} onSaved={() => { reload(); rp(); }} />}
      {node}
    </Box>
  );
}

function Importar() {
  const [formato, setFormato] = useState("XML");
  const [conteudo, setConteudo] = useState("");
  const [url, setUrl] = useState("");
  const [dry, setDry] = useState(true);
  const [res, setRes] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const arq = useRef<HTMLInputElement>(null);
  async function enviar() {
    setErro(null); setRes(null); setBusy(true);
    try { setRes(await eduApi.post("/reitoria/dou/importar", { formato, ...(conteudo ? { conteudo } : {}), ...(!conteudo && url ? { url } : {}), dryRun: dry, dataPadrao: new Date().toISOString().slice(0, 10) })); } catch (e: any) { setErro(e.message); } finally { setBusy(false); }
  }
  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Importe o <b>XML do INLABS</b> (já descompactado), um <b>RSS/Atom</b> do DOU ou <b>cole o texto</b> das publicações (separe por uma linha com ---). Só são gravadas as publicações relevantes para a instituição, conforme as palavras-chave. Use “Simular” para ver o resultado antes de gravar.
      </Alert>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "200px 1fr" }, gap: 2, mb: 2 }}>
        <TextField select size="small" label="Formato" value={formato} onChange={(e) => setFormato(e.target.value)}>
          <MenuItem value="XML">XML do INLABS</MenuItem><MenuItem value="RSS">RSS / Atom</MenuItem><MenuItem value="TEXTO">Texto colado</MenuItem>
        </TextField>
        <TextField size="small" label="URL da fonte (https) — alternativa ao conteúdo" value={url} onChange={(e) => setUrl(e.target.value)} disabled={formato === "TEXTO"} />
      </Box>
      <TextField fullWidth multiline minRows={8} maxRows={18} label="Conteúdo (XML, RSS ou texto)" value={conteudo} onChange={(e) => setConteudo(e.target.value)} sx={{ mb: 1, "& textarea": { fontFamily: "monospace", fontSize: 12 } }} />
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <input ref={arq} type="file" accept=".xml,.txt,.rss" hidden onChange={async (e) => { const fl = e.target.files?.[0]; if (fl) setConteudo(await fl.text()); e.target.value = ""; }} />
        <Button startIcon={<UploadFileIcon />} onClick={() => arq.current?.click()}>Carregar arquivo</Button>
        <FormControlLabel control={<Switch checked={dry} onChange={(e) => setDry(e.target.checked)} />} label="Apenas simular" />
        <Button variant="contained" disabled={busy || (!conteudo && !url)} onClick={enviar}>{dry ? "Simular" : "Importar"}</Button>
      </Box>
      {erro && <Alert severity="error" sx={{ mt: 2 }}>{erro}</Alert>}
      {res && (
        <Alert severity="success" sx={{ mt: 2 }}>
          {res.total} publicação(ões) lida(s): {res.novas} {res.previa ? "seriam gravadas" : "gravadas"}, {res.duplicadas} já existiam, {res.descartadas} sem relevância.
          {res.previa?.map((p: any, i: number) => <div key={i}>• {p.titulo} — {p.relevancia} / {label(p.tema)}</div>)}
        </Alert>
      )}
    </Box>
  );
}

const F_PALAVRA: FieldDef[] = [
  { key: "termo", label: "Termo (nome, CNPJ, código e-MEC, curso...)", required: true },
  { key: "tipo", label: "Tipo", type: "select", options: ["INSTITUICAO", "CNPJ", "EMEC", "CURSO", "ORGAO", "OUTRO"].map((v) => ({ value: v, label: label(v) })), defaultValue: "OUTRO" },
  { key: "peso", label: "Peso (1 a 10)", type: "number", defaultValue: 5 },
  { key: "ativo", label: "Ativa", type: "bool", defaultValue: true },
];
const F_FONTE: FieldDef[] = [
  { key: "nome", label: "Nome", required: true },
  { key: "tipo", label: "Tipo", type: "select", options: [{ value: "INLABS_XML", label: "INLABS (XML)" }, { value: "RSS", label: "RSS / Atom" }, { value: "MANUAL", label: "Manual" }], defaultValue: "INLABS_XML" },
  { key: "url", label: "URL (https)" },
  { key: "ativo", label: "Coletar automaticamente", type: "bool", defaultValue: true },
];

function Palavras() {
  const { toast, node } = useToast();
  return (
    <Box>
      <Box sx={{ mb: 2 }}><Button variant="outlined" onClick={async () => { try { const r = await eduApi.post("/reitoria/dou/palavras/sugerir"); toast({ type: "success", text: `${r.criadas} palavra(s) criada(s) a partir da Identidade e dos cursos.` }); } catch (e: any) { toast({ type: "error", text: e.message }); } }}>Sugerir a partir do cadastro (nome, CNPJ, e-MEC, cursos)</Button></Box>
      <EduResourcePage title="Palavras-chave da instituição" base="/reitoria/dou" resource="/palavras" fields={F_PALAVRA}
        description="O monitor só guarda publicações em que aparecem estes termos (CNPJ casa por dígitos; código e-MEC como número inteiro)."
        columns={[{ key: "termo", label: "Termo" }, { key: "tipo", label: "Tipo", render: (r) => label(r.tipo) }, { key: "peso", label: "Peso" }, { key: "ativo", label: "Ativa", render: (r) => (r.ativo ? "Sim" : "Não") }]} />
      {node}
    </Box>
  );
}

function Fontes() {
  const { toast, node } = useToast();
  const { data } = useApi<any>("/reitoria/dou/fontes?pageSize=100");
  const [sel, setSel] = useState("");
  const urls = ((data?.items as any[]) || []).filter((f) => f.tipo !== "MANUAL" && f.url);
  async function coletar() {
    try { const r = await eduApi.post("/reitoria/dou/coletar", { fonteId: sel }); toast({ type: "success", text: `Coleta concluída: ${r.total} lida(s), ${r.novas} nova(s), ${r.duplicadas} já existiam.` }); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
        <TextField select size="small" label="Coletar agora" value={sel} onChange={(e) => setSel(e.target.value)} sx={{ minWidth: 260 }}>{urls.map((f) => <MenuItem key={f.id} value={f.id}>{f.nome}</MenuItem>)}</TextField>
        <Button variant="outlined" disabled={!sel} onClick={coletar}>Coletar</Button>
      </Box>
      <EduResourcePage title="Fontes de coleta" base="/reitoria/dou" resource="/fontes" fields={F_FONTE}
        description="Fontes com URL são coletadas pelo job diário quando ativas. O INLABS exige XML descompactado."
        columns={[{ key: "nome", label: "Nome" }, { key: "tipo", label: "Tipo", render: (r) => label(r.tipo) }, { key: "url", label: "URL" }, { key: "ultimaColetaEm", label: "Última coleta", render: (r) => (r.ultimaColetaEm ? new Date(r.ultimaColetaEm).toLocaleString("pt-BR") : "—") }, { key: "ultimaColetaStatus", label: "Resultado" }]} />
      {node}
    </Box>
  );
}

export default function DouView() {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        <Tab label="Publicações" /><Tab label="Importar / colar" /><Tab label="Palavras-chave" /><Tab label="Fontes" />
      </Tabs>
      {tab === 0 && <Publicacoes />}{tab === 1 && <Importar />}{tab === 2 && <Palavras />}{tab === 3 && <Fontes />}
      <Section title="Como funciona"><Typography variant="body2" color="text.secondary">As publicações do Diário Oficial são classificadas por relevância e tema, recebem prazo de ação e responsável, e podem ser vinculadas a um ato do Regulatório (a referência do DOU é preenchida automaticamente).</Typography></Section>
    </Box>
  );
}
