import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, TextField, Typography } from "@mui/material";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import SmsIcon from "@mui/icons-material/Sms";
import EmailIcon from "@mui/icons-material/Email";
import TelegramIcon from "@mui/icons-material/Telegram";
import PhoneInTalkIcon from "@mui/icons-material/PhoneInTalk";
import SendIcon from "@mui/icons-material/Send";
import type { ReactNode } from "react";
import PageHeader from "../components/PageHeader";
import { listSenders, saveSender, sendTest, type RevahSender } from "../services/RevahSenderApi";

type Field = { key: string; label: string; help?: string; secret?: boolean; optional?: boolean };
type ChannelDef = { key: string; name: string; icon: ReactNode; addressLabel: string; addressHelp: string; fields: Field[]; note: string };

const CHANNELS: ChannelDef[] = [
  {
    key: "WHATSAPP", name: "WhatsApp", icon: <WhatsAppIcon />,
    addressLabel: "N\u00famero do WhatsApp da cl\u00ednica", addressHelp: "Com DDD, ex.: 44999998888",
    fields: [
      { key: "instanceId", label: "Identificador da conex\u00e3o", secret: true },
      { key: "token", label: "Chave de acesso", secret: true },
      { key: "clientToken", label: "Chave adicional", secret: true, optional: true },
    ],
    note: "Use o n\u00famero da pr\u00f3pria cl\u00ednica. O paciente reconhece quem est\u00e1 falando e o n\u00famero n\u00e3o corre risco de bloqueio por envio em massa.",
  },
  {
    key: "SMS", name: "SMS", icon: <SmsIcon />,
    addressLabel: "Nome do remetente", addressHelp: "Como aparece para o paciente",
    fields: [{ key: "apiKey", label: "Chave de acesso", secret: true }],
    note: "Mensagem de texto simples, \u00fatil quando o paciente n\u00e3o tem WhatsApp.",
  },
  {
    key: "EMAIL", name: "E-mail", icon: <EmailIcon />,
    addressLabel: "E-mail remetente", addressHelp: "Ex.: contato@suaclinica.com.br",
    fields: [{ key: "apiKey", label: "Chave de acesso", secret: true }],
    note: "O dom\u00ednio do e-mail precisa estar verificado no servi\u00e7o de envio.",
  },
  {
    key: "TELEGRAM", name: "Telegram", icon: <TelegramIcon />,
    addressLabel: "Nome do bot", addressHelp: "Ex.: @clinicabot",
    fields: [{ key: "botToken", label: "Chave do bot", secret: true }],
    note: "S\u00f3 funciona para pacientes que iniciaram conversa com o bot.",
  },
  {
    key: "VOICE", name: "Liga\u00e7\u00e3o", icon: <PhoneInTalkIcon />,
    addressLabel: "N\u00famero de origem", addressHelp: "N\u00famero que aparece para o paciente",
    fields: [
      { key: "accountSid", label: "Identificador da conta", secret: true },
      { key: "authToken", label: "Chave de acesso", secret: true },
    ],
    note: "Liga\u00e7\u00e3o autom\u00e1tica com mensagem falada. Use com modera\u00e7\u00e3o.",
  },
];

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
    setForm({ label: row?.label || `${def.name} da cl\u00ednica`, address: row?.address || "" });
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
        label: form.label?.trim() || `${edit.name} da cl\u00ednica`,
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
      await sendTest({ channel: test.key, destination: testTo.trim(), contactName: "Teste", content: "Mensagem de teste do DentalPos One. Se voc\u00ea recebeu, o canal est\u00e1 funcionando." });
      setTest(null);
      setNotice("Teste enviado. Confira o aparelho de destino.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "N\u00e3o foi poss\u00edvel enviar o teste.");
    } finally { setBusy(false); }
  };

  return (
    <Box>
      <PageHeader title="Canais de Envio" description={"Configure os canais pelos quais a cl\u00ednica envia confirma\u00e7\u00f5es, lembretes e campanhas aos pacientes."} />
      <Alert severity="info" sx={{ mb: 2 }}>{"Cada cl\u00ednica usa os pr\u00f3prios canais. As chaves ficam criptografadas no servidor e nunca voltam a aparecer nesta tela."}</Alert>
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
                      <Typography variant="body2" color="text.secondary">{row?.address || "N\u00e3o configurado"}</Typography>
                    </Box>
                  </Box>
                  <Chip size="small" color={ativo ? "success" : "default"} label={ativo ? "Ativo" : "Pendente"} />
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>{def.note}</Typography>
                <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>
                  <Button size="small" variant="contained" onClick={() => openEdit(def)}>{row ? "Atualizar" : "Configurar"}</Button>
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
          <Alert severity="warning">{"Peça essas chaves a quem cuida da tecnologia da cl\u00ednica. Nunca compartilhe por mensagem ou e-mail."}</Alert>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setEdit(null)}>Cancelar</Button>
          <Button variant="contained" disabled={busy || !(form.address || "").trim()} onClick={() => void save()}>{busy ? "Salvando..." : "Salvar"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(test)} onClose={() => { if (!busy) setTest(null); }} fullWidth maxWidth="xs">
        <DialogTitle>{test ? `Testar ${test.name}` : ""}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <TextField required label={test?.key === "EMAIL" ? "E-mail de destino" : "N\u00famero de destino"} helperText={test?.key === "EMAIL" ? "Use um e-mail seu." : "Use o seu pr\u00f3prio n\u00famero, com DDD."} value={testTo} onChange={(e) => setTestTo(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setTest(null)}>Cancelar</Button>
          <Button variant="contained" disabled={busy || testTo.trim().length < 5} onClick={() => void runTest()}>{busy ? "Enviando..." : "Enviar teste"}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}