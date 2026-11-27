import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DownloadIcon from "@mui/icons-material/Download";
import EventIcon from "@mui/icons-material/Event";
import { useMemo, useState } from "react";
import { eduApi } from "../../../services/EduApi";
import { baixarArquivo, fetchTexto } from "../common";
import { Status, useApi, useToast } from "../../regulatorio/ui";

type Visao = "dia" | "semana" | "mes";
interface Item { id: string; origem: string; tipo: string; titulo: string; descricao?: string | null; inicio: string; fim: string; diaInteiro: boolean; prioridade: string; local?: string | null; status?: string | null; editavel?: boolean; ref?: { type: string; id: string } | null }

const COR_ORIGEM: Record<string, string> = { reitoria: "#2563eb", calendario: "#0891b2", regulatorio: "#dc2626", dou: "#b91c1c", juridico: "#7c3aed", rh: "#db2777", convenios: "#d97706", governanca: "#16a34a" };
const ROT_ORIGEM: Record<string, string> = { reitoria: "Reitoria", calendario: "Calendário acadêmico", regulatorio: "Regulatório", dou: "Diário Oficial", juridico: "Jurídico", rh: "RH", convenios: "Convênios", governanca: "Governança/CIPA" };
const TIPOS = ["COMPROMISSO", "REUNIAO", "AUDIENCIA", "PRAZO_REGULATORIO", "PRAZO_JURIDICO", "EFEMERIDE", "ANIVERSARIO", "VIAGEM", "OUTRO"];
const PRIOR_COR: Record<string, string> = { CRITICA: "#dc2626", ALTA: "#ea580c", NORMAL: "#64748b", BAIXA: "#94a3b8" };

