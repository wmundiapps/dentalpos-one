import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, LinearProgress, MenuItem, Paper, Tab, Tabs, TextField, Tooltip, Typography,
} from "@mui/material";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import CloseIcon from "@mui/icons-material/Close";
import ListAltIcon from "@mui/icons-material/ListAlt";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { eduApi } from "../../services/EduApi";
import { itemsOf, brl } from "../infraestrutura/kit";
import { AvisoBiometria, FaixaResultado, ROTULO_STATUS, STATUS_COR, TIPO_ROTULO, hora } from "./comum";
import IdentificaPessoa, { type Identificacao } from "./IdentificaPessoa";
import QrLeitor from "./QrLeitor";

type Res = { tipo: "ok" | "aviso" | "erro"; titulo: string; detalhe?: string } | null;

/** Mostra um resultado por alguns segundos. */
function useResultado(ms = 5000) {
  const [res, setRes] = useState<Res>(null);
  const t = useRef<any>(null);
  const mostrar = useCallback((r: Res) => { setRes(r); clearTimeout(t.current); if (r) t.current = setTimeout(() => setRes(null), ms); }, [ms]);
  useEffect(() => () => clearTimeout(t.current), []);
  return [res, mostrar] as const;
}

function usePoll<T>(path: string | null, ms = 5000) {
  const [data, setData] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const load = useCallback(async () => { if (!path) return; try { setData(await eduApi.get<T>(path)); setErro(null); } catch (e: any) { setErro(e?.message || "Falha ao atualizar."); } }, [path]);
  useEffect(() => { setData(null); if (!path) return; load(); const id = setInterval(load, ms); return () => clearInterval(id); }, [path, ms, load]);
  return { data, erro, reload: load };
}

