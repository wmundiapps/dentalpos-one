import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, Paper, Switch, Typography } from "@mui/material";
import GavelIcon from "@mui/icons-material/Gavel";
import { errorMessage, toast } from "../utils/toast";
import { CHANNEL_LABEL, DunningApi, STAGE_LABEL, type DunningState } from "../services/DunningApi";

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
    try {
      await DunningApi.save(input);
      await load();
      toast.success(input.enabled === true ? "Régua de cobrança ligada." : input.enabled === false ? "Régua de cobrança desligada." : "Configuração da régua salva.");
    } catch (e) {
      const message = errorMessage(e, "Não foi possível salvar.");
      setError(message);
      toast.error(message);
    }
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
        <Box sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 800 }}>Canais de envio (marque um ou mais)</Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 2, alignItems: "center" }}>
            {data.channelOptions.map((c) => (
              <FormControlLabel
                key={c}
                control={<Checkbox size="small" checked={data.channels.includes(c)} onChange={() => {
                  const next = data.channels.includes(c) ? data.channels.filter((x) => x !== c) : [...data.channels, c];
                  if (next.length) void save({ channels: next });
                }} />}
                label={CHANNEL_LABEL[c] || c}
              />
            ))}
            <Button size="small" onClick={() => void save({ channels: data.channelOptions })}>Marcar todos</Button>
          </Box>
          {data.channels.length > 1 && !data.multiReady && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              Vários canais ao mesmo tempo precisam de uma atualização no banco (SQL 20261005). Enquanto ela não for feita, só o primeiro canal ({CHANNEL_LABEL[data.activeChannels[0]] || data.activeChannels[0]}) envia.
            </Alert>
          )}
        </Box>
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
              {p.channels.map((c) => <Chip key={c} size="small" variant="outlined" color={p.missingContact.includes(c) ? "warning" : "default"} label={`${CHANNEL_LABEL[c] || c}${p.missingContact.includes(c) ? ": sem contato" : ""}`} />)}
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
