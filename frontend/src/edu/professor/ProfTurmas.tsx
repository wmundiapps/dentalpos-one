import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Paper, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { eduApi } from "../../services/EduApi";
import { Empty, Feedback, Progress, Status, fmtDateTime, fmtNum, useLoad } from "../secretaria/util";
import { SalaTurma } from "../portal/SalaVirtual";
import { Kpi } from "../portal/PortalSecoes";
import { GRID_3, useToast } from "../portal/comum";

/** Lista de turmas do professor; ao abrir mostra diário de classe, sala virtual e desempenho da turma. */
export default function ProfTurmas({ professorUserId }: { professorUserId?: string }) {
  const { data, loading, error, reload } = useLoad<any>(`/portal2/prof/turmas${professorUserId ? `?professorUserId=${professorUserId}` : ""}`);
  const [aberta, setAberta] = useState<any>(null);
  if (aberta) return <TurmaDetalhe turma={aberta} onVoltar={() => { setAberta(null); reload(); }} />;
  const itens: any[] = data?.itens || [];
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {!loading && !itens.length && !error && <Empty>Você não tem turmas neste período e ambiente.</Empty>}
      <Box sx={GRID_3}>
        {itens.map((t) => (
          <Paper key={t.id} variant="outlined" sx={{ p: 2, borderRadius: 3, display: "grid", gap: 0.75 }}>
            <Typography sx={{ fontWeight: 800 }}>{t.disciplina}</Typography>
            <Typography variant="caption" color="text.secondary">{t.nome} · {t.periodo} · {t.cargaHoraria}h</Typography>
            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
              <Chip size="small" label={`${t.alunos} aluno(s)`} /><Chip size="small" variant="outlined" label={`${t.aulasRealizadas} aula(s) dada(s)`} /><Chip size="small" variant="outlined" label={`${t.materiais} material(is)`} />
              {t.entregasParaCorrigir > 0 && <Chip size="small" color="warning" label={`${t.entregasParaCorrigir} p/ corrigir`} />}
            </Box>
            <Button variant="contained" size="small" onClick={() => setAberta(t)}>Abrir turma</Button>
          </Paper>
        ))}
      </Box>
    </Box>
  );
}

function TurmaDetalhe({ turma, onVoltar }: { turma: any; onVoltar: () => void }) {
  const [tab, setTab] = useState(0);
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <IconButton onClick={onVoltar} aria-label="Voltar às turmas"><ArrowBackIcon /></IconButton>
        <Box><Typography variant="h6" sx={{ fontWeight: 800 }}>{turma.disciplina}</Typography><Typography variant="caption" color="text.secondary">{turma.nome} · {turma.periodo} · {turma.alunos} aluno(s)</Typography></Box>
      </Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
        <Tab label="Diário de classe" /><Tab label="Sala virtual e materiais" /><Tab label="Desempenho e risco" />
      </Tabs>
      {tab === 0 && <DiarioClasse turma={turma} />}
      {tab === 1 && <SalaTurma classSectionId={turma.id} papel="PROFESSOR" />}
      {tab === 2 && <Desempenho classSectionId={turma.id} />}
    </Box>
  );
}

