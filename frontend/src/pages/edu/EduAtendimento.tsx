import { Box, Tab, Tabs } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import EduShell from "../../edu/EduShell";
import CentralTab from "../../edu/atendimento/CentralTab";
import ProtocolosTab from "../../edu/atendimento/ProtocolosTab";
import DocumentosTab from "../../edu/atendimento/DocumentosTab";
import ConhecimentoTab from "../../edu/atendimento/ConhecimentoTab";
import EmissaoTab from "../../edu/atendimento/EmissaoTab";
import CatalogoTab from "../../edu/atendimento/CatalogoTab";
import PainelTab from "../../edu/atendimento/PainelTab";

const SECOES = ["central", "protocolos", "documentos", "conhecimento", "emissao", "catalogo", "painel"] as const;
const ROTULOS: Record<(typeof SECOES)[number], string> = { central: "Central / caixa", protocolos: "Protocolos e jornada", documentos: "Documentos recebidos", conhecimento: "Base de conhecimento e IA", emissao: "Emissão de documentos", catalogo: "Catálogo de serviços", painel: "Painel / SLA" };

export default function EduAtendimento() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("secao") || "central";
  const secao = (SECOES as readonly string[]).includes(raw) ? (raw as (typeof SECOES)[number]) : "central";
  const el = { central: <CentralTab />, protocolos: <ProtocolosTab />, documentos: <DocumentosTab />, conhecimento: <ConhecimentoTab />, emissao: <EmissaoTab />, catalogo: <CatalogoTab />, painel: <PainelTab /> }[secao];
  return (
    <EduShell title="Central de Atendimento" subtitle="Caixa única omnichannel, protocolos com rastreio, documentos, IA, emissão de documentos e autoatendimento.">
      <Tabs value={secao} onChange={(_, v) => setParams({ secao: v })} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        {SECOES.map((s) => <Tab key={s} value={s} label={ROTULOS[s]} />)}
      </Tabs>
      <Box>{el}</Box>
    </EduShell>
  );
}
