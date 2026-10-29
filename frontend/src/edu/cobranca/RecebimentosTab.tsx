import { Box, Button, TextField } from "@mui/material";
import { useState } from "react";
import { Bar, COLORS, Kpi, KpiRow, LoadBox, Pick, Section, fmtDate, fmtMoney, fmtPct, useApi, useToast } from "../desempenho/kit";
import { ResponsiveTable, baixarCsv, qstr } from "./common";

const dia = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export default function RecebimentosTab() {
  const [de, setDe] = useState(dia(-30));
  const [ate, setAte] = useState(dia(0));
  const [dim, setDim] = useState("curso");
  const r = useApi<any>(`/cobranca/recebimentos${qstr({ de, ate })}`);
  const rk = useApi<any>(`/cobranca/ranking?dimensao=${dim}`);
  const { toast, node } = useToast();
  const t = r.data?.totais;
  const maxDia = r.data ? Math.max(1, ...r.data.porDia.map((x: any) => x.valor)) : 1;
  return (
    <>
      {node}
      <Section title="Recebimentos do período" actions={<Button variant="outlined" onClick={() => baixarCsv(`/cobranca/recebimentos${qstr({ de, ate, formato: "csv" })}`, "recebimentos.csv").catch((e) => toast({ type: "error", text: e.message }))}>Exportar CSV</Button>}>
        <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
          <TextField size="small" type="date" label="De" value={de} onChange={(e) => setDe(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="date" label="Até" value={ate} onChange={(e) => setAte(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Box>
        <LoadBox loading={r.loading && !r.data} error={r.error} onRetry={r.reload}>
          {t && (
            <>
              <KpiRow>
                <Kpi title="Entrou em caixa" value={fmtMoney(t.caixaTotal)} color={COLORS.ok} />
                <Kpi title="Recuperado em atraso" value={fmtMoney(t.recuperadoEmAtraso)} hint="títulos pagos após o vencimento" color={COLORS.ok} />
                <Kpi title="Pagos no prazo" value={fmtMoney(t.pagosNoPrazo)} />
                <Kpi title="Via cobrança (baixas e acordos)" value={fmtMoney(t.viaCobranca)} hint={Object.entries(t.porOrigem).map(([k, v]) => `${k.replace(/_/g, " ").toLowerCase()} ${fmtMoney(v as number)}`).join(" · ")} />
                <Kpi title="Encargos arrecadados" value={fmtMoney(t.encargosArrecadados)} />
                <Kpi title="Descontos concedidos" value={fmtMoney(t.descontosConcedidos)} color={COLORS.warn} />
              </KpiRow>
              {r.data.porDia.map((x: any) => <Bar key={x.dia} value={x.valor} max={maxDia} color={COLORS.ok} label={fmtDate(x.dia + "T12:00:00")} right={fmtMoney(x.valor)} />)}
              <Box sx={{ mt: 1, mb: 2 }}>{Object.entries(t.porForma).map(([k, v]) => <span key={k} style={{ marginRight: 16 }}>{k}: <b>{fmtMoney(v as number)}</b></span>)}</Box>
              <ResponsiveTable rows={r.data.titulos} rowKey={(x: any) => x.id} empty="Nenhum título pago no período."
                cols={[
                  { key: "pagoEm", label: "Pago em", render: (x: any) => fmtDate(x.pagoEm) },
                  { key: "aluno", label: "Aluno", render: (x: any) => <b>{x.aluno}</b> },
                  { key: "descricao", label: "Título", hideMobile: true },
                  { key: "vencimento", label: "Vencimento", hideMobile: true, render: (x: any) => fmtDate(x.vencimento) },
                  { key: "diasAtraso", label: "Atraso", align: "right", render: (x: any) => (x.diasAtraso ? `${x.diasAtraso}d${x.viaAcordo ? " (acordo)" : ""}` : "no prazo") },
                  { key: "valor", label: "Valor", align: "right", render: (x: any) => fmtMoney(x.valor) },
                ]} />
            </>
          )}
        </LoadBox>
      </Section>
      <Section title="Ranking de inadimplência" actions={<Pick label="Agrupar por" value={dim} onChange={setDim} options={[{ value: "curso", label: "Curso" }, { value: "turma", label: "Turma" }, { value: "polo", label: "Polo" }, { value: "segmento", label: "Segmento" }]} minWidth={160} />}>
        <LoadBox loading={rk.loading && !rk.data} error={rk.error} onRetry={rk.reload}>
          <ResponsiveTable rows={rk.data?.rows ?? []} rowKey={(x: any) => x.id + x.nome} empty="Sem dados."
            cols={[
              { key: "posicao", label: "#", render: (x: any) => x.posicao },
              { key: "nome", label: "Grupo", render: (x: any) => <b>{x.nome}</b> },
              { key: "taxaInadimplencia", label: "Taxa", align: "right", render: (x: any) => <b style={{ color: x.taxaInadimplencia > 15 ? COLORS.bad : undefined }}>{fmtPct(x.taxaInadimplencia)}</b> },
              { key: "alunosInadimplentes", label: "Inadimplentes", align: "right", render: (x: any) => `${x.alunosInadimplentes} de ${x.alunosNaCarteira} (${fmtPct(x.pctAlunos, 0)})` },
              { key: "saldo", label: "Saldo vencido", align: "right", render: (x: any) => fmtMoney(x.saldo) },
              { key: "mais90", label: "90+ dias", align: "right", hideMobile: true, render: (x: any) => fmtMoney(x.mais90) },
              { key: "carteira", label: "Carteira 12m", align: "right", hideMobile: true, render: (x: any) => fmtMoney(x.carteira) },
            ]} />
          <small>{rk.data?.base}</small>
        </LoadBox>
      </Section>
    </>
  );
}
