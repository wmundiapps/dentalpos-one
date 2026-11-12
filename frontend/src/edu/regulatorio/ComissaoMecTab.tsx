import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, TextField, Typography, useMediaQuery, useTheme } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import AddIcon from "@mui/icons-material/Add";
import GavelIcon from "@mui/icons-material/Gavel";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { fmtDate, Kpi, KpiGrid, label, Progress, Section, Status, useApi, useToast } from "./ui";
import { AvisoFicticio, FASE_COR, NivelChip } from "./mecShared";
import ComissaoDetalhe from "./ComissaoDetalhe";

const TIPOS: Array<[string, string]> = [
  ["AUTORIZACAO_CURSO", "Autorização de curso"],
  ["RECONHECIMENTO_CURSO", "Reconhecimento de curso"],
  ["RENOVACAO_RECONHECIMENTO", "Renovação de reconhecimento"],
  ["CREDENCIAMENTO", "Credenciamento institucional"],
  ["RECREDENCIAMENTO", "Recredenciamento institucional"],
];

export default function ComissaoMecTab() {
  const { data, loading, error, reload } = useApi<any>("/regulatorio/mec/painel");
  const [sel, setSel] = useState<string | null>(null);
  const [novo, setNovo] = useState<any | null>(null);
  const { toast, node } = useToast();
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("sm"));
  const items: any[] = data?.items || [];
  const r = data?.resumo;

  async function avisar() {
    try {
      const res: any = await eduApi.post("/regulatorio/mec/avisos/processar");
      toast({ type: "success", text: `${res.avisos} aviso(s) enviado(s) à reitoria e à diretoria (${res.processos} processo(s) analisado(s)).` });
      reload();
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function criar() {
    try {
      const p: any = await eduApi.post("/regulatorio/processos", { tipo: novo.tipo, titulo: novo.titulo, cursoNome: novo.cursoNome || undefined, prazoProtocolo: novo.prazoProtocolo ? new Date(`${novo.prazoProtocolo}T12:00:00`).toISOString() : undefined });
      await eduApi.post(`/regulatorio/mec/processos/${p.id}/iniciar`, {});
      setNovo(null);
      toast({ type: "success", text: "Processo criado e acompanhamento iniciado (fases e kit de evidências)." });
      reload();
      setSel(p.id);
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }

  return (
    <Box>
      <AvisoFicticio texto={data?.aviso} />
      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 3, bgcolor: "action.hover" }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Comissão de avaliação do MEC</Typography>
        <Typography variant="body2" color="text.secondary">
          Acompanhe os processos de autorização, reconhecimento, renovação e (re)credenciamento: fases no e-MEC, comissão avaliadora, visita in loco com roteiro por dimensão do instrumento INEP,
          kit de evidências por indicador (responsável e prazo), simulação de conceito (1 a 5) e avisos automáticos à reitoria e à diretoria quando um prazo fica crítico.
        </Typography>
      </Paper>
      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
        <Button startIcon={<RefreshIcon />} onClick={reload}>Atualizar</Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo({ tipo: "AUTORIZACAO_CURSO", titulo: "", cursoNome: "", prazoProtocolo: "" })}>Novo processo de avaliação</Button>
        <Button startIcon={<NotificationsActiveIcon />} onClick={avisar}>Avisar reitoria/diretoria agora</Button>
      </Box>
      <Status loading={loading && !data} error={error} onRetry={reload} empty={!data}>
        {r && (
          <KpiGrid>
            <Kpi title="Processos em avaliação" value={r.processos} />
            <Kpi title="Visitas agendadas" value={r.comVisitaAgendada} color="#2563eb" />
            <Kpi title="Prazos críticos" value={r.prazosCriticos} color={r.prazosCriticos ? "#dc2626" : "#16a34a"} hint="vencidos ou em até 15 dias" />
            <Kpi title="Prontidão do kit" value={r.prontidaoMediaKit == null ? "—" : `${r.prontidaoMediaKit}%`} color="#eab308" hint="evidências atendidas" />
          </KpiGrid>
        )}
        {data?.criticos?.length > 0 && (
          <Section title="Prazos críticos (a reitoria e a diretoria são avisadas)">
            {data.criticos.slice(0, 8).map((c: any, i: number) => (
              <Box key={i} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", py: 0.5, borderBottom: "1px solid", borderColor: "divider" }}>
                <NivelChip nivel={c.nivel} dias={c.dias} />
                <Typography variant="body2" sx={{ flex: 1, minWidth: 200 }}><b>{c.titulo}</b> — {c.processo}</Typography>
                <Typography variant="caption" color="text.secondary">{fmtDate(c.prazo)}</Typography>
                <Button size="small" onClick={() => setSel(c.processoId)}>Abrir</Button>
              </Box>
            ))}
          </Section>
        )}
        <Status empty={!items.length} emptyText="Nenhum processo de autorização, reconhecimento, renovação ou (re)credenciamento. Crie o primeiro acima.">
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2 }}>
            {items.map((p) => (
              <Paper key={p.id} variant="outlined" sx={{ p: 2, borderRadius: 3, borderLeft: `5px solid ${p.prazosCriticos ? "#dc2626" : "#16a34a"}` }}>
                <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <GavelIcon color="primary" />
                  <Box sx={{ flex: 1, minWidth: 180 }}>
                    <Typography sx={{ fontWeight: 800 }}>{p.titulo}</Typography>
                    <Typography variant="caption" color="text.secondary">{p.tipoNome} · e-MEC {p.protocoloEmec || "a protocolar"} · etapa {label(p.etapa)}</Typography>
                  </Box>
                  {p.conceitoSimulado && <Chip color={p.conceitoSimulado.faixa >= 4 ? "success" : p.conceitoSimulado.faixa === 3 ? "warning" : "error"} label={`Conceito simulado ${p.conceitoSimulado.faixa}`} />}
                </Box>
                {p.iniciado ? (
                  <>
                    <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap", alignItems: "center" }}>
                      <Chip size="small" color={FASE_COR[p.faseAtual?.status] || "default"} label={`Fase: ${p.faseAtual?.nome || "concluído"}`} />
                      <Chip size="small" variant="outlined" label={`${p.membros} avaliador(es)`} />
                      {p.visita && <Chip size="small" variant="outlined" label={`Visita ${fmtDate(p.visita.inicio)} (${label(p.visita.status)})`} />}
                      {p.diligenciasAbertas > 0 && <Chip size="small" color="warning" label={`${p.diligenciasAbertas} diligência(s)`} />}
                    </Box>
                    <Typography variant="caption" color="text.secondary">Andamento das fases</Typography>
                    <Progress value={p.progressoFases} height={8} />
                    <Typography variant="caption" color="text.secondary">Kit de evidências ({p.evidencias.atendidas}/{p.evidencias.total})</Typography>
                    <Progress value={p.evidencias.percentual} height={8} />
                    <Box sx={{ display: "flex", gap: 1, mt: 1, alignItems: "center", flexWrap: "wrap" }}>
                      {p.proximoPrazo ? <><NivelChip nivel={p.proximoPrazo.nivel} dias={p.proximoPrazo.dias} /><Typography variant="caption">{p.proximoPrazo.titulo}</Typography></> : <Typography variant="caption" color="text.secondary">Sem prazos em aberto.</Typography>}
                    </Box>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Acompanhamento ainda não iniciado: abra o processo e clique em "Iniciar acompanhamento".</Typography>
                )}
                <Box sx={{ mt: 1.5 }}><Button variant="outlined" onClick={() => setSel(p.id)}>Abrir acompanhamento</Button></Box>
              </Paper>
            ))}
          </Box>
        </Status>
      </Status>

      <Dialog open={!!novo} onClose={() => setNovo(null)} fullWidth maxWidth="sm" fullScreen={mobile}>
        <DialogTitle>Novo processo de avaliação do MEC</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField select label="Tipo de processo" value={novo?.tipo || ""} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })}>
            {TIPOS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
          </TextField>
          <TextField label="Título" value={novo?.titulo || ""} onChange={(e) => setNovo({ ...novo, titulo: e.target.value })} helperText="Ex.: Autorização — Enfermagem" />
          <TextField label="Curso (opcional)" value={novo?.cursoNome || ""} onChange={(e) => setNovo({ ...novo, cursoNome: e.target.value })} />
          <TextField type="date" label="Prazo para protocolar" InputLabelProps={{ shrink: true }} value={novo?.prazoProtocolo || ""} onChange={(e) => setNovo({ ...novo, prazoProtocolo: e.target.value })} />
        </DialogContent>
        <DialogActions><Button onClick={() => setNovo(null)}>Cancelar</Button><Button variant="contained" disabled={!novo?.titulo || novo.titulo.length < 3} onClick={criar}>Criar e iniciar</Button></DialogActions>
      </Dialog>
      {sel && <ComissaoDetalhe id={sel} onClose={() => { setSel(null); reload(); }} />}
      {node}
    </Box>
  );
}
