import { Box, Tab, Tabs } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import EduShell from "../../edu/EduShell";
import { FaixaAviso } from "../../edu/contabil/comum2/kit";
import { Funcionarios, PainelDp, Vagas } from "../../edu/contabil/rh-dp/Pessoas";
import { Calculadoras, Folhas } from "../../edu/contabil/rh-dp/Folha";
import { EsocialSimulado, Ferias, Rescisoes, Tabelas } from "../../edu/contabil/rh-dp/Rescisoes";

const ABAS = [["painel", "Painel"], ["vagas", "Vagas e candidatos"], ["funcionarios", "Funcionários e admissão"], ["folha", "Folha e 13º"], ["ferias", "Férias"], ["rescisoes", "Rescisões"], ["calculadoras", "Calculadoras"], ["esocial", "eSocial (simulado)"], ["tabelas", "Tabelas fiscais"]] as const;

/** Contabilidade: RH/Departamento Pessoal do recrutamento à demissão (visão contábil/DP). Tudo é estimativa a conferir. */
export default function EduContabilRhDp() {
  const [params, setParams] = useSearchParams();
  const aba = Math.max(0, ABAS.findIndex(([k]) => k === (params.get("aba") || "painel")));
  return (
    <EduShell title="RH e Departamento Pessoal" subtitle="Escritório de contabilidade: recrutamento, admissão, folha, 13º, férias, afastamentos e rescisão (estimativas a conferir)" hero={false}>
      <FaixaAviso />
      <Tabs value={aba} onChange={(_, v) => setParams({ aba: ABAS[v][0] })} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>{ABAS.map(([k, n]) => <Tab key={k} label={n} />)}</Tabs>
      <Box>
        {aba === 0 ? <PainelDp /> : null}{aba === 1 ? <Vagas /> : null}{aba === 2 ? <Funcionarios /> : null}{aba === 3 ? <Folhas /> : null}{aba === 4 ? <Ferias /> : null}
        {aba === 5 ? <Rescisoes /> : null}{aba === 6 ? <Calculadoras /> : null}{aba === 7 ? <EsocialSimulado /> : null}{aba === 8 ? <Tabelas /> : null}
      </Box>
    </EduShell>
  );
}
