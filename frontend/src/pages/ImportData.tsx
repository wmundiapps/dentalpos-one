import { useState } from "react";
import { Box, Tab, Tabs } from "@mui/material";
import PageHeader from "../components/PageHeader";
import ImportPatients from "./ImportPatients";
import ImportAppointments from "../components/ImportAppointments";
import ImportFinancial from "../components/ImportFinancial";

export default function ImportData() {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <PageHeader
        title="Importar dados de outro sistema"
        description="Traga pacientes, agenda e financeiro de outro sistema, na ordem: primeiro os pacientes, depois a agenda e o financeiro."
      />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }} variant="scrollable" allowScrollButtonsMobile>
        <Tab label="1. Pacientes" />
        <Tab label="2. Agenda" />
        <Tab label="3. Financeiro" />
      </Tabs>
      {tab === 0 && <ImportPatients embedded />}
      {tab === 1 && <ImportAppointments />}
      {tab === 2 && <ImportFinancial />}
    </Box>
  );
}
