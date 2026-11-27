import { Alert, Box, Button, Typography } from "@mui/material";
import { AVISO_MODELO, AlertaChip, COLORS, DataList, J, Kpi, KpiRow, LoadBox, Section, fmtDate, fmtMoney, useApi } from "./kit";

const SECAO: Record<string, string> = { documentos: "documentos", contratos: "contratos", imoveis: "imoveis", polos: "polos", processos: "processos", riscos: "riscos", inteligencia: "inteligencia" };

export default function PainelTab({ onGo }: { onGo: (secao: string) => void }) {
  const p = useApi<any>(`${J}/painel`);
  const prov = useApi<any>(`${J}/financeiro/provisoes`);
  const ob = useApi<any>(`${J}/financeiro/obrigacoes?dias=90`);
  const d = p.data;
  return (
    <>
      <Section title="Visão geral do jurídico">
        <LoadBox loading={p.loading} error={p.error} onRetry={p.reload}>
          {d && (
            <>
              {d.alertas.vencidos > 0 && <Alert severity="error" sx={{ mb: 2 }}>{d.alertas.vencidos} item(ns) jurídico(s) vencido(s) ou com prazo estourado — veja a lista abaixo.</Alert>}
              {d.processos.prazosEm7Dias > 0 && <Alert severity="warning" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => onGo("processos")}>Ver</Button>}>{d.processos.prazosEm7Dias} prazo(s) processual(is) nos próximos 7 dias.</Alert>}
              <KpiRow>
                <Kpi title="Documentos vigentes" value={d.acervo.documentosVigentes} />
                <Kpi title="Contratos vigentes" value={d.acervo.contratosVigentes} hint={`${d.acervo.contratosPoloVigentes} de polo · ${d.acervo.locacoesVigentes} locações`} />
                <Kpi title="Processos em andamento" value={d.processos.emAndamento} hint={`${d.processos.sofridosAbertos} sofridos`} color={COLORS.info} />
                <Kpi title="Provisão (provável)" value={fmtMoney(d.processos.provisaoProvavel)} hint={`${d.processos.qtdProvaveis} processo(s)`} color={d.processos.qtdProvaveis ? COLORS.warn : COLORS.ok} />
                <Kpi title="Audiências em 30 dias" value={d.processos.audienciasEm30Dias} />
                <Kpi title="Riscos críticos / altos" value={`${d.riscos.critico} / ${d.riscos.alto}`} color={d.riscos.critico ? COLORS.bad : d.riscos.alto ? COLORS.warn : COLORS.ok} />
                <Kpi title="Seguros vigentes" value={d.seguros.vigentes} hint={`${d.seguros.sinistrosEmAberto} sinistro(s) em aberto`} />
                <Kpi title="Aluguel em atraso" value={fmtMoney(d.imoveis.valorAtrasado)} hint={`${d.imoveis.parcelasAtrasadas} parcela(s)`} color={d.imoveis.parcelasAtrasadas ? COLORS.bad : COLORS.ok} />
              </KpiRow>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Alertas de vencimento</Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
                <Typography variant="body2">Vencidos: <b>{d.alertas.vencidos}</b></Typography>
                <Typography variant="body2">até 30 dias: <b>{d.alertas.ate30}</b></Typography>
                <Typography variant="body2">até 60 dias: <b>{d.alertas.ate60}</b></Typography>
                <Typography variant="body2">até 90 dias: <b>{d.alertas.ate90}</b></Typography>
              </Box>
              <DataList rows={d.alertas.proximos.map((a: any) => ({ ...a, id: a.refId + a.tipo }))} onRowClick={(a: any) => onGo(SECAO[a.secao] || "painel")}
                columns={[
                  { label: "Item", primary: true, render: (a: any) => <>{a.titulo}</> },
                  { label: "Tipo", render: (a: any) => a.rotulo },
                  { label: "Vencimento", render: (a: any) => fmtDate(a.vencimento) },
                  { label: "Prazo", render: (a: any) => <AlertaChip alerta={{ dias: a.dias, faixa: a.faixa }} /> },
                ]} />
              {!d.alertas.proximos.length && <Typography color="text.secondary">Nenhum vencimento nos próximos 90 dias.</Typography>}
            </>
          )}
        </LoadBox>
      </Section>
      <Section title="Integração com o Financeiro">
        <LoadBox loading={prov.loading || ob.loading} error={prov.error || ob.error} onRetry={() => { prov.reload(); ob.reload(); }}>
          {prov.data && ob.data && (
            <KpiRow>
              <Kpi title="Provisão contábil" value={fmtMoney(prov.data.provisaoTotal)} hint={`${prov.data.qtdProvaveis} provável(is) · variação 30 d: ${fmtMoney(prov.data.variacao30d)}`} color={COLORS.warn} />
              <Kpi title="Passivo contingente (possível)" value={fmtMoney(prov.data.passivoContingente.valorCausaPossiveis)} hint={`${prov.data.passivoContingente.qtdPossiveis} processo(s) — divulgar, não provisionar`} />
              <Kpi title="Aluguel a pagar (90 d)" value={fmtMoney(ob.data.aluguelAPagar.valor)} hint={`${ob.data.aluguelAPagar.qtd} parcela(s)`} />
              <Kpi title="Renovação de seguros (90 d)" value={fmtMoney(ob.data.renovacaoSeguros.premioEstimado)} hint={`${ob.data.renovacaoSeguros.qtd} apólice(s)`} />
            </KpiRow>
          )}
          <Typography variant="caption" color="text.secondary">{prov.data?.referencia}</Typography>
        </LoadBox>
      </Section>
      <Alert severity="warning">{AVISO_MODELO}</Alert>
    </>
  );
}
