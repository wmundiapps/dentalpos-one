import { Box, Tab, Tabs } from "@mui/material";
import { useState } from "react";
import PainelRemoto from "./Painel";

const ABAS: Array<[string, string]> = [["Consolidado", "niveis"], ["Graduação", "graduacao"], ["Pós lato sensu", "pos-lato"], ["Pós stricto sensu", "pos-stricto"]];

/** Relatórios de graduação e pós-graduação (lato e stricto sensu) por nível. */
export default function NiveisView() {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>{ABAS.map(([l]) => <Tab key={l} label={l} />)}</Tabs>
      <PainelRemoto key={ABAS[tab][1]} id={ABAS[tab][1]} />
    </Box>
  );
}
