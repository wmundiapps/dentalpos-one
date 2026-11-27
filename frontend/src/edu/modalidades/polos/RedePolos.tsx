import { Box, Button, Chip, LinearProgress, Paper, Typography } from "@mui/material";
import { Loadable, Section, useAsync } from "../kit";
import { Card, Cards, corNivel, get, money, pctTxt, post, rotuloNivel, useAcao } from "./util";

/** Painel consolidado da rede de polos: KPIs somados, semáforo por polo e rankings. */
export default function RedePolos({ onAbrirPolo }: { onAbrirPolo: (id: string) => void }) {
  const { data, loading, error, reload } = useAsync(() => get("/rede"), []);
  const { run, ocupado, aviso } = useAcao(reload);
  const t = data?.totais;
  return (
    <Box>
      {aviso}
      <Loadable loading={loading} error={error}>
        {t ? (
          <>
            <Cards>
              <Card label="Polos ativos" value={t.polos} color="#2563eb" />
              <Card label="Alunos ativos" value={t.alunosAtivos} hint={`${t.alunosTotal} no total`} color="#16a34a" />
              <Card label="Inadimplência (alunos)" value={pctTxt(t.inadimplenciaPct)} hint={`${money(t.valorVencido)} vencido`} color="#dc2626" />
              <Card label="Rematrícula confirmada" value={pctTxt(t.rematriculaPct)} hint={`${t.rematriculaConfirmadas}/${t.rematriculaBase}`} color="#7c3aed" />
              <Card label="Evasão" value={pctTxt(t.evasaoPct)} hint={`${t.evadidos} aluno(s)`} color="#ca8a04" />
              <Card label="Provas nos próximos 30 dias" value={t.provasProximas} color="#0891b2" />
              <Card label="Participação no ENADE" value={pctTxt(t.enadePct)} hint={`${t.enadeParticiparam}/${t.enadeTotal}`} color="#0f766e" />
              <Card label="Egressos acompanhados" value={t.egressos} color="#475569" />
            </Cards>
            <Section title="Polos da rede" hint="Semáforo calculado por inadimplência, evasão e rematrícula. Clique no polo para abrir o painel completo."
              actions={<Button size="small" variant="outlined" disabled={ocupado} onClick={() => run(() => post("/provas/avisos/processar"), (r) => `Provas analisadas: ${r.provas}. Avisos enviados: ${r.avisosEnviados}.`)}>Enviar avisos de prova (D-7 / D-1)</Button>}>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr", xl: "1fr 1fr 1fr" }, gap: 2 }}>
                {data.polos.map((k: any) => (
                  <Paper key={k.polo.id} variant="outlined" sx={{ p: 2, borderRadius: 3, borderTop: `5px solid ${corNivel(k.nivel)}`, cursor: "pointer" }} onClick={() => onAbrirPolo(k.polo.id)}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography sx={{ fontWeight: 800, flex: 1 }} noWrap>{k.polo.nome}</Typography>
                      <Chip size="small" label={rotuloNivel(k.nivel)} sx={{ bgcolor: corNivel(k.nivel), color: "#fff", fontWeight: 700 }} />
                    </Box>
                    <Typography variant="caption" color="text.secondary">{[k.polo.cidade, k.polo.uf].filter(Boolean).join("/")} · resp.: {k.polo.responsavelNome || "—"}</Typography>
                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.5, mt: 1.2 }}>
                      <Typography variant="body2">Alunos ativos: <b>{k.alunosAtivos}</b></Typography>
                      <Typography variant="body2">Inadimplência: <b>{pctTxt(k.inadimplenciaPct)}</b></Typography>
                      <Typography variant="body2">Rematrícula: <b>{pctTxt(k.rematriculaPct)}</b></Typography>
                      <Typography variant="body2">Evasão: <b>{pctTxt(k.evasaoPct)}</b></Typography>
                      <Typography variant="body2">Provas próximas: <b>{k.provasProximas}</b></Typography>
                      <Typography variant="body2">ENADE: <b>{k.enade.participaram}/{k.enade.total}</b></Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={Math.min(100, k.inadimplenciaPct * 2)} color={k.inadimplenciaPct >= 25 ? "error" : k.inadimplenciaPct >= 12 ? "warning" : "success"} sx={{ height: 6, borderRadius: 3, mt: 1.2 }} />
                  </Paper>
                ))}
              </Box>
            </Section>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              <Section title="Maior inadimplência">
                {data.ranking.maiorInadimplencia.map((r: any, i: number) => <Typography key={r.id}>{i + 1}. {r.nome} — <b>{pctTxt(r.pct)}</b></Typography>)}
              </Section>
              <Section title="Maior evasão">
                {data.ranking.maiorEvasao.map((r: any, i: number) => <Typography key={r.id}>{i + 1}. {r.nome} — <b>{pctTxt(r.pct)}</b></Typography>)}
              </Section>
            </Box>
          </>
        ) : null}
      </Loadable>
    </Box>
  );
}
