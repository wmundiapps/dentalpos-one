import { Box, Tab, Tabs } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import EduShell from "../../edu/EduShell";
import { AvisoSimulacao, FaixaAviso, Secao } from "../../edu/contabil/comum2/kit";
import Aberturas from "../../edu/contabil/societario/Aberturas";
import AlvarasLista, { PainelSocietario } from "../../edu/contabil/societario/Alvaras";
import { BuscaCnae } from "../../edu/contabil/societario/Cnaes";

const ABAS = [["painel", "Painel"], ["empresas", "Empresas em abertura"], ["alvaras", "Alvarás e licenças"], ["cnaes", "Consulta de CNAEs"]] as const;

/** Contabilidade: abertura de empresas (assistente passo a passo, CNAEs, viabilidade/CNPJ/IE/IM simulados, alvarás). */
export default function EduContabilAbertura() {
  const [params, setParams] = useSearchParams();
  const aba = Math.max(0, ABAS.findIndex(([k]) => k === (params.get("aba") || "painel")));
  return (
    <EduShell title="Abertura de empresas" subtitle="Escritório de contabilidade: tipo societário, CNAEs, viabilidade, documentos, CNPJ, inscrições e alvarás (simulados)" hero={false}>
      <FaixaAviso />
      <AvisoSimulacao />
      <Tabs value={aba} onChange={(_, v) => setParams({ aba: ABAS[v][0] })} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>{ABAS.map(([k, n]) => <Tab key={k} label={n} />)}</Tabs>
      <Box>
        {aba === 0 ? <PainelSocietario /> : null}
        {aba === 1 ? <Aberturas /> : null}
        {aba === 2 ? <Secao titulo="Alvarás e licenças de todas as empresas"><AlvarasLista /></Secao> : null}
        {aba === 3 ? <Secao titulo="Base de CNAEs (referencial)"><BuscaCnae /></Secao> : null}
      </Box>
    </EduShell>
  );
}