function DiarioClasse({ turma }: { turma: any }) {
  const { data, loading, error, reload } = useLoad<any>(`/portal2/prof/turmas/${turma.id}/aulas`);
  const [chamada, setChamada] = useState<string | null>(null);
  const [nova, setNova] = useState<any>(null);
  const t = useToast();
  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>Aulas e chamada</Typography>
        <Button variant="outlined" onClick={() => { const d = new Date(); d.setMinutes(0, 0, 0); const f = new Date(d.getTime() + 2 * 3600_000); const loc = (x: Date) => new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16); setNova({ titulo: "", inicio: loc(d), fim: loc(f), local: "" }); }}>Agendar aula</Button>
      </Box>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {!loading && !(data?.itens || []).length && <Empty>Nenhuma aula cadastrada.</Empty>}
      {(data?.itens || []).map((a: any) => (
        <Paper key={a.id} variant="outlined" sx={{ p: 1.25, borderRadius: 2, display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography sx={{ fontWeight: 700 }}>{a.titulo}</Typography>
            <Typography variant="caption" color="text.secondary">{fmtDateTime(a.inicio)}{a.local ? ` · ${a.local}` : ""}{a.chamadaFeita ? ` · ${a.presentes} presente(s), ${a.faltas} falta(s)` : ""}</Typography>
            {a.conteudo && <Typography variant="body2" color="text.secondary" noWrap>Conteúdo: {a.conteudo}</Typography>}
          </Box>
          <Status value={a.status} />
          {a.status !== "CANCELADA" && <Button size="small" variant={a.chamadaFeita ? "outlined" : "contained"} onClick={() => setChamada(a.id)}>{a.chamadaFeita ? "Rever chamada" : "Fazer chamada"}</Button>}
        </Paper>
      ))}
      <ChamadaDialog aulaId={chamada} onClose={() => { setChamada(null); reload(); }} toast={t} />
      <Dialog open={!!nova} onClose={() => setNova(null)} fullWidth maxWidth="sm">
        <DialogTitle>Agendar aula</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField size="small" label="Título / tema" value={nova?.titulo || ""} onChange={(e) => setNova({ ...nova, titulo: e.target.value })} />
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            <TextField size="small" type="datetime-local" label="Início" slotProps={{ inputLabel: { shrink: true } }} value={nova?.inicio || ""} onChange={(e) => setNova({ ...nova, inicio: e.target.value })} />
            <TextField size="small" type="datetime-local" label="Fim" slotProps={{ inputLabel: { shrink: true } }} value={nova?.fim || ""} onChange={(e) => setNova({ ...nova, fim: e.target.value })} />
          </Box>
          <TextField size="small" label="Local" value={nova?.local || ""} onChange={(e) => setNova({ ...nova, local: e.target.value })} />
        </DialogContent>
        <DialogActions><Button onClick={() => setNova(null)}>Cancelar</Button><Button variant="contained" disabled={(nova?.titulo || "").trim().length < 2} onClick={async () => { try { await eduApi.post(`/portal2/prof/turmas/${turma.id}/aulas`, { titulo: nova.titulo, dataHoraInicio: new Date(nova.inicio).toISOString(), dataHoraFim: new Date(nova.fim).toISOString(), local: nova.local || undefined }); setNova(null); t.ok("Aula agendada."); reload(); } catch (e: any) { t.err(e.message); } }}>Agendar</Button></DialogActions>
      </Dialog>
      {t.node}
    </Box>
  );
}

