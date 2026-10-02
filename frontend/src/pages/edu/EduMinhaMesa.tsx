import { Badge, Box, Chip, Tab, Tabs } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import EduShell from "../../edu/EduShell";
import { eduApi } from "../../services/EduApi";
import LembretesTab from "../../edu/mesa/LembretesTab";
import NotificacoesTab from "../../edu/mesa/NotificacoesTab";
import PendenciasTab from "../../edu/mesa/PendenciasTab";

interface Resumo { total: number; atrasados: number; criticos: number; aprovacoes: number; notificacoesNaoLidas: number }

export default function EduMinhaMesa() {
  const [tab, setTab] = useState(0);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [v, setV] = useState(0);

  const carregarResumo = useCallback(() => {
    eduApi.get<Resumo>("/reitoria/mesa/resumo").then(setResumo).catch(() => setResumo(null));
  }, []);
  useEffect(() => { carregarResumo(); }, [carregarResumo]);
  const mudou = () => { carregarResumo(); setV((n) => n + 1); };

  return (
    <EduShell title="Minha mesa" subtitle="Suas pendências, aprovações, lembretes e avisos em um só lugar.">
      {resumo && (
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
          <Chip label={`${resumo.total} pendências`} />
          <Chip color={resumo.atrasados ? "error" : "default"} label={`${resumo.atrasados} atrasadas`} />
          <Chip color={resumo.criticos ? "warning" : "default"} label={`${resumo.criticos} críticas`} />
          <Chip label={`${resumo.aprovacoes} aprovações`} />
        </Box>
      )}
      <Tabs value={tab} onChange={(_, x) => setTab(x)} variant="scrollable" scrollButtons="auto" sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
        <Tab label="Pendências" />
        <Tab label="Lembretes" />
        <Tab label={<Badge color="error" badgeContent={resumo?.notificacoesNaoLidas || 0} sx={{ "& .MuiBadge-badge": { right: -12 } }}>Notificações</Badge>} />
      </Tabs>
      {tab === 0 && <PendenciasTab key={`p${v}`} onChanged={carregarResumo} />}
      {tab === 1 && <LembretesTab key={`l${v}`} onChanged={carregarResumo} />}
      {tab === 2 && <NotificacoesTab key={`n${v}`} onChanged={carregarResumo} />}
    </EduShell>
  );
}
