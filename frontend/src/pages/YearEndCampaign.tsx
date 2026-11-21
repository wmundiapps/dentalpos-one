import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Chip, MenuItem, Paper, TextField, Typography } from "@mui/material";
import PageHeader from "../components/PageHeader";
import { loadAbsentList, type AbsentList } from "../services/AbsenceRecallApi";
import { downloadCsv } from "../utils/exportTable";

const DEFAULT_TEXT = "Olá, {nome}! O final de ano está chegando e a gente vai sair de férias (e você também pode sair!). Aproveite e agende a sua revisão agora, para não passar apuros no seu tão merecido descanso. Escolha o melhor dia e horário na nossa agenda online: {link}\n\nEquipe {clinica}";
const SENT_KEY = "dentalpos.yearEndCampaign.sent.v1";
const DATE = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

function loadSent(): string[] { try { return JSON.parse(localStorage.getItem(SENT_KEY) || "[]"); } catch { return []; } }
const waNumber = (phone: string) => { const d = phone.replace(/\D/g, ""); return d.length >= 12 ? d : d ? `55${d}` : ""; };

// Campanha de final de ano: quem não vem há mais de X dias, com a mensagem pronta e o link da agenda online.
export default function YearEndCampaign() {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<AbsentList | null>(null);
  const [error, setError] = useState("");
  const [text, setText] = useState(DEFAULT_TEXT);
  const [sent, setSent] = useState<string[]>(loadSent);
  const [hideSent, setHideSent] = useState(false);

  useEffect(() => { setData(null); setError(""); loadAbsentList(days).then(setData).catch((e) => setError(e instanceof Error ? e.message : "Não foi possível carregar.")); }, [days]);

  const message = (name: string) => text.replaceAll("{nome}", name.trim().split(/\s+/)[0] || "tudo bem").replaceAll("{link}", data?.link || "").replaceAll("{clinica}", data?.clinicName || "");
  const markSent = (id: string) => setSent((cur) => { const next = [...new Set([...cur, id])]; try { localStorage.setItem(SENT_KEY, JSON.stringify(next)); } catch { /* sem armazenamento */ } return next; });
  const shown = useMemo(() => (data?.patients || []).filter((p) => !(hideSent && sent.includes(p.patientId))), [data, hideSent, sent]);
  const withPhone = shown.filter((p) => waNumber(p.phone)).length;

  const exportCsv = () => downloadCsv({ title: "Campanha de final de ano", fileBase: "campanha-final-de-ano", headers: ["Paciente", "WhatsApp", "Última consulta", "Dias sem vir", "Mensagem"], rows: shown.map((p) => [p.name, p.phone, DATE(p.lastVisit), p.daysAway, message(p.name)]) });

  return (
    <Box sx={{ textAlign: "left" }}>
      <PageHeader title="Campanha de final de ano" description="Pacientes que não vêm há muito tempo e não têm consulta marcada, com o WhatsApp pronto e o link da agenda online." />
      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2, display: "grid", gap: 1.5 }}>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
          <TextField select size="small" label="Sem vir há mais de" value={days} onChange={(e) => setDays(Number(e.target.value))} sx={{ minWidth: 180 }}>
            {[60, 90, 120, 180, 365].map((d) => <MenuItem key={d} value={d}>{`${d} dias`}</MenuItem>)}
          </TextField>
          <Chip color="primary" label={data ? `${shown.length} paciente(s) • ${withPhone} com WhatsApp` : "Carregando..."} />
          <Button size="small" onClick={() => setHideSent(!hideSent)}>{hideSent ? "Mostrar quem já recebeu" : "Esconder quem já recebeu"}</Button>
          <Button size="small" variant="outlined" disabled={!shown.length} onClick={exportCsv}>Baixar planilha</Button>
        </Box>
        <TextField multiline minRows={5} label="Mensagem (você pode editar)" value={text} onChange={(e) => setText(e.target.value)} helperText="{nome} vira o primeiro nome, {link} vira o link da agenda online e {clinica} o nome da clínica." />
        <Button size="small" sx={{ justifySelf: "start" }} onClick={() => setText(DEFAULT_TEXT)}>Voltar ao texto padrão</Button>
        <Alert severity="info">Cada mensagem abre no seu WhatsApp, já escrita, e você toca em enviar. Assim o paciente reconhece a clínica e o número não corre risco de bloqueio.</Alert>
      </Paper>

      <Box sx={{ display: "grid", gap: 1 }}>
        {data && shown.length === 0 && <Typography color="text.secondary">Nenhum paciente nessa condição.</Typography>}
        {shown.map((p) => {
          const num = waNumber(p.phone); const done = sent.includes(p.patientId);
          return (
            <Paper key={p.patientId} variant="outlined" sx={{ p: 1.5, borderRadius: 3, display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", opacity: done ? 0.65 : 1 }}>
              <Box sx={{ minWidth: 200 }}>
                <Typography sx={{ fontWeight: 800 }}>{p.name}</Typography>
                <Typography variant="body2" color="text.secondary">{`${p.phone || "sem telefone"} • última consulta ${DATE(p.lastVisit)} • ${p.daysAway} dias`}</Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                {done && <Chip size="small" color="success" label="Enviado" />}
                <Button size="small" variant="contained" disabled={!num} onClick={() => { window.open(`https://wa.me/${num}?text=${encodeURIComponent(message(p.name))}`, "_blank", "noopener"); markSent(p.patientId); }}>{num ? "Enviar no WhatsApp" : "Sem WhatsApp"}</Button>
              </Box>
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
}
