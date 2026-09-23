import { Box, Checkbox, FormControlLabel, MenuItem, TextField } from "@mui/material";
import { useState } from "react";
import {
  DURATION_OPTIONS,
  formatDuration,
  saveCustomDuration,
  suggestDuration,
} from "../services/ProcedureDurations";

interface Props {
  value: number;
  onChange: (minutes: number) => void;
  procedure?: string;
  label?: string;
  size?: "small" | "medium";
  fullWidth?: boolean;
}

export default function DurationSelect({ value, onChange, procedure, label = "Tempo de atendimento", size, fullWidth = true }: Props) {
  const [remember, setRemember] = useState(false);
  const current = Number(value) || 30;
  const options = DURATION_OPTIONS.includes(current) ? DURATION_OPTIONS : [...DURATION_OPTIONS, current].sort((a, b) => a - b);
  const suggested = procedure ? suggestDuration(procedure) : undefined;
  const differsFromSuggestion = Boolean(procedure && procedure.trim() && suggested !== current);

  const handleChange = (minutes: number) => {
    onChange(minutes);
    if (remember && procedure) saveCustomDuration(procedure, minutes);
  };

  return (
    <Box>
      <TextField
        select
        fullWidth={fullWidth}
        size={size}
        label={label}
        value={current}
        onChange={(event) => handleChange(Number(event.target.value))}
        helperText={procedure && suggested ? `Sugerido para este procedimento: ${formatDuration(suggested)}` : undefined}
      >
        {options.map((minutes) => (
          <MenuItem key={minutes} value={minutes}>
            {formatDuration(minutes)}
          </MenuItem>
        ))}
      </TextField>
      {differsFromSuggestion ? (
        <FormControlLabel
          sx={{ mt: 0.5 }}
          control={
            <Checkbox
              size="small"
              checked={remember}
              onChange={(event) => {
                setRemember(event.target.checked);
                if (event.target.checked && procedure) saveCustomDuration(procedure, current);
              }}
            />
          }
          label={`Usar sempre ${formatDuration(current)} para "${procedure}"`}
          slotProps={{ typography: { variant: "caption" } }}
        />
      ) : null}
    </Box>
  );
}
