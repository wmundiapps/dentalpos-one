import { Box, Button, Chip, Typography } from "@mui/material";
import { Acoes, Btn, COLORS, Kpi, KpiRow, LoadBox, Section, cp, corSeveridade, perfil, useCp, useRunner, useToast } from "./kit";

const NUCLEO: Record<string, string> = { ESTAGIOS: "estagios", AGRONOMIA: "agro" };

export default function PainelTab({ onGo }: { onGo: (secao: string) => void }) {
  const p = useCp<any>("/painel");
  const { toast, node } = useToast();
  const run = useRunner(toast, p.reload);
  const d = p.data;
  const pf = perfil();
  return (
    <>
      {node}
      <Section title="Visão geral dos campos de prática" actions={pf.gestor ? <Btn onClick={() => run(() => cp("POST", "/jobs/executar"), "Alertas e lembretes atualizados.")}>Atualizar alertas</Btn> : undefined}>
        <LoadBox loading={p.loading} error={p.error} onRetry={p.reload}>
          {d && (
            <>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Estágios</Typography>
              <KpiRow>
                <Kpi title="Em andamento" value={d.estagios.emAndamento} color={COLORS.info} />
                <Kpi title="Aguardando documentos" value={d.estagios.aguardandoDocumentos} color={d.estagios.aguardandoDocumentos ? COLORS.warn : COLORS.ok} />
                <Kpi title="Horas para validar" value={d.estagios.horasPendentesValidacao} color={d.estagios.horasPendentesValidacao ? COLORS.warn : COLORS.ok} />
              </KpiRow>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Clínicas-escola e hospital veterinário</Typography>
              <KpiRow>
                <Kpi title="Atendimentos hoje" value={d.clinicas.atendimentosHoje} color={COLORS.info} />
                <Kpi title="Fila de espera" value={d.clinicas.filaEspera} color={d.clinicas.filaEspera > 5 ? COLORS.warn : COLORS.ok} />
                <Kpi title="Animais internados" value={d.animal.internados} />
                <Kpi title="Vacinas atrasadas" value={d.animal.profilaxiaAtrasada} color={d.animal.profilaxiaAtrasada ? COLORS.bad : COLORS.ok} />
              </KpiRow>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Agronomia</Typography>
              <KpiRow><Kpi title="Ciclos ativos" value={d.agronomia.ciclosAtivos} color={COLORS.ok} /></KpiRow>
              <Acoes>
                <Button size="small" onClick={() => onGo("estagios")}>Estágios</Button>
                <Button size="small" onClick={() => onGo("agenda")}>Agenda das clínicas</Button>
                <Button size="small" onClick={() => onGo("agro")}>Agronomia</Button>
                <Button size="small" onClick={() => onGo("animal")}>Núcleo animal</Button>
              </Acoes>
            </>
          )}
        </LoadBox>
      </Section>
      {d && pf.recepcao && (
        <Section title={`Alertas (${d.totalAlertas})`}>
          {d.alertas.length === 0 ? <Typography color="text.secondary">Nenhum alerta no momento.</Typography> : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {d.alertas.map((a: any, i: number) => (
                <Box key={i} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", p: 1, border: 1, borderColor: "divider", borderRadius: 2, cursor: "pointer" }} onClick={() => onGo(NUCLEO[a.nucleo] ?? "painel")}>
                  <Chip size="small" color={corSeveridade(a.severidade)} label={a.severidade === "CRITICO" ? "Crítico" : a.severidade === "ATENCAO" ? "Atenção" : "Aviso"} />
                  <Chip size="small" variant="outlined" label={a.nucleo === "AGRONOMIA" ? "Agronomia" : "Estágios"} />
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 200 }}>{a.titulo}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </Section>
      )}
    </>
  );
}
