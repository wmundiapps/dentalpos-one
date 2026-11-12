import { Alert, Box, Button, Chip, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { Dot, fmtNum, Kpi, KpiGrid, Section, SEMAFORO, Status, useApi } from "./ui";
import { AvisoFicticio } from "./mecShared";

const unidade = (u?: string) => (u === "%" ? "%" : u === "faixa" ? "" : u ? ` ${u}` : "");

function Faixa({ v }: { v?: number | null }) {
  if (v == null) return <>—</>;
  return <Chip size="small" color={v >= 5 ? "success" : v === 4 ? "info" : v === 3 ? "warning" : "error"} label={v} sx={{ fontWeight: 800, minWidth: 34 }} />;
}

export default function ExcelenciaTab() {
  const { data, loading, error, reload } = useApi<any>("/regulatorio/mec/excelencia");
  const r = data?.resumo;
  const cursos = new Map<string, any>();
  for (const [k, lista] of [["cpc", data?.cpc], ["enade", data?.enade], ["idd", data?.idd], ["cc", data?.cc]] as const) {
    for (const x of lista || []) cursos.set(x.curso, { ...(cursos.get(x.curso) || { curso: x.curso }), [k]: x });
  }
  return (
    <Box>
      <AvisoFicticio texto={data?.aviso} />
      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
        <Button startIcon={<RefreshIcon />} onClick={reload}>Atualizar</Button>
        <Typography variant="body2" color="text.secondary">Visão única e coerente com o painel da reitoria, a CPA, o PDI e o comparativo com outras IES.</Typography>
      </Box>
      <Status loading={loading && !data} error={error} onRetry={reload} empty={!data}>
        {data && r && (
          <>
            <Alert icon={<EmojiEventsIcon />} severity={r.notaMaxima ? "success" : "info"} sx={{ mb: 2, fontWeight: 700 }}>
              {r.notaMaxima ? `Todos os ${r.avaliaveis} indicadores avaliados estão no máximo.` : `${r.verdes} de ${r.avaliaveis} indicadores no máximo; os demais têm espaço para evoluir.`}
              {r.faixaMinimaConceitos != null ? ` Menor conceito em todo o conjunto (CI, IGC, CPC, CC, ENADE, IDD): ${r.faixaMinimaConceitos}.` : ""}
            </Alert>
            <KpiGrid>
              <Kpi title="Conceito Institucional (CI)" value={data.ci?.faixa ?? "—"} color={SEMAFORO.VERDE} hint={data.ci ? `ciclo ${data.ci.ano}` : "não informado"} />
              <Kpi title="IGC — Índice Geral de Cursos" value={data.igc?.faixa ?? "—"} color={SEMAFORO.VERDE} hint={data.igc?.valor != null ? `contínuo ${fmtNum(data.igc.valor, 2)} (${data.igc.ano})` : undefined} />
              <Kpi title="Docentes mestres/doutores" value={data.docentes?.pctMestresDoutores == null ? "—" : `${data.docentes.pctMestresDoutores}%`} color={SEMAFORO.VERDE} hint={`${data.docentes?.pctIntegral ?? "—"}% em regime integral`} />
              <Kpi title="Infraestrutura exigida" value={data.itens?.find((i: any) => i.chave === "INFRAESTRUTURA")?.valor == null ? "—" : `${data.itens.find((i: any) => i.chave === "INFRAESTRUTURA").valor}%`} color={SEMAFORO.VERDE} hint="itens exigidos atendidos" />
            </KpiGrid>

            <Section title="Placar de excelência">
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1 }}>
                {data.itens.map((i: any) => (
                  <Paper key={i.chave} variant="outlined" sx={{ p: 1.5, display: "flex", gap: 1.2, alignItems: "center" }}>
                    <Dot color={SEMAFORO[i.semaforo] || SEMAFORO.CINZA} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{i.rotulo}</Typography>
                      {i.detalhe && <Typography variant="caption" color="text.secondary">{i.detalhe}</Typography>}
                    </Box>
                    <Typography sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>{i.valor == null ? "—" : `${fmtNum(i.valor, 1)}${unidade(i.unidade)}`}<Typography component="span" variant="caption" color="text.secondary"> / meta {i.meta}{unidade(i.unidade)}</Typography></Typography>
                  </Paper>
                ))}
              </Box>
            </Section>

            <Section title="Conceitos por curso (CPC, CC, ENADE, IDD)">
              <Status empty={!cursos.size} emptyText="Nenhum conceito por curso cadastrado.">
                <Box sx={{ overflowX: "auto" }}>
                  <Table size="small">
                    <TableHead><TableRow><TableCell>Curso</TableCell><TableCell align="center">CPC</TableCell><TableCell align="center">CC</TableCell><TableCell align="center">ENADE</TableCell><TableCell align="center">IDD</TableCell></TableRow></TableHead>
                    <TableBody>
                      {[...cursos.values()].map((c) => (
                        <TableRow key={c.curso} hover>
                          <TableCell><b>{c.curso}</b></TableCell>
                          <TableCell align="center"><Faixa v={c.cpc?.faixa} /> <Typography variant="caption">{c.cpc?.valor != null ? fmtNum(c.cpc.valor, 2) : ""}</Typography></TableCell>
                          <TableCell align="center"><Faixa v={c.cc?.faixa} /></TableCell>
                          <TableCell align="center"><Faixa v={c.enade?.faixa} /> <Typography variant="caption">{c.enade?.valor != null ? fmtNum(c.enade.valor, 2) : ""}</Typography></TableCell>
                          <TableCell align="center"><Faixa v={c.idd?.faixa} /> <Typography variant="caption">{c.idd?.valor != null ? fmtNum(c.idd.valor, 2) : ""}</Typography></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              </Status>
            </Section>

            {data.comparativo?.posicoes?.length > 0 && (
              <Section title={`Comparativo com outras IES (${data.comparativo.totalIes} instituições)`}>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  {data.comparativo.posicoes.map((p: any) => (
                    <Chip key={p.indicador} color={p.posicao === 1 ? "success" : "default"} label={`${p.indicador}: ${p.posicao ?? "—"}º de ${p.participantes} (${fmtNum(p.valorProprio, 2)} vs média ${p.mediaConcorrentes == null ? "—" : fmtNum(p.mediaConcorrentes, 2)})`} />
                  ))}
                </Box>
              </Section>
            )}

            <Section title="Autoavaliação (CPA) e PDI">
              <Typography variant="body2">
                Ciclos de CPA: {data.cpa.ciclos.length} ({data.cpa.ciclos.filter((c: any) => c.status === "CONCLUIDO").length} concluído(s)) · participação {data.cpa.convites.usados}/{data.cpa.convites.total} ·
                relatórios anuais: {data.cpa.relatoriosAnuais} · plano de ação: {data.cpa.planosAcao.concluidos}/{data.cpa.planosAcao.total} concluído(s).
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>Egressos acompanhados: {data.egressos.total} (inseridos no mercado ou em estudo: {data.egressos.inseridos}). NDE: {data.nde.total} membro(s), {data.nde.pctMestresDoutores ?? "—"}% mestres/doutores.</Typography>
            </Section>
          </>
        )}
      </Status>
    </Box>
  );
}