const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
const addDias = (ymd: string, n: number) => new Date(new Date(`${ymd}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const addMes = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n, 1); return d.toISOString().slice(0, 10); };
const ymdLocal = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const dataLonga = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" });
const SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

function ItemChip({ it, onClick, compacto }: { it: Item; onClick: () => void; compacto?: boolean }) {
  const cor = COR_ORIGEM[it.origem] || "#64748b";
  return (
    <Box onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onClick()}
      sx={{ cursor: "pointer", borderLeft: `4px solid ${cor}`, bgcolor: `${cor}14`, borderRadius: 1, px: 0.8, py: compacto ? 0.1 : 0.5, mb: 0.4, overflow: "hidden" }}>
      <Typography variant="caption" sx={{ display: "block", fontWeight: 700, lineHeight: 1.25, whiteSpace: compacto ? "nowrap" : "normal", textOverflow: "ellipsis", overflow: "hidden", color: it.status === "CANCELADO" ? "text.disabled" : undefined }}>
        {!it.diaInteiro && `${hora(it.inicio)} `}{it.titulo}
      </Typography>
    </Box>
  );
}

function Detalhe({ item, onClose, onChange }: { item: Item; onClose: () => void; onChange: () => void }) {
  const idComp = item.origem === "reitoria" ? item.ref?.id : undefined;
  const { data, reload } = useApi<any>(idComp ? `/reitoria/compromissos/${idComp}` : null);
  const { toast, node } = useToast();
  const [ata, setAta] = useState("");
  const [convNome, setConvNome] = useState("");
  async function agir(path: string, body: any = {}, msg = "Feito.") {
    try { await eduApi.post(`/reitoria/compromissos/${idComp}${path}`, body); toast({ type: "success", text: msg }); reload(); onChange(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function abrirDoc() {
    try { const h = await fetchTexto(`/reitoria/compromissos/${idComp}/documento`); window.open(URL.createObjectURL(new Blob([h], { type: "text/html;charset=utf-8" })), "_blank"); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  const pauta: any[] = (data?.pauta as any[]) || [];
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pr: 6 }}>{item.titulo}</DialogTitle>
      <DialogContent dividers>
        <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: "wrap", gap: 0.5 }}>
          <Chip size="small" label={ROT_ORIGEM[item.origem] || item.origem} sx={{ bgcolor: `${COR_ORIGEM[item.origem] || "#64748b"}22`, fontWeight: 700 }} />
          <Chip size="small" label={item.tipo.replace(/_/g, " ")} />
          <Chip size="small" label={item.prioridade} sx={{ color: "#fff", bgcolor: PRIOR_COR[item.prioridade] }} />
          {item.status && <Chip size="small" variant="outlined" label={item.status} />}
        </Stack>
        <Typography variant="body2">{new Date(item.inicio).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}{!item.diaInteiro && item.fim !== item.inicio ? ` até ${hora(item.fim)}` : ""}</Typography>
        {item.local && <Typography variant="body2" color="text.secondary">Local: {item.local}</Typography>}
        {item.descricao && <Typography variant="body2" sx={{ mt: 1, whiteSpace: "pre-wrap" }}>{item.descricao}</Typography>}
        {!idComp && <Alert severity="info" sx={{ mt: 2 }}>Item consolidado de outro módulo ({ROT_ORIGEM[item.origem] || item.origem}). Edite-o no módulo de origem.</Alert>}
        {idComp && data && (
          <Box sx={{ mt: 2 }}>
            {data.linkVideo && <Typography variant="body2"><a href={data.linkVideo} target="_blank" rel="noreferrer">Entrar na videoconferência</a></Typography>}
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 1 }}>Convidados ({data.convites?.length || 0})</Typography>
            {(data.convites || []).map((c: any) => (
              <Box key={c.id} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Typography variant="body2" sx={{ flex: 1, minWidth: 140 }}>{c.nome} <span style={{ color: "#64748b" }}>({c.papel.toLowerCase()})</span></Typography>
                <Chip size="small" label={c.resposta} color={c.resposta === "ACEITO" ? "success" : c.resposta === "RECUSADO" ? "error" : "default"} />
              </Box>
            ))}
            <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
              <TextField size="small" label="Convidar (nome)" value={convNome} onChange={(e) => setConvNome(e.target.value)} sx={{ flex: 1 }} />
              <Button disabled={convNome.trim().length < 1} onClick={async () => { await agir("/convites", { nome: convNome.trim() }, "Convite adicionado."); setConvNome(""); }}>Convidar</Button>
            </Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2 }}>Pauta</Typography>
            {pauta.length ? <ol style={{ margin: "4px 0", paddingLeft: 20 }}>{pauta.map((p, i) => <li key={i}><Typography variant="body2">{p.titulo}{p.responsavel ? ` — ${p.responsavel}` : ""}{p.minutos ? ` (${p.minutos} min)` : ""}</Typography></li>)}</ol> : <Typography variant="body2" color="text.secondary">Sem pauta.</Typography>}
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2 }}>Ata</Typography>
            {data.ata ? (
              <Box>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{data.ata}</Typography>
                <Typography variant="caption" color="text.secondary">{data.ataAprovadaEm ? `Aprovada em ${new Date(data.ataAprovadaEm).toLocaleDateString("pt-BR")}` : "Ata ainda não aprovada."}</Typography>
                {!data.ataAprovadaEm && <Button size="small" sx={{ ml: 1 }} onClick={() => agir("/ata/aprovar", {}, "Ata aprovada.")}>Aprovar ata</Button>}
              </Box>
            ) : (
              <Box>
                <TextField fullWidth multiline minRows={3} size="small" label="Registrar ata" value={ata} onChange={(e) => setAta(e.target.value)} />
                <Button disabled={ata.trim().length < 10} sx={{ mt: 1 }} onClick={() => agir("/ata", { ata: ata.trim() }, "Ata registrada.")}>Salvar ata</Button>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap" }}>
        {idComp && <Button onClick={abrirDoc}>Pauta e ata (imprimir)</Button>}
        {idComp && item.status !== "CANCELADO" && item.status !== "REALIZADO" && <Button onClick={() => agir("/concluir", {}, "Marcado como realizado.")}>Realizado</Button>}
        {idComp && item.status !== "CANCELADO" && item.status !== "REALIZADO" && <Button color="error" onClick={() => window.confirm("Cancelar este compromisso?") && agir("/cancelar", {}, "Compromisso cancelado.")}>Cancelar</Button>}
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
      {node}
    </Dialog>
  );
}

function NovoDialog({ dia, onClose, onSaved }: { dia: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>({ tipo: "REUNIAO", titulo: "", data: dia, hi: "09:00", hf: "10:00", local: "", linkVideo: "", prioridade: "NORMAL", recorrencia: "NENHUMA", diaInteiro: false, lembrete: "60", convidados: "", pauta: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  async function salvar() {
    setErro(null);
    try {
      const inicio = new Date(`${f.data}T${f.diaInteiro ? "00:00" : f.hi}:00-03:00`).toISOString();
      const fim = new Date(`${f.data}T${f.diaInteiro ? "00:00" : f.hf}:00-03:00`).toISOString();
      const body: any = {
        tipo: f.tipo, titulo: f.titulo.trim(), inicio, fim, diaInteiro: f.diaInteiro, prioridade: f.prioridade, recorrencia: f.recorrencia,
        ...(f.local ? { local: f.local } : {}), ...(f.linkVideo ? { linkVideo: f.linkVideo } : {}), ...(f.lembrete ? { lembretesMin: [Number(f.lembrete)] } : {}),
        convites: f.convidados.split(/[,;\n]/).map((s: string) => s.trim()).filter(Boolean).map((nome: string) => ({ nome })),
        pauta: f.pauta.split("\n").map((s: string) => s.trim()).filter(Boolean).map((titulo: string) => ({ titulo })),
      };
      const r = await eduApi.post<any>("/reitoria/compromissos", body);
      if (r.conflitos?.length) { setAviso(`Salvo, mas conflita com: ${r.conflitos.map((c: any) => c.titulo).join(", ")}.`); onSaved(); return; }
      onSaved(); onClose();
    } catch (e: any) { setErro(e.message); }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={typeof window !== "undefined" && window.innerWidth < 600}>
      <DialogTitle>Novo compromisso</DialogTitle>
      <DialogContent dividers>
        {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}
        {aviso && <Alert severity="warning" sx={{ mb: 2 }}>{aviso}</Alert>}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
          <TextField select size="small" label="Tipo" value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>{TIPOS.map((t) => <MenuItem key={t} value={t}>{t.replace(/_/g, " ")}</MenuItem>)}</TextField>
          <TextField select size="small" label="Prioridade" value={f.prioridade} onChange={(e) => set("prioridade", e.target.value)}>{["BAIXA", "NORMAL", "ALTA", "CRITICA"].map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}</TextField>
          <TextField size="small" label="Título" value={f.titulo} onChange={(e) => set("titulo", e.target.value)} sx={{ gridColumn: { sm: "1 / -1" } }} required />
          <TextField size="small" type="date" label="Data" value={f.data} onChange={(e) => set("data", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField select size="small" label="Repetição" value={f.recorrencia} onChange={(e) => set("recorrencia", e.target.value)}>{[["NENHUMA", "Não repete"], ["SEMANAL", "Toda semana"], ["MENSAL", "Todo mês"], ["ANUAL", "Todo ano"]].map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}</TextField>
          <TextField size="small" type="time" label="Início" value={f.hi} onChange={(e) => set("hi", e.target.value)} disabled={f.diaInteiro} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="time" label="Fim" value={f.hf} onChange={(e) => set("hf", e.target.value)} disabled={f.diaInteiro} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField select size="small" label="Dia inteiro" value={f.diaInteiro ? "1" : "0"} onChange={(e) => set("diaInteiro", e.target.value === "1")}><MenuItem value="0">Não</MenuItem><MenuItem value="1">Sim</MenuItem></TextField>
          <TextField select size="small" label="Lembrete" value={f.lembrete} onChange={(e) => set("lembrete", e.target.value)}>{[["", "Sem lembrete"], ["15", "15 minutos antes"], ["60", "1 hora antes"], ["1440", "1 dia antes"], ["10080", "1 semana antes"]].map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}</TextField>
          <TextField size="small" label="Local" value={f.local} onChange={(e) => set("local", e.target.value)} />
          <TextField size="small" label="Link da videoconferência" value={f.linkVideo} onChange={(e) => set("linkVideo", e.target.value)} />
          <TextField size="small" label="Convidados (separe por vírgula)" value={f.convidados} onChange={(e) => set("convidados", e.target.value)} sx={{ gridColumn: { sm: "1 / -1" } }} />
          <TextField size="small" multiline minRows={3} label="Pauta (um item por linha)" value={f.pauta} onChange={(e) => set("pauta", e.target.value)} sx={{ gridColumn: { sm: "1 / -1" } }} />
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button><Button variant="contained" onClick={salvar} disabled={f.titulo.trim().length < 2}>Salvar</Button></DialogActions>
    </Dialog>
  );
}

export default function AgendaView() {
  const [visao, setVisao] = useState<Visao>("semana");
  const [data, setData] = useState(hoje());
  const [origem, setOrigem] = useState("");
  const [sel, setSel] = useState<Item | null>(null);
  const [novo, setNovo] = useState(false);
  const { data: ag, loading, error, reload } = useApi<any>(`/reitoria/agenda?visao=${visao}&data=${data}${origem ? `&origem=${origem}` : ""}`);
  const { toast, node } = useToast();
  const itens: Item[] = ag?.itens || [];
  const porDia: Record<string, Item[]> = useMemo(() => {
    const m: Record<string, Item[]> = {};
    for (const i of itens) (m[ymdLocal(i.inicio)] ||= []).push(i);
    return m;
  }, [itens]);

  const nav = (n: number) => setData(visao === "mes" ? addMes(data, n) : addDias(data, visao === "semana" ? 7 * n : n));
  const dias = useMemo(() => {
    if (!ag) return [] as string[];
    const ini = ymdLocal(ag.de);
    const total = visao === "dia" ? 1 : visao === "semana" ? 7 : Math.round((new Date(ag.ate).getTime() - new Date(ag.de).getTime()) / 86_400_000);
    const primeiro = Array.from({ length: total }, (_, k) => addDias(ini, k));
    if (visao !== "mes") return primeiro;
    const pad = (new Date(`${ini}T12:00:00Z`).getUTCDay() + 6) % 7;
    return [...Array.from({ length: pad }, () => ""), ...primeiro];
  }, [ag, visao]);

  async function exportar(tipo: "csv" | "ics") {
    try {
      const txt = await fetchTexto(tipo === "csv" ? `/reitoria/agenda?visao=${visao}&data=${data}&formato=csv` : "/reitoria/agenda/ics");
      baixarArquivo(tipo === "csv" ? `agenda-${visao}-${data}.csv` : "agenda-reitoria.ics", txt, tipo === "csv" ? "text/csv;charset=utf-8" : "text/calendar;charset=utf-8");
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }

  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
        <ToggleButtonGroup size="small" exclusive value={visao} onChange={(_, v) => v && setVisao(v)}>
          <ToggleButton value="dia">Dia</ToggleButton><ToggleButton value="semana">Semana</ToggleButton><ToggleButton value="mes">Mês</ToggleButton>
        </ToggleButtonGroup>
        <IconButton onClick={() => nav(-1)} aria-label="Anterior"><ChevronLeftIcon /></IconButton>
        <Button size="small" onClick={() => setData(hoje())}>Hoje</Button>
        <IconButton onClick={() => nav(1)} aria-label="Próximo"><ChevronRightIcon /></IconButton>
        <Typography sx={{ fontWeight: 800, textTransform: "capitalize" }}>{visao === "mes" ? new Date(`${data}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }) : ag?.rotulo ?? data}</Typography>
        <Box sx={{ flex: 1 }} />
        <TextField select size="small" label="Origem" value={origem} onChange={(e) => setOrigem(e.target.value)} sx={{ minWidth: 150 }}>
          <MenuItem value="">Todas</MenuItem>{Object.entries(ROT_ORIGEM).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
        </TextField>
        <Tooltip title="Exportar esta visão (CSV)"><IconButton onClick={() => exportar("csv")}><DownloadIcon /></IconButton></Tooltip>
        <Button size="small" startIcon={<EventIcon />} onClick={() => exportar("ics")}>.ics</Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo(true)}>Novo compromisso</Button>
      </Box>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
        {Object.entries(ag?.porOrigem || {}).map(([k, v]) => <Chip key={k} size="small" label={`${ROT_ORIGEM[k] || k}: ${v}`} sx={{ bgcolor: `${COR_ORIGEM[k] || "#64748b"}22`, fontWeight: 700 }} />)}
        {ag?.modulosOpcionaisAusentes?.length > 0 && <Chip size="small" variant="outlined" label={`Módulos ainda não ativos: ${ag.modulosOpcionaisAusentes.join(", ")}`} />}
        {ag?.fontesIndisponiveis?.length > 0 && <Chip size="small" color="warning" label={`Fontes indisponíveis: ${ag.fontesIndisponiveis.join(", ")}`} />}
      </Box>
      <Status loading={loading && !ag} error={error} onRetry={reload} empty={false}>
        {visao === "mes" ? (
          <Box sx={{ overflowX: "auto" }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(92px, 1fr))", gap: 0.5, minWidth: 660 }}>
              {SEMANA.map((s) => <Typography key={s} variant="caption" sx={{ fontWeight: 800, textAlign: "center", textTransform: "uppercase" }}>{s}</Typography>)}
              {dias.map((d, i) => d === "" ? <Box key={`p${i}`} /> : (
                <Paper key={d} variant="outlined" onClick={() => { setData(d); setVisao("dia"); }} sx={{ minHeight: 84, p: 0.5, cursor: "pointer", bgcolor: d === hoje() ? "action.hover" : undefined, borderColor: d === hoje() ? "primary.main" : undefined }}>
                  <Typography variant="caption" sx={{ fontWeight: 800 }}>{Number(d.slice(8))}</Typography>
                  {(porDia[d] || []).slice(0, 3).map((it) => <ItemChip key={it.id} it={it} compacto onClick={() => setSel(it)} />)}
                  {(porDia[d] || []).length > 3 && <Typography variant="caption" color="text.secondary">+{(porDia[d] || []).length - 3} mais</Typography>}
                </Paper>
              ))}
            </Box>
          </Box>
        ) : (
          <Stack spacing={1.5}>
            {dias.map((d) => (
              <Paper key={d} variant="outlined" sx={{ p: 1.5, borderRadius: 3, borderColor: d === hoje() ? "primary.main" : undefined }}>
                <Typography sx={{ fontWeight: 800, textTransform: "capitalize", mb: 0.5 }}>{dataLonga(d)}{d === hoje() ? " · hoje" : ""}</Typography>
                {(porDia[d] || []).length === 0 ? <Typography variant="body2" color="text.secondary">Nada agendado.</Typography> : (porDia[d] || []).map((it) => <ItemChip key={it.id} it={it} onClick={() => setSel(it)} />)}
              </Paper>
            ))}
          </Stack>
        )}
      </Status>
      {sel && <Detalhe item={sel} onClose={() => setSel(null)} onChange={reload} />}
      {novo && <NovoDialog dia={visao === "dia" ? data : hoje()} onClose={() => setNovo(false)} onSaved={reload} />}
      {node}
    </Box>
  );
}