function ChamadaDialog({ aulaId, onClose, toast }: { aulaId: string | null; onClose: () => void; toast: ReturnType<typeof useToast> }) {
  const { data, loading, error, reload } = useLoad<any>(aulaId ? `/portal2/prof/aulas/${aulaId}/chamada` : null);
  const [modo, setModo] = useState<"LISTA" | "MANUAL" | "QR">("LISTA");
  const [marca, setMarca] = useState<Record<string, boolean>>({});
  const [conteudo, setConteudo] = useState<any>({ conteudo: "", metodologia: "", tarefa: "" });
  const [qr, setQr] = useState<{ token: string; expiraEm: string; img: string } | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!data) return;
    const m: Record<string, boolean> = {};
    for (const a of data.alunos) m[a.id] = a.presente === null ? true : a.presente;
    setMarca(m);
    setConteudo({ conteudo: data.conteudo?.conteudo || "", metodologia: data.conteudo?.metodologia || "", tarefa: data.conteudo?.tarefa || "" });
    if (data.qrAtivo) QRCode.toDataURL(data.qrAtivo.token, { margin: 1, width: 260 }).then((img) => setQr({ ...data.qrAtivo, img })).catch(() => undefined);
  }, [data?.aula?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!aulaId || modo !== "QR" || !qr) return;
    timer.current = window.setInterval(reload, 5000);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [aulaId, modo, qr?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const alunos: any[] = data?.alunos || [];
  const presentes = alunos.filter((a) => (modo === "QR" ? a.presente === true : marca[a.id])).length;

  async function salvar() {
    try {
      await eduApi.put(`/portal2/prof/aulas/${aulaId}/chamada`, { modo: modo === "QR" ? "LISTA" : modo, registros: alunos.map((a) => ({ studentId: a.id, presente: !!marca[a.id], justificativa: !marca[a.id] ? a.justificativa || undefined : undefined })) });
      if (conteudo.conteudo.trim().length >= 3) await eduApi.put(`/portal2/prof/aulas/${aulaId}/conteudo`, { conteudo: conteudo.conteudo, metodologia: conteudo.metodologia || undefined, tarefa: conteudo.tarefa || undefined });
      toast.ok("Chamada e conteúdo registrados."); onClose();
    } catch (e: any) { toast.err(e.message); }
  }
  async function gerarQr() {
    try { const r = await eduApi.post<any>(`/portal2/prof/aulas/${aulaId}/qr`, { minutos: 15 }); setQr({ token: r.token, expiraEm: r.expiraEm, img: await QRCode.toDataURL(r.token, { margin: 1, width: 260 }) }); reload(); } catch (e: any) { toast.err(e.message); }
  }

  return (
    <Dialog open={!!aulaId} onClose={onClose} fullWidth maxWidth="md" fullScreen={typeof window !== "undefined" && window.innerWidth < 600}>
      <DialogTitle>{data ? `Chamada — ${data.aula.titulo}` : "Chamada"}</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 1.5 }}>
        <Feedback loading={loading} error={error} onRetry={reload} />
        {data && (
          <>
            <ToggleButtonGroup exclusive size="small" value={modo} onChange={(_, v) => v && setModo(v)} aria-label="Modo de chamada">
              <ToggleButton value="LISTA">Lista</ToggleButton><ToggleButton value="MANUAL">Manual</ToggleButton><ToggleButton value="QR"><QrCode2Icon fontSize="small" sx={{ mr: 0.5 }} />QR Code</ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="body2" color="text.secondary">{fmtDateTime(data.aula.dataHoraInicio)} · {presentes} presente(s) de {alunos.length}</Typography>
            {modo === "LISTA" && (
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button size="small" onClick={() => setMarca(Object.fromEntries(alunos.map((a) => [a.id, true])))}>Todos presentes</Button>
                <Button size="small" onClick={() => setMarca(Object.fromEntries(alunos.map((a) => [a.id, false])))}>Todos ausentes</Button>
              </Box>
            )}
            {modo === "QR" && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, textAlign: "center", display: "grid", gap: 1, justifyItems: "center" }}>
                {!qr ? <Button variant="contained" startIcon={<QrCode2Icon />} onClick={gerarQr}>Gerar QR Code da aula (15 min)</Button> : (
                  <>
                    <Box component="img" src={qr.img} alt="QR Code da chamada" sx={{ width: 240, height: 240 }} />
                    <Typography variant="body2">Código: <b style={{ wordBreak: "break-all" }}>{qr.token}</b></Typography>
                    <Typography variant="caption" color="text.secondary">Expira às {new Date(qr.expiraEm).toLocaleTimeString("pt-BR")}. Os alunos leem pelo celular e a lista abaixo atualiza sozinha.</Typography>
                    <Button size="small" onClick={gerarQr}>Gerar novo código</Button>
                  </>
                )}
              </Paper>
            )}
            <Box sx={{ display: "grid", gap: 0.5 }}>
              {alunos.map((a) => {
                const p = modo === "QR" ? a.presente === true : !!marca[a.id];
                return (
                  <Box key={a.id} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.25, borderBottom: "1px dashed", borderColor: "divider" }}>
                    {modo === "LISTA" && <Checkbox checked={p} onChange={(e) => setMarca({ ...marca, [a.id]: e.target.checked })} slotProps={{ input: { "aria-label": `Presença de ${a.nomeCompleto}` } }} />}
                    <Typography variant="body2" sx={{ flex: 1 }}>{a.nomeCompleto} <Typography component="span" variant="caption" color="text.secondary">RA {a.ra}</Typography></Typography>
                    {modo === "MANUAL" && (
                      <ToggleButtonGroup exclusive size="small" value={p ? "P" : "F"} onChange={(_, v) => v && setMarca({ ...marca, [a.id]: v === "P" })}>
                        <ToggleButton value="P" color="success">Presente</ToggleButton><ToggleButton value="F" color="error">Falta</ToggleButton>
                      </ToggleButtonGroup>
                    )}
                    {modo !== "MANUAL" && <Chip size="small" color={p ? "success" : "default"} label={p ? "Presente" : a.presente === null && modo === "QR" ? "Aguardando" : "Falta"} />}
                  </Box>
                );
              })}
            </Box>
            <Typography sx={{ fontWeight: 800, mt: 1 }}>Conteúdo ministrado</Typography>
            <TextField multiline minRows={2} size="small" label="O que foi trabalhado nesta aula" value={conteudo.conteudo} onChange={(e) => setConteudo({ ...conteudo, conteudo: e.target.value })} />
            <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
              <TextField size="small" label="Metodologia" value={conteudo.metodologia} onChange={(e) => setConteudo({ ...conteudo, metodologia: e.target.value })} />
              <TextField size="small" label="Tarefa / leitura" value={conteudo.tarefa} onChange={(e) => setConteudo({ ...conteudo, tarefa: e.target.value })} />
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button><Button variant="contained" disabled={!alunos.length} onClick={salvar}>Salvar chamada</Button></DialogActions>
    </Dialog>
  );
}

