import { Box, Tab, Tabs } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import EduShell from "../../edu/EduShell";
import PainelTab from "../../edu/cobranca/PainelTab";
import InadimplentesTab from "../../edu/cobranca/InadimplentesTab";
import AcordosTab from "../../edu/cobranca/AcordosTab";
import ReguaPoliticasTab from "../../edu/cobranca/ReguaPoliticasTab";
import HistoricoTab from "../../edu/cobranca/HistoricoTab";
import RecebimentosTab from "../../edu/cobranca/RecebimentosTab";

const ABAS = [
  { k: "painel", label: "Painel" }, { k: "inadimplentes", label: "Inadimplentes" }, { k: "acordos", label: "Acordos e Negociações" },
  { k: "regua", label: "Régua e Políticas" }, { k: "historico", label: "Histórico de Contatos" }, { k: "recebimentos", label: "Recebimentos" },
];

export default function EduCobranca() {
  const [params, setParams] = useSearchParams();
  const aba = ABAS.some((a) => a.k === params.get("aba")) ? params.get("aba")! : "painel";
  const ir = (k: string) => setParams({ aba: k });
  return (
    <EduShell title="Cobrança e inadimplência" subtitle="Planilha de inadimplentes, política, régua com recorrência, acordos, conformidade (CDC art. 42 / LGPD) e escalonamento ao Jurídico.">
      <Tabs value={aba} onChange={(_, v) => ir(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        {ABAS.map((a) => <Tab key={a.k} value={a.k} label={a.label} />)}
      </Tabs>
      <Box>
        {aba === "painel" && <PainelTab onGo={ir} />}
        {aba === "inadimplentes" && <InadimplentesTab />}
        {aba === "acordos" && <AcordosTab />}
        {aba === "regua" && <ReguaPoliticasTab />}
        {aba === "historico" && <HistoricoTab />}
        {aba === "recebimentos" && <RecebimentosTab />}
      </Box>
    </EduShell>
  );
}