// ===================================================================== CHAMADA
function ChamadaQuiosque() {
  const agenda = usePoll<any>("/presenca/chamadas/agenda", 30000);
  const [disps, setDisps] = useState<any[]>([]);
  const [dispId, setDispId] = useState("");
  const [classSessionId, setClassSessionId] = useState("");
  const [chamadaId, setChamadaId] = useState<string | null>(null);
  const [res, mostrar] = useResultado();
  const [erro, setErro] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [busca, setBusca] = useState("");
  const [just, setJust] = useState("");
  const det = usePoll<any>(chamadaId ? `/presenca/chamadas/${chamadaId}` : null, 4000);

  useEffect(() => { eduApi.get("/presenca/dispositivos?finalidade=CHAMADA&ativo=true").then((r) => setDisps(itemsOf(r))).catch(() => {}); }, []);
  const aulas: any[] = agenda.data?.items || [];
  const aula = aulas.find((a) => a.classSessionId === classSessionId);
  useEffect(() => { if (aula?.chamada?.id) setChamadaId(aula.chamada.id); else setChamadaId(null); }, [aula?.chamada?.id, classSessionId]);

  async function abrir() {
    setErro(null);
    try { const c = await eduApi.post<any>("/presenca/chamadas/abrir", { classSessionId, dispositivoId: dispId || undefined }); setChamadaId(c.id); agenda.reload(); } catch (e: any) { setErro(e.message); }
  }
  async function enviar(i: Identificacao) {
    if (!chamadaId) return;
    try {
      const body: any = i.metodo === "FACIAL" ? { embedding: i.embedding, liveness: i.liveness, dispositivoId: dispId || undefined } : { metodo: i.metodo, credencial: i.credencial, dispositivoId: dispId || undefined };
      const r = await eduApi.post<any>(`/presenca/chamadas/${chamadaId}/${i.metodo === "FACIAL" ? "reconhecer" : "marcar"}`, body);
      const nome = r.aluno?.nome || "Aluno";
      if (r.duplicado) { mostrar({ tipo: "aviso", titulo: nome, detalhe: "Já registrado agora há pouco." }); return; }
      const st = r.frequencia?.status as string;
      const bom = st === "PRESENTE";
      mostrar({ tipo: bom ? "ok" : "aviso", titulo: `${nome}`, detalhe: `${TIPO_ROTULO[r.tipo] || r.tipo} às ${hora(r.marcacao?.em)} — ${ROTULO_STATUS[st] || st}${r.frequencia?.minutosAtraso ? ` (${r.frequencia.minutosAtraso} min)` : ""}` });
      det.reload();
    } catch (e: any) {
      mostrar({ tipo: "erro", titulo: e.status === 401 ? "Não reconhecido" : e.status === 429 ? "Leitura bloqueada" : "Não foi possível registrar", detalhe: e.message });
    }
  }
  async function marcarManual(studentId: string) {
    if (just.trim().length < 5) { setErro("Informe a justificativa (mín. 5 caracteres) para a marcação manual."); return; }
    try {
      const r = await eduApi.post<any>(`/presenca/chamadas/${chamadaId}/marcar`, { metodo: "MANUAL", studentId, justificativa: just.trim() });
      mostrar({ tipo: "ok", titulo: r.aluno?.nome || "Aluno", detalhe: `Marcado manualmente (${TIPO_ROTULO[r.tipo] || r.tipo})` }); setErro(null); det.reload();
    } catch (e: any) { setErro(e.message); }
  }
  async function encerrar() {
    if (!window.confirm("Encerrar a chamada? Quem não registrou entrada ficará com falta e o resultado será conciliado com o diário.")) return;
    try { await eduApi.post(`/presenca/chamadas/${chamadaId}/fechar`, {}); mostrar({ tipo: "ok", titulo: "Chamada encerrada", detalhe: "Resultado conciliado com o diário do professor." }); det.reload(); agenda.reload(); } catch (e: any) { setErro(e.message); }
  }

  const d = det.data;
  const aberta = d?.chamada?.status === "ABERTA";
  const roster: any[] = d?.roster || [];
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: 1.5 }}>
        <TextField select size="small" label="Aula de hoje" value={classSessionId} onChange={(e) => setClassSessionId(e.target.value)} helperText={agenda.erro || (aulas.length ? "" : "Nenhuma aula agendada para hoje nas suas turmas.")}>
          {aulas.map((a) => <MenuItem key={a.classSessionId} value={a.classSessionId}>{hora(a.inicio)}–{hora(a.fim)} · {a.disciplina} ({a.turma}){a.chamada ? ` · chamada ${a.chamada.status.toLowerCase()}` : ""}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Este tablet (opcional)" value={dispId} onChange={(e) => setDispId(e.target.value)}>
          <MenuItem value="">Sem cadastro de dispositivo</MenuItem>
          {disps.map((x) => <MenuItem key={x.id} value={x.id}>{x.nome}</MenuItem>)}
        </TextField>
      </Box>
      {erro && <Alert severity="warning" onClose={() => setErro(null)}>{erro}</Alert>}
      {classSessionId && !chamadaId && <Box><Button variant="contained" size="large" onClick={abrir}>Abrir chamada desta aula</Button></Box>}
      {chamadaId && d && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1.3fr) minmax(0,1fr)" }, gap: 2, alignItems: "start" }}>
          <Box sx={{ display: "grid", gap: 1.5 }}>
            {res && <FaixaResultado tipo={res.tipo} titulo={res.titulo} detalhe={res.detalhe} />}
            {aberta ? <IdentificaPessoa onIdentificar={enviar} /> : <Alert severity="success">Chamada {d.chamada.status === "CONCILIADA" ? "encerrada e conciliada com o diário" : "encerrada"}. {d.resumo.divergentes ? `${d.resumo.divergentes} divergência(s) com o diário aguardam o professor.` : ""}</Alert>}
            <AvisoBiometria />
          </Box>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 4 }}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>{d.disciplina} · {d.turma}</Typography>
            <Typography variant="body2" color="text.secondary">{hora(d.chamada.inicioEsperado)}–{hora(d.chamada.fimEsperado)} · tolerância {d.chamada.toleranciaAtrasoMin} min</Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", my: 1.5 }}>
              <Chip color="success" label={`Presentes ${d.resumo.presentes}`} /><Chip color="warning" label={`Atrasos ${d.resumo.atrasos}`} />
              <Chip color="error" label={`Faltas ${d.resumo.faltas}`} /><Chip label={`Pendentes ${d.resumo.pendentes}`} />
            </Box>
            <LinearProgress variant="determinate" value={d.resumo.total ? ((d.resumo.total - d.resumo.pendentes - d.resumo.faltas) / d.resumo.total) * 100 : 0} sx={{ height: 10, borderRadius: 5, mb: 1.5 }} />
            <Box sx={{ maxHeight: 340, overflow: "auto", display: "grid", gap: 0.5 }}>
              {[...roster].sort((a, b) => new Date(b.ultimaMarcacao?.em || 0).getTime() - new Date(a.ultimaMarcacao?.em || 0).getTime()).map((a) => (
                <Box key={a.studentId} sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "center", py: 0.5, borderBottom: "1px solid", borderColor: "divider" }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{a.nome}</Typography>
                  <Chip size="small" color={STATUS_COR[a.status] || "default"} label={a.status === "PENDENTE" ? "Aguardando" : `${ROTULO_STATUS[a.status] || a.status}${a.entradaEm ? ` · ${hora(a.entradaEm)}` : ""}`} />
                </Box>
              ))}
            </Box>
            <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>
              {aberta && <Button startIcon={<ListAltIcon />} variant="outlined" onClick={() => setManual(true)}>Lista manual</Button>}
              {aberta && <Button color="error" variant="contained" onClick={encerrar}>Encerrar chamada</Button>}
            </Box>
          </Paper>
        </Box>
      )}
      <Dialog open={manual} onClose={() => setManual(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 800 }}>Lista manual (sem biometria)</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>Use para quem não quer ou não consegue usar rosto/QR. A justificativa fica registrada e auditada.</Alert>
          <TextField fullWidth size="small" label="Justificativa" value={just} onChange={(e) => setJust(e.target.value)} sx={{ mb: 1.5 }} placeholder="Ex.: aluno optou por não usar biometria e esqueceu a carteirinha" />
          <TextField fullWidth size="small" label="Buscar aluno" value={busca} onChange={(e) => setBusca(e.target.value)} sx={{ mb: 1 }} />
          <Box sx={{ display: "grid", gap: 0.5, maxHeight: 340, overflow: "auto" }}>
            {roster.filter((a) => a.status === "PENDENTE" && a.nome.toLowerCase().includes(busca.toLowerCase())).map((a) => (
              <Box key={a.studentId} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
                <Typography variant="body2">{a.nome} <Typography component="span" variant="caption" color="text.secondary">RA {a.ra}</Typography></Typography>
                <Button size="small" variant="contained" onClick={() => marcarManual(a.studentId)}>Presente</Button>
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions><Button onClick={() => setManual(false)}>Fechar</Button></DialogActions>
      </Dialog>
    </Box>
  );
}

// ===================================================================== PORTARIA / ESPAÇOS
function PortariaQuiosque() {
  const [espacos, setEspacos] = useState<any[]>([]);
  const [spaceId, setSpaceId] = useState("");
  const [sentido, setSentido] = useState("AUTO");
  const [res, mostrar] = useResultado();
  const [visitante, setVisitante] = useState(false);
  const [vNome, setVNome] = useState("");
  const [vDoc, setVDoc] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const oc = usePoll<any>(spaceId ? `/presenca/ocupacao/${spaceId}` : null, 4000);

  useEffect(() => {
    eduApi.get("/presenca/espacos?controlados=true").then((r) => { const it = itemsOf(r); setEspacos(it); if (it[0]) setSpaceId((s) => s || it[0].id); }).catch((e) => setErro(e.message));
  }, []);

  async function enviar(i: Identificacao) {
    try {
      const body: any = { spaceId, sentido, metodo: i.metodo, embedding: i.embedding, liveness: i.liveness, credencial: i.credencial };
      const r = await eduApi.post<any>("/presenca/acesso/registrar", body);
      mostrar({ tipo: r.sentido === "ENTRADA" ? "ok" : "aviso", titulo: `${r.pessoa?.nome ?? "Pessoa"} — ${r.sentido === "ENTRADA" ? "ENTRADA liberada" : "SAÍDA registrada"}`, detalhe: `Ocupação agora: ${r.ocupacao}${r.capacidade ? ` / ${r.capacidade}` : ""}${r.aviso ? ` · ${r.aviso}` : ""}` });
      oc.reload();
    } catch (e: any) {
      mostrar({ tipo: "erro", titulo: e.data?.codigo === "CAPACIDADE" || /Capacidade/.test(e.message) ? "ACESSO NEGADO — espaço lotado" : e.status === 403 ? "ACESSO NEGADO" : e.status === 401 ? "Não reconhecido" : "Não foi possível registrar", detalhe: e.message });
      oc.reload();
    }
  }
  async function registrarVisitante() {
    try {
      const r = await eduApi.post<any>("/presenca/acesso/registrar", { spaceId, metodo: "MANUAL", visitante: { nome: vNome, documento: vDoc || undefined } });
      mostrar({ tipo: "ok", titulo: `Visitante ${vNome} — entrada registrada`, detalhe: `Ocupação: ${r.ocupacao}` }); setVisitante(false); setVNome(""); setVDoc(""); oc.reload();
    } catch (e: any) { mostrar({ tipo: "erro", titulo: "Visitante não registrado", detalhe: e.message }); }
  }
  async function saidaVisitante(visitaId: string) {
    try { await eduApi.post("/presenca/acesso/registrar", { spaceId, metodo: "MANUAL", visitaId }); oc.reload(); } catch (e: any) { setErro(e.message); }
  }

  const d = oc.data;
  const pct = d?.percentual ?? null;
  const cor = pct === null ? "primary" : pct >= 100 ? "error" : pct >= 80 ? "warning" : "success";
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {erro && <Alert severity="warning" onClose={() => setErro(null)}>{erro}</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: 1.5 }}>
        <TextField select size="small" label="Espaço controlado" value={spaceId} onChange={(e) => setSpaceId(e.target.value)} helperText={espacos.length ? "" : "Nenhum espaço com controle de acesso. Configure em Presença → Acesso e ocupação."}>
          {espacos.map((e) => <MenuItem key={e.id} value={e.id}>{e.nome} · {e.config?.modoAcesso?.toLowerCase()}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Sentido" value={sentido} onChange={(e) => setSentido(e.target.value)}>
          <MenuItem value="AUTO">Automático (entra/sai)</MenuItem><MenuItem value="ENTRADA">Somente entrada</MenuItem><MenuItem value="SAIDA">Somente saída</MenuItem>
        </TextField>
      </Box>
      {spaceId && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1.3fr) minmax(0,1fr)" }, gap: 2, alignItems: "start" }}>
          <Box sx={{ display: "grid", gap: 1.5 }}>
            {res && <FaixaResultado tipo={res.tipo} titulo={res.titulo} detalhe={res.detalhe} />}
            <IdentificaPessoa onIdentificar={enviar} />
            <Button startIcon={<PersonAddIcon />} variant="outlined" onClick={() => setVisitante(true)}>Registrar visitante</Button>
            <AvisoBiometria />
          </Box>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 4 }}>
            <Typography variant="overline" color="text.secondary">Ocupação agora</Typography>
            <Typography sx={{ fontSize: 56, fontWeight: 900, lineHeight: 1 }}>{d?.ocupacao ?? "—"}<Typography component="span" sx={{ fontSize: 24, fontWeight: 700 }} color="text.secondary">{d?.capacidade ? ` / ${d.capacidade}` : ""}</Typography></Typography>
            {pct !== null && <><LinearProgress variant="determinate" value={Math.min(100, pct)} color={cor as any} sx={{ height: 12, borderRadius: 6, my: 1 }} /><Typography variant="body2" color={`${cor}.main`} sx={{ fontWeight: 800 }}>{pct}% da capacidade{pct >= 100 ? " — LOTADO" : pct >= 80 ? " — atenção" : ""}</Typography></>}
            <Box sx={{ mt: 1.5, maxHeight: 300, overflow: "auto", display: "grid", gap: 0.5 }}>
              {(d?.presentes || []).map((p: any) => (
                <Box key={p.visitaId} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, py: 0.25 }}>
                  <Typography variant="body2">{p.nome} <Typography component="span" variant="caption" color="text.secondary">desde {hora(p.entradaEm)}</Typography></Typography>
                  {p.tipo === "VISITANTE" && <Button size="small" onClick={() => saidaVisitante(p.visitaId)}>Saída</Button>}
                </Box>
              ))}
              {d && !d.presentes.length && <Typography color="text.secondary" variant="body2">Ninguém no espaço.</Typography>}
            </Box>
          </Paper>
        </Box>
      )}
      <Dialog open={visitante} onClose={() => setVisitante(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 800 }}>Registrar visitante</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
          <TextField autoFocus label="Nome completo" value={vNome} onChange={(e) => setVNome(e.target.value)} />
          <TextField label="Documento (CPF/RG) — opcional" value={vDoc} onChange={(e) => setVDoc(e.target.value)} helperText="Guardado apenas mascarado." />
        </DialogContent>
        <DialogActions><Button onClick={() => setVisitante(false)}>Cancelar</Button><Button variant="contained" disabled={vNome.trim().length < 3} onClick={registrarVisitante}>Registrar entrada</Button></DialogActions>
      </Dialog>
    </Box>
  );
}

