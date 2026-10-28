import { Autocomplete, TextField } from "@mui/material";
import { cbhpoProcedures, procedureLabel, type DentalProcedure } from "../data/cbhpoProcedures";

// Ordem alfabética: por área e, dentro dela, pelo nome do procedimento.
const sortedProcedures = [...cbhpoProcedures].sort((a, b) => a.category.localeCompare(b.category, "pt-BR") || a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));

export default function ProcedurePicker({
  label = "Procedimento",
  value,
  onChange,
  required = false,
}: {
  label?: string;
  value: string;
  onChange: (name: string, procedure?: DentalProcedure) => void;
  required?: boolean;
}) {
  const selected = cbhpoProcedures.find((procedure) => procedure.name === value) || null;

  return (
    <Autocomplete
      freeSolo
      options={sortedProcedures}
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
          placeholder="Digite para pesquisar na CBHPO"
        />
      )}
    />
  );
}
