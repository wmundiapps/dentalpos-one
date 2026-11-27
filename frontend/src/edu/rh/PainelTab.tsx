import { Alert, Box, Typography } from "@mui/material";
import { Acoes, Btn, COLORS, Kpi, KpiRow, LoadBox, Section, fmtDateTime, rh, useRh, useRunner, useToast } from "./kit";

/** Painel do RH (gestão) ou resumo pessoal (colaborador) + registro de ponto. */
export default function PainelTab({ onGo }: { onGo: (aba: string) => void }) {
  const p = useRh<any>("/painel");
  const meu = useRh<any>("/meu/resumo");
  const hoje = useRh<any>("/ponto/hoje");
  const { toast, node } = useToast();
  const run = useRunner(toast, () => { hoje.reload(); meu.reload(); });
  const d = p.data;
  const gestao = !!d;
  return (
    <>
      {node}
      <Section title="Registrar ponto" actions={hoje.data?.proximo ? <Btn variant="contained" onClick={() => run(() => rh("POST", "/ponto/marcar", { origem: "WEB" }), "Marcação registrada.")}>Registrar {String(hoje.data.proximo).replace(/_/g, " ").toLowerCase()}</Btn> : undefined}>
        <LoadBox loading={hoje.loading} error={hoje.error && /vinculado/.test(hoje.error) ? "Seu usuário não está vinculado a um colaborador do RH (peça ao RH para vincular)." : hoje.error} onRetry={hoje.reload}>
          {hoje.data && (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {hoje.data.marcacoes.length === 0 ? <Typography color="text.secondary">Nenhuma marcação hoje.</Typography> : hoje.data.marcacoes.map((m: any) => <Typography key={m.id} variant="body2" sx={{ bgcolor: "action.hover", px: 1.5, py: 0.5, borderRadius: 2 }}>{String(m.tipo).replace(/_/g, " ")}: <b>{fmtDateTime(m.dataHora)}</b></Typography>)}
            </Box>
          )}
        </LoadBox>
      </Section>
      {meu.data && (
        <Section title="Meu resumo">
          <KpiRow>
            <Kpi title="Banco de horas" value={meu.data.bancoDeHoras.saldo} hint={`a vencer ${meu.data.bancoDeHoras.aVencer} · vencido ${meu.data.bancoDeHoras.vencido}`} />
            <Kpi title="Advertências p/ ciência" value={meu.data.pendencias.advertenciasParaCiencia} color={meu.data.pendencias.advertenciasParaCiencia ? COLORS.warn : COLORS.ok} />
            <Kpi title="Avaliações pendentes" value={meu.data.pendencias.avaliacoes} />
            <Kpi title="Holerites" value={meu.data.holerites} />
          </KpiRow>
        </Section>
      )}
      <LoadBox loading={p.loading} error={p.error && !/permiss|restrito/i.test(p.error) ? p.error : null} onRetry={p.reload}>
        {gestao && (
          <>
            {(d.alertas.feriasVencidas > 0 || d.alertas.examesVencidosOuAusentes > 0) && <Alert severity="error" sx={{ mb: 2 }}>{d.alertas.feriasVencidas} período(s) de férias vencido(s) (pagamento em dobro) e {d.alertas.examesVencidosOuAusentes} exame(s) ocupacional(is) vencido(s)/ausente(s).</Alert>}
            <Section title="Quadro de pessoal">
              <KpiRow>{Object.entries(d.quadro).map(([k, v]) => <Kpi key={k} title={k.replace(/_/g, " ")} value={v as number} />)}</KpiRow>
            </Section>
            <Section title="Pendências">
              <KpiRow>
                <Kpi title="Ajustes de ponto" value={d.pendencias.ajustesPonto} color={d.pendencias.ajustesPonto ? COLORS.warn : COLORS.ok} />
                <Kpi title="Atestados a validar" value={d.pendencias.atestadosParaValidar} color={d.pendencias.atestadosParaValidar ? COLORS.warn : COLORS.ok} />
                <Kpi title="Licenças solicitadas" value={d.pendencias.licencasSolicitadas} />
                <Kpi title="Advertências sem ciência" value={d.pendencias.advertenciasSemCiencia} />
                <Kpi title="Bonificações propostas" value={d.pendencias.bonificacoesPropostas} />
                <Kpi title="Admissões" value={d.pendencias.admissoesEmAndamento} />
                <Kpi title="Desligamentos" value={d.pendencias.desligamentosEmAndamento} />
              </KpiRow>
              <Acoes>
                <Btn onClick={() => onGo("ponto")}>Ponto</Btn><Btn onClick={() => onGo("saude")}>Atestados e licenças</Btn><Btn onClick={() => onGo("advertencias")}>Advertências</Btn><Btn onClick={() => onGo("ciclo")}>Admissão e desligamento</Btn>
              </Acoes>
            </Section>
            <Section title="Alertas">
              <KpiRow>
                <Kpi title="Férias vencidas" value={d.alertas.feriasVencidas} color={d.alertas.feriasVencidas ? COLORS.bad : COLORS.ok} />
                <Kpi title="Férias em risco" value={d.alertas.feriasEmRisco} color={d.alertas.feriasEmRisco ? COLORS.warn : COLORS.ok} />
                <Kpi title="Exames vencidos/ausentes" value={d.alertas.examesVencidosOuAusentes} color={d.alertas.examesVencidosOuAusentes ? COLORS.bad : COLORS.ok} />
                <Kpi title="Exames a vencer" value={d.alertas.examesAVencer} />
                <Kpi title="Banco vencido" value={d.alertas.bancoVencido} color={d.alertas.bancoVencido !== "00:00" ? COLORS.bad : COLORS.ok} />
                <Kpi title="Banco a vencer" value={d.alertas.bancoAVencer} />
              </KpiRow>
            </Section>
            {d.folha && <Section title={`Folha ${d.folha.competencia}`} actions={<Btn onClick={() => onGo("folha")}>Abrir folha</Btn>}><Typography variant="body2">Status: <b>{d.folha.status}</b>{d.folha.totais ? ` · líquido R$ ${Number(d.folha.totais.liquido).toLocaleString("pt-BR")} · ${d.folha.totais.colaboradores} colaboradores` : ""}</Typography></Section>}
            {d.aniversariantes.length > 0 && <Section title="Aniversariantes do mês"><Typography variant="body2">{d.aniversariantes.map((a: any) => `${a.nome} (${a.dia})`).join(" · ")}</Typography></Section>}
          </>
        )}
      </LoadBox>
    </>
  );
}