// ===================================================================== EMPRÉSTIMOS
function EmprestimoQuiosque() {
  const [aba, setAba] = useState(0);
  const [item, setItem] = useState<any | null>(null);
  const [codigoItem, setCodigoItem] = useState("");
  const [res, mostrar] = useResultado(7000);
  const [erro, setErro] = useState<string | null>(null);
  const [estado, setEstado] = useState("");

  async function consultar(codigo: string) {
    setErro(null);
    try { const r = await eduApi.get<any>(`/presenca/itens/lookup/${encodeURIComponent(codigo.trim())}`); setItem({ ...r, codigo: codigo.trim() }); } catch (e: any) { setItem(null); setErro(e.message); }
  }
  async function retirar(i: Identificacao) {
    if (!item) return;
    try {
      const r = await eduApi.post<any>("/presenca/emprestimos/retirar", { metodo: i.metodo, codigo: item.codigo, embedding: i.embedding, liveness: i.liveness, credencial: i.credencial });
      const prev = r.emprestimo?.previstaEm || r.emprestimo?.dataPrevista;
      mostrar({ tipo: "ok", titulo: `${r.titulo} — emprestado a ${r.pessoa?.nome ?? ""}`, detalhe: `Devolução até ${prev ? new Date(prev).toLocaleString("pt-BR") : "—"}` });
      setItem(null);
    } catch (e: any) { mostrar({ tipo: "erro", titulo: e.status === 401 ? "Não reconhecido" : "Empréstimo não realizado", detalhe: e.message }); }
  }
  async function devolver(codigo: string) {
    try {
      const r = await eduApi.post<any>("/presenca/emprestimos/devolver", { codigo: codigo.trim(), metodo: "QR", estado: estado || undefined });
      mostrar({ tipo: r.multa || r.bloqueado ? "aviso" : "ok", titulo: `${r.titulo} — devolvido`, detalhe: r.multa ? `Atraso de ${r.multa.diasAtraso} dia(s): multa ${brl(r.multa.valor)}${r.bloqueado ? " · empréstimos bloqueados" : ""}` : r.pessoa?.nome ? `Devolvido por ${r.pessoa.nome} no prazo.` : "Devolvido no prazo." });
      setCodigoItem("");
    } catch (e: any) { mostrar({ tipo: "erro", titulo: "Devolução não registrada", detalhe: e.message }); }
  }
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Tabs value={aba} onChange={(_, v) => { setAba(v); setItem(null); setErro(null); }} variant="fullWidth"><Tab label="Retirar" sx={{ fontWeight: 800 }} /><Tab label="Devolver" sx={{ fontWeight: 800 }} /></Tabs>
      {res && <FaixaResultado tipo={res.tipo} titulo={res.titulo} detalhe={res.detalhe} />}
      {erro && <Alert severity="warning" onClose={() => setErro(null)}>{erro}</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2, alignItems: "start" }}>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 4, display: "grid", gap: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>{aba === 0 ? "1. Leia o item (QR ou código)" : "Leia o item devolvido"}</Typography>
          <QrLeitor ativo onLer={(t) => (aba === 0 ? consultar(t) : devolver(t))} camera="environment" altura={240} />
          <Box component="form" onSubmit={(e) => { e.preventDefault(); if (codigoItem.trim()) { if (aba === 0) consultar(codigoItem); else devolver(codigoItem); } }} sx={{ display: "flex", gap: 1 }}>
            <TextField fullWidth size="small" label="Código do item / tombo" value={codigoItem} onChange={(e) => setCodigoItem(e.target.value)} />
            <Button type="submit" variant="contained">OK</Button>
          </Box>
          {aba === 1 && <TextField select size="small" label="Estado do item" value={estado} onChange={(e) => setEstado(e.target.value)}><MenuItem value="">Sem observação</MenuItem><MenuItem value="OTIMO">Ótimo</MenuItem><MenuItem value="BOM">Bom</MenuItem><MenuItem value="REGULAR">Regular</MenuItem><MenuItem value="DANIFICADO">Danificado (vai para manutenção)</MenuItem></TextField>}
        </Paper>
        {aba === 0 && (
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 4, display: "grid", gap: 1.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>2. Identifique-se</Typography>
            {!item ? <Typography color="text.secondary">Leia primeiro o item que será emprestado.</Typography> : (
              <>
                <Alert severity={item.tipo === "LIVRO" || item.item?.status === "DISPONIVEL" ? "success" : "error"}>
                  <b>{item.tipo === "LIVRO" ? item.titulo : item.item?.descricao}</b> · {item.tipo === "LIVRO" ? "livro do acervo" : item.item?.codigo} · situação: <b>{(item.tipo === "LIVRO" ? item.status : item.item?.status || "").toString().replace(/_/g, " ")}</b>
                  {item.emprestimoAtivo ? ` — com ${item.emprestimoAtivo.pessoa || "outra pessoa"}` : ""}
                </Alert>
                <IdentificaPessoa onIdentificar={retirar} />
              </>
            )}
          </Paper>
        )}
      </Box>
    </Box>
  );
}

