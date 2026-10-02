import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, FormControlLabel, MenuItem, Paper, Switch, TextField, Typography } from "@mui/material";
import GavelIcon from "@mui/icons-material/Gavel";
import { DunningApi, STAGE_LABEL, type DunningState } from "../services/DunningApi";

const STATUS: Record<string, string> = { SENT: "Enviado", PENDING: "Aguardando envio", FAILED: "Falhou", CANCELLED: "Cancelado" };
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function DunningSettingsCard() {
  const [data, setData] = useState<DunningState | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { setData(await DunningApi.load()); } catch { setHidden(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (hidden || !data) return null;

  const save = async (input: Parameters<typeof DunningApi.save>[0]) => {
    setError("");
    try { await DunningApi.save(input); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); }
  };
  const failed = data.recent.filter((n) => n.status === "FAILED" || (n.status === "PENDING" && n.errorMessage));

  return (
    <Paper elevation={0} sx={{ p: 3, borderRadius: 4, border: "1px solid", borderColor: "divider", mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
        <GavelIcon color="warning" />
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>Régua de cobrança do paciente</Typography>
          <Typography variant="body2" color="text.secondary">
            Avisos automáticos ao paciente com pagamento em atraso: todo dia do 1º ao 15º dia, depois no 20º e no 30º dia e, a partir do 31º dia, o aviso de que a cobrança foi encaminhada ao departamento jurídico. Para de enviar assim que o pagamento é baixado.
          </Typography>
        </Box>
      </Box>
      {!data.ready && <Alert severity="warning" sx={{ mb: 2 }}>A tabela da régua ainda não foi criada no banco. Rode o SQL da régua de cobrança (20261004) no Supabase antes de ligar.</Alert>}
      <FormControlLabel control={<Switch checked={data.enabled} disabled={!data.ready} onChange={(_, v) => void save({ enabled: v })} />} label={data.enabled ? "Régua ligada" : "Régua desligada (nenhuma mensagem é enviada)"} />
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", mt: 1 }}>
        <TextField select size="small" label="Canal de envio" value={data.channel} onChange={(e) => void save({ channel: e.target.value })} sx={{ minWidth: 180 }}>
          {data.channels.map((c) => <MenuItem key={c} value={c}>{c === "WHATSAPP" ? "WhatsApp" : c === "SMS" ? "SMS" : "E-mail"}</MenuItem>)}
        </TextField>
        <FormControlLabel control={<Switch checked={data.includeOlder} onChange={(_, v) => void save({ includeOlder: v })} />} label="Incluir também dívidas que já estavam vencidas antes de ligar" />
      </Box>
      {data.enabled && !data.includeOlder && data.since && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Só entram cobranças com vencimento a partir de {data.since.split("-").reverse().join("/")}. Dívidas anteriores não recebem aviso.</Typography>
      )}
      <Alert severity="info" sx={{ mt: 2 }}>
        O envio usa o remetente padrão do canal escolhido (Revah). Por e-mail não precisa configurar nada: sem remetente próprio, sai pela conta da DentalPos One. Nos outros canais, sem remetente real os avisos ficam aguardando e tentam de novo por 24 horas. Mensagens saem a partir das 9h (Brasília).
      </Alert>

      <Typography sx={{ fontWeight: 800, mt: 2 }}>Como a mensagem aparece</Typography>
      <Box sx={{ display: "grid", gap: 1, mt: 0.5 }}>
        <Typography variant="body2" sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 2 }}>{data.example}</Typography>
        <Typography variant="body2" sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 2 }}>{data.exampleLegal}</Typography>
      </Box>

      <Typography sx={{ fontWeight: 800, mt: 2 }}>Avisos que sairiam hoje ({data.preview.length})</Typography>
      {data.preview.length === 0 ? (
        <Typography variant="body2" color="text.secondary">Nenhum aviso previsto para hoje.</Typography>
      ) : (
        <Box sx={{ mt: 0.5 }}>
          {data.preview.slice(0, 15).map((p, i) => (
            <Box key={i} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", py: 0.5 }}>
              <Typography variant="body2" sx={{ minWidth: 180, fontWeight: 700 }}>{p.patientName}</Typography>
              <Chip size="small" label={STAGE_LABEL(p.stage)} color={p.stage === "LEGAL" ? "error" : "default"} />
              <Typography variant="body2">{brl(p.amount)}</Typography>
              {!p.hasContact && <Chip size="small" color="warning" label="sem contato cadastrado" />}
            </Box>
          ))}
          {data.preview.length > 15 && <Typography variant="body2" color="text.secondary">e mais {data.preview.length - 15}…</Typography>}
        </Box>
      )}

      {failed.length > 0 && <Alert severity="warning" sx={{ mt: 2 }}>{failed.length} aviso(s) recente(s) não foram enviados: {[...new Set(failed.map((f) => f.errorMessage).filter(Boolean))].slice(0, 3).join(" • ")}</Alert>}
      {data.recent.length > 0 && (
        <>
          <Typography sx={{ fontWeight: 800, mt: 2 }}>Últimos avisos</Typography>
          {data.recent.slice(0, 8).map((n) => (
            <Typography key={n.id} variant="body2" color="text.secondary">
              {new Date(n.createdAt).toLocaleDateString("pt-BR")} • {STAGE_LABEL(n.stage)} • {STATUS[n.status] || n.status}
            </Typography>
          ))}
        </>
      )}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      <Button sx={{ mt: 2 }} onClick={() => void load()}>Atualizar</Button>
    </Paper>
  );
}
