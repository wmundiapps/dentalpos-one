import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SyncIcon from "@mui/icons-material/Sync";
import PageHeader from "../components/PageHeader";
import { getMarketingHubStatus, openMarketingHub, syncMarketingHub, type MarketingHubStatus } from "../services/MarketingHubApi";

// Central de Marketing: abre o módulo de mensageria/CRM/campanhas (produto parceiro) já autenticado.
export default function MarketingHub() {
  const [status, setStatus] = useState<MarketingHubStatus | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncInfo, setSyncInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await getMarketingHubStatus();
      setStatus(s);
      if (s.configured && s.enabled) setUrl((await openMarketingHub()).url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível abrir o Marketing.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function sync() {
    setSyncInfo(null);
    try {
      const r = await syncMarketingHub();
      setSyncInfo(r.skipped ? `Sincronização ignorada: ${r.skipped}.` : `${r.sent ?? 0} evento(s) enviados para as automações.`);
    } catch (e) {
      setSyncInfo(e instanceof Error ? e.message : "Falha ao sincronizar.");
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "calc(100vh - 96px)", minHeight: 560 }}>
      <PageHeader title="Central de Marketing" description="Campanhas, conversas, CRM, chatbot com IA e ligações automáticas em um só lugar." />
      {loading && (
        <Stack sx={{ py: 8, alignItems: "center" }}>
          <CircularProgress />
        </Stack>
      )}
      {!loading && error && (
        <Alert severity="error" action={<Button onClick={() => void load()}>Tentar novamente</Button>}>
          {error}
        </Alert>
      )}
      {!loading && !error && status && !status.configured && (
        <Alert severity="info">A Central de Marketing ainda não foi configurada neste ambiente. Fale com o suporte WMundi.</Alert>
      )}
      {!loading && !error && status?.configured && !status.enabled && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6">Marketing não está ativo para esta clínica</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Com o Marketing ativo, a clínica envia lembretes de consulta, recupera faltas, acompanha orçamentos, faz cobranças e recall por WhatsApp, SMS, e-mail e
            ligação, com atendimento automático por IA. Fale com a WMundi para ativar.
          </Typography>
        </Paper>
      )}
      {!loading && url && (
        <>
          <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Button size="small" startIcon={<SyncIcon />} onClick={() => void sync()}>
              Sincronizar agenda e financeiro agora
            </Button>
            <Button size="small" startIcon={<OpenInNewIcon />} onClick={async () => window.open((await openMarketingHub()).url.replace("embed=1&", ""), "_blank")}>
              Abrir em nova aba
            </Button>
            {syncInfo && (
              <Typography variant="body2" color="text.secondary">
                {syncInfo}
              </Typography>
            )}
          </Stack>
          <Paper sx={{ flex: 1, overflow: "hidden", borderRadius: 2 }}>
            <iframe title="Central de Marketing" src={url} style={{ border: 0, width: "100%", height: "100%" }} allow="clipboard-write" />
          </Paper>
        </>
      )}
    </Box>
  );
}
