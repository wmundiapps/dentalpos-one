import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Typography,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CloudDoneIcon from "@mui/icons-material/CloudDone";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import ScheduleIcon from "@mui/icons-material/Schedule";
import {
  calculateSmartScheduleSuggestion,
  loadSmartSchedulingConfig,
  type SmartScheduleSuggestion,
  type SmartSchedulingConfig,
} from "../services/SmartSchedulingService";
import {
  acceptSmartScheduleDecision,
  requestSmartScheduleSuggestion,
} from "../services/SmartSchedulingApi";

interface Props {
  patientId?: string;
  patientName: string;
  procedure: string;
  category?: string;
  currentAppointmentDateISO: string;
  selectedDurationMinutes?: number;
  laboratoryName?: string;
  compact?: boolean;
  onApplyDuration?: (minutes: number) => void;
  onApplyReturnDate?: (dateISO: string) => void;
  onSuggestion?: (suggestion: SmartScheduleSuggestion | null) => void;
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

export default function SmartSchedulingAssistant({
  patientId,
  patientName,
  procedure,
  category,
  currentAppointmentDateISO,
  selectedDurationMinutes,
  laboratoryName,
  compact = false,
  onApplyDuration,
  onApplyReturnDate,
  onSuggestion,
}: Props) {
  const [config, setConfig] = useState<SmartSchedulingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<SmartScheduleSuggestion | null>(
    null,
  );
  const [decisionId, setDecisionId] = useState<string | null>(null);
  const [source, setSource] = useState<"backend" | "local" | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void loadSmartSchedulingConfig()
      .then((value) => {
        if (alive) setConfig(value);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    const refresh = () =>
      void loadSmartSchedulingConfig().then(
        (value) => alive && setConfig(value),
      );

    window.addEventListener("dentalpos:smart-scheduling-changed", refresh);

    return () => {
      alive = false;
      window.removeEventListener("dentalpos:smart-scheduling-changed", refresh);
    };
  }, []);

  useEffect(() => {
    let alive = true;

    if (
      !config ||
      !config.enabled ||
      !patientName.trim() ||
      !procedure.trim() ||
      !currentAppointmentDateISO
    ) {
      setSuggestion(null);
      setDecisionId(null);
      setSource(null);
      return () => {
        alive = false;
      };
    }

    const input = {
      patientId,
      patientName,
      procedure,
      category,
      currentAppointmentDateISO,
      selectedDurationMinutes,
      laboratoryName,
    };

    const localSuggestion = calculateSmartScheduleSuggestion(input, config);

    if (!patientId) {
      setSuggestion(localSuggestion);
      setDecisionId(null);
      setSource("local");
      return () => {
        alive = false;
      };
    }

    setSuggesting(true);

    const timer = window.setTimeout(() => {
      void requestSmartScheduleSuggestion(input)
        .then((remote) => {
          if (!alive) return;
          if (remote) {
            setSuggestion(remote.suggestion);
            setDecisionId(remote.decisionId);
            setSource("backend");
          } else {
            setSuggestion(localSuggestion);
            setDecisionId(null);
            setSource("local");
          }
        })
        .catch(() => {
          if (!alive) return;
          setSuggestion(localSuggestion);
          setDecisionId(null);
          setSource("local");
        })
        .finally(() => {
          if (alive) setSuggesting(false);
        });
    }, 250);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [
    category,
    config,
    currentAppointmentDateISO,
    laboratoryName,
    patientId,
    patientName,
    procedure,
    selectedDurationMinutes,
  ]);

  useEffect(() => {
    onSuggestion?.(suggestion);
  }, [onSuggestion, suggestion]);

  const applyReturnDate = async (dateISO: string) => {
    if (decisionId) {
      try {
        await acceptSmartScheduleDecision(decisionId, dateISO);
      } catch {
        // O agendamento continua disponível; a API poderá ser reconciliada depois.
      }
    }
    onApplyReturnDate?.(dateISO);
  };

  if (loading) {
    return (
      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <CircularProgress size={18} />
          <Typography variant="body2">
            Calculando Agenda Inteligente...
          </Typography>
        </Box>
      </Paper>
    );
  }

  if (!config?.enabled) {
    return (
      <Alert severity="info">
        A Agenda Inteligente está desativada nas configurações da clínica.
      </Alert>
    );
  }

  if (!suggestion) {
    return (
      <Alert severity="info">
        Informe paciente, procedimento e data para receber a sugestão
        inteligente.
      </Alert>
    );
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        p: compact ? 1.5 : 2,
        borderRadius: 3,
        borderColor: suggestion.warnings.some(
          (item) =>
            item.severity === "error" || item.severity === "warning",
        )
          ? "warning.main"
          : "divider",
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
          mb: 1,
        }}
      >
        <AutoAwesomeIcon color="primary" />
        <Typography sx={{ fontWeight: 900 }}>
          Sugestão da Agenda Inteligente
        </Typography>

        {suggesting ? (
          <Chip
            size="small"
            icon={<CircularProgress size={14} />}
            label="Sincronizando..."
          />
        ) : null}

        {source === "backend" ? (
          <Chip
            size="small"
            color="success"
            icon={<CloudDoneIcon />}
            label="Backend / PostgreSQL"
          />
        ) : source === "local" ? (
          <Chip size="small" variant="outlined" label="Modo local seguro" />
        ) : null}

        {suggestion.procedureRuleLabel ? (
          <Chip size="small" label={suggestion.procedureRuleLabel} />
        ) : null}

        {suggestion.laboratoryRuleLabel ? (
          <Chip
            size="small"
            color="info"
            label={suggestion.laboratoryRuleLabel}
          />
        ) : null}
      </Box>

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
        <Chip
          icon={<ScheduleIcon />}
          color="primary"
          label={`${suggestion.recommendedDurationMinutes} min sugeridos`}
        />
        <Chip
          icon={<EventRepeatIcon />}
          color="success"
          label={`Próximo retorno: ${formatDate(
            suggestion.recommendedReturnDateISO,
          )}`}
        />
        <Chip
          variant="outlined"
          label={`Janela: ${formatDate(
            suggestion.returnWindowStartISO,
          )} a ${formatDate(suggestion.returnWindowEndISO)}`}
        />
        <Chip
          variant="outlined"
          label={`Preferência: ${suggestion.preferredWeekdayLabel}`}
        />
        {suggestion.financialCadenceLabel ? (
          <Chip
            variant="outlined"
            color="secondary"
            label={`Cadência financeira: ${suggestion.financialCadenceLabel}`}
          />
        ) : null}
      </Box>

      {suggestion.financialAlternativeDateISO &&
      suggestion.financialAlternativeDateISO !==
        suggestion.recommendedReturnDateISO ? (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          Alternativa dentro da janela clínica para conciliar com o plano
          financeiro:{" "}
          <b>{formatDate(suggestion.financialAlternativeDateISO)}</b>. O
          critério clínico e o laboratório continuam tendo prioridade.
        </Alert>
      ) : null}

      {suggestion.warnings.map((warning) => (
        <Alert
          key={`${warning.code}-${warning.message}`}
          severity={warning.severity}
          sx={{ mb: 1 }}
        >
          {warning.message}
        </Alert>
      ))}

      {!compact ? (
        <Box sx={{ display: "grid", gap: 0.5, mb: 1.5 }}>
          {suggestion.reasons.map((reason) => (
            <Typography
              key={reason}
              variant="body2"
              color="text.secondary"
            >
              • {reason}
            </Typography>
          ))}
        </Box>
      ) : null}

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        {onApplyDuration ? (
          <Button
            size="small"
            variant="outlined"
            onClick={() =>
              onApplyDuration(suggestion.recommendedDurationMinutes)
            }
          >
            Usar {suggestion.recommendedDurationMinutes} min
          </Button>
        ) : null}

        {onApplyReturnDate ? (
          <Button
            size="small"
            variant="contained"
            onClick={() =>
              void applyReturnDate(suggestion.recommendedReturnDateISO)
            }
          >
            Usar retorno sugerido
          </Button>
        ) : null}

        {onApplyReturnDate &&
        suggestion.financialAlternativeDateISO &&
        suggestion.financialAlternativeDateISO !==
          suggestion.recommendedReturnDateISO ? (
          <Button
            size="small"
            onClick={() =>
              void applyReturnDate(suggestion.financialAlternativeDateISO!)
            }
          >
            Usar alternativa financeira
          </Button>
        ) : null}
      </Box>
    </Paper>
  );
}