// ===================================================================== PÁGINA
export default function Quiosque() {
  const nav = useNavigate();
  const [aba, setAba] = useState(0);
  const [tela, setTela] = useState(false);
  useEffect(() => { const f = () => setTela(!!document.fullscreenElement); document.addEventListener("fullscreenchange", f); return () => document.removeEventListener("fullscreenchange", f); }, []);
  async function alternarTela() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { /* navegador sem suporte (ex.: iPhone) */ }
  }
  return (
    <Box sx={{ position: "fixed", inset: 0, zIndex: 1250, bgcolor: "background.default", overflow: "auto", p: { xs: 1.5, md: 3 } }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
        <Typography variant="h5" sx={{ fontWeight: 900, flex: 1, minWidth: 180 }}>Quiosque EduMaster</Typography>
        <Tooltip title={tela ? "Sair da tela cheia" : "Tela cheia"}><IconButton onClick={alternarTela} aria-label="Alternar tela cheia">{tela ? <FullscreenExitIcon /> : <FullscreenIcon />}</IconButton></Tooltip>
        <Button startIcon={<CloseIcon />} onClick={() => nav("/edu/presenca")}>Sair do quiosque</Button>
      </Box>
      <Tabs value={aba} onChange={(_, v) => setAba(v)} variant="fullWidth" sx={{ mb: 2 }}>
        <Tab label="Chamada da aula" sx={{ fontWeight: 800, minHeight: 56 }} /><Tab label="Portaria / espaços" sx={{ fontWeight: 800, minHeight: 56 }} /><Tab label="Empréstimos" sx={{ fontWeight: 800, minHeight: 56 }} />
      </Tabs>
      {aba === 0 && <ChamadaQuiosque />}
      {aba === 1 && <PortariaQuiosque />}
      {aba === 2 && <EmprestimoQuiosque />}
    </Box>
  );
}
