import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import {
  DEFAULT_SMART_SCHEDULING_CONFIG,
  loadSmartSchedulingConfig,
  resetSmartSchedulingConfig,
  saveSmartSchedulingConfig,
  type LaboratoryTimingRule,
  type ProcedureTimingRule,
  type SmartSchedulingConfig,
} from "../services/SmartSchedulingService";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: (config: SmartSchedulingConfig) => void;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function parseKeywords(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function procedureRule(): ProcedureTimingRule {
  return {
    id: `proc-${Date.now()}`,
    label: "Nova regra clínica",
    keywords: ["procedimento"],
    durationMinutes: 30,
    returnDays: 14,
    maxReturnDays: 30,
    sameWeekday: true,
    active: true,
  };
}

function laboratoryRule(): LaboratoryTimingRule {
  return {
    id: `lab-${Date.now()}`,
    laboratoryName: "Novo laboratório",
    serviceKeywords: ["prótese"],
    turnaroundDays: 15,
    safetyDays: 6,
    active: true,
  };
}

export default function SmartSchedulingSettingsDialog({ open, onClose, onSaved }: Props) {
  const [config, setConfig] = useState<SmartSchedulingConfig>(clone(DEFAULT_SMART_SCHEDULING_CONFIG));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setMessage(null);
    void loadSmartSchedulingConfig()
      .then((value) => setConfig(clone(value)))
      .finally(() => setLoading(false));
  }, [open]);

  const updateProcedure = (id: string, patch: Partial<ProcedureTimingRule>) => {
    setConfig((current) => ({
      ...current,
      procedureRules: current.procedureRules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    }));
  };

  const updateLaboratory = (id: string, patch: Partial<LaboratoryTimingRule>) => {
    setConfig((current) => ({
      ...current,
      laboratoryRules: current.laboratoryRules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    }));
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const saved = await saveSmartSchedulingConfig(config);
    setConfig(clone(saved));
    setSaving(false);
    setMessage("Configuração salva para a Agenda Inteligente.");
    onSaved?.(saved);
  };

  const restoreDefaults = () => {
    const restored = resetSmartSchedulingConfig();
    setConfig(clone(restored));
    setMessage("Regras padrão restauradas localmente. Clique em Salvar para sincronizar com a clínica.");
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>Configurar Agenda Inteligente</DialogTitle>
      <DialogContent sx={{ pt: "12px!important" }}>
        {loading ? <Alert severity="info">Carregando configuração...</Alert> : null}
        {message ? <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert> : null}

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 900, mb: 1 }}>Regras gerais</Typography>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
            <FormControlLabel
              control={<Switch checked={config.enabled} onChange={(event) => setConfig({ ...config, enabled: event.target.checked })} />}
              label="Agenda Inteligente ativa"
            />
            <FormControlLabel
              control={<Switch checked={config.sameWeekdayDefault} onChange={(event) => setConfig({ ...config, sameWeekdayDefault: event.target.checked })} />}
              label="Manter o dia da semana do paciente"
            />
            <FormControlLabel
              control={<Switch checked={config.financialAlignmentEnabled} onChange={(event) => setConfig({ ...config, financialAlignmentEnabled: event.target.checked })} />}
              label="Sugerir conciliação com o plano financeiro"
            />
            <TextField
              size="small"
              type="number"
              label="Duração padrão (min)"
              value={config.defaultDurationMinutes}
              onChange={(event) => setConfig({ ...config, defaultDurationMinutes: Math.max(10, Number(event.target.value || 30)) })}
              sx={{ width: 180 }}
            />
            <TextField
              size="small"
              type="number"
              label="Retorno padrão (dias)"
              value={config.defaultReturnDays}
              onChange={(event) => setConfig({ ...config, defaultReturnDays: Math.max(1, Number(event.target.value || 14)) })}
              sx={{ width: 190 }}
            />
            <TextField
              size="small"
              type="number"
              label="Janela máxima padrão"
              value={config.defaultMaxReturnDays}
              onChange={(event) => setConfig({ ...config, defaultMaxReturnDays: Math.max(config.defaultReturnDays, Number(event.target.value || 30)) })}
              sx={{ width: 210 }}
            />
          </Box>
          <Alert severity="info" sx={{ mt: 2 }}>
            O critério clínico e o prazo do laboratório têm prioridade. O financeiro é apenas uma sugestão administrativa dentro da janela clínica e nunca bloqueia atendimento.
          </Alert>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap", mb: 1 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>Tempo por procedimento e retorno</Typography>
              <Typography variant="body2" color="text.secondary">Edite conforme a rotina dos profissionais da clínica.</Typography>
            </Box>
            <Button startIcon={<AddIcon />} onClick={() => setConfig({ ...config, procedureRules: [...config.procedureRules, procedureRule()] })}>
              Nova regra
            </Button>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <Box sx={{ display: "grid", gap: 1.5 }}>
            {config.procedureRules.map((rule) => (
              <Box
                key={rule.id}
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "minmax(180px,1.2fr) minmax(220px,2fr) 110px 110px 110px auto auto" },
                  gap: 1,
                  alignItems: "center",
                  p: 1.5,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 2,
                }}
              >
                <TextField size="small" label="Regra" value={rule.label} onChange={(event) => updateProcedure(rule.id, { label: event.target.value })} />
                <TextField size="small" label="Palavras-chave" value={rule.keywords.join(", ")} onChange={(event) => updateProcedure(rule.id, { keywords: parseKeywords(event.target.value) })} />
                <TextField size="small" type="number" label="Minutos" value={rule.durationMinutes} onChange={(event) => updateProcedure(rule.id, { durationMinutes: Math.max(10, Number(event.target.value || 30)) })} />
                <TextField size="small" type="number" label="Retorno" value={rule.returnDays} onChange={(event) => updateProcedure(rule.id, { returnDays: Math.max(1, Number(event.target.value || 1)) })} />
                <TextField size="small" type="number" label="Máximo" value={rule.maxReturnDays} onChange={(event) => updateProcedure(rule.id, { maxReturnDays: Math.max(rule.returnDays, Number(event.target.value || rule.returnDays)) })} />
                <FormControlLabel
                  control={<Switch size="small" checked={rule.sameWeekday} onChange={(event) => updateProcedure(rule.id, { sameWeekday: event.target.checked })} />}
                  label="Mesmo dia"
                />
                <IconButton aria-label="Excluir regra" onClick={() => setConfig({ ...config, procedureRules: config.procedureRules.filter((item) => item.id !== rule.id) })}>
                  <DeleteOutlineIcon />
                </IconButton>
              </Box>
            ))}
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap", mb: 1 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>Prazos de laboratório</Typography>
              <Typography variant="body2" color="text.secondary">Exemplo: 15 dias de produção + 6 dias de margem = retorno a partir de 21 dias.</Typography>
            </Box>
            <Button startIcon={<AddIcon />} onClick={() => setConfig({ ...config, laboratoryRules: [...config.laboratoryRules, laboratoryRule()] })}>
              Novo laboratório
            </Button>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <Box sx={{ display: "grid", gap: 1.5 }}>
            {config.laboratoryRules.map((rule) => (
              <Box
                key={rule.id}
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "minmax(180px,1.2fr) minmax(220px,2fr) 130px 130px auto" },
                  gap: 1,
                  alignItems: "center",
                  p: 1.5,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 2,
                }}
              >
                <TextField size="small" label="Laboratório" value={rule.laboratoryName} onChange={(event) => updateLaboratory(rule.id, { laboratoryName: event.target.value })} />
                <TextField size="small" label="Serviços / palavras-chave" value={rule.serviceKeywords.join(", ")} onChange={(event) => updateLaboratory(rule.id, { serviceKeywords: parseKeywords(event.target.value) })} />
                <TextField size="small" type="number" label="Produção (dias)" value={rule.turnaroundDays} onChange={(event) => updateLaboratory(rule.id, { turnaroundDays: Math.max(0, Number(event.target.value || 0)) })} />
                <TextField size="small" type="number" label="Margem (dias)" value={rule.safetyDays} onChange={(event) => updateLaboratory(rule.id, { safetyDays: Math.max(0, Number(event.target.value || 0)) })} />
                <IconButton aria-label="Excluir laboratório" onClick={() => setConfig({ ...config, laboratoryRules: config.laboratoryRules.filter((item) => item.id !== rule.id) })}>
                  <DeleteOutlineIcon />
                </IconButton>
              </Box>
            ))}
          </Box>
        </Paper>
      </DialogContent>
      <DialogActions sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
        <Button startIcon={<RestartAltIcon />} onClick={restoreDefaults}>Restaurar padrões</Button>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button onClick={onClose}>Fechar</Button>
          <Button variant="contained" disabled={saving} onClick={save}>{saving ? "Salvando..." : "Salvar configuração"}</Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
