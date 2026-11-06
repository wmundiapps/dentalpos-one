import { Autocomplete, TextField } from "@mui/material";
import { cbhpoProcedures, procedureLabel, type DentalProcedure } from "../data/cbhpoProcedures";

export default function ProcedurePicker({
  label = "Procedimento",
  value,
  onChange,
  required = false,
  placeholder = "Digite para pesquisar na CBHPO",
}: {
  label?: string;
  value: string;
  onChange: (name: string, procedure?: DentalProcedure) => void;
  required?: boolean;
  placeholder?: string;
}) {
  const selected = cbhpoProcedures.find((procedure) => procedure.name === value) || null;

  return (
    <Autocomplete
      freeSolo
      options={cbhpoProcedures}
      value={selected}
      inputValue={value}
      getOptionLabel={(option) =>
        typeof option === "string" ? option : procedureLabel(option)
      }
      groupBy={(option) =>
        typeof option === "string" ? "Outros" : option.category
      }
      isOptionEqualToValue={(option, currentValue) =>
        typeof currentValue !== "string" && option.name === currentValue.name
      }
      onInputChange={(_, nextValue, reason) => {
        if (reason === "input" || reason === "clear") {
          onChange(nextValue);
        }
      }}
      onChange={(_, nextValue) => {
        if (typeof nextValue === "string") {
          onChange(nextValue);
        } else if (nextValue) {
          onChange(nextValue.name, nextValue);
        } else {
          onChange("");
        }
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          required={required}
          label={label}
          placeholder={placeholder}
        />
      )}
    />
  );
}
