interface ToothDesignStatusPanelProps {
  selectedTooth?: number | null;

  score?: number | null;

  errors?: number;

  warnings?: number;

  readyForExport?: boolean;

  statusMessage?: string;
}

export default function ToothDesignStatusPanel({
  selectedTooth = null,

  score = null,

  errors = 0,

  warnings = 0,

  readyForExport = false,

  statusMessage,
}: ToothDesignStatusPanelProps) {
  function getScoreLabel() {
    if (score === null) {
      return "Não analisado";
    }

    if (score >= 90) {
      return "Excelente";
    }

    if (score >= 75) {
      return "Bom";
    }

    if (score >= 55) {
      return "Atenção";
    }

    return "Crítico";
  }

  return (
    <div
      style={{
        background: "#101820",

        border:
          "1px solid #243447",

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

          marginBottom: 12,
        }}
      >
        STATUS DO DESIGN
      </div>

      <div
        style={{
          display: "grid",

          gap: 8,
        }}
      >
        <StatusRow
          label="Dente"
          value={
            selectedTooth !== null
              ? String(
                  selectedTooth
                )
              : "Nenhum"
          }
        />

        <StatusRow
          label="Score"
          value={
            score !== null
              ? `${score}/100`
              : "--"
          }
        />

        <StatusRow
          label="Qualidade"
          value={
            getScoreLabel()
          }
        />

        <StatusRow
          label="Erros"
          value={String(
            errors
          )}
        />

        <StatusRow
          label="Alertas"
          value={String(
            warnings
          )}
        />

        <div
          style={{
            marginTop: 6,

            padding: 10,

            borderRadius: 8,

            border:
              readyForExport
                ? "1px solid #22c55e"
                : "1px solid #475569",

            background:
              readyForExport
                ? "#052e16"
                : "#17202b",

            fontSize: 12,

            fontWeight: 700,

            textAlign:
              "center",

            color:
              readyForExport
                ? "#86efac"
                : "#94a3b8",
          }}
        >
          {readyForExport
            ? "PRONTO PARA FABRICAÇÃO"
            : "EM DESENVOLVIMENTO"}
        </div>

        {statusMessage && (
          <div
            style={{
              marginTop: 4,

              fontSize: 11,

              lineHeight: 1.5,

              color: "#94a3b8",
            }}
          >
            {statusMessage}
          </div>
        )}
      </div>
    </div>
  );
}

interface StatusRowProps {
  label: string;
  value: string;
}

function StatusRow({
  label,
  value,
}: StatusRowProps) {
  return (
    <div
      style={{
        display: "flex",

        justifyContent:
          "space-between",

        alignItems:
          "center",

        gap: 12,

        paddingBottom: 7,

        borderBottom:
          "1px solid #1e293b",

        fontSize: 12,
      }}
    >
      <span
        style={{
          color: "#94a3b8",
        }}
      >
        {label}
      </span>

      <strong>
        {value}
      </strong>
    </div>
  );
}