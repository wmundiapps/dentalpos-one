import { Box, Tab, Tabs } from "@mui/material";
import { useState, type ReactElement } from "react";
import EduShell from "../../edu/EduShell";
import PdiTab from "../../edu/governanca/PdiTab";
import PdiCadastroTab from "../../edu/governanca/PdiCadastroTab";
import DocumentosTab from "../../edu/governanca/DocumentosTab";
import CpaTab from "../../edu/governanca/CpaTab";
import NdeTab from "../../edu/governanca/NdeTab";
import ColegiadosTab from "../../edu/governanca/ColegiadosTab";
import CipaTab from "../../edu/governanca/CipaTab";
import CarreiraTab from "../../edu/governanca/CarreiraTab";

const TABS: Array<[string, () => ReactElement]> = [
  ["PDI — execução", () => <PdiTab />],
  ["PDI — estrutura", () => <PdiCadastroTab />],
  ["PPC e documentos", () => <DocumentosTab />],
  ["CPA", () => <CpaTab />],
  ["NDE", () => <NdeTab />],
  ["Colegiados", () => <ColegiadosTab />],
  ["CIPA / SST", () => <CipaTab />],
  ["Plano de carreira", () => <CarreiraTab />],
];

export default function EduGovernanca() {
  const [tab, setTab] = useState(0);
  return (
    <EduShell title="Governança" subtitle="PDI, PPC, CPA, NDE, colegiados, CIPA e plano de carreira.">
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        {TABS.map(([l]) => <Tab key={l} label={l} />)}
      </Tabs>
      <Box>{TABS[tab][1]()}</Box>
    </EduShell>
  );
}
