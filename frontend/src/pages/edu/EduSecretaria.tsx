import { Alert, Box, Button, Tab, Tabs } from "@mui/material";
import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";
import { useState } from "react";
import EduShell from "../../edu/EduShell";
import ArquivoTab from "../../edu/secretaria/ArquivoTab";
import CertificadosTab from "../../edu/secretaria/CertificadosTab";
import ConferenciaTab from "../../edu/secretaria/ConferenciaTab";
import DiplomasTab from "../../edu/secretaria/DiplomasTab";
import DocumentosTab from "../../edu/secretaria/DocumentosTab";
import ProtocolosTab from "../../edu/secretaria/ProtocolosTab";
import { eduApi } from "../../services/EduApi";

const ABAS = ["Requerimentos", "Documentos acadêmicos", "Análise de documentos", "Certificados", "Diplomas e colação", "Arquivo"];

export default function EduSecretaria() {
  const [tab, setTab] = useState(0);
  const [msg, setMsg] = useState<{ t: "success" | "error"; m: string } | null>(null);
  const [rev, setRev] = useState(0);

  async function bootstrap() {
    if (!window.confirm("Criar os tipos de requerimento, checklists, modelos de certificado, temporalidade e livros padrão (não duplica o que já existe)?")) return;
    try { await eduApi.post("/secretaria/bootstrap", {}); setMsg({ t: "success", m: "Configuração padrão da secretaria aplicada." }); setRev((r) => r + 1); }
    catch (e: any) { setMsg({ t: "error", m: e.message }); }
  }

  return (
    <EduShell title="Secretaria Acadêmica" subtitle="Protocolo e requerimentos, documentos, certificados, diplomas, colação e arquivo."
      actions={<Button variant="contained" color="inherit" sx={{ color: "primary.main", bgcolor: "#fff" }} startIcon={<AutoFixHighOutlinedIcon />} onClick={bootstrap}>Configuração padrão</Button>}>
      {msg && <Alert severity={msg.t} onClose={() => setMsg(null)} sx={{ mb: 2 }}>{msg.m}</Alert>}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        {ABAS.map((a) => <Tab key={a} label={a} />)}
      </Tabs>
      <Box key={rev}>
        {tab === 0 && <ProtocolosTab />}
        {tab === 1 && <DocumentosTab />}
        {tab === 2 && <ConferenciaTab />}
        {tab === 3 && <CertificadosTab />}
        {tab === 4 && <DiplomasTab />}
        {tab === 5 && <ArquivoTab />}
      </Box>
    </EduShell>
  );
}