export function Desempenho({ classSectionId }: { classSectionId: string }) {
  const { data, loading, error, reload } = useLoad<any>(`/portal2/prof/turmas/${classSectionId}/desempenho`);
  const r = data?.resumo;
  const max = Math.max(1, ...(data?.distribuicao || []).map((d: any) => d.alunos));
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {r && (
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "repeat(2, minmax(0,1fr))", md: "repeat(4, minmax(0,1fr))" } }}>
          <Kpi title="Média da turma" value={fmtNum(r.mediaTurma)} color="#0F5FDB" />
          <Kpi title="Frequência média" value={r.frequenciaMedia != null ? `${r.frequenciaMedia}%` : "—"} hint={`${r.aulasComChamada} aula(s) com chamada`} color="#2E7D32" />
          <Kpi title="Risco alto" value={r.emRiscoAlto} color="#D32F2F" />
          <Kpi title="Risco médio" value={r.emRiscoMedio} color="#ED6C02" />
        </Box>
      )}
      {data && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Distribuição das médias parciais</Typography>
          <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1.5, height: 120 }} role="img" aria-label="Gráfico de barras com a distribuição das médias">
            {data.distribuicao.map((d: any) => (
              <Box key={d.faixa} sx={{ flex: 1, textAlign: "center" }}>
                <Typography variant="caption">{d.alunos}</Typography>
                <Box sx={{ height: `${(d.alunos / max) * 80}px`, minHeight: 2, bgcolor: d.faixa.startsWith("0") || d.faixa.startsWith("4") ? "error.main" : "primary.main", borderRadius: 1 }} />
                <Typography variant="caption" color="text.secondary">{d.faixa}</Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      )}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Alunos por risco de evasão</Typography>
        {(data?.alunos || []).map((a: any) => (
          <Box key={a.studentId} sx={{ py: 0.75, borderBottom: "1px dashed", borderColor: "divider" }}>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <Typography sx={{ fontWeight: 700, flex: 1, minWidth: 180 }}>{a.aluno}</Typography>
              <Typography variant="caption">média {fmtNum(a.mediaParcial)} · freq. {a.frequenciaPct != null ? `${fmtNum(a.frequenciaPct, 0)}%` : "—"} · {a.faltas} falta(s)</Typography>
              <Chip size="small" color={a.nivel === "ALTO" ? "error" : a.nivel === "MEDIO" ? "warning" : "success"} label={`${a.nivel === "ALTO" ? "Alto" : a.nivel === "MEDIO" ? "Médio" : "Baixo"} · ${a.score}`} />
            </Box>
            <Progress value={a.score} color={a.nivel === "ALTO" ? "error" : a.nivel === "MEDIO" ? "warning" : "success"} />
            {a.motivos.length > 0 && <Typography variant="caption" color="text.secondary">{a.motivos.join(" · ")}</Typography>}
          </Box>
        ))}
      </Paper>
      <Alert severity="info">O índice combina notas, frequência, acesso à sala virtual, atividades atrasadas e inadimplência prolongada. Use-o para acolher o aluno cedo, não para punir.</Alert>
    </Box>
  );
}
