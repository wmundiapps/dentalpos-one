import { Box, Tab, Tabs } from "@mui/material";
import type { ReactElement } from "react";
import { useSearchParams } from "react-router-dom";
import EduShell from "../../edu/EduShell";
import PainelTab from "../../edu/rh/PainelTab";
import ColaboradoresTab from "../../edu/rh/ColaboradoresTab";
import PontoTab from "../../edu/rh/PontoTab";
import SaudeTab from "../../edu/rh/SaudeTab";
import FeriasTab from "../../edu/rh/FeriasTab";
import CarreiraTab from "../../edu/rh/CarreiraTab";
import AdvertenciasTab from "../../edu/rh/AdvertenciasTab";
import CicloVidaTab from "../../edu/rh/CicloVidaTab";
import AvaliacoesTab from "../../edu/rh/AvaliacoesTab";
import FolhaTab from "../../edu/rh/FolhaTab";
import SociosTab from "../../edu/rh/SociosTab";

export const RH_SECOES = [
  { id: "painel", label: "Painel" }, { id: "colaboradores", label: "Colaboradores" }, { id: "ponto", label: "Ponto e Banco de Horas" }, { id: "saude", label: "Atestados e Licenças" },
  { id: "ferias", label: "Férias" }, { id: "carreira", label: "Carreira e Bonificações" }, { id: "advertencias", label: "Advertências" }, { id: "ciclo", label: "Admissão e Desligamento" },
  { id: "avaliacoes", label: "Avaliações" }, { id: "folha", label: "Folha" }, { id: "socios", label: "Pró-labore e Terceiros" },
] as const;

export default function EduRh() {
  const [params, setParams] = useSearchParams();
  const atual = RH_SECOES.some((s) => s.id === params.get("secao")) ? (params.get("secao") as string) : "painel";
  const ir = (id: string) => setParams({ secao: id });
  const corpo: Record<string, ReactElement> = {
    painel: <PainelTab onGo={ir} />, colaboradores: <ColaboradoresTab />, ponto: <PontoTab />, saude: <SaudeTab />, ferias: <FeriasTab />, carreira: <CarreiraTab />,
    advertencias: <AdvertenciasTab />, ciclo: <CicloVidaTab />, avaliacoes: <AvaliacoesTab />, folha: <FolhaTab />, socios: <SociosTab />,
  };
  return (
    <EduShell title="RH" subtitle="Colaboradores, ponto e banco de horas, saúde ocupacional, férias, carreira, disciplina, avaliações, folha, pró-labore e terceiros.">
      <Tabs value={atual} onChange={(_, v) => ir(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        {RH_SECOES.map((s) => <Tab key={s.id} value={s.id} label={s.label} />)}
      </Tabs>
      <Box>{corpo[atual]}</Box>
    </EduShell>
  );
}
