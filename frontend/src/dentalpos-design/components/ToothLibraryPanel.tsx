import { useMemo, useState } from "react";

type Arch = "superior" | "inferior";

interface Tooth {
  number: number;
  name: string;
}

interface ToothLibraryPanelProps {
  onSelectTooth?: (toothNumber: number) => void;
}

const superiorTeeth: Tooth[] = [
  { number: 18, name: "3º Molar" },
  { number: 17, name: "2º Molar" },
  { number: 16, name: "1º Molar" },
  { number: 15, name: "2º Pré-molar" },
  { number: 14, name: "1º Pré-molar" },
  { number: 13, name: "Canino" },
  { number: 12, name: "Incisivo lateral" },
  { number: 11, name: "Incisivo central" },

  { number: 21, name: "Incisivo central" },
  { number: 22, name: "Incisivo lateral" },
  { number: 23, name: "Canino" },
  { number: 24, name: "1º Pré-molar" },
  { number: 25, name: "2º Pré-molar" },
  { number: 26, name: "1º Molar" },
  { number: 27, name: "2º Molar" },
  { number: 28, name: "3º Molar" },
];

const inferiorTeeth: Tooth[] = [
  { number: 48, name: "3º Molar" },
  { number: 47, name: "2º Molar" },
  { number: 46, name: "1º Molar" },
  { number: 45, name: "2º Pré-molar" },
  { number: 44, name: "1º Pré-molar" },
  { number: 43, name: "Canino" },
  { number: 42, name: "Incisivo lateral" },
  { number: 41, name: "Incisivo central" },

  { number: 31, name: "Incisivo central" },
  { number: 32, name: "Incisivo lateral" },
  { number: 33, name: "Canino" },
  { number: 34, name: "1º Pré-molar" },
  { number: 35, name: "2º Pré-molar" },
  { number: 36, name: "1º Molar" },
  { number: 37, name: "2º Molar" },
  { number: 38, name: "3º Molar" },
];

export default function ToothLibraryPanel({
  onSelectTooth,
}: ToothLibraryPanelProps) {
  const [arch, setArch] = useState<Arch>("superior");
  const [selectedTooth, setSelectedTooth] = useState<number | null>(11);

  const teeth = useMemo(
    () => (arch === "superior" ? superiorTeeth : inferiorTeeth),
    [arch]
  );

  function handleSelect(toothNumber: number) {
    setSelectedTooth(toothNumber);
    onSelectTooth?.(toothNumber);
  }

  return (
    <div
      style={{
        background: "#101820",
        border: "1px solid #243447",
        borderRadius: 12,
        padding: 14,
        color: "#ffffff",
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "#38bdf8",
          marginBottom: 10,
        }}
      >
        BIBLIOTECA DENTAL
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
          marginBottom: 12,
        }}
      >
        <button
          type="button"
          onClick={() => setArch("superior")}
          style={{
            padding: "8px",
            borderRadius: 7,
            cursor: "pointer",
            border:
              arch === "superior"
                ? "1px solid #38bdf8"
                : "1px solid #334155",
            background: arch === "superior" ? "#0c4a6e" : "#17202b",
            color: "#ffffff",
          }}
        >
          Superior
        </button>

        <button
          type="button"
          onClick={() => setArch("inferior")}
          style={{
            padding: "8px",
            borderRadius: 7,
            cursor: "pointer",
            border:
              arch === "inferior"
                ? "1px solid #38bdf8"
                : "1px solid #334155",
            background: arch === "inferior" ? "#0c4a6e" : "#17202b",
            color: "#ffffff",
          }}
        >
          Inferior
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 5,
        }}
      >
        {teeth.map((tooth) => {
          const selected = selectedTooth === tooth.number;

          return (
            <button
              key={tooth.number}
              type="button"
              title={`${tooth.number} - ${tooth.name}`}
              onClick={() => handleSelect(tooth.number)}
              style={{
                height: 38,
                borderRadius: 7,
                cursor: "pointer",
                fontWeight: 700,
                border: selected
                  ? "1px solid #38bdf8"
                  : "1px solid #334155",
                background: selected ? "#0369a1" : "#17202b",
                color: "#ffffff",
              }}
            >
              {tooth.number}
            </button>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: "1px solid #243447",
          fontSize: 12,
          color: "#94a3b8",
        }}
      >
        {selectedTooth
          ? `Dente selecionado: ${selectedTooth}`
          : "Selecione um dente"}
      </div>
    </div>
  );
}