import { Box, Tab, Tabs } from "@mui/material";
import { useState } from "react";
import EduShell from "../../edu/EduShell";
import BotTab from "../../edu/comunicacao/BotTab";
import CampanhasTab from "../../edu/comunicacao/CampanhasTab";
import CanaisTab from "../../edu/comunicacao/CanaisTab";
import InboxTab from "../../edu/comunicacao/InboxTab";
import PainelTab from "../../edu/comunicacao/PainelTab";
import ReguaTab from "../../edu/comunicacao/ReguaTab";
import SocialTab from "../../edu/comunicacao/SocialTab";
import TemplatesTab from "../../edu/comunicacao/TemplatesTab";
import { useToast } from "../../edu/comunicacao/common";

const ABAS = ["Painel", "Atendimento (inbox)", "Templates e contatos", "Campanhas", "Régua de cobrança", "Chatbot e FAQ", "Redes sociais", "Canais e envios"];

export default function EduComunicacao() {
  const [tab, setTab] = useState(() => {
    try { return Number(localStorage.getItem("edu.comunicacao.tab")) || 0; } catch { return 0; }
  });
  const { setMsg, node } = useToast();
  function go(v: number) { setTab(v); try { localStorage.setItem("edu.comunicacao.tab", String(v)); } catch { /* sem armazenamento */ } }

  return (
    <EduShell title="Comunicação" subtitle="Atendimento omnichannel, campanhas, régua de cobrança, chatbot e redes sociais.">
      <Tabs value={Math.min(tab, ABAS.length - 1)} onChange={(_, v) => go(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
        {ABAS.map((a) => <Tab key={a} label={a} />)}
      </Tabs>
      <Box>
        {tab === 0 && <PainelTab toast={setMsg} />}
        {tab === 1 && <InboxTab toast={setMsg} />}
        {tab === 2 && <TemplatesTab toast={setMsg} />}
        {tab === 3 && <CampanhasTab toast={setMsg} />}
        {tab === 4 && <ReguaTab toast={setMsg} />}
        {tab === 5 && <BotTab toast={setMsg} />}
        {tab === 6 && <SocialTab toast={setMsg} />}
        {tab === 7 && <CanaisTab toast={setMsg} />}
      </Box>
      {node}
    </EduShell>
  );
}
