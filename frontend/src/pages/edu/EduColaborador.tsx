import { Tab, Tabs } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import EduShell from "../../edu/EduShell";
import ColaboradorPortal from "../../edu/operacao/ColaboradorPortal";
import ColaboradorGestao from "../../edu/operacao/ColaboradorGestao";

/** Portal do colaborador (RH): informações do próprio colaborador + gestão da biblioteca e dos EPIs pelo RH. */
export default function EduColaborador() {
  const [p, setP] = useSearchParams();
  const aba = p.get("aba") === "gestao" ? "gestao" : "meu";
  return (
    <EduShell title="Portal do colaborador" subtitle="Hierarquia, declarações, POPs, instruções de trabalho, manuais, treinamentos, EPIs e regras do seu setor.">
      <Tabs value={aba} onChange={(_, v) => setP(v === "meu" ? {} : { aba: v })} sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        <Tab value="meu" label="Meu portal" /><Tab value="gestao" label="Biblioteca e EPIs (RH)" />
      </Tabs>
      {aba === "meu" ? <ColaboradorPortal /> : <ColaboradorGestao />}
    </EduShell>
  );
}
