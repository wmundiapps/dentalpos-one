import { Alert, Box, Button, Typography } from "@mui/material";
import { Bar, COLORS, Kpi, KpiRow, LoadBox, Section, call, fmtMoney, fmtPct, useApi, useRunner, useToast } from "../desempenho/kit";
import { FAIXAS } from "./common";

export default function PainelTab({ onGo }: { onGo: (aba: string) => void }) {
  const p = useApi<any>("/cobranca/painel");
  const { toast, node } = useToast();
  const run = useRunner(toast, p.reload);
  const d = p.data;
  const max = d ? Math.max(1, ...d.aging.map((a: any) => a.valor)) : 1;
  return (
    <>
      {node}
      <Section title="Visão geral da cobrança" actions={<>
        <Button variant="outlined" onClick={() => run(() => call("POST", "/cobranca/bootstrap", {}), "Políticas e régua padrão conferidas.")}>Criar padrões</Button>
        <Button variant="contained" onClick={() => run(() => call("POST", "/cobranca/motor/executar", { despachar: true }), "Régua executada: mensagens entraram na caixa de saída da Comunicação.", "Executar a régua agora para todos os casos elegíveis?")}>Executar régua agora</Button>
      </>}>
        <LoadBox loading={p.loading} error={p.error} onRetry={p.reload}>
          {d && (
            <>
              {d.escalonamento.aguardandoAprovacao > 0 && <Alert severity="warning" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => onGo("regua")}>Revisar</Button>}>{d.escalonamento.aguardandoAprovacao} encaminhamento(s) (negativação/protesto/jurídico) aguardam aprovação.</Alert>}
              {d.acordos.parcelasAtrasadas > 0 && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => onGo("acordos")}>Ver acordos</Button>}>{d.acordos.parcelasAtrasadas} parcela(s) de acordo em atraso ({fmtMoney(d.acordos.valorParcelasAtrasadas)}).</Alert>}
              {d.promessas.vencidasNaoBaixadas > 0 && <Alert severity="warning" sx={{ mb: 2 }}>{d.promessas.vencidasNaoBaixadas} promessa(s) de pagamento com a data vencida.</Alert>}
              <KpiRow>
                <Kpi title="Inadimplentes" value={d.devedores} color={COLORS.bad} />
                <Kpi title="Saldo vencido atualizado" value={fmtMoney(d.saldoVencido)} hint={`principal ${fmtMoney(d.principalVencido)} + encargos ${fmtMoney(d.encargos)}`} color={COLORS.bad} />
                <Kpi title="Taxa de inadimplência" value={fmtPct(d.taxaInadimplencia)} hint="vencido / carteira em aberto" color={d.taxaInadimplencia > 15 ? COLORS.bad : COLORS.warn} />
                <Kpi title="A vencer" value={fmtMoney(d.aVencer)} color={COLORS.info} />
                <Kpi title="Em acordo" value={fmtMoney(d.emAcordo)} hint={`${d.acordos.porStatus.ATIVO ?? 0} acordo(s) ativo(s)`} />
                <Kpi title="Recebido (30 dias)" value={fmtMoney(d.recebido30d)} hint={`recuperado em atraso: ${fmtMoney(d.recuperadoAtrasados30d)}`} color={COLORS.ok} />
              </KpiRow>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Aging (saldo por faixa de atraso)</Typography>
              {d.aging.map((a: any) => {
                const f = FAIXAS.find((x) => x.k === a.faixa)!;
                return <Bar key={a.faixa} value={a.valor} max={max} color={f.color} label={a.rotulo} right={`${fmtMoney(a.valor)} · ${a.titulos} título(s) · ${a.alunos} aluno(s)`} />;
              })}
            </>
          )}
        </LoadBox>
      </Section>
      {d && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }, gap: 2 }}>
          <Section title="Acordos e promessas">
            <Typography variant="body2">Propostas em negociação: <b>{(d.acordos.porStatus.PROPOSTA ?? 0) + (d.acordos.porStatus.CONTRAPROPOSTA ?? 0)}</b></Typography>
            <Typography variant="body2">Acordos ativos: <b>{d.acordos.porStatus.ATIVO ?? 0}</b> ({fmtMoney(d.acordos.valorAtivos)})</Typography>
            <Typography variant="body2">Quebrados (30 dias): <b>{d.acordos.quebrados30d}</b></Typography>
            <Typography variant="body2">Parcelas a vencer em 7 dias: <b>{d.acordos.parcelasProximos7d}</b></Typography>
            <Typography variant="body2">Promessas abertas: <b>{d.promessas.abertas}</b> ({fmtMoney(d.promessas.valorAbertas)}) · quebradas 30d: <b>{d.promessas.quebradas30d}</b></Typography>
          </Section>
          <Section title="Contatos e conformidade">
            <Typography variant="body2">Contatos hoje: <b>{d.contatos.hoje}</b></Typography>
            <Typography variant="body2">Bloqueados por opt-out (30d): <b>{d.contatos.bloqueadosOptout30d}</b></Typography>
            <Typography variant="body2">Adiados/bloqueados por janela (30d): <b>{d.contatos.bloqueadosJanela30d}</b></Typography>
            <Typography variant="body2">Bloqueados por limite diário/semanal (30d): <b>{d.contatos.bloqueadosLimite30d}</b></Typography>
            <Typography variant="caption" color="text.secondary">Cada tentativa fica registrada com base legal, canal e resultado.</Typography>
          </Section>
          <Section title="Casos por situação">
            {Object.entries(d.casos).map(([k, v]) => <Typography key={k} variant="body2">{k.replace(/_/g, " ")}: <b>{v as number}</b></Typography>)}
            <Typography variant="body2">Jurídico em andamento: <b>{d.escalonamento.juridicoEmAndamento}</b></Typography>
          </Section>
        </Box>
      )}
    </>
  );
}
