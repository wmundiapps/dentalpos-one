import { Box, Tab, Tabs } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import EduShell from "../../edu/EduShell";
import PainelTab from "../../edu/marketing/PainelTab";
import CalendarioTab from "../../edu/marketing/CalendarioTab";
import CampanhasTab from "../../edu/marketing/CampanhasTab";
import LeadsTab from "../../edu/marketing/LeadsTab";
import CanaisTab from "../../edu/marketing/CanaisTab";
import OfflineTab from "../../edu/marketing/OfflineTab";
import IaTab from "../../edu/marketing/IaTab";
import SiteTab from "../../edu/marketing/SiteTab";
import EventosTab from "../../edu/marketing/EventosTab";
import ConformidadeTab from "../../edu/marketing/ConformidadeTab";

const SECOES = ["painel", "calendario", "campanhas", "leads", "canais", "offline", "ia", "site", "eventos", "lgpd"] as const;
const ROTULOS: Record<(typeof SECOES)[number], string> = { painel: "Painel", calendario: "Calendário", campanhas: "Campanhas", leads: "Leads e Funil", canais: "Canais e Disparos", offline: "Mídia offline", ia: "Gerador IA", site: "Site e Landing pages", eventos: "Eventos", lgpd: "Conformidade LGPD" };

export default function EduMarketing() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("secao") || "painel";
  const secao = (SECOES as readonly string[]).includes(raw) ? (raw as (typeof SECOES)[number]) : "painel";
  const go = (s: string) => setParams({ secao: s });
  const el = { painel: <PainelTab onGo={go} />, calendario: <CalendarioTab />, campanhas: <CampanhasTab />, leads: <LeadsTab />, canais: <CanaisTab />, offline: <OfflineTab />, ia: <IaTab />, site: <SiteTab />, eventos: <EventosTab />, lgpd: <ConformidadeTab /> }[secao];
  return (
    <EduShell title="Marketing e Captação" subtitle="Campanhas, leads e funil, canais de disparo, mídia offline, gerador de peças com IA, site e landing pages, eventos e conformidade LGPD.">
      <Tabs value={secao} onChange={(_, v) => go(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        {SECOES.map((s) => <Tab key={s} value={s} label={ROTULOS[s]} />)}
      </Tabs>
      <Box>{el}</Box>
    </EduShell>
  );
}
