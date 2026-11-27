import { Box, Tab, Tabs } from "@mui/material";
import type { ReactElement } from "react";
import { useSearchParams } from "react-router-dom";
import EduShell from "../../edu/EduShell";
import AgendaTab from "../../edu/campos-pratica/AgendaTab";
import AgroTab from "../../edu/campos-pratica/AgroTab";
import AnimalTab from "../../edu/campos-pratica/AnimalTab";
import ClinicasTab from "../../edu/campos-pratica/ClinicasTab";
import ConveniosTab from "../../edu/campos-pratica/ConveniosTab";
import EstagiosTab from "../../edu/campos-pratica/EstagiosTab";
import PacientesTab from "../../edu/campos-pratica/PacientesTab";
import PainelTab from "../../edu/campos-pratica/PainelTab";
import { perfil } from "../../edu/campos-pratica/kit";

export const CP_SECOES = [
  { id: "painel", label: "Painel" }, { id: "estagios", label: "Estágios" }, { id: "convenios", label: "Convênios e vagas" }, { id: "agenda", label: "Agenda das clínicas" },
  { id: "pacientes", label: "Pacientes e LGPD" }, { id: "clinicas", label: "Escalas e unidades" }, { id: "agro", label: "Agronomia" }, { id: "animal", label: "Núcleo animal" },
] as const;

export default function EduCamposPratica() {
  const [params, setParams] = useSearchParams();
  const pf = perfil();
  // Cada perfil enxerga só as abas que fazem sentido (a API valida de verdade).
  const secoes = CP_SECOES.filter((s) => {
    if (s.id === "convenios") return pf.secretaria || pf.professor;
    if (s.id === "pacientes") return pf.recepcao;
    return true;
  });
  const atual = secoes.some((s) => s.id === params.get("secao")) ? (params.get("secao") as string) : "painel";
  const ir = (id: string) => setParams({ secao: id });
  const corpo: Record<string, ReactElement> = {
    painel: <PainelTab onGo={ir} />, estagios: <EstagiosTab />, convenios: <ConveniosTab />, agenda: <AgendaTab />, pacientes: <PacientesTab />, clinicas: <ClinicasTab />, agro: <AgroTab />, animal: <AnimalTab />,
  };
  return (
    <EduShell title="Campos de prática" subtitle="Estágios e convênios, clínicas-escola e hospital veterinário, núcleo de agronomia e núcleo animal, com supervisão, LGPD e alertas.">
      <Tabs value={atual} onChange={(_, v) => ir(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        {secoes.map((s) => <Tab key={s.id} value={s.id} label={s.label} />)}
      </Tabs>
      <Box>{corpo[atual]}</Box>
    </EduShell>
  );
}
