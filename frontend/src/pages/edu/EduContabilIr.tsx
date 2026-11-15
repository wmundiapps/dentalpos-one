import { Box, Tab, Tabs } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import EduShell from "../../edu/EduShell";
import { AvisoSimulacao, FaixaAviso } from "../../edu/contabil/comum2/kit";
import Declaracoes from "../../edu/contabil/imposto-renda/Declaracoes";
import { Obrigacoes, PainelIr } from "../../edu/contabil/imposto-renda/Obrigacoes";

const ABAS = [["painel", "Painel"], ["declaracoes", "Declarações PF e PJ"], ["obrigacoes", "Obrigações acessórias (PJ)"]] as const;

/** Contabilidade: imposto de renda PF/PJ, malha de inconsistências, transmissão SIMULADA e calendário de obrigações. */
export default function EduContabilIr() {
  const [params, setParams] = useSearchParams();
  const aba = Math.max(0, ABAS.findIndex(([k]) => k === (params.get("aba") || "painel")));
  return (
    <EduShell title="Imposto de renda" subtitle="Escritório de contabilidade: declaração PF e PJ, restituição, malha, recibos e obrigações acessórias (estimativas e simulações)" hero={false}>
      <FaixaAviso />
      <AvisoSimulacao texto="A transmissão de declarações é uma SIMULAÇÃO com recibo fictício: nada é enviado à Receita Federal. ECD, ECF, DCTF e EFD são controladas por calendário e checklist, sem gerar arquivos oficiais." />
      <Tabs value={aba} onChange={(_, v) => setParams({ aba: ABAS[v][0] })} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>{ABAS.map(([k, n]) => <Tab key={k} label={n} />)}</Tabs>
      <Box>{aba === 0 ? <PainelIr /> : null}{aba === 1 ? <Declaracoes /> : null}{aba === 2 ? <Obrigacoes /> : null}</Box>
    </EduShell>
  );
}
