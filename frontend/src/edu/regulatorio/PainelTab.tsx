import { Box, Button, Chip, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import RefreshIcon from "@mui/icons-material/Refresh";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import { eduApi } from "../../services/EduApi";
import { Dot, fmtDate, Kpi, KpiGrid, label, openHtml, Progress, RISCO_COR, Section, SEMAFORO, Status, useApi, useToast } from "./ui";

const SIT_COR: Record<string, string> = { VIGENTE: SEMAFORO.VERDE, SEM_PRAZO: SEMAFORO.CINZA, RENOVACAO_ABERTA: SEMAFORO.AMARELO, VENCENDO: "#ea580c", VENCIDO: SEMAFORO.VERMELHO };
const RISCO_SEM: Record<string, string> = { CRITICO: SEMAFORO.VERMELHO, ALTO: "#ea580c", MEDIO: SEMAFORO.AMARELO, BAIXO: SEMAFORO.VERDE };

function diasTxt(d: number | null | undefined) {
  if (d == null) return "—";
  return d < 0 ? `${Math.abs(d)} dia(s) em atraso` : d === 0 ? "hoje" : `em ${d} dia(s)`;
}

export default function PainelTab() {
  const { data, loading, error, reload } = useApi<any>("/regulatorio/painel");
  const { toast, node } = useToast();
  const r = data?.resumo;

  async function bootstrap() {
    if (!window.confirm("Criar modelos de checklist e indicadores padrão? (operação idempotente)")) return;
    try { await eduApi.post("/regulatorio/bootstrap"); toast({ type: "success", text: "Modelos e indicadores preparados." }); reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function relatorio() { try { await openHtml("/regulatorio/relatorios/situacao.html"); } catch (e: any) { toast({ type: "error", text: e.message }); } }

  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
        <Button startIcon={<RefreshIcon />} onClick={reload}>Atualizar</Button>
        <Button startIcon={<PrintIcon />} onClick={relatorio}>Relatório de situação (HTML)</Button>
        <Button startIcon={<AutoFixHighIcon />} onClick={bootstrap}>Preparar modelos padrão</Button>
      </Box>
      <Status loading={loading && !data} error={error} onRetry={reload} empty={!data}>
        {data && r && (
          <>
            <KpiGrid>
              <Kpi title="Cursos" value={r.cursos} hint={`${r.atos} ato(s) vigentes no repositório`} />
              <Kpi title="Atos vencendo/vencidos" value={(r.atosPorSituacao?.VENCENDO || 0) + (r.atosPorSituacao?.VENCIDO || 0)} color={SEMAFORO.VERMELHO} hint={`${r.atosPorSituacao?.RENOVACAO_ABERTA || 0} em janela de renovação`} />
              <Kpi title="Processos abertos" value={r.processosAbertos} hint={`${r.diligenciasAbertas} diligência(s), ${r.diligenciasVencidas} vencida(s)`} />
              <Kpi title="Prontidão média" value={r.prontidaoMedia == null ? "—" : `${r.prontidaoMedia}%`} color={SEMAFORO.AMARELO} />
            </KpiGrid>

            <Section title="Semáforo de risco por curso">
              <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
                {(["CRITICO", "ALTO", "MEDIO"] as const).map((k) => (
                  <Chip key={k} icon={<Dot color={RISCO_SEM[k]} size={12} />} label={`${label(k)}: ${r.cursosEmRisco?.[k] ?? 0}`} variant="outlined" />
                ))}
              </Box>
              <Status empty={!data.cursos?.length} emptyText="Nenhum curso cadastrado.">
                <Box sx={{ overflowX: "auto" }}>
                  <Table size="small">
                    <TableHead><TableRow>
                      <TableCell /><TableCell>Curso</TableCell><TableCell>Ato</TableCell><TableCell>Vencimento</TableCell><TableCell>Prontidão</TableCell><TableCell>Próx. prazo</TableCell><TableCell>Motivos</TableCell>
                    </TableRow></TableHead>
                    <TableBody>
                      {data.cursos.map((c: any) => (
                        <TableRow key={c.programId} hover>
                          <TableCell><Dot color={RISCO_SEM[c.risco] || SEMAFORO.CINZA} /></TableCell>
                          <TableCell><b>{c.curso}</b><br /><Typography variant="caption" color="text.secondary">{label(c.modalidade)}</Typography></TableCell>
                          <TableCell>{c.ato ? <>{label(c.ato.tipo)} {c.ato.numero}<br /><Chip size="small" label={label(c.ato.situacao)} sx={{ bgcolor: `${SIT_COR[c.ato.situacao] || "#94a3b8"}22`, color: SIT_COR[c.ato.situacao], fontWeight: 700 }} /></> : "Sem ato"}</TableCell>
                          <TableCell>{fmtDate(c.ato?.vencimento)}<br /><Typography variant="caption" color="text.secondary">{c.ato ? diasTxt(c.ato.diasRestantes) : ""}</Typography></TableCell>
                          <TableCell sx={{ minWidth: 150 }}><Progress value={c.prontidao} /></TableCell>
                          <TableCell>{diasTxt(c.diasParaPrazo)}</TableCell>
                          <TableCell sx={{ maxWidth: 320 }}><Typography variant="caption" sx={{ color: RISCO_COR[c.risco], fontWeight: 700 }}>{c.risco}</Typography> <Typography variant="caption" color="text.secondary">{(c.motivosRisco || []).join("; ")}</Typography></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              </Status>
            </Section>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              <Section title="Próximos prazos">
                <Status empty={!data.proximosPrazos?.length} emptyText="Nenhum prazo em aberto.">
                  {data.proximosPrazos.map((p: any, i: number) => (
                    <Paper key={i} variant="outlined" sx={{ p: 1.2, mb: 1, borderRadius: 2, display: "flex", gap: 1.5, alignItems: "center" }}>
                      <Dot color={p.severity === "CRITICO" ? SEMAFORO.VERMELHO : p.severity === "ATENCAO" ? SEMAFORO.AMARELO : SEMAFORO.VERDE} />
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{p.titulo}</Typography>
                        <Typography variant="caption" color="text.secondary">{fmtDate(p.prazo)} · {diasTxt(p.dias)} · {label(p.origem)}</Typography>
                      </Box>
                    </Paper>
                  ))}
                </Status>
              </Section>
              <Section title="Atos institucionais">
                <Status empty={!data.atosInstitucionais?.length} emptyText="Nenhum ato institucional (credenciamento/recredenciamento) registrado.">
                  {data.atosInstitucionais.map((a: any) => (
                    <Paper key={a.id} variant="outlined" sx={{ p: 1.2, mb: 1, borderRadius: 2, display: "flex", gap: 1.5, alignItems: "center" }}>
                      <Dot color={SIT_COR[a.situacao] || SEMAFORO.CINZA} />
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{label(a.tipo)} nº {a.numero}</Typography>
                        <Typography variant="caption" color="text.secondary">Vencimento: {fmtDate(a.vencimento)} · {label(a.situacao)}{a.diasRestantes != null ? ` · ${diasTxt(a.diasRestantes)}` : ""}</Typography>
                      </Box>
                    </Paper>
                  ))}
                </Status>
              </Section>
            </Box>
          </>
        )}
      </Status>
      {node}
    </Box>
  );
}
