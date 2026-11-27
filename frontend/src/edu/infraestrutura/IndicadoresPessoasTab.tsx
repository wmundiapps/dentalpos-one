import { Alert, Typography } from "@mui/material";
import { DataList, J, LoadBox, Section, fmtMoney, itemsOf, label, useApi } from "./kit2";
import { readSessionUser } from "../../services/DemoAccess";

const pct = (v: any) => (v == null ? "—" : `${v}%`);

/** Indicadores por pessoa que alimentam a avaliação do funcionário no RH (contrato infra-rh-v1). */
export default function IndicadoresPessoasTab() {
  const permitido = ["ADMIN", "OWNER", "RECTOR", "BOARD", "HR"].includes(String(readSessionUser()?.role || "").toUpperCase());
  const l = useApi<any>(permitido ? `${J}/rh/indicadores/lote` : `${J}/rh/indicadores/meus`);
  if (!permitido) {
    const m = l.data;
    return (
      <Section title="Meus indicadores de infraestrutura">
        <LoadBox loading={l.loading} error={l.error} onRetry={l.reload}>
          {m && <Typography>Pontualidade: <b>{pct(m.componentes?.pontualidadePct)}</b> · Satisfação: <b>{pct(m.componentes?.satisfacaoPct)}</b> · Índice: <b>{m.indiceInfra ?? "—"}</b></Typography>}
        </LoadBox>
      </Section>
    );
  }
  const rows = itemsOf(l.data).map((p: any) => ({ ...p, id: p.pessoa.userId || p.pessoa.colaboradorId }));
  return (
    <Section title="Indicadores por pessoa (subsídio à avaliação no RH)">
      <Alert severity="info" sx={{ mb: 1.5 }}>Cumprimento de prazos, ocorrências, frota e segurança patrimonial por pessoa, últimos 12 meses. Subsídio objetivo: a decisão avaliativa é do RH/gestor.</Alert>
      <LoadBox loading={l.loading} error={l.error} empty={!rows.length} emptyText="Sem atividade registrada no período." onRetry={l.reload}>
        <DataList<any> rows={rows} columns={[
          { label: "Pessoa", primary: true, render: (p) => <><b>{p.pessoa.nome || "—"}</b><Typography variant="caption" component="div" color="text.secondary">{label(p.pessoa.perfil)}</Typography></> },
          { label: "Prazos", render: (p) => pct(p.componentes.pontualidadePct) }, { label: "Satisfação", render: (p) => pct(p.componentes.satisfacaoPct) },
          { label: "OS concl.", hideOnMobile: true, render: (p) => p.manutencao.osConcluidas }, { label: "Multas", hideOnMobile: true, render: (p) => `${p.frota.multas} (${fmtMoney(p.frota.multasValor)})` },
          { label: "Assiduidade", hideOnMobile: true, render: (p) => pct(p.componentes.assiduidadePct) }, { label: "Rondas", hideOnMobile: true, render: (p) => pct(p.componentes.rondasPct) }, { label: "Índice", render: (p) => <b>{p.indiceInfra ?? "—"}</b> },
        ]} />
      </LoadBox>
    </Section>
  );
}
