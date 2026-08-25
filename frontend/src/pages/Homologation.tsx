import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Typography,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/Error";
import RefreshIcon from "@mui/icons-material/Refresh";
import SecurityIcon from "@mui/icons-material/Security";
import PageHeader from "../components/PageHeader";
import {
  loadPlatformReadiness,
  type PlatformReadiness,
} from "../services/PlatformReadinessApi";

export default function Homologation() {
  const [data, setData] = useState<PlatformReadiness | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setData(await loadPlatformReadiness());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao consultar ambiente.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const summary = useMemo(() => {
    if (!data) return { ok: 0, pending: 0 };
    return {
      ok: data.checks.filter((item) => item.ok).length,
      pending: data.checks.filter((item) => !item.ok).length,
    };
  }, [data]);

  return (
    <Box>
      <PageHeader
        title="Homologação e Segurança"
        description="Pré-flight do ambiente antes do piloto e da publicação em produção."
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Paper variant="outlined" sx={{ p: 5, borderRadius: 3, textAlign: "center" }}>
          <CircularProgress size={32} />
          <Typography color="text.secondary" sx={{ mt: 2 }}>Verificando API e ambiente...</Typography>
        </Paper>
      ) : data ? (
        <>
          <Alert severity={data.productionReady ? "success" : "warning"} sx={{ mb: 2 }}>
            {data.productionReady
              ? "Os requisitos críticos configuráveis deste ambiente estão aprovados. Ainda execute os testes funcionais e de restauração antes de promover para produção."
              : `${data.criticalPending} requisito(s) crítico(s) ainda impedem declarar o ambiente pronto para produção.`}
          </Alert>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 2, mb: 2 }}>
            <Summary title="Ambiente" value={data.environment.appEnv} />
            <Summary title="Canal" value={data.environment.releaseChannel} />
            <Summary title="Aprovados" value={String(summary.ok)} />
            <Summary title="Pendentes" value={String(summary.pending)} />
          </Box>

          <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 2 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, mb: 2 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 900 }}>Checklist técnico</Typography>
                <Typography variant="body2" color="text.secondary">Nenhum segredo é exibido nesta tela; apenas o estado da configuração.</Typography>
              </Box>
              <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void load()}>Atualizar</Button>
            </Box>

            <Box sx={{ display: "grid", gap: 1.2 }}>
              {data.checks.map((check) => (
                <Box
                  key={check.key}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "40px minmax(0,1fr) auto" },
                    gap: 1.5,
                    alignItems: "center",
                    p: 1.6,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                  }}
                >
                  <Box sx={{ color: check.ok ? "success.main" : check.critical ? "error.main" : "warning.main" }}>
                    {check.ok ? <CheckCircleOutlineIcon /> : <ErrorOutlineIcon />}
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 800 }}>{check.label}</Typography>
                    <Typography variant="body2" color="text.secondary">{check.detail}</Typography>
                  </Box>
                  <Chip
                    size="small"
                    label={check.ok ? "OK" : check.critical ? "Crítico" : "Pendente"}
                    color={check.ok ? "success" : check.critical ? "error" : "warning"}
                  />
                </Box>
              ))}
            </Box>
          </Paper>

          <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
              <SecurityIcon color="primary" />
              <Typography variant="h6" sx={{ fontWeight: 900 }}>Integrações da clínica</Typography>
            </Box>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Remetentes REVAH ativos: {data.integrations.activeRevahSenders} • Storage ativo: {data.integrations.activeStorageConfigs}
            </Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" }, gap: 1.5 }}>
              {data.integrations.paymentProviders.length ? data.integrations.paymentProviders.map((provider) => (
                <Box key={provider.provider} sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                  <Typography sx={{ fontWeight: 900 }}>{provider.provider}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {provider.environment} • credenciais {provider.credentialsConfigured ? "configuradas" : "pendentes"} • webhook {provider.webhookConfigured ? "configurado" : "pendente"}
                  </Typography>
                </Box>
              )) : (
                <Typography color="text.secondary">Nenhum provedor de pagamento cadastrado para esta clínica.</Typography>
              )}
            </Box>
          </Paper>
        </>
      ) : null}
    </Box>
  );
}

function Summary({ title, value }: { title: string; value: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
      <Typography variant="body2" color="text.secondary">{title}</Typography>
      <Typography variant="h5" sx={{ fontWeight: 900, mt: 0.5 }}>{value}</Typography>
    </Paper>
  );
}
