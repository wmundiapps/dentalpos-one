import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, TextField, Typography } from "@mui/material";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import SmsIcon from "@mui/icons-material/Sms";
import EmailIcon from "@mui/icons-material/Email";
import TelegramIcon from "@mui/icons-material/Telegram";
import PhoneInTalkIcon from "@mui/icons-material/PhoneInTalk";
import SendIcon from "@mui/icons-material/Send";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import type { ReactNode } from "react";
import PageHeader from "../components/PageHeader";
import { listSenders, saveSender, sendTest, type RevahSender } from "../services/RevahSenderApi";

type Field = { key: string; label: string; help?: string; secret?: boolean; optional?: boolean };
type ChannelDef = { key: string; name: string; icon: ReactNode; addressLabel: string; addressHelp: string; fields: Field[]; note: string };

const CHANNELS: ChannelDef[] = [
  {
    key: "WHATSAPP", name: "WhatsApp", icon: <WhatsAppIcon />,
    addressLabel: "Número do WhatsApp da clínica", addressHelp: "Com DDD, ex.: 44999998888",
    fields: [
      { key: "phoneNumberId", label: "ID do n\u00famero (Phone Number ID)", secret: true },
      { key: "accessToken", label: "Token de acesso permanente", secret: true },
      { key: "wabaId", label: "ID da conta WhatsApp Business (WABA ID)", secret: true, optional: true },
      { key: "templateName", label: "Nome do modelo aprovado para lembretes", optional: true },
    ],
    note: "N\u00famero pr\u00f3prio da cl\u00ednica, registrado na Meta (WhatsApp Business Platform). Esse n\u00famero n\u00e3o pode estar em uso no WhatsApp comum nem no WhatsApp Business. A Meta cobra as mensagens direto no cart\u00e3o da cl\u00ednica.",
  },
  {
    key: "SMS", name: "SMS", icon: <SmsIcon />,
    addressLabel: "Nome do remetente", addressHelp: "Como aparece para o paciente",
    fields: [{ key: "apiKey", label: "Chave de acesso", secret: true }],
    note: "Mensagem de texto simples, útil quando o paciente não tem WhatsApp.",
  },
  {
    key: "EMAIL", name: "E-mail", icon: <EmailIcon />,
    addressLabel: "E-mail remetente", addressHelp: "Ex.: clinica@exemplo.invalid",
    fields: [{ key: "apiKey", label: "Chave de acesso", secret: true }],
    note: "O domínio do e-mail precisa estar verificado no serviço de envio.",
  },
  {
    key: "TELEGRAM", name: "Telegram", icon: <TelegramIcon />,
    addressLabel: "Nome do bot", addressHelp: "Ex.: @clinicabot",
    fields: [{ key: "botToken", label: "Chave do bot", secret: true }],
    note: "Só funciona para pacientes que iniciaram conversa com o bot.",
  },
  {
    key: "VOICE", name: "Ligação", icon: <PhoneInTalkIcon />,
    addressLabel: "Número de origem", addressHelp: "Número que aparece para o paciente",
    fields: [
      { key: "accountSid", label: "Identificador da conta", secret: true },
      { key: "authToken", label: "Chave de acesso", secret: true },
    ],
    note: "Ligação automática com mensagem falada. Use com moderação.",
  },
];

// Custo por canal. SMS e voz: creditos vendidos pela DentalPos One (a clinica nao usa chave propria).
// Pergunta pronta por canal. O botao "Como configurar" abre o assistente ja com ela.
const AJUDA: Record<string, string> = {
  WHATSAPP: "Explique em passo a passo simples, para um dentista sem conhecimento tecnico, como registrar o numero da clinica na WhatsApp Business Platform da Meta e obter o ID do numero e o token de acesso permanente. Avise que o numero nao pode estar em uso no WhatsApp comum nem no WhatsApp Business, e que a Meta cobra por mensagem no cartao da clinica.",
  EMAIL: "Explique de forma simples como obter a chave de acesso do servico de e-mail e por que o dominio do e-mail precisa estar verificado para as mensagens nao cairem em spam.",
  TELEGRAM: "Explique em passo a passo simples como criar um bot no Telegram pelo BotFather e obter a chave do bot. Avise que so funciona para pacientes que iniciaram conversa com o bot.",
  SMS: "Explique como funciona o envio de SMS pela clinica e por que ele exige pacote de creditos comprado na DentalPos One.",
  VOICE: "Explique como funciona a ligacao automatica com mensagem falada para o paciente e por que ela exige pacote de creditos comprado na DentalPos One.",
};

const COSTS: Record<string, { sev: "success" | "info" | "warning"; text: string }> = {
  EMAIL: { sev: "success", text: "Gratuito, inclusive na demonstra\u00e7\u00e3o." },
  TELEGRAM: { sev: "success", text: "Gratuito. O Telegram n\u00e3o cobra por mensagem." },
  WHATSAPP: { sev: "info", text: "Cobrado pela Meta por mensagem, direto no cart\u00e3o da cl\u00ednica. N\u00e3o incluso na demonstra\u00e7\u00e3o." },
  SMS: { sev: "warning", text: "Funciona com pacote de cr\u00e9ditos comprado na DentalPos One. Cr\u00e9ditos n\u00e3o inclusos na demonstra\u00e7\u00e3o." },
  VOICE: { sev: "warning", text: "Funciona com pacote de cr\u00e9ditos comprado na DentalPos One. Cr\u00e9ditos n\u00e3o inclusos na demonstra\u00e7\u00e3o." },
};

