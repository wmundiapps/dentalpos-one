import { useEffect, useState } from "react";
import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, Paper, Rating, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { loadPublicSurvey, sendPublicAnswer, sendPublicOptOut, type PublicSurvey } from "../services/SatisfactionApi";

const RATED: Record<string, Array<[string, string]>> = {
  PRIMEIRA_CONSULTA: [["recepcao", "Recepção"], ["pontualidade", "Pontualidade"], ["ambiente", "Ambiente"], ["profissional", "Profissional"], ["equipe", "Equipe"]],
  TRATAMENTO: [["conforto", "Conforto durante o atendimento"], ["explicacao", "Explicações recebidas"], ["andamento", "Andamento do tratamento"]],
  FIM_TRATAMENTO: [["resultado", "Resultado do tratamento"]],
};

export default function SatisfactionPublic() {
  const token = new URLSearchParams(window.location.search).get("t") || "";
  const [survey, setSurvey] = useState<PublicSurvey | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [done, setDone] = useState<"" | "answered" | "optout">("");
  const [busy, setBusy] = useState(false);
  const [nps, setNps] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [resolved, setResolved] = useState<"" | "sim" | "nao">("");
  const [receivedBudget, setReceivedBudget] = useState<"" | "sim" | "nao">("");
  const [contracted, setContracted] = useState<"" | "sim" | "nao">("");
  const [reason, setReason] = useState("");
  const [wantsContact, setWantsContact] = useState(false);
  const [testimonial, setTestimonial] = useState(false);
  const [lgpd, setLgpd] = useState(false);

  useEffect(() => {
    if (!token) { setError("Link inválido."); setLoading(false); return; }
    loadPublicSurvey(token).then(setSurvey).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [token]);

  const submit = async () => {
    if (!survey || nps === null) return;
    setBusy(true); setError("");
    try {
      const details: Record<string, number | boolean | string> = { ...ratings };
      if (survey.journey === "PRIMEIRA_CONSULTA") {
        if (resolved) details.solicitacaoResolvida = resolved === "sim";
        if (receivedBudget) details.recebeuOrcamento = receivedBudget === "sim";
      }
      await sendPublicAnswer(token, {
        nps, comment: comment.trim() || undefined, details,
        contracted: survey.journey === "PRIMEIRA_CONSULTA" && contracted ? contracted === "sim" : undefined,
        notContractedReason: contracted === "nao" ? reason.trim() || undefined : undefined,
        wantsContact, testimonialConsent: survey.journey === "FIM_TRATAMENTO" ? testimonial : undefined,
        lgpdConsent: true,
      });
      setDone("answered");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível enviar."); } finally { setBusy(false); }
  };

  const optOut = async () => {
    setBusy(true);
    try { await sendPublicOptOut(token); setDone("optout"); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível concluir."); } finally { setBusy(false); }
  };

  const yesNo = (label: string, value: "" | "sim" | "nao", set: (v: "" | "sim" | "nao") => void) => (
    <Box sx={{ mt: 2 }}>
      <Typography variant="body2" sx={{ mb: 0.5 }}>{label}</Typography>
      <ToggleButtonGroup exclusive size="small" value={value} onChange={(_, v) => set(v || "")}>
        <ToggleButton value="sim">Sim</ToggleButton>
        <ToggleButton value="nao">Não</ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex", justifyContent: "center", p: { xs: 1.5, sm: 3 } }}>
      <Paper sx={{ width: "100%", maxWidth: 560, p: { xs: 2, sm: 3 }, alignSelf: "flex-start" }}>
        {loading && <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress /></Box>}
        {!loading && error && !survey && <Alert severity="info">{error}</Alert>}
        {done === "answered" && <Alert severity="success">Obrigado pela sua resposta! Ela nos ajuda a melhorar o atendimento.</Alert>}
        {done === "optout" && <Alert severity="success">Pronto. Você não receberá mais pesquisas de satisfação desta clínica.</Alert>}
        {survey && !done && (
          <>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>{survey.clinicName}</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Olá{survey.patientFirstName ? `, ${survey.patientFirstName}` : ""}! Conte como foi seu atendimento{survey.doctorName ? ` com ${survey.doctorName}` : ""}. Leva menos de 1 minuto.
            </Typography>

            <Typography sx={{ fontWeight: 700 }}>De 0 a 10, o quanto você recomendaria a clínica a um amigo ou familiar?</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 0.75, mt: 1 }}>
              {Array.from({ length: 11 }, (_, n) => (
                <Button key={n} variant={nps === n ? "contained" : "outlined"} onClick={() => setNps(n)} sx={{ minWidth: 0, py: 1.2 }} aria-label={`Nota ${n}`}>{n}</Button>
              ))}
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
              <Typography variant="caption" color="text.secondary">Nada provável</Typography>
              <Typography variant="caption" color="text.secondary">Muito provável</Typography>
            </Box>

            {(RATED[survey.journey] || []).map(([key, label]) => (
              <Box key={key} sx={{ mt: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                <Typography variant="body2">{label}</Typography>
                <Rating value={ratings[key] || 0} onChange={(_, v) => setRatings(r => ({ ...r, [key]: v || 0 }))} />
              </Box>
            ))}

            {survey.journey === "PRIMEIRA_CONSULTA" && (
              <>
                {yesNo("O motivo da sua visita foi resolvido?", resolved, setResolved)}
                {yesNo("Você recebeu um orçamento?", receivedBudget, setReceivedBudget)}
                {receivedBudget === "sim" && yesNo("Você decidiu contratar o tratamento?", contracted, setContracted)}
                {contracted === "nao" && (
                  <TextField fullWidth multiline minRows={2} sx={{ mt: 1.5 }} label="O que pesou na decisão? (valor, prazo, dúvida, outro)" value={reason} onChange={e => setReason(e.target.value)} slotProps={{ htmlInput: { maxLength: 300 } }} />
                )}
              </>
            )}

            <TextField fullWidth multiline minRows={3} sx={{ mt: 2 }} label="Comentário (opcional)" value={comment} onChange={e => setComment(e.target.value)} slotProps={{ htmlInput: { maxLength: 2000 } }} />
            <FormControlLabel sx={{ mt: 1 }} control={<Checkbox checked={wantsContact} onChange={e => setWantsContact(e.target.checked)} />} label="Quero que a clínica entre em contato comigo" />
            {survey.journey === "FIM_TRATAMENTO" && (
              <FormControlLabel control={<Checkbox checked={testimonial} onChange={e => setTestimonial(e.target.checked)} />} label="Autorizo a clínica a usar meu comentário como depoimento" />
            )}
            <FormControlLabel control={<Checkbox checked={lgpd} onChange={e => setLgpd(e.target.checked)} />} label="Concordo com o uso das minhas respostas pela clínica para melhorar o atendimento, conforme a LGPD." />

            {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
            <Button fullWidth size="large" variant="contained" sx={{ mt: 2 }} disabled={busy || nps === null || !lgpd} onClick={submit}>Enviar resposta</Button>
            <Button fullWidth size="small" color="inherit" sx={{ mt: 1.5 }} disabled={busy} onClick={optOut}>Não quero mais receber pesquisas</Button>
          </>
        )}
      </Paper>
    </Box>
  );
}
