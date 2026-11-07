import { useEffect, useState } from "react";
import { Alert, Box, Button, Checkbox, FormControlLabel, Paper, Radio, RadioGroup, TextField, Typography } from "@mui/material";
import { loadPublicSurvey, sendPublicSurvey, type PublicSurveyForm } from "../services/ClubApi";

// Pagina publica /avaliar/:token — o paciente avalia a clinica, identificado ou anonimo.
export default function PatientSurveyPublic({ token }: { token: string }) {
  const [form, setForm] = useState<PublicSurveyForm | null>(null);
  const [err, setErr] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [recommend, setRecommend] = useState("");
  const [identify, setIdentify] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [highlight, setHighlight] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => { loadPublicSurvey(token).then(setForm).catch((e) => setErr(e.message)); }, [token]);

  if (err && !form) return <Box sx={{ p: 3, maxWidth: 640, mx: "auto" }}><Alert severity="error">{err}</Alert></Box>;
  if (!form) return null;
  if (sent) return <Box sx={{ p: 3, maxWidth: 640, mx: "auto" }}><Alert severity="success">Obrigado pela sua avaliação! Ela ajuda a {form.clinicName} a atender cada vez melhor.</Alert></Box>;

  const complete = form.ratings.every((r) => answers[r.id]) && form.yesNo.every((q) => answers[q.id]) && recommend;
  const scale = (value: string, onChange: (v: string) => void) => (
    <RadioGroup row value={value} onChange={(e) => onChange(e.target.value)}>
      {form.scale.map((s, i) => <FormControlLabel key={s} value={String(i + 1)} control={<Radio size="small" />} label={`${i + 1} · ${s}`} />)}
    </RadioGroup>
  );
  const send = async () => {
    setBusy(true); setErr("");
    try {
      await sendPublicSurvey(token, { answers, recommend: Number(recommend), anonymous: !identify, name: identify ? name : undefined, phone: identify ? phone : undefined, highlightStaff: highlight || undefined, comment: comment || undefined });
      setSent(true);
    } catch (e) { setErr(e instanceof Error ? e.message : "Não foi possível enviar."); } finally { setBusy(false); }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 720, mx: "auto" }}>
      <Typography variant="h5" sx={{ fontWeight: 800 }}>Avalie a {form.clinicName}</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Leva 1 minuto. Você pode responder sem se identificar.</Typography>
      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
        {form.ratings.map((r) => (
          <Box key={r.id} sx={{ mb: 1.5 }}>
            <Typography sx={{ fontWeight: 600 }}>{r.text}</Typography>
            {scale(answers[r.id] || "", (v) => setAnswers({ ...answers, [r.id]: v }))}
          </Box>
        ))}
        {form.yesNo.map((q) => (
          <Box key={q.id} sx={{ mb: 1.5 }}>
            <Typography sx={{ fontWeight: 600 }}>{q.text}</Typography>
            <RadioGroup row value={answers[q.id] || ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}>
              <FormControlLabel value="SIM" control={<Radio size="small" />} label="SIM" />
              <FormControlLabel value="NAO" control={<Radio size="small" />} label="NÃO" />
            </RadioGroup>
          </Box>
        ))}
        <Typography sx={{ fontWeight: 600 }}>Qual a chance de você indicar a clínica a um amigo ou familiar?</Typography>
        {scale(recommend, setRecommend)}
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
        <TextField size="small" label="Alguém da equipe se destacou? (opcional)" value={highlight} onChange={(e) => setHighlight(e.target.value)} />
        <TextField size="small" multiline minRows={3} label="Comentário (opcional)" value={comment} onChange={(e) => setComment(e.target.value)} />
        <FormControlLabel control={<Checkbox checked={identify} onChange={(e) => setIdentify(e.target.checked)} />} label="Quero me identificar" />
        {identify && (
          <>
            <TextField size="small" label="Seu nome" value={name} onChange={(e) => setName(e.target.value)} />
            <TextField size="small" label="WhatsApp (opcional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Typography variant="caption" color="text.secondary">Seu nome e telefone ficam só com a gestão da clínica, para retornar sobre a sua avaliação.</Typography>
          </>
        )}
      </Paper>
      <Button variant="contained" size="large" disabled={busy || !complete} onClick={send}>Enviar avaliação</Button>
    </Box>
  );
}
