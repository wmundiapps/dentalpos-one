import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Paper, Tab, Tabs, TextField, Typography, useMediaQuery, useTheme } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import PrintIcon from "@mui/icons-material/Print";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { fmtDate, label, openHtml, Progress, Section, Status, useApi, useToast, toIso } from "./ui";
import { AvisoFicticio, DIM_NOME, DIMS, FASE_COR, NivelChip, STATUS_EV, diasTxt } from "./mecShared";

const SUBTABS = ["Fases e prazos", "Comissão avaliadora", "Visita e roteiro", "Kit de evidências", "Conceito simulado", "Pendências"];

export default function ComissaoDetalhe({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: d, loading, error, reload } = useApi<any>(`/regulatorio/mec/processos/${id}`);
  const [tab, setTab] = useState(0);
  const { toast, node } = useToast();
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("md"));

  async function run(fn: () => Promise<any>, ok: string) {
    try { await fn(); toast({ type: "success", text: ok }); reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  const iniciado = (d?.fases?.length ?? 0) > 0;

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg" fullScreen={mobile}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>{d?.processo?.titulo || "Processo"}</Typography>
          <Typography variant="caption" color="text.secondary">{d?.tipoNome} · e-MEC {d?.processo?.protocoloEmec || "a protocolar"} · etapa {label(d?.processo?.etapa)}</Typography>
        </Box>
        {iniciado && <Button size="small" startIcon={<PrintIcon />} onClick={() => openHtml(`/regulatorio/mec/processos/${id}/kit.html`).catch((e) => toast({ type: "error", text: e.message }))}>Kit da visita</Button>}
        <IconButton onClick={onClose} aria-label="Fechar"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Status loading={loading && !d} error={error} onRetry={reload} empty={!d}>
          {d && (
            <>
              <AvisoFicticio texto={d.aviso} />
              {!iniciado ? (
                <Alert severity="info" action={<Button color="inherit" size="small" onClick={() => run(() => eduApi.post(`/regulatorio/mec/processos/${id}/iniciar`, {}), "Acompanhamento iniciado.")}>Iniciar acompanhamento</Button>}>
                  Este processo ainda não tem fases nem kit de evidências. Inicie o acompanhamento para gerar as 7 fases e os documentos por indicador.
                </Alert>
              ) : (
                <>
                  <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
                    {SUBTABS.map((l) => <Tab key={l} label={l} />)}
                  </Tabs>
                  {tab === 0 && <Fases d={d} run={run} />}
                  {tab === 1 && <Comissao d={d} run={run} id={id} />}
                  {tab === 2 && <Visita d={d} run={run} id={id} />}
                  {tab === 3 && <Evidencias d={d} run={run} />}
                  {tab === 4 && <Simulacao d={d} id={id} />}
                  {tab === 5 && <Pendencias d={d} />}
                </>
              )}
            </>
          )}
        </Status>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      {node}
    </Dialog>
  );
}

type Run = (fn: () => Promise<any>, ok: string) => Promise<void>;

