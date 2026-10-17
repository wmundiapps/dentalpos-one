import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Paper, Tab, Tabs, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { loadUnscheduled, type UnscheduledGroup, type UnscheduledPatient } from "../services/FollowUpApi";

const COLOR: Record<string, "error" | "warning" | "info"> = { FALTOU: "error", CANCELOU: "warning", SEM_RETORNO: "info" };
const digits = (v: string) => v.replace(/\D/g, "");
const whatsapp = (phone: string) => { const d = digits(phone); return d.length >= 10 ? `https://wa.me/${d.startsWith("55") ? d : `55${d}`}` : ""; };

// Pacientes que ficaram sem consulta marcada (faltaram, cancelaram ou foram atendidos sem retorno): painéis da recepção e clínico.
export default function UnscheduledPatientsCard({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const [data, setData] = useState<{ total: number; groups: UnscheduledGroup[] } | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState(0);

  useEffect(() => { loadUnscheduled(compact ? 15 : 40).then(setData).catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar.")); }, [compact]);

  if (error) return null;
  if (!data) return <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, textAlign: "center" }}><CircularProgress size={22} /></Paper>;
  const groups = data.groups.filter((g) => g.total > 0);
  const current = groups[Math.min(tab, Math.max(0, groups.length - 1))];

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mt: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", mb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Pacientes sem agendar</Typography>
        <Chip size="small" color={data.total ? "warning" : "success"} label={data.total ? `${data.total} paciente(s)` : "Nenhum"} />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Quem faltou, cancelou ou foi atendido e ainda não tem a próxima consulta marcada. A lista também chega toda segunda-feira por e-mail para o responsável.</Typography>
      {data.total === 0 && <Alert severity="success">Todos os pacientes têm retorno marcado.</Alert>}
      {groups.length > 0 && (
        <>
          <Tabs value={Math.min(tab, groups.length - 1)} onChange={(_, v) => setTab(v)} variant="scrollable" sx={{ mb: 1 }}>
            {groups.map((g) => <Tab key={g.kind} label={`${g.label} (${g.total})`} />)}
          </Tabs>
          {current.patients.map((p: UnscheduledPatient) => (
            <Box key={p.id} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1.4fr 1fr auto" }, gap: 1, py: 1, borderTop: "1px solid", borderColor: "divider", alignItems: "center" }}>
              <Typography sx={{ fontWeight: 700 }}>{p.name}</Typography>
              <Typography variant="body2" color="text.secondary">{p.phone || "sem telefone"}</Typography>
              <Chip size="small" variant="outlined" color={COLOR[p.kind]} label={`há ${p.daysAway} dia(s)`} sx={{ width: "fit-content" }} />
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button size="small" variant="contained" onClick={() => navigate(`/ficha-paciente?patientId=${encodeURIComponent(p.id)}`)}>Agendar</Button>
                {whatsapp(p.phone) && <Button size="small" component="a" href={whatsapp(p.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</Button>}
              </Box>
            </Box>
          ))}
          {current.total > current.patients.length && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>{`Mostrando ${current.patients.length} de ${current.total}. Os demais estão no e-mail semanal.`}</Typography>}
        </>
      )}
    </Paper>
  );
}
