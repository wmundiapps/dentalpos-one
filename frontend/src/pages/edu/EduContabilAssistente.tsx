import { Box, Tab, Tabs } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import EduShell from "../../edu/EduShell";
import { FaixaAviso } from "../../edu/contabil/comum2/kit";
import Chat from "../../edu/contabil/assistente/Chat";
import { ConfigAssistente, Revisoes } from "../../edu/contabil/assistente/Revisoes";

const ABAS = [["chat", "Conversa"], ["revisoes", "Revisão do contador"], ["config", "Configuração e privacidade"]] as const;

/** Contabilidade: Assistente Contábil (IA com base de conhecimento local) e fila de revisão do contador. */
export default function EduContabilAssistente() {
  const [params, setParams] = useSearchParams();
  const aba = Math.max(0, ABAS.findIndex(([k]) => k === (params.get("aba") || "chat")));
  return (
    <EduShell title="Assistente Contábil" subtitle="Tire dúvidas contábeis com conhecimento local; o parecer final é sempre do contador" hero={false}>
      <FaixaAviso />
      <Tabs value={aba} onChange={(_, v) => setParams({ aba: ABAS[v][0] })} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>{ABAS.map(([k, n]) => <Tab key={k} label={n} />)}</Tabs>
      <Box>{aba === 0 ? <Chat /> : null}{aba === 1 ? <Revisoes /> : null}{aba === 2 ? <ConfigAssistente /> : null}</Box>
    </EduShell>
  );
}
