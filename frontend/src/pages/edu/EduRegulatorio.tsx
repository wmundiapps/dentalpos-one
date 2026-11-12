import { Box, Tab, Tabs } from "@mui/material";
import { useEffect, useState, type ReactElement } from "react";
import { useSearchParams } from "react-router-dom";
import GavelIcon from "@mui/icons-material/Gavel";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import EduShell from "../../edu/EduShell";
import PainelTab from "../../edu/regulatorio/PainelTab";
import ProcessosTab from "../../edu/regulatorio/ProcessosTab";
import AtosTab from "../../edu/regulatorio/AtosTab";
import ChecklistsTab from "../../edu/regulatorio/ChecklistsTab";
import DiligenciasTab from "../../edu/regulatorio/DiligenciasTab";
import IndicadoresTab from "../../edu/regulatorio/IndicadoresTab";
import SimuladorTab from "../../edu/regulatorio/SimuladorTab";
import AnaliseIaTab from "../../edu/regulatorio/AnaliseIaTab";
import ComissaoMecTab from "../../edu/regulatorio/ComissaoMecTab";
import ExcelenciaTab from "../../edu/regulatorio/ExcelenciaTab";

const TABS: Array<[string, () => ReactElement]> = [
  ["Painel regulatório", () => <PainelTab />],
  ["Comissão de avaliação do MEC", () => <ComissaoMecTab />],
  ["Excelência MEC", () => <ExcelenciaTab />],
  ["Processos MEC", () => <ProcessosTab />],
  ["Atos e portarias", () => <AtosTab />],
  ["Checklists", () => <ChecklistsTab />],
  ["Diligências", () => <DiligenciasTab />],
  ["Autoavaliação", () => <IndicadoresTab />],
  ["Simuladores CPC/CC", () => <SimuladorTab />],
  ["Análise por IA", () => <AnaliseIaTab />],
];

const ABAS: Record<string, number> = { comissao: 1, excelencia: 2 };

export default function EduRegulatorio() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState(ABAS[params.get("aba") || ""] ?? 0);
  useEffect(() => { const t = ABAS[params.get("aba") || ""]; if (t != null) setTab(t); }, [params]);
  return (
    <EduShell title="Regulatório" subtitle="Atos, processos e-MEC, prazos, prontidão e simuladores de conceito.">
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        {TABS.map(([l], i) => (
          <Tab
            key={l}
            label={l}
            icon={i === 1 ? <GavelIcon fontSize="small" /> : i === 2 ? <EmojiEventsIcon fontSize="small" /> : undefined}
            iconPosition="start"
            sx={i === 1 ? { fontWeight: 800, color: "primary.main", bgcolor: "action.hover", borderRadius: 2, mr: 0.5 } : undefined}
          />
        ))}
      </Tabs>
      <Box>{TABS[tab][1]()}</Box>
    </EduShell>
  );
}