export default function Channels() {
  const [rows, setRows] = useState<RevahSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<ChannelDef | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [test, setTest] = useState<ChannelDef | null>(null);
  const [testTo, setTestTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await listSenders()); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar os canais."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const rowFor = (key: string) => rows.find((r) => String(r.channel).toUpperCase() === key);

  const openEdit = (def: ChannelDef) => {
    const row = rowFor(def.key);
    setForm({ label: row?.label || `${def.name} da clínica`, address: row?.address || "" });
    setEdit(def);
    setNotice("");
    setError("");
  };

  const save = async () => {
    if (!edit) return;
    setBusy(true); setError("");
    try {
      const credentials: Record<string, string> = {};
      edit.fields.forEach((f) => { const v = (form[f.key] || "").trim(); if (v) credentials[f.key] = v; });
      const faltando = edit.fields.filter((f) => !f.optional && !credentials[f.key]);
      const row = rowFor(edit.key);
      if (faltando.length && !row) { setError(`Preencha: ${faltando.map((f) => f.label).join(", ")}`); setBusy(false); return; }
      await saveSender({
        channel: edit.key,
        label: form.label?.trim() || `${edit.name} da clínica`,
        address: form.address?.trim(),
        isDefault: true,
        isActive: true,
        ...(Object.keys(credentials).length ? { credentials } : {}),
      });
      setEdit(null);
      setNotice(`${edit.name} configurado. Envie um teste para confirmar.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar o canal.");
    } finally { setBusy(false); }
  };

  const runTest = async () => {
    if (!test) return;
    setBusy(true); setError("");
    try {
      await sendTest({ channel: test.key, destination: testTo.trim(), contactName: "Teste", content: "Mensagem de teste do DentalPos One. Se você recebeu, o canal está funcionando." });
      setTest(null);
      setNotice("Teste enviado. Confira o aparelho de destino.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar o teste.");
    } finally { setBusy(false); }
  };

  return (
    <Box>
      <PageHeader title="Canais de Envio" description={"Configure os canais pelos quais a clínica envia confirmações, lembretes e campanhas aos pacientes."} />
      <Alert severity="info" sx={{ mb: 2 }}>{"Cada clínica usa os próprios canais. As chaves ficam criptografadas no servidor e nunca voltam a aparecer nesta tela."}</Alert>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice("")}>{notice}</Alert>}
      {loading ? <Typography color="text.secondary">Carregando...</Typography> : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          {CHANNELS.map((def) => {
            const row = rowFor(def.key);
            const ativo = Boolean(row?.isActive && row?.address);
            return (
              <Paper key={def.key} variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, alignItems: "center" }}>
                  <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
                    <Box sx={{ color: "primary.main", display: "flex" }}>{def.icon}</Box>
                    <Box>
                      <Typography sx={{ fontWeight: 800 }}>{def.name}</Typography>
                      <Typography variant="body2" color="text.secondary">{row?.address || "Não configurado"}</Typography>
                    </Box>
                  </Box>
                  <Chip size="small" color={ativo ? "success" : "default"} label={ativo ? "Ativo" : "Pendente"} />
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>{def.note}</Typography>
                {COSTS[def.key] && <Alert severity={COSTS[def.key].sev} sx={{ mt: 1.5 }}>{COSTS[def.key].text}</Alert>}
                <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>
                  <Button size="small" variant="contained" disabled={def.key === "SMS" || def.key === "VOICE"} onClick={() => openEdit(def)}>{row ? "Atualizar" : "Configurar"}</Button>
                  {(def.key === "SMS" || def.key === "VOICE") && <Button size="small" variant="outlined" href={`/creditos?tipo=${def.key === "SMS" ? "SMS" : "VOZ"}`}>{"Comprar cr\u00e9ditos"}</Button>}
                  <Button size="small" startIcon={<AutoAwesomeIcon />} onClick={() => { window.location.href = `/assistente-ia?p=${encodeURIComponent(AJUDA[def.key] || "")}`; }}>Como configurar</Button>
                  <Button size="small" startIcon={<SendIcon />} disabled={!ativo} onClick={() => { setTest(def); setTestTo(""); setNotice(""); setError(""); }}>Enviar teste</Button>
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}

      <Dialog open={Boolean(edit)} onClose={() => { if (!busy) setEdit(null); }} fullWidth maxWidth="sm">
        <DialogTitle>{edit ? `Configurar ${edit.name}` : ""}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <TextField label="Apelido" value={form.label || ""} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <TextField required label={edit?.addressLabel || ""} helperText={edit?.addressHelp} value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          {edit?.fields.map((f) => (
            <TextField key={f.key} type="password" label={f.label + (f.optional ? " (opcional)" : "")} helperText={rowFor(edit.key) ? "Deixe em branco para manter a chave atual." : f.help} value={form[f.key] || ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
          ))}
          <Alert severity="warning">{"Peça essas chaves a quem cuida da tecnologia da clínica. Nunca compartilhe por mensagem ou e-mail."}</Alert>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setEdit(null)}>Cancelar</Button>
          <Button variant="contained" disabled={busy || !(form.address || "").trim()} onClick={() => void save()}>{busy ? "Salvando..." : "Salvar"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(test)} onClose={() => { if (!busy) setTest(null); }} fullWidth maxWidth="xs">
        <DialogTitle>{test ? `Testar ${test.name}` : ""}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <TextField required label={test?.key === "EMAIL" ? "E-mail de destino" : "Número de destino"} helperText={test?.key === "EMAIL" ? "Use um e-mail seu." : "Use o seu próprio número, com DDD."} value={testTo} onChange={(e) => setTestTo(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setTest(null)}>Cancelar</Button>
          <Button variant="contained" disabled={busy || testTo.trim().length < 5} onClick={() => void runTest()}>{busy ? "Enviando..." : "Enviar teste"}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}