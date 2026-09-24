import { Alert, Autocomplete, Box, Button, Chip, TextField, Typography } from "@mui/material";
import PersonAddAlt1Icon from "@mui/icons-material/PersonAddAlt1";
import { useState } from "react";
import type { BackendPatient } from "../services/PatientApi";

export type PatientChoice =
  | { mode: "registered"; patient: BackendPatient }
  | { mode: "new"; fullName: string; phone: string }
  | null;

const NEW_OPTION = "__novo_paciente__";
type Option = BackendPatient | typeof NEW_OPTION;

export const onlyDigits = (value: string) => String(value || "").replace(/\D/g, "");

export function normalizeText(value: string) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function formatPhoneBR(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function isValidPhoneBR(value: string) {
  const d = onlyDigits(value);
  return d.length === 10 || d.length === 11;
}

export function matchesPatient(patient: BackendPatient, query: string) {
  const q = normalizeText(query);
  if (!q) return true;
  const qDigits = onlyDigits(query);
  if (normalizeText(patient.fullName).includes(q)) return true;
  if (qDigits.length >= 3) {
    if (onlyDigits(patient.phone).includes(qDigits)) return true;
    if (onlyDigits(patient.cpf || "").includes(qDigits)) return true;
  }
  return false;
}

interface Props {
  patients: BackendPatient[];
  value: PatientChoice;
  onChange: (value: PatientChoice) => void;
  autoFocus?: boolean;
}

export default function PatientSearchField({ patients, value, onChange, autoFocus }: Props) {
  const [input, setInput] = useState("");

  if (value?.mode === "new") {
    const phoneOk = isValidPhoneBR(value.phone);
    const duplicate = phoneOk ? patients.find((p) => onlyDigits(p.phone) === onlyDigits(value.phone)) : undefined;
    return (
      <Box sx={{ display: "grid", gap: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Chip color="success" icon={<PersonAddAlt1Icon />} label="Paciente novo — o cadastro é criado junto com o agendamento" />
          <Button size="small" onClick={() => onChange(null)}>Buscar paciente cadastrado</Button>
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.5 }}>
          <TextField
            required
            autoFocus
            label="Nome completo"
            value={value.fullName}
            onChange={(event) => onChange({ ...value, fullName: event.target.value })}
          />
          <TextField
            required
            label="Telefone / WhatsApp com DDD"
            placeholder="(44) 99999-9999"
            value={formatPhoneBR(value.phone)}
            onChange={(event) => onChange({ ...value, phone: onlyDigits(event.target.value) })}
            error={Boolean(value.phone) && !phoneOk}
            helperText={value.phone && !phoneOk ? "Informe DDD + número (10 ou 11 dígitos)." : "O restante do cadastro pode ser completado depois."}
          />
        </Box>
        {duplicate ? (
          <Alert
            severity="warning"
            action={<Button size="small" onClick={() => onChange({ mode: "registered", patient: duplicate })}>Usar este</Button>}
          >
            Este telefone já pertence a <b>{duplicate.fullName}</b>.
          </Alert>
        ) : null}
      </Box>
    );
  }

  const selected = value?.mode === "registered" ? value.patient : null;

  return (
    <Autocomplete<Option, false, false, false>
      options={[...patients, NEW_OPTION]}
      value={selected}
      inputValue={input}
      autoHighlight
      onInputChange={(_, text) => setInput(text)}
      isOptionEqualToValue={(option, current) => option !== NEW_OPTION && current !== NEW_OPTION && option.id === current.id}
      getOptionLabel={(option) => (option === NEW_OPTION ? input : option.fullName)}
      filterOptions={(options, state) => {
        const found = options.filter((option) => option !== NEW_OPTION && matchesPatient(option, state.inputValue)).slice(0, 30);
        return [...found, NEW_OPTION];
      }}
      onChange={(_, option) => {
        if (!option) return onChange(null);
        if (option === NEW_OPTION) {
          const digits = onlyDigits(input);
          const looksLikePhone = digits.length >= 8 && digits.length === input.replace(/[\s()+-]/g, "").length;
          onChange({ mode: "new", fullName: looksLikePhone ? "" : input.trim(), phone: looksLikePhone ? digits : "" });
          return;
        }
        onChange({ mode: "registered", patient: option });
      }}
      renderOption={(props, option) => {
        const { key, ...rest } = props as typeof props & { key: string };
        if (option === NEW_OPTION) {
          return (
            <li key="novo" {...rest}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "success.main", fontWeight: 700 }}>
                <PersonAddAlt1Icon fontSize="small" />
                {input.trim() ? `Paciente novo: "${input.trim()}"` : "Paciente novo (1º atendimento)"}
              </Box>
            </li>
          );
        }
        return (
          <li key={key} {...rest}>
            <Box>
              <Typography sx={{ fontWeight: 700 }}>{option.fullName}</Typography>
              <Typography variant="caption" color="text.secondary">
                {formatPhoneBR(option.phone) || option.phone}
                {option.cpf ? ` • CPF ${option.cpf}` : ""}
              </Typography>
            </Box>
          </li>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          autoFocus={autoFocus}
          label="Paciente"
          placeholder="Digite nome, CPF ou telefone"
          helperText={selected ? `${formatPhoneBR(selected.phone) || selected.phone}${selected.cpf ? ` • CPF ${selected.cpf}` : ""}` : "Não achou? Escolha “Paciente novo” no fim da lista."}
        />
      )}
    />
  );
}
