import { Alert, Box, Tab, Tabs } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import EduShell from "../../edu/EduShell";
import PainelTab from "../../edu/analise-docs/PainelTab";
import FilaTab from "../../edu/analise-docs/FilaTab";
import EquivalenciaTab from "../../edu/analise-docs/EquivalenciaTab";
import InstituicoesTab from "../../edu/analise-docs/InstituicoesTab";
import ConfigTab from "../../edu/analise-docs/ConfigTab";
import { AD, AVISO_AGENTE, useApi } from "../../edu/analise-docs/kit";

const SECOES = ["painel", "fila", "equivalencia", "instituicoes", "config"] as const;
const ROTULOS: Record<(typeof SECOES)[number], string> = { painel: "Painel e SLA", fila: "Fila de revisão", equivalencia: "Equivalência de disciplinas", instituicoes: "Instituições (MEC/estados)", config: "Configuração" };

/** Agente de análise de documentos (IA) — Secretaria, Financeiro e Jurídico. */
export default function EduAnaliseDocs() {
  const [params, setParams] = useSearchParams();
  const meta = useApi<any>(`${AD}/meta`);
  const admin = !!meta.data?.podeConfigurar;
  const secoes = SECOES.filter((s) => s !== "config" || admin);
  const raw = params.get("secao") || "painel";
  const secao = (secoes as readonly string[]).includes(raw) ? (raw as (typeof SECOES)[number]) : "painel";
  const caso = params.get("caso");
  const go = (s: string, extra?: Record<string, string>) => setParams({ secao: s, ...(extra || {}) });
  const abrir = (id: string | null) => { const n: Record<string, string> = { secao: "fila" }; if (id) n.caso = id; setParams(n); };
  const el = {
    painel: <PainelTab onGo={go} />,
    fila: <FilaTab inicial={Object.fromEntries(params.entries())} abrir={caso} onAbrir={abrir} />,
    equivalencia: <EquivalenciaTab />,
    instituicoes: <InstituicoesTab admin={admin} />,
    config: <ConfigTab />,
  }[secao];
  return (
    <EduShell title="Agente de documentos (IA)" subtitle="Analisa documentos de secretaria, financeiro e jurídico: extrai campos, confere o checklist, detecta conflitos e indícios de falsidade, verifica a instituição e avisa equivalências — sempre com revisão humana.">
      <Alert severity="info" sx={{ mb: 2 }}>{AVISO_AGENTE} Casos críticos avisam a reitoria e a diretoria do setor e bloqueiam a conclusão do processo até a decisão humana.</Alert>
      <Tabs value={secao} onChange={(_, v) => go(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        {secoes.map((s) => <Tab key={s} value={s} label={ROTULOS[s]} />)}
      </Tabs>
      <Box>{el}</Box>
    </EduShell>
  );
}
