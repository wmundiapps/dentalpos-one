import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Paper, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PageHeader from "../components/PageHeader";
import { demoSalesUrl } from "../services/DemoAccess";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

interface ClinicInfo { plan: string }

const PLANS = [
  {
    code: "STARTER",
    name: "Starter",
    price: "sob consulta",
    blurb: "Instituições pequenas, um único curso ou polo.",
    features: ["Acadêmico, Financeiro e Secretaria", "Até 300 alunos ativos", "1 polo/unidade", "Suporte por e-mail"],
  },
  {
    code: "PRO",
    name: "Pro",
    price: "sob consulta",
    blurb: "A maioria das faculdades e centros universitários.",
    features: ["Todos os 15 módulos do EduMaster", "Alunos ilimitados", "Polos/unidades ilimitados", "Provas e triagem regulatória com IA", "Suporte prioritário"],
    highlight: true,
  },
  {
    code: "ENTERPRISE",
    name: "Enterprise",
    price: "sob consulta",
    blurb: "Grupos educacionais com múltiplas instituições.",
    features: ["Tudo do Pro", "Múltiplos tenants/CNPJs", "Onboarding dedicado", "SLA contratual"],
  },
];

export default function PlansBilling() {
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("dentalpos.token") || "";
    const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
    fetch(`${API}/settings/clinic`, { headers: { Authorization: `Bearer ${token}`, ...(clinicId ? { "X-Clinic-ID": clinicId } : {}) } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Erro ao carregar plano atual."))))
      .then((data: ClinicInfo) => setCurrentPlan(data.plan))
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar plano atual."));
  }, []);

  return (
    <Box>
      <PageHeader title="Planos e Cobrança" description="Faixas de referência — os valores finais são combinados com a equipe comercial." />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {currentPlan && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Plano atual da instituição: <strong>{currentPlan}</strong>
        </Alert>
      )}

      <Alert severity="warning" sx={{ mb: 3 }}>
        Preços abaixo são sugestão inicial de posicionamento, não uma tabela comercial publicada. Defina os
        valores reais antes de divulgar esta página a clientes.
      </Alert>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 3 }}>
        {PLANS.map((plan) => (
          <Paper
            key={plan.code}
            variant="outlined"
            sx={{
              p: 3,
              borderRadius: 3,
              borderColor: plan.highlight ? "primary.main" : undefined,
              borderWidth: plan.highlight ? 2 : 1,
              position: "relative",
            }}
          >
            {plan.highlight && <Chip label="Mais popular" color="primary" size="small" sx={{ position: "absolute", top: -12, left: 16 }} />}
            {currentPlan === plan.code && <Chip label="Plano atual" color="success" size="small" sx={{ position: "absolute", top: -12, right: 16 }} />}
            <Typography variant="h6" sx={{ fontWeight: 900 }}>{plan.name}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{plan.blurb}</Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, mb: 2 }}>{plan.price}</Typography>
            <Box sx={{ display: "grid", gap: 1, mb: 3 }}>
              {plan.features.map((f) => (
                <Box key={f} sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                  <CheckCircleIcon color="success" fontSize="small" sx={{ mt: 0.3 }} />
                  <Typography variant="body2">{f}</Typography>
                </Box>
              ))}
            </Box>
            <Button
              fullWidth
              variant={plan.highlight ? "contained" : "outlined"}
              onClick={() => { window.location.href = demoSalesUrl(); }}
            >
              Falar com vendas
            </Button>
          </Paper>
        ))}
      </Box>
    </Box>
  );
}
