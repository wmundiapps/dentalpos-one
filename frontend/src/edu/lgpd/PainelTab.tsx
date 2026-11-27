import { Alert, Box, Button, Typography } from "@mui/material";
import { COLORS, Kpi, KpiRow, LoadBox, Section, call, fmtDateTime, useApi, useRunner, useToast } from "../desempenho/kit";

export default function PainelTab({ onGo }: { onGo: (aba: number) => void }) {
  const p = useApi<any>("/lgpd/painel");
  const { toast, node } = useToast();
  const run = useRunner(toast, p.reload);
  const d = p.data;
  return (
    <>
      {node}
      <Section title="Visão geral da conformidade" actions={<Button onClick={() => run(() => call("POST", "/lgpd/bootstrap", {}), "Modelos de inventário e retenção conferidos.")}>Preparar modelos (ROPA e retenção)</Button>}>
        <LoadBox loading={p.loading} error={p.error} onRetry={p.reload}>
          {d && (
            <>
              {!d.dpo && <Alert severity="warning" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => onGo(6)}>Designar</Button>}>Nenhum encarregado (DPO) designado — exigido pelo art. 41.</Alert>}
              {d.incidentes.comComunicacaoPendente > 0 && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => onGo(4)}>Ver</Button>}>{d.incidentes.comComunicacaoPendente} incidente(s) com comunicação à ANPD/titulares pendente (prazo de 3 dias úteis).</Alert>}
              {d.solicitacoes.vencidas > 0 && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => onGo(1)}>Ver fila</Button>}>{d.solicitacoes.vencidas} solicitação(ões) de titulares com prazo de 15 dias vencido.</Alert>}
              <KpiRow>
                <Kpi title="Solicitações abertas" value={d.solicitacoes.abertas} hint={`${d.solicitacoes.vencendo} vencendo`} color={d.solicitacoes.abertas ? COLORS.info : undefined} />
                <Kpi title="Vencidas" value={d.solicitacoes.vencidas} color={d.solicitacoes.vencidas ? COLORS.bad : COLORS.ok} />
                <Kpi title="Consentimentos ativos" value={d.consentimentos.ativos} hint={`${d.consentimentos.revogados} revogados`} />
                <Kpi title="Atividades no ROPA" value={d.ropa.total} hint={`${d.ropa.emRevisao} em revisão`} color={d.ropa.emRevisao ? COLORS.warn : COLORS.ok} />
                <Kpi title="Com dado sensível" value={d.ropa.sensiveis} /><Kpi title="Com dado de menores" value={d.ropa.menores} />
                <Kpi title="Incidentes abertos" value={d.incidentes.abertos} color={d.incidentes.abertos ? COLORS.warn : COLORS.ok} />
              </KpiRow>
              <Typography variant="body2">Encarregado: <b>{d.dpo ? `${d.dpo.nome} (${d.dpo.email})` : "não designado"}</b></Typography>
              <Typography variant="body2">Retenção: job em <b>{d.modoRetencao === "EXECUCAO" ? "execução real" : "dry-run"}</b>{d.ultimaRetencao ? ` · última rotina ${fmtDateTime(d.ultimaRetencao.iniciadoEm)} (${d.ultimaRetencao.alvo}, ${d.ultimaRetencao.afetados} registros, ${d.ultimaRetencao.dryRun ? "simulação" : "real"})` : " · ainda sem execuções"}</Typography>
            </>
          )}
        </LoadBox>
      </Section>
      <Section title="Como usar esta central">
        <Box component="ul" sx={{ m: 0, pl: 3 }}>
          <li>Designe o encarregado e divulgue os links públicos (Política, Termos e Portal do Titular).</li>
          <li>Revise o inventário (ROPA) e marque cada atividade como “Ativa”.</li>
          <li>Trate a fila de solicitações dentro de 15 dias; verifique a identidade antes de entregar ou alterar dados.</li>
          <li>Mantenha a retenção em dry-run até validar os prazos com o jurídico; só então habilite a execução.</li>
          <li>Em incidentes, o relógio de 3 dias úteis começa na ciência — registre-o imediatamente.</li>
        </Box>
        <Alert severity="warning" sx={{ mt: 2 }}>Todos os textos e prazos são modelos de apoio e <b>precisam ser validados por advogado</b>. Este módulo não substitui assessoria jurídica.</Alert>
      </Section>
    </>
  );
}
