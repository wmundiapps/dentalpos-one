import { Box, Button, Tab, Tabs } from "@mui/material";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import { useNavigate, useSearchParams } from "react-router-dom";
import EduShell from "../../edu/EduShell";
import PainelTab from "../../edu/juridico/PainelTab";
import DocumentosTab from "../../edu/juridico/DocumentosTab";
import ContratosTab from "../../edu/juridico/ContratosTab";
import ImoveisTab from "../../edu/juridico/ImoveisTab";
import PolosTab from "../../edu/juridico/PolosTab";
import ProcessosTab from "../../edu/juridico/ProcessosTab";
import InteligenciaTab from "../../edu/juridico/InteligenciaTab";
import RiscosTab from "../../edu/juridico/RiscosTab";

const SECOES = ["painel", "documentos", "contratos", "imoveis", "polos", "processos", "inteligencia", "riscos"] as const;
const ROTULOS: Record<(typeof SECOES)[number], string> = { painel: "Painel", documentos: "Documentos", contratos: "Contratos", imoveis: "Imóveis", polos: "Polos", processos: "Processos", inteligencia: "Inteligência", riscos: "Riscos e Seguros" };

export default function EduJuridico() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const raw = params.get("secao") || "painel";
  const secao = (SECOES as readonly string[]).includes(raw) ? (raw as (typeof SECOES)[number]) : "painel";
  const go = (s: string) => setParams({ secao: s });
  const el = {
    painel: <PainelTab onGo={go} />, documentos: <DocumentosTab />, contratos: <ContratosTab />, imoveis: <ImoveisTab />,
    polos: <PolosTab />, processos: <ProcessosTab />, inteligencia: <InteligenciaTab />, riscos: <RiscosTab />,
  }[secao];
  return (
    <EduShell title="Jurídico" subtitle="Acervo documental, contratos, imóveis, polos EAD, processos, inteligência de prevenção, riscos e seguros."
      actions={<Button variant="contained" color="inherit" sx={{ color: "primary.main", bgcolor: "#fff" }} startIcon={<SmartToyOutlinedIcon />} onClick={() => nav("/edu/analise-docs?secao=fila&novo=1&origem=JURIDICO&contexto=CONTRATO&tipo=CONTRATO&titulo=" + encodeURIComponent("Contrato / certidão"))}>Analisar contrato ou certidão (IA)</Button>}>
      <Tabs value={secao} onChange={(_, v) => go(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        {SECOES.map((s) => <Tab key={s} value={s} label={ROTULOS[s]} />)}
      </Tabs>
      <Box>{el}</Box>
    </EduShell>
  );
}