function Fases({ d, run }: { d: any; run: Run }) {
  return (
    <>
      <Typography variant="body2" sx={{ mb: 1 }}>Andamento das fases: <b>{d.progressoFases}%</b></Typography>
      <Progress value={d.progressoFases} />
      <Box sx={{ mt: 2, display: "grid", gap: 1 }}>
        {d.fases.map((f: any) => (
          <Paper key={f.id} variant="outlined" sx={{ p: 1.5, display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Chip size="small" color={FASE_COR[f.status]} label={label(f.status)} />
            <Box sx={{ flex: 1, minWidth: 180 }}>
              <Typography sx={{ fontWeight: 700 }}>{f.ordem}. {f.nome}</Typography>
              <Typography variant="caption" color="text.secondary">Prevista {fmtDate(f.previstaEm)}{f.realizadaEm ? ` · realizada ${fmtDate(f.realizadaEm)}` : ""}{f.observacao ? ` · ${f.observacao}` : ""}</Typography>
            </Box>
            {f.status !== "CONCLUIDA" && <Button size="small" onClick={() => run(() => eduApi.patch(`/regulatorio/mec/fases/${f.id}`, { status: f.status === "PENDENTE" ? "EM_ANDAMENTO" : "CONCLUIDA" }), "Fase atualizada.")}>{f.status === "PENDENTE" ? "Iniciar" : "Concluir"}</Button>}
          </Paper>
        ))}
      </Box>
      <Section title="Prazos regulatórios">
        {d.prazos.length === 0 ? <Typography color="text.secondary">Nenhum prazo em aberto.</Typography> : d.prazos.slice(0, 15).map((p: any, i: number) => (
          <Box key={i} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", py: 0.5, borderBottom: "1px solid", borderColor: "divider" }}>
            <NivelChip nivel={p.nivel} dias={p.dias} />
            <Typography variant="body2" sx={{ flex: 1, minWidth: 180 }}>{p.titulo}</Typography>
            <Typography variant="caption" color="text.secondary">{fmtDate(p.prazo)}</Typography>
          </Box>
        ))}
      </Section>
    </>
  );
}

function Comissao({ d, run, id }: { d: any; run: Run; id: string }) {
  const [novo, setNovo] = useState<any | null>(null);
  return (
    <Section title="Comissão avaliadora designada" action={<Button size="small" variant="contained" onClick={() => setNovo({ nome: "", papel: d.membros.length ? "AVALIADOR" : "COORDENADOR", instituicao: "", titulacao: "", dimensaoFoco: "" })}>Registrar membro</Button>}>
      {d.membros.length === 0 ? <Typography color="text.secondary">Comissão ainda não designada pelo INEP (fase "Designação da comissão").</Typography> : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.5 }}>
          {d.membros.map((m: any) => (
            <Paper key={m.id} variant="outlined" sx={{ p: 1.5 }}>
              <Typography sx={{ fontWeight: 800 }}>{m.nome}</Typography>
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", my: 0.5 }}>
                <Chip size="small" color={m.papel === "COORDENADOR" ? "primary" : "default"} label={label(m.papel)} />
                {m.titulacao && <Chip size="small" variant="outlined" label={m.titulacao} />}
                {m.dimensaoFoco && <Chip size="small" variant="outlined" label={DIM_NOME[m.dimensaoFoco]} />}
              </Box>
              <Typography variant="caption" color="text.secondary">{m.instituicao || "—"} · designado em {fmtDate(m.designadoEm)}</Typography>
              <Box><Button size="small" color="error" onClick={() => window.confirm("Remover este membro da comissão?") && run(() => eduApi.del(`/regulatorio/mec/membros/${m.id}`), "Membro removido.")}>Remover</Button></Box>
            </Paper>
          ))}
        </Box>
      )}
      <Dialog open={!!novo} onClose={() => setNovo(null)} fullWidth maxWidth="sm">
        <DialogTitle>Membro da comissão</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField label="Nome" value={novo?.nome || ""} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
          <TextField select label="Papel" value={novo?.papel || "AVALIADOR"} onChange={(e) => setNovo({ ...novo, papel: e.target.value })}>
            {["COORDENADOR", "AVALIADOR", "OBSERVADOR"].map((p) => <MenuItem key={p} value={p}>{label(p)}</MenuItem>)}
          </TextField>
          <TextField label="Instituição de origem" value={novo?.instituicao || ""} onChange={(e) => setNovo({ ...novo, instituicao: e.target.value })} />
          <TextField label="Titulação" value={novo?.titulacao || ""} onChange={(e) => setNovo({ ...novo, titulacao: e.target.value })} />
          <TextField select label="Dimensão de foco" value={novo?.dimensaoFoco || ""} onChange={(e) => setNovo({ ...novo, dimensaoFoco: e.target.value })}>
            <MenuItem value="">—</MenuItem>{DIMS.map((x) => <MenuItem key={x} value={x}>{DIM_NOME[x]}</MenuItem>)}
          </TextField>
        </DialogContent>
        <DialogActions><Button onClick={() => setNovo(null)}>Cancelar</Button><Button variant="contained" disabled={!novo?.nome || novo.nome.length < 3} onClick={() => run(async () => { await eduApi.post(`/regulatorio/mec/processos/${id}/membros`, { ...novo, dimensaoFoco: novo.dimensaoFoco || undefined, instituicao: novo.instituicao || undefined, titulacao: novo.titulacao || undefined }); setNovo(null); }, "Membro registrado.")}>Salvar</Button></DialogActions>
      </Dialog>
    </Section>
  );
}

function Visita({ d, run, id }: { d: any; run: Run; id: string }) {
  const v = d.visita;
  const [f, setF] = useState<any | null>(null);
  const porDia: Record<string, any[]> = {};
  for (const r of v?.roteiro || []) (porDia[String(r.dia).slice(0, 10)] ||= []).push(r);
  return (
    <Section title="Visita in loco" action={<Button size="small" variant="contained" onClick={() => setF({ inicio: v ? String(v.inicio).slice(0, 10) : "", fim: v ? String(v.fim).slice(0, 10) : "", local: v?.local || "" })}>{v ? "Reagendar" : "Agendar visita"}</Button>}>
      {!v ? <Typography color="text.secondary">Visita ainda não agendada.</Typography> : (
        <>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
            <Chip color="primary" label={`${fmtDate(v.inicio)} a ${fmtDate(v.fim)}`} />
            <Chip variant="outlined" label={label(v.status)} />
            {v.local && <Chip variant="outlined" label={v.local} />}
            {v.status !== "REALIZADA" && <Button size="small" onClick={() => run(() => eduApi.patch(`/regulatorio/mec/visitas/${v.id}`, { status: "REALIZADA" }), "Visita marcada como realizada.")}>Marcar como realizada</Button>}
            {!(v.roteiro || []).length && <Button size="small" variant="outlined" onClick={() => run(() => eduApi.post(`/regulatorio/mec/visitas/${v.id}/roteiro/gerar`, {}), "Roteiro gerado.")}>Gerar roteiro por dimensão</Button>}
          </Box>
          {Object.entries(porDia).map(([dia, itens]) => (
            <Box key={dia} sx={{ mb: 2 }}>
              <Typography sx={{ fontWeight: 800, mb: 0.5 }}>{fmtDate(dia)}</Typography>
              {itens.map((r: any) => (
                <Paper key={r.id} variant="outlined" sx={{ p: 1.2, mb: 0.8, display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", opacity: r.realizada ? 0.7 : 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 100 }}>{r.horaInicio}–{r.horaFim}</Typography>
                  <Chip size="small" label={DIM_NOME[r.dimensao]} />
                  <Box sx={{ flex: 1, minWidth: 200 }}>
                    <Typography variant="body2">{r.atividade}</Typography>
                    <Typography variant="caption" color="text.secondary">{r.local || "—"}{r.participantes ? ` · ${r.participantes}` : ""}</Typography>
                  </Box>
                  <Button size="small" onClick={() => run(() => eduApi.patch(`/regulatorio/mec/roteiro/${r.id}`, { realizada: !r.realizada }), "Roteiro atualizado.")}>{r.realizada ? "Reabrir" : "Realizada"}</Button>
                </Paper>
              ))}
            </Box>
          ))}
        </>
      )}
      <Dialog open={!!f} onClose={() => setF(null)} fullWidth maxWidth="xs">
        <DialogTitle>Agendar visita in loco</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField type="date" label="Início" slotProps={{ inputLabel: { shrink: true } }} value={f?.inicio || ""} onChange={(e) => setF({ ...f, inicio: e.target.value })} />
          <TextField type="date" label="Fim" slotProps={{ inputLabel: { shrink: true } }} value={f?.fim || ""} onChange={(e) => setF({ ...f, fim: e.target.value })} />
          <TextField label="Local" value={f?.local || ""} onChange={(e) => setF({ ...f, local: e.target.value })} />
        </DialogContent>
        <DialogActions><Button onClick={() => setF(null)}>Cancelar</Button><Button variant="contained" disabled={!f?.inicio || !f?.fim} onClick={() => run(async () => { await eduApi.post(`/regulatorio/mec/processos/${id}/visita`, { inicio: toIso(f.inicio), fim: toIso(f.fim), local: f.local || undefined }); setF(null); }, "Visita agendada. A reitoria e a diretoria serão avisadas nos prazos críticos.")}>Salvar</Button></DialogActions>
      </Dialog>
    </Section>
  );
}

function Evidencias({ d, run }: { d: any; run: Run }) {
  const [ed, setEd] = useState<any | null>(null);
  const r = d.resumoEvidencias;
  return (
    <>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 1.5, mb: 2 }}>
        {DIMS.map((k) => (
          <Paper key={k} variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{DIM_NOME[k]}</Typography>
            <Progress value={r.porDimensao[k]?.percentual} />
            <Typography variant="caption">{r.porDimensao[k]?.atendidas}/{r.porDimensao[k]?.total} evidências</Typography>
          </Paper>
        ))}
      </Box>
      {r.atrasadas > 0 && <Alert severity="warning" sx={{ mb: 2 }}>{r.atrasadas} evidência(s) com prazo vencido; {r.obrigatoriasPendentes} obrigatória(s) pendente(s).</Alert>}
      {DIMS.map((k) => (
        <Section key={k} title={DIM_NOME[k]}>
          {d.evidencias.filter((e: any) => e.dimensao === k).map((e: any) => (
            <Box key={e.id} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", py: 0.8, borderBottom: "1px solid", borderColor: "divider" }}>
              <Chip size="small" label={e.indicadorCodigo} />
              <Box sx={{ flex: 1, minWidth: 220 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{e.indicadorNome}</Typography>
                <Typography variant="caption" color="text.secondary">{e.descricao}{e.documentoNome ? ` · arquivo: ${e.documentoNome}` : ""}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Resp.: {e.responsavelNome || "—"} · prazo {fmtDate(e.prazo)} · pasta {e.pastaKit || "—"}</Typography>
              </Box>
              {e.conceitoEstimado && <Chip size="small" variant="outlined" label={`Conc. ${e.conceitoEstimado}`} />}
              <Chip size="small" color={STATUS_EV[e.status]} label={label(e.status)} />
              <Button size="small" onClick={() => setEd({ ...e, prazo: e.prazo ? String(e.prazo).slice(0, 10) : "" })}>Atualizar</Button>
            </Box>
          ))}
        </Section>
      ))}
      <Dialog open={!!ed} onClose={() => setEd(null)} fullWidth maxWidth="sm">
        <DialogTitle>Evidência {ed?.indicadorCodigo}</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <Typography variant="body2">{ed?.descricao}</Typography>
          <TextField select label="Situação" value={ed?.status || ""} onChange={(e) => setEd({ ...ed, status: e.target.value })}>
            {["PENDENTE", "EM_ANDAMENTO", "ATENDIDO", "NAO_APLICAVEL"].map((s) => <MenuItem key={s} value={s}>{label(s)}</MenuItem>)}
          </TextField>
          <TextField label="Documento (nome do arquivo)" value={ed?.documentoNome || ""} onChange={(e) => setEd({ ...ed, documentoNome: e.target.value })} helperText="Obrigatório para marcar como atendido." />
          <TextField label="Responsável" value={ed?.responsavelNome || ""} onChange={(e) => setEd({ ...ed, responsavelNome: e.target.value })} />
          <TextField type="date" label="Prazo" slotProps={{ inputLabel: { shrink: true } }} value={ed?.prazo || ""} onChange={(e) => setEd({ ...ed, prazo: e.target.value })} />
          <TextField select label="Conceito estimado (1 a 5)" value={ed?.conceitoEstimado ?? ""} onChange={(e) => setEd({ ...ed, conceitoEstimado: e.target.value === "" ? null : Number(e.target.value) })}>
            <MenuItem value="">—</MenuItem>{[1, 2, 3, 4, 5].map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
          </TextField>
        </DialogContent>
        <DialogActions><Button onClick={() => setEd(null)}>Cancelar</Button><Button variant="contained" onClick={() => run(async () => { await eduApi.patch(`/regulatorio/mec/evidencias/${ed.id}`, { status: ed.status, documentoNome: ed.documentoNome || null, responsavelNome: ed.responsavelNome || null, prazo: ed.prazo ? toIso(ed.prazo) : null, conceitoEstimado: ed.conceitoEstimado }); setEd(null); }, "Evidência atualizada.")}>Salvar</Button></DialogActions>
      </Dialog>
    </>
  );
}

function Simulacao({ d, id }: { d: any; id: string }) {
  const [over, setOver] = useState<Record<string, number | "">>({});
  const [res, setRes] = useState<any | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const s = res || d.simulacao;
  const KEYS: Record<string, string> = { ORGANIZACAO_DIDATICO_PEDAGOGICA: "organizacaoDidatico", CORPO_DOCENTE_TUTORIAL: "corpoDocente", INFRAESTRUTURA: "infraestrutura" };
  async function simular() {
    setErro(null);
    const body: any = {};
    for (const [dim, k] of Object.entries(KEYS)) if (over[dim] !== undefined && over[dim] !== "") body[k] = Number(over[dim]);
    try { setRes(await eduApi.post(`/regulatorio/mec/processos/${id}/simulacao`, body)); } catch (e: any) { setErro(e.message); }
  }
  return (
    <>
      <Alert severity="info" sx={{ mb: 2 }}>{s.aviso} A média de cada dimensão vem do conceito estimado das evidências; use "E se" para testar cenários.</Alert>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 1.5, mb: 2 }}>
        {s.dimensoes.map((x: any) => (
          <Paper key={x.dimensao} variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{x.nome} (peso {Math.round(x.peso * 100)}%)</Typography>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>{x.media ?? "—"}</Typography>
            <Typography variant="caption" color="text.secondary">{x.avaliadas}/{x.total} evidências com conceito</Typography>
            <TextField select size="small" fullWidth label="E se a dimensão fosse..." sx={{ mt: 1 }} value={over[x.dimensao] ?? ""} onChange={(e) => setOver({ ...over, [x.dimensao]: e.target.value === "" ? "" : Number(e.target.value) })}>
              <MenuItem value="">Usar a média atual</MenuItem>{[1, 2, 3, 4, 5].map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
            </TextField>
          </Paper>
        ))}
      </Box>
      <Button variant="contained" onClick={simular}>Simular conceito</Button>
      {erro && <Alert severity="error" sx={{ mt: 2 }}>{erro}</Alert>}
      <Box sx={{ mt: 2 }}>
        {s.disponivel ? (
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Typography variant="overline">Conceito de curso simulado</Typography>
            <Typography variant="h3" sx={{ fontWeight: 900 }}>{s.faixa} <Typography component="span" variant="body1">(contínuo {s.continuo})</Typography></Typography>
            {s.paraSubir && <Typography variant="body2">Para a faixa {s.paraSubir.proximaFaixa}, faltam {s.paraSubir.faltam} ponto(s) no contínuo.</Typography>}
            {s.alertas.map((a: string, i: number) => <Alert key={i} severity="warning" sx={{ mt: 1 }}>{a}</Alert>)}
          </Paper>
        ) : <Alert severity="warning">{s.motivo}</Alert>}
      </Box>
    </>
  );
}

function Pendencias({ d }: { d: any }) {
  const dil = d.diligencias.filter((x: any) => ["ABERTA", "VENCIDA"].includes(x.status));
  return (
    <>
      <Section title={`Diligências abertas (${dil.length})`}>
        {dil.length === 0 ? <Typography color="text.secondary">Nenhuma diligência em aberto.</Typography> : dil.map((x: any) => (
          <Box key={x.id} sx={{ py: 0.8, borderBottom: "1px solid", borderColor: "divider" }}>
            <Typography variant="body2">{x.descricao}</Typography>
            <Typography variant="caption" color="text.secondary">Prazo {fmtDate(x.prazoResposta)} ({diasTxt(Math.ceil((new Date(x.prazoResposta).getTime() - Date.now()) / 86400000))}) · responda na aba Diligências</Typography>
          </Box>
        ))}
      </Section>
      <Section title={`Evidências obrigatórias pendentes (${d.pendencias.filter((p: any) => p.tipo === "EVIDENCIA").length})`}>
        {d.pendencias.filter((p: any) => p.tipo === "EVIDENCIA").length === 0 ? <Typography color="text.secondary">Todas as evidências obrigatórias foram atendidas.</Typography> : d.pendencias.filter((p: any) => p.tipo === "EVIDENCIA").map((p: any) => (
          <Box key={p.id} sx={{ py: 0.8, display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid", borderColor: "divider" }}>
            <Chip size="small" color={STATUS_EV[p.status]} label={label(p.status)} />
            <Typography variant="body2" sx={{ flex: 1, minWidth: 200 }}>{p.titulo}</Typography>
            <Typography variant="caption" color="text.secondary">{p.prazo ? `${fmtDate(p.prazo)} (${diasTxt(p.dias)})` : "sem prazo"}</Typography>
          </Box>
        ))}
      </Section>
    </>
  );
}
